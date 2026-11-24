// Edge Function "xapi-sender": invia all'LRS gli statement in coda (xapi_outbox).
// Requisiti: RF-15, RNF-5. Contratto: docs/eventi-xapi.md, "Mappatura in xAPI".
//
// La chiama ogni minuto il database (pg_cron, migrazione 8), mai i client.
// Accetta solo chiamate con la chiave service role (verify_jwt = false in config.toml,
// il controllo è qui sotto).
//
// Configurazione (variabili d'ambiente, mai nel codice):
//   LRS_ENDPOINT  es. https://lrs.esempio.it/xapi  (senza /statements)
//   LRS_KEY, LRS_SECRET  credenziali Basic dell'LRS
// Se manca LRS_ENDPOINT la funzione non fa nulla: gli statement restano in coda.

import { errorResponse, json, preflight } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

const BATCH_SIZE = 50;
const TIMEOUT_MS = 15_000;
const XAPI_VERSION = "1.0.3";

interface Queued {
  id: number;
  statement_id: string;
  // deno-lint-ignore no-explicit-any
  statement: Record<string, any>;
}

type SendResult = { ok: true } | { ok: false; status: number; error: string };

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  // Solo il database (con la chiave service role) può avviare l'invio.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey || req.headers.get("Authorization") !== `Bearer ${serviceKey}`) {
    return errorResponse(401, "unauthorized", "Chiamata non autorizzata");
  }

  const endpoint = Deno.env.get("LRS_ENDPOINT")?.replace(/\/+$/, "");
  if (!endpoint) return json({ skipped: "LRS non configurato", claimed: 0 });
  const auth = "Basic " + btoa(`${Deno.env.get("LRS_KEY") ?? ""}:${Deno.env.get("LRS_SECRET") ?? ""}`);

  const db = adminClient();
  const { data, error } = await db.rpc("claim_xapi_batch", { p_limit: BATCH_SIZE });
  if (error) {
    console.error("claim_xapi_batch:", error.message);
    return errorResponse(500, "server_error", "Lettura della coda non riuscita");
  }
  const queued = (data ?? []) as Queued[];
  if (queued.length === 0) return json({ claimed: 0, sent: 0, failed: 0 });

  // L'id dello statement è quello della coda: l'LRS riconosce i reinvii (RF-15).
  const statements = queued.map((q) => ({ ...q.statement, id: q.statement_id }));

  const sent: number[] = [];
  const failed: { id: number; error: string }[] = [];

  // 1. Tutto il gruppo in una sola richiesta.
  const batch = await send(`${endpoint}/statements`, "POST", auth, statements);
  if (batch.ok) {
    sent.push(...queued.map((q) => q.id));
  } else if (batch.status === 400 || batch.status === 409) {
    // 2. L'LRS ha rifiutato il gruppo per colpa di almeno uno statement:
    //    si mandano uno alla volta, così gli altri passano e quello sbagliato resta in coda.
    for (const [i, q] of queued.entries()) {
      const url = `${endpoint}/statements?statementId=${encodeURIComponent(q.statement_id)}`;
      const one = await send(url, "PUT", auth, statements[i]);
      // 409 = l'LRS ha già uno statement con questo id: è già arrivato.
      if (one.ok || one.status === 409) sent.push(q.id);
      else failed.push({ id: q.id, error: one.error });
    }
  } else {
    // 3. LRS irraggiungibile, credenziali sbagliate o errore del server: si riprova più tardi.
    failed.push(...queued.map((q) => ({ id: q.id, error: batch.error })));
  }

  if (sent.length > 0) {
    const { error: sentError } = await db.rpc("mark_xapi_sent", { p_ids: sent });
    if (sentError) console.error("mark_xapi_sent:", sentError.message);
  }
  for (const f of failed) {
    const { error: failError } = await db.rpc("mark_xapi_failed", { p_id: f.id, p_error: f.error });
    if (failError) console.error("mark_xapi_failed:", failError.message);
  }

  return json({ claimed: queued.length, sent: sent.length, failed: failed.length });
});

async function send(url: string, method: string, auth: string, body: unknown): Promise<SendResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Experience-API-Version": XAPI_VERSION,
        Authorization: auth,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    if (response.ok) return { ok: true };
    return { ok: false, status: response.status, error: `LRS ${response.status}: ${text.slice(0, 500)}` };
  } catch (error) {
    return { ok: false, status: 0, error: `LRS non raggiungibile: ${(error as Error).message}` };
  }
}
