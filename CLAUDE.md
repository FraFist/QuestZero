# QuestZero

Piattaforma di formazione sulla sicurezza sul lavoro con VR e gamification.
Progetto universitario (Ingegneria del Software), team di 3, consegna MVP entro fine dicembre 2026.

## Perimetro MVP
- Un solo scenario: emergenza incendio in un magazzino logistico.
- Dashboard del formatore in tempo reale.
- Tracciamento sessione ed esito (indicatori calcolati nel client VR).
- Invio dei risultati in formato xAPI a un LRS di prova.
- FUORI dall'MVP: certificati, gestione corsi, avvio da LMS, più visori insieme. Non implementarli.
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
- TODO: avvio backend
- TODO: test backend
- TODO: avvio dashboard

## Workflow
- Francesco è alle prime armi con backend e web: spiega ogni scelta tecnica in parole semplici prima di applicarla, e dimmi cosa devo fare io a mano (account, chiavi, comandi).
- Per modifiche su più file: prima piano, poi codice.
- Dopo ogni modifica esegui i test pertinenti e mostra l'output.
- Commit piccoli, messaggi in italiano, formato: `tipo(area): descrizione` (es. `feat(backend): endpoint eventi sessione`).
