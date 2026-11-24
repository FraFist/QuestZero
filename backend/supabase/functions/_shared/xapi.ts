// Traduzione degli eventi del visore in statement xAPI (profilo xAPI-SG).
// Requisiti: RF-15, RNF-5, RNF-13, RNF-19. Fonte: docs/eventi-xapi.md, "Mappatura in xAPI".
//
// ATTENZIONE (punto aperto del contratto): gli IRI del profilo xAPI-SG vanno verificati sulla
// definizione ufficiale prima del Passo 6. Sono tutti raccolti qui sotto, in un solo posto.

import type { VrEvent } from "./contract.ts";

const BASE = "https://questzero.it";
const PROFILE = "https://w3id.org/xapi/seriousgames";

export const VERBS = {
  initialized: { id: "http://adlnet.gov/expapi/verbs/initialized", it: "ha iniziato" },
  completed: { id: "http://adlnet.gov/expapi/verbs/completed", it: "ha completato" },
  progressed: { id: "http://adlnet.gov/expapi/verbs/progressed", it: "ha progredito in" },
  selected: { id: "https://w3id.org/xapi/adb/verbs/selected", it: "ha scelto" },
  interacted: { id: "http://adlnet.gov/expapi/verbs/interacted", it: "ha interagito con" },
  accessed: { id: "https://w3id.org/xapi/seriousgames/verbs/accessed", it: "è entrato in" },
  // Fuori dal profilo xAPI-SG (contratto): usato per i tentativi interrotti.
  terminated: { id: "http://adlnet.gov/expapi/verbs/terminated", it: "ha interrotto" },
} as const;

export const ACTIVITY_TYPES = {
  seriousGame: "https://w3id.org/xapi/seriousgames/activity-types/serious-game",
  quest: "https://w3id.org/xapi/seriousgames/activity-types/quest",
  zone: "https://w3id.org/xapi/seriousgames/activity-types/zone",
  question: "http://adlnet.gov/expapi/activities/question",
} as const;

const EXT = {
  progress: "https://w3id.org/xapi/seriousgames/extensions/progress",
  errors: `${BASE}/xapi/ext/errors`,
  errorCode: `${BASE}/xapi/ext/error-code`,
  sequenceRespected: `${BASE}/xapi/ext/sequence-respected`,
  level: `${BASE}/xapi/ext/level`,
} as const;

// deno-lint-ignore no-explicit-any
export type Statement = Record<string, any>;

export interface StatementContext {
  participantCode: string; // mai email o nome (RNF-19)
  scenarioName?: string;   // dal catalogo, se pubblicato
  newId?: () => string;    // per i test; di default crypto.randomUUID
}

// Durata ISO 8601 da millisecondi: 412300 → "PT6M52.3S".
export function isoDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round((totalSeconds % 60) * 1000) / 1000;
  let out = "PT";
  if (hours) out += `${hours}H`;
  if (minutes) out += `${minutes}M`;
  if (seconds || out === "PT") out += `${seconds}S`;
  return out;
}

function verb(v: { id: string; it: string }) {
  return { id: v.id, display: { "it-IT": v.it } };
}

function activity(id: string, type: string, name?: string) {
  return {
    objectType: "Activity",
    id,
    definition: name ? { type, name: { "it-IT": name } } : { type },
  };
}

// Converte un evento in 0, 1 o 2 statement xAPI.
export function buildStatements(event: VrEvent, ctx: StatementContext): Statement[] {
  const newId = ctx.newId ?? (() => crypto.randomUUID());
  const p = event.payload;
  const scenarioIri = `${BASE}/xapi/scenari/${event.scenarioId}`;
  const scenario = activity(scenarioIri, ACTIVITY_TYPES.seriousGame, ctx.scenarioName);

  const make = (
    v: { id: string; it: string },
    object: Statement,
    result?: Statement,
    withParent = true,
  ): Statement => {
    const contextActivities: Statement = { category: [{ id: PROFILE }] };
    if (withParent) contextActivities.parent = [{ id: scenarioIri }];
    const statement: Statement = {
      id: newId(),
      actor: {
        objectType: "Agent",
        account: { homePage: BASE, name: ctx.participantCode },
      },
      verb: verb(v),
      object,
      context: { registration: event.attemptId, contextActivities },
      timestamp: event.timestamp,
    };
    if (result) statement.result = result;
    return statement;
  };

  switch (event.type) {
    case "privacy.accepted":
      // Resta nel backend, non va all'LRS (contratto).
      return [];

    case "scenario.started":
      return [make(VERBS.initialized, scenario, undefined, false)];

    case "objective.completed": {
      const total = p.objectivesTotal as number;
      const progress = total > 0 ? (p.objectivesCompleted as number) / total : 0;
      return [
        make(
          VERBS.completed,
          activity(`${scenarioIri}/obiettivi/${p.objectiveId}`, ACTIVITY_TYPES.quest),
          { score: { raw: p.pointsAwarded } },
        ),
        make(VERBS.progressed, scenario, {
          extensions: { [EXT.progress]: Math.round(progress * 1000) / 1000 },
        }, false),
      ];
    }

    case "choice.made":
      return [make(
        VERBS.selected,
        activity(`${scenarioIri}/scelte/${p.choiceId}`, ACTIVITY_TYPES.question),
        { response: p.optionId, success: p.correct },
      )];

    case "error.committed":
      return [make(VERBS.interacted, scenario, {
        success: false,
        extensions: { [EXT.errorCode]: p.errorCode },
      }, false)];

    case "safety_distance.violated":
      return [make(
        VERBS.accessed,
        activity(`${scenarioIri}/zone/${p.zoneId}`, ACTIVITY_TYPES.zone),
        { success: false },
      )];

    case "scenario.ended": {
      const indicators = p.indicators as {
        errors: number;
        completionTimeMs: number;
        sequenceRespected: boolean;
      };
      if (p.reason === "completed") {
        // success dipende solo dall'esito, deciso dagli indicatori (RF-8);
        // score.raw è solo informativo.
        return [make(VERBS.completed, scenario, {
          success: p.outcome === "passed",
          completion: true,
          duration: isoDuration(indicators.completionTimeMs),
          score: { raw: p.pointsTotal },
          extensions: {
            [EXT.progress]: 1,
            [EXT.errors]: indicators.errors,
            [EXT.sequenceRespected]: indicators.sequenceRespected,
            [EXT.level]: p.level,
          },
        }, false)];
      }
      return [make(VERBS.terminated, scenario, {
        completion: false,
        duration: isoDuration(indicators.completionTimeMs),
      }, false)];
    }
  }
}
