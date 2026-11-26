// Primo accesso dal link di invito (RF-20, RF-21): lo studente sceglie la propria password.
// Stessa grafica della pagina di accesso. Dopo, entra normalmente nella dashboard.
import { useState, type FormEvent } from 'react'
import { supabase, passwordSet } from '../lib/supabase'
import { validateNewPassword } from '../lib/messages'
import logoBianco from '../assets/questzero-orizzontale-bianco.svg'
import simbolo from '../assets/questzero-simbolo-bianco.svg'

export function ImpostaPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const problem = validateNewPassword(password, repeat)
    setError(problem)
    if (problem) return
    setSending(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSending(false)
    if (error) {
      setError(
        error.code === 'weak_password'
          ? 'Password troppo debole: allungala o aggiungi numeri e simboli.'
          : 'Password non salvata. Riprova tra poco.',
      )
      return
    }
    passwordSet()
    onDone()
  }

  return (
    <div className="accesso">
      <img className="accesso-rilievo" src={simbolo} alt="" aria-hidden="true" />
      <div className="accesso-logo">
        <img src={logoBianco} alt="QuestZero" />
      </div>

      <div className="accesso-racconto">
        <p className="accesso-titolo">Benvenuto in QuestZero.</p>
        <p className="accesso-sottotitolo">Le emergenze si provano nel visore. I risultati si leggono qui.</p>
      </div>

      <div className="accesso-colonna">
      <main className="accesso-targa">
        <div className="accesso-intesta">
          <h1>Scegli la password</h1>
          <p>La userai con la tua email per entrare.</p>
        </div>
        <form className="modulo" onSubmit={onSubmit} noValidate>
          <div className="campo">
            <label htmlFor="nuova-password">Nuova password</label>
            <input
              id="nuova-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="aiuto">Almeno 8 caratteri.</span>
          </div>
          <div className="campo">
            <label htmlFor="ripeti-password">Ripeti la password</label>
            <input
              id="ripeti-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </div>
          <button className="btn btn-primario" type="submit" disabled={sending}>
            {sending ? 'Salvataggio…' : 'Salva la password'}
          </button>
          <p className={`stato-modulo${error ? ' errore' : ''}`} role="status">
            {error ?? ''}
          </p>
        </form>
      </main>
      </div>
    </div>
  )
}
