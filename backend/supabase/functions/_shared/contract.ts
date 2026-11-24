// Controllo degli eventi del visore secondo il contratto docs/eventi-xapi.md (schemaVersion 1).
// Requisiti: RF-12, RNF-13. Nessuna logica di scenario: gli ID sono stringhe opache (RNF-14).

export const SCHEMA_VERSION = 1;

export const EVENT_TYPES = [
  "privacy.accepted",
  "scenario.started",
  "objective.completed",
  "choice.made",
  "error.committed",
  "safety_distance.violated",
  "scenario.ended",
] as const;

export type EventType = typeof EVENT_TYPES[number];

export interface VrEvent {
  schemaVersion: number;
  eventId: string;
  sessionId: string;
  attemptId: string | null;
  seq: number;
  type: EventType;
  timestamp: string;
  scenarioId: string;
  scenarioVersion: string;
  // deno-lint-ignore no-explicit-any
  payload: Record<string, any>;
}

export type ValidationResult =
  | { ok: true; event: VrEvent }
  | { ok: false; eventId: string | null; reason: string };

// Chiavi che indicano dati di tracciamento continuo: mai nei payload (RNF-13).
const TRACKING_KEYS = new Set([
  "position",
  "rotation",
  "gaze",
  "headPosition",
  "handPosition",
  "coordinates",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCENARIO_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
// ISO 8601 in UTC con la Z finale, millisecondi facoltativi (contratto: "ISO 8601 UTC, ms").
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

class ContractError extends Error {}

function fail(reason: string): never {
  throw new ContractError(reason);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, where: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    fail(`${where}.${key} deve essere una stringa non vuota`);
  }
  return value;
}

function optionalString(obj: Record<string, unknown>, key: string, where: string) {
  if (obj[key] === undefined || obj[key] === null) return;
  requireString(obj, key, where);
}

function requireCount(obj: Record<string, unknown>, key: string, where: string, min = 0): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    fail(`${where}.${key} deve essere un intero ≥ ${min}`);
  }
  return value;
}

function requireBoolean(obj: Record<string, unknown>, key: string, where: string): boolean {
  const value = obj[key];
  if (typeof value !== "boolean") fail(`${where}.${key} deve essere true o false`);
  return value;
}

function findTrackingKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTrackingKey(item);
      if (found) return found;
    }
  } else if (isObject(value)) {
    for (const [key, inner] of Object.entries(value)) {
      if (TRACKING_KEYS.has(key)) return key;
      const found = findTrackingKey(inner);
      if (found) return found;
    }
  }
  return null;
}

function validatePayload(type: EventType, p: Record<string, unknown>) {
  const w = "payload";
  switch (type) {
    case "privacy.accepted":
      requireString(p, "privacyNoticeVersion", w);
      break;
    case "scenario.started":
      requireCount(p, "attemptNumber", w, 1);
      optionalString(p, "clientVersion", w);
      break;
    case "objective.completed":
      requireString(p, "objectiveId", w);
      requireCount(p, "objectivesCompleted", w);
      requireCount(p, "objectivesTotal", w);
      requireCount(p, "pointsAwarded", w);
      requireCount(p, "pointsTotal", w);
      break;
    case "choice.made":
      requireString(p, "choiceId", w);
      requireString(p, "optionId", w);
      requireBoolean(p, "correct", w);
      requireCount(p, "pointsAwarded", w);
      requireCount(p, "pointsTotal", w);
      break;
    case "error.committed":
      requireString(p, "errorCode", w);
      optionalString(p, "relatedChoiceId", w);
      requireCount(p, "errorsTotal", w);
      break;
    case "safety_distance.violated":
      requireString(p, "zoneId", w);
      requireCount(p, "errorsTotal", w);
      break;
    case "scenario.ended": {
      const reason = p.reason;
      if (reason !== "completed" && reason !== "aborted_by_participant") {
        fail("payload.reason deve essere completed o aborted_by_participant");
      }
      if (!isObject(p.indicators)) fail("payload.indicators deve essere un oggetto");
      requireCount(p.indicators, "errors", "payload.indicators");
      requireCount(p.indicators, "completionTimeMs", "payload.indicators");
      requireBoolean(p.indicators, "sequenceRespected", "payload.indicators");
      if (reason === "completed") {
        if (p.outcome !== "passed" && p.outcome !== "failed") {
          fail("payload.outcome deve essere passed o failed per un tentativo completato");
        }
      } else if (p.outcome !== null && p.outcome !== undefined) {
        fail("payload.outcome deve essere null per un tentativo interrotto");
      }
      requireCount(p, "pointsTotal", w);
      requireCount(p, "level", w);
      requireCount(p, "objectivesCompleted", w);
      requireCount(p, "objectivesTotal", w);
      break;
    }
  }
}

