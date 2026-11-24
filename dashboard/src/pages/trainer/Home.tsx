// Pagina iniziale del formatore: sessioni aperte in alto (vista della sessione in 1 clic, RNF-8),
// sessioni chiuse recenti sotto. Si aggiorna da sola quando cambia una sessione (Realtime).
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'
import { formatDateTime } from '../../lib/format'
import { SESSION_COLUMNS, loadScenarioNames, statusLabel, type SessionRow } from '../../lib/sessions'

export function TrainerHome() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loadError, setLoadError] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let current = true
    void Promise.all([
      supabase.from('sessions').select(SESSION_COLUMNS).order('created_at', { ascending: false }).limit(50),
      loadScenarioNames(),
    ]).then(([res, n]) => {
      if (!current) return
      setLoadError(Boolean(res.error))
      setSessions((res.data ?? []) as SessionRow[])
      setNames(n)
    })
    return () => {
      current = false
    }
  }, [version])

  // Ogni cambio alle sessioni del formatore (la RLS filtra anche Realtime) ricarica l'elenco.
  useEffect(() => {
    const channel = supabase
      .channel('sessioni-formatore')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => setVersion((v) => v + 1))
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  const open = sessions?.filter((s) => s.status !== 'closed') ?? []
  const closed = sessions?.filter((s) => s.status === 'closed') ?? []
  const scenario = (id: string) => names.get(id) ?? id

  return (
    <>
      <div className="pagina-testa">
        <div>
          <h1>Sessioni</h1>
          <p>Apri una sessione in corso per seguirla dal vivo.</p>
        </div>
        <Link className="btn btn-primario" to="/sessioni/nuova">
          Nuova sessione
        </Link>
      </div>

      {loadError && (
        <div className="avviso avviso-errore" role="alert">
          Sessioni non caricate: controlla la connessione e ricarica la pagina.
        </div>
      )}

      {sessions === null ? (
        <p className="muted">Caricamento…</p>
      ) : (
        <>
          <section className="sezione">
            <h2>Aperte</h2>
            {open.length === 0 ? (
              <div className="carta vuoto">
                <h3>Nessuna sessione aperta</h3>
                <p>Crea una sessione per uno studente: ricevi il codice da inserire nel visore.</p>
              </div>
            ) : (
              <div className="elenco-sessioni">
                {open.map((s) => (
                  <Link key={s.id} className="carta sessione-carta" to={`/sessioni/${s.id}`}>
                    <span className={`esito ${s.status === 'active' ? 'esito-attivo' : 'esito-neutro'}`}>
                      {statusLabel(s.status)}
                    </span>
                    <h3 className="codice">{s.participant?.participant_code ?? '—'}</h3>
                    <p className="muted">
                      {scenario(s.scenario_id)}
                      <br />
                      Creata il {formatDateTime(s.created_at)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {closed.length > 0 && (
            <section className="sezione">
              <h2>Chiuse di recente</h2>
              <div className="tabella-contenitore">
                <table className="tabella">
                  <thead>
                    <tr>
                      <th scope="col">Studente</th>
                      <th scope="col">Scenario</th>
                      <th scope="col">Creata</th>
                      <th scope="col">Chiusa</th>
                      <th scope="col">
                        <span className="sr-only">Azioni</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {closed.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="codice">{s.participant?.participant_code ?? '—'}</span>
                        </td>
                        <td>{scenario(s.scenario_id)}</td>
                        <td className="muted">{formatDateTime(s.created_at)}</td>
                        <td className="muted">{s.closed_at ? formatDateTime(s.closed_at) : '—'}</td>
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
            </section>
          )}
        </>
      )}
    </>
  )
}
