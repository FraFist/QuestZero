-- Migrazione 5: coda degli statement xAPI da inviare all'LRS.
-- Requisiti: RF-15, RNF-5, RNF-19 (docs/requisiti.md); contratto: docs/eventi-xapi.md,
-- sezione "Mappatura in xAPI".
--
-- L'Edge Function "events" traduce gli eventi in statement e li mette qui; l'Edge Function
-- "xapi-sender" li invia all'LRS a gruppi e riprova più tardi se l'LRS non risponde.
-- La sessione non aspetta mai l'LRS.

create type public.xapi_status as enum ('pending', 'sent', 'failed');

create table public.xapi_outbox (
  id              bigint generated always as identity primary key,
  event_id        uuid not null references public.events (event_id) on delete cascade,
  -- ID dello statement xAPI: inviandolo con lo stesso ID, l'LRS non crea doppioni.
  statement_id    uuid not null unique default gen_random_uuid(),
  statement       jsonb not null,
  status          public.xapi_status not null default 'pending',
  send_attempts   integer not null default 0 check (send_attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,

  constraint xapi_outbox_sent_at_only_when_sent
    check ((status = 'sent') = (sent_at is not null)),
  constraint xapi_outbox_statement_is_object
    check (jsonb_typeof(statement) = 'object'),
  -- L'attore è sempre un account con il codice partecipante, mai un'email (RNF-19).
  constraint xapi_outbox_actor_without_email
    check (coalesce(
      jsonb_typeof(statement -> 'actor' -> 'account') = 'object'
      and not (statement -> 'actor' ?| array['mbox', 'mbox_sha1sum', 'openid', 'name']),
      false))
);

comment on table public.xapi_outbox is
  'Statement xAPI in attesa di invio all''LRS (RF-15). Un evento può produrne più di uno.';

create index xapi_outbox_due_idx on public.xapi_outbox (next_attempt_at)
  where status = 'pending';
create index xapi_outbox_event_id_idx on public.xapi_outbox (event_id);

alter table public.xapi_outbox enable row level security;
revoke all on table public.xapi_outbox from anon;
revoke insert, update, delete, truncate on table public.xapi_outbox from authenticated;

-- Solo l'amministratore consulta la coda (per esempio gli statement falliti).
create policy xapi_outbox_select_admin on public.xapi_outbox
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Funzioni per l'invio. Le chiama solo l'Edge Function "xapi-sender".
-- ---------------------------------------------------------------------------

-- Prende fino a p_limit statement da inviare e li "prenota" per 5 minuti, così due invii
-- contemporanei non prendono gli stessi statement.
create function public.claim_xapi_batch(p_limit integer default 50)
returns table (id bigint, statement_id uuid, statement jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with da_inviare as (
    select o.id
    from public.xapi_outbox o
    where o.status = 'pending' and o.next_attempt_at <= now()
    order by o.id
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update public.xapi_outbox o
     set next_attempt_at = now() + interval '5 minutes'
    from da_inviare d
   where o.id = d.id
  returning o.id, o.statement_id, o.statement;
end;
$$;

-- Segna come inviati gli statement accettati dall'LRS.
create function public.mark_xapi_sent(p_ids bigint[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with aggiornati as (
    update public.xapi_outbox o
       set status = 'sent', sent_at = now(), last_error = null,
           send_attempts = o.send_attempts + 1
     where o.id = any (p_ids) and o.status = 'pending'
    returning 1
  )
  select count(*)::integer from aggiornati;
$$;

-- Registra un invio fallito: riprova dopo 1, 2, 4, 8... minuti (al massimo 1 ora);
-- dopo 20 tentativi lo statement resta "failed" e lo vede l'amministratore.
create function public.mark_xapi_failed(p_id bigint, p_error text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.xapi_outbox o
     set send_attempts   = o.send_attempts + 1,
         last_error      = left(p_error, 2000),
         status          = case when o.send_attempts + 1 >= 20
                                then 'failed'::public.xapi_status
                                else 'pending'::public.xapi_status end,
         next_attempt_at = now() + least(power(2, o.send_attempts) * interval '1 minute',
                                         interval '1 hour')
   where o.id = p_id and o.status = 'pending';
$$;

revoke execute on function public.claim_xapi_batch(integer), public.mark_xapi_sent(bigint[]),
  public.mark_xapi_failed(bigint, text) from public, anon, authenticated;
grant execute on function public.claim_xapi_batch(integer), public.mark_xapi_sent(bigint[]),
  public.mark_xapi_failed(bigint, text) to service_role;
