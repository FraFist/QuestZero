// Vista dal vivo di una sessione (RF-16, RNF-4): scenario, tempo trascorso, errori, punti,
// obiettivi e gli ultimi eventi, aggiornati con Realtime appena il backend salva un evento.
// Funziona anche per le sessioni chiuse: mostra com'è andata.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatClock, formatDuration } from '../lib/format'
import {
  EMPTY_CATALOG,
  addEvent,
  buildCatalog,
  currentAttempt,
  describeEvent,
  elapsedMs,
  upsertById,
  type Catalog,
  type LiveEvent,
} from '../lib/live'

interface Attempt {
  id: string
  attempt_number: number
  started_at: string
  ended_at: string | null
  completion_time_ms: number | null
  points_total: number
  errors_total: number
  objectives_completed: number
  objectives_total: number | null
  end_reason: string | null
  outcome: string | null
  level: number | null
  sequence_respected: boolean | null
}

const ATTEMPT_COLUMNS =
  'id, attempt_number, started_at, ended_at, completion_time_ms, points_total, errors_total, objectives_completed, objectives_total, end_reason, outcome, level, sequence_respected'
const EVENT_COLUMNS = 'event_id, seq, type, occurred_at, attempt_id, payload'

export function VistaDalVivo({ sessionId, scenarioId, scenarioName }: { sessionId: string; scenarioId: string; scenarioName: string }) {
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG)
  const [loaded, setLoaded] = useState(false)
  // Eventi arrivati dopo l'apertura della pagina: si evidenziano per un attimo.
  const [fresh, setFresh] = useState<Set<string>>(new Set())

  useEffect(() => {
    let current = true

    // Prima l'iscrizione a Realtime, poi la lettura: un evento arrivato nel mezzo non si perde
    // (addEvent e upsertById ignorano i doppioni).
    const channel = supabase
      .channel(`dal-vivo-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const e = payload.new as LiveEvent
          setEvents((list) => addEvent(list, e))
          setFresh((s) => new Set(s).add(e.event_id))
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attempts', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return
          setAttempts((list) => upsertById(list, payload.new as Attempt))
        },
      )
      .subscribe()

    void Promise.all([
      supabase.from('attempts').select(ATTEMPT_COLUMNS).eq('session_id', sessionId),
      supabase.from('events').select(EVENT_COLUMNS).eq('session_id', sessionId).order('seq', { ascending: false }).limit(50),
      supabase.from('scenarios_latest').select('catalog').eq('scenario_id', scenarioId).maybeSingle(),
    ]).then(([a, e, c]) => {
      if (!current) return
      setAttempts((list) => (a.data ?? []).reduce((acc, row) => upsertById(acc, row as Attempt), list))
      setEvents((list) => (e.data ?? []).reduce((acc, row) => addEvent(acc, row as LiveEvent), list))
      setCatalog(buildCatalog(c.data?.catalog))
      setLoaded(true)
    })

    return () => {
      current = false
      void supabase.removeChannel(channel)
    }
  }, [sessionId, scenarioId])

  const attempt = currentAttempt(attempts)
  const running = attempt !== undefined && !attempt.ended_at

  // L'orologio scorre solo mentre il tentativo è in corso.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])

  if (!loaded) return <p className="muted">Caricamento…</p>

  const others = attempts.filter((a) => a.id !== attempt?.id).sort((a, b) => b.attempt_number - a.attempt_number)

  return (
    <>
      <div className="dal-vivo">
        <section className="pannello-vivo" aria-labelledby="titolo-vivo">
          <div className="pannello-testa">
            <div>
              <p className="pannello-scenario">{scenarioName}</p>
              <h2 id="titolo-vivo">{attempt ? `Tentativo ${attempt.attempt_number}` : 'In attesa dello scenario'}</h2>
            </div>
            {attempt && <StatoTentativo attempt={attempt} />}
          </div>

          {attempt ? (
            <dl className="misure">
              <div>
                <dt>Tempo</dt>
                <dd className="num">{formatDuration(elapsedMs(attempt, now))}</dd>
              </div>
              <div>
                <dt>Errori</dt>
                <dd className={`num${attempt.errors_total > 0 ? ' misura-errori' : ''}`}>{attempt.errors_total}</dd>
              </div>
              <div>
                <dt>Punti</dt>
                <dd className="num">{attempt.points_total}</dd>
              </div>
              <div>
                <dt>Obiettivi</dt>
                <dd className="num">
                  {attempt.objectives_completed}
                  {attempt.objectives_total !== null && <span className="misura-totale"> di {attempt.objectives_total}</span>}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="pannello-attesa">
              Il visore è collegato. Tempo, errori e punti compaiono quando lo studente inizia lo scenario, dopo la prova
              dei comandi.
            </p>
          )}
        </section>

        <section className="sezione eventi" aria-labelledby="titolo-eventi">
          <h2 id="titolo-eventi">Cosa sta succedendo</h2>
          {events.length === 0 ? (
            <p className="muted">Ancora nessun evento dal visore.</p>
          ) : (
            <ol className="elenco-eventi" aria-live="polite">
              {events.map((e) => {
                const d = describeEvent(e, catalog)
                return (
                  <li key={e.event_id} className={`evento evento-${d.tone}${fresh.has(e.event_id) ? ' evento-nuovo' : ''}`}>
                    <time className="num muted" dateTime={e.occurred_at}>
                      {formatClock(e.occurred_at)}
                    </time>
                    <span className="evento-testo">{d.text}</span>
                    {d.points ? <span className="evento-punti num">+{d.points}</span> : null}
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>

      {others.length > 0 && (
        <section className="sezione">
          <h2>Tentativi precedenti</h2>
          <div className="tabella-contenitore">
            <table className="tabella">
              <thead>
                <tr>
                  <th scope="col">Tentativo</th>
                  <th scope="col">Esito</th>
                  <th scope="col" className="num">Tempo</th>
                  <th scope="col" className="num">Errori</th>
                  <th scope="col" className="num">Punti</th>
                </tr>
              </thead>
              <tbody>
                {others.map((a) => (
                  <tr key={a.id}>
                    <td>{a.attempt_number}</td>
                    <td>
                      <StatoTentativo attempt={a} />
                    </td>
                    <td className="num">{formatDuration(elapsedMs(a, now))}</td>
                    <td className="num">{a.errors_total}</td>
                    <td className="num">{a.points_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

function StatoTentativo({ attempt }: { attempt: Attempt }) {
  if (!attempt.ended_at) {
    return (
      <span className="esito esito-dal-vivo">
        <span className="punto-vivo" aria-hidden="true" />
        In corso
      </span>
    )
  }
  if (attempt.end_reason === 'aborted_by_participant') return <span className="esito esito-neutro">Interrotto</span>
  return attempt.outcome === 'passed' ? (
    <span className="esito esito-superato">Superato</span>
  ) : (
    <span className="esito esito-non-superato">Non superato</span>
  )
}
