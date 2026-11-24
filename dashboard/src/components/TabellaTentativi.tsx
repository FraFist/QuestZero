// Tabella dei tentativi con esito, punti, livello ed errori (RF-17; riusata per RF-21).
// Ogni riga si apre per mostrare gli errori del tentativo con le etichette del catalogo.
import { Fragment, useState } from 'react'
import { Link } from 'react-router'
import { formatClock, formatDateTime, formatDuration } from '../lib/format'
import {
  OUTCOME_CLASSES,
  OUTCOME_LABELS,
  outcomeOf,
  yesNo,
  type AttemptOverview,
  type ErrorItem,
} from '../lib/results'

export function TabellaTentativi({
  attempts,
  errors,
  sessionLink = true,
}: {
  attempts: AttemptOverview[]
  errors: Map<string, ErrorItem[]>
  /** Il formatore può aprire la sessione; lo studente no. */
  sessionLink?: boolean
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="tabella-contenitore">
      <table className="tabella">
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Scenario</th>
            <th scope="col">Esito</th>
            <th scope="col" className="num">Punti</th>
            <th scope="col" className="num">Livello</th>
            <th scope="col" className="num">Errori</th>
            <th scope="col" className="num">Tempo</th>
            <th scope="col">Sequenza rispettata</th>
            <th scope="col">
              <span className="sr-only">Dettagli</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => {
            const outcome = outcomeOf(a)
            const list = errors.get(a.attempt_id) ?? []
            const isOpen = open.has(a.attempt_id)
            const detailId = `dettaglio-${a.attempt_id}`
            return (
              <Fragment key={a.attempt_id}>
                <tr>
                  <td className="muted">
                    {formatDateTime(a.started_at)}
                    {a.attempt_number > 1 && <span className="tentativo-n">, tentativo {a.attempt_number}</span>}
                  </td>
                  <td>{a.scenario_name ?? a.scenario_id}</td>
                  <td>
                    <span className={`esito ${OUTCOME_CLASSES[outcome]}`}>{OUTCOME_LABELS[outcome]}</span>
                  </td>
                  <td className="num">{a.points_total}</td>
                  <td className="num">{a.level ?? '—'}</td>
                  <td className="num">{a.errors_total}</td>
                  <td className="num">{a.completion_time_ms !== null ? formatDuration(a.completion_time_ms) : '—'}</td>
                  <td>{yesNo(a.sequence_respected)}</td>
                  <td className="azioni">
                    <button
                      type="button"
                      className="btn btn-secondario btn-piccolo"
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      onClick={() => toggle(a.attempt_id)}
                    >
                      {isOpen ? 'Chiudi' : 'Errori'}
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="riga-dettaglio" id={detailId}>
                    <td colSpan={9}>
                      <div className="dettaglio">
                        {list.length === 0 ? (
                          <p className="muted">Nessun errore in questo tentativo.</p>
                        ) : (
                          <ol className="elenco-errori">
                            {list.map((e) => (
                              <li key={e.key}>
                                <time className="num muted" dateTime={e.at}>
                                  {formatClock(e.at)}
                                </time>
                                <span>{e.kind === 'zona' ? `Zona di pericolo: ${e.text}` : e.text}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                        {sessionLink && (
                          <Link className="link" to={`/sessioni/${a.session_id}`}>
                            Apri la sessione
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
