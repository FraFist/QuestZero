-- Migrazione 2: catalogo degli scenari.
-- Requisiti: RNF-14, RNF-15, RF-18 (docs/requisiti.md); contratto: docs/eventi-xapi.md,
-- sezione "Catalogo dello scenario".
--
-- Il catalogo è il JSON scritto insieme allo scenario Unity. Il database ne controlla solo
-- la forma minima e non ne interpreta il contenuto: un nuovo scenario si pubblica inserendo
-- una riga, senza modificare backend o dashboard (RNF-14).

create table public.scenarios (
  scenario_id  text not null,
  version      text not null,
  name         text generated always as (catalog ->> 'name') stored,
  catalog      jsonb not null,
  published_at timestamptz not null default now(),

  primary key (scenario_id, version),

  -- Gli ID finiscono negli IRI xAPI (https://questzero.it/xapi/scenari/{scenarioId}).
  constraint scenarios_id_format
    check (scenario_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  constraint scenarios_version_format
    check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  -- Attenzione: un CHECK che vale NULL lascia passare la riga. Un campo mancante nel JSON
  -- dà NULL, quindi ogni controllo è avvolto in coalesce(..., false).

  -- Il JSON deve dire di essere proprio questo scenario e questa versione.
  constraint scenarios_catalog_matches_key
    check (coalesce(catalog ->> 'scenarioId' = scenario_id
                and catalog ->> 'scenarioVersion' = version, false)),
  -- Forma minima del catalogo (docs/eventi-xapi.md).
  constraint scenarios_catalog_shape
    check (coalesce(jsonb_typeof(catalog -> 'name') = 'string'
                and jsonb_typeof(catalog -> 'objectives') = 'array'
                and jsonb_typeof(catalog -> 'choices') = 'array'
                and jsonb_typeof(catalog -> 'errors') = 'array'
                and jsonb_typeof(catalog -> 'zones') = 'array'
                and jsonb_typeof(catalog -> 'passCriteria') = 'object', false))
);

comment on table public.scenarios is
  'Catalogo di ogni versione di scenario. Una versione pubblicata non si modifica (RNF-15).';
comment on column public.scenarios.catalog is
  'JSON del catalogo: obiettivi, scelte, errori, zone con etichette e passCriteria.';

-- Una versione pubblicata è immutabile: i tentativi passati devono restare leggibili con il
-- catalogo con cui sono stati svolti (RNF-15). Per cambiare si pubblica una nuova versione.
create function public.prevent_scenario_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Lo scenario % versione % è già pubblicato: pubblica una nuova versione',
    old.scenario_id, old.version
    using errcode = 'restrict_violation';
end;
$$;

create trigger scenarios_immutable
  before update on public.scenarios
  for each row execute function public.prevent_scenario_update();

-- ---------------------------------------------------------------------------
-- Regole di accesso
-- ---------------------------------------------------------------------------
alter table public.scenarios enable row level security;
revoke all on table public.scenarios from anon;

-- Tutti gli utenti autenticati leggono i cataloghi: servono per le etichette (RF-17, RF-21).
create policy scenarios_select on public.scenarios
  for select to authenticated
  using (true);

-- Solo l'amministratore pubblica nuovi scenari o nuove versioni.
create policy scenarios_insert_admin on public.scenarios
  for insert to authenticated
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Ultima versione di ogni scenario, per il menu della dashboard.
-- security_invoker: la vista rispetta le regole RLS di chi la legge.
-- ---------------------------------------------------------------------------
create view public.scenarios_latest
with (security_invoker = true)
as
select distinct on (s.scenario_id)
  s.scenario_id, s.version, s.name, s.catalog, s.published_at
from public.scenarios s
order by s.scenario_id, s.published_at desc;

revoke all on table public.scenarios_latest from anon;
