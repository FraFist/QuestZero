// Risultati dei tentativi (RF-17 per il formatore; serviranno anche a RF-19 PDF e RF-21 studente).
// Funzioni pure, testate in results.test.ts. Esito e indicatori sono quelli calcolati dal visore
// (RF-13, RF-14): qui si mostrano soltanto, non si ricalcolano (RF-8).
import type { Views } from './supabase'

export type AttemptOverview = Views<'attempt_overview'>
export type AttemptError = Views<'attempt_errors'>

export type Outcome = 'superato' | 'non-superato' | 'interrotto' | 'in-corso'

export function outcomeOf(a: Pick<AttemptOverview, 'ended_at' | 'end_reason' | 'outcome'>): Outcome {
  if (!a.ended_at) return 'in-corso'
  if (a.end_reason === 'aborted_by_participant') return 'interrotto'
  return a.outcome === 'passed' ? 'superato' : 'non-superato'
}

export const OUTCOME_LABELS: Record<Outcome, string> = {
  superato: 'Superato',
  'non-superato': 'Non superato',
  interrotto: 'Interrotto',
  'in-corso': 'In corso',
}

export const OUTCOME_CLASSES: Record<Outcome, string> = {
  superato: 'esito-superato',
  'non-superato': 'esito-non-superato',
  interrotto: 'esito-neutro',
  'in-corso': 'esito-attivo',
}

export interface Summary {
  total: number
  passed: number
  failed: number
  aborted: number
  running: number
  /** Punti migliori tra i tentativi completati, null se nessuno. */
  bestPoints: number | null
}

export function summarize(attempts: AttemptOverview[]): Summary {
  const s: Summary = { total: attempts.length, passed: 0, failed: 0, aborted: 0, running: 0, bestPoints: null }
  for (const a of attempts) {
    const o = outcomeOf(a)
    if (o === 'superato') s.passed++
    else if (o === 'non-superato') s.failed++
    else if (o === 'interrotto') s.aborted++
    else s.running++
    if (o === 'superato' || o === 'non-superato') s.bestPoints = Math.max(s.bestPoints ?? 0, a.points_total)
  }
  return s
}

export interface ErrorItem {
  key: string
  text: string
  kind: 'errore' | 'zona'
  at: string
}

/** Errori di ogni tentativo, in ordine di tempo; senza etichetta nel catalogo si mostra il codice. */
export function groupErrors(errors: AttemptError[]): Map<string, ErrorItem[]> {
  const map = new Map<string, ErrorItem[]>()
  const sorted = [...errors].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
  for (const e of sorted) {
    if (!e.attempt_id) continue
    const item: ErrorItem = {
      key: e.event_id,
      text: e.label ?? e.code ?? 'Errore senza codice',
      kind: e.kind === 'zone' ? 'zona' : 'errore',
      at: e.occurred_at,
    }
    map.set(e.attempt_id, [...(map.get(e.attempt_id) ?? []), item])
  }
  return map
}

/** "Sì" / "No" / "—" per la sequenza rispettata (null se il tentativo non è completato). */
export function yesNo(value: boolean | null): string {
  return value === null ? '—' : value ? 'Sì' : 'No'
}
