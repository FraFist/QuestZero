// Amministratore: tutti gli studenti e spostamento tra formatori (RF-22).
// Solo l'amministratore può aggiornare i profili (regola profiles_update_admin nel database).
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/format'
import { staffLabel } from '../../lib/admin'

interface Student {
  id: string
  participant_code: string | null
  created_at: string
  trainer_id: string | null
}
interface Trainer {
  id: string
  label: string
}

export function AdminStudenti() {
  const [students, setStudents] = useState<Student[] | null>(null)
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [loadError, setLoadError] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'errore'; text: string } | null>(null)

  useEffect(() => {
    let current = true
    void Promise.all([
      supabase
        .from('profiles')
        .select('id, participant_code, created_at, trainer_id')
        .eq('role', 'participant')
        .order('participant_code'),
      supabase.from('profiles').select('id, display_name').eq('role', 'trainer'),
    ]).then(([st, tr]) => {
      if (!current) return
      setLoadError(Boolean(st.error || tr.error))
      setStudents(st.data ?? [])
      setTrainers(
        (tr.data ?? [])
          .map((t) => ({ id: t.id, label: staffLabel(t.display_name, t.id) }))
          .sort((a, b) => a.label.localeCompare(b.label, 'it')),
      )
    })
    return () => {
      current = false
    }
  }, [])

  async function move(student: Student, trainerId: string) {
    setStatus(null)
    const { error } = await supabase.from('profiles').update({ trainer_id: trainerId }).eq('id', student.id)
    if (error) {
      setStatus({ kind: 'errore', text: `${student.participant_code} non spostato: riprova.` })
      return
    }
    setStudents((list) => list?.map((s) => (s.id === student.id ? { ...s, trainer_id: trainerId } : s)) ?? null)
    const to = trainers.find((t) => t.id === trainerId)?.label ?? 'il nuovo formatore'
    setStatus({ kind: 'ok', text: `${student.participant_code} ora è di ${to}. Le sue sessioni passate restano al formatore che le ha create.` })
  }

  return (
    <>
      <div className="pagina-testa">
        <div>
          <h1>Studenti</h1>
          <p>Tutti gli studenti. Cambia il formatore per spostare uno studente.</p>
        </div>
      </div>

      {loadError && (
        <div className="avviso avviso-errore" role="alert">
          Studenti non caricati: controlla la connessione e ricarica la pagina.
        </div>
      )}
      <p className={`stato-modulo${status ? ` ${status.kind}` : ''}`} role="status">
        {status?.text ?? ''}
      </p>

      {students === null ? (
        <p className="muted">Caricamento…</p>
      ) : students.length === 0 ? (
        <section className="carta vuoto">
          <h2>Nessuno studente</h2>
          <p>Gli studenti li registrano i formatori dalla loro pagina Studenti.</p>
        </section>
      ) : (
        <div className="tabella-contenitore">
          <table className="tabella">
            <thead>
              <tr>
                <th scope="col">Codice studente</th>
                <th scope="col">Registrato il</th>
                <th scope="col">Formatore</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link className="codice link-codice" to={`/studenti/${s.id}`} aria-label={`Risultati di ${s.participant_code}`}>
                      {s.participant_code}
                    </Link>
                  </td>
                  <td className="muted">{formatDate(s.created_at)}</td>
                  <td>
                    <label className="sr-only" htmlFor={`formatore-${s.id}`}>
                      Formatore di {s.participant_code}
                    </label>
                    <select
                      id={`formatore-${s.id}`}
                      className="select select-tabella"
                      value={s.trainer_id ?? ''}
                      onChange={(e) => void move(s, e.target.value)}
                    >
                      {trainers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
