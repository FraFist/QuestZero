import { describe, expect, it } from 'vitest'
import { addEvent, buildCatalog, currentAttempt, describeEvent, elapsedMs, upsertById, type LiveEvent } from './live'

// Catalogo come quello di prova (backend/supabase/seed.sql).
const catalog = buildCatalog({
  objectives: [{ id: 'dare-allarme', label: "Dare l'allarme" }],
  choices: [{ id: 'tipo-estintore', label: "Scelta dell'estintore" }],
  errors: [{ code: 'estintore-acqua-su-quadro-elettrico', label: 'Acqua su incendio elettrico' }],
  zones: [{ id: 'zona-fumo-denso', label: 'Zona di fumo denso' }],
})

const ev = (type: string, payload: object, seq = 1): LiveEvent => ({
  event_id: `e${seq}`,
  seq,
  type,
  occurred_at: '2026-12-10T10:15:00Z',
  attempt_id: 'a1',
  payload,
})

describe('describeEvent (RF-16, etichette dal catalogo RNF-14)', () => {
  it('obiettivo con etichetta, avanzamento e punti', () => {
    const d = describeEvent(
      ev('objective.completed', { objectiveId: 'dare-allarme', objectivesCompleted: 1, objectivesTotal: 2, pointsAwarded: 10 }),
      catalog,
    )
    expect(d).toEqual({ text: "Obiettivo raggiunto: Dare l'allarme (1 di 2)", tone: 'ok', points: 10 })
  })

  it('scelta sbagliata: tono di errore, nessun punto', () => {
    const d = describeEvent(ev('choice.made', { choiceId: 'tipo-estintore', optionId: 'acqua', correct: false, pointsAwarded: 0 }), catalog)
    expect(d.tone).toBe('errore')
    expect(d.text).toBe("Scelta sbagliata: Scelta dell'estintore, acqua")
    expect(d.points).toBeUndefined()
  })

  it('errore e zona di pericolo con le etichette del catalogo', () => {
    expect(describeEvent(ev('error.committed', { errorCode: 'estintore-acqua-su-quadro-elettrico' }), catalog).text).toBe(
      'Errore: Acqua su incendio elettrico',
    )
    expect(describeEvent(ev('safety_distance.violated', { zoneId: 'zona-fumo-denso' }), catalog).text).toBe(
      'Entrato in zona di pericolo: Zona di fumo denso',
    )
  })

  it('codice assente dal catalogo: si mostra il codice grezzo (contratto)', () => {
    expect(describeEvent(ev('error.committed', { errorCode: 'codice-nuovo' }), catalog).text).toBe('Errore: codice-nuovo')
  })

  it('fine scenario: superato, non superato, interrotto dallo studente', () => {
    expect(describeEvent(ev('scenario.ended', { reason: 'completed', outcome: 'passed' }), catalog)).toMatchObject({
      text: 'Scenario completato: superato',
      tone: 'ok',
    })
    expect(describeEvent(ev('scenario.ended', { reason: 'completed', outcome: 'failed' }), catalog).tone).toBe('errore')
    expect(describeEvent(ev('scenario.ended', { reason: 'aborted_by_participant', outcome: null }), catalog).text).toBe(
      'Scenario interrotto dallo studente',
    )
  })

  it('catalogo mancante o rovinato: nessun crash', () => {
    const empty = buildCatalog(null)
    expect(describeEvent(ev('objective.completed', { objectiveId: 'x' }), empty).text).toBe('Obiettivo raggiunto: x')
  })
})

describe('elapsedMs (tempo trascorso, RF-16)', () => {
  const base = { id: 'a1', attempt_number: 1, started_at: '2026-12-10T10:15:00Z', ended_at: null, completion_time_ms: null }

  it('in corso: adesso meno inizio', () => {
    expect(elapsedMs(base, Date.parse('2026-12-10T10:19:07Z'))).toBe(247_000)
  })

  it('orologio del visore avanti: mai negativo', () => {
    expect(elapsedMs(base, Date.parse('2026-12-10T10:14:00Z'))).toBe(0)
  })

  it('finito: vale il tempo calcolato dal visore', () => {
    expect(elapsedMs({ ...base, ended_at: '2026-12-10T10:30:00Z', completion_time_ms: 412_300 }, Date.now())).toBe(412_300)
  })
})

describe('aggiornamenti in tempo reale', () => {
  it('currentAttempt sceglie il tentativo con il numero più alto', () => {
    const a = { id: 'a', attempt_number: 1, started_at: '', ended_at: null, completion_time_ms: null }
    const b = { ...a, id: 'b', attempt_number: 2 }
    expect(currentAttempt([b, a])?.id).toBe('b')
    expect(currentAttempt([])).toBeUndefined()
  })

  it('upsertById aggiorna senza doppioni', () => {
    const list = upsertById([{ id: 'a', v: 1 }], { id: 'a', v: 2 })
    expect(list).toEqual([{ id: 'a', v: 2 }])
    expect(upsertById(list, { id: 'b', v: 1 })).toHaveLength(2)
  })

  it('addEvent ignora i doppioni e tiene il più recente in testa', () => {
    let list = addEvent([], ev('scenario.started', {}, 1))
    list = addEvent(list, ev('choice.made', {}, 3))
    list = addEvent(list, ev('objective.completed', {}, 2))
    list = addEvent(list, ev('choice.made', {}, 3))
    expect(list.map((e) => e.seq)).toEqual([3, 2, 1])
  })
})
