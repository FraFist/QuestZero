import { describe, expect, it } from 'vitest'
import { buildReport, type ReportSession } from './report'
import type { AttemptOverview, ErrorItem } from './results'

const session: ReportSession = {
  participantCode: 'P-0001',
  scenarioName: 'Emergenza incendio in magazzino',
  status: 'closed',
  createdAt: '2026-11-25T13:00:00Z',
  startedAt: '2026-11-25T13:02:00Z',
  closedAt: '2026-11-25T13:30:00Z',
}

const attempt = (n: number, over: Partial<AttemptOverview> = {}): AttemptOverview => ({
  attempt_id: `a${n}`,
  attempt_number: n,
  completion_time_ms: 412_300,
  end_reason: 'completed',
  ended_at: '2026-11-25T13:10:00Z',
  errors_total: 1,
  level: 2,
  objectives_completed: 2,
  objectives_total: 2,
  outcome: 'passed',
  participant_code: 'P-0001',
  participant_id: 'p',
  points_total: 35,
  scenario_id: 'incendio-magazzino',
  scenario_name: 'Emergenza incendio in magazzino',
  scenario_version: '1.0.0',
  sequence_respected: true,
  session_id: 's',
  started_at: '2026-11-25T13:03:00Z',
  trainer_id: 't',
  ...over,
})

const errors = new Map<string, ErrorItem[]>([
  ['a1', [{ key: 'e1', text: 'Zona di fumo denso', kind: 'zona', at: '2026-11-25T13:05:10Z' }]],
])

describe('buildReport (RF-19)', () => {
  const report = buildReport(session, [attempt(2, { outcome: 'failed' }), attempt(1)], errors, '2026-11-25T14:00:00Z')

  it('nome del file con codice studente e data della sessione', () => {
    expect(report.fileName).toBe('report-P-0001-2026-11-25.pdf')
  })

  it('dati della sessione: codice studente, mai email (RNF-19), scenario con versione', () => {
    expect(report.title).toBe('Sessione di P-0001')
    expect(report.details).toContainEqual(['Scenario', 'Emergenza incendio in magazzino (versione 1.0.0)'])
    expect(report.details).toContainEqual(['Stato', 'Chiusa'])
    expect(report.details).toContainEqual(['Creata', '25 nov 2026, 14:00'])
    expect(JSON.stringify(report)).not.toMatch(/@/)
  })

  it('tentativi in ordine, con esito e indicatori come li calcola il visore (RF-13)', () => {
    expect(report.attempts.map((a) => `${a.title}: ${a.outcome}`)).toEqual(['Tentativo 1: Superato', 'Tentativo 2: Non superato'])
    expect(report.attempts[0].indicators).toContainEqual(['Tempo', '6:52'])
    expect(report.attempts[0].indicators).toContainEqual(['Obiettivi', '2 di 2'])
  })

  it('errori del tentativo con ora italiana e tipo', () => {
    expect(report.attempts[0].errors).toEqual([{ time: '14:05:10', kind: 'Zona di pericolo', text: 'Zona di fumo denso' }])
    expect(report.attempts[1].errors).toEqual([])
  })

  it('sessione senza tentativi: report comunque valido', () => {
    const empty = buildReport({ ...session, status: 'waiting', startedAt: null, closedAt: null }, [], new Map(), '2026-11-25T14:00:00Z')
    expect(empty.attempts).toEqual([])
    expect(empty.details).toContainEqual(['Visore collegato', '—'])
  })

  it('codice con caratteri strani: il nome del file resta pulito', () => {
    expect(buildReport({ ...session, participantCode: 'P/00 1' }, [], new Map(), '2026-11-25T14:00:00Z').fileName).toBe(
      'report-P001-2026-11-25.pdf',
    )
  })
})
