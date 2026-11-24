import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { formatPairingCode, msUntil, statusLabel } = await import('./sessions')

describe('codice di abbinamento (RF-11, contratto "Avvio sul visore")', () => {
  it('si mostra in due gruppi da tre cifre', () => {
    expect(formatPairingCode('482913')).toBe('482 913')
    expect(formatPairingCode('007001')).toBe('007 001')
  })

  it('il tempo rimasto scende fino a zero e non diventa negativo', () => {
    const expires = '2026-11-25T10:10:00Z'
    expect(msUntil(expires, Date.parse('2026-11-25T10:00:00Z'))).toBe(600_000)
    expect(msUntil(expires, Date.parse('2026-11-25T10:09:59Z'))).toBe(1_000)
    expect(msUntil(expires, Date.parse('2026-11-25T10:11:00Z'))).toBe(0)
  })
})

describe('statusLabel (RF-23)', () => {
  it('traduce i tre stati della sessione', () => {
    expect(statusLabel('waiting')).toBe('In attesa del visore')
    expect(statusLabel('active')).toBe('In corso')
    expect(statusLabel('closed')).toBe('Chiusa')
  })
})
