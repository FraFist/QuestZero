# Stato del progetto

Aggiornato al **24/11/2026**. Serve a chi riprende il lavoro (anche in una nuova chat): cosa c'è, cosa manca, cosa è stato deciso.
Documenti di riferimento: [`requisiti.md`](requisiti.md), [`eventi-xapi.md`](eventi-xapi.md) (contratto, bozza 0.7), [`guida-unity.md`](guida-unity.md). Comandi e regole di lavoro: [`../CLAUDE.md`](../CLAUDE.md).

## In una riga
Il **backend** (Supabase) è completo e testato; la **dashboard** e il **client Unity** sono ancora da scrivere. Online il backend c'è ma va aggiornato alle ultime modifiche e riempito con i dati iniziali (passaggi manuali più sotto).

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
| Edge Function `pair` | Abbinamento del visore con il codice | contratto "Avvio sul visore" |
| Edge Function `events` | Controllo degli eventi, traduzione xAPI, salvataggio | RF-12, RF-15, RNF-13 |
| Edge Function `invite-participant` | Il formatore registra uno studente: con email (invito) o con il solo codice | RF-20, RF-22 |
| Edge Function `xapi-sender` | Invio della coda all'LRS (xAPI 1.0.3), statement sbagliati isolati | RF-15, RNF-5 |

Regole di accesso nel database (RLS): lo studente vede solo i propri dati, il formatore solo i propri studenti e sessioni, l'amministratore tutto, chi non ha fatto il login niente. Codici e token salvati solo come impronta SHA-256. L'email dello studente non esce mai dal sistema di login (RNF-19).

### Test (tutti passano)
- **167** test del database (pgTAP): `npm test`
- **31** test unitari delle funzioni (Deno): `npm run test:unit`
- **2** test completi contro Supabase locale e LRS di prova (15 passaggi): `npm run test:functions` — coprono anche la prova **P-4** (statement accettati da un LRS reale).

### Documenti
- `requisiti.md` aggiornato con le decisioni del gruppo (vedi "Differenze rispetto alla specifica").
- `eventi-xapi.md` bozza 0.7: nessun punto aperto; IRI xAPI-SG verificati sul profilo ufficiale.
- `guida-unity.md`: abbinamento, invio eventi con esempio completo, coda offline, indirizzi.

### Online (progetto Supabase `xqwcjnvbptrcjjsnmnjc`, regione eu-west-1)
- Pubblicate il 24/11: migrazioni **1–8** e le 4 Edge Functions (versione di quel momento).
- **Non ancora pubblicate:** la migrazione 9 (chiusura per inattività) e la nuova `invite-participant` (studente senza email). Vedi il passaggio 1 qui sotto.
- Le tabelle online sono **vuote**: niente utenti, scenari o informativa.

## Cosa resta

### Passaggi manuali online, in ordine
1. **Aggiornare il backend online** (dalla rete di casa: altre reti possono bloccare le porte 5432/6543 del database). In `backend/`:
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
- **Dashboard** (`dashboard/`, React + Vite + TypeScript), da pubblicare su `dashboard.questzero.it`:
  - login (formatore, studente, amministratore) con Supabase Auth;
  - formatore: elenco dei propri studenti e registrazione (con o senza email), creazione della sessione e codice di 6 cifre, vista dal vivo (RF-16, RNF-4 ≤ 3 s, RNF-8 ≤ 3 clic), chiusura della sessione, esiti per studente (RF-17), errori più frequenti (RF-18), report PDF (RF-19);
  - studente: accettazione dell'informativa al primo accesso (RNF-18), i propri tentativi (RF-21);
  - amministratore: vista completa, ruoli, spostamento di studenti tra formatori (RF-22).
  - Dati da usare: tabelle `sessions`, `profiles`, `scenarios_latest`; viste `attempt_overview`, `attempt_errors`; funzioni `create_pairing_code`, `frequent_errors`; Edge Function `invite-participant`; Realtime su `events`, `attempts`, `sessions`.
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
