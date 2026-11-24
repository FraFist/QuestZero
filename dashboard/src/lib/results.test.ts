import { describe, expect, it } from 'vitest'
import { groupErrors, outcomeOf, summarize, yesNo, type AttemptError, type AttemptOverview } from './results'

const attempt = (over: Partial<AttemptOverview>): AttemptOverview => ({
  attempt_id: 'a',
  attempt_number: 1,
  completion_time_ms: 400_000,
  end_reason: 'completed',
  ended_at: '2026-12-10T10:30:00Z',
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
  started_at: '2026-12-10T10:15:00Z',
  trainer_id: 't',
  ...over,
})

describe('outcomeOf (RF-17: esito come lo calcola il visore, RF-8)', () => {
  it('superato, non superato, interrotto, in corso', () => {
    expect(outcomeOf(attempt({}))).toBe('superato')
    expect(outcomeOf(attempt({ outcome: 'failed' }))).toBe('non-superato')
    expect(outcomeOf(attempt({ end_reason: 'aborted_by_participant', outcome: null }))).toBe('interrotto')
    expect(outcomeOf(attempt({ ended_at: null, end_reason: null, outcome: null }))).toBe('in-corso')
  })

  it("l'esito non dipende dai punti (RF-8)", () => {
    expect(outcomeOf(attempt({ outcome: 'failed', points_total: 999 }))).toBe('non-superato')
  })
})

describe('summarize', () => {
  it('conta gli esiti e prende i punti migliori dei soli tentativi completati', () => {
    const s = summarize([
      attempt({ attempt_id: '1', points_total: 35 }),
      attempt({ attempt_id: '2', outcome: 'failed', points_total: 20 }),
      attempt({ attempt_id: '3', end_reason: 'aborted_by_participant', outcome: null, points_total: 80 }),
      attempt({ attempt_id: '4', ended_at: null, end_reason: null, outcome: null }),
    ])
    expect(s).toEqual({ total: 4, passed: 1, failed: 1, aborted: 1, running: 1, bestPoints: 35 })
  })

  it('nessun tentativo', () => {
    expect(summarize([]).bestPoints).toBeNull()
  })
})

describe('groupErrors (errori per tentativo, etichette dal catalogo)', () => {
  const err = (over: Partial<AttemptError>): AttemptError => ({
    attempt_id: 'a',
    code: 'zona-fumo-denso',
    event_id: 'e',
    kind: 'zone',
    label: 'Zona di fumo denso',
    occurred_at: '2026-12-10T10:16:00Z',
    related_choice_id: null,
    session_id: 's',
    ...over,
  })

  it('raggruppa per tentativo in ordine di tempo', () => {
    const map = groupErrors([
      err({ event_id: '2', occurred_at: '2026-12-10T10:20:00Z', kind: 'error', code: 'x', label: 'Errore X' }),
      err({ event_id: '1' }),
      err({ event_id: '3', attempt_id: 'b' }),
    ])
    expect(map.get('a')?.map((e) => e.key)).toEqual(['1', '2'])
    expect(map.get('a')?.[1]).toMatchObject({ text: 'Errore X', kind: 'errore' })
    expect(map.get('b')).toHaveLength(1)
  })

  it('senza etichetta mostra il codice grezzo', () => {
    expect(groupErrors([err({ label: null, code: 'codice-nuovo' })]).get('a')?.[0].text).toBe('codice-nuovo')
  })
})

describe('yesNo', () => {
  it('sequenza rispettata', () => {
    expect(yesNo(true)).toBe('Sì')
    expect(yesNo(false)).toBe('No')
    expect(yesNo(null)).toBe('—')
  })
})
