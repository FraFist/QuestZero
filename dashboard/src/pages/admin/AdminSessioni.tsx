// Amministratore: tutte le sessioni di tutti i formatori (RF-22, la RLS gli mostra tutto).
// Le sessioni le crea solo il formatore: qui si cercano, si filtrano e si aprono.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { loadScenarioNames, type SessionStatus } from '../../lib/sessions'
import { staffLabel } from '../../lib/admin'
import { ElencoSessioni } from '../../components/ElencoSessioni'
import type { SessionListItem } from '../../lib/sessionList'

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
  const [items, setItems] = useState<SessionListItem[] | null>(null)
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
        .limit(500),
      loadScenarioNames(),
    ]).then(([res, n]) => {
      if (!current) return
      setLoadError(Boolean(res.error))
      setItems(
        ((res.data ?? []) as Row[]).map((s) => ({
          id: s.id,
          status: s.status,
          scenarioId: s.scenario_id,
          createdAt: s.created_at,
          participantCode: s.participant?.participant_code ?? '—',
          trainerName: staffLabel(s.trainer?.display_name, s.trainer_id),
        })),
      )
      setNames(n)
    })
    return () => {
      current = false
    }
  }, [])

  return (
    <>
      <div className="pagina-testa">
        <h1>Sessioni</h1>
      </div>

      {loadError && (
        <div className="avviso avviso-errore" role="alert">
          Sessioni non caricate: controlla la connessione e ricarica la pagina.
        </div>
      )}

      {items === null ? (
        <p className="muted">Caricamento…</p>
      ) : (
        <ElencoSessioni sessions={items} showTrainer scenarioNames={names} />
      )}
    </>
  )
}
