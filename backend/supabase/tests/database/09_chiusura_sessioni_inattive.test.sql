-- Test della migrazione 9: chiusura delle sessioni (RF-23).
-- Requisiti: RF-23, RNF-9, RNF-11.
-- Tutto avviene dentro una transazione annullata alla fine: il database non cambia.
-- Nota: dentro una transazione now() non cambia; l'inattività si simula spostando indietro
-- last_activity_at.

begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'trainer.a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a001', 'stud.a@test.local',    'authenticated', 'authenticated');
insert into public.profiles (id, role) values ('00000000-0000-0000-0000-0000000000a1', 'trainer');
insert into public.profiles (id, role, participant_code, trainer_id) values
  ('00000000-0000-0000-0000-00000000a001', 'participant', 'P-A001', '00000000-0000-0000-0000-0000000000a1');

delete from public.scenarios;
insert into public.scenarios (scenario_id, version, catalog) values (
  'scenario-prova', '1.0.0',
  jsonb_build_object('scenarioId', 'scenario-prova', 'scenarioVersion', '1.0.0',
    'name', 'Scenario di prova', 'objectives', '[]'::jsonb, 'choices', '[]'::jsonb,
    'errors', '[]'::jsonb, 'zones', '[]'::jsonb, 'passCriteria', '{}'::jsonb));

-- Tre sessioni dello stesso studente.
insert into public.sessions (id, participant_id, trainer_id, scenario_id) values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000a001',
   '00000000-0000-0000-0000-0000000000a1', 'scenario-prova'),
  ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-00000000a001',
   '00000000-0000-0000-0000-0000000000a1', 'scenario-prova'),
  ('00000000-0000-0000-0000-000000005003', '00000000-0000-0000-0000-00000000a001',
   '00000000-0000-0000-0000-0000000000a1', 'scenario-prova');

create temporary table appunti (nome text primary key, valore text);
grant all on appunti to authenticated;

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

select ok(
  (select last_activity_at = now() and close_reason is null
   from public.sessions where id = '00000000-0000-0000-0000-000000005001'),
  'RF-23: una nuova sessione registra l''attività ed è aperta'
);

-- ---------------------------------------------------------------------------
-- Abbinamento ed eventi contano come attività
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
insert into appunti select 'codice', pairing_code
  from public.create_pairing_code('00000000-0000-0000-0000-000000005001');
select pg_temp.logout();

update public.sessions set last_activity_at = now() - interval '1 hour'
  where id = '00000000-0000-0000-0000-000000005001';
insert into appunti select 'risposta', public.pair_device(valore)::text from appunti where nome = 'codice';
select is(
  (select last_activity_at from public.sessions where id = '00000000-0000-0000-0000-000000005001'),
  now(),
  'RF-23: l''abbinamento del visore conta come attività'
);

update public.sessions set last_activity_at = now() - interval '1 hour'
  where id = '00000000-0000-0000-0000-000000005001';
insert into public.events (event_id, session_id, seq, type, schema_version, occurred_at,
                           scenario_id, scenario_version, payload)
values ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-000000005001', 1,
        'privacy.accepted', 1, now() - interval '2 hours', 'scenario-prova', '1.0.0',
        '{"privacyNoticeVersion": "x"}');
select is(
  (select last_activity_at from public.sessions where id = '00000000-0000-0000-0000-000000005001'),
  now(),
  'RF-23: un evento ricevuto conta come attività (ora del server, non del visore)'
);

-- ---------------------------------------------------------------------------
-- Chiusura automatica dopo 30 minuti
-- ---------------------------------------------------------------------------
-- 5001: inattiva da 31 minuti (attiva, con token). 5002: inattiva da 10 minuti.
-- 5003: in attesa da 45 minuti, con un codice non ancora usato.
update public.sessions set last_activity_at = now() - interval '31 minutes'
  where id = '00000000-0000-0000-0000-000000005001';
