// Accesso con email e password (Supabase Auth), per formatori, studenti e amministratori.
// Non esiste la registrazione libera (RF-20): gli account li crea il formatore o l'amministratore.
// "Password dimenticata?" manda un link di recupero; la pagina ImpostaPassword fa scegliere la nuova.
import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import { loginErrorMessage } from '../lib/messages'
import logoBianco from '../assets/questzero-orizzontale-bianco.svg'
import simbolo from '../assets/questzero-simbolo-bianco.svg'

const PUNTI = [
  { titolo: 'Si impara facendo', testo: 'Situazioni di rischio vissute nel visore, senza rischi veri.' },
  { titolo: 'Ogni scelta è un dato', testo: 'Errori, tempi e obiettivi arrivano qui, sessione per sessione.' },
  {
    titolo: 'Per ogni ruolo',
    testo: 'Il formatore segue la sessione dal vivo, lo studente rivede i suoi risultati.',
  },
]

export function Login() {
  const auth = useAuth()
  const [mode, setMode] = useState<'accesso' | 'recupero'>('accesso')

  if (auth.status === 'signed_in' || auth.status === 'no_profile') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="accesso">
      <img className="accesso-rilievo" src={simbolo} alt="" aria-hidden="true" />

      <div className="accesso-logo">
        <img src={logoBianco} alt="QuestZero" />
      </div>

      <div className="accesso-racconto">
        <p className="accesso-titolo">Sbagliare qui costa zero.</p>
        <p className="accesso-sottotitolo">Le emergenze si provano nel visore. I risultati si leggono qui.</p>
        <ul className="accesso-punti">
          {PUNTI.map((p) => (
            <li key={p.titolo}>
              <strong>{p.titolo}</strong>
              <span>{p.testo}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="accesso-colonna">
        <main className="accesso-targa">
          {mode === 'accesso' ? (
            <ModuloAccesso onForgot={() => setMode('recupero')} />
          ) : (
            <ModuloRecupero onBack={() => setMode('accesso')} />
          )}
        </main>
        <p className="accesso-nota">Non hai un account? Lo crea il tuo formatore o l'amministratore.</p>
      </div>
    </div>
  )
}

function ModuloAccesso({ onForgot }: { onForgot: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSending(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setSending(false)
    if (error) setError(loginErrorMessage(error))
  }

  return (
    <>
      <div className="accesso-intesta">
        <h1>Accedi alla dashboard</h1>
        <p>Per formatori, studenti e amministratori.</p>
      </div>
      <form className="modulo" onSubmit={onSubmit} noValidate>
        <div className="campo">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            placeholder="nome@azienda.it"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="campo">
          <div className="campo-riga">
            <label htmlFor="password">Password</label>
            <button type="button" className="link-pulsante" onClick={onForgot}>
              Password dimenticata?
            </button>
          </div>
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
        {error && (
          <p className="stato-modulo errore" role="alert">
            {error}
          </p>
        )}
      </form>
    </>
  )
}

function ModuloRecupero({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSending(true)
    // Il link porta alla dashboard con type=recovery: lì si sceglie la nuova password.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    setSending(false)
    // Stessa risposta che l'email esista o no: non si rivela chi ha un account.
    if (error && error.status !== 400) setError(loginErrorMessage(error))
    else setSent(true)
  }

  return (
    <>
      <div className="accesso-intesta">
        <h1>Recupera la password</h1>
        <p>Ti mandiamo un link per sceglierne una nuova.</p>
      </div>
      {sent ? (
        <div className="modulo">
          <p className="stato-modulo ok" role="status">
            Se {email.trim()} ha un account, riceverai a breve l'email con il link.
          </p>
          <button className="btn btn-secondario" type="button" onClick={onBack}>
            Torna all'accesso
          </button>
        </div>
      ) : (
        <form className="modulo" onSubmit={onSubmit} noValidate>
          <div className="campo">
            <label htmlFor="email-recupero">Email</label>
            <input
              id="email-recupero"
              className="input"
              type="email"
              autoComplete="username"
              placeholder="nome@azienda.it"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button className="btn btn-primario" type="submit" disabled={sending || !email.includes('@')}>
            {sending ? 'Invio…' : 'Manda il link'}
          </button>
          <button className="link-pulsante" type="button" onClick={onBack}>
            Torna all'accesso
          </button>
          {error && (
            <p className="stato-modulo errore" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </>
  )
}
