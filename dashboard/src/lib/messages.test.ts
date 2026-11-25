import { describe, expect, it } from 'vitest'
import { loginErrorMessage, roleLabel, validateNewPassword } from './messages'

describe('loginErrorMessage (login della dashboard, RF-20/RF-22)', () => {
  it('credenziali sbagliate: dice di controllarle', () => {
    expect(loginErrorMessage({ code: 'invalid_credentials', status: 400 })).toMatch(/non corrette/)
  })

  it('account invitato non ancora attivato: rimanda al link email', () => {
    expect(loginErrorMessage({ code: 'email_not_confirmed' })).toMatch(/link/)
  })

  it('troppi tentativi: chiede di aspettare', () => {
    expect(loginErrorMessage({ status: 429 })).toMatch(/Aspetta/)
  })

  it('server irraggiungibile: parla della connessione', () => {
    expect(loginErrorMessage({ name: 'AuthRetryableFetchError', status: 0 })).toMatch(/connessione/)
  })

  it('errore sconosciuto: messaggio generico, mai il testo tecnico', () => {
    const msg = loginErrorMessage({ message: 'Database error querying schema' })
    expect(msg).not.toMatch(/Database/)
  })
})

describe('validateNewPassword (primo accesso dall\'invito, RF-20)', () => {
  it('troppo corta', () => {
    expect(validateNewPassword('1234567', '1234567')).toMatch(/8 caratteri/)
  })
  it('le due password non coincidono', () => {
    expect(validateNewPassword('password-lunga', 'password-lungo')).toMatch(/non coincidono/)
  })
  it('valida', () => {
    expect(validateNewPassword('password-lunga', 'password-lunga')).toBeNull()
  })
})

describe('roleLabel', () => {
  it('traduce i tre ruoli', () => {
    expect(roleLabel('trainer')).toBe('Formatore')
    expect(roleLabel('participant')).toBe('Studente')
    expect(roleLabel('admin')).toBe('Amministratore')
  })
})
