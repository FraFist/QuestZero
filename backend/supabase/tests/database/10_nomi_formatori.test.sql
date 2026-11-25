-- Test della migrazione 10: nome di formatori e amministratori.
-- Requisiti: RF-22, RNF-19.
-- Tutto avviene dentro una transazione annullata alla fine: il database non cambia.

begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local',     'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a1', 'trainer.a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a001', 'stud.a@test.local',    'authenticated', 'authenticated');

insert into public.profiles (id, role, participant_code, trainer_id) values
  ('00000000-0000-0000-0000-00000000000a', 'admin',   null, null),
  ('00000000-0000-0000-0000-0000000000a1', 'trainer', null, null);
insert into public.profiles (id, role, participant_code, trainer_id) values
  ('00000000-0000-0000-0000-00000000a001', 'participant', 'P-A001', '00000000-0000-0000-0000-0000000000a1');

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

select has_column('public', 'profiles', 'display_name', 'RF-22: i profili hanno un nome leggibile');

-- Lo studente non può avere un nome: resta solo il suo codice (RNF-19).
select throws_ok(
  $$ update public.profiles set display_name = 'Mario Rossi'
     where id = '00000000-0000-0000-0000-00000000a001' $$,
  '23514', null,
  'RNF-19: uno studente non può avere un nome'
);

select throws_ok(
  $$ update public.profiles set display_name = '   '
     where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '23514', null,
  'Un nome fatto solo di spazi non è valido'
);

-- Il formatore non cambia da solo il proprio nome (la RLS lo ignora: 0 righe).
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
update public.profiles set display_name = 'Nome scelto da me'
  where id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.logout();
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  null,
  'RF-22: solo l''amministratore imposta i nomi, non il formatore'
);

-- L'amministratore imposta il nome del formatore.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.profiles set display_name = 'Anna Bianchi'
  where id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.logout();
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'Anna Bianchi',
  'RF-22: l''amministratore imposta il nome di un formatore'
);

-- Il formatore legge il proprio nome (per mostrarlo nella barra in alto).
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'Anna Bianchi',
  'Il formatore vede il proprio nome'
);
select pg_temp.logout();

-- Lo studente non vede il profilo del formatore (e quindi il suo nome).
select pg_temp.login('00000000-0000-0000-0000-00000000a001');
select is_empty(
  $$ select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a1' $$,
  'RF-21: lo studente non vede il profilo del formatore'
);
select pg_temp.logout();

select * from finish();
rollback;
