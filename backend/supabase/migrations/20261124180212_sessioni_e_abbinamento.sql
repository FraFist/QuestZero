-- Migrazione 3: sessioni, codice di abbinamento e token del visore.
-- Requisiti: RF-11, RF-21, RF-22, RNF-9, RNF-11, RNF-12, RNF-19 (docs/requisiti.md);
-- contratto: docs/eventi-xapi.md, sezione "Avvio sul visore".
--
-- Codici e token non si salvano mai in chiaro: solo la loro impronta SHA-256.
-- Le tabelle di codici, token e tentativi sbagliati non sono leggibili da nessun client:
-- le usano solo le funzioni qui sotto.

-- Impronta SHA-256 in esadecimale. Interna: non chiamabile dai client.
create function public.sha256_hex(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(value, 'UTF8'), 'sha256'), 'hex');
$$;

revoke execute on function public.sha256_hex(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sessioni (RF-11)
-- ---------------------------------------------------------------------------
create type public.session_status as enum ('waiting', 'active', 'closed');

create table public.sessions (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.profiles (id) on delete cascade,
  trainer_id     uuid not null references public.profiles (id) on delete restrict,
  scenario_id    text not null,
  status         public.session_status not null default 'waiting',
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  closed_at      timestamptz,

  constraint sessions_closed_at_only_when_closed
    check ((status = 'closed') = (closed_at is not null))
);

comment on table public.sessions is
  'Una sessione = un partecipante davanti al visore, creata dal suo formatore (RF-11, RF-22).';
comment on column public.sessions.status is
  'waiting: creata, visore non ancora abbinato; active: visore abbinato; closed: chiusa dal formatore.';

create index sessions_trainer_id_idx on public.sessions (trainer_id);
create index sessions_participant_id_idx on public.sessions (participant_id);

-- Alla creazione: lo scenario deve esistere, lo studente deve essere uno studente e il
-- formatore un formatore. Stato e date partono sempre da zero.
create function public.check_session_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.scenarios s where s.scenario_id = new.scenario_id) then
    raise exception 'Scenario % non pubblicato', new.scenario_id
      using errcode = 'foreign_key_violation';
  end if;
  if not exists (select 1 from public.profiles p
                 where p.id = new.participant_id and p.role = 'participant') then
    raise exception 'participant_id deve indicare uno studente'
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.profiles p
                 where p.id = new.trainer_id and p.role = 'trainer') then
    raise exception 'trainer_id deve indicare un formatore'
      using errcode = 'check_violation';
  end if;

  new.status     := 'waiting';
  new.created_at := now();
  new.started_at := null;
  new.closed_at  := null;
  return new;
end;
$$;

create trigger sessions_check_insert
  before insert on public.sessions
  for each row execute function public.check_session_insert();

