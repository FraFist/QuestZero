// Sessioni del formatore: stati, codice di abbinamento, lettura dal database.
// Le funzioni pure in alto sono testate in sessions.test.ts.
import { supabase, type Tables } from './supabase'

export type SessionStatus = Tables<'sessions'>['status']

const STATUS_LABELS: Record<SessionStatus, string> = {
  waiting: 'In attesa del visore',
  active: 'In corso',
  closed: 'Chiusa',
}

export function statusLabel(status: SessionStatus): string {
  return STATUS_LABELS[status]
}

/** "482913" → "482 913": due gruppi da tre cifre si leggono e si dettano meglio. */
export function formatPairingCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}

/** Millisecondi mancanti alla scadenza del codice (mai negativi). */
export function msUntil(expiresAt: string, now: number): number {
  return Math.max(0, new Date(expiresAt).getTime() - now)
}

// ---------------------------------------------------------------------------
// Lettura dal database (la RLS limita alle sessioni del formatore, RF-22)
// ---------------------------------------------------------------------------
export const SESSION_COLUMNS =
  'id, status, scenario_id, created_at, started_at, closed_at, participant:profiles!sessions_participant_id_fkey(participant_code)'

export interface SessionRow {
  id: string
  status: SessionStatus
  scenario_id: string
  created_at: string
  started_at: string | null
  closed_at: string | null
  participant: { participant_code: string | null } | null
}

/** Nomi degli scenari pubblicati (dal catalogo nel database, RNF-14). */
export async function loadScenarioNames(): Promise<Map<string, string>> {
  const { data } = await supabase.from('scenarios_latest').select('scenario_id, name')
  return new Map((data ?? []).map((s) => [s.scenario_id, s.name ?? s.scenario_id]))
}

/** Genera un nuovo codice di 6 cifre (valido 10 minuti, annulla il precedente). */
export async function createPairingCode(
  sessionId: string,
): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('create_pairing_code', { p_session_id: sessionId })
  const row = data?.[0]
  if (error || !row) {
    if (error?.code === 'QZ409') return { ok: false, message: 'La sessione è chiusa: non serve un nuovo codice.' }
    return { ok: false, message: 'Codice non generato. Riprova tra poco.' }
  }
  return { ok: true, code: row.pairing_code, expiresAt: row.pairing_expires_at }
}

/** Chiude la sessione (RF-23): i codici non usati si annullano, il visore non può più inviare. */
export async function closeSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase.from('sessions').update({ status: 'closed' }).eq('id', sessionId)
  return !error
}
