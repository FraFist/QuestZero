// Errori più frequenti di uno scenario, su TUTTE le sessioni (RF-18).
// La funzione frequent_errors restituisce solo conteggi, nessun dato di studenti o sessioni:
// per questo il formatore vede anche le sessioni degli altri formatori (RF-22).
// Etichette dal catalogo dello scenario (RNF-14); un codice senza etichetta si mostra com'è.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { countText, toBars, type Bar } from '../../lib/frequent'

interface Scenario {
  id: string
  name: string
}

export function ErroriFrequenti() {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null)
  const [scenarioId, setScenarioId] = useState('')
  const [bars, setBars] = useState<Bar[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let current = true
    void supabase
      .from('scenarios_latest')
      .select('scenario_id, name')
      .order('name')
      .then(({ data }) => {
        if (!current) return
        const list = (data ?? []).map((s) => ({ id: s.scenario_id, name: s.name ?? s.scenario_id }))
        setScenarios(list)
        if (list.length > 0) setScenarioId(list[0].id)
      })
    return () => {
      current = false
    }
  }, [])

  useEffect(() => {
    if (!scenarioId) return
    let current = true
    void supabase.rpc('frequent_errors', { p_scenario_id: scenarioId }).then(({ data, error }) => {
      if (!current) return
      setError(Boolean(error))
      setBars(toBars(data ?? []))
    })
    return () => {
      current = false
    }
  }, [scenarioId])

  const total = bars?.reduce((sum, b) => sum + b.occurrences, 0) ?? 0

  return (
    <>
      <div className="pagina-testa">
        <div>
          <h1>Errori più frequenti</h1>
          <p>Contati su tutte le sessioni dello scenario, anche di altri formatori. Solo numeri, nessun nome.</p>
        </div>
        {scenarios && scenarios.length > 1 && (
          <div className="campo filtro">
            <label htmlFor="scenario-errori">Scenario</label>
            <select
              id="scenario-errori"
              className="select"
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="avviso avviso-errore" role="alert">
          Dati non caricati: controlla la connessione e ricarica la pagina.
        </div>
      )}

      {scenarios !== null && scenarios.length === 0 ? (
        <section className="carta vuoto">
          <h2>Nessuno scenario pubblicato</h2>
          <p>Gli errori compaiono qui quando c'è uno scenario e le prime sessioni sono state fatte.</p>
        </section>
      ) : bars === null ? (
        <p className="muted">Caricamento…</p>
      ) : bars.length === 0 ? (
        <section className="carta vuoto">
          <h2>Ancora nessun errore registrato</h2>
          <p>Quando gli studenti commettono errori o entrano in zone di pericolo, qui compare la classifica.</p>
        </section>
      ) : (
        <section className="carta sezione" aria-labelledby="titolo-classifica">
          <div>
            <h2 id="titolo-classifica">{scenarios?.find((s) => s.id === scenarioId)?.name}</h2>
            <p className="muted">
              {total} {total === 1 ? 'errore registrato' : 'errori registrati'}, dal più frequente.
            </p>
          </div>
          <table className="classifica">
            <thead className="sr-only">
              <tr>
                <th scope="col">Errore</th>
                <th scope="col">Frequenza</th>
                <th scope="col">Volte</th>
                <th scope="col">Sessioni</th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.key}>
                  <th scope="row" className="classifica-nome">
                    {b.kind === 'zona' && <span className="classifica-tipo">Zona di pericolo</span>}
                    {b.text}
                  </th>
                  <td className="classifica-barra" aria-hidden="true">
                    <span
                      className="barra-dato"
                      style={{ width: `${Math.max(b.share * 100, 1.5)}%` }}
                      data-tooltip={countText(b.occurrences, b.sessions)}
                    />
                  </td>
                  <td className="num classifica-valore">{b.occurrences}</td>
                  <td className="num muted classifica-sessioni">
                    {b.sessions} {b.sessions === 1 ? 'sessione' : 'sessioni'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}
