-- Migrazione 7: salvataggio degli eventi del visore.
-- Requisiti: RF-4, RF-12, RF-13, RF-14, RF-15, RF-16, RNF-9, RNF-18 (docs/requisiti.md);
-- contratto: docs/eventi-xapi.md (tipi di evento, sezione "Trasporto").
--
-- La chiama solo l'Edge Function "events", dopo aver controllato token e forma degli eventi.
-- p_items è un array di { "event": <evento come da contratto>, "statements": [<statement xAPI>] }.
--
-- Per ogni evento, in un'unica operazione: lo salva, aggiorna il tentativo, registra
-- l'informativa, mette in coda gli statement xAPI. Se qualcosa va storto si annulla solo
-- quell'evento, che finisce tra i "rejected"; gli altri proseguono.
-- Un eventId già salvato è un reinvio (RNF-9): finisce tra gli "accepted" senza rifare nulla.
--
-- Il backend non ricalcola indicatori ed esito: li salva come li manda il visore (RF-13, RF-14).

create function public.ingest_events(p_session_id uuid, p_items jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_participant_id uuid;
  v_item           jsonb;
  v_event          jsonb;
  v_payload        jsonb;
  v_event_id       uuid;
  v_attempt_id     uuid;
  v_inserted       uuid;
  v_rows           integer;
  v_accepted       jsonb := '[]'::jsonb;
  v_rejected       jsonb := '[]'::jsonb;
begin
  select s.participant_id into v_participant_id
  from public.sessions s where s.id = p_session_id;
  if v_participant_id is null then
    raise exception 'Sessione % inesistente', p_session_id using errcode = 'QZ404';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_event      := v_item -> 'event';
    v_payload    := coalesce(v_event -> 'payload', '{}'::jsonb);
    v_event_id   := null;
    v_inserted   := null;

    begin
      v_event_id   := (v_event ->> 'eventId')::uuid;
      v_attempt_id := (v_event ->> 'attemptId')::uuid;

      if (v_event ->> 'sessionId')::uuid is distinct from p_session_id then
        raise exception 'sessionId diverso da quello del token';
      end if;

      insert into public.events (event_id, session_id, attempt_id, seq, type, schema_version,
                                 occurred_at, scenario_id, scenario_version, payload)
      values (v_event_id, p_session_id, v_attempt_id, (v_event ->> 'seq')::integer,
              v_event ->> 'type', (v_event ->> 'schemaVersion')::integer,
              (v_event ->> 'timestamp')::timestamptz, v_event ->> 'scenarioId',
              v_event ->> 'scenarioVersion', v_payload)
      on conflict (event_id) do nothing
      returning event_id into v_inserted;

      if v_inserted is null then
        -- Reinvio di un evento già salvato: va bene solo se è della stessa sessione.
        if not exists (select 1 from public.events e
                       where e.event_id = v_event_id and e.session_id = p_session_id) then
          raise exception 'eventId già usato in un''altra sessione';
        end if;
        v_accepted := v_accepted || to_jsonb(v_event_id);
        continue;
      end if;

      case v_event ->> 'type'
        when 'privacy.accepted' then
          insert into public.privacy_acceptances (participant_id, notice_version, accepted_at, source)
          values (v_participant_id, v_payload ->> 'privacyNoticeVersion',
                  (v_event ->> 'timestamp')::timestamptz, 'visore')
          on conflict (participant_id, notice_version) do nothing;

        when 'scenario.started' then
          insert into public.attempts (id, session_id, attempt_number, scenario_id,
                                       scenario_version, client_version, started_at)
          values (v_attempt_id, p_session_id, (v_payload ->> 'attemptNumber')::integer,
                  v_event ->> 'scenarioId', v_event ->> 'scenarioVersion',
                  v_payload ->> 'clientVersion', (v_event ->> 'timestamp')::timestamptz);

        when 'objective.completed' then
          -- I totali sono cumulativi (contratto): greatest() tollera eventi arrivati in disordine.
          update public.attempts a
             set points_total         = greatest(a.points_total, (v_payload ->> 'pointsTotal')::integer),
                 objectives_completed = greatest(a.objectives_completed,
                                                 (v_payload ->> 'objectivesCompleted')::integer),
                 objectives_total     = (v_payload ->> 'objectivesTotal')::integer
           where a.id = v_attempt_id and a.session_id = p_session_id and a.ended_at is null;

        when 'choice.made' then
          update public.attempts a
             set points_total = greatest(a.points_total, (v_payload ->> 'pointsTotal')::integer)
           where a.id = v_attempt_id and a.session_id = p_session_id and a.ended_at is null;

        when 'error.committed', 'safety_distance.violated' then
          update public.attempts a
             set errors_total = greatest(a.errors_total, (v_payload ->> 'errorsTotal')::integer)
           where a.id = v_attempt_id and a.session_id = p_session_id and a.ended_at is null;

        when 'scenario.ended' then
          update public.attempts a
             set ended_at             = (v_event ->> 'timestamp')::timestamptz,
                 end_reason           = v_payload ->> 'reason',
                 outcome              = v_payload ->> 'outcome',
                 errors_total         = (v_payload -> 'indicators' ->> 'errors')::integer,
                 completion_time_ms   = (v_payload -> 'indicators' ->> 'completionTimeMs')::integer,
                 sequence_respected   = (v_payload -> 'indicators' ->> 'sequenceRespected')::boolean,
                 points_total         = (v_payload ->> 'pointsTotal')::integer,
                 level                = (v_payload ->> 'level')::integer,
                 objectives_completed = (v_payload ->> 'objectivesCompleted')::integer,
                 objectives_total     = (v_payload ->> 'objectivesTotal')::integer
           where a.id = v_attempt_id and a.session_id = p_session_id and a.ended_at is null;
          get diagnostics v_rows = row_count;
          if v_rows = 0 then
            raise exception 'Tentativo % sconosciuto o già concluso', v_attempt_id;
          end if;
      end case;

      insert into public.xapi_outbox (event_id, statement_id, statement)
      select v_event_id, (st ->> 'id')::uuid, st
      from jsonb_array_elements(coalesce(v_item -> 'statements', '[]'::jsonb)) st;

      v_accepted := v_accepted || to_jsonb(v_event_id);

    exception when others then
      -- Annulla solo questo evento (comprese le modifiche ai tentativi) e prosegue.
      v_rejected := v_rejected || jsonb_build_object(
        'eventId', coalesce(v_event_id::text, v_event ->> 'eventId'),
        'reason', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('accepted', v_accepted, 'rejected', v_rejected);
end;
$$;

revoke execute on function public.ingest_events(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_events(uuid, jsonb) to service_role;
