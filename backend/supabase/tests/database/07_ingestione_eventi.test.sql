-- Test della migrazione 7: salvataggio degli eventi (ingest_events).
-- Requisiti: RF-4, RF-12, RF-13, RF-14, RF-15, RNF-9, RNF-11, RNF-18.
-- Simula un tentativo completo come lo manderebbe il visore.
-- Tutto avviene dentro una transazione annullata alla fine: il database non cambia.

begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

-- ---------------------------------------------------------------------------
-- Dati di prova
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'trainer.a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a001', 'stud.a@test.local',    'authenticated', 'authenticated');
insert into public.profiles (id, role, participant_code, trainer_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'trainer', null, null);
insert into public.profiles (id, role, participant_code, trainer_id) values
  ('00000000-0000-0000-0000-00000000a001', 'participant', 'P-A001', '00000000-0000-0000-0000-0000000000a1');

delete from public.privacy_acceptances;
delete from public.privacy_notices;
delete from public.scenarios;
insert into public.privacy_notices (version, content) values ('2026-12-01', 'Informativa di prova');
insert into public.scenarios (scenario_id, version, catalog) values (
  'scenario-prova', '1.0.0',
  jsonb_build_object('scenarioId', 'scenario-prova', 'scenarioVersion', '1.0.0',
    'name', 'Scenario di prova', 'objectives', '[]'::jsonb, 'choices', '[]'::jsonb,
    'errors', '[]'::jsonb, 'zones', '[]'::jsonb, 'passCriteria', '{}'::jsonb));
insert into public.sessions (id, participant_id, trainer_id, scenario_id) values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000a001',
   '00000000-0000-0000-0000-0000000000a1', 'scenario-prova');

-- Un elemento di p_items: evento come da contratto + n statement xAPI minimi.
create function pg_temp.item(p_n int, p_type text, p_payload jsonb,
                             p_attempt boolean default true, p_statements int default 1)
returns jsonb language sql as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'schemaVersion', 1,
      'eventId', '00000000-0000-0000-0000-0000000e' || lpad(p_n::text, 4, '0'),
      'sessionId', '00000000-0000-0000-0000-000000005001',
      'attemptId', case when p_attempt then '00000000-0000-0000-0000-00000000a7a1' end,
      'seq', p_n,
      'type', p_type,
      'timestamp', '2026-12-10T10:00:00Z'::timestamptz + p_n * interval '10 seconds',
      'scenarioId', 'scenario-prova',
      'scenarioVersion', '1.0.0',
      'payload', p_payload),
    'statements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', gen_random_uuid(),
        'actor', jsonb_build_object('objectType', 'Agent',
          'account', jsonb_build_object('homePage', 'https://questzero.it', 'name', 'P-A001'))))
      from generate_series(1, p_statements)), '[]'::jsonb));
$$;

create temporary table risposte (nome text primary key, valore jsonb);

-- Un tentativo completo, in un solo pacchetto.
insert into risposte select 'pacchetto1', public.ingest_events(
  '00000000-0000-0000-0000-000000005001',
  jsonb_build_array(
    pg_temp.item(1, 'privacy.accepted', '{"privacyNoticeVersion": "2026-12-01"}', false, 0),
    pg_temp.item(2, 'scenario.started', '{"attemptNumber": 1, "clientVersion": "0.3.0"}'),
    pg_temp.item(3, 'objective.completed',
      '{"objectiveId": "dare-allarme", "objectivesCompleted": 1, "objectivesTotal": 5, "pointsAwarded": 10, "pointsTotal": 10}', true, 2),
    pg_temp.item(4, 'choice.made',
      '{"choiceId": "tipo-estintore", "optionId": "acqua", "correct": false, "pointsAwarded": 0, "pointsTotal": 10}'),
    pg_temp.item(5, 'error.committed',
      '{"errorCode": "estintore-acqua", "relatedChoiceId": "tipo-estintore", "errorsTotal": 1}'),
    pg_temp.item(6, 'safety_distance.violated', '{"zoneId": "zona-fumo", "errorsTotal": 2}'),
    pg_temp.item(7, 'choice.made',
      '{"choiceId": "tipo-estintore-2", "optionId": "co2", "correct": true, "pointsAwarded": 15, "pointsTotal": 25}')
  ));

