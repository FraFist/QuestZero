// Pagina "Stile" (solo in sviluppo): la stessa schermata in tre direzioni grafiche da confrontare.
// Dati finti ma realistici. Non usa né cambia gli stili delle pagine vere: tutto vive in stile.css.
// Seguendo Impeccable (modalità Operate) ogni direzione cambia solo carattere, colori, densità
// e un tratto distintivo; controlli e navigazione restano quelli standard.
import { useState } from 'react'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow-semi-condensed/500.css'
import '@fontsource/barlow-semi-condensed/600.css'
import '@fontsource-variable/ibm-plex-sans'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource-variable/public-sans'
import '@fontsource-variable/archivo/standard.css'
import './stile.css'
import logoBianco from '../assets/questzero-orizzontale-bianco.svg'
import logoBlu from '../assets/questzero-orizzontale-blu.svg'

type Variant = 'a' | 'b' | 'c' | 'd'
type Tone = 'ok' | 'errore' | 'info'

const NAMES: Record<Variant, string> = { a: 'A: Segnaletica', b: 'B: Sala controllo', c: 'C: Verbale chiaro', d: 'D: Alta visibilità' }

const LIMIT_S = 600 // tempo massimo del catalogo di prova (10 minuti)
const ELAPSED_S = 247

const EVENTS: { t: number; at: string; text: string; short: string; tone: Tone; points?: number }[] = [
  { t: 0, at: '10:15:02', text: 'Tentativo 1 iniziato', short: 'Partenza', tone: 'info' },
  { t: 38, at: '10:15:40', text: "Obiettivo raggiunto: Dare l'allarme (1 di 2)", short: 'Allarme', tone: 'ok', points: 10 },
  { t: 113, at: '10:16:55', text: 'Entrato in zona di pericolo: Zona di fumo denso', short: 'Fumo denso', tone: 'errore' },
  { t: 149, at: '10:17:31', text: "Scelta sbagliata: Scelta dell'estintore, acqua", short: 'Acqua', tone: 'errore' },
  { t: 198, at: '10:18:20', text: "Scelta corretta: Scelta dell'estintore, CO2", short: 'CO2', tone: 'ok', points: 15 },
]

