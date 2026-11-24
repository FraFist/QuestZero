// Test completo contro Supabase locale (serve `npm start` acceso): formatore, invito,
// sessione, abbinamento del visore, invio eventi, tentativo, coda xAPI.
// Requisiti: RF-11, RF-12, RF-14, RF-15, RF-20, RF-22, RNF-9, RNF-11, RNF-13, RNF-19.
// Contratto: docs/eventi-xapi.md (bozza 0.5).
// Crea utenti di prova con nomi unici e li cancella alla fine.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient } from "npm:@supabase/supabase-js@2";

// --- Indirizzi e chiavi del Supabase locale, letti da `supabase status` ---------------------
async function localEnv(): Promise<Record<string, string>> {
  const windows = Deno.build.os === "windows";
  const command = new Deno.Command(windows ? "cmd" : "npx", {
    args: windows ? ["/c", "npx", "supabase", "status", "-o", "env"] : ["supabase", "status", "-o", "env"],
    stdout: "piped",
    stderr: "null",
  });
  const { stdout } = await command.output();
  const env: Record<string, string> = {};
  for (const line of new TextDecoder().decode(stdout).split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="(.*)"$/);
    if (match) env[match[1]] = match[2];
  }
  if (!env.API_URL) throw new Error("Supabase locale non raggiungibile: avvialo con `npm start`");
  return env;
}

