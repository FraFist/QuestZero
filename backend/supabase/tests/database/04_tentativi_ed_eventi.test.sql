-- Test della migrazione 4: tentativi, eventi e Realtime.
-- Requisiti: RF-8, RF-12, RF-14, RF-16, RF-21, RF-22, RNF-9, RNF-11, RNF-13.
-- Tutto avviene dentro una transazione annullata alla fine: il database non cambia.

begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- ---------------------------------------------------------------------------
-- Dati di prova: 1 amministratore, 2 formatori con 1 studente e 1 sessione ciascuno.
-- Gli eventi li scrive il backend: qui li inserisce l'utente postgres.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local',     'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a1', 'trainer.a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'trainer.b@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a001', 'stud.a@test.local',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b001', 'stud.b@test.local',    'authenticated', 'authenticated');

insert into public.profiles (id, role, participant_code, trainer_id) values
  ('00000000-0000-0000-0000-00000000000a', 'admin',   null, null),
  ('00000000-0000-0000-0000-0000000000a1', 'trainer', null, null),
  ('00000000-0000-0000-0000-0000000000b1', 'trainer', null, null);
insert into public.profiles (id, role, participant_code, trainer_id) values
  ('00000000-0000-0000-0000-00000000a001', 'participant', 'P-A001', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000b001', 'participant', 'P-B001', '00000000-0000-0000-0000-0000000000b1');

delete from public.scenarios;
insert into public.scenarios (scenario_id, version, catalog) values (
  'scenario-prova', '1.0.0',
  jsonb_build_object('scenarioId', 'scenario-prova', 'scenarioVersion', '1.0.0',
    'name', 'Scenario di prova', 'objectives', '[]'::jsonb, 'choices', '[]'::jsonb,
    'errors', '[]'::jsonb, 'zones', '[]'::jsonb, 'passCriteria', '{}'::jsonb));

insert into public.sessions (id, participant_id, trainer_id, scenario_id) values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000a001',
   '00000000-0000-0000-0000-0000000000a1', 'scenario-prova'),
  ('00000000-0000-0000-0000-00000000b501', '00000000-0000-0000-0000-00000000b001',
   '00000000-0000-0000-0000-0000000000b1', 'scenario-prova');

-- Inserisce un evento come farebbe il backend.
create function pg_temp.evento(p_event_id uuid, p_session uuid, p_seq int, p_type text,
                               p_payload jsonb default '{}'::jsonb, p_attempt uuid default null)
returns void language sql as $$
  insert into public.events (event_id, session_id, attempt_id, seq, type, schema_version,
                             occurred_at, scenario_id, scenario_version, payload)
  values (p_event_id, p_session, p_attempt, p_seq, p_type, 1,
          now(), 'scenario-prova', '1.0.0', p_payload);
$$;

create function pg_temp.login(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;

create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Un tentativo e due eventi per la sessione di A, un evento per la sessione di B.
insert into public.attempts (id, session_id, attempt_number, scenario_id, scenario_version, started_at)
values ('00000000-0000-0000-0000-00000000a7a1', '00000000-0000-0000-0000-000000005001',
        1, 'scenario-prova', '1.0.0', now());
select pg_temp.evento('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-000000005001',
                      1, 'scenario.started', '{"attemptNumber": 1}',
                      '00000000-0000-0000-0000-00000000a7a1');
select pg_temp.evento('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-000000005001',
                      2, 'error.committed', '{"errorCode": "errore-prova", "errorsTotal": 1}',
                      '00000000-0000-0000-0000-00000000a7a1');
select pg_temp.evento('00000000-0000-0000-0000-0000000eb001', '00000000-0000-0000-0000-00000000b501',
                      1, 'privacy.accepted', '{"privacyNoticeVersion": "2026-12-01"}');

-- ---------------------------------------------------------------------------
-- Eventi: niente doppioni, niente dati di tracciamento (RNF-9, RNF-13, RF-12)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select pg_temp.evento('00000000-0000-0000-0000-0000000e0001',
       '00000000-0000-0000-0000-000000005001', 3, 'choice.made') $$,
  '23505', null,
  'RNF-9: lo stesso eventId non si salva due volte'
);
select throws_ok(
  $$ select pg_temp.evento('00000000-0000-0000-0000-0000000e0099',
       '00000000-0000-0000-0000-000000005001', 2, 'choice.made') $$,
  '23505', null,
  'RNF-9: lo stesso seq nella stessa sessione non si salva due volte'
);
select lives_ok(
  $$ select pg_temp.evento('00000000-0000-0000-0000-0000000eb002',
       '00000000-0000-0000-0000-00000000b501', 2, 'scenario.started') $$,
  'lo stesso seq in un''altra sessione è ammesso'
);
select throws_ok(
  $$ select pg_temp.evento('00000000-0000-0000-0000-0000000e0098',
       '00000000-0000-0000-0000-000000005001', 3, 'head.moved') $$,
  '23514', null,
  'RF-12: un tipo di evento sconosciuto è rifiutato'
);
select throws_ok(
  $$ select pg_temp.evento('00000000-0000-0000-0000-0000000e0097',
       '00000000-0000-0000-0000-000000005001', 3, 'safety_distance.violated',
       '{"zoneId": "zona-fumo", "position": {"x": 1, "y": 2, "z": 3}}') $$,
  '23514', null,
  'RNF-13: un evento con la posizione è rifiutato'
);
select throws_ok(
  $$ select pg_temp.evento('00000000-0000-0000-0000-0000000e0096',
       '00000000-0000-0000-0000-000000005001', 0, 'choice.made') $$,
  '23514', null,
  'seq parte da 1'
);
select throws_ok(
  $$ select pg_temp.evento('00000000-0000-0000-0000-0000000e0095',
       '00000000-0000-0000-0000-000000005001', 3, 'choice.made', '[1, 2]') $$,
  '23514', null,
  'il payload è sempre un oggetto JSON'
);

