// Amministratore: formatori e amministratori, con nome e ruolo (RF-22).
// Gli account si creano dal sito di Supabase (docs/stato.md, passaggi manuali 3 e 4):
// qui si dà loro un nome e si cambia il ruolo tra formatore e amministratore.
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth-context'
import { roleChangeBlock, validateStaffName, type StaffRole } from '../../lib/admin'

interface Person {
  id: string
  role: StaffRole
  display_name: string | null
  students: number
}

export function AdminFormatori() {
  const auth = useAuth()
  const selfId = auth.status === 'signed_in' ? auth.session.user.id : ''
  const [people, setPeople] = useState<Person[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'errore'; text: string } | null>(null)

  useEffect(() => {
    let current = true
    void Promise.all([
      supabase.from('profiles').select('id, role, display_name').in('role', ['trainer', 'admin']),
      supabase.from('profiles').select('trainer_id').eq('role', 'participant'),
    ]).then(([staff, studs]) => {
      if (!current) return
      setLoadError(Boolean(staff.error || studs.error))
      const counts = new Map<string, number>()
      for (const s of studs.data ?? []) if (s.trainer_id) counts.set(s.trainer_id, (counts.get(s.trainer_id) ?? 0) + 1)
      setPeople(
        (staff.data ?? [])
          .map((p) => ({ id: p.id, role: p.role as StaffRole, display_name: p.display_name, students: counts.get(p.id) ?? 0 }))
          .sort((a, b) => (a.role === b.role ? (a.display_name ?? '').localeCompare(b.display_name ?? '', 'it') : a.role === 'trainer' ? -1 : 1)),
      )
    })
    return () => {
      current = false
    }
  }, [])

  function update(id: string, change: Partial<Person>) {
    setPeople((list) => list?.map((p) => (p.id === id ? { ...p, ...change } : p)) ?? null)
  }

  async function changeRole(person: Person, role: StaffRole) {
    setStatus(null)
    const { error } = await supabase.from('profiles').update({ role }).eq('id', person.id)
    if (error) {
      setStatus({ kind: 'errore', text: 'Ruolo non cambiato: riprova.' })
      return
    }
    update(person.id, { role })
    setStatus({ kind: 'ok', text: `${person.display_name ?? 'Utente'} ora è ${role === 'admin' ? 'amministratore' : 'formatore'}.` })
  }

  return (
    <>
      <div className="pagina-testa">
        <div>
          <h1>Formatori</h1>
          <p>Dai un nome a formatori e amministratori, così li riconosci quando sposti gli studenti.</p>
        </div>
      </div>

      {loadError && (
        <div className="avviso avviso-errore" role="alert">
          Elenco non caricato: controlla la connessione e ricarica la pagina.
        </div>
      )}
      <p className={`stato-modulo${status ? ` ${status.kind}` : ''}`} role="status">
        {status?.text ?? ''}
      </p>

      {people === null ? (
        <p className="muted">Caricamento…</p>
      ) : (
        <div className="tabella-contenitore">
          <table className="tabella">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Ruolo</th>
                <th scope="col" className="num">Studenti</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const block = roleChangeBlock(p, selfId, p.students)
                return (
                  <tr key={p.id}>
                    <td>
                      <NomeModificabile
                        person={p}
                        onSaved={(name) => {
                          update(p.id, { display_name: name })
                          setStatus({ kind: 'ok', text: `Nome salvato: ${name}.` })
                        }}
                        onError={() => setStatus({ kind: 'errore', text: 'Nome non salvato: riprova.' })}
                      />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`ruolo-${p.id}`}>
                        Ruolo di {p.display_name ?? 'questo utente'}
                      </label>
                      <select
                        id={`ruolo-${p.id}`}
                        className="select select-tabella"
                        value={p.role}
                        disabled={block !== null}
                        aria-describedby={block ? `blocco-${p.id}` : undefined}
                        onChange={(e) => void changeRole(p, e.target.value as StaffRole)}
                      >
                        <option value="trainer">Formatore</option>
                        <option value="admin">Amministratore</option>
                      </select>
                      {block && (
                        <span id={`blocco-${p.id}`} className="aiuto-tabella">
                          {block}
                        </span>
                      )}
                    </td>
                    <td className="num">{p.role === 'trainer' ? p.students : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted nota-pagina">
        Per aggiungere un formatore crea l'account dal sito di Supabase (Authentication, Add user) e assegnagli il
        ruolo: i passaggi sono in docs/stato.md. Poi dagli un nome qui.
      </p>
    </>
  )
}

function NomeModificabile({
  person,
  onSaved,
  onError,
}: {
  person: Person
  onSaved: (name: string) => void
  onError: () => void
}) {
  const [value, setValue] = useState(person.display_name ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const changed = value.trim() !== (person.display_name ?? '')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const p = validateStaffName(value)
    setProblem(p)
    if (p) return
    setSaving(true)
    const name = value.trim()
    const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', person.id)
    setSaving(false)
    if (error) onError()
    else onSaved(name)
  }

  return (
    <form className="nome-riga" onSubmit={onSubmit} noValidate>
      <label className="sr-only" htmlFor={`nome-${person.id}`}>
        Nome
      </label>
      <input
        id={`nome-${person.id}`}
        className="input input-tabella"
        value={value}
        placeholder="Senza nome"
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `nome-errore-${person.id}` : undefined}
      />
      {changed && (
        <button className="btn btn-secondario btn-piccolo" type="submit" disabled={saving}>
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      )}
      {problem && (
        <span id={`nome-errore-${person.id}`} className="errore-campo">
          {problem}
        </span>
      )}
    </form>
  )
}