// Controlla un evento. Non lancia mai: restituisce l'evento tipizzato o il motivo del rifiuto.
export function validateEvent(raw: unknown): ValidationResult {
  const eventId = isObject(raw) && typeof raw.eventId === "string" ? raw.eventId : null;
  try {
    if (!isObject(raw)) fail("l'evento deve essere un oggetto JSON");

    if (raw.schemaVersion !== SCHEMA_VERSION) {
      fail(`schemaVersion deve essere ${SCHEMA_VERSION}`);
    }
    if (typeof raw.eventId !== "string" || !UUID.test(raw.eventId)) {
      fail("eventId deve essere un UUID");
    }
    if (typeof raw.sessionId !== "string" || !UUID.test(raw.sessionId)) {
      fail("sessionId deve essere un UUID");
    }
    if (typeof raw.type !== "string" || !(EVENT_TYPES as readonly string[]).includes(raw.type)) {
      fail(`type deve essere uno di: ${EVENT_TYPES.join(", ")}`);
    }
    const type = raw.type as EventType;

    if (type === "privacy.accepted") {
      if (raw.attemptId !== null && raw.attemptId !== undefined) {
        fail("attemptId deve essere null per privacy.accepted");
      }
    } else if (typeof raw.attemptId !== "string" || !UUID.test(raw.attemptId)) {
      fail("attemptId deve essere un UUID");
    }

    requireCount(raw, "seq", "evento", 1);

    if (typeof raw.timestamp !== "string" || !ISO_UTC.test(raw.timestamp) ||
        Number.isNaN(Date.parse(raw.timestamp))) {
      fail("timestamp deve essere una data ISO 8601 in UTC (es. 2026-12-10T10:15:32.481Z)");
    }
    if (typeof raw.scenarioId !== "string" || !SCENARIO_ID.test(raw.scenarioId)) {
      fail("scenarioId non valido");
    }
    if (typeof raw.scenarioVersion !== "string" || !SEMVER.test(raw.scenarioVersion)) {
      fail("scenarioVersion deve essere nel formato 1.2.3");
    }
    if (!isObject(raw.payload)) fail("payload deve essere un oggetto");

    const trackingKey = findTrackingKey(raw.payload);
    if (trackingKey) fail(`payload non può contenere dati di tracciamento ("${trackingKey}", RNF-13)`);

    validatePayload(type, raw.payload);

    return {
      ok: true,
      event: {
        schemaVersion: SCHEMA_VERSION,
        eventId: raw.eventId,
        sessionId: raw.sessionId,
        attemptId: (raw.attemptId as string | null | undefined) ?? null,
        seq: raw.seq as number,
        type,
        timestamp: raw.timestamp,
        scenarioId: raw.scenarioId,
        scenarioVersion: raw.scenarioVersion,
        payload: raw.payload,
      },
    };
  } catch (error) {
    if (error instanceof ContractError) return { ok: false, eventId, reason: error.message };
    throw error;
  }
}
