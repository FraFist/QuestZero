// Elenco delle sessioni con ricerca e filtri (formatore e amministratore).
// Mostra com'è andata (esito, punti, errori, durata) invece dei metadati; tutta la riga apre la
// sessione. Esiti dall'ultimo tentativo di ogni sessione, come li ha calcolati il visore (RF-8).
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { formatDateTime, formatDuration } from '../lib/format'
import {
  NO_FILTERS,
  STATE_CLASSES,
  STATE_LABELS,
  countLabel,
  filterSessions,
  latestAttempts,
  listState,
  type AttemptSummary,
  type Filters,
  type ListState,
  type SessionListItem,
} from '../lib/sessionList'

const STATE_OPTIONS: ListState[] = ['superato', 'non-superato', 'interrotto', 'in-corso', 'in-attesa', 'senza-tentativi']

export function ElencoSessioni({
  sessions,
  showTrainer = false,
  scenarioNames,
}: {
  sessions: SessionListItem[]
  showTrainer?: boolean
  scenarioNames: Map<string, string>
}) {
  const navigate = useNavigate()
  const [attempts, setAttempts] = useState<Map<string, AttemptSummary>>(new Map())
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  // Momento di riferimento per il filtro del periodo, fissato all'apertura della pagina.
  const [now] = useState(() => Date.now())

  const ids = useMemo(() => sessions.map((s) => s.id), [sessions])

  useEffect(() => {
    if (ids.length === 0) return
    let current = true
    void supabase
      .from('attempt_overview')
      .select('session_id, attempt_number, ended_at, end_reason, outcome, points_total, errors_total, completion_time_ms')
      .in('session_id', ids)
      .then(({ data }) => {
        if (current) setAttempts(latestAttempts((data ?? []) as AttemptSummary[]))
      })
    return () => {
      current = false
    }
  }, [ids])

  const items = sessions.map((s) => ({ ...s, attempt: attempts.get(s.id) }))
  const shown = filterSessions(items, filters, now)
  const trainers = [...new Set(sessions.map((s) => s.trainerName).filter(Boolean))].sort() as string[]
  const manyScenarios = new Set(sessions.map((s) => s.scenarioId)).size > 1
  const set = (change: Partial<Filters>) => setFilters((f) => ({ ...f, ...change }))
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)

  return (
    <div className="elenco">
      <div className="strumenti" role="search">
        <label className="sr-only" htmlFor="cerca-sessioni">
          Cerca per codice studente
        </label>
        <input
          id="cerca-sessioni"
          className="input input-strumenti"
          type="search"
          placeholder="Cerca codice studente"
          value={filters.query}
          onChange={(e) => set({ query: e.target.value })}
        />
        <label className="sr-only" htmlFor="filtro-esito">
          Esito
        </label>
        <select
          id="filtro-esito"
          className="select input-strumenti"
          value={filters.state}
          onChange={(e) => set({ state: e.target.value as Filters['state'] })}
        >
          <option value="tutti">Tutti gli esiti</option>
          {STATE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATE_LABELS[s]}
            </option>
          ))}
        </select>
        {showTrainer && trainers.length > 1 && (
          <>
            <label className="sr-only" htmlFor="filtro-formatore">
              Formatore
            </label>
            <select
              id="filtro-formatore"
              className="select input-strumenti"
              value={filters.trainer}
              onChange={(e) => set({ trainer: e.target.value })}
            >
              <option value="">Tutti i formatori</option>
              {trainers.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </>
        )}
        <label className="sr-only" htmlFor="filtro-periodo">
          Periodo
        </label>
        <select
          id="filtro-periodo"
          className="select input-strumenti"
          value={filters.period}
          onChange={(e) => set({ period: e.target.value as Filters['period'] })}
        >
          <option value="tutte">Da sempre</option>
          <option value="7">Ultimi 7 giorni</option>
          <option value="30">Ultimi 30 giorni</option>
        </select>
        <span className="conteggio" aria-live="polite">
          {countLabel(shown.length, items.length)}
        </span>
        {filtered && (
          <button type="button" className="link-pulsante" onClick={() => setFilters(NO_FILTERS)}>
            Togli i filtri
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="vuoto-elenco">
          {items.length === 0
            ? 'Nessuna sessione ancora.'
            : 'Nessuna sessione con questi filtri. Cambia la ricerca o togli i filtri.'}
        </div>
      ) : (
        <div className="tabella-contenitore">
          <table className="tabella tabella-cliccabile">
            <thead>
              <tr>
                <th scope="col">Studente</th>
                {showTrainer && <th scope="col">Formatore</th>}
                {manyScenarios && <th scope="col">Scenario</th>}
                <th scope="col">Data</th>
                <th scope="col">Esito</th>
                <th scope="col" className="num">Punti</th>
                <th scope="col" className="num">Errori</th>
                <th scope="col" className="num">Durata</th>
                <th scope="col">
                  <span className="sr-only">Apri</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const state = listState(s)
                const a = s.attempt
                const done = a && a.ended_at
                return (
                  <tr key={s.id} onClick={() => navigate(`/sessioni/${s.id}`)}>
                    <td>
                      <Link className="link-riga codice" to={`/sessioni/${s.id}`}>
                        {s.participantCode}
                      </Link>
                    </td>
                    {showTrainer && <td>{s.trainerName}</td>}
                    {manyScenarios && <td>{scenarioNames.get(s.scenarioId) ?? s.scenarioId}</td>}
                    <td className="muted">{formatDateTime(s.createdAt)}</td>
                    <td>
                      <span className={`esito ${STATE_CLASSES[state]}`}>{STATE_LABELS[state]}</span>
                    </td>
                    <td className="num">{done ? a.points_total : '—'}</td>
                    <td className={`num${done && a.errors_total > 0 ? ' errori-riga' : ''}`}>{done ? a.errors_total : '—'}</td>
                    <td className="num">{done && a.completion_time_ms !== null ? formatDuration(a.completion_time_ms) : '—'}</td>
                    <td className="freccia" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
