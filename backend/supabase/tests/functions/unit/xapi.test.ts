// Test unitari della traduzione in xAPI (supabase/functions/_shared/xapi.ts).
// Requisiti: RF-8, RF-15, RNF-5, RNF-19. Riferimento: docs/eventi-xapi.md, "Mappatura in xAPI".

import { assert, assertEquals } from "jsr:@std/assert@1";
import type { VrEvent } from "../../../functions/_shared/contract.ts";
import { ACTIVITY_TYPES, buildStatements, isoDuration, VERBS } from "../../../functions/_shared/xapi.ts";

const ctx = { participantCode: "P-0042", scenarioName: "Emergenza incendio in magazzino" };
const scenarioIri = "https://questzero.it/xapi/scenari/incendio-magazzino";

function event(type: VrEvent["type"], payload: Record<string, unknown>, timestamp = "2026-12-10T10:22:11.902Z"): VrEvent {
  return {
    schemaVersion: 1,
    eventId: "8b0f0a4e-3c1d-4f2a-9a57-2d6f1c9e7b10",
    sessionId: "c2a1e7d4-5b6f-4e8a-9c0d-1f2e3a4b5c6d",
    attemptId: type === "privacy.accepted" ? null : "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b",
    seq: 1,
    type,
    timestamp,
    scenarioId: "incendio-magazzino",
    scenarioVersion: "1.0.0",
    payload,
  };
}

Deno.test("RF-15: lo statement di fine scenario coincide con l'esempio del contratto", () => {
  const [statement] = buildStatements(event("scenario.ended", {
    reason: "completed",
    indicators: { errors: 2, completionTimeMs: 412300, sequenceRespected: true },
    outcome: "passed", pointsTotal: 85, level: 3, objectivesCompleted: 5, objectivesTotal: 5,
  }), { ...ctx, newId: () => "id-fisso" });

  // Esempio di docs/eventi-xapi.md ("Statement di fine scenario"), più id e objectType.
  assertEquals(statement, {
    id: "id-fisso",
    actor: { objectType: "Agent", account: { homePage: "https://questzero.it", name: "P-0042" } },
    verb: { id: "http://adlnet.gov/expapi/verbs/completed", display: { "it-IT": "ha completato" } },
    object: {
      objectType: "Activity",
      id: scenarioIri,
      definition: {
        type: "https://w3id.org/xapi/seriousgames/activity-types/serious-game",
        name: { "it-IT": "Emergenza incendio in magazzino" },
      },
    },
    result: {
      success: true,
      completion: true,
      duration: "PT6M52.3S",
      score: { raw: 85 },
      extensions: {
        "https://w3id.org/xapi/seriousgames/extensions/progress": 1,
        "https://questzero.it/xapi/ext/errors": 2,
        "https://questzero.it/xapi/ext/sequence-respected": true,
        "https://questzero.it/xapi/ext/level": 3,
      },
    },
    context: {
      registration: "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b",
      contextActivities: { category: [{ id: "https://w3id.org/xapi/seriousgames" }] },
    },
    timestamp: "2026-12-10T10:22:11.902Z",
  });
});

Deno.test("RF-8: success dipende solo dall'esito, non dai punti", () => {
  const [statement] = buildStatements(event("scenario.ended", {
    reason: "completed",
    indicators: { errors: 5, completionTimeMs: 1000, sequenceRespected: false },
    outcome: "failed", pointsTotal: 999, level: 9, objectivesCompleted: 5, objectivesTotal: 5,
  }), ctx);
  assertEquals(statement.result.success, false);
  assertEquals(statement.result.score.raw, 999);
});

Deno.test("tentativo interrotto: verbo terminated, completion false, durata", () => {
  const [statement] = buildStatements(event("scenario.ended", {
    reason: "aborted_by_participant",
    indicators: { errors: 0, completionTimeMs: 65000, sequenceRespected: false },
    outcome: null, pointsTotal: 0, level: 0, objectivesCompleted: 0, objectivesTotal: 5,
  }), ctx);
  assertEquals(statement.verb.id, VERBS.terminated.id);
  assertEquals(statement.result, { completion: false, duration: "PT1M5S" });
});

Deno.test("privacy.accepted non produce statement (resta nel backend)", () => {
  assertEquals(buildStatements(event("privacy.accepted", { privacyNoticeVersion: "2026-12-01" }), ctx), []);
});

