// Segnaposto per le pagine di studente e amministratore (fase 3 del piano).
export function InPreparazione({ title }: { title: string }) {
  return (
    <>
      <div className="pagina-testa">
        <h1>{title}</h1>
      </div>
      <section className="carta vuoto">
        <h2>Pagine in preparazione</h2>
        <p>Il tuo accesso funziona. Le pagine per questo ruolo saranno disponibili a breve.</p>
      </section>
    </>
  )
}
