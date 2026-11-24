// Studenti del formatore: elenco e registrazione (RF-20, RF-22).
// L'elenco legge profiles: la regola RLS restituisce solo gli studenti di chi ha fatto il login.
// Nessuna email in pagina: resta nel sistema di login (RNF-19).
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/format'
import { registerStudent, validateStudentForm, type StudentFormErrors } from '../../lib/students'

interface Student {
  id: string
  participant_code: string | null
  created_at: string
}

export function Studenti() {
  const [students, setStudents] = useState<Student[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  // Cambiarlo fa ricaricare l'elenco (dopo una registrazione).
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let current = true
    void supabase
      .from('profiles')
      .select('id, participant_code, created_at')
      .eq('role', 'participant')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!current) return
        setLoadError(Boolean(error))
        setStudents(data ?? [])
      })
    return () => {
      current = false
    }
  }, [version])

  const load = useCallback(() => setVersion((v) => v + 1), [])

  return (
    <>
      <div className="pagina-testa">
        <div>
          <h1>Studenti</h1>
          <p>Registra chi deve fare la simulazione, poi crea la sua sessione.</p>
        </div>
      </div>

      <RegistraStudente onRegistered={load} />

      <section className="sezione">
        <h2>I tuoi studenti</h2>
        {loadError ? (
          <div className="avviso avviso-errore" role="alert">
            Elenco non caricato: controlla la connessione e ricarica la pagina.
          </div>
        ) : students === null ? (
          <p className="muted">Caricamento…</p>
        ) : students.length === 0 ? (
          <div className="carta vuoto">
            <h3>Nessuno studente registrato</h3>
            <p>Usa il modulo qui sopra: basta il codice dello studente.</p>
          </div>
        ) : (
          <div className="tabella-contenitore">
            <table className="tabella">
              <thead>
                <tr>
                  <th scope="col">Codice studente</th>
                  <th scope="col">Registrato il</th>
                  <th scope="col">
                    <span className="sr-only">Azioni</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="codice">{s.participant_code}</span>
                    </td>
                    <td className="muted">{formatDate(s.created_at)}</td>
                    <td className="azioni">
                      <Link className="btn btn-secondario btn-piccolo" to={`/sessioni/nuova?studente=${s.id}`}>
                        Crea sessione
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function RegistraStudente({ onRegistered }: { onRegistered: () => void }) {
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<StudentFormErrors>({})
  const [status, setStatus] = useState<{ kind: 'ok' | 'errore'; text: string } | null>(null)
  const [sending, setSending] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus(null)
    const found = validateStudentForm(code, email)
    setErrors(found)
    if (found.participantCode) return codeRef.current?.focus()
    if (found.email) return emailRef.current?.focus()

    setSending(true)
    const result = await registerStudent(code, email)
    setSending(false)

    if (!result.ok) {
      if (result.field) {
        setErrors({ [result.field]: result.message })
        ;(result.field === 'participantCode' ? codeRef : emailRef).current?.focus()
      } else {
        setStatus({ kind: 'errore', text: result.message })
      }
      return
    }

    setStatus({
      kind: 'ok',
      text: result.invited
        ? `Studente ${result.participantCode} registrato. Riceverà un'email per scegliere la password.`
        : `Studente ${result.participantCode} registrato. Puoi creare subito la sua sessione.`,
    })
    setCode('')
    setEmail('')
    setErrors({})
    onRegistered()
  }

  return (
    <section className="carta sezione">
      <div>
        <h2>Registra uno studente</h2>
        <p className="muted">
          Con l'email lo studente riceve un invito e potrà vedere i suoi risultati. Senza email puoi comunque
          creare le sue sessioni.
        </p>
      </div>
      <form className="modulo-riga" onSubmit={onSubmit} noValidate>
        <div className="campo">
          <label htmlFor="codice">Codice studente</label>
          <input
            id="codice"
            ref={codeRef}
            className="input codice"
            autoComplete="off"
            spellCheck={false}
            placeholder="P-0042"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={errors.participantCode ? true : undefined}
            aria-describedby={errors.participantCode ? 'codice-errore' : undefined}
          />
          {errors.participantCode && (
            <span id="codice-errore" className="errore-campo">
              {errors.participantCode}
            </span>
          )}
        </div>
        <div className="campo">
          <label htmlFor="email-studente">Email (facoltativa)</label>
          <input
            id="email-studente"
            ref={emailRef}
            className="input"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'email-errore' : undefined}
          />
          {errors.email && (
            <span id="email-errore" className="errore-campo">
              {errors.email}
            </span>
          )}
        </div>
        <button className="btn btn-primario" type="submit" disabled={sending}>
          {sending ? 'Registrazione…' : 'Registra studente'}
        </button>
      </form>
      <p className={`stato-modulo${status ? ` ${status.kind}` : ''}`} role="status">
        {status?.text ?? ''}
      </p>
    </section>
  )
}