-- ---------------------------------------------------------------------------
-- Durante il tentativo (RF-12, RF-16)
-- ---------------------------------------------------------------------------
select is(
  (select jsonb_array_length(valore -> 'accepted') from risposte where nome = 'pacchetto1'), 7,
  'RF-12: tutti e 7 gli eventi validi sono accettati'
);
select is(
  (select jsonb_array_length(valore -> 'rejected') from risposte where nome = 'pacchetto1'), 0,
  'nessun evento rifiutato'
);
select is(
  (select count(*)::int from public.events where session_id = '00000000-0000-0000-0000-000000005001'), 7,
  'RF-12: gli eventi sono salvati'
);
select results_eq(
  $$ select attempt_number, client_version, points_total, errors_total,
            objectives_completed, objectives_total, ended_at is null
     from public.attempts where id = '00000000-0000-0000-0000-00000000a7a1' $$,
  $$ values (1, '0.3.0'::text, 25, 2, 1, 5, true) $$,
  'RF-16: il tentativo ha punti, errori e obiettivi aggiornati mentre si gioca'
);
select is(
  (select source from public.privacy_acceptances
   where participant_id = '00000000-0000-0000-0000-00000000a001' and notice_version = '2026-12-01'),
  'visore',
  'RNF-18: l''accettazione dal visore è registrata per lo studente della sessione'
);
select is(
  (select count(*)::int from public.xapi_outbox), 7,
  'RF-15: gli statement xAPI sono in coda (anche 2 per un solo evento)'
);

-- ---------------------------------------------------------------------------
-- Reinvii e conflitti (RNF-9)
-- ---------------------------------------------------------------------------
insert into risposte select 'reinvio', public.ingest_events(
  '00000000-0000-0000-0000-000000005001',
  jsonb_build_array(pg_temp.item(4, 'choice.made',
    '{"choiceId": "tipo-estintore", "optionId": "acqua", "correct": false, "pointsAwarded": 0, "pointsTotal": 10}')));
select is(
  (select valore -> 'accepted' ->> 0 from risposte where nome = 'reinvio'),
  '00000000-0000-0000-0000-0000000e0004',
  'RNF-9: un evento reinviato risulta accettato'
);
select ok(
  (select count(*) = 7 from public.events) and (select count(*) = 7 from public.xapi_outbox)
  and (select points_total = 25 from public.attempts where id = '00000000-0000-0000-0000-00000000a7a1'),
  'RNF-9: il reinvio non duplica eventi e statement e non riporta indietro i punti'
);

insert into risposte select 'conflitto', public.ingest_events(
  '00000000-0000-0000-0000-000000005001',
  jsonb_build_array(
    jsonb_set(pg_temp.item(3, 'choice.made', '{"pointsTotal": 30}'),
              '{event,eventId}', '"00000000-0000-0000-0000-0000000e9999"'),
    pg_temp.item(8, 'privacy.accepted', '{"privacyNoticeVersion": "versione-inesistente"}', false, 0),
    pg_temp.item(9, 'objective.completed',
      '{"objectiveId": "raggiungere-estintore", "objectivesCompleted": 2, "objectivesTotal": 5, "pointsAwarded": 10, "pointsTotal": 35}')
  ));
select set_eq(
  $$ select r ->> 'eventId' from risposte, jsonb_array_elements(valore -> 'rejected') r
     where nome = 'conflitto' $$,
  array['00000000-0000-0000-0000-0000000e9999', '00000000-0000-0000-0000-0000000e0008'],
  'un seq già usato e un''informativa sconosciuta sono rifiutati'
);
select is(
  (select valore -> 'accepted' from risposte where nome = 'conflitto'),
  '["00000000-0000-0000-0000-0000000e0009"]'::jsonb,
  'un evento sbagliato non blocca gli altri dello stesso pacchetto'
);
select ok(
  (select points_total = 35 from public.attempts where id = '00000000-0000-0000-0000-00000000a7a1')
  and not exists (select 1 from public.events where event_id = '00000000-0000-0000-0000-0000000e9999'),
  'gli eventi rifiutati non lasciano tracce, quelli accettati aggiornano il tentativo'
);
select ok(
  (select (r ->> 'reason') <> '' from risposte, jsonb_array_elements(valore -> 'rejected') r
   where nome = 'conflitto' limit 1),
  'ogni evento rifiutato ha un motivo'
);

