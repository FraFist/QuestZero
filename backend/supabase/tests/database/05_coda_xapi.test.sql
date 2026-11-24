-- Test della migrazione 5: coda degli statement xAPI.
-- Requisiti: RF-15, RF-22, RNF-11, RNF-19.
-- Tutto avviene dentro una transazione annullata alla fine: il database non cambia.
-- Nota: dentro una transazione now() non cambia, quindi "subito dopo" = stesso istante.

begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- ---------------------------------------------------------------------------
-- Dati di prova: 1 amministratore, 1 formatore, 1 studente, 1 sessione, 1 evento.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local',     'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a1', 'trainer.a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a001', 'stud.a@test.local',    'authenticated', 'authenticated');

insert into public.profiles (id, role, participant_code, trainer_id) values
  ('00000000-0000-0000-0000-00000000000a', 'admin',   null, null),
  ('00000000-0000-0000-0000-0000000000a1', 'trainer', null, null);
insert into public.profiles (id, role, participant_code, trainer_id) values
  ('00000000-0000-0000-0000-00000000a001', 'participant', 'P-A001', '00000000-0000-0000-0000-0000000000a1');

delete from public.scenarios;
insert into public.scenarios (scenario_id, version, catalog) values (
  'scenario-prova', '1.0.0',
  jsonb_build_object('scenarioId', 'scenario-prova', 'scenarioVersion', '1.0.0',
    'name', 'Scenario di prova', 'objectives', '[]'::jsonb, 'choices', '[]'::jsonb,
    'errors', '[]'::jsonb, 'zones', '[]'::jsonb, 'passCriteria', '{}'::jsonb));

insert into public.sessions (id, participant_id, trainer_id, scenario_id) values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000a001',
   '00000000-0000-0000-0000-0000000000a1', 'scenario-prova');

insert into public.events (event_id, session_id, seq, type, schema_version, occurred_at,
                           scenario_id, scenario_version, payload)
values ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-000000005001',
        1, 'scenario.started', 1, now(), 'scenario-prova', '1.0.0', '{"attemptNumber": 1}');

-- Statement minimo con attore anonimo (codice partecipante), come da contratto.
create function pg_temp.statement(p_actor jsonb default null) returns jsonb language sql as $$
  select jsonb_build_object(
    'actor', coalesce(p_actor, jsonb_build_object('objectType', 'Agent',
      'account', jsonb_build_object('homePage', 'https://questzero.it', 'name', 'P-A001'))),
    'verb', jsonb_build_object('id', 'http://adlnet.gov/expapi/verbs/initialized'),
    'object', jsonb_build_object('id', 'https://questzero.it/xapi/scenari/scenario-prova'));
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

-- Tre statement in coda.
insert into public.xapi_outbox (id, event_id, statement)
overriding system value
values (1, '00000000-0000-0000-0000-0000000e0001', pg_temp.statement()),
       (2, '00000000-0000-0000-0000-0000000e0001', pg_temp.statement()),
       (3, '00000000-0000-0000-0000-0000000e0001', pg_temp.statement());

-- ---------------------------------------------------------------------------
-- Privacy dello statement (RNF-19)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.xapi_outbox (event_id, statement)
     values ('00000000-0000-0000-0000-0000000e0001',
             pg_temp.statement('{"objectType": "Agent", "mbox": "mailto:mario@example.com"}')) $$,
  '23514', null,
  'RNF-19: uno statement con l''email nell''attore è rifiutato'
);
select throws_ok(
  $$ insert into public.xapi_outbox (event_id, statement)
     values ('00000000-0000-0000-0000-0000000e0001',
             pg_temp.statement('{"objectType": "Agent", "name": "Mario Rossi",
               "account": {"homePage": "https://questzero.it", "name": "P-A001"}}')) $$,
  '23514', null,
  'RNF-19: uno statement con il nome della persona è rifiutato'
);
select throws_ok(
  $$ insert into public.xapi_outbox (event_id, statement)
     values ('00000000-0000-0000-0000-0000000e0001', '{"verb": {}}') $$,
  '23514', null,
  'uno statement senza attore è rifiutato'
);
select is(
  (select count(distinct statement_id)::int from public.xapi_outbox), 3,
  'RF-15: ogni statement ha il proprio ID (l''LRS scarta i reinvii)'
);

-- ---------------------------------------------------------------------------
-- Invio a gruppi
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select id from public.claim_xapi_batch(2) order by id $$,
  $$ values (1::bigint), (2::bigint) $$,
  'RF-15: si prendono gli statement in ordine, al massimo quanti richiesti'
);
select results_eq(
  $$ select id from public.claim_xapi_batch(10) $$,
  $$ values (3::bigint) $$,
  'gli statement già prenotati non si riprendono subito'
);
select is(
  public.mark_xapi_sent(array[1, 2]::bigint[]), 2,
  'RF-15: gli statement accettati dall''LRS si segnano come inviati'
);
select ok(
  (select bool_and(status = 'sent' and sent_at is not null) from public.xapi_outbox where id in (1, 2)),
  'gli statement inviati hanno stato e ora di invio'
);
select is(
  public.mark_xapi_sent(array[1]::bigint[]), 0,
  'uno statement già inviato non si segna di nuovo'
);

-- ---------------------------------------------------------------------------
-- Riprova dopo un errore dell'LRS
-- ---------------------------------------------------------------------------
select public.mark_xapi_failed(3, 'LRS non raggiungibile');
select ok(
  (select status = 'pending' and send_attempts = 1
          and next_attempt_at = now() + interval '1 minute'
          and last_error = 'LRS non raggiungibile'
   from public.xapi_outbox where id = 3),
  'RF-15: dopo il primo errore si riprova tra 1 minuto'
);
select public.mark_xapi_failed(3, 'LRS non raggiungibile');
select ok(
  (select next_attempt_at = now() + interval '2 minutes' from public.xapi_outbox where id = 3),
  'dopo il secondo errore si riprova tra 2 minuti'
);
update public.xapi_outbox set send_attempts = 19 where id = 3;
select public.mark_xapi_failed(3, 'LRS non raggiungibile');
select ok(
  (select status = 'failed' and next_attempt_at <= now() + interval '1 hour'
   from public.xapi_outbox where id = 3),
  'dopo 20 tentativi lo statement resta "failed" (attesa massima 1 ora)'
);

-- ---------------------------------------------------------------------------
-- Chi vede e usa la coda (RNF-11, RF-22)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select is_empty(
  $$ select 1 from public.xapi_outbox $$,
  'RNF-11: il formatore non vede la coda xAPI'
);
select throws_ok(
  $$ select * from public.claim_xapi_batch(10) $$,
  '42501', null,
  'RNF-11: l''invio lo fa solo il backend'
);
select throws_ok(
  $$ insert into public.xapi_outbox (event_id, statement)
     values ('00000000-0000-0000-0000-0000000e0001', pg_temp.statement()) $$,
  '42501', null,
  'RNF-11: il formatore non mette statement in coda'
);
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is(
  (select count(*)::int from public.xapi_outbox where status = 'failed'), 1,
  'RF-22: l''amministratore vede gli statement falliti'
);
select pg_temp.logout();

select * from finish();
rollback;
