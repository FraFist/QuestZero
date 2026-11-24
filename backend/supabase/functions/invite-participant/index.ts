// Edge Function "invite-participant": il formatore invita un nuovo studente.
// Requisiti: RF-20, RF-22, RNF-11, RNF-19.
// Richiede il login di Supabase (verify_jwt = true): la chiama la dashboard del formatore.
//
// Crea l'account con invito via email (lo studente sceglie la password dal link) e il profilo
// con ruolo participant, assegnato al formatore che invita. Nessuna registrazione libera.

import { errorResponse, json, preflight, readJson } from "../_shared/http.ts";
import { adminClient, userClient } from "../_shared/supabase.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PARTICIPANT_CODE = /^[A-Za-z0-9_-]{1,32}$/;

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
    return errorResponse(403, "forbidden", "Solo un formatore può invitare studenti");
  }

  // 2. Dati dello studente.
  const parsed = await readJson(req);
  const body = parsed.ok && typeof parsed.body === "object" && parsed.body !== null
    ? parsed.body as Record<string, unknown>
    : {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const participantCode = typeof body.participantCode === "string" ? body.participantCode.trim() : "";
  if (!EMAIL.test(email)) return errorResponse(400, "bad_request", "Email non valida");
  if (!PARTICIPANT_CODE.test(participantCode)) {
    return errorResponse(400, "bad_request",
      "Codice partecipante: da 1 a 32 caratteri tra lettere, cifre, - e _");
  }

  const { data: existing } = await db
    .from("profiles").select("id").eq("participant_code", participantCode).maybeSingle();
  if (existing) return errorResponse(409, "code_taken", "Codice partecipante già usato");

  // 3. Invito via email. Il link porta alla dashboard (DASHBOARD_URL, se impostato).
  const redirectTo = Deno.env.get("DASHBOARD_URL") ?? undefined;
  const { data: invited, error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (inviteError || !invited.user) {
    const already = inviteError?.message?.toLowerCase().includes("already");
    if (already) return errorResponse(409, "email_taken", "Esiste già un account con questa email");
    console.error("inviteUserByEmail:", inviteError?.message);
    return errorResponse(500, "server_error", "Invito non riuscito, riprova");
  }

  // 4. Profilo dello studente, assegnato a questo formatore (RF-22).
  const { error: profileError } = await db.from("profiles").insert({
    id: invited.user.id,
    role: "participant",
    participant_code: participantCode,
    trainer_id: auth.user.id,
  });
  if (profileError) {
    // Annulla l'account appena creato, così non resta un utente senza profilo.
    await db.auth.admin.deleteUser(invited.user.id);
    if (profileError.code === "23505") {
      return errorResponse(409, "code_taken", "Codice partecipante già usato");
    }
    console.error("profiles.insert:", profileError.message);
    return errorResponse(500, "server_error", "Invito non riuscito, riprova");
  }

  // Nessuna email nella risposta: basta l'id e il codice (RNF-19).
  return json({ participantId: invited.user.id, participantCode }, 201);
});
