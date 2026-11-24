-- Test della migrazione 8: invio automatico degli statement xAPI.
-- Requisiti: RF-15, RNF-11.
-- Tutto avviene dentro una transazione annullata alla fine: il database non cambia.
-- La chiamata web vera (pg_net) non si verifica qui: la copre il test completo delle funzioni.

begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

select is(
  (select schedule from cron.job where jobname = 'invio-xapi'),
  '* * * * *',
  'RF-15: l''invio all''LRS parte ogni minuto'
);

-- Senza segreti nel Vault il timer non fa nulla.
delete from vault.secrets where name in ('project_url', 'xapi_sender_key');
select is(public.trigger_xapi_sender(), null, 'senza configurazione nel Vault non chiama nessuno');

-- Con il Vault configurato ma la coda vuota non chiama nessuno.
select vault.create_secret('http://esempio.invalid', 'project_url');
select vault.create_secret('chiave-di-prova', 'xapi_sender_key');
delete from public.xapi_outbox;
select is(public.trigger_xapi_sender(), null, 'con la coda vuota non chiama la funzione');

select ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'trigger_xapi_sender'
                and has_function_privilege('authenticated', p.oid, 'execute')),
  'RNF-11: i client non possono avviare l''invio'
);

select ok(
  not exists (select 1 from cron.job where command ilike '%chiave%' or command ilike '%http%'),
  'nessun segreto o indirizzo scritto nel job: stanno nel Vault'
);

select * from finish();
rollback;
