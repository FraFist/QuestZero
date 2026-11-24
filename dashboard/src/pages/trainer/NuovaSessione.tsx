// Creazione di una sessione (RF-11): il formatore sceglie uno dei suoi studenti e lo scenario.
// Dopo la creazione si passa alla pagina della sessione, che genera subito il codice di 6 cifre.
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth-context'

interface Option {
  id: string
  label: string
}

export function NuovaSessione() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [students, setStudents] = useState<Option[] | null>(null)
  const [scenarios, setScenarios] = useState<Option[] | null>(null)
  const [studentId, setStudentId] = useState(params.get('studente') ?? '')
  const [scenarioId, setScenarioId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let current = true
    void Promise.all([
      supabase
        .from('profiles')
        .select('id, participant_code')
        .eq('role', 'participant')
        .order('participant_code'),
      supabase.from('scenarios_latest').select('scenario_id, name').order('name'),
    ]).then(([st, sc]) => {
      if (!current) return
      setStudents((st.data ?? []).map((s) => ({ id: s.id, label: s.participant_code ?? s.id })))
      const scen = (sc.data ?? []).map((s) => ({ id: s.scenario_id, label: s.name ?? s.scenario_id }))
      setScenarios(scen)
      // Con un solo scenario (l'MVP) è già scelto.
      if (scen.length === 1) setScenarioId(scen[0].id)
    })
    return () => {
      current = false
    }
  }, [])

  if (auth.status !== 'signed_in') return null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (auth.status !== 'signed_in') return
    setError(null)
    if (!studentId || !scenarioId) {
      setError('Scegli lo studente e lo scenario.')
      return
    }
    setSending(true)
    const { data, error } = await supabase
      .from('sessions')
      .insert({ participant_id: studentId, trainer_id: auth.session.user.id, scenario_id: scenarioId })
      .select('id')
      .single()
    setSending(false)
    if (error || !data) {
      setError('Sessione non creata. Controlla di aver scelto un tuo studente e riprova.')
      return
    }
    navigate(`/sessioni/${data.id}`, { state: { nuova: true } })
  }

  const loading = students === null || scenarios === null

  return (
    <>
      <div className="pagina-testa">
        <div>
          <h1>Nuova sessione</h1>
          <p>Dopo la creazione ricevi il codice di 6 cifre da inserire nel visore.</p>
        </div>
      </div>

      {loading ? (
        <p className="muted">Caricamento…</p>
      ) : students.length === 0 ? (
        <section className="carta vuoto">
          <h2>Nessuno studente registrato</h2>
          <p>Per creare una sessione serve almeno uno studente.</p>
          <Link className="btn btn-primario" to="/studenti">
            Registra uno studente
          </Link>
        </section>
      ) : scenarios.length === 0 ? (
        <section className="carta vuoto">
          <h2>Nessuno scenario pubblicato</h2>
          <p>L'amministratore deve pubblicare il catalogo dello scenario prima delle sessioni.</p>
        </section>
      ) : (
        <form className="carta modulo modulo-stretto" onSubmit={onSubmit} noValidate>
          <div className="campo">
            <label htmlFor="studente">Studente</label>
            <select id="studente" className="select codice" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Scegli uno studente</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="scenario">Scenario</label>
            <select id="scenario" className="select" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
              <option value="">Scegli uno scenario</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primario" type="submit" disabled={sending}>
            {sending ? 'Creazione…' : 'Crea sessione'}
          </button>
          <p className={`stato-modulo${error ? ' errore' : ''}`} role="status">
            {error ?? ''}
          </p>
        </form>
      )}
    </>
  )
}
