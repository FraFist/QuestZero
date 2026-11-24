-- Test della migrazione 2: catalogo degli scenari.
-- Requisiti: RNF-11, RNF-14, RNF-15.
-- Tutto avviene dentro una transazione annullata alla fine: il database non cambia.

begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- ---------------------------------------------------------------------------
-- Dati di prova: 1 amministratore, 1 formatore, 1 studente.
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

-- Il test non dipende dai dati di seed.sql.
delete from public.scenarios;

-- Catalogo minimo valido, con id e versione scelti.
create function pg_temp.catalog(id text, ver text, nome text default 'Scenario di prova')
returns jsonb language sql as $$
  select jsonb_build_object(
    'scenarioId', id, 'scenarioVersion', ver, 'name', nome,
    'objectives', '[]'::jsonb, 'choices', '[]'::jsonb,
    'errors', '[]'::jsonb, 'zones', '[]'::jsonb,
    'passCriteria', jsonb_build_object('maxErrors', 2)
  );
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

-- ---------------------------------------------------------------------------
-- Pubblicazione (RNF-14, RNF-11)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ insert into public.scenarios (scenario_id, version, catalog)
     values ('scenario-prova', '1.0.0', pg_temp.catalog('scenario-prova', '1.0.0')) $$,
  'RNF-14: l''amministratore pubblica un nuovo scenario inserendo una riga'
);
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ insert into public.scenarios (scenario_id, version, catalog)
     values ('altro', '1.0.0', pg_temp.catalog('altro', '1.0.0')) $$,
  '42501', null,
  'RNF-11: il formatore non può pubblicare scenari'
);
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000a001');
select throws_ok(
  $$ insert into public.scenarios (scenario_id, version, catalog)
     values ('altro', '1.0.0', pg_temp.catalog('altro', '1.0.0')) $$,
  '42501', null,
  'RNF-11: lo studente non può pubblicare scenari'
);
select is(
  (select name from public.scenarios where scenario_id = 'scenario-prova'),
  'Scenario di prova',
  'RF-21: lo studente legge i cataloghi (servono per le etichette)'
);
select pg_temp.logout();

set local role anon;
select throws_ok(
  $$ select * from public.scenarios $$,
  '42501', null,
  'RNF-10: un utente non autenticato non legge i cataloghi'
);
reset role;

-- ---------------------------------------------------------------------------
-- Una versione pubblicata non si modifica (RNF-15)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.scenarios
     set catalog = jsonb_set(catalog, '{passCriteria,maxErrors}', '5')
     where scenario_id = 'scenario-prova' and version = '1.0.0' $$,
  '23001', null,
  'RNF-15: i criteri di una versione pubblicata non si cambiano'
);

select lives_ok(
  $$ insert into public.scenarios (scenario_id, version, catalog, published_at)
     values ('scenario-prova', '1.1.0',
             pg_temp.catalog('scenario-prova', '1.1.0', 'Scenario di prova v2'),
             now() + interval '1 minute') $$,
  'RNF-15: per cambiare i criteri si pubblica una nuova versione'
);

select results_eq(
  $$ select version, name from public.scenarios_latest where scenario_id = 'scenario-prova' $$,
  $$ values ('1.1.0'::text, 'Scenario di prova v2'::text) $$,
  'scenarios_latest restituisce l''ultima versione'
);

select is(
  (select count(*)::int from public.scenarios where scenario_id = 'scenario-prova'), 2,
  'RNF-15: la versione precedente resta disponibile'
);

-- ---------------------------------------------------------------------------
-- Forma del catalogo
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.scenarios (scenario_id, version, catalog)
     values ('scenario-x', '1.0.0', pg_temp.catalog('scenario-y', '1.0.0')) $$,
  '23514', null,
  'il JSON deve riportare lo stesso scenarioId della riga'
);

select throws_ok(
  $$ insert into public.scenarios (scenario_id, version, catalog)
     values ('scenario-x', '1.0.0', pg_temp.catalog('scenario-x', '1.0.0') - 'passCriteria') $$,
  '23514', null,
  'RNF-15: un catalogo senza passCriteria è rifiutato'
);

select throws_ok(
  $$ insert into public.scenarios (scenario_id, version, catalog)
     values ('scenario-x', '1.0.0', pg_temp.catalog('scenario-x', '1.0.0') - 'scenarioId') $$,
  '23514', null,
  'un catalogo senza scenarioId è rifiutato'
);

select throws_ok(
  $$ insert into public.scenarios (scenario_id, version, catalog)
     values ('scenario-x', 'v1', pg_temp.catalog('scenario-x', 'v1')) $$,
  '23514', null,
  'la versione deve essere nel formato 1.2.3'
);

select throws_ok(
  $$ insert into public.scenarios (scenario_id, version, catalog)
     values ('Scenario X', '1.0.0', pg_temp.catalog('Scenario X', '1.0.0')) $$,
  '23514', null,
  'lo scenarioId usa solo minuscole, cifre e trattini (finisce negli IRI xAPI)'
);

select throws_ok(
  $$ insert into public.scenarios (scenario_id, version, catalog)
     values ('scenario-prova', '1.0.0', pg_temp.catalog('scenario-prova', '1.0.0')) $$,
  '23505', null,
  'la stessa versione non si pubblica due volte'
);

select * from finish();
rollback;
