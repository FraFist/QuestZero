import { describe, expect, it } from 'vitest'
import { countText, toBars } from './frequent'

describe('toBars (RF-18: errori e zone contati insieme)', () => {
  const rows = [
    { kind: 'zone', code: 'zona-fumo-denso', label: 'Zona di fumo denso', occurrences: 3, sessions: 2 },
    { kind: 'error', code: 'estintore-acqua', label: 'Acqua su incendio elettrico', occurrences: 6, sessions: 4 },
    { kind: 'error', code: 'codice-nuovo', label: null, occurrences: 3, sessions: 1 },
  ]

  it('ordina dal più frequente, a parità in ordine alfabetico', () => {
    expect(toBars(rows).map((b) => b.text)).toEqual(['Acqua su incendio elettrico', 'codice-nuovo', 'Zona di fumo denso'])
  })

  it('la barra più lunga vale 1, le altre in proporzione', () => {
    expect(toBars(rows).map((b) => b.share)).toEqual([1, 0.5, 0.5])
  })

  it('distingue errori e zone; senza etichetta usa il codice', () => {
    const bars = toBars(rows)
    expect(bars.find((b) => b.text === 'Zona di fumo denso')?.kind).toBe('zona')
    expect(bars.find((b) => b.text === 'codice-nuovo')?.kind).toBe('errore')
  })

  it('nessun dato: nessuna barra', () => {
    expect(toBars([])).toEqual([])
  })
})

describe('countText', () => {
  it('singolare e plurale', () => {
    expect(countText(1, 1)).toBe('1 volta in 1 sessione')
    expect(countText(12, 5)).toBe('12 volte in 5 sessioni')
  })
})
