// Visore finto: fa quello che farà il client Unity, per provare la dashboard senza visore.
// Si abbina con il codice di 6 cifre (funzione "pair") e invia un tentativo completo, un evento
// alla volta con una pausa, alla funzione "events". Segue docs/eventi-xapi.md (contratto 0.7)
// e usa gli ID del catalogo di prova (supabase/seed.sql): non cambia il contratto.
//
// Uso (da backend/, con `npm start` già fatto):
//   npm run visore:finto -- <codice>                  tentativo superato, 4 s tra un evento e l'altro
//   npm run visore:finto -- <codice> --non-superato   tentativo con 3 errori (esito non superato)
//   npm run visore:finto -- <codice> --interrompi     lo studente interrompe a metà (RNF-16)
//   npm run visore:finto -- <codice> --pausa 1        pausa diversa, in secondi
//   npm run visore:finto -- <codice> --url https://xqwcjnvbptrcjjsnmnjc.supabase.co   (progetto online)
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const code = args.find((a) => /^\d{6}$/.test(a));
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

if (!code) {
  console.error("Manca il codice di 6 cifre: npm run visore:finto -- 123456");
  process.exit(1);
}

// Indirizzo: --url, altrimenti Supabase locale (porta fissata in supabase/config.toml).
const baseUrl = option("--url", "http://127.0.0.1:44321");
const functionsUrl = `${baseUrl.replace(/\/$/, "")}/functions/v1`;
const pauseMs = Number(option("--pausa", "4")) * 1000;
const scenarioVersion = option("--versione", "1.0.0");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Abbinamento ------------------------------------------------------------
const pairRes = await fetch(`${functionsUrl}/pair`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ pairingCode: code, clientVersion: "visore-finto" }),
});
const pair = await pairRes.json().catch(() => ({}));
if (!pairRes.ok) {
  console.error(`Abbinamento non riuscito (${pairRes.status}): ${pair.message ?? pair.error ?? "risposta inattesa"}`);
  process.exit(1);
}
console.log(`Abbinato alla sessione ${pair.sessionId} (scenario ${pair.scenarioId}).`);

// 2. Eventi ------------------------------------------------------------------
let seq = 0;
let attemptId = null;

async function send(type, payload) {
  const event = {
    schemaVersion: 1,
    eventId: randomUUID(),
    sessionId: pair.sessionId,
    attemptId: type === "privacy.accepted" ? null : attemptId,
    seq: ++seq,
    type,
    timestamp: new Date().toISOString(),
    scenarioId: pair.scenarioId,
    scenarioVersion,
    payload,
  };
  const res = await fetch(`${functionsUrl}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${pair.sessionToken}` },
    body: JSON.stringify([event]),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.rejected?.length) {
    console.error(`  ${type}: non accettato (${res.status})`, JSON.stringify(body.rejected ?? body));
    process.exit(1);
  }
  console.log(`  ${String(seq).padStart(2)} ${type}`);
}

const failing = flag("--non-superato");
const aborting = flag("--interrompi");
const started = Date.now();
let points = 0;
let errors = 0;

if (pair.privacyRequired) {
  await send("privacy.accepted", { privacyNoticeVersion: pair.privacyNoticeVersion });
  await sleep(pauseMs);
}

attemptId = randomUUID();
await send("scenario.started", { attemptNumber: 1, clientVersion: "visore-finto" });
await sleep(pauseMs);

points += 10;
await send("objective.completed", {
  objectiveId: "dare-allarme", objectivesCompleted: 1, objectivesTotal: 2, pointsAwarded: 10, pointsTotal: points,
});
await sleep(pauseMs);

errors += 1;
await send("safety_distance.violated", { zoneId: "zona-fumo-denso", errorsTotal: errors });
await sleep(pauseMs);

if (aborting) {
  await send("scenario.ended", {
    reason: "aborted_by_participant", indicators: { errors, completionTimeMs: Date.now() - started, sequenceRespected: true },
    outcome: null, pointsTotal: points, level: 0, objectivesCompleted: 1, objectivesTotal: 2,
  });
  console.log("Tentativo interrotto dallo studente.");
  process.exit(0);
}

if (failing) {
  // Scelta sbagliata: il contratto vuole anche un error.committed con relatedChoiceId.
  await send("choice.made", { choiceId: "tipo-estintore", optionId: "acqua", correct: false, pointsAwarded: 0, pointsTotal: points });
  errors += 1;
  await send("error.committed", { errorCode: "estintore-acqua-su-quadro-elettrico", relatedChoiceId: "tipo-estintore", errorsTotal: errors });
  await sleep(pauseMs);
  errors += 1;
  await send("safety_distance.violated", { zoneId: "zona-fumo-denso", errorsTotal: errors });
  await sleep(pauseMs);
} else {
  points += 15;
  await send("choice.made", { choiceId: "tipo-estintore", optionId: "co2", correct: true, pointsAwarded: 15, pointsTotal: points });
  await sleep(pauseMs);
}

points += 10;
await send("objective.completed", {
  objectiveId: "raggiungere-estintore", objectivesCompleted: 2, objectivesTotal: 2, pointsAwarded: 10, pointsTotal: points,
});
await sleep(pauseMs);

// Esito con i criteri del catalogo di prova (maxErrors 2): lo calcola il visore (RF-8, RF-13).
const outcome = errors <= 2 ? "passed" : "failed";
await send("scenario.ended", {
  reason: "completed",
  indicators: { errors, completionTimeMs: Date.now() - started, sequenceRespected: !failing },
  outcome,
  pointsTotal: points,
  level: outcome === "passed" ? 2 : 1,
  objectivesCompleted: 2,
  objectivesTotal: 2,
});
console.log(`Tentativo finito: ${outcome === "passed" ? "superato" : "non superato"}, ${errors} errori, ${points} punti.`);
