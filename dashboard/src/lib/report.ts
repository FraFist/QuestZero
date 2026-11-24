// Report PDF di una sessione (RF-19): qui si decide COSA va nel report (funzione pura, testata
// in report.test.ts); reportPdf.ts decide COME si disegna. Solo il codice dello studente, mai
// l'email (RNF-19). Esito e indicatori sono quelli calcolati dal visore (RF-8, RF-13).
import { formatDateTimeFull as formatDateTime, formatDuration } from './format'
import { OUTCOME_LABELS, outcomeOf, yesNo, type AttemptOverview, type ErrorItem } from './results'

export interface ReportSession {
  participantCode: string
  scenarioName: string
  status: 'waiting' | 'active' | 'closed'
  createdAt: string
  startedAt: string | null
  closedAt: string | null
}

export interface ReportAttempt {
  title: string
  outcome: string
  /** Coppie etichetta/valore degli indicatori. */
  indicators: [string, string][]
  errors: { time: string; kind: string; text: string }[]
}

export interface Report {
  fileName: string
  title: string
  details: [string, string][]
  attempts: ReportAttempt[]
  footer: string
}

const STATUS = { waiting: 'In attesa del visore', active: 'In corso', closed: 'Chiusa' } as const

/** Data "2026-11-25" nel fuso di Roma, per il nome del file. */
function isoDay(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date(iso))
}

export function buildReport(
  session: ReportSession,
  attempts: AttemptOverview[],
  errors: Map<string, ErrorItem[]>,
  generatedAt: string,
): Report {
  const timeOnly = new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Rome',
  })
  const scenarioVersion = attempts[0]?.scenario_version
  const safeCode = session.participantCode.replace(/[^A-Za-z0-9_-]/g, '')

  return {
    fileName: `report-${safeCode || 'sessione'}-${isoDay(session.createdAt)}.pdf`,
    title: `Sessione di ${session.participantCode}`,
    details: [
      ['Studente', session.participantCode],
      ['Scenario', scenarioVersion ? `${session.scenarioName} (versione ${scenarioVersion})` : session.scenarioName],
      ['Stato', STATUS[session.status]],
      ['Creata', formatDateTime(session.createdAt)],
      ['Visore collegato', session.startedAt ? formatDateTime(session.startedAt) : '—'],
      ['Chiusa', session.closedAt ? formatDateTime(session.closedAt) : '—'],
      ['Tentativi', String(attempts.length)],
    ],
    attempts: [...attempts]
      .sort((a, b) => a.attempt_number - b.attempt_number)
      .map((a) => {
        const outcome = OUTCOME_LABELS[outcomeOf(a)]
        return {
          title: `Tentativo ${a.attempt_number}`,
          outcome,
          indicators: [
            ['Esito', outcome],
            ['Punti', String(a.points_total)],
            ['Livello', a.level !== null ? String(a.level) : '—'],
            ['Errori', String(a.errors_total)],
            ['Tempo', a.completion_time_ms !== null ? formatDuration(a.completion_time_ms) : '—'],
            ['Sequenza rispettata', yesNo(a.sequence_respected)],
            [
              'Obiettivi',
              a.objectives_total !== null ? `${a.objectives_completed} di ${a.objectives_total}` : String(a.objectives_completed),
            ],
            ['Iniziato', formatDateTime(a.started_at)],
          ],
          errors: (errors.get(a.attempt_id) ?? []).map((e) => ({
            time: timeOnly.format(new Date(e.at)),
            kind: e.kind === 'zona' ? 'Zona di pericolo' : 'Errore',
            text: e.text,
          })),
        }
      }),
    footer: `Generato da QuestZero il ${formatDateTime(generatedAt)}. Esito e indicatori sono calcolati dal visore secondo i criteri dello scenario; punti e livello non decidono l'esito.`,
  }
}