const env = await localEnv();
const API = env.API_URL;
const ANON = env.ANON_KEY;
const MAILPIT = env.MAILPIT_URL ?? env.INBUCKET_URL;
const admin = createClient(API, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const run = crypto.randomUUID().slice(0, 8);
const trainerEmail = `formatore-${run}@test.local`;
const studentEmail = `studente-${run}@test.local`;
const participantCode = `T-${run}`;

async function call(fn: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${API}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

Deno.test({
  name: "flusso completo: invito, sessione, abbinamento, eventi, tentativo, xAPI",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    let trainerId = "";
    let studentId = "";
    try {
      // --- Formatore di prova -------------------------------------------------------------
      const password = crypto.randomUUID();
      const created = await admin.auth.admin.createUser({
        email: trainerEmail, password, email_confirm: true,
      });
      trainerId = created.data.user!.id;
      await admin.from("profiles").insert({ id: trainerId, role: "trainer" });

      const trainer = createClient(API, ANON, { auth: { persistSession: false } });
      const { data: login } = await trainer.auth.signInWithPassword({ email: trainerEmail, password });
      const trainerAuth = { Authorization: `Bearer ${login.session!.access_token}` };

      // --- Invito dello studente (RF-20) --------------------------------------------------
      await t.step("RF-20: il formatore invita uno studente", async () => {
        const res = await call("invite-participant", { email: studentEmail, participantCode }, trainerAuth);
        assertEquals(res.status, 201, JSON.stringify(res.body));
        assertEquals(res.body.participantCode, participantCode);
        assert(!JSON.stringify(res.body).includes("@"), "RNF-19: nessuna email nella risposta");
        studentId = res.body.participantId;

        const { data: profile } = await admin.from("profiles")
          .select("role, trainer_id").eq("id", studentId).single();
        assertEquals(profile, { role: "participant", trainer_id: trainerId });
      });

      await t.step("RF-20: l'email di invito arriva (Mailpit locale)", async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${studentEmail}"`)}`);
        const found = await res.json();
        assert(found.messages_count >= 1 || found.total >= 1, "email di invito non trovata");
      });

      await t.step("RF-20: codice già usato → 409, email non valida → 400, senza login → 401", async () => {
        assertEquals((await call("invite-participant",
          { email: `altro-${run}@test.local`, participantCode }, trainerAuth)).status, 409);
        assertEquals((await call("invite-participant",
          { email: "non-una-email", participantCode: `X-${run}` }, trainerAuth)).status, 400);
        assertEquals((await call("invite-participant",
          { email: `altro-${run}@test.local`, participantCode: `X-${run}` })).status, 401);
      });

      // --- Sessione e codice di abbinamento (RF-11) ---------------------------------------
      const { data: session, error: sessionError } = await trainer.from("sessions")
        .insert({ participant_id: studentId, trainer_id: trainerId, scenario_id: "incendio-magazzino" })
        .select("id").single();
      assertEquals(sessionError, null);
      const sessionId = session!.id as string;

      const { data: codes } = await trainer.rpc("create_pairing_code", { p_session_id: sessionId });
      const pairingCode = codes![0].pairing_code as string;

      // --- Abbinamento del visore ---------------------------------------------------------
      let sessionToken = "";
      await t.step("abbinamento: formato sbagliato 400, codice sbagliato 404, giusto 200", async () => {
        assertEquals((await call("pair", { pairingCode: "12" })).status, 400);
        const wrong = pairingCode === "000000" ? "000001" : "000000";
        assertEquals((await call("pair", { pairingCode: wrong })).status, 404);

        const res = await call("pair", { pairingCode, clientVersion: "0.3.0" });
        assertEquals(res.status, 200, JSON.stringify(res.body));
        assertEquals(res.body.sessionId, sessionId);
        assertEquals(res.body.scenarioId, "incendio-magazzino");
        assertEquals(res.body.privacyRequired, true);
        assert(!JSON.stringify(res.body).includes(participantCode), "RNF-19: niente codice studente");
        sessionToken = res.body.sessionToken;
      });
      const visore = { Authorization: `Bearer ${sessionToken}` };

      // --- Eventi di un tentativo completo ------------------------------------------------
      const attemptId = crypto.randomUUID();
      let seq = 0;
      const ev = (type: string, payload: Record<string, unknown>, attempt: string | null = attemptId) => ({
        schemaVersion: 1,
        eventId: crypto.randomUUID(),
        sessionId,
        attemptId: attempt,
        seq: ++seq,
        type,
        timestamp: new Date(Date.UTC(2026, 11, 10, 10, 0, seq)).toISOString(),
        scenarioId: "incendio-magazzino",
        scenarioVersion: "1.0.0",
        payload,
      });

      const first = [
        ev("privacy.accepted", { privacyNoticeVersion: "2026-12-01" }, null),
        ev("scenario.started", { attemptNumber: 1, clientVersion: "0.3.0" }),
        ev("objective.completed", {
          objectiveId: "dare-allarme", objectivesCompleted: 1, objectivesTotal: 5,
          pointsAwarded: 10, pointsTotal: 10,
        }),
        ev("choice.made", {
          choiceId: "tipo-estintore", optionId: "acqua", correct: false, pointsAwarded: 0, pointsTotal: 10,
        }),
        ev("error.committed", {
          errorCode: "estintore-acqua-su-quadro-elettrico", relatedChoiceId: "tipo-estintore", errorsTotal: 1,
        }),
      ];
      const withPosition = ev("safety_distance.violated", {
        zoneId: "zona-fumo-denso", errorsTotal: 2, position: { x: 1, y: 2, z: 3 },
      });

      await t.step("RF-12: il primo pacchetto è salvato, l'evento con la posizione no (RNF-13)", async () => {
        const res = await call("events", [...first, withPosition], visore);
        assertEquals(res.status, 200, JSON.stringify(res.body));
        assertEquals(res.body.accepted.length, 5);
        assertEquals(res.body.rejected.length, 1);
        assertEquals(res.body.rejected[0].eventId, withPosition.eventId);
        assert(res.body.rejected[0].reason.includes("RNF-13"));
      });

      seq = withPosition.seq - 1; // il visore riusa il seq dell'evento scartato
      const second = [
        ev("safety_distance.violated", { zoneId: "zona-fumo-denso", errorsTotal: 2 }),
        ev("scenario.ended", {
          reason: "completed",
          indicators: { errors: 2, completionTimeMs: 412300, sequenceRespected: true },
          outcome: "passed", pointsTotal: 85, level: 3, objectivesCompleted: 5, objectivesTotal: 5,
        }),
      ];

      await t.step("RF-14: fine del tentativo salvata, il reinvio non duplica (RNF-9)", async () => {
        assertEquals((await call("events", second, visore)).body.accepted.length, 2);
        const again = await call("events", second, visore);
        assertEquals(again.body, { accepted: second.map((e) => e.eventId), rejected: [] });

        const { data: attempt } = await admin.from("attempts")
          .select("end_reason, outcome, errors_total, points_total, level, completion_time_ms")
          .eq("id", attemptId).single();
        assertEquals(attempt, {
          end_reason: "completed", outcome: "passed", errors_total: 2, points_total: 85, level: 3,
          completion_time_ms: 412300,
        });
        const { count } = await admin.from("events")
          .select("*", { count: "exact", head: true }).eq("session_id", sessionId);
        assertEquals(count, 7);
      });

      await t.step("RNF-18: l'accettazione dal visore è registrata", async () => {
        const { data } = await admin.from("privacy_acceptances")
          .select("source").eq("participant_id", studentId);
        assertEquals(data, [{ source: "visore" }]);
      });

      await t.step("RF-15: statement in coda con il codice studente, mai l'email (RNF-19)", async () => {
        const ids = [...first, ...second].map((e) => e.eventId);
        const { data } = await admin.from("xapi_outbox").select("statement").in("event_id", ids);
        // started 1 + objective 2 + choice 1 + error 1 + zone 1 + ended 1 (privacy: nessuno)
        assertEquals(data!.length, 7);
        for (const row of data!) {
          assertEquals(row.statement.actor.account.name, participantCode);
          assert(!JSON.stringify(row.statement).includes(studentEmail));
        }
      });

      await t.step("RF-17: il formatore vede il tentativo del proprio studente", async () => {
        const { data } = await trainer.from("attempt_overview")
          .select("participant_code, outcome, scenario_name").eq("attempt_id", attemptId);
        assertEquals(data, [{
          participant_code: participantCode, outcome: "passed",
          scenario_name: "Emergenza incendio in magazzino",
        }]);
      });

      // --- Errori sull'intera richiesta (contratto 0.5) -----------------------------------
      await t.step("401 token sbagliato, 403 altra sessione, 413 troppi eventi, 400 corpo errato", async () => {
        assertEquals((await call("events", second, { Authorization: "Bearer inventato" })).status, 401);
        assertEquals((await call("events", [{ ...second[0], sessionId: crypto.randomUUID() }], visore)).status, 403);
        assertEquals((await call("events", Array(101).fill(second[0]), visore)).status, 413);
        assertEquals((await call("events", { non: "un array" }, visore)).status, 400);
        assertEquals((await call("events", [], visore)).status, 400);
      });
    } finally {
      // Pulizia: lo studente si porta via sessioni, eventi e tentativi; poi il formatore.
      if (studentId) await admin.auth.admin.deleteUser(studentId);
      if (trainerId) await admin.auth.admin.deleteUser(trainerId);
    }
  },
});
