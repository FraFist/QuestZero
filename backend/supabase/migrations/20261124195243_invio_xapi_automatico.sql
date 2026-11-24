-- Migrazione 8: invio automatico degli statement xAPI ogni minuto.
-- Requisiti: RF-15 (docs/requisiti.md); contratto: docs/eventi-xapi.md, "Mappatura in xAPI".
--
-- pg_cron (timer) chiama ogni minuto trigger_xapi_sender(), che con pg_net (chiamate web)
-- avvia l'Edge Function "xapi-sender" solo se ci sono statement da inviare.
--
-- Indirizzo del progetto e chiave NON stanno qui: si leggono dal Vault di Supabase, la
-- cassaforte per i segreti, e vanno impostati a mano in ogni ambiente:
--   select vault.create_secret('<URL del progetto>', 'project_url');
--   select vault.create_secret('<chiave service role>', 'xapi_sender_key');
-- Finché mancano, il timer non fa nulla.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function public.trigger_xapi_sender()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'project_url';
  select s.decrypted_secret into v_key from vault.decrypted_secrets s where s.name = 'xapi_sender_key';
  if v_url is null or v_key is null then
    return null;  -- non configurato
  end if;

  if not exists (select 1 from public.xapi_outbox o
                 where o.status = 'pending' and o.next_attempt_at <= now()) then
    return null;  -- niente da inviare
  end if;

  -- Restituisce l'id della richiesta pg_net (utile per controllarne l'esito).
  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/xapi-sender',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.trigger_xapi_sender() from public, anon, authenticated;
grant execute on function public.trigger_xapi_sender() to service_role;

select cron.schedule('invio-xapi', '* * * * *', $$ select public.trigger_xapi_sender(); $$);
