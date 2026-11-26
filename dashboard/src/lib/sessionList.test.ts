import { describe, expect, it } from 'vitest'
import { countLabel, filterSessions, latestAttempts, listState, NO_FILTERS, type AttemptSummary, type SessionListItem } from './sessionList'

const att = (over: Partial<AttemptSummary>): AttemptSummary => ({
  session_id: 's1',
  attempt_number: 1,
  ended_at: '2026-11-25T10:10:00Z',
  end_reason: 'completed',
  outcome: 'passed',
  points_total: 35,
  errors_total: 1,
  completion_time_ms: 412_000,
  ...over,
})

const item = (over: Partial<SessionListItem>): SessionListItem => ({
  id: 's1',
  status: 'closed',
  scenarioId: 'incendio-magazzino',
  createdAt: '2026-11-25T10:00:00Z',
  participantCode: 'P-0001',
  trainerName: 'Anna Bianchi',
  ...over,
})

describe('latestAttempts', () => {
  it("tiene l'ultimo tentativo di ogni sessione", () => {
    const m = latestAttempts([att({ attempt_number: 1 }), att({ attempt_number: 2, outcome: 'failed' }), att({ session_id: 's2' })])
    expect(m.get('s1')?.attempt_number).toBe(2)
    expect(m.size).toBe(2)
  })
})

describe('listState (RF-17: com\'è andata, non i metadati)', () => {
  it('esito del tentativo quando c\'è', () => {
    expect(listState(item({ attempt: att({}) }))).toBe('superato')
    expect(listState(item({ attempt: att({ outcome: 'failed' }) }))).toBe('non-superato')
  })
  it('sessione aperta senza tentativi: in attesa o in corso', () => {
    expect(listState(item({ status: 'waiting' }))).toBe('in-attesa')
    expect(listState(item({ status: 'active' }))).toBe('in-corso')
  })
  it('tentativo in corso', () => {
    expect(listState(item({ status: 'active', attempt: att({ ended_at: null, end_reason: null, outcome: null }) }))).toBe('in-corso')
  })
  it('chiusa senza tentativi', () => {
    expect(listState(item({}))).toBe('senza-tentativi')
  })
})

describe('filterSessions', () => {
  const now = Date.parse('2026-11-26T12:00:00Z')
  const items = [
    item({ id: 'a', participantCode: 'P-0001', attempt: att({}) }),
    item({ id: 'b', participantCode: 'P-0017', attempt: att({ outcome: 'failed' }), trainerName: 'Luca Verdi' }),
    item({ id: 'c', participantCode: 'P-0031', createdAt: '2026-10-01T10:00:00Z' }),
  ]
  it('senza filtri: tutte', () => {
    expect(filterSessions(items, NO_FILTERS, now)).toHaveLength(3)
  })
  it('ricerca per codice studente, senza distinguere maiuscole', () => {
    expect(filterSessions(items, { ...NO_FILTERS, query: 'p-0017' }, now).map((i) => i.id)).toEqual(['b'])
  })
  it('per esito, formatore e periodo', () => {
    expect(filterSessions(items, { ...NO_FILTERS, state: 'non-superato' }, now).map((i) => i.id)).toEqual(['b'])
    expect(filterSessions(items, { ...NO_FILTERS, trainer: 'Anna Bianchi' }, now).map((i) => i.id)).toEqual(['a', 'c'])
    expect(filterSessions(items, { ...NO_FILTERS, period: '7' }, now).map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('countLabel', () => {
  it('conteggio con e senza filtri', () => {
    expect(countLabel(3, 3)).toBe('3 sessioni')
    expect(countLabel(1, 3)).toBe('1 di 3 sessioni')
    expect(countLabel(1, 1)).toBe('1 sessione')
  })
})
