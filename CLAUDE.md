# QuestZero

Piattaforma di formazione sulla sicurezza sul lavoro con VR e gamification.
Progetto universitario (Ingegneria del Software), team di 3, consegna MVP entro fine dicembre 2026.

## Perimetro MVP
- Un solo scenario: emergenza incendio in un magazzino logistico.
- Dashboard del formatore in tempo reale.
- Tracciamento sessione ed esito (indicatori calcolati nel client VR).
- Invio dei risultati in formato xAPI a un LRS di prova.
- Account del partecipante per consultare i propri risultati (RF-20, RF-21).
- FUORI dall'MVP: certificati, gestione corsi, avvio da LMS, più visori insieme, interruzione dalla dashboard. Non implementarli. L'elenco completo è in `docs/requisiti.md`.
- Gli scenari devono essere aggiungibili in seguito senza toccare backend e dashboard.

## Struttura del repository
- `unity/` — simulazione VR (Unity/OpenXR). Logica scenario, ambiente 3D, indicatori.
- `backend/` — Supabase (database Postgres, Auth, Realtime, Edge Functions in TypeScript). Database, auth e ruoli, API eventi, integrazione xAPI.
- `dashboard/` — React + Vite + TypeScript. Dashboard web del formatore.
- `docs/` — specifiche. Leggile solo quando servono al task:
  - `docs/requisiti.md` — requisiti utente, funzionali, non funzionali e prove di verifica (ID tipo RF-01, RNF-01).
  - `docs/eventi-xapi.md` — contratto degli eventi VR → backend e mappatura in statement xAPI.

## Regole
- IMPORTANT: il contratto eventi in `docs/eventi-xapi.md` è la fonte di verità tra Unity e backend. Se una modifica lo cambia, aggiorna prima il documento e segnalalo.
- Quando implementi un requisito, cita il suo ID nel commit e nei test.
- Niente segreti nel codice: chiavi e URL in `.env` (mai committato).

## Comandi
Backend (dalla cartella `backend/`, serve Docker Desktop acceso; la CLI Supabase è una dipendenza del progetto, si lancia con `npx supabase ...`):
- `npm install` — prima volta, installa la CLI Supabase
- `npm start` — avvia Supabase in locale (`npm run stop` per fermarlo, `npm run status` per URL e chiavi locali)
- `npm test` — test del database (pgTAP, file in `supabase/tests/database/`)
- `npm run test:unit` — test unitari delle Edge Functions (Deno, `supabase/tests/functions/unit/`)
- `npm run test:functions` — test completo contro Supabase locale acceso (`supabase/tests/functions/integration/`)
- `npm run check` — controllo dei tipi TypeScript delle Edge Functions
- Deno è una dipendenza npm del progetto: niente installazioni a parte. `deno task` va in crash su Windows: usare gli script npm.
- Dopo aver cambiato `config.toml` (es. `[functions.*]`) serve `npx supabase stop` e `npm start`.
- LRS di prova locale (SQL LRS in Docker, porta 44380): `npm run lrs:start` / `npm run lrs:stop`. Va avviato DOPO `npm start` (usa la rete `supabase_network_questzero`). Serve `supabase/functions/.env` copiato da `.env.example`.
- Invio automatico xAPI (pg_cron ogni minuto) in locale: dopo ogni `db reset` il Vault si svuota e vanno ricreati i segreti `project_url` (`http://supabase_kong_questzero:8000`) e `xapi_sender_key` (SERVICE_ROLE_KEY locale). I test non ne hanno bisogno: chiamano `xapi-sender` direttamente.
- Porte locali spostate su 4432x (API 44321, DB 44322, Studio http://127.0.0.1:44323, Mailpit 44324) perché Windows riserva il blocco 54282–54381 usato di default da Supabase.
- `analytics` è spento in `config.toml`: su Windows bloccava `db reset`. La pagina Logs di Studio locale quindi non funziona.
- `npx supabase db reset` ricrea il DB locale applicando tutte le migrazioni (circa 75 s); lanciarlo prima di `npm test` dopo aver cambiato una migrazione.
- `npm run demo:utenti` — crea nel Supabase locale i formatori e l'amministratore di prova (credenziali in `backend/scripts/utenti-demo.mjs`); da rilanciare dopo ogni `db reset`.

Dashboard (dalla cartella `dashboard/`, con il backend locale acceso):
- Prima volta: `npm install` e copia `.env.example` in `.env.local` con URL e Publishable key da `npm run status` in `backend/`.
- `npm run dev` — dashboard su http://127.0.0.1:3000 (porta fissa: è il `site_url` di Supabase).
- `npm test` — test unitari (Vitest, file `src/**/*.test.ts`); `npm run build` — controllo dei tipi e build; `npm run lint`.
- Dopo una nuova migrazione rigenera i tipi: da `backend/`, `npx supabase gen types typescript --local --schema public > ../dashboard/src/lib/database.types.ts`.

## Workflow
- Francesco è alle prime armi con backend e web: spiega ogni scelta tecnica in parole semplici prima di applicarla, e dimmi cosa devo fare io a mano (account, chiavi, comandi).
- Per modifiche su più file: prima piano, poi codice.
- Dopo ogni modifica esegui i test pertinenti e mostra l'output.
- Commit piccoli, messaggi in italiano, formato: `tipo(area): descrizione` (es. `feat(backend): endpoint eventi sessione`).
