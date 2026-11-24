-- Test della migrazione 6: viste e funzioni di lettura per la dashboard.
-- Requisiti: RF-17, RF-18, RF-21, RF-22, RNF-14.
-- Tutto avviene dentro una transazione annullata alla fine: il database non cambia.

begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- ---------------------------------------------------------------------------
-- Dati di prova: 2 formatori con 1 studente, 1 sessione e 1 tentativo ciascuno.
-- Scenario in due versioni: la 1.1.0 rinomina l'etichetta di "err-1".
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
create function pg_temp.catalog(ver text, etichetta_errore text) returns jsonb language sql as $$
  select jsonb_build_object(
    'scenarioId', 'scenario-prova', 'scenarioVersion', ver, 'name', 'Scenario di prova',
    'objectives', '[]'::jsonb, 'choices', '[]'::jsonb,
    'errors', jsonb_build_array(jsonb_build_object('code', 'err-1', 'label', etichetta_errore)),
    'zones', jsonb_build_array(jsonb_build_object('id', 'zona-1', 'label', 'Zona uno')),
    'passCriteria', '{}'::jsonb);
$$;
insert into public.scenarios (scenario_id, version, catalog, published_at) values
  ('scenario-prova', '1.0.0', pg_temp.catalog('1.0.0', 'Errore uno'), now() - interval '1 day'),
  ('scenario-prova', '1.1.0', pg_temp.catalog('1.1.0', 'Errore uno (v2)'), now());

insert into public.sessions (id, participant_id, trainer_id, scenario_id) values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000a001',
   '00000000-0000-0000-0000-0000000000a1', 'scenario-prova'),
  ('00000000-0000-0000-0000-00000000b501', '00000000-0000-0000-0000-00000000b001',
   '00000000-0000-0000-0000-0000000000b1', 'scenario-prova');

insert into public.attempts (id, session_id, attempt_number, scenario_id, scenario_version,
                             started_at, ended_at, end_reason, outcome, errors_total,
                             completion_time_ms, sequence_respected, points_total, level)
values
  ('00000000-0000-0000-0000-00000000a7a1', '00000000-0000-0000-0000-000000005001', 1,
   'scenario-prova', '1.0.0', now(), now(), 'completed', 'passed', 3, 400000, true, 85, 3),
  ('00000000-0000-0000-0000-00000000b7b1', '00000000-0000-0000-0000-00000000b501', 1,
   'scenario-prova', '1.0.0', now(), null, null, null, 2, null, null, 10, null);

create function pg_temp.evento(p_id text, p_session uuid, p_attempt uuid, p_seq int,
                               p_type text, p_payload jsonb)
returns void language sql as $$
  insert into public.events (event_id, session_id, attempt_id, seq, type, schema_version,
                             occurred_at, scenario_id, scenario_version, payload)
  values (('00000000-0000-0000-0000-' || p_id)::uuid, p_session, p_attempt, p_seq, p_type, 1,
          now(), 'scenario-prova', '1.0.0', p_payload);
$$;

-- Studente A: err-1 due volte e una zona. Studente B: err-1 e un codice non in catalogo.
select pg_temp.evento('0000000ea002', '00000000-0000-0000-0000-000000005001',
  '00000000-0000-0000-0000-00000000a7a1', 2, 'error.committed', '{"errorCode": "err-1", "errorsTotal": 1}');
select pg_temp.evento('0000000ea003', '00000000-0000-0000-0000-000000005001',
  '00000000-0000-0000-0000-00000000a7a1', 3, 'safety_distance.violated', '{"zoneId": "zona-1", "errorsTotal": 2}');
select pg_temp.evento('0000000ea004', '00000000-0000-0000-0000-000000005001',
  '00000000-0000-0000-0000-00000000a7a1', 4, 'error.committed', '{"errorCode": "err-1", "errorsTotal": 3}');
select pg_temp.evento('0000000eb002', '00000000-0000-0000-0000-00000000b501',
  '00000000-0000-0000-0000-00000000b7b1', 2, 'error.committed', '{"errorCode": "err-1", "errorsTotal": 1}');
select pg_temp.evento('0000000eb003', '00000000-0000-0000-0000-00000000b501',
  '00000000-0000-0000-0000-00000000b7b1', 3, 'error.committed', '{"errorCode": "err-nuovo", "errorsTotal": 2}');

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

