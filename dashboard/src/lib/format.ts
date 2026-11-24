// Date, durate e tempi in italiano, sempre nel fuso di Roma (dove si tiene la formazione).
// Funzioni pure, testate in format.test.ts.

const ZONE = 'Europe/Rome'

const dateFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONE })
const dateTimeFmt = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ZONE,
})
const timeFmt = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: ZONE })

/** "25 nov 2026" */
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

/** "25 nov, 14:05" */
export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso))
}

/** "14:05" */
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso))
}

/** Durata in millisecondi → "4:07" (minuti:secondi) o "1:02:07" oltre l'ora. Negativa → "0:00". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
