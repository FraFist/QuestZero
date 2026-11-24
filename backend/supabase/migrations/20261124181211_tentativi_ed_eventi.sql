-- Migrazione 4: tentativi ed eventi del visore, Realtime per la dashboard.
-- Requisiti: RF-4, RF-8, RF-12, RF-13, RF-14, RF-16, RF-17, RF-21, RF-22, RNF-4, RNF-9,
-- RNF-13 (docs/requisiti.md); contratto: docs/eventi-xapi.md.
--
-- Scrive solo il backend (Edge Function "events", con la service role).
-- Nessun legame rigido con la versione dello scenario: se il visore usa una versione non
-- ancora pubblicata gli eventi si salvano comunque (RNF-9) e la dashboard mostra i codici
-- senza etichetta, come previsto dal contratto.

-- Vero se chi fa la richiesta può vedere la sessione indicata (RF-21, RF-22).
create function public.can_see_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session_id
      and (s.trainer_id = (select auth.uid())
           or s.participant_id = (select auth.uid()))
  ) or public.is_admin();
$$;

revoke execute on function public.can_see_session(uuid) from public, anon;
grant execute on function public.can_see_session(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tentativi (RF-4, RF-14): uno per ogni esecuzione dello scenario.
-- ---------------------------------------------------------------------------
create table public.attempts (
  id                   uuid primary key,  -- attemptId generato dal visore
  session_id           uuid not null references public.sessions (id) on delete cascade,
  attempt_number       integer not null check (attempt_number > 0),
  scenario_id          text not null,
  scenario_version     text not null,
  client_version       text,
  started_at           timestamptz not null,
  ended_at             timestamptz,

  -- Aggiornati a ogni evento, per la dashboard dal vivo (RF-16).
  points_total         integer not null default 0 check (points_total >= 0),
  errors_total         integer not null default 0 check (errors_total >= 0),
  objectives_completed integer not null default 0 check (objectives_completed >= 0),
  objectives_total     integer check (objectives_total >= 0),

  -- Dall'evento scenario.ended, così come li calcola il visore (RF-13, RF-14).
  end_reason           text check (end_reason in ('completed', 'aborted_by_participant')),
  outcome              text check (outcome in ('passed', 'failed')),
  completion_time_ms   integer check (completion_time_ms >= 0),
  sequence_respected   boolean,
  level                integer check (level >= 0),

  unique (session_id, attempt_number),

  -- Un tentativo è finito se e solo se ha un motivo di fine.
  constraint attempts_end_consistent
    check ((ended_at is null) = (end_reason is null)),
  -- L'esito c'è solo per i tentativi completati (contratto: outcome null se interrotto).
  -- (is distinct from non dà mai NULL: vedi la nota sui CHECK nella migrazione 2.)
  constraint attempts_outcome_only_when_completed
    check ((outcome is null) = (end_reason is distinct from 'completed')),
  -- Gli indicatori dell'esito ci sono per ogni tentativo completato (RF-13).
  constraint attempts_indicators_when_completed
    check (end_reason is distinct from 'completed'
           or (completion_time_ms is not null and sequence_respected is not null))
);

comment on table public.attempts is
  'Riepilogo di ogni tentativo. Indicatori ed esito sono quelli calcolati dal visore (RF-13, '
  'RF-14); punti e livello sono solo informativi e non decidono l''esito (RF-8).';
comment on column public.attempts.errors_total is
  'Errori del tentativo: cumulativo dagli eventi, poi indicators.errors a fine tentativo.';

create index attempts_session_id_idx on public.attempts (session_id);

-- ---------------------------------------------------------------------------
-- Eventi (RF-12): ogni evento del visore così com'è.
-- ---------------------------------------------------------------------------
create table public.events (
  event_id         uuid primary key,  -- generato dal visore: chiave anti-doppioni (RNF-9)
  session_id       uuid not null references public.sessions (id) on delete cascade,
  attempt_id       uuid,              -- null per gli eventi fuori da un tentativo
  seq              integer not null check (seq > 0),
  type             text not null check (type in (
                     'privacy.accepted', 'scenario.started', 'objective.completed',
                     'choice.made', 'error.committed', 'safety_distance.violated',
                     'scenario.ended')),
  schema_version   integer not null check (schema_version > 0),
  occurred_at      timestamptz not null,  -- ora sul visore
  received_at      timestamptz not null default now(),  -- ora di arrivo al server
  scenario_id      text not null,
  scenario_version text not null,
  payload          jsonb not null default '{}'::jsonb,

  -- Il visore numera gli eventi di una sessione senza buchi: lo stesso seq non arriva due volte.
  unique (session_id, seq),

  constraint events_payload_is_object
    check (jsonb_typeof(payload) = 'object'),
  -- Mai posizioni, rotazioni o sguardo nei dati salvati (RNF-13).
  constraint events_no_tracking_data
    check (not (payload ?| array['position', 'rotation', 'gaze', 'headPosition',
                                 'handPosition', 'coordinates', 'x', 'y', 'z']))
);

comment on table public.events is
  'Eventi discreti del visore (RF-12). occurred_at = ora sul visore, received_at = arrivo.';

create index events_attempt_id_idx on public.events (attempt_id);
create index events_session_occurred_idx on public.events (session_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Regole di accesso: in lettura come la sessione; nessuna scrittura dai client.
-- ---------------------------------------------------------------------------
alter table public.attempts enable row level security;
alter table public.events enable row level security;

revoke all on table public.attempts, public.events from anon;
revoke insert, update, delete, truncate on table public.attempts, public.events
  from authenticated;

create policy attempts_select on public.attempts
  for select to authenticated
  using (public.can_see_session(session_id));

create policy events_select on public.events
  for select to authenticated
  using (public.can_see_session(session_id));

-- ---------------------------------------------------------------------------
-- Realtime: la dashboard riceve subito nuovi eventi e aggiornamenti di tentativi e
-- sessioni (RF-16, RNF-4). Le regole RLS valgono anche per Realtime.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.events, public.attempts, public.sessions;
