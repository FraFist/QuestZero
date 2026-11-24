-- Test della migrazione 3: sessioni, codice di abbinamento e token del visore.
-- Requisiti: RF-11, RF-21, RF-22, RNF-9, RNF-11, RNF-19; contratto docs/eventi-xapi.md
-- ("Avvio sul visore").
-- Tutto avviene dentro una transazione annullata alla fine: il database non cambia.

begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- ---------------------------------------------------------------------------
-- Dati di prova: 1 amministratore, 2 formatori, 1 studente per formatore, 1 scenario.
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

-- Il test non dipende dai dati di seed.sql.
delete from public.privacy_acceptances;
delete from public.privacy_notices;
delete from public.scenarios;
insert into public.privacy_notices (version, content) values ('2026-12-01', 'Informativa di prova');
insert into public.scenarios (scenario_id, version, catalog) values (
  'scenario-prova', '1.0.0',
  jsonb_build_object('scenarioId', 'scenario-prova', 'scenarioVersion', '1.0.0',
    'name', 'Scenario di prova', 'objectives', '[]'::jsonb, 'choices', '[]'::jsonb,
    'errors', '[]'::jsonb, 'zones', '[]'::jsonb, 'passCriteria', '{}'::jsonb));

-- Appunti del test: codice e token restituiti dalle funzioni.
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

-- ---------------------------------------------------------------------------
-- Creazione delle sessioni (RF-11, RF-22)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$ insert into public.sessions (id, participant_id, trainer_id, scenario_id)
     values ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000a001',
             '00000000-0000-0000-0000-0000000000a1', 'scenario-prova') $$,
  'RF-11: il formatore A crea una sessione per il proprio studente'
);
select throws_ok(
  $$ insert into public.sessions (participant_id, trainer_id, scenario_id)
     values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000a1',
             'scenario-prova') $$,
  '42501', null,
  'RF-22: il formatore A non crea sessioni per lo studente di B'
);
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000a001');
select throws_ok(
  $$ insert into public.sessions (participant_id, trainer_id, scenario_id)
     values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000a1',
             'scenario-prova') $$,
  '42501', null,
  'RNF-11: lo studente non crea sessioni'
);
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ insert into public.sessions (participant_id, trainer_id, scenario_id)
     values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000a1',
             'scenario-prova') $$,
  '42501', null,
  'RNF-11: le sessioni le crea solo il formatore, non l''amministratore'
);
select pg_temp.logout();

select throws_ok(
  $$ insert into public.sessions (participant_id, trainer_id, scenario_id)
     values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000a1',
             'scenario-inesistente') $$,
  '23503', null,
  'RNF-14: una sessione richiede uno scenario pubblicato'
);

insert into public.sessions (id, participant_id, trainer_id, scenario_id, status)
values ('00000000-0000-0000-0000-00000000b501', '00000000-0000-0000-0000-00000000b001',
        '00000000-0000-0000-0000-0000000000b1', 'scenario-prova', 'active');
select is(
  (select status from public.sessions where id = '00000000-0000-0000-0000-00000000b501'),
  'waiting'::public.session_status,
  'una nuova sessione parte sempre in attesa'
);

-- ---------------------------------------------------------------------------
-- Chi vede quali sessioni (RF-21, RF-22)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select results_eq(
  $$ select id from public.sessions $$,
  $$ values ('00000000-0000-0000-0000-000000005001'::uuid) $$,
  'RF-22: il formatore A vede solo la propria sessione'
);
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select results_eq(
  $$ select id from public.sessions $$,
  $$ values ('00000000-0000-0000-0000-00000000b501'::uuid) $$,
  'RF-22: il formatore B non vede la sessione di A'
);
select pg_temp.login('00000000-0000-0000-0000-00000000a001');
select results_eq(
  $$ select id from public.sessions $$,
  $$ values ('00000000-0000-0000-0000-000000005001'::uuid) $$,
  'RF-21: lo studente A vede la propria sessione'
);
select pg_temp.login('00000000-0000-0000-0000-00000000b001');
select results_eq(
  $$ select id from public.sessions $$,
  $$ values ('00000000-0000-0000-0000-00000000b501'::uuid) $$,
  'RF-21: lo studente B non vede la sessione di A'
);
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is(
  (select count(*)::int from public.sessions), 2,
  'RF-22: l''amministratore vede tutte le sessioni'
);
select pg_temp.logout();

-- ---------------------------------------------------------------------------
-- Modifiche consentite al formatore
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ update public.sessions set participant_id = '00000000-0000-0000-0000-00000000b001'
     where id = '00000000-0000-0000-0000-000000005001' $$,
  '42501', null,
  'RF-22: il formatore non cambia lo studente di una sessione'
);
select throws_ok(
  $$ update public.sessions set status = 'active'
     where id = '00000000-0000-0000-0000-000000005001' $$,
  '42501', null,
  'la sessione non si avvia dalla dashboard: la avvia l''abbinamento del visore'
);
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
update public.sessions set status = 'closed' where id = '00000000-0000-0000-0000-000000005001';
select pg_temp.logout();
select is(
  (select status from public.sessions where id = '00000000-0000-0000-0000-000000005001'),
  'waiting'::public.session_status,
  'RF-22: il formatore B non chiude la sessione di A'
);

