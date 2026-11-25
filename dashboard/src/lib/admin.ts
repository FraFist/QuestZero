// Regole dell'area amministratore (RF-22). Funzioni pure, testate in admin.test.ts.
// Il database controlla comunque tutto (RLS e vincoli): queste regole evitano solo di proporre
// modifiche che lascerebbero i dati incoerenti o l'amministratore chiuso fuori.

/** Nome di formatore o amministratore; senza nome, un riferimento corto all'identificativo. */
export function staffLabel(displayName: string | null | undefined, id: string): string {
  const name = displayName?.trim()
  return name ? name : `Senza nome (${id.slice(0, 6)})`
}

export type StaffRole = 'trainer' | 'admin'

/**
 * Motivo per cui il ruolo NON si può cambiare, oppure null se si può.
 * - Il proprio ruolo no: l'amministratore resterebbe senza accesso alle pagine di amministrazione.
 * - Un formatore con studenti no: gli studenti resterebbero assegnati a chi non è più formatore.
 */
export function roleChangeBlock(
  person: { id: string; role: StaffRole },
  selfId: string,
  studentCount: number,
): string | null {
  if (person.id === selfId) return 'Non puoi cambiare il tuo ruolo.'
  if (person.role === 'trainer' && studentCount > 0) {
    return studentCount === 1
      ? 'Ha 1 studente: spostalo prima a un altro formatore.'
      : `Ha ${studentCount} studenti: spostali prima a un altro formatore.`
  }
  return null
}

/** Controllo del nome prima del salvataggio (stesse regole del vincolo nel database). */
export function validateStaffName(name: string): string | null {
  const n = name.trim()
  if (!n) return 'Scrivi un nome, per esempio Anna Bianchi.'
  if (n.length > 80) return 'Al massimo 80 caratteri.'
  return null
}
