import { describe, expect, it, vi } from 'vitest'

// students.ts importa il client Supabase, che senza .env.local si ferma: qui non serve.
vi.mock('./supabase', () => ({ supabase: {} }))

const { validateStudentForm, registerErrorFromResponse } = await import('./students')

describe('validateStudentForm (RF-20: codice obbligatorio, email facoltativa)', () => {
  it('codice valido senza email: nessun errore', () => {
    expect(validateStudentForm('P-0042', '')).toEqual({})
  })

  it('codice con spazi intorno: viene accettato (si tolgono gli spazi)', () => {
    expect(validateStudentForm('  P-0042 ', '')).toEqual({})
  })

  it('codice mancante: errore sul codice', () => {
    expect(validateStudentForm('', '').participantCode).toMatch(/Scrivi il codice/)
  })

  it('codice con caratteri non ammessi o troppo lungo: errore sul codice (RNF-19: mai un\'email)', () => {
    expect(validateStudentForm('mario@rossi.it', '').participantCode).toBeDefined()
    expect(validateStudentForm('P 42', '').participantCode).toBeDefined()
    expect(validateStudentForm('x'.repeat(33), '').participantCode).toBeDefined()
  })

  it('email scritta male: errore sull\'email', () => {
    expect(validateStudentForm('P-0042', 'mario.rossi').email).toMatch(/@/)
  })

  it('email corretta: nessun errore', () => {
    expect(validateStudentForm('P-0042', 'mario.rossi@esempio.it')).toEqual({})
  })
})

describe('registerErrorFromResponse (risposte di invite-participant)', () => {
  it('409 codice già usato: errore sul campo codice', () => {
    expect(registerErrorFromResponse(409, 'code_taken')).toMatchObject({ ok: false, field: 'participantCode' })
  })

  it('409 email già usata: errore sul campo email', () => {
    expect(registerErrorFromResponse(409, 'email_taken')).toMatchObject({ ok: false, field: 'email' })
  })

  it('403: solo i formatori registrano studenti (RF-22)', () => {
    const r = registerErrorFromResponse(403, 'forbidden')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/Solo un formatore/)
  })

  it('errore sconosciuto: messaggio generico', () => {
    const r = registerErrorFromResponse(500, 'server_error')
    if (!r.ok) expect(r.message).toMatch(/Riprova/)
  })
})
