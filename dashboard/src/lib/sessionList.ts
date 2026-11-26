// Elenco delle sessioni (formatore e amministratore): stato mostrato, esito dell'ultimo tentativo,
// filtri. Funzioni pure, testate in sessionList.test.ts.
import { outcomeOf, type Outcome } from './results'
import type { SessionStatus } from './sessions'

export interface AttemptSummary {
  session_id: string
  attempt_number: number
  ended_at: string | null
  end_reason: string | null
  outcome: string | null
  points_total: number
  errors_total: number
  completion_time_ms: number | null
}

export interface SessionListItem {
  id: string
  status: SessionStatus
  scenarioId: string
  createdAt: string
  participantCode: string
  trainerName?: string
  attempt?: AttemptSummary
}

/** L'ultimo tentativo (numero più alto) di ogni sessione. */
export function latestAttempts(rows: AttemptSummary[]): Map<string, AttemptSummary> {
  const map = new Map<string, AttemptSummary>()
  for (const r of rows) {
    const cur = map.get(r.session_id)
    if (!cur || r.attempt_number > cur.attempt_number) map.set(r.session_id, r)
  }
  return map
}

/** Lo stato che conta per chi guarda l'elenco: com'è andata, o a che punto è. */
export type ListState = Outcome | 'in-attesa' | 'senza-tentativi'

export function listState(item: Pick<SessionListItem, 'status' | 'attempt'>): ListState {
  if (item.status === 'waiting') return 'in-attesa'
  if (item.attempt) {
    const o = outcomeOf(item.attempt)
    // Sessione ancora aperta e tentativo finito: lo studente può ricominciare, ma l'esito c'è.
    return o
  }
  return item.status === 'active' ? 'in-corso' : 'senza-tentativi'
}

export const STATE_LABELS: Record<ListState, string> = {
  superato: 'Superato',
  'non-superato': 'Non superato',
  interrotto: 'Interrotto',
  'in-corso': 'In corso',
  'in-attesa': 'In attesa del visore',
  'senza-tentativi': 'Nessun tentativo',
}

export const STATE_CLASSES: Record<ListState, string> = {
  superato: 'esito-superato',
  'non-superato': 'esito-non-superato',
  interrotto: 'esito-neutro',
  'in-corso': 'esito-attivo',
  'in-attesa': 'esito-attivo',
  'senza-tentativi': 'esito-neutro',
}

export type Period = '7' | '30' | 'tutte'

export interface Filters {
  query: string
  state: ListState | 'tutti'
  trainer: string // '' = tutti
  period: Period
}

export const NO_FILTERS: Filters = { query: '', state: 'tutti', trainer: '', period: 'tutte' }

export function filterSessions(items: SessionListItem[], f: Filters, now: number): SessionListItem[] {
  const q = f.query.trim().toLowerCase()
  const days = f.period === 'tutte' ? null : Number(f.period)
  return items.filter((it) => {
    if (q && !it.participantCode.toLowerCase().includes(q)) return false
    if (f.state !== 'tutti' && listState(it) !== f.state) return false
    if (f.trainer && it.trainerName !== f.trainer) return false
    if (days !== null && now - Date.parse(it.createdAt) > days * 86_400_000) return false
    return true
  })
}

export function countLabel(shown: number, total: number): string {
  const word = (n: number) => (n === 1 ? 'sessione' : 'sessioni')
  return shown === total ? `${total} ${word(total)}` : `${shown} di ${total} ${word(total)}`
}
