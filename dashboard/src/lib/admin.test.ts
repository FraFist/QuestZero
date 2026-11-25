import { describe, expect, it } from 'vitest'
import { roleChangeBlock, staffLabel, validateStaffName } from './admin'

describe('staffLabel (RF-22: riconoscere i formatori)', () => {
  it('usa il nome se c\'è', () => {
    expect(staffLabel('Anna Bianchi', '3f9c2a11-0000')).toBe('Anna Bianchi')
  })
  it('senza nome: riferimento corto all\'identificativo', () => {
    expect(staffLabel(null, '3f9c2a11-0000')).toBe('Senza nome (3f9c2a)')
    expect(staffLabel('   ', '3f9c2a11-0000')).toBe('Senza nome (3f9c2a)')
  })
})

describe('roleChangeBlock (RF-22)', () => {
  it('l\'amministratore non cambia il proprio ruolo', () => {
    expect(roleChangeBlock({ id: 'me', role: 'admin' }, 'me', 0)).toMatch(/tuo ruolo/)
  })
  it('un formatore con studenti non diventa amministratore', () => {
    expect(roleChangeBlock({ id: 't', role: 'trainer' }, 'me', 3)).toMatch(/3 studenti/)
    expect(roleChangeBlock({ id: 't', role: 'trainer' }, 'me', 1)).toMatch(/1 studente: spostalo/)
  })
  it('negli altri casi si può', () => {
    expect(roleChangeBlock({ id: 't', role: 'trainer' }, 'me', 0)).toBeNull()
    expect(roleChangeBlock({ id: 'a', role: 'admin' }, 'me', 0)).toBeNull()
  })
})

describe('validateStaffName', () => {
  it('vuoto o troppo lungo: errore', () => {
    expect(validateStaffName('  ')).toMatch(/Scrivi un nome/)
    expect(validateStaffName('x'.repeat(81))).toMatch(/80/)
  })
  it('valido', () => {
    expect(validateStaffName(' Anna Bianchi ')).toBeNull()
  })
})
