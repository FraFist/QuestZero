// Test completo dell'invio all'LRS (prova P-4): eventi del visore → coda → xapi-sender → LRS.
// Serve Supabase locale acceso (`npm start`) e l'LRS di prova (`npm run lrs:start`), con
// supabase/functions/.env copiato da .env.example.
// Requisiti: RF-15, RNF-5, RNF-19.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient } from "npm:@supabase/supabase-js@2";

const LRS = "http://127.0.0.1:44380/xapi";
const LRS_AUTH = "Basic " + btoa("questzero-locale:solo-per-test-locali");

async function localEnv(): Promise<Record<string, string>> {
  const windows = Deno.build.os === "windows";
  const { stdout } = await new Deno.Command(windows ? "cmd" : "npx", {
    args: windows ? ["/c", "npx", "supabase", "status", "-o", "env"] : ["supabase", "status", "-o", "env"],
    stdout: "piped",
    stderr: "null",
  }).output();
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
const SERVICE = env.SERVICE_ROLE_KEY;
const admin = createClient(API, SERVICE, { auth: { persistSession: false } });

async function post(fn: string, body: unknown, auth: string) {
  const response = await fetch(`${API}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: auth },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function lrsStatements(query: string) {
  const response = await fetch(`${LRS}/statements?${query}`, {
    headers: { Authorization: LRS_AUTH, "X-Experience-API-Version": "1.0.3" },
  });
  assertEquals(response.status, 200, "LRS di prova non raggiungibile: `npm run lrs:start`");
  return (await response.json()).statements as Record<string, any>[];
}

Deno.test({
  name: "P-4: gli statement di un tentativo arrivano all'LRS di prova",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const run = crypto.randomUUID().slice(0, 8);
    const participantCode = `X-${run}`;
    const ids: string[] = [];
    try {
      // --- Formatore e studente di prova, sessione, abbinamento --------------------------
      const password = crypto.randomUUID();
      const trainerUser = await admin.auth.admin.createUser({
        email: `formatore-${run}@test.local`, password, email_confirm: true,
      });
      const studentUser = await admin.auth.admin.createUser({
        email: `studente-${run}@test.local`, email_confirm: true,
      });
      const trainerId = trainerUser.data.user!.id;
      const studentId = studentUser.data.user!.id;
      ids.push(studentId, trainerId);
      await admin.from("profiles").insert({ id: trainerId, role: "trainer" });
      await admin.from("profiles").insert({
        id: studentId, role: "participant", participant_code: participantCode, trainer_id: trainerId,
      });

      const trainer = createClient(API, ANON, { auth: { persistSession: false } });
      await trainer.auth.signInWithPassword({ email: `formatore-${run}@test.local`, password });
      const { data: session } = await trainer.from("sessions")
        .insert({ participant_id: studentId, trainer_id: trainerId, scenario_id: "incendio-magazzino" })
        .select("id").single();
      const sessionId = session!.id as string;
      const { data: codes } = await trainer.rpc("create_pairing_code", { p_session_id: sessionId });
      const paired = await post("pair", { pairingCode: codes![0].pairing_code }, `Bearer ${ANON}`);
      const visore = `Bearer ${paired.body.sessionToken}`;

      // --- Un tentativo breve con un errore -----------------------------------------------
      const attemptId = crypto.randomUUID();
      let seq = 0;
      const ev = (type: string, payload: Record<string, unknown>) => ({
        schemaVersion: 1, eventId: crypto.randomUUID(), sessionId, attemptId, seq: ++seq, type,
        timestamp: new Date(Date.UTC(2026, 11, 10, 11, 0, seq)).toISOString(),
        scenarioId: "incendio-magazzino", scenarioVersion: "1.0.0", payload,
      });
      const events = [
        ev("scenario.started", { attemptNumber: 1 }),
        ev("error.committed", { errorCode: "estintore-acqua-su-quadro-elettrico", errorsTotal: 1 }),
        ev("scenario.ended", {
          reason: "completed",
          indicators: { errors: 1, completionTimeMs: 412300, sequenceRespected: true },
          outcome: "passed", pointsTotal: 85, level: 3, objectivesCompleted: 5, objectivesTotal: 5,
        }),
      ];
      const sent = await post("events", events, visore);
      assertEquals(sent.body.accepted.length, 3, JSON.stringify(sent.body));

      // Uno statement volutamente sbagliato (verbo senza IRI) nella stessa coda.
      const { data: bad } = await admin.from("xapi_outbox").insert({
        event_id: events[0].eventId,
        statement: {
          actor: { objectType: "Agent", account: { homePage: "https://questzero.it", name: participantCode } },
          verb: { id: "non-un-iri" },
          object: { id: "https://questzero.it/xapi/scenari/incendio-magazzino" },
        },
      }).select("id").single();

      // --- Invio (lo stesso che fa il timer ogni minuto) ----------------------------------
      await t.step("RF-15: xapi-sender invia la coda; lo statement sbagliato non blocca gli altri", async () => {
        const res = await post("xapi-sender", {}, `Bearer ${SERVICE}`);
        assertEquals(res.status, 200, JSON.stringify(res.body));
        assert(res.body.sent >= 3, JSON.stringify(res.body));

        const { data: rows } = await admin.from("xapi_outbox")
          .select("id, status, last_error").in("event_id", events.map((e) => e.eventId));
        const good = rows!.filter((r) => r.id !== bad!.id);
        assertEquals(good.length, 3);
        assert(good.every((r) => r.status === "sent"), JSON.stringify(good));
        const wrong = rows!.find((r) => r.id === bad!.id)!;
        assertEquals(wrong.status, "pending");
        assert(wrong.last_error?.startsWith("LRS 400"), wrong.last_error ?? "");
      });

      await t.step("RNF-5: l'LRS ha i 3 statement del tentativo, con i verbi del contratto", async () => {
        const statements = await lrsStatements(`registration=${attemptId}&ascending=true`);
        assertEquals(statements.map((s) => s.verb.id), [
          "http://adlnet.gov/expapi/verbs/initialized",
          "http://adlnet.gov/expapi/verbs/failed",
          "http://adlnet.gov/expapi/verbs/completed",
        ]);
        const final = statements[2];
        assertEquals(final.result.success, true);
        assertEquals(final.result.duration, "PT6M52.3S");
        assertEquals(final.object.definition.name["it-IT"], "Emergenza incendio in magazzino");
      });

      await t.step("RNF-19: nell'LRS lo studente è solo il suo codice", async () => {
        const statements = await lrsStatements(`registration=${attemptId}`);
        for (const s of statements) {
          assertEquals(s.actor.account.name, participantCode);
          assert(!JSON.stringify(s).includes("@test.local"));
        }
      });

      await t.step("RF-15: un secondo invio non duplica nulla nell'LRS", async () => {
        await admin.from("xapi_outbox").update({ status: "pending", sent_at: null })
          .in("event_id", events.map((e) => e.eventId)).neq("id", bad!.id);
        await admin.from("xapi_outbox").update({ next_attempt_at: new Date(0).toISOString() })
          .in("event_id", events.map((e) => e.eventId));
        await post("xapi-sender", {}, `Bearer ${SERVICE}`);
        assertEquals((await lrsStatements(`registration=${attemptId}`)).length, 3);
      });
    } finally {
      for (const id of ids) await admin.auth.admin.deleteUser(id);
    }
  },
});
