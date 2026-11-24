-- Migrazione 9: chiusura delle sessioni, dal formatore o automatica dopo 30 minuti di inattività.
-- Requisiti: RF-23, RNF-9, RNF-11 (docs/requisiti.md); contratto: docs/eventi-xapi.md
-- (bozza 0.7, "Chiusura della sessione").
--
-- Inattività = nessun evento ricevuto dal visore e nessun abbinamento. Conta l'ora del server
-- (last_activity_at), non quella del visore, che potrebbe essere sbagliata.

alter table public.sessions
  add column last_activity_at timestamptz not null default now(),
  add column close_reason text check (close_reason in ('trainer', 'inactivity'));

-- Le sessioni già chiuse prima di questa migrazione le aveva chiuse un formatore.
update public.sessions set close_reason = 'trainer' where status = 'closed';

alter table public.sessions
  add constraint sessions_close_reason_only_when_closed
    check ((status = 'closed') = (close_reason is not null));

comment on column public.sessions.last_activity_at is
  'Ultima attività vista dal server (creazione, abbinamento, evento ricevuto). RF-23.';
comment on column public.sessions.close_reason is
  'trainer: chiusa dal formatore; inactivity: chiusa dopo 30 minuti senza attività (RF-23).';

create index sessions_open_last_activity_idx on public.sessions (last_activity_at)
  where status <> 'closed';

-- Il formatore crea una sessione indicando solo id, studente, formatore e scenario: stato,
-- date, attività e motivo di chiusura li gestisce il database.
revoke insert on table public.sessions from authenticated;
grant insert (id, participant_id, trainer_id, scenario_id) on table public.sessions to authenticated;

-- ---------------------------------------------------------------------------
-- Cambi di stato: come nella migrazione 3, più il motivo di chiusura.
-- ---------------------------------------------------------------------------
create or replace function public.check_session_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.participant_id <> old.participant_id
     or new.trainer_id <> old.trainer_id
     or new.scenario_id <> old.scenario_id
     or new.created_at <> old.created_at then
    raise exception 'Studente, formatore, scenario e data di creazione non si modificano'
      using errcode = 'check_violation';
  end if;

  if new.status is not distinct from old.status then
    new.started_at   := old.started_at;
    new.closed_at    := old.closed_at;
    new.close_reason := old.close_reason;
    return new;
  end if;

  if old.status = 'closed' then
    raise exception 'La sessione è chiusa e non si riapre' using errcode = 'QZ409';
  end if;

  if new.status = 'waiting' then
    raise exception 'Una sessione non torna in attesa' using errcode = 'QZ409';
  end if;

  if new.status = 'active' then
    -- Dalla dashboard (ruolo JWT "authenticated") non si avvia: lo fa l'abbinamento.
    if coalesce((select auth.role()), '') = 'authenticated' then
      raise exception 'La sessione si avvia abbinando il visore' using errcode = 'insufficient_privilege';
    end if;
    new.started_at   := now();
    new.closed_at    := null;
    new.close_reason := null;
    return new;
  end if;

  -- new.status = 'closed'. Dalla dashboard il motivo è sempre "trainer";
  -- la chiusura automatica (close_inactive_sessions) indica "inactivity".
  if coalesce((select auth.role()), '') = 'authenticated' then
    new.close_reason := 'trainer';
  else
    new.close_reason := coalesce(new.close_reason, 'trainer');
  end if;
  new.closed_at := now();
  delete from public.session_pairings p
    where p.session_id = new.id and p.used_at is null;
  update public.session_tokens t
    set expires_at = least(t.expires_at, now() + interval '24 hours')
    where t.session_id = new.id;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ogni evento ricevuto e ogni abbinamento contano come attività.
-- ---------------------------------------------------------------------------
create function public.touch_session_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sessions s
     set last_activity_at = now()
   where s.id = new.session_id and s.last_activity_at < now();
  return null;
end;
$$;

create trigger events_touch_session
  after insert on public.events
  for each row execute function public.touch_session_activity();

create trigger session_pairings_touch_session
  after update of used_at on public.session_pairings
  for each row when (new.used_at is not null and old.used_at is null)
  execute function public.touch_session_activity();

-- ---------------------------------------------------------------------------
-- Chiusura automatica: la chiama il timer ogni minuto. Restituisce quante sessioni ha chiuso.
-- ---------------------------------------------------------------------------
create function public.close_inactive_sessions(p_minutes integer default 30)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with chiuse as (
    update public.sessions s
       set status = 'closed', close_reason = 'inactivity'
     where s.status <> 'closed'
       and s.last_activity_at < now() - make_interval(mins => p_minutes)
    returning 1
  )
  select count(*)::integer from chiuse;
$$;

revoke execute on function public.close_inactive_sessions(integer), public.touch_session_activity()
  from public, anon, authenticated;
grant execute on function public.close_inactive_sessions(integer) to service_role;

select cron.schedule('chiusura-sessioni-inattive', '* * * * *',
  $$ select public.close_inactive_sessions(30); $$);