-- ---------------------------------------------------------------------------
-- Fine del tentativo (RF-13, RF-14)
-- ---------------------------------------------------------------------------
insert into risposte select 'fine', public.ingest_events(
  '00000000-0000-0000-0000-000000005001',
  jsonb_build_array(pg_temp.item(10, 'scenario.ended',
    '{"reason": "completed", "indicators": {"errors": 2, "completionTimeMs": 412300, "sequenceRespected": true},
      "outcome": "passed", "pointsTotal": 85, "level": 3, "objectivesCompleted": 5, "objectivesTotal": 5}')));
select results_eq(
  $$ select end_reason, outcome, errors_total, completion_time_ms, sequence_respected,
            points_total, level, objectives_completed, ended_at
     from public.attempts where id = '00000000-0000-0000-0000-00000000a7a1' $$,
  $$ values ('completed'::text, 'passed'::text, 2, 412300, true, 85, 3, 5,
             '2026-12-10T10:01:40Z'::timestamptz) $$,
  'RF-14: indicatori ed esito sono salvati come li manda il visore'
);

insert into risposte select 'dopo-fine', public.ingest_events(
  '00000000-0000-0000-0000-000000005001',
  jsonb_build_array(pg_temp.item(11, 'scenario.ended',
    '{"reason": "completed", "indicators": {"errors": 0, "completionTimeMs": 1, "sequenceRespected": true},
      "outcome": "passed", "pointsTotal": 999, "level": 9, "objectivesCompleted": 5, "objectivesTotal": 5}')));
select is(
  (select jsonb_array_length(valore -> 'rejected') from risposte where nome = 'dopo-fine'), 1,
  'RF-14: un secondo scenario.ended per lo stesso tentativo è rifiutato'
);
select is(
  (select points_total from public.attempts where id = '00000000-0000-0000-0000-00000000a7a1'), 85,
  'l''esito di un tentativo concluso non cambia più'
);

-- Secondo tentativo interrotto (RF-3, RNF-16).
insert into risposte select 'secondo', public.ingest_events(
  '00000000-0000-0000-0000-000000005001',
  jsonb_build_array(
    jsonb_set(pg_temp.item(12, 'scenario.started', '{"attemptNumber": 2}'),
              '{event,attemptId}', '"00000000-0000-0000-0000-00000000a7a2"'),
    jsonb_set(pg_temp.item(13, 'scenario.ended',
      '{"reason": "aborted_by_participant", "indicators": {"errors": 0, "completionTimeMs": 5000, "sequenceRespected": false},
        "outcome": null, "pointsTotal": 0, "level": 0, "objectivesCompleted": 0, "objectivesTotal": 5}'),
      '{event,attemptId}', '"00000000-0000-0000-0000-00000000a7a2"')));
select results_eq(
  $$ select attempt_number, end_reason, outcome from public.attempts
     where session_id = '00000000-0000-0000-0000-000000005001' order by attempt_number $$,
  $$ values (1, 'completed'::text, 'passed'::text),
            (2, 'aborted_by_participant', null) $$,
  'RF-4: lo storico ha due tentativi, il secondo interrotto e senza esito'
);

-- ---------------------------------------------------------------------------
-- Sicurezza
-- ---------------------------------------------------------------------------
select is(
  (select r ->> 'reason' from jsonb_array_elements(public.ingest_events(
     '00000000-0000-0000-0000-000000005001',
     jsonb_build_array(jsonb_set(pg_temp.item(14, 'choice.made', '{"pointsTotal": 0}'),
       '{event,sessionId}', '"00000000-0000-0000-0000-000000009999"'))) -> 'rejected') r),
  'sessionId diverso da quello del token',
  'RNF-11: un evento di un''altra sessione è rifiutato'
);
select throws_ok(
  $$ select public.ingest_events('00000000-0000-0000-0000-000000000000', '[]') $$,
  'QZ404', null,
  'una sessione inesistente è rifiutata'
);

set local role authenticated;
select throws_ok(
  $$ select public.ingest_events('00000000-0000-0000-0000-000000005001', '[]') $$,
  '42501', null,
  'RNF-11: ingest_events la chiama solo il backend'
);
reset role;

select * from finish();
rollback;
