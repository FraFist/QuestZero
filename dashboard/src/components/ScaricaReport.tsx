// Pulsante "Scarica report PDF" della sessione (RF-19). Al clic legge i dati aggiornati
// (tentativi ed errori della sessione), prepara il report e carica jsPDF solo allora.
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildReport, type ReportSession } from '../lib/report'
import { groupErrors } from '../lib/results'

export function ScaricaReport({ sessionId, session }: { sessionId: string; session: ReportSession }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function download() {
    setBusy(true)
    setError(false)
    try {
      const [attempts, errors] = await Promise.all([
        supabase.from('attempt_overview').select('*').eq('session_id', sessionId),
        supabase.from('attempt_errors').select('*').eq('session_id', sessionId),
      ])
      if (attempts.error || errors.error) throw new Error('lettura')
      const report = buildReport(session, attempts.data ?? [], groupErrors(errors.data ?? []), new Date().toISOString())
      const { downloadReportPdf } = await import('../lib/reportPdf')
      await downloadReportPdf(report)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="btn btn-secondario" type="button" onClick={() => void download()} disabled={busy}>
        {busy ? 'Preparazione…' : 'Scarica report PDF'}
      </button>
      {error && (
        <span className="errore-campo" role="alert">
          Report non creato: controlla la connessione e riprova.
        </span>
      )}
    </>
  )
}