Deno.test("scenario.started: initialized sullo scenario, senza parent", () => {
  const [statement] = buildStatements(event("scenario.started", { attemptNumber: 1 }), ctx);
  assertEquals(statement.verb.id, VERBS.initialized.id);
  assertEquals(statement.object.id, scenarioIri);
  assertEquals(statement.context.contextActivities.parent, undefined);
});

Deno.test("objective.completed: due statement, quest completata e progresso", () => {
  const statements = buildStatements(event("objective.completed", {
    objectiveId: "raggiungere-estintore", objectivesCompleted: 2, objectivesTotal: 5,
    pointsAwarded: 10, pointsTotal: 30,
  }), ctx);
  assertEquals(statements.length, 2);
  const [quest, progress] = statements;
  assertEquals(quest.object.id, `${scenarioIri}/obiettivi/raggiungere-estintore`);
  assertEquals(quest.object.definition.type, ACTIVITY_TYPES.quest);
  assertEquals(quest.result.score.raw, 10);
  assertEquals(quest.context.contextActivities.parent, [{ id: scenarioIri }]);
  assertEquals(progress.verb.id, VERBS.progressed.id);
  assertEquals(progress.result.extensions["https://w3id.org/xapi/seriousgames/extensions/progress"], 0.4);
  assert(quest.id !== progress.id, "ogni statement ha il proprio id");
});

Deno.test("choice.made: selected sulla domanda con risposta ed esito", () => {
  const [statement] = buildStatements(event("choice.made", {
    choiceId: "tipo-estintore", optionId: "co2", correct: true, pointsAwarded: 15, pointsTotal: 45,
  }), ctx);
  assertEquals(statement.verb.id, VERBS.selected.id);
  assertEquals(statement.object.id, `${scenarioIri}/scelte/tipo-estintore`);
  assertEquals(statement.result, { response: "co2", success: true });
});

Deno.test("RNF-5: error.committed usa failed su un'attività per codice di errore", () => {
  const [statement] = buildStatements(event("error.committed", {
    errorCode: "estintore-acqua-su-quadro-elettrico", errorsTotal: 1,
  }), ctx);
  assertEquals(statement.verb.id, "http://adlnet.gov/expapi/verbs/failed");
  assertEquals(statement.object.id, `${scenarioIri}/errori/estintore-acqua-su-quadro-elettrico`);
  assertEquals(statement.object.definition.type, ACTIVITY_TYPES.safetyError);
  assertEquals(statement.context.contextActivities.parent, [{ id: scenarioIri }]);
  assertEquals(statement.result.success, false);
  assertEquals(statement.result.extensions["https://questzero.it/xapi/ext/error-code"],
    "estintore-acqua-su-quadro-elettrico");
});

Deno.test("safety_distance.violated: accessed sulla zona, senza posizione", () => {
  const [statement] = buildStatements(event("safety_distance.violated", {
    zoneId: "zona-fumo-denso", errorsTotal: 2,
  }), ctx);
  assertEquals(statement.verb.id, VERBS.accessed.id);
  assertEquals(statement.object.id, `${scenarioIri}/zone/zona-fumo-denso`);
  assert(!JSON.stringify(statement).includes("position"), "RNF-13: mai l'estensione position");
});

Deno.test("RNF-19: l'attore è solo il codice partecipante, mai email o nome", () => {
  const types: [VrEvent["type"], Record<string, unknown>][] = [
    ["scenario.started", { attemptNumber: 1 }],
    ["choice.made", { choiceId: "c", optionId: "o", correct: false, pointsAwarded: 0, pointsTotal: 0 }],
  ];
  for (const [type, payload] of types) {
    for (const statement of buildStatements(event(type, payload), ctx)) {
      assertEquals(statement.actor, {
        objectType: "Agent", account: { homePage: "https://questzero.it", name: "P-0042" },
      });
    }
  }
});

Deno.test("RNF-5: caratteri speciali negli ID codificati negli IRI", () => {
  const [statement] = buildStatements(event("safety_distance.violated", {
    zoneId: "zona fumo/denso", errorsTotal: 1,
  }), ctx);
  assertEquals(statement.object.id, `${scenarioIri}/zone/zona%20fumo%2Fdenso`);
});

Deno.test("durata ISO 8601", () => {
  assertEquals(isoDuration(412300), "PT6M52.3S");
  assertEquals(isoDuration(0), "PT0S");
  assertEquals(isoDuration(3_600_000), "PT1H");
  assertEquals(isoDuration(3_725_500), "PT1H2M5.5S");
});
