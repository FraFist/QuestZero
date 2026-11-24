// Vista dal vivo (RF-16): dagli eventi e dai tentativi al testo che vede il formatore.
// Funzioni pure, testate in live.test.ts. Le etichette arrivano SEMPRE dal catalogo dello scenario
// nel database (RNF-14): la dashboard non ne contiene; un codice sconosciuto si mostra così com'è.

export interface Catalog {
  objectives: Map<string, string>
  choices: Map<string, string>
  errors: Map<string, string>
  zones: Map<string, string>
}

type Json = unknown

function labelMap(list: Json, key: 'id' | 'code'): Map<string, string> {
  const map = new Map<string, string>()
  if (!Array.isArray(list)) return map
  for (const item of list) {
    if (item && typeof item === 'object') {
      const k = (item as Record<string, unknown>)[key]
      const label = (item as Record<string, unknown>).label
      if (typeof k === 'string' && typeof label === 'string') map.set(k, label)
    }
  }
  return map
}

/** Catalogo JSON (tabella scenarios) → mappe codice → etichetta. Tollera campi mancanti. */
export function buildCatalog(catalog: Json): Catalog {
  const c = (catalog && typeof catalog === 'object' ? catalog : {}) as Record<string, Json>
  return {
    objectives: labelMap(c.objectives, 'id'),
    choices: labelMap(c.choices, 'id'),
    errors: labelMap(c.errors, 'code'),
    zones: labelMap(c.zones, 'id'),
  }
}

export const EMPTY_CATALOG: Catalog = buildCatalog({})

export interface LiveEvent {
  event_id: string
  seq: number
  type: string
  occurred_at: string
  attempt_id: string | null
  payload: Json
}

export type EventTone = 'ok' | 'errore' | 'info'

export interface EventDescription {
  text: string
  tone: EventTone
  /** Punti guadagnati con questo evento, se ce ne sono. */
  points?: number
}

function str(payload: Json, key: string): string | undefined {
  const v = payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[key] : undefined
  return typeof v === 'string' ? v : undefined
}
function num(payload: Json, key: string): number | undefined {
  const v = payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[key] : undefined
  return typeof v === 'number' ? v : undefined
}

/** Un evento del visore → frase per il formatore. */
export function describeEvent(e: LiveEvent, catalog: Catalog): EventDescription {
  const p = e.payload
  const label = (map: Map<string, string>, code: string | undefined) => (code ? (map.get(code) ?? code) : '—')
  switch (e.type) {
    case 'privacy.accepted':
      return { text: 'Informativa privacy accettata nel visore', tone: 'info' }
    case 'scenario.started':
      return { text: `Tentativo ${num(p, 'attemptNumber') ?? ''} iniziato`.replace('  ', ' '), tone: 'info' }
    case 'objective.completed': {
      const done = num(p, 'objectivesCompleted')
      const total = num(p, 'objectivesTotal')
      const progress = done !== undefined && total !== undefined ? ` (${done} di ${total})` : ''
      return {
        text: `Obiettivo raggiunto: ${label(catalog.objectives, str(p, 'objectiveId'))}${progress}`,
        tone: 'ok',
        points: num(p, 'pointsAwarded'),
      }
    }
    case 'choice.made': {
      const correct = (p as Record<string, unknown> | null)?.correct === true
      const option = str(p, 'optionId')
      return {
        text: `${correct ? 'Scelta corretta' : 'Scelta sbagliata'}: ${label(catalog.choices, str(p, 'choiceId'))}${option ? `, ${option}` : ''}`,
        tone: correct ? 'ok' : 'errore',
        points: correct ? num(p, 'pointsAwarded') : undefined,
      }
    }
    case 'error.committed':
      return { text: `Errore: ${label(catalog.errors, str(p, 'errorCode'))}`, tone: 'errore' }
    case 'safety_distance.violated':
      return { text: `Entrato in zona di pericolo: ${label(catalog.zones, str(p, 'zoneId'))}`, tone: 'errore' }
    case 'scenario.ended': {
      const reason = str(p, 'reason')
      if (reason === 'aborted_by_participant') return { text: 'Scenario interrotto dallo studente', tone: 'info' }
      const outcome = str(p, 'outcome')
      return {
        text: `Scenario completato: ${outcome === 'passed' ? 'superato' : outcome === 'failed' ? 'non superato' : 'esito non indicato'}`,
        tone: outcome === 'passed' ? 'ok' : outcome === 'failed' ? 'errore' : 'info',
      }
    }
    default:
      return { text: e.type, tone: 'info' }
  }
}

export interface LiveAttempt {
  id: string
  attempt_number: number
  started_at: string
  ended_at: string | null
  completion_time_ms: number | null
}

/**
 * Tempo trascorso del tentativo (RF-16). Finito: il tempo calcolato dal visore, altrimenti
 * fine meno inizio. In corso: adesso meno l'inizio (ora del visore; mai negativo).
 */
export function elapsedMs(attempt: LiveAttempt, now: number): number {
  if (attempt.ended_at) {
    return attempt.completion_time_ms ?? Math.max(0, Date.parse(attempt.ended_at) - Date.parse(attempt.started_at))
  }
  return Math.max(0, now - Date.parse(attempt.started_at))
}

/** Il tentativo da mostrare: quello con il numero più alto. */
export function currentAttempt<T extends LiveAttempt>(attempts: T[]): T | undefined {
  return attempts.reduce<T | undefined>((best, a) => (!best || a.attempt_number > best.attempt_number ? a : best), undefined)
}

/** Aggiunge o sostituisce una riga per id (aggiornamenti Realtime), senza doppioni. */
export function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id)
  if (i === -1) return [...list, row]
  const copy = list.slice()
  copy[i] = { ...copy[i], ...row }
  return copy
}

/** Aggiunge un evento in testa (più recente prima), senza doppioni, al massimo `max`. */
export function addEvent(list: LiveEvent[], e: LiveEvent, max = 50): LiveEvent[] {
  if (list.some((x) => x.event_id === e.event_id)) return list
  return [e, ...list].sort((a, b) => b.seq - a.seq).slice(0, max)
}
