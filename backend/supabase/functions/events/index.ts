// Edge Function "events": riceve gli eventi del visore e li salva.
// Contratto: docs/eventi-xapi.md, sezione "Trasporto". Requisiti: RF-12, RF-15, RF-16,
// RNF-9, RNF-11, RNF-12, RNF-13.
// Non richiede il login di Supabase (verify_jwt = false in config.toml): il visore si
// identifica con il token ricevuto all'abbinamento.

import { validateEvent, type VrEvent } from "../_shared/contract.ts";
import { bearerToken, errorResponse, json, preflight, readJson } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";
import { buildStatements } from "../_shared/xapi.ts";

const MAX_EVENTS = 100;

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const db = adminClient();

  // 1. Token del visore → sessione (401 se manca, è sbagliato o è scaduto).
  const token = bearerToken(req);
  if (!token) return errorResponse(401, "invalid_token", "Token mancante");
  const { data: sessionId, error: tokenError } = await db.rpc("session_for_token", {
    p_token: token,
  });
  if (tokenError) {
    console.error("session_for_token:", tokenError.message);
    return errorResponse(500, "server_error", "Errore interno, riprova");
  }
  if (!sessionId) {
    return errorResponse(401, "invalid_token", "Token sbagliato o scaduto: serve un nuovo codice");
  }

  // 2. Corpo: array di 1–100 eventi.
  const parsed = await readJson(req);
  if (!parsed.ok || !Array.isArray(parsed.body) || parsed.body.length === 0) {
    return errorResponse(400, "bad_request", "Il corpo deve essere un array JSON di eventi");
  }
  const raw = parsed.body as unknown[];
  if (raw.length > MAX_EVENTS) {
    return errorResponse(413, "too_many_events", `Al massimo ${MAX_EVENTS} eventi per richiesta`);
  }

  // 3. Nessun evento può dichiarare un'altra sessione (403).
  const otherSession = raw.some((e) =>
    typeof e === "object" && e !== null &&
    typeof (e as Record<string, unknown>).sessionId === "string" &&
    (e as Record<string, unknown>).sessionId !== sessionId
  );
  if (otherSession) {
    return errorResponse(403, "session_mismatch", "Un evento appartiene a un'altra sessione");
  }

  // 4. Dati per gli statement xAPI: codice partecipante (mai l'email, RNF-19) e nomi scenario.
  const { data: session, error: sessionError } = await db
    .from("sessions")
    .select("participant_id, profiles!sessions_participant_id_fkey(participant_code)")
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) {
    console.error("sessione:", sessionError?.message);
    return errorResponse(500, "server_error", "Errore interno, riprova");
  }
  // deno-lint-ignore no-explicit-any
  const participantCode = (session as any).profiles?.participant_code as string;

  // 5. Controllo di ogni evento secondo il contratto.
  const rejected: { eventId: string | null; reason: string }[] = [];
  const valid: VrEvent[] = [];
  for (const item of raw) {
    const result = validateEvent(item);
    if (result.ok) valid.push(result.event);
    else rejected.push({ eventId: result.eventId, reason: result.reason });
  }

  const scenarioNames = await loadScenarioNames(db, valid);

  const items = valid.map((event) => ({
    event,
    statements: buildStatements(event, {
      participantCode,
      scenarioName: scenarioNames.get(`${event.scenarioId}@${event.scenarioVersion}`) ??
        scenarioNames.get(event.scenarioId),
    }),
  }));

  // 6. Salvataggio: ogni evento è salvato o rifiutato da solo (ingest_events, migrazione 7).
  let accepted: string[] = [];
  if (items.length > 0) {
    const { data, error } = await db.rpc("ingest_events", {
      p_session_id: sessionId,
      p_items: items,
    });
    if (error) {
      console.error("ingest_events:", error.message);
      return errorResponse(500, "server_error", "Errore interno, riprova");
    }
    accepted = data.accepted;
    rejected.push(...data.rejected);
  }

  return json({ accepted, rejected });
});

// Nome di ogni scenario: per versione esatta e, in mancanza, dall'ultima versione pubblicata.
async function loadScenarioNames(
  db: ReturnType<typeof adminClient>,
  events: VrEvent[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(events.map((e) => e.scenarioId))];
  if (ids.length === 0) return names;

  const { data, error } = await db
    .from("scenarios")
    .select("scenario_id, version, name, published_at")
    .in("scenario_id", ids)
    .order("published_at", { ascending: true });
  if (error) {
    console.error("scenarios:", error.message);
    return names;
  }
  for (const row of data ?? []) {
    names.set(`${row.scenario_id}@${row.version}`, row.name);
    names.set(row.scenario_id, row.name); // l'ultima versione sovrascrive le precedenti
  }
  return names;
}
