// Risultati di uno studente del formatore (RF-17): esito, punteggio, livello ed errori di ogni
// tentativo. La RLS restituisce solo gli studenti e le sessioni del formatore (RF-22).
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { TabellaTentativi } from '../../components/TabellaTentativi'
import { groupErrors, summarize, type AttemptOverview, type ErrorItem } from '../../lib/results'

interface Data {
  code: string
  attempts: AttemptOverview[]
  errors: Map<string, ErrorItem[]>
}

export function Studente() {
  const { id = '' } = useParams()
  const [data, setData] = useState<Data | null | undefined>(undefined)

  useEffect(() => {
    let current = true
    void (async () => {
      const [profile, attempts] = await Promise.all([
        supabase.from('profiles').select('participant_code').eq('id', id).eq('role', 'participant').maybeSingle(),
        supabase.from('attempt_overview').select('*').eq('participant_id', id).order('started_at', { ascending: false }),
      ])
      if (!profile.data) {
        if (current) setData(null)
        return
      }
      const list = attempts.data ?? []
      const ids = list.map((a) => a.attempt_id)
      const errors = ids.length
        ? await supabase.from('attempt_errors').select('*').in('attempt_id', ids)
        : { data: [] }
      if (current) {
        setData({ code: profile.data.participant_code ?? '—', attempts: list, errors: groupErrors(errors.data ?? []) })
      }
    })()
    return () => {
      current = false
    }
  }, [id])

  if (data === undefined) return <p className="muted">Caricamento…</p>
  if (data === null) {
    return (
      <section className="carta vuoto">
        <h1>Studente non trovato</h1>
        <p>Non esiste, oppure è uno studente di un altro formatore.</p>
        <Link className="btn btn-secondario" to="/studenti">
          Torna agli studenti
        </Link>
      </section>
    )
  }

  const s = summarize(data.attempts)

  return (
    <>
      <div className="pagina-testa">
        <div>
          <p className="sopratitolo">
            <Link className="link" to="/studenti">
              Studenti
            </Link>
          </p>
          <h1>
            Risultati di <span className="codice">{data.code}</span>
          </h1>
          <p>{riassunto(s)}</p>
        </div>
        <Link className="btn btn-primario" to={`/sessioni/nuova?studente=${id}`}>
          Crea sessione
        </Link>
      </div>

      {data.attempts.length === 0 ? (
        <section className="carta vuoto">
          <h2>Ancora nessun tentativo</h2>
          <p>I risultati compaiono qui quando lo studente completa o interrompe lo scenario nel visore.</p>
        </section>
      ) : (
        <TabellaTentativi attempts={data.attempts} errors={data.errors} />
      )}
    </>
  )
}

function riassunto(s: ReturnType<typeof summarize>): string {
  if (s.total === 0) return 'Nessun tentativo per ora.'
  const parts = [
    s.passed && `${s.passed} ${s.passed === 1 ? 'superato' : 'superati'}`,
    s.failed && `${s.failed} non ${s.failed === 1 ? 'superato' : 'superati'}`,
    s.aborted && `${s.aborted} ${s.aborted === 1 ? 'interrotto' : 'interrotti'}`,
    s.running && `${s.running} in corso`,
  ].filter(Boolean)
  return `${s.total} ${s.total === 1 ? 'tentativo' : 'tentativi'}: ${parts.join(', ')}.`
}