update public.sessions set last_activity_at = now() - interval '10 minutes'
  where id = '00000000-0000-0000-0000-000000005002';
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
insert into appunti select 'codice3', pairing_code
  from public.create_pairing_code('00000000-0000-0000-0000-000000005003');
select pg_temp.logout();
update public.sessions set last_activity_at = now() - interval '45 minutes'
  where id = '00000000-0000-0000-0000-000000005003';

select is(public.close_inactive_sessions(30), 2, 'RF-23: si chiudono le 2 sessioni inattive da oltre 30 minuti');
select results_eq(
  $$ select id::text, status::text, close_reason, closed_at is not null
     from public.sessions order by id $$,
  $$ values ('00000000-0000-0000-0000-000000005001', 'closed', 'inactivity'::text, true),
            ('00000000-0000-0000-0000-000000005002', 'waiting', null, false),
            ('00000000-0000-0000-0000-000000005003', 'closed', 'inactivity', true) $$,
  'RF-23: chiuse per inattività quelle ferme, aperta quella con attività da 10 minuti'
);
select ok(
  (select bool_and(expires_at <= now() + interval '24 hours') from public.session_tokens
   where session_id = '00000000-0000-0000-0000-000000005001'),
  'RNF-9: il token resta valido al massimo 24 ore per svuotare la coda'
);
select is(
  (select public.pair_device(valore) ->> 'error' from appunti where nome = 'codice3'),
  'invalid_code',
  'RF-23: il codice di una sessione chiusa per inattività non vale più'
);
select is(public.close_inactive_sessions(30), 0, 'le sessioni già chiuse non si richiudono');

-- Gli eventi rimasti in coda sul visore sono ancora accettati dopo la chiusura (RNF-9).
select is(
  jsonb_array_length(public.ingest_events('00000000-0000-0000-0000-000000005001', jsonb_build_array(
    jsonb_build_object('event', jsonb_build_object(
      'schemaVersion', 1, 'eventId', '00000000-0000-0000-0000-0000000e0002',
      'sessionId', '00000000-0000-0000-0000-000000005001', 'attemptId', null, 'seq', 2,
      'type', 'privacy.accepted', 'timestamp', now(), 'scenarioId', 'scenario-prova',
      'scenarioVersion', '1.0.0', 'payload', '{"privacyNoticeVersion": "inesistente"}'::jsonb),
      'statements', '[]'::jsonb))) -> 'rejected'),
  1,
  'gli eventi dopo la chiusura passano dal normale controllo (qui rifiutato per l''informativa sconosciuta)'
);

-- ---------------------------------------------------------------------------
-- Chiusura dal formatore
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
update public.sessions set status = 'closed' where id = '00000000-0000-0000-0000-000000005002';
select pg_temp.logout();
select is(
  (select close_reason from public.sessions where id = '00000000-0000-0000-0000-000000005002'),
  'trainer',
  'RF-23: chiusa dal formatore, il motivo è "trainer"'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ update public.sessions set close_reason = 'inactivity'
     where id = '00000000-0000-0000-0000-000000005002' $$,
  '42501', null,
  'RNF-11: il formatore non cambia il motivo di chiusura'
);
select throws_ok(
  $$ update public.sessions set last_activity_at = now() + interval '1 day'
     where id = '00000000-0000-0000-0000-000000005002' $$,
  '42501', null,
  'RNF-11: il formatore non può fingere attività per tenere aperta una sessione'
);
select throws_ok(
  $$ insert into public.sessions (participant_id, trainer_id, scenario_id, last_activity_at)
     values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000a1',
             'scenario-prova', now() + interval '1 day') $$,
  '42501', null,
  'RNF-11: nemmeno alla creazione'
);
select throws_ok(
  $$ select public.close_inactive_sessions(30) $$,
  '42501', null,
  'RNF-11: la chiusura automatica la fa solo il backend'
);
select pg_temp.logout();

select is(
  (select schedule from cron.job where jobname = 'chiusura-sessioni-inattive'),
  '* * * * *',
  'RF-23: il controllo dell''inattività parte ogni minuto'
);

select * from finish();
rollback;