-- Cambi di stato ammessi: waiting → active (solo il backend, all'abbinamento),
-- waiting/active → closed. Una sessione chiusa non si riapre.
-- Alla chiusura: i codici non usati si annullano e i token scadono entro 24 ore (RNF-9).
create function public.check_session_update()
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
    new.started_at := old.started_at;
    new.closed_at  := old.closed_at;
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
    new.started_at := now();
    new.closed_at  := null;
    return new;
  end if;

  -- new.status = 'closed'
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
-- Codici di abbinamento, token del visore, tentativi sbagliati
-- ---------------------------------------------------------------------------
create table public.session_pairings (
  id         bigint generated always as identity primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  code_hash  text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

comment on table public.session_pairings is
  'Codici di abbinamento di 6 cifre, salvati come SHA-256. Validi 10 minuti, usabili una volta.';

-- Due codici non usati non possono coincidere: il visore manda solo il codice.
create unique index session_pairings_unused_code_idx
  on public.session_pairings (code_hash) where used_at is null;
create index session_pairings_session_id_idx on public.session_pairings (session_id);

create table public.session_tokens (
  token_hash text primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

comment on table public.session_tokens is
  'Token del visore (SHA-256). Valgono per una sola sessione; scadono 24 h dopo la chiusura, '
  'al massimo 7 giorni dopo l''emissione.';

create index session_tokens_session_id_idx on public.session_tokens (session_id);

create table public.pairing_failures (
  id        bigint generated always as identity primary key,
  failed_at timestamptz not null default now()
);

comment on table public.pairing_failures is
  'Codici di abbinamento sbagliati: oltre 20 in 10 minuti l''abbinamento risponde 429.';

create index pairing_failures_failed_at_idx on public.pairing_failures (failed_at);

-- Il trigger di aggiornamento delle sessioni usa le tabelle qui sopra: si crea dopo di esse.
create trigger sessions_check_update
  before update on public.sessions
  for each row execute function public.check_session_update();

-- ---------------------------------------------------------------------------
-- Regole di accesso
-- ---------------------------------------------------------------------------
alter table public.sessions enable row level security;
alter table public.session_pairings enable row level security;
alter table public.session_tokens enable row level security;
alter table public.pairing_failures enable row level security;

revoke all on table public.sessions from anon;
revoke all on table public.session_pairings, public.session_tokens, public.pairing_failures
  from anon, authenticated;

-- Il formatore vede le proprie sessioni, lo studente le sue, l'amministratore tutte (RF-21, RF-22).
create policy sessions_select on public.sessions
  for select to authenticated
  using (
    trainer_id = (select auth.uid())
    or participant_id = (select auth.uid())
    or public.is_admin()
  );

-- Il formatore crea sessioni solo per i propri studenti (RF-22).
create policy sessions_insert_trainer on public.sessions
  for insert to authenticated
  with check (
    public.is_trainer()
    and trainer_id = (select auth.uid())
    and public.is_my_student(participant_id)
  );

-- Il formatore modifica solo le proprie sessioni, e solo la colonna status
-- (in pratica: la chiude; le transizioni le controlla check_session_update).
create policy sessions_update_trainer on public.sessions
  for update to authenticated
  using (trainer_id = (select auth.uid()) and public.is_trainer())
  with check (trainer_id = (select auth.uid()));

revoke update on table public.sessions from authenticated;
grant update (status) on table public.sessions to authenticated;

-- ---------------------------------------------------------------------------
-- Il formatore genera il codice di abbinamento dalla dashboard.
-- Annulla i codici non usati della stessa sessione e quelli scaduti di tutte.
-- ---------------------------------------------------------------------------
create function public.create_pairing_code(p_session_id uuid)
returns table (pairing_code text, pairing_expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status  public.session_status;
  v_code    text;
  v_expires timestamptz := now() + interval '10 minutes';
begin
  select s.status into v_status
  from public.sessions s
  where s.id = p_session_id and s.trainer_id = (select auth.uid());

  if not found then
    raise exception 'Sessione non trovata' using errcode = 'QZ404';
  end if;
  if v_status = 'closed' then
    raise exception 'La sessione è chiusa' using errcode = 'QZ409';
  end if;

  delete from public.session_pairings p
  where p.used_at is null
    and (p.expires_at < now() or p.session_id = p_session_id);

  loop
    -- 6 cifre da un generatore crittografico (gen_random_bytes), non da random().
    v_code := lpad(
      ((('x' || lpad(encode(extensions.gen_random_bytes(4), 'hex'), 16, '0'))::bit(64)::bigint)
        % 1000000)::text,
      6, '0');
    begin
      insert into public.session_pairings (session_id, code_hash, expires_at)
      values (p_session_id, public.sha256_hex(v_code), v_expires);
      exit;
    exception when unique_violation then
      -- Codice già in uso per un'altra sessione: se ne estrae un altro.
    end;
  end loop;

  return query select v_code, v_expires;
end;
$$;

revoke execute on function public.create_pairing_code(uuid) from public, anon;
grant execute on function public.create_pairing_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Abbinamento del visore: la chiama solo l'Edge Function "pair".
-- Non solleva errori sui codici sbagliati (annullerebbe la registrazione del tentativo):
-- restituisce {"error": "invalid_code"} o {"error": "too_many_attempts"}.
-- ---------------------------------------------------------------------------
create function public.pair_device(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pairing_id bigint;
  v_session_id uuid;
  v_session    public.sessions;
  v_token      text;
begin
  delete from public.pairing_failures f where f.failed_at < now() - interval '10 minutes';

  if (select count(*) from public.pairing_failures) >= 20 then
    return jsonb_build_object('error', 'too_many_attempts');
  end if;

  select p.id, p.session_id into v_pairing_id, v_session_id
  from public.session_pairings p
  join public.sessions s on s.id = p.session_id
  where p.code_hash = public.sha256_hex(coalesce(p_code, ''))
    and p.used_at is null
    and p.expires_at > now()
    and s.status <> 'closed'
  for update of p;

  if v_pairing_id is null then
    insert into public.pairing_failures default values;
    return jsonb_build_object('error', 'invalid_code');
  end if;

  select * into v_session from public.sessions s where s.id = v_session_id;

  update public.session_pairings set used_at = now() where id = v_pairing_id;

  if v_session.status = 'waiting' then
    update public.sessions set status = 'active' where id = v_session.id;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.session_tokens (token_hash, session_id)
  values (public.sha256_hex(v_token), v_session.id);

  -- Nessun dato del partecipante nella risposta (RNF-19).
  return jsonb_build_object(
    'sessionId',            v_session.id,
    'sessionToken',         v_token,
    'scenarioId',           v_session.scenario_id,
    'privacyRequired',      public.privacy_required(v_session.participant_id),
    'privacyNoticeVersion', public.current_privacy_notice_version()
  );
end;
$$;

-- Restituisce la sessione di un token valido, altrimenti null. La usa l'Edge Function "events".
create function public.session_for_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.session_id
  from public.session_tokens t
  where t.token_hash = public.sha256_hex(coalesce(p_token, ''))
    and t.expires_at > now();
$$;

revoke execute on function public.pair_device(text), public.session_for_token(text)
  from public, anon, authenticated;
grant execute on function public.pair_device(text), public.session_for_token(text)
  to service_role;
