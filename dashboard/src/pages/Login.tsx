// Accesso con email e password (Supabase Auth). Non esiste la registrazione libera (RF-20):
// gli account li crea l'amministratore (formatori) o il formatore (studenti, con invito).
import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import { loginErrorMessage } from '../lib/messages'
import logoBianco from '../assets/questzero-orizzontale-bianco.svg'

export function Login() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  if (auth.status === 'signed_in' || auth.status === 'no_profile') {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSending(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setSending(false)
    if (error) setError(loginErrorMessage(error))
  }

  return (
    <div className="accesso">
      <div className="accesso-logo">
        <img src={logoBianco} alt="QuestZero" />
      </div>

      <p className="accesso-titolo">Segui ogni studente mentre affronta l'incendio.</p>

      <main className="accesso-targa">
        <h1>Accedi</h1>
        <form className="modulo" onSubmit={onSubmit} noValidate>
          <div className="campo">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primario" type="submit" disabled={sending || !email || !password}>
            {sending ? 'Accesso in corso…' : 'Accedi'}
          </button>
          <p className={`stato-modulo${error ? ' errore' : ''}`} role="status">
            {error ?? ''}
          </p>
        </form>
        <p className="accesso-nota">
          Non hai un account? Lo crea il tuo formatore o l'amministratore: non serve registrarsi.
        </p>
      </main>
    </div>
  )
}
