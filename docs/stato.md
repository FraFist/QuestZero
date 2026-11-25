# Stato del progetto

Aggiornato al **25/11/2026**. Serve a chi riprende il lavoro (anche in una nuova chat): cosa c'è, cosa manca, cosa è stato deciso.
Documenti di riferimento: [`requisiti.md`](requisiti.md), [`eventi-xapi.md`](eventi-xapi.md) (contratto, bozza 0.7), [`guida-unity.md`](guida-unity.md). Comandi e regole di lavoro: [`../CLAUDE.md`](../CLAUDE.md).

## In una riga
Il **backend** (Supabase) è completo e testato; la **dashboard** ha tutte le pagine di formatore, studente e amministratore e gira in locale; il **client Unity** è da scrivere (intanto c'è il visore finto). Online il backend c'è (migrazioni 1–10) ma va riempito con i dati iniziali (passaggi manuali più sotto); la dashboard non è ancora pubblicata.

## Fatto

### Backend (`backend/`)
| Pezzo | Cosa fa | Requisiti |
|---|---|---|
| Migrazione 1 — profili e privacy | Ruoli `participant`, `trainer`, `admin`; informativa privacy con versioni e accettazioni | RF-20, RF-21, RF-22, RNF-11, RNF-18, RNF-19 |
| Migrazione 2 — scenari | Catalogo di ogni versione di scenario (JSON), immutabile, pubblicato solo dall'amministratore | RNF-14, RNF-15 |
| Migrazione 3 — sessioni e abbinamento | Sessioni create dal formatore per i propri studenti; codice di 6 cifre (10 min, uso singolo); token del visore; limite di 20 codici sbagliati in 10 minuti | RF-11, RF-22, RNF-9, RNF-11 |
| Migrazione 4 — tentativi ed eventi | Eventi del visore senza doppioni e senza dati di tracciamento; riepilogo dei tentativi; Realtime per la dashboard | RF-4, RF-12, RF-14, RF-16, RNF-9, RNF-13 |
| Migrazione 5 — coda xAPI | Statement da inviare, con riprova e attesa crescente | RF-15, RNF-19 |
| Migrazione 6 — viste dashboard | `attempt_overview`, `attempt_errors`, `frequent_errors` (solo conteggi), etichette dal catalogo | RF-17, RF-18, RF-21, RNF-14 |
| Migrazione 7 — salvataggio eventi | `ingest_events`: salva, aggiorna il tentativo, registra l'informativa, mette in coda gli statement | RF-12, RF-14, RF-15, RNF-9, RNF-18 |
| Migrazione 8 — invio automatico | pg_cron ogni minuto chiama `xapi-sender` (indirizzo e chiave nel Vault) | RF-15 |
| Migrazione 9 — chiusura sessioni | Chiusura dal formatore o dopo 30 minuti di inattività (pg_cron ogni minuto) | RF-23 |
| Migrazione 10 — nomi dei formatori | Colonna display_name per formatori e amministratori, impostata dall'amministratore; mai per gli studenti | RF-22, RNF-19 |
| Edge Function `pair` | Abbinamento del visore con il codice | contratto "Avvio sul visore" |
| Edge Function `events` | Controllo degli eventi, traduzione xAPI, salvataggio | RF-12, RF-15, RNF-13 |
| Edge Function `invite-participant` | Il formatore registra uno studente: con email (invito) o con il solo codice | RF-20, RF-22 |
| Edge Function `xapi-sender` | Invio della coda all'LRS (xAPI 1.0.3), statement sbagliati isolati | RF-15, RNF-5 |

Regole di accesso nel database (RLS): lo studente vede solo i propri dati, il formatore solo i propri studenti e sessioni, l'amministratore tutto, chi non ha fatto il login niente. Codici e token salvati solo come impronta SHA-256. L'email dello studente non esce mai dal sistema di login (RNF-19).

### Dashboard (`dashboard/`, React + Vite + TypeScript)
| Pagina | Cosa fa | Requisiti |
|---|---|---|
| Accesso | Email e password; il ruolo (profiles) decide le pagine; nessuna registrazione libera | RF-20, RF-22 |
| Sessioni (pagina iniziale) | Sessioni aperte in 1 clic, chiuse di recente; si aggiorna con Realtime | RNF-8 |
| Studenti | Elenco dei propri studenti; registrazione con solo codice o con email (invito) | RF-20, RF-22, RNF-19 |
| Nuova sessione e sessione | Codice di 6 cifre con scadenza; passa da sola a "In corso" all'abbinamento; chiusura | RF-11, RF-23 |
| Vista dal vivo | Tempo, errori, punti, obiettivi ed eventi con etichette dal catalogo | RF-16, RNF-4, RNF-14 |
| Risultati dello studente | Esito, punti, livello, errori, tempo e sequenza per tentativo, con il dettaglio degli errori | RF-17, RF-8 |
| Errori frequenti | Classifica di errori e zone su tutte le sessioni dello scenario, solo conteggi | RF-18, RF-22 |
| Report PDF | Dalla pagina della sessione: dati, indicatori ed errori di ogni tentativo, generato nel browser (jsPDF) | RF-19, RNF-19 |
| Studente | Password scelta dal link d'invito, informativa al primo accesso, i propri tentativi | RF-20, RF-21, RNF-18 |
| Amministratore | Tutte le sessioni; studenti con spostamento tra formatori; formatori con nome e ruolo | RF-22 |

Grafica: accesso tutto Blu Elettrico, pagine interne neutre con barra blu, Reddit Sans; regole da `.claude/skills/design-taste-frontend` (solo in locale). 64 test unitari (Vitest). Misura RNF-4 in locale: eventi in pagina tra 0,2 e 2,4 s.

Strumenti in `backend/scripts/`: `npm run demo:utenti` (formatori e amministratore di prova, solo in locale) e `npm run visore:finto -- <codice>` (simula il client Unity).

### Test del backend (tutti passano)
- **174** test del database (pgTAP): `npm test`. Presuppongono un database pulito: dopo prove a mano lanciare prima `npx supabase db reset` (e poi `npm run demo:utenti`).
- **31** test unitari delle funzioni (Deno): `npm run test:unit`
- **2** test completi contro Supabase locale e LRS di prova (15 passaggi): `npm run test:functions` — coprono anche la prova **P-4** (statement accettati da un LRS reale).

### Documenti
- `requisiti.md` aggiornato con le decisioni del gruppo (vedi "Differenze rispetto alla specifica").
- `eventi-xapi.md` bozza 0.7: nessun punto aperto; IRI xAPI-SG verificati sul profilo ufficiale.
- `guida-unity.md`: abbinamento, invio eventi con esempio completo, coda offline, indirizzi.

### Online (progetto Supabase `xqwcjnvbptrcjjsnmnjc`, regione eu-west-1)
- Migrazioni **1–10** allineate al repository (la 10 pubblicata il 25/11, verificato: 10 su 10 uguali); e le 4 Edge Functions nella versione attuale (verificato: 9 migrazioni su 9 uguali, funzioni che rispondono).
- Le tabelle online sono **vuote**: niente utenti, scenari o informativa.

## Cosa resta

### Passaggi manuali online, in ordine
1. **Aggiornare il backend online** — fatto il 24/11. Da ripetere dopo ogni nuova migrazione o funzione (dalla rete di casa: altre reti possono bloccare le porte 5432/6543 del database). In `backend/`:
   `npx supabase db push --remote --dry-run` (controllo), poi `npx supabase db push --remote` e `npx supabase functions deploy`.
2. **Chiudere la registrazione libera**: sito Supabase → Authentication → Sign In / Providers → disattivare "Allow new users to sign up" (RF-20: si entra solo su invito).
3. **Account amministratore**: Authentication → Users → Add user → Create new user (email, password, "Auto Confirm User"). Poi in SQL Editor:
   `insert into public.profiles (id, role) select id, 'admin' from auth.users where email = '<email>';`
4. **Primo formatore**: come al punto 3, con un'altra email e `'trainer'` al posto di `'admin'`.
5. **Informativa privacy**: in SQL Editor
   `insert into public.privacy_notices (version, content) values ('<versione, es. 2026-12-01>', '<testo>');`
6. **Catalogo dello scenario**: in SQL Editor, un `insert into public.scenarios (scenario_id, version, catalog)` con il JSON del catalogo (esempio in `backend/supabase/seed.sql`, che però vale solo in locale). Contenuti reali dall'esperto di sicurezza (D2).
7. **LRS online — LRS.io di Veracity, piano gratuito**: creare l'account e un LRS, generare le credenziali (chiave e segreto), poi in `backend/`:
   `npx supabase secrets set LRS_ENDPOINT=<indirizzo xAPI, senza /statements> LRS_KEY=<chiave> LRS_SECRET=<segreto>`
8. **Vault online** (per l'invio automatico ogni minuto), in SQL Editor:
   `select vault.create_secret('https://xqwcjnvbptrcjjsnmnjc.supabase.co', 'project_url');`
   `select vault.create_secret('<service role key, da Project Settings → API>', 'xapi_sender_key');`
9. **Email degli inviti** (quando il dominio `questzero.it` su register.it sarà attivo): servizio SMTP esterno (es. Resend) con mittente `@questzero.it`, collegato in Authentication → Emails → SMTP. Finché manca, online gli inviti arrivano solo agli indirizzi del team Supabase; la registrazione con il solo codice funziona comunque.
10. **Indirizzo della dashboard** (quando sarà pubblicata su `dashboard.questzero.it`): Authentication → URL Configuration (Site URL e Redirect URLs) e `npx supabase secrets set DASHBOARD_URL=https://dashboard.questzero.it DASHBOARD_ORIGIN=https://dashboard.questzero.it`.

### Da sviluppare
- **Dashboard**, ancora da fare: pubblicazione su `dashboard.questzero.it` (passaggio manuale 10); ritocchi grafici e di organizzazione dopo la prima simulazione vera. Un formatore si aggiunge dal sito di Supabase (passaggi 3–4), poi gli si dà un nome dalla pagina Formatori.
- **Client Unity** (`unity/`): seguire `guida-unity.md` e il contratto.
- **Non implementato** (non richiesto finora): aggiungere l'email in un secondo momento a uno studente registrato con il solo codice.

## Decisioni prese
| Tema | Decisione |
|---|---|
| Account | Studente, formatore, amministratore; nessuna registrazione libera |
| Visibilità | Formatore: solo i propri studenti e sessioni. Amministratore: tutto |
| Studente senza email | Registrabile con il solo codice; l'email serve solo per accedere alla dashboard |
| Abbinamento visore | Codice di 6 cifre generato dal formatore → token valido solo per quella sessione |
| Chiusura sessione | Dal formatore, oppure automatica dopo 30 minuti senza eventi né abbinamenti |
| Interruzione dalla dashboard | Fuori dall'MVP (solo il partecipante interrompe, RNF-16) |
| Privacy | Informativa accettata una volta per persona, di nuovo se cambia versione |
| Errori più frequenti | Contano errori e zone, su tutte le sessioni, solo come conteggi |
| Catalogo scenari | Nel database (`scenarios`): un nuovo scenario non tocca backend e dashboard |
| xAPI | Profilo xAPI-SG; errori con il verbo ADL `failed`; attore = solo il codice studente |
| LRS | In locale SQL LRS (Docker); online LRS.io di Veracity, piano gratuito |
| Hosting | Backend su Supabase (UE, Irlanda); dashboard su `dashboard.questzero.it` |

## Differenze rispetto alla specifica consegnata (18/11/2026)
Da segnalare al docente e nella relazione (elenco completo in testa a `requisiti.md`):
- Account dello studente per consultare i propri risultati (RU-8, RF-20, RF-21, RNF-19): nella specifica i profili erano fuori perimetro.
- Ruolo amministratore e formatore limitato ai propri studenti (RF-22).
- Chiusura della sessione dal formatore o per inattività (RF-23).
- Studente registrabile con il solo codice, email facoltativa (RF-20, A8).
- Interruzione dalla dashboard esplicitamente fuori dall'MVP.
- LRS di prova scelto (D1).

## Cose da sapere sull'ambiente locale (Windows)
- Porte di Supabase spostate su 4432x: Windows riserva il blocco 54282–54381.
- `analytics` spento: bloccava `db reset`.
- `deno task` va in crash su Windows: usare gli script npm.
- Dopo `db reset` il Vault locale si svuota: l'invio automatico xAPI locale si ferma finché non si ricreano `project_url` e `xapi_sender_key` (i test non ne hanno bisogno).
- L'LRS locale (`npm run lrs:start`) va avviato dopo `npm start`; serve `supabase/functions/.env` copiato da `.env.example`.
