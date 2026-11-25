# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Formatore** (utente principale della dashboard). Può essere sia una persona interna all'azienda che forma i colleghi (per esempio il responsabile della sicurezza o il capo magazzino), sia un formatore esterno o un ente di formazione che va nelle aziende. La dashboard deve andare bene per entrambi.
- **Studente** (partecipante alla simulazione): fa lo scenario nel visore; dalla dashboard vede solo i propri risultati (RF-21), se il formatore gli ha dato l'accesso con l'email. Dopo l'MVP, preparando il prodotto per il mercato, è probabile che lo studente abbia più spazio (gamification e corsi a lui dedicati): le fondamenta grafiche devono reggere anche pagine pensate per lui, non solo per il formatore.
- **Amministratore**: vede tutto, dà un nome ai formatori, sposta gli studenti tra formatori (RF-22).

## Product Purpose

QuestZero è una piattaforma di formazione sulla sicurezza sul lavoro con realtà virtuale e gamification. Lo studente affronta nel visore un'emergenza incendio in un magazzino logistico; la dashboard web permette al formatore di preparare la sessione, seguirla mentre succede e poi valutarla e documentarla. Le due cose contano allo stesso modo: seguire dal vivo (RF-16) e avere esiti, errori e report affidabili da conservare (RF-17, RF-18, RF-19). I risultati vanno anche a un sistema di tracciamento esterno in formato xAPI (RF-15).

Progetto universitario (Ingegneria del Software), MVP da consegnare entro fine dicembre 2026.

## Positioning

L'esito e gli indicatori (errori, tempo, sequenza rispettata) li calcola il visore secondo i criteri dello scenario; punti e livello sono solo gamification e non decidono mai l'esito (RF-8). Il formatore vede quindi la stessa valutazione che lo studente ha ricevuto nella simulazione, mentre accade, e la ritrova identica nel report.

## Operating Context

- **Durante la sessione:** il formatore è accanto allo studente che indossa il visore, con un portatile o un tablet, e guarda la dashboard a colpo d'occhio mentre segue la persona. Crea la sessione, legge il codice di 6 cifre allo studente, poi segue tempo, errori e punti.
- **Dopo la sessione:** alla scrivania rivede i risultati per studente, gli errori più frequenti e scarica il report PDF.
- **Da confermare:** se la vista dal vivo verrà anche proiettata in aula per gli altri partecipanti. Lo si capirà parlando con l'azienda di riferimento (il fratello di Francesco) e alla prima simulazione vera.
- Lingua dell'interfaccia: italiano.

## Capabilities and Constraints

- Ruoli: formatore, studente, amministratore; nessuna registrazione libera (RF-20). Ogni formatore vede solo i propri studenti e sessioni (RF-22).
- Sessione: il formatore la crea per uno studente, il visore si abbina con un codice di 6 cifre valido 10 minuti; la sessione si chiude dal formatore o dopo 30 minuti di inattività (RF-23).
- Vista dal vivo: gli eventi devono comparire entro 3 secondi (RNF-4) e la vista va raggiunta in al massimo 3 clic dalla pagina iniziale (RNF-8).
- Privacy: lo studente è identificato solo dal suo codice; la sua email non esce mai dal sistema di login (RNF-19). Informativa da accettare al primo accesso (RNF-18).
- Uno scenario nell'MVP; altri scenari si aggiungono senza toccare dashboard e backend: etichette di errori, obiettivi e zone arrivano dal catalogo dello scenario, mai scritte nella dashboard (RNF-14).
- Fuori dall'MVP: certificati, gestione corsi, avvio da LMS, più visori insieme, interruzione dalla dashboard.
- **Decisione aperta:** la struttura delle pagine e i dati mostrati potranno cambiare dopo la prima simulazione vera e il confronto con l'azienda di riferimento. Il lavoro grafico di adesso deve quindi stare nelle fondamenta riusabili, non nella rifinitura delle singole pagine.
- Stack esistente: React + Vite + TypeScript (dashboard), Supabase (backend), Unity/OpenXR (visore).

## Brand Commitments

- Nome: sempre **QuestZero** (mai "Questzero", "Quest Zero", "QUESTZERO").
- Logo e simbolo (la Z come via di fuga) con il kit in `brand/logo/kit/` e le regole d'uso in `brand/logo/GUIDA-LOGO.md`: non va ridisegnato, ricolorato o riscritto con un altro carattere.
- I colori del marchio sono nella guida del logo; la guida dice esplicitamente che i mockup sono indicativi e che l'unico elemento definitivo è il logo. L'aspetto della dashboard resta quindi aperto.

## Evidence on Hand

- Nessun cliente, testimonianza o dato reale: l'azienda del fratello di Francesco è il riferimento per capire le necessità, non un cliente dichiarato. Non inventarne.
- Il catalogo dello scenario in `backend/supabase/seed.sql` è un segnaposto (etichette provvisorie); i contenuti reali arriveranno dall'esperto di sicurezza.
- Dati di prova solo in locale: `backend/scripts/utenti-demo.mjs` e il visore finto `backend/scripts/visore-finto.mjs`.
- Requisiti e prove di verifica: `docs/requisiti.md`; contratto degli eventi: `docs/eventi-xapi.md`; stato: `docs/stato.md`.

## Product Principles

1. **Si legge con uno sguardo.** Durante la sessione il formatore guarda la persona, non lo schermo: tempo, errori e stato devono capirsi in un secondo.
2. **Quello che dice il visore è la verità.** Esito e indicatori si mostrano come li ha calcolati il visore, mai ricalcolati; ciò che si vede dal vivo è ciò che finisce nel report.
3. **Lo studente è un codice.** Nessun dato personale oltre al codice partecipante nelle pagine, nei report e nei dati inviati fuori.
4. **Lo scenario non è scritto nella dashboard.** Tutto ciò che riguarda lo scenario (errori, obiettivi, zone, nomi) arriva dal catalogo, così uno scenario nuovo non richiede di rifare le pagine.
5. **Fondamenta prima delle pagine.** Le pagine cambieranno dopo le prime simulazioni vere; colori, caratteri, tabelle, numeri e stati devono restare validi anche dopo.

## Accessibility & Inclusion

- Contrasti dei colori del marchio misurati in `brand/logo/GUIDA-LOGO.md` (WCAG): rispettarli.
- Tutte le funzioni usabili da tastiera; nessuna informazione affidata al solo colore (esiti con testo, non solo verde o rosso).
