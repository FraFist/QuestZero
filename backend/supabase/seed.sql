-- Dati di prova SOLO per il database locale: li carica `npx supabase db reset`.
-- Non vengono mai inviati al progetto online (`db push` porta solo le migrazioni).
-- I contenuti reali dello scenario li fornisce l'esperto di sicurezza (D2):
-- questi ID ed etichette sono segnaposto (docs/eventi-xapi.md).

insert into public.privacy_notices (version, content) values
  ('2026-12-01', 'Informativa di prova: testo da sostituire con quello definitivo.');

insert into public.scenarios (scenario_id, version, catalog) values (
  'incendio-magazzino',
  '1.0.0',
  $json$
  {
    "scenarioId": "incendio-magazzino",
    "scenarioVersion": "1.0.0",
    "name": "Emergenza incendio in magazzino",
    "objectives": [
      { "id": "dare-allarme", "label": "Dare l'allarme" },
      { "id": "raggiungere-estintore", "label": "Raggiungere l'estintore" }
    ],
    "choices": [
      { "id": "tipo-estintore", "label": "Scelta dell'estintore", "options": ["acqua", "co2", "polvere"] }
    ],
    "errors": [
      { "code": "estintore-acqua-su-quadro-elettrico", "label": "Acqua su incendio elettrico" }
    ],
    "zones": [
      { "id": "zona-fumo-denso", "label": "Zona di fumo denso" }
    ],
    "passCriteria": { "maxErrors": 2, "maxCompletionTimeMs": 600000, "sequenceRequired": true }
  }
  $json$::jsonb
);
