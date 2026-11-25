// Risultati dello studente autenticato (RF-21): solo i propri tentativi, con esito, punti,
// livello ed errori. La RLS restituisce solo le sue righe; la tabella è la stessa del formatore.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { TabellaTentativi } from '../../components/TabellaTentativi'
import { groupErrors, summarize, type AttemptOverview, type ErrorItem } from '../../lib/results'

export function MieiRisultati() {
  const [attempts, setAttempts] = useState<AttemptOverview[] | null>(null)
  const [errors, setErrors] = useState<Map<string, ErrorItem[]>>(new Map())
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let current = true
    void (async () => {
      const res = await supabase.from('attempt_overview').select('*').order('started_at', { ascending: false })
      const list = res.data ?? []
      const ids = list.map((a) => a.attempt_id)
      const errs = ids.length ? await supabase.from('attempt_errors').select('*').in('attempt_id', ids) : { data: [] }
      if (!current) return
      setLoadError(Boolean(res.error))
      setAttempts(list)
      setErrors(groupErrors(errs.data ?? []))
    })()
    return () => {
      current = false
    }
  }, [])

  const s = attempts ? summarize(attempts) : null

  return (
    <>
      <div className="pagina-testa">
        <div>
          <h1>I miei risultati</h1>
          <p>
            {s && s.total > 0
              ? `${s.total} ${s.total === 1 ? 'simulazione' : 'simulazioni'}, ${s.passed} ${s.passed === 1 ? 'superata' : 'superate'}.`
              : 'Qui trovi l’esito di ogni simulazione che fai nel visore.'}
          </p>
        </div>
      </div>

      {loadError && (
        <div className="avviso avviso-errore" role="alert">
          Risultati non caricati: controlla la connessione e ricarica la pagina.
        </div>
      )}

      {attempts === null ? (
        <p className="muted">Caricamento…</p>
      ) : attempts.length === 0 ? (
        <section className="carta vuoto">
          <h2>Ancora nessuna simulazione</h2>
          <p>Quando completi o interrompi lo scenario nel visore, il risultato compare qui.</p>
        </section>
      ) : (
        <TabellaTentativi attempts={attempts} errors={errors} sessionLink={false} />
      )}
    </>
  )
}
