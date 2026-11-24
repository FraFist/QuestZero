-- Migrazione 6: viste e funzioni di lettura per la dashboard.
-- Requisiti: RF-17, RF-18, RF-21, RF-22, RNF-14 (docs/requisiti.md).
--
-- Le etichette arrivano sempre dal catalogo dello scenario: la dashboard non ne contiene
-- (RNF-14). Le viste usano security_invoker, quindi valgono le regole RLS di chi le legge.

-- ---------------------------------------------------------------------------
-- Etichetta di un codice nel catalogo.
-- p_kind: 'objectives', 'choices', 'errors' (chiave "code") o 'zones' (chiave "id").
-- Cerca prima nella versione indicata; se manca, nell'ultima versione che contiene il codice.
-- Codice sconosciuto: null (la dashboard mostra il codice grezzo, come da contratto).
-- ---------------------------------------------------------------------------
create function public.catalog_label(p_scenario_id text, p_version text, p_kind text, p_code text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select item ->> 'label'
     from public.scenarios s,
          jsonb_array_elements(case when jsonb_typeof(s.catalog -> p_kind) = 'array'
                                    then s.catalog -> p_kind else '[]'::jsonb end) item
     where s.scenario_id = p_scenario_id
       and s.version = p_version
       and item ->> (case when p_kind = 'errors' then 'code' else 'id' end) = p_code
     limit 1),
    (select item ->> 'label'
     from public.scenarios s,
          jsonb_array_elements(case when jsonb_typeof(s.catalog -> p_kind) = 'array'
                                    then s.catalog -> p_kind else '[]'::jsonb end) item
     where s.scenario_id = p_scenario_id
       and item ->> (case when p_kind = 'errors' then 'code' else 'id' end) = p_code
     order by s.published_at desc
     limit 1)
  );
$$;

revoke execute on function public.catalog_label(text, text, text, text) from public, anon;
grant execute on function public.catalog_label(text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tentativi con studente e nome dello scenario (RF-17 per il formatore, RF-21 per lo studente).
-- ---------------------------------------------------------------------------
create view public.attempt_overview
with (security_invoker = true)
as
select
  a.id                   as attempt_id,
  a.session_id,
  s.participant_id,
  s.trainer_id,
  p.participant_code,
  a.attempt_number,
  a.scenario_id,
  a.scenario_version,
  coalesce(sc.name, scl.name) as scenario_name,
  a.started_at,
  a.ended_at,
  a.end_reason,
  a.outcome,
  a.errors_total,
  a.points_total,
  a.level,
  a.completion_time_ms,
  a.sequence_respected,
  a.objectives_completed,
  a.objectives_total
from public.attempts a
join public.sessions s on s.id = a.session_id
left join public.profiles p on p.id = s.participant_id
left join public.scenarios sc
  on sc.scenario_id = a.scenario_id and sc.version = a.scenario_version
left join public.scenarios_latest scl on scl.scenario_id = a.scenario_id;

comment on view public.attempt_overview is
  'Un tentativo per riga con codice studente e nome scenario. Segue le regole RLS (RF-17, RF-21).';

-- ---------------------------------------------------------------------------
-- Errori e violazioni di zona di ogni tentativo, con etichetta (RF-17, RF-21).
-- ---------------------------------------------------------------------------
create view public.attempt_errors
with (security_invoker = true)
as
select
  e.event_id,
  e.session_id,
  e.attempt_id,
  e.occurred_at,
  x.kind,
  x.code,
  e.payload ->> 'relatedChoiceId' as related_choice_id,
  public.catalog_label(e.scenario_id, e.scenario_version,
                       case x.kind when 'error' then 'errors' else 'zones' end,
                       x.code) as label
from public.events e
cross join lateral (
  select
    case e.type when 'error.committed' then 'error' else 'zone' end as kind,
    case e.type when 'error.committed' then e.payload ->> 'errorCode'
                else e.payload ->> 'zoneId' end as code
) x
where e.type in ('error.committed', 'safety_distance.violated');

comment on view public.attempt_errors is
  'Errori (errorCode) e violazioni di zona (zoneId) per tentativo, con etichetta dal catalogo.';

revoke all on table public.attempt_overview, public.attempt_errors from anon;

-- ---------------------------------------------------------------------------
-- Errori più frequenti di uno scenario, su TUTTE le sessioni (RF-18).
-- Restituisce solo conteggi, nessun dato di studenti o sessioni: per questo il formatore
-- può vederla anche se include le sessioni di altri formatori (RF-22).
-- Conta insieme gli errorCode e gli zoneId (contratto 0.3).
-- ---------------------------------------------------------------------------
create function public.frequent_errors(p_scenario_id text)
returns table (kind text, code text, label text, occurrences integer, sessions integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (public.is_trainer() or public.is_admin()) then
    raise exception 'Solo formatori e amministratori vedono gli errori più frequenti'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    x.kind,
    x.code,
    public.catalog_label(p_scenario_id, null,
                         case x.kind when 'error' then 'errors' else 'zones' end,
                         x.code),
    count(*)::integer,
    count(distinct e.session_id)::integer
  from public.events e
  cross join lateral (
    select
      case e.type when 'error.committed' then 'error' else 'zone' end as kind,
      case e.type when 'error.committed' then e.payload ->> 'errorCode'
                  else e.payload ->> 'zoneId' end as code
  ) x
  where e.scenario_id = p_scenario_id
    and e.type in ('error.committed', 'safety_distance.violated')
    and x.code is not null
  group by x.kind, x.code
  order by count(*) desc, x.code;
end;
$$;

revoke execute on function public.frequent_errors(text) from public, anon;
grant execute on function public.frequent_errors(text) to authenticated;