const ATTEMPTS = [
  { code: 'P-0042', when: '25 nov, 10:15', outcome: 'Superato', kind: 'ok', points: 35, level: 2, errors: 1, time: '6:52', seq: 'Sì' },
  { code: 'P-0017', when: '24 nov, 16:02', outcome: 'Non superato', kind: 'errore', points: 20, level: 1, errors: 3, time: '8:10', seq: 'No' },
  { code: 'P-0031', when: '24 nov, 11:40', outcome: 'Interrotto', kind: 'neutro', points: 10, level: null, errors: 1, time: '2:15', seq: '—' },
  { code: 'P-0009', when: '23 nov, 09:12', outcome: 'Superato', kind: 'ok', points: 45, level: 3, errors: 0, time: '5:31', seq: 'Sì' },
]

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function Stile() {
  // ?v=b apre direttamente una variante (serve anche al rilevatore di Impeccable)
  const [v, setV] = useState<Variant>(() => {
    const q = new URLSearchParams(window.location.search).get('v')
    return q === 'b' || q === 'c' || q === 'd' ? q : 'a'
  })
  const errors = EVENTS.filter((e) => e.tone === 'errore').length

  return (
    <div className={`sv sv-${v}`}>
      <div className="sv-switch" role="group" aria-label="Direzione grafica">
        {(Object.keys(NAMES) as Variant[]).map((k) => (
          <button key={k} type="button" aria-pressed={v === k} onClick={() => setV(k)}>
            {NAMES[k]}
          </button>
        ))}
      </div>

      <div className="sv-app">
        <nav className="sv-nav" aria-label="Menu principale">
          <img className="sv-logo" src={v === 'c' ? logoBlu : logoBianco} alt="QuestZero" />
          <div className="sv-links">
            <a aria-current="page">Sessioni</a>
            <a>Studenti</a>
            <a>Errori frequenti</a>
          </div>
          <div className="sv-user">
            <span>Anna Bianchi</span>
            <button type="button" className="sv-btn sv-btn-ghost">Esci</button>
          </div>
        </nav>

        <main className="sv-main">
          <header className="sv-head">
            <div>
              <div className="sv-title">
                <h1>
                  Sessione di <span className="sv-code">P-0042</span>
                </h1>
                <span className="sv-badge sv-badge-live">In corso</span>
              </div>
              <dl className="sv-facts">
                <div>
                  <dt>Scenario</dt>
                  <dd>Emergenza incendio in magazzino</dd>
                </div>
                <div>
                  <dt>Formatore</dt>
                  <dd>Anna Bianchi</dd>
                </div>
                <div>
                  <dt>Visore collegato</dt>
                  <dd>10:14</dd>
                </div>
              </dl>
            </div>
            <div className="sv-actions">
              <button type="button" className="sv-btn sv-btn-second">Scarica report PDF</button>
              <button type="button" className="sv-btn sv-btn-danger">Chiudi sessione</button>
            </div>
          </header>

          <section className="sv-live" aria-label="Dal vivo">
            {v === 'd' && <span className="sv-band" aria-hidden="true" />}
            <dl className="sv-measures">
              <div>
                <dt>Tempo</dt>
                <dd>
                  {clock(ELAPSED_S)}
                  {v === 'd' && <small> di {clock(LIMIT_S)}</small>}
                </dd>
                {v === 'd' && <Budget />}
                {v === 'b' && <Gauge value={ELAPSED_S / LIMIT_S} note="limite 10:00" />}
              </div>
              <div>
                <dt>Errori</dt>
                <dd className="sv-bad">{errors}</dd>
                {v === 'b' && <Gauge value={errors / 3} bad note="non superato da 3" />}
              </div>
              <div>
                <dt>Punti</dt>
                <dd>35</dd>
                {v === 'b' && <Gauge value={35 / 60} note="su 60" />}
              </div>
              <div>
                <dt>Obiettivi</dt>
                <dd>
                  1<small> di 2</small>
                </dd>
                {v === 'b' && <Gauge value={0.5} note="1 mancante" />}
              </div>
            </dl>

            {v === 'a' && <Route />}
            {v === 'c' && <Track />}
          </section>

          <div className="sv-cols">
            <section className="sv-block">
              <h2>Cosa sta succedendo</h2>
              <ol className="sv-events">
                {[...EVENTS].reverse().map((e) => (
                  <li key={e.at + e.text} className={`sv-ev sv-ev-${e.tone}`}>
                    <Icon tone={e.tone} />
                    <span>{e.text}</span>
                    <time>{e.at}</time>
                    {e.points ? <b>+{e.points}</b> : <i />}
                  </li>
                ))}
              </ol>
            </section>

            <section className="sv-block">
              <h2>Registra uno studente</h2>
              <form className="sv-form" onSubmit={(e) => e.preventDefault()}>
                <label>
                  Codice studente
                  <input className="sv-input" defaultValue="P 42" aria-invalid="true" />
                  <span className="sv-err">Usa lettere, cifre e trattini, senza spazi.</span>
                </label>
                <label>
                  Email (facoltativa)
                  <input className="sv-input" placeholder="nome@azienda.it" />
                </label>
                <div className="sv-row">
                  <button type="submit" className="sv-btn sv-btn-primary">Registra studente</button>
                  <button type="button" className="sv-btn sv-btn-primary" disabled>
                    Registrazione…
                  </button>
                </div>
              </form>
              <div className="sv-empty">
                <strong>Nessuno studente registrato</strong>
                <span>Basta il codice: l'email serve solo se lo studente deve vedere i suoi risultati.</span>
              </div>
            </section>
          </div>

          <section className="sv-block">
            <h2>Tentativi</h2>
            <div className="sv-table-wrap">
              <table className="sv-table">
                <thead>
                  <tr>
                    <th>Studente</th>
                    <th>Data</th>
                    <th>Esito</th>
                    <th className="n">Punti</th>
                    <th className="n">Livello</th>
                    <th className="n">Errori</th>
                    <th className="n">Tempo</th>
                    <th>Sequenza</th>
                  </tr>
                </thead>
                <tbody>
                  {ATTEMPTS.map((a) => (
                    <tr key={a.code}>
                      <td className="sv-code">{a.code}</td>
                      <td>{a.when}</td>
                      <td>
                        <span className={`sv-badge sv-badge-${a.kind}`}>{a.outcome}</span>
                      </td>
                      <td className="n">{a.points}</td>
                      <td className="n">{a.level ?? '—'}</td>
                      <td className="n">{a.errors}</td>
                      <td className="n">{a.time}</td>
                      <td>{a.seq}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

/** B: indicatore sotto ogni misura (quanto manca al limite). */
function Gauge({ value, bad, note }: { value: number; bad?: boolean; note: string }) {
  return (
    <div className="sv-gauge">
      <span className={bad ? 'sv-gauge-bad' : ''} style={{ width: `${Math.min(1, value) * 100}%` }} />
      <em>{note}</em>
    </div>
  )
}

/** A: il tentativo come una via di fuga, dalla partenza all'uscita (la Z del logo). */
function Route() {
  return (
    <div className="sv-route" aria-label="Percorso del tentativo">
      <ol>
        {EVENTS.map((e) => (
          <li key={e.at + e.text} className={`sv-stop sv-stop-${e.tone}`} title={e.text}>
            <span className="sv-dot" />
            <span className="sv-stop-n">{e.short}</span>
            <span className="sv-stop-t">{clock(e.t)}</span>
          </li>
        ))}
        <li className="sv-stop sv-exit">
          <span className="sv-arrow" />
          <span className="sv-stop-n">Uscita</span>
          <span className="sv-stop-t">da raggiungere</span>
        </li>
      </ol>
    </div>
  )
}

/** C: linea del tempo del tentativo, da 0 al limite dello scenario, con errori e obiettivi. */
function Track() {
  const pct = (s: number) => `${(s / LIMIT_S) * 100}%`
  return (
    <div className="sv-track" aria-label="Linea del tempo del tentativo">
      <div className="sv-track-bar">
        <span className="sv-track-done" style={{ width: pct(ELAPSED_S) }} />
        {EVENTS.filter((e) => e.tone !== 'info').map((e) => (
          <span key={e.at + e.text} className={`sv-tick sv-tick-${e.tone}`} style={{ left: pct(e.t) }} title={`${clock(e.t)} ${e.text}`} />
        ))}
        <span className="sv-now" style={{ left: pct(ELAPSED_S) }} />
      </div>
      <div className="sv-track-scale">
        <span>0:00</span>
        <span>5:00</span>
        <span>10:00, limite dello scenario</span>
      </div>
      <ul className="sv-legend">
        <li className="sv-legend-ok">Obiettivo</li>
        <li className="sv-legend-errore">Errore</li>
        <li className="sv-legend-now">Adesso, {clock(ELAPSED_S)}</li>
      </ul>
    </div>
  )
}

/** Icone degli eventi: SVG disegnati con lo stesso tratto (2px, estremità arrotondate). */
function Icon({ tone }: { tone: Tone }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (tone === 'ok') {
    return (
      <svg className="sv-ico sv-ico-ok" {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 2.8 2.8L16 9.8" />
      </svg>
    )
  }
  if (tone === 'errore') {
    return (
      <svg className="sv-ico sv-ico-errore" {...common}>
        <path d="M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9.5v4M12 17h.01" />
      </svg>
    )
  }
  return (
    <svg className="sv-ico sv-ico-info" {...common}>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </svg>
  )
}

/** D: quanto tempo del limite dello scenario è già stato usato (regola presa dalla musicassetta). */
function Budget() {
  return (
    <div className="sv-budget" aria-hidden="true">
      <span style={{ width: `${(ELAPSED_S / LIMIT_S) * 100}%` }} />
    </div>
  )
}
