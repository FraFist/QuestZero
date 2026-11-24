-- Test della migrazione 1: profili, ruoli e informativa.
-- Requisiti: RF-21, RF-22, RNF-11, RNF-18, RNF-19.
-- Tutto avviene dentro una transazione annullata alla fine: il database non cambia.

begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- ---------------------------------------------------------------------------
-- Dati di prova: 1 amministratore, 2 formatori, 1 studente per formatore.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a1', 'trainer.a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'trainer.b@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a001', 'stud.a@test.local',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b001', 'stud.b@test.local',  'authenticated', 'authenticated');

insert into public.profiles (id, role, participant_code, trainer_id) values
  ('00000000-0000-0000-0000-00000000000a', 'admin',   null, null),
  ('00000000-0000-0000-0000-0000000000a1', 'trainer', null, null),
  ('00000000-0000-0000-0000-0000000000b1', 'trainer', null, null);
insert into public.profiles (id, role, participant_code, trainer_id) values
  ('00000000-0000-0000-0000-00000000a001', 'participant', 'P-A001', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000b001', 'participant', 'P-B001', '00000000-0000-0000-0000-0000000000b1');

insert into public.privacy_notices (version, content, published_at) values
  ('2026-12-01', 'Informativa di prova', now() - interval '1 day');

-- Diventa l'utente indicato, come farebbe una richiesta dalla dashboard.
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
-- Struttura
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select table_name, column_name from information_schema.columns
     where table_schema = 'public' and column_name ilike '%email%' $$,
  'RNF-19: nessuna colonna email nelle tabelle del progetto'
);

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  'RNF-11: RLS attiva su tutte le tabelle del progetto'
);

-- ---------------------------------------------------------------------------
-- Vincoli sui dati
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.profiles (id, role) values ('00000000-0000-0000-0000-00000000000a', 'participant') $$,
  '23514', null,
  'RF-20: un partecipante senza codice è rifiutato'
);

select throws_ok(
  $$ update public.profiles set participant_code = 'mario@example.com'
     where id = '00000000-0000-0000-0000-00000000a001' $$,
  '23514', null,
  'RNF-19: un codice partecipante a forma di email è rifiutato'
);

select throws_ok(
  $$ update public.profiles set trainer_id = '00000000-0000-0000-0000-00000000b001'
     where id = '00000000-0000-0000-0000-00000000a001' $$,
  '23514', null,
  'RF-22: lo studente non può avere come formatore un altro studente'
);

-- ---------------------------------------------------------------------------
-- Chi vede quali profili (RF-21, RF-22, RNF-11)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a001');
select results_eq(
  $$ select participant_code from public.profiles $$,
  $$ values ('P-A001'::text) $$,
  'RF-21: lo studente vede solo il proprio profilo'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select set_eq(
  $$ select id from public.profiles $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid),
            ('00000000-0000-0000-0000-00000000a001'::uuid) $$,
  'RF-22: il formatore A vede se stesso e il proprio studente'
);
select is_empty(
  $$ select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000b001' $$,
  'RF-22: il formatore A non vede lo studente del formatore B'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is(
  (select count(*)::int from public.profiles), 5,
  'RF-22: l''amministratore vede tutti i profili'
);

select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000a001');
select is(public.app_role(), 'participant'::public.user_role, 'app_role() restituisce il ruolo di chi chiama');
select pg_temp.logout();

set local role anon;
select throws_ok(
  $$ select * from public.profiles $$,
  '42501', null,
  'RNF-10: un utente non autenticato non legge i profili'
);
reset role;

-- ---------------------------------------------------------------------------
-- Chi può cambiare ruoli e formatore (RNF-11, RF-22)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a001');
update public.profiles set role = 'admin', participant_code = null, trainer_id = null
  where id = '00000000-0000-0000-0000-00000000a001';
select pg_temp.logout();
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-00000000a001'),
  'participant'::public.user_role,
  'RNF-11: lo studente non può cambiare il proprio ruolo'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
update public.profiles set trainer_id = '00000000-0000-0000-0000-0000000000a1'
  where id = '00000000-0000-0000-0000-00000000b001';
select pg_temp.logout();
select is(
  (select trainer_id from public.profiles where id = '00000000-0000-0000-0000-00000000b001'),
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  'RF-22: il formatore A non può prendersi lo studente di B'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.profiles set trainer_id = '00000000-0000-0000-0000-0000000000a1'
  where id = '00000000-0000-0000-0000-00000000b001';
select pg_temp.logout();
select is(
  (select trainer_id from public.profiles where id = '00000000-0000-0000-0000-00000000b001'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'RF-22: l''amministratore sposta uno studente da B ad A'
);
-- Rimette lo studente al formatore B per i test successivi.
update public.profiles set trainer_id = '00000000-0000-0000-0000-0000000000b1'
  where id = '00000000-0000-0000-0000-00000000b001';

-- ---------------------------------------------------------------------------
-- Informativa privacy (RNF-18)
-- ---------------------------------------------------------------------------
select ok(
  public.privacy_required('00000000-0000-0000-0000-00000000a001'),
  'RNF-18: prima di accettare, l''informativa è richiesta'
);

select pg_temp.login('00000000-0000-0000-0000-00000000a001');
select lives_ok(
  $$ insert into public.privacy_acceptances (participant_id, notice_version, source)
     values ('00000000-0000-0000-0000-00000000a001', '2026-12-01', 'dashboard') $$,
  'RNF-18: lo studente accetta l''informativa dalla dashboard'
);
select throws_ok(
  $$ insert into public.privacy_acceptances (participant_id, notice_version, source)
     values ('00000000-0000-0000-0000-00000000b001', '2026-12-01', 'dashboard') $$,
  '42501', null,
  'RNF-11: lo studente non può accettare al posto di un altro'
);
select throws_ok(
  $$ insert into public.privacy_acceptances (participant_id, notice_version, source)
     values ('00000000-0000-0000-0000-00000000a001', '2026-12-01', 'visore') $$,
  '42501', null,
  'RNF-18: dalla dashboard non si registra un''accettazione "dal visore"'
);
select pg_temp.logout();

select ok(
  not public.privacy_required('00000000-0000-0000-0000-00000000a001'),
  'RNF-18: dopo l''accettazione l''informativa non è più richiesta'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is_empty(
  $$ select 1 from public.privacy_acceptances $$,
  'RF-22: il formatore B non vede le accettazioni degli studenti di A'
);
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ select public.privacy_required('00000000-0000-0000-0000-00000000a001') $$,
  '42501', null,
  'privacy_required() la usa solo il backend'
);
select pg_temp.logout();

insert into public.privacy_notices (version, content, published_at)
  values ('2027-01-15', 'Informativa aggiornata', now());
select ok(
  public.privacy_required('00000000-0000-0000-0000-00000000a001'),
  'RNF-18: con una nuova versione dell''informativa va accettata di nuovo'
);

select * from finish();
rollback;
