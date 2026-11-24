-- Migrazione 1: profili, ruoli e informativa privacy.
-- Requisiti: RF-20, RF-21, RF-22, RNF-11, RNF-18, RNF-19 (docs/requisiti.md).
--
-- Regole generali di tutte le migrazioni:
-- - RLS attiva su ogni tabella: senza una regola (policy) che lo permette, nessuno legge o scrive.
-- - Il ruolo "anon" (utente non autenticato) non ha nessun accesso alle tabelle del progetto.
-- - Le scritture "di sistema" (inviti, eventi del visore) le fanno le Edge Functions con la
--   service role, che ignora RLS: per questo molte tabelle non hanno regole di scrittura.

-- ---------------------------------------------------------------------------
-- Ruoli
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('participant', 'trainer', 'admin');

-- ---------------------------------------------------------------------------
-- Profili: uno per ogni utente di Supabase Auth.
-- Nessuna email qui: resta solo in auth.users (RNF-19).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  role             public.user_role not null,
  participant_code text unique,
  trainer_id       uuid references public.profiles (id) on delete restrict,
  created_at       timestamptz not null default now(),

  -- Solo i partecipanti hanno un codice e un formatore di riferimento (RF-20, RF-22).
  constraint profiles_participant_code_only_for_participants
    check ((role = 'participant') = (participant_code is not null)),
  constraint profiles_trainer_only_for_participants
    check ((role = 'participant') = (trainer_id is not null)),
  -- Il codice partecipante va a LRS e visore: non deve mai essere un'email (RNF-19).
  constraint profiles_participant_code_format
    check (participant_code ~ '^[A-Za-z0-9_-]{1,32}$')
);

comment on table public.profiles is
  'Ruolo e codice partecipante di ogni utente. Email solo in auth.users (RNF-19).';
comment on column public.profiles.trainer_id is
  'Formatore a cui appartiene lo studente (RF-22). Null per formatori e amministratori.';

create index profiles_trainer_id_idx on public.profiles (trainer_id);

-- trainer_id deve puntare a un formatore, non a un partecipante o a un amministratore.
create function public.check_profile_trainer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trainer_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.trainer_id and p.role = 'trainer'
  ) then
    raise exception 'trainer_id deve indicare un utente con ruolo trainer'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_check_trainer
  before insert or update of trainer_id, role on public.profiles
  for each row execute function public.check_profile_trainer();

-- ---------------------------------------------------------------------------
-- Funzioni d'aiuto per le regole RLS.
-- "security definer" = la funzione legge profiles con i permessi di chi l'ha creata,
-- altrimenti le regole di profiles richiamerebbero se stesse all'infinito.
-- ---------------------------------------------------------------------------
create function public.app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() = 'admin', false);
$$;

create function public.is_trainer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() = 'trainer', false);
$$;

-- Vero se lo studente indicato appartiene al formatore che fa la richiesta (RF-22).
create function public.is_my_student(student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = student_id
      and p.role = 'participant'
      and p.trainer_id = (select auth.uid())
  );
$$;

revoke execute on function public.app_role(), public.is_admin(), public.is_trainer(),
  public.is_my_student(uuid) from public, anon;
grant execute on function public.app_role(), public.is_admin(), public.is_trainer(),
  public.is_my_student(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Regole di accesso ai profili (RNF-11, RF-21, RF-22)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon;

-- Ognuno vede il proprio profilo; il formatore i propri studenti; l'amministratore tutti.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_admin()
    or (role = 'participant' and trainer_id = (select auth.uid()))
  );

-- Solo l'amministratore cambia ruoli e sposta studenti tra formatori.
-- La creazione dei profili la fa il backend (invito, RF-20).
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Informativa privacy (RNF-18)
-- ---------------------------------------------------------------------------
create table public.privacy_notices (
  version      text primary key,
  content      text not null,
  published_at timestamptz not null default now()
);

comment on table public.privacy_notices is
  'Versioni dell''informativa. Vale quella con published_at più recente (RNF-18).';

alter table public.privacy_notices enable row level security;
revoke all on table public.privacy_notices from anon;

create policy privacy_notices_select on public.privacy_notices
  for select to authenticated
  using (true);

create table public.privacy_acceptances (
  participant_id uuid not null references public.profiles (id) on delete cascade,
  notice_version text not null references public.privacy_notices (version),
  accepted_at    timestamptz not null default now(),
  source         text not null check (source in ('dashboard', 'visore')),
  primary key (participant_id, notice_version)
);

comment on table public.privacy_acceptances is
  'Chi ha accettato quale versione dell''informativa, quando e dove (RNF-18).';

alter table public.privacy_acceptances enable row level security;
revoke all on table public.privacy_acceptances from anon;

create policy privacy_acceptances_select on public.privacy_acceptances
  for select to authenticated
  using (
    participant_id = (select auth.uid())
    or public.is_admin()
    or public.is_my_student(participant_id)
  );

-- Il partecipante accetta per sé, dalla dashboard. Dal visore scrive il backend.
create policy privacy_acceptances_insert_own on public.privacy_acceptances
  for insert to authenticated
  with check (
    participant_id = (select auth.uid())
    and source = 'dashboard'
    and public.app_role() = 'participant'
  );

-- Versione corrente dell'informativa.
create function public.current_privacy_notice_version()
returns text
language sql
stable
set search_path = ''
as $$
  select n.version from public.privacy_notices n
  order by n.published_at desc
  limit 1;
$$;

-- Vero se il partecipante deve ancora accettare la versione corrente (RNF-18).
-- La usa l'abbinamento del visore (campo privacyRequired, docs/eventi-xapi.md).
create function public.privacy_required(student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_privacy_notice_version() is not null
     and not exists (
       select 1 from public.privacy_acceptances a
       where a.participant_id = student_id
         and a.notice_version = public.current_privacy_notice_version()
     );
$$;

revoke execute on function public.privacy_required(uuid) from public, anon, authenticated;
grant execute on function public.privacy_required(uuid) to service_role;