-- ---------------------------------------------------------------------------
-- Tentativi: coerenza di fine, esito e indicatori (RF-8, RF-13, RF-14)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.attempts set outcome = 'passed'
     where id = '00000000-0000-0000-0000-00000000a7a1' $$,
  '23514', null,
  'RF-14: un tentativo non finito non ha esito'
);
select throws_ok(
  $$ update public.attempts set ended_at = now(), end_reason = 'completed',
       completion_time_ms = 1000, sequence_respected = true
     where id = '00000000-0000-0000-0000-00000000a7a1' $$,
  '23514', null,
  'RF-14: un tentativo completato ha sempre un esito'
);
select throws_ok(
  $$ update public.attempts set ended_at = now(), end_reason = 'aborted_by_participant',
       outcome = 'failed'
     where id = '00000000-0000-0000-0000-00000000a7a1' $$,
  '23514', null,
  'RNF-16: un tentativo interrotto non ha esito'
);
select throws_ok(
  $$ update public.attempts set ended_at = now(), end_reason = 'completed', outcome = 'passed'
     where id = '00000000-0000-0000-0000-00000000a7a1' $$,
  '23514', null,
  'RF-13: un tentativo completato ha gli indicatori'
);
select throws_ok(
  $$ update public.attempts set ended_at = now(), end_reason = 'aborted_by_trainer'
     where id = '00000000-0000-0000-0000-00000000a7a1' $$,
  '23514', null,
  'l''interruzione dalla dashboard è fuori MVP'
);
select lives_ok(
  $$ update public.attempts set ended_at = now(), end_reason = 'completed', outcome = 'passed',
       errors_total = 1, completion_time_ms = 412300, sequence_respected = true,
       points_total = 85, level = 3
     where id = '00000000-0000-0000-0000-00000000a7a1' $$,
  'RF-14: un tentativo completato con esito e indicatori è accettato'
);
select throws_ok(
  $$ insert into public.attempts (id, session_id, attempt_number, scenario_id, scenario_version, started_at)
     values ('00000000-0000-0000-0000-00000000a7a2', '00000000-0000-0000-0000-000000005001',
             1, 'scenario-prova', '1.0.0', now()) $$,
  '23505', null,
  'RF-4: due tentativi della stessa sessione non hanno lo stesso numero'
);

-- ---------------------------------------------------------------------------
-- Chi vede eventi e tentativi (RF-21, RF-22)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select set_eq(
  $$ select event_id from public.events $$,
  $$ values ('00000000-0000-0000-0000-0000000e0001'::uuid),
            ('00000000-0000-0000-0000-0000000e0002'::uuid) $$,
  'RF-22: il formatore A vede solo gli eventi delle proprie sessioni'
);
select is(
  (select count(*)::int from public.attempts), 1,
  'RF-22: il formatore A vede il tentativo del proprio studente'
);
select throws_ok(
  $$ select pg_temp.evento('00000000-0000-0000-0000-0000000e0050',
       '00000000-0000-0000-0000-000000005001', 10, 'choice.made') $$,
  '42501', null,
  'RNF-11: il formatore non scrive eventi'
);
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is_empty(
  $$ select 1 from public.events where session_id = '00000000-0000-0000-0000-000000005001' $$,
  'RF-22: il formatore B non vede gli eventi delle sessioni di A'
);
select is_empty(
  $$ select 1 from public.attempts $$,
  'RF-22: il formatore B non vede i tentativi degli studenti di A'
);
select pg_temp.login('00000000-0000-0000-0000-00000000a001');
select results_eq(
  $$ select outcome from public.attempts $$,
  $$ values ('passed'::text) $$,
  'RF-21: lo studente vede l''esito del proprio tentativo'
);
select throws_ok(
  $$ update public.attempts set outcome = 'failed' $$,
  '42501', null,
  'RNF-11: lo studente non modifica il proprio esito'
);
select pg_temp.login('00000000-0000-0000-0000-00000000b001');
select is_empty(
  $$ select 1 from public.events where session_id = '00000000-0000-0000-0000-000000005001' $$,
  'RF-21: lo studente B non vede gli eventi di A'
);
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is(
  (select count(*)::int from public.events), 4,
  'RF-22: l''amministratore vede tutti gli eventi'
);
select pg_temp.logout();

set local role anon;
select throws_ok(
  $$ select * from public.events $$,
  '42501', null,
  'RNF-10: un utente non autenticato non legge gli eventi'
);
reset role;

-- ---------------------------------------------------------------------------
-- Realtime (RF-16, RNF-4)
-- ---------------------------------------------------------------------------
select set_eq(
  $$ select tablename::text from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' $$,
  array['events', 'attempts', 'sessions'],
  'RF-16: Realtime invia alla dashboard eventi, tentativi e sessioni'
);

-- La sessione cancellata si porta via i propri eventi e tentativi.
delete from public.sessions where id = '00000000-0000-0000-0000-000000005001';
select is(
  (select count(*)::int from public.events where session_id = '00000000-0000-0000-0000-000000005001')
  + (select count(*)::int from public.attempts where session_id = '00000000-0000-0000-0000-000000005001'),
  0,
  'cancellando una sessione si cancellano i suoi eventi e tentativi'
);

select * from finish();
rollback;
