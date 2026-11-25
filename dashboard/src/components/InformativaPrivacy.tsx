// Informativa al primo accesso dello studente (RNF-18): finché non accetta la versione corrente
// non vede le altre pagine. Vale anche l'accettazione fatta nel visore (stessa tabella, una volta
// per persona); se l'informativa cambia versione si chiede di nuovo.
import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

interface Notice {
  version: string
  content: string
}

export function InformativaPrivacy({ userId, children }: { userId: string; children: ReactNode }) {
  // undefined = caricamento; null = niente da accettare
  const [notice, setNotice] = useState<Notice | null | undefined>(undefined)
  const [loadError, setLoadError] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let current = true
    void (async () => {
      const latest = await supabase
        .from('privacy_notices')
        .select('version, content')
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (latest.error) {
        if (current) setLoadError(true)
        return
      }
      if (!latest.data) {
        if (current) setNotice(null)
        return
      }
      const accepted = await supabase
        .from('privacy_acceptances')
        .select('notice_version')
        .eq('participant_id', userId)
        .eq('notice_version', latest.data.version)
        .maybeSingle()
      if (current) setNotice(accepted.data ? null : latest.data)
    })()
    return () => {
      current = false
    }
  }, [userId])

  async function accept() {
    if (!notice) return
    setSending(true)
    setError(false)
    const { error } = await supabase
      .from('privacy_acceptances')
      .insert({ participant_id: userId, notice_version: notice.version, source: 'dashboard' })
    setSending(false)
    // 23505 = già accettata (per esempio nel visore, nel frattempo): va bene lo stesso.
    if (error && error.code !== '23505') {
      setError(true)
      return
    }
    setNotice(null)
  }

  if (loadError) {
    return (
      <div className="avviso avviso-errore" role="alert">
        Informativa non caricata: controlla la connessione e ricarica la pagina.
      </div>
    )
  }
  if (notice === undefined) return <p className="muted">Caricamento…</p>
  if (notice === null) return <>{children}</>

  return (
    <section className="carta sezione informativa" aria-labelledby="titolo-informativa">
      <div>
        <h1 id="titolo-informativa">Informativa sul trattamento dei dati</h1>
        <p className="muted">Versione {notice.version}. Leggila prima di vedere i tuoi risultati.</p>
      </div>
      <div className="informativa-testo">{notice.content}</div>
      <div className="azioni-informativa">
        <button className="btn btn-primario" type="button" onClick={() => void accept()} disabled={sending}>
          {sending ? 'Registrazione…' : "Accetto l'informativa"}
        </button>
        {error && (
          <span className="errore-campo" role="alert">
            Accettazione non registrata, riprova.
          </span>
        )}
      </div>
    </section>
  )
}
