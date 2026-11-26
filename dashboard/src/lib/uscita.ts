// Uscita animata dalla pagina di accesso: dopo un login riuscito la pagina resta a schermo
// per DURATA_USCITA ms (lo scatto della freccia), poi parte la transizione verso la dashboard.
// Vive fuori da React perché, appena il login riesce, App sostituisce l'albero delle pagine
// e la pagina di accesso viene ricreata: lo stato di un componente andrebbe perso.

export const DURATA_USCITA = 260

let finoA = 0

/** Da chiamare appena signInWithPassword riesce. Il margine copre il caricamento del profilo. */
export function avviaUscita(now = Date.now()): void {
  finoA = now + DURATA_USCITA + 2000
}

export function inUscita(now = Date.now()): boolean {
  return now < finoA
}

export function fineUscita(): void {
  finoA = 0
}