-- ---------------------------------------------------------------------------
-- Errori più frequenti (RF-18)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select results_eq(
  $$ select kind, code, occurrences, sessions from public.frequent_errors('scenario-prova') $$,
  $$ values ('error'::text, 'err-1'::text, 3, 2),
            ('error', 'err-nuovo', 1, 1),
            ('zone', 'zona-1', 1, 1) $$,
  'RF-18: il formatore vede i conteggi su tutte le sessioni, zone comprese, dal più frequente'
);
select is(
  (select label from public.frequent_errors('scenario-prova') where code = 'err-1'),
  'Errore uno (v2)',
  'RNF-14: l''etichetta arriva dall''ultima versione del catalogo'
);
select is(
  (select label from public.frequent_errors('scenario-prova') where code = 'err-nuovo'),
  null,
  'un codice non in catalogo non ha etichetta (la dashboard mostra il codice)'
);
select is(
  pg_get_function_result('public.frequent_errors(text)'::regprocedure),
  'TABLE(kind text, code text, label text, occurrences integer, sessions integer)',
  'RF-22: la classifica contiene solo conteggi, nessun dato di studenti o sessioni'
);
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is(
  (select count(*)::int from public.frequent_errors('scenario-prova')), 3,
  'RF-18: anche l''amministratore vede la classifica'
);
select pg_temp.login('00000000-0000-0000-0000-00000000a001');
select throws_ok(
  $$ select * from public.frequent_errors('scenario-prova') $$,
  '42501', null,
  'RNF-11: lo studente non vede la classifica di tutti'
);

-- ---------------------------------------------------------------------------
-- Tentativi per la dashboard (RF-17, RF-21, RF-22)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select results_eq(
  $$ select attempt_id, participant_code, scenario_name, outcome, points_total, level
     from public.attempt_overview $$,
  $$ values ('00000000-0000-0000-0000-00000000a7a1'::uuid, 'P-A001'::text,
             'Scenario di prova'::text, 'passed'::text, 85, 3) $$,
  'RF-17: il formatore A vede esito, punti e livello del proprio studente'
);
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select results_eq(
  $$ select attempt_id from public.attempt_overview $$,
  $$ values ('00000000-0000-0000-0000-00000000b7b1'::uuid) $$,
  'RF-22: il formatore B vede solo i tentativi dei propri studenti'
);
select is_empty(
  $$ select 1 from public.attempt_errors where session_id = '00000000-0000-0000-0000-000000005001' $$,
  'RF-22: il formatore B non vede gli errori degli studenti di A'
);
select pg_temp.login('00000000-0000-0000-0000-00000000a001');
select results_eq(
  $$ select participant_code, outcome from public.attempt_overview $$,
  $$ values ('P-A001'::text, 'passed'::text) $$,
  'RF-21: lo studente vede il proprio tentativo con l''esito'
);
select results_eq(
  $$ select kind, code, label from public.attempt_errors order by occurred_at, event_id $$,
  $$ values ('error'::text, 'err-1'::text, 'Errore uno'::text),
            ('zone', 'zona-1', 'Zona uno'),
            ('error', 'err-1', 'Errore uno') $$,
  'RF-21: lo studente vede i propri errori con l''etichetta della versione giocata'
);
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is(
  (select count(*)::int from public.attempt_overview), 2,
  'RF-22: l''amministratore vede tutti i tentativi'
);
select pg_temp.logout();

set local role anon;
select throws_ok(
  $$ select * from public.attempt_overview $$,
  '42501', null,
  'RNF-10: un utente non autenticato non legge i tentativi'
);
reset role;

-- ---------------------------------------------------------------------------
-- Etichette dal catalogo (RNF-14)
-- ---------------------------------------------------------------------------
select is(
  public.catalog_label('scenario-prova', '1.0.0', 'errors', 'err-1'), 'Errore uno',
  'RNF-14: etichetta della versione indicata'
);
select is(
  public.catalog_label('scenario-prova', '9.9.9', 'errors', 'err-1'), 'Errore uno (v2)',
  'RNF-14: versione non pubblicata, si usa l''ultima'
);
select is(
  public.catalog_label('scenario-prova', '1.0.0', 'zones', 'zona-1'), 'Zona uno',
  'RNF-14: le zone si cercano per id'
);

select * from finish();
rollback;
