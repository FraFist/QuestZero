// Edge Function "invite-participant": il formatore registra un nuovo studente.
// Requisiti: RF-20, RF-22, RNF-11, RNF-19.
// Richiede il login di Supabase (verify_jwt = true): la chiama la dashboard del formatore.
//
// Corpo: { "participantCode": "P-0042", "email": "facoltativa@esempio.it" }
// - Con l'email: crea l'account con invito via email (lo studente sceglie la password dal link
//   e potrà consultare i propri risultati, RF-21).
// - Senza email: crea l'account con un indirizzo fittizio che non riceve nulla
//   (dominio riservato .invalid). Nessuna email parte; lo studente non può fare il login,
//   ma il formatore può subito creare sessioni con il suo codice (RF-20, contratto 0.7).
// In entrambi i casi il profilo ha ruolo participant ed è assegnato al formatore (RF-22).
// Nessuna registrazione libera.

import { errorResponse, json, preflight, readJson } from "../_shared/http.ts";
import { adminClient, userClient } from "../_shared/supabase.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PARTICIPANT_CODE = /^[A-Za-z0-9_-]{1,32}$/;
// Dominio riservato (RFC 2606): nessuna email può arrivarci.
const NO_EMAIL_DOMAIN = "partecipanti.questzero.invalid";

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  // 1. Chi chiama deve essere un formatore.
  const authorization = req.headers.get("Authorization");
  if (!authorization) return errorResponse(401, "unauthorized", "Accesso richiesto");
  const { data: auth, error: authError } = await userClient(authorization).auth.getUser();
  if (authError || !auth.user) return errorResponse(401, "unauthorized", "Accesso richiesto");

  const db = adminClient();
  const { data: caller } = await db
    .from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (caller?.role !== "trainer") {
    return errorResponse(403, "forbidden", "Solo un formatore può registrare studenti");
  }

  // 2. Dati dello studente: codice obbligatorio, email facoltativa.
  const parsed = await readJson(req);
  const body = parsed.ok && typeof parsed.body === "object" && parsed.body !== null
    ? parsed.body as Record<string, unknown>
    : {};
  const participantCode = typeof body.participantCode === "string" ? body.participantCode.trim() : "";
  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!PARTICIPANT_CODE.test(participantCode)) {
    return errorResponse(400, "bad_request",
      "Codice partecipante: da 1 a 32 caratteri tra lettere, cifre, - e _");
  }
  if (rawEmail && (!EMAIL.test(rawEmail) || rawEmail.endsWith(`@${NO_EMAIL_DOMAIN}`))) {
    return errorResponse(400, "bad_request", "Email non valida");
  }

  const { data: existing } = await db
    .from("profiles").select("id").eq("participant_code", participantCode).maybeSingle();
  if (existing) return errorResponse(409, "code_taken", "Codice partecipante già usato");

  // 3. Account: con invito via email, oppure senza email.
  let userId: string;
  if (rawEmail) {
    const redirectTo = Deno.env.get("DASHBOARD_URL") ?? undefined;
    const { data, error } = await db.auth.admin.inviteUserByEmail(rawEmail, { redirectTo });
    if (error || !data.user) {
      if (error?.message?.toLowerCase().includes("already")) {
        return errorResponse(409, "email_taken", "Esiste già un account con questa email");
      }
      console.error("inviteUserByEmail:", error?.message);
      return errorResponse(500, "server_error", "Invito non riuscito, riprova");
    }
    userId = data.user.id;
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: `${crypto.randomUUID()}@${NO_EMAIL_DOMAIN}`,
      email_confirm: true, // nessuna email di conferma
    });
    if (error || !data.user) {
      console.error("createUser:", error?.message);
      return errorResponse(500, "server_error", "Registrazione non riuscita, riprova");
    }
    userId = data.user.id;
  }

  // 4. Profilo dello studente, assegnato a questo formatore (RF-22).
  const { error: profileError } = await db.from("profiles").insert({
    id: userId,
    role: "participant",
    participant_code: participantCode,
    trainer_id: auth.user.id,
  });
  if (profileError) {
    // Annulla l'account appena creato, così non resta un utente senza profilo.
    await db.auth.admin.deleteUser(userId);
    if (profileError.code === "23505") {
      return errorResponse(409, "code_taken", "Codice partecipante già usato");
    }
    console.error("profiles.insert:", profileError.message);
    return errorResponse(500, "server_error", "Registrazione non riuscita, riprova");
  }

  // Nessuna email nella risposta: basta l'id e il codice (RNF-19).
  return json({ participantId: userId, participantCode, invited: Boolean(rawEmail) }, 201);
});
