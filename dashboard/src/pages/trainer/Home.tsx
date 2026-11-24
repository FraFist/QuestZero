// Pagina iniziale del formatore. Per ora vuota: nei prossimi passi mostrerà le sessioni aperte
// in alto (vista dal vivo in 1 clic, RNF-8) e quelle recenti sotto.
export function TrainerHome() {
  return (
    <>
      <div className="pagina-testa">
        <div>
          <h1>Sessioni</h1>
          <p>Le sessioni aperte compaiono qui: un clic e sei nella vista dal vivo.</p>
        </div>
      </div>
      <section className="carta vuoto">
        <h2>Nessuna sessione aperta</h2>
        <p>Per creare una sessione registra prima i tuoi studenti: la pagina Studenti arriva nel prossimo passo.</p>
      </section>
    </>
  )
}
