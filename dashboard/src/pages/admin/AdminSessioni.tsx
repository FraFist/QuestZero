// Amministratore: tutte le sessioni di tutti i formatori (RF-22, la RLS gli mostra tutto).
// Le sessioni le crea solo il formatore: qui si consultano e si aprono (vista dal vivo, PDF).
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'
import { formatDateTime } from '../../lib/format'
import { loadScenarioNames, statusLabel, type SessionStatus } from '../../lib/sessions'
import { staffLabel } from '../../lib/admin'

interface Row {
  id: string
  status: SessionStatus
  scenario_id: string
  created_at: string
  trainer_id: string
  participant: { participant_code: string | null } | null
  trainer: { display_name: string | null } | null
}

export function AdminSessioni() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let current = true
    void Promise.all([
      supabase
        .from('sessions')
        .select(
          'id, status, scenario_id, created_at, trainer_id, participant:profiles!sessions_participant_id_fkey(participant_code), trainer:profiles!sessions_trainer_id_fkey(display_name)',
        )
        .order('created_at', { ascending: false })
        .limit(100),
      loadScenarioNames(),
    ]).then(([res, n]) => {
      if (!current) return
      setLoadError(Boolean(res.error))
      setRows((res.data ?? []) as Row[])
      setNames(n)
    })
    return () => {
      current = false
    }
  }, [])

  return (
    <>
      <div className="pagina-testa">
        <div>
          <h1>Sessioni</h1>
          <p>Tutte le sessioni di tutti i formatori, dalla più recente.</p>
        </div>
      </div>

      {loadError && (
        <div className="avviso avviso-errore" role="alert">
          Sessioni non caricate: controlla la connessione e ricarica la pagina.
        </div>
      )}

      {rows === null ? (
        <p className="muted">Caricamento…</p>
      ) : rows.length === 0 ? (
        <section className="carta vuoto">
          <h2>Nessuna sessione</h2>
          <p>Le sessioni compaiono qui quando un formatore le crea.</p>
        </section>
      ) : (
        <div className="tabella-contenitore">
          <table className="tabella">
            <thead>
              <tr>
                <th scope="col">Studente</th>
                <th scope="col">Formatore</th>
                <th scope="col">Scenario</th>
                <th scope="col">Stato</th>
                <th scope="col">Creata</th>
                <th scope="col">
                  <span className="sr-only">Azioni</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="codice">{s.participant?.participant_code ?? '—'}</span>
                  </td>
                  <td>{staffLabel(s.trainer?.display_name, s.trainer_id)}</td>
                  <td>{names.get(s.scenario_id) ?? s.scenario_id}</td>
                  <td>
                    <span className={`esito ${s.status === 'active' ? 'esito-attivo' : 'esito-neutro'}`}>
                      {statusLabel(s.status)}
                    </span>
                  </td>
                  <td className="muted">{formatDateTime(s.created_at)}</td>
                  <td className="azioni">
                    <Link className="btn btn-secondario btn-piccolo" to={`/sessioni/${s.id}`}>
                      Apri
                    </Link>
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
