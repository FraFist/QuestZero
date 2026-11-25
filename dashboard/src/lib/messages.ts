// Messaggi in italiano per gli errori che l'utente può incontrare.
// Funzioni pure, senza React né Supabase: si testano in messages.test.ts.

interface ErrorLike {
  code?: string
  name?: string
  message?: string
  status?: number
}

/** Errore del login (Supabase Auth) → frase che dice cosa è successo e cosa fare. */
export function loginErrorMessage(error: ErrorLike): string {
  if (error.code === 'invalid_credentials') {
    return 'Email o password non corrette. Controllale e riprova.'
  }
  if (error.code === 'email_not_confirmed') {
    return "L'account non è ancora attivo: apri il link che hai ricevuto via email."
  }
  if (error.code === 'over_request_rate_limit' || error.status === 429) {
    return 'Troppi tentativi di accesso. Aspetta qualche minuto e riprova.'
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return 'Il server non risponde. Controlla la connessione e riprova.'
  }
  return 'Accesso non riuscito. Riprova tra poco.'
}

/** Controllo della nuova password (primo accesso dall'invito): null se va bene. */
export function validateNewPassword(password: string, repeat: string): string | null {
  if (password.length < 8) return 'La password deve avere almeno 8 caratteri.'
  if (password !== repeat) return 'Le due password non coincidono: riscrivile.'
  return null
}

const ROLE_LABELS = {
  trainer: 'Formatore',
  participant: 'Studente',
  admin: 'Amministratore',
} as const

export function roleLabel(role: keyof typeof ROLE_LABELS): string {
  return ROLE_LABELS[role]
}
