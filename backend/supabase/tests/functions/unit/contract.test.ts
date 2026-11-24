// Test unitari del controllo eventi (supabase/functions/_shared/contract.ts).
// Requisiti: RF-12, RNF-13. Esempi presi da docs/eventi-xapi.md.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { validateEvent } from "../../../functions/_shared/contract.ts";

const base = {
  schemaVersion: 1,
  eventId: "8b0f0a4e-3c1d-4f2a-9a57-2d6f1c9e7b10",
  sessionId: "c2a1e7d4-5b6f-4e8a-9c0d-1f2e3a4b5c6d",
  attemptId: "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b",
  seq: 12,
  timestamp: "2026-12-10T10:15:32.481Z",
  scenarioId: "incendio-magazzino",
  scenarioVersion: "1.0.0",
};

function reason(event: unknown): string {
  const result = validateEvent(event);
  assert(!result.ok, "l'evento doveva essere rifiutato");
  return result.reason;
}

// Payload di esempio del contratto, uno per tipo.
const examples: Record<string, Record<string, unknown>> = {
  "privacy.accepted": { privacyNoticeVersion: "2026-12-01" },
  "scenario.started": { attemptNumber: 1, clientVersion: "0.3.0" },
  "objective.completed": {
    objectiveId: "raggiungere-estintore", objectivesCompleted: 2, objectivesTotal: 5,
    pointsAwarded: 10, pointsTotal: 30,
  },
  "choice.made": {
    choiceId: "tipo-estintore", optionId: "co2", correct: true, pointsAwarded: 15, pointsTotal: 45,
  },
  "error.committed": {
    errorCode: "estintore-acqua-su-quadro-elettrico", relatedChoiceId: "tipo-estintore", errorsTotal: 1,
  },
  "safety_distance.violated": { zoneId: "zona-fumo-denso", errorsTotal: 2 },
  "scenario.ended": {
    reason: "completed",
    indicators: { errors: 2, completionTimeMs: 412300, sequenceRespected: true },
    outcome: "passed", pointsTotal: 85, level: 3, objectivesCompleted: 5, objectivesTotal: 5,
  },
};

for (const [type, payload] of Object.entries(examples)) {
  Deno.test(`RF-12: l'esempio del contratto per ${type} è valido`, () => {
    const attemptId = type === "privacy.accepted" ? null : base.attemptId;
    const result = validateEvent({ ...base, attemptId, type, payload });
    assert(result.ok, result.ok ? "" : result.reason);
  });
}

Deno.test("RF-12: tipo di evento sconosciuto rifiutato", () => {
  assert(reason({ ...base, type: "head.moved", payload: {} }).startsWith("type"));
});

Deno.test("schemaVersion diverso da 1 rifiutato", () => {
  assertEquals(
    reason({ ...base, schemaVersion: 2, type: "choice.made", payload: examples["choice.made"] }),
    "schemaVersion deve essere 1",
  );
});

Deno.test("eventId non UUID rifiutato, con l'eventId nel risultato", () => {
  const result = validateEvent({ ...base, eventId: "abc", type: "choice.made", payload: {} });
  assert(!result.ok);
  assertEquals(result.eventId, "abc");
});

Deno.test("timestamp senza fuso UTC rifiutato", () => {
  assert(reason({
    ...base, timestamp: "2026-12-10T10:15:32", type: "choice.made", payload: examples["choice.made"],
  }).startsWith("timestamp"));
});

Deno.test("attemptId obbligatorio tranne che per privacy.accepted", () => {
  assert(reason({ ...base, attemptId: null, type: "choice.made", payload: examples["choice.made"] })
    .startsWith("attemptId"));
  assert(reason({ ...base, type: "privacy.accepted", payload: examples["privacy.accepted"] })
    .startsWith("attemptId"));
});

Deno.test("RNF-13: posizione nel payload rifiutata, anche annidata", () => {
  assert(reason({
    ...base, type: "safety_distance.violated",
    payload: { zoneId: "z", errorsTotal: 1, extra: { position: { x: 1 } } },
  }).includes("RNF-13"));
  assert(reason({
    ...base, type: "safety_distance.violated", payload: { zoneId: "z", errorsTotal: 1, gaze: [0, 1] },
  }).includes("gaze"));
});

Deno.test("punti negativi o non interi rifiutati", () => {
  assertEquals(
    reason({ ...base, type: "choice.made", payload: { ...examples["choice.made"], pointsTotal: -1 } }),
    "payload.pointsTotal deve essere un intero ≥ 0",
  );
  assert(!validateEvent({
    ...base, type: "choice.made", payload: { ...examples["choice.made"], pointsTotal: 1.5 },
  }).ok);
});

Deno.test("RF-14: tentativo completato senza esito rifiutato", () => {
  assert(reason({
    ...base, type: "scenario.ended", payload: { ...examples["scenario.ended"], outcome: null },
  }).startsWith("payload.outcome"));
});

Deno.test("RNF-16: tentativo interrotto con esito rifiutato, senza esito accettato", () => {
  const aborted = { ...examples["scenario.ended"], reason: "aborted_by_participant" };
  assert(reason({ ...base, type: "scenario.ended", payload: aborted }).startsWith("payload.outcome"));
  assert(validateEvent({ ...base, type: "scenario.ended", payload: { ...aborted, outcome: null } }).ok);
});

Deno.test("aborted_by_trainer rifiutato (fuori MVP)", () => {
  assert(reason({
    ...base, type: "scenario.ended",
    payload: { ...examples["scenario.ended"], reason: "aborted_by_trainer", outcome: null },
  }).startsWith("payload.reason"));
});

Deno.test("indicatori mancanti rifiutati", () => {
  const { indicators: _ignored, ...withoutIndicators } = examples["scenario.ended"];
  assertEquals(
    reason({ ...base, type: "scenario.ended", payload: withoutIndicators }),
    "payload.indicators deve essere un oggetto",
  );
});

Deno.test("un evento che non è un oggetto è rifiutato senza eccezioni", () => {
  for (const value of [null, 42, "testo", [1, 2]]) {
    const result = validateEvent(value);
    assert(!result.ok);
    assertEquals(result.eventId, null);
  }
});
