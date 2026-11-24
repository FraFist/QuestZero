// Edge Function "pair": abbina il visore a una sessione con il codice di 6 cifre.
// Contratto: docs/eventi-xapi.md, sezione "Avvio sul visore". Requisiti: RNF-11, RNF-12, RNF-19.
// Non richiede il login di Supabase (verify_jwt = false in config.toml): il visore non ha
// un account, si identifica solo con il codice.

import { errorResponse, json, preflight, readJson } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const parsed = await readJson(req);
  const code = parsed.ok && typeof parsed.body === "object" && parsed.body !== null
    ? (parsed.body as Record<string, unknown>).pairingCode
    : undefined;
  if (typeof code !== "string" || !/^[0-9]{6}$/.test(code)) {
    return errorResponse(400, "bad_request", "pairingCode deve essere una stringa di 6 cifre");
  }

  const { data, error } = await adminClient().rpc("pair_device", { p_code: code });
  if (error) {
    console.error("pair_device:", error.message);
    return errorResponse(500, "server_error", "Errore interno, riprova");
  }

  if (data?.error === "invalid_code") {
    return errorResponse(404, "invalid_code", "Codice sbagliato, scaduto o già usato");
  }
  if (data?.error === "too_many_attempts") {
    return errorResponse(429, "too_many_attempts", "Troppi codici sbagliati, riprova tra qualche minuto");
  }

  // { sessionId, sessionToken, scenarioId, privacyRequired, privacyNoticeVersion }
  return json(data);
});