-- ---------------------------------------------------------------------------
-- Codice di abbinamento (contratto, "Avvio sul visore")
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
insert into appunti
  select 'codice', pairing_code
  from public.create_pairing_code('00000000-0000-0000-0000-000000005001');
select matches(
  (select valore from appunti where nome = 'codice'), '^[0-9]{6}$',
  'il formatore genera un codice di 6 cifre'
);
select throws_ok(
  $$ select * from public.session_pairings $$,
  '42501', null,
  'il formatore non legge i codici salvati'
);
select throws_ok(
  $$ select public.pair_device('123456') $$,
  '42501', null,
  'l''abbinamento lo chiama solo il backend'
);
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok(
  $$ select * from public.create_pairing_code('00000000-0000-0000-0000-000000005001') $$,
  'QZ404', null,
  'RF-22: il formatore B non genera codici per la sessione di A'
);
select pg_temp.logout();

select is(
  (select public.pair_device(
     case when valore = '000000' then '000001' else '000000' end) ->> 'error'
   from appunti where nome = 'codice'),
  'invalid_code',
  'un codice sbagliato è rifiutato'
);

insert into appunti
  select 'risposta', public.pair_device(valore)::text from appunti where nome = 'codice';
select is(
  (select (valore::jsonb ->> 'sessionId')::uuid from appunti where nome = 'risposta'),
  '00000000-0000-0000-0000-000000005001'::uuid,
  'il codice giusto abbina il visore alla sessione'
);
select set_eq(
  $$ select jsonb_object_keys(valore::jsonb) from appunti where nome = 'risposta' $$,
  array['sessionId', 'sessionToken', 'scenarioId', 'privacyRequired', 'privacyNoticeVersion'],
  'RNF-19: la risposta non contiene dati del partecipante'
);
select ok(
  (select (valore::jsonb ->> 'privacyRequired')::boolean from appunti where nome = 'risposta'),
  'RNF-18: per uno studente che non ha accettato l''informativa, privacyRequired è true'
);
select is(
  (select status from public.sessions where id = '00000000-0000-0000-0000-000000005001'),
  'active'::public.session_status,
  'dopo l''abbinamento la sessione è attiva'
);
select is(
  (select public.pair_device(valore) ->> 'error' from appunti where nome = 'codice'),
  'invalid_code',
  'un codice si usa una volta sola'
);

-- ---------------------------------------------------------------------------
-- Token del visore
-- ---------------------------------------------------------------------------
insert into appunti
  select 'token', valore::jsonb ->> 'sessionToken' from appunti where nome = 'risposta';
select is(
  (select public.session_for_token(valore) from appunti where nome = 'token'),
  '00000000-0000-0000-0000-000000005001'::uuid,
  'il token riconosce la sessione'
);
select is(
  public.session_for_token('token-inventato'), null,
  'RNF-11: un token inventato non vale'
);

-- Un codice scaduto non vale più.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
insert into appunti
  select 'codice2', pairing_code
  from public.create_pairing_code('00000000-0000-0000-0000-000000005001');
select pg_temp.logout();
update public.session_pairings set expires_at = now() - interval '1 second'
  where session_id = '00000000-0000-0000-0000-000000005001' and used_at is null;
select is(
  (select public.pair_device(valore) ->> 'error' from appunti where nome = 'codice2'),
  'invalid_code',
  'un codice scaduto è rifiutato'
);

-- ---------------------------------------------------------------------------
-- Chiusura della sessione (RNF-9)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
update public.sessions set status = 'closed' where id = '00000000-0000-0000-0000-000000005001';
select pg_temp.logout();
select ok(
  (select status = 'closed' and closed_at is not null
   from public.sessions where id = '00000000-0000-0000-0000-000000005001'),
  'il formatore chiude la propria sessione'
);
select ok(
  (select bool_and(expires_at <= now() + interval '24 hours') from public.session_tokens
   where session_id = '00000000-0000-0000-0000-000000005001'),
  'RNF-9: alla chiusura il token resta valido al massimo 24 ore'
);
select throws_ok(
  $$ update public.sessions set status = 'active'
     where id = '00000000-0000-0000-0000-000000005001' $$,
  'QZ409', null,
  'una sessione chiusa non si riapre'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ select * from public.create_pairing_code('00000000-0000-0000-0000-000000005001') $$,
  'QZ409', null,
  'nessun codice per una sessione chiusa'
);
select pg_temp.logout();

update public.session_tokens set expires_at = now() - interval '1 second'
  where session_id = '00000000-0000-0000-0000-000000005001';
select is(
  (select public.session_for_token(valore) from appunti where nome = 'token'),
  null,
  'RNF-11: un token scaduto non vale più'
);

-- ---------------------------------------------------------------------------
-- Limite ai codici sbagliati (429)
-- ---------------------------------------------------------------------------
insert into public.pairing_failures (failed_at) select now() from generate_series(1, 20);
select is(
  public.pair_device('999999') ->> 'error',
  'too_many_attempts',
  'dopo 20 codici sbagliati in 10 minuti l''abbinamento si blocca'
);

select * from finish();
rollback;
