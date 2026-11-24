import { describe, expect, it } from 'vitest'
import { formatClock, formatDate, formatDateTime, formatDuration, formatTime } from './format'

describe('formatDuration (tempo trascorso e codice in scadenza, RF-16)', () => {
  it('secondi e minuti', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(7_000)).toBe('0:07')
    expect(formatDuration(247_900)).toBe('4:07')
  })

  it('oltre l\'ora', () => {
    expect(formatDuration(3_727_000)).toBe('1:02:07')
  })

  it('negativo (orologio del visore avanti): zero', () => {
    expect(formatDuration(-5_000)).toBe('0:00')
  })
})

describe('date nel fuso di Roma', () => {
  it('una data UTC di sera diventa il giorno dopo in Italia', () => {
    expect(formatDate('2026-11-25T23:30:00Z')).toBe('26 nov 2026')
  })

  it('data e ora, e solo ora', () => {
    expect(formatDateTime('2026-11-25T13:05:00Z')).toBe('25 nov, 14:05')
    expect(formatTime('2026-07-01T08:00:00Z')).toBe('10:00')
    expect(formatClock('2026-12-10T10:15:32.481Z')).toBe('11:15:32')
  })
})
