// Registrazione di uno studente da parte del formatore (RF-20, RF-22).
// Controlli e messaggi sono funzioni pure, testate in students.test.ts; la chiamata vera
// all'Edge Function "invite-participant" è registerStudent().
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Stesse regole dell'Edge Function e del database (profiles_participant_code_format).
const PARTICIPANT_CODE = /^[A-Za-z0-9_-]{1,32}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface StudentFormErrors {
  participantCode?: string
  email?: string
}

/** Controlla il modulo prima dell'invio; restituisce un errore per campo, vuoto se va tutto bene. */
export function validateStudentForm(participantCode: string, email: string): StudentFormErrors {
  const errors: StudentFormErrors = {}
  const code = participantCode.trim()
  const mail = email.trim()
  if (!code) {
    errors.participantCode = 'Scrivi il codice dello studente, per esempio P-0042.'
  } else if (!PARTICIPANT_CODE.test(code)) {
    errors.participantCode = 'Usa da 1 a 32 caratteri tra lettere, cifre, trattino e trattino basso, senza spazi.'
  }
  if (mail && !EMAIL.test(mail)) {
    errors.email = "Scrivi un indirizzo email completo, con la @, oppure lascia il campo vuoto."
  }
  return errors
}

export type RegisterResult =
  | { ok: true; participantId: string; participantCode: string; invited: boolean }
  | { ok: false; field?: keyof StudentFormErrors; message: string }

/** Risposta di errore dell'Edge Function ({ error, message }) → messaggio per il formatore. */
export function registerErrorFromResponse(status: number, code: string | undefined): RegisterResult {
  switch (code) {
    case 'code_taken':
      return { ok: false, field: 'participantCode', message: 'Questo codice è già usato da un altro studente: scegline un altro.' }
    case 'email_taken':
      return { ok: false, field: 'email', message: 'Esiste già un account con questa email.' }
    case 'bad_request':
      return { ok: false, message: 'Controlla codice ed email: il server non li ha accettati.' }
  }
  if (status === 401) return { ok: false, message: 'La sessione di accesso è scaduta: esci e rientra.' }
  if (status === 403) return { ok: false, message: 'Solo un formatore può registrare studenti.' }
  return { ok: false, message: 'Registrazione non riuscita. Riprova tra poco.' }
}

export async function registerStudent(participantCode: string, email: string): Promise<RegisterResult> {
  const body: Record<string, string> = { participantCode: participantCode.trim() }
  if (email.trim()) body.email = email.trim()

  const { data, error } = await supabase.functions.invoke('invite-participant', { body })
  if (!error) {
    return { ok: true, ...(data as { participantId: string; participantCode: string; invited: boolean }) }
  }
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    return registerErrorFromResponse(response.status, payload.error)
  }
  if (error instanceof FunctionsFetchError) {
    return { ok: false, message: 'Il server non risponde. Controlla la connessione e riprova.' }
  }
  return { ok: false, message: 'Registrazione non riuscita. Riprova tra poco.' }
}
