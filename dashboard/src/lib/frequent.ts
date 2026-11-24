// Errori più frequenti di uno scenario (RF-18): dalle righe di frequent_errors alle barre.
// Funzione pura, testata in frequent.test.ts. Solo conteggi, nessun dato di studenti (RF-22).

export interface FrequentRow {
  kind: string
  code: string
  label: string | null
  occurrences: number
  sessions: number
}

export interface Bar {
  key: string
  text: string
  kind: 'errore' | 'zona'
  occurrences: number
  sessions: number
  /** Lunghezza della barra rispetto alla più lunga, da 0 a 1. */
  share: number
}

/** Ordina per occorrenze (poi per testo) e calcola la lunghezza relativa di ogni barra. */
export function toBars(rows: FrequentRow[]): Bar[] {
  const max = Math.max(0, ...rows.map((r) => r.occurrences))
  return rows
    .map((r) => ({
      key: `${r.kind}:${r.code}`,
      text: r.label ?? r.code,
      kind: r.kind === 'zone' ? ('zona' as const) : ('errore' as const),
      occurrences: r.occurrences,
      sessions: r.sessions,
      share: max > 0 ? r.occurrences / max : 0,
    }))
    .sort((a, b) => b.occurrences - a.occurrences || a.text.localeCompare(b.text, 'it'))
}

/** "12 volte in 5 sessioni" / "1 volta in 1 sessione" */
export function countText(occurrences: number, sessions: number): string {
  return `${occurrences} ${occurrences === 1 ? 'volta' : 'volte'} in ${sessions} ${sessions === 1 ? 'sessione' : 'sessioni'}`
}
