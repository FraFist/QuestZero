# Eventi VR → backend e mappatura xAPI

Questo è il contratto tra client VR (Unity) e backend. È la fonte di verità: se un lato ha bisogno di cambiarlo, prima si aggiorna questo file (alzando `schemaVersion` se la modifica non è retrocompatibile), poi il codice.

Requisiti coperti: RF-4, RF-11, RF-12, RF-13, RF-14, RF-15, RF-16, RF-18, RNF-5, RNF-9, RNF-13, RNF-14, RNF-18 (vedi `docs/requisiti.md`).

Stato: **bozza 0.1**, da confermare con lo sviluppatore Unity. I punti aperti sono in fondo.

## Principi
1. **Solo eventi discreti** (RF-12, RNF-13): nessun evento per frame, nessuna posizione, rotazione o direzione dello sguardo. Mai coordinate nei payload.
2. **Gli indicatori e l'esito li calcola il client** (RF-13, RF-14) e li manda nell'evento di fine. Il backend li salva, non li ricalcola; può solo verificarne la coerenza con gli eventi (RNF-1).
3. **L'esito non dipende da punti e livello** (RF-8): `outcome` deriva solo da `indicators` e dai criteri dello scenario.
4. **Nessuna logica di scenario nel backend** (RNF-14): il backend tratta `scenarioId`, `objectiveId`, `choiceId`, `errorCode` come stringhe opache. Etichette e descrizioni stanno nel catalogo dello scenario (vedi sotto).
5. **Nessun evento perso, nessun duplicato** (RNF-9): ogni evento ha un `eventId` generato dal client; il backend ignora gli `eventId` già ricevuti.

## Concetti
- **Sessione**: creata dal formatore dalla dashboard, associata a un codice partecipante (RF-11). Una sessione = un partecipante davanti al visore.
- **Tentativo**: una esecuzione dello scenario dall'inizio alla fine. Una sessione può avere più tentativi (RF-3); lo storico dei tentativi è RF-4.
- **Catalogo dello scenario**: file di configurazione che elenca obiettivi, punti di decisione, codici di errore con le etichette leggibili e i criteri di superamento (RNF-15). Lo usano il client per lo scenario e la dashboard per le etichette.

## Busta comune
Ogni evento ha questa forma:

```json
{
  "schemaVersion": 1,
  "eventId": "8b0f0a4e-3c1d-4f2a-9a57-2d6f1c9e7b10",
  "sessionId": "c2a1e7d4-5b6f-4e8a-9c0d-1f2e3a4b5c6d",
  "attemptId": "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b",
  "seq": 12,
  "type": "choice.made",
  "timestamp": "2026-12-10T10:15:32.481Z",
  "scenarioId": "incendio-magazzino",
  "scenarioVersion": "1.0.0",
  "payload": { }
}
```

| Campo | Tipo | Note |
|---|---|---|
| `schemaVersion` | int | Versione di questo contratto. |
| `eventId` | UUID v4 | Generato dal client. Chiave di deduplicazione. |
| `sessionId` | UUID | Ricevuto dal backend all'avvio della sessione. |
| `attemptId` | UUID o `null` | Generato dal client a `scenario.started`; `null` per gli eventi fuori da un tentativo (es. `privacy.accepted`). Diventa la `registration` xAPI. |
| `seq` | int | Progressivo per sessione, parte da 1, senza buchi. Serve al backend per ordinare e accorgersi di eventi mancanti. |
| `type` | string | Uno dei tipi elencati sotto. |
| `timestamp` | ISO 8601 UTC, ms | Momento in cui l'evento accade sul visore, non quello di invio. |
| `scenarioId`, `scenarioVersion` | string | Dal catalogo dello scenario. |
| `payload` | object | Dipende da `type`. |

## Tipi di evento

### `privacy.accepted` (RNF-18)
Il partecipante ha accettato l'informativa. Va inviato prima di qualunque `scenario.started` della sessione.
```json
{ "privacyNoticeVersion": "2026-12-01" }
```

### `scenario.started` (RF-12)
Inizia un tentativo, dopo la familiarizzazione con i comandi (RF-10).
```json
{ "attemptNumber": 1, "clientVersion": "0.3.0" }
```

### `objective.completed` (RF-5, RF-6)
Completato un obiettivo intermedio.
```json
{ "objectiveId": "raggiungere-estintore", "objectivesCompleted": 2, "objectivesTotal": 5, "pointsAwarded": 10, "pointsTotal": 30 }
```

### `choice.made` (RF-2, RF-6, RF-12)
Il partecipante ha fatto una scelta in un punto di decisione.
```json
{ "choiceId": "tipo-estintore", "optionId": "co2", "correct": true, "pointsAwarded": 15, "pointsTotal": 45 }
```
Se la scelta è sbagliata (`correct: false`, `pointsAwarded: 0`) il client invia **anche** un `error.committed` con `relatedChoiceId`.

### `error.committed` (RF-12, RF-13, RF-18)
Un errore di sicurezza. `errorCode` deve essere stabile tra versioni dello scenario, perché la dashboard ci calcola gli errori più frequenti (RF-18).
```json
{ "errorCode": "estintore-acqua-su-quadro-elettrico", "relatedChoiceId": "tipo-estintore", "errorsTotal": 1 }
```
`relatedChoiceId` è facoltativo (alcuni errori non nascono da una scelta, es. sequenza saltata).

### `safety_distance.violated` (RF-12)
Il partecipante è entrato in una zona di pericolo definita nello scenario. Si manda solo l'ingresso nella zona, non la posizione.
```json
{ "zoneId": "zona-fumo-denso", "errorsTotal": 2 }
```
Conta come errore: il client incrementa `errorsTotal` e **non** manda un `error.committed` separato.

### `scenario.ended` (RF-13, RF-14, RNF-16)
Fine del tentativo, in qualunque modo sia finito.
```json
{
  "reason": "completed",
  "indicators": { "errors": 2, "completionTimeMs": 412300, "sequenceRespected": true },
  "outcome": "passed",
  "pointsTotal": 85,
  "level": 3,
  "objectivesCompleted": 5,
  "objectivesTotal": 5
}
```
| Campo | Valori |
|---|---|
| `reason` | `completed` (scenario finito), `aborted_by_participant` (comando di interruzione, RNF-16), `aborted_by_trainer` |
| `outcome` | `passed`, `failed`; `null` se `reason` non è `completed` |
| `indicators` | Calcolati dal client con i criteri del catalogo. Unica base per `outcome` (RF-8). |

### Eventi per la dashboard in tempo reale (RF-16)
Non serve un evento di "battito": la dashboard ricava scenario in corso, tempo trascorso, errori e punti dagli eventi sopra (`pointsTotal` ed `errorsTotal` sono cumulativi apposta, così un evento perso a video non falsa i totali).

## Trasporto (proposta)
- Il client invia gli eventi via HTTPS (RNF-12) a `POST /api/v1/sessions/{sessionId}/events`, con un array di uno o più eventi.
- Risposta `200` con l'elenco degli `eventId` accettati (compresi i duplicati già presenti). Il client li toglie dalla coda solo dopo la conferma.
- **Coda persistente sul visore** (RNF-9): ogni evento viene scritto su disco prima dell'invio; se la rete cade, il client continua lo scenario e reinvia in ordine di `seq` al ripristino. Il comando di interruzione (RNF-16) non aspetta la rete.
- Il backend inoltra gli eventi alla dashboard in tempo reale (entro 3 s, RNF-4).
- Errori `4xx` di validazione: l'evento non va reinviato, va registrato nel log del client.

## Mappatura in xAPI (RF-15, RNF-5)
Il **backend** traduce gli eventi in statement xAPI e li invia all'LRS di prova. L'invio è asincrono: se l'LRS non risponde, il backend riprova più tardi senza bloccare la sessione.

Vocabolario: profilo xAPI for Serious Games (xAPI-SG), `https://w3id.org/xapi/seriousgames`. Il profilo pubblicato su GitHub ha alcune incoerenze tra tabelle ed esempi: **prima di implementare, verificare ogni IRI sulla definizione ufficiale del profilo**.

### Campi comuni degli statement
- **actor**: mai nome o email (privacy). Si usa un account con il codice partecipante:
  ```json
  { "objectType": "Agent", "account": { "homePage": "https://questzero.it", "name": "<codice partecipante>" } }
  ```
- **context.registration**: `attemptId`, così l'LRS raggruppa gli statement di un tentativo.
- **context.contextActivities.category**: `[{ "id": "https://w3id.org/xapi/seriousgames" }]`, per dichiarare il profilo.
- **context.contextActivities.parent**: l'attività dello scenario (tranne che negli statement sullo scenario stesso).
- **timestamp**: il `timestamp` dell'evento, non l'ora di invio.
- **IRI delle attività**: `https://questzero.it/xapi/scenari/{scenarioId}` e sotto-percorsi (`/obiettivi/{objectiveId}`, `/scelte/{choiceId}`, `/zone/{zoneId}`).
- **Estensioni proprie**: sotto `https://questzero.it/xapi/ext/` (es. `.../ext/error-code`, `.../ext/errors`, `.../ext/sequence-respected`, `.../ext/level`).
- **Mai** l'estensione `position` del profilo (RNF-13).

### Tabella di mappatura
| Evento | Verbo | Oggetto (tipo) | Result / estensioni |
|---|---|---|---|
| `privacy.accepted` | — | — | Non inviato all'LRS: resta nel backend. |
| `scenario.started` | initialized `http://adlnet.gov/expapi/verbs/initialized` | scenario (serious-game) | — |
| `objective.completed` | completed `http://adlnet.gov/expapi/verbs/completed` | obiettivo (quest) | `score.raw` = `pointsAwarded` |
| `objective.completed` | progressed `http://adlnet.gov/expapi/verbs/progressed` | scenario (serious-game) | ext. progress = `objectivesCompleted / objectivesTotal` |
| `choice.made` | selected `https://w3id.org/xapi/adb/verbs/selected` | punto di decisione (question) | `response` = `optionId`, `success` = `correct` |
| `error.committed` | interacted `http://adlnet.gov/expapi/verbs/interacted` | scenario (serious-game) | `success: false`, ext. `error-code` |
| `safety_distance.violated` | accessed `https://w3id.org/xapi/seriousgames/verbs/accessed` | zona (zone) | `success: false` |
| `scenario.ended` con `completed` | completed | scenario (serious-game) | vedi sotto |
| `scenario.ended` interrotto | terminated `http://adlnet.gov/expapi/verbs/terminated` (fuori dal profilo) | scenario (serious-game) | `completion: false`, `duration` |

IRI dei tipi di attività:
- serious-game: `https://w3id.org/xapi/seriousgames/activity-types/serious-game`
- quest: `https://w3id.org/xapi/seriousgames/activity-types/quest`
- zone: `https://w3id.org/xapi/seriousgames/activity-types/zone`
- question: `http://adlnet.gov/expapi/activities/question`

### Statement di fine scenario
- `result.success` = `outcome == "passed"` (deciso solo dagli indicatori, RF-8).
- `result.completion` = `true`.
- `result.duration` = `completionTimeMs` in ISO 8601 (es. `PT6M52.3S`).
- `result.score.raw` = `pointsTotal`: è solo informativo, non determina `success`.
- `result.extensions`: `errors`, `sequence-respected`, `level`, progress = 1.

Esempio:
```json
{
  "actor": { "objectType": "Agent", "account": { "homePage": "https://questzero.it", "name": "P-0042" } },
  "verb": { "id": "http://adlnet.gov/expapi/verbs/completed", "display": { "it-IT": "ha completato" } },
  "object": {
    "id": "https://questzero.it/xapi/scenari/incendio-magazzino",
    "definition": {
      "type": "https://w3id.org/xapi/seriousgames/activity-types/serious-game",
      "name": { "it-IT": "Emergenza incendio in magazzino" }
    }
  },
  "result": {
    "success": true,
    "completion": true,
    "duration": "PT6M52.3S",
    "score": { "raw": 85 },
    "extensions": {
      "https://w3id.org/xapi/seriousgames/extensions/progress": 1,
      "https://questzero.it/xapi/ext/errors": 2,
      "https://questzero.it/xapi/ext/sequence-respected": true,
      "https://questzero.it/xapi/ext/level": 3
    }
  },
  "context": {
    "registration": "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b",
    "contextActivities": { "category": [ { "id": "https://w3id.org/xapi/seriousgames" } ] }
  },
  "timestamp": "2026-12-10T10:22:11.902Z"
}
```

## Catalogo dello scenario (esempio)
Il file vive nel progetto Unity e una copia (o un endpoint) è disponibile alla dashboard per le etichette. I contenuti reali li fornisce l'esperto di sicurezza (D2): gli ID qui sotto sono solo segnaposto.

```json
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
  "zones": [ { "id": "zona-fumo-denso", "label": "Zona di fumo denso" } ],
  "passCriteria": { "maxErrors": 2, "maxCompletionTimeMs": 600000, "sequenceRequired": true }
}
```
`passCriteria` è l'unico posto in cui stanno le soglie di superamento (RNF-15).

## Punti aperti
- Come il visore riceve il `sessionId`: per esempio il formatore crea la sessione per quel visore e il client la scarica all'avvio, oppure il partecipante inserisce un codice breve.
- Autenticazione del visore verso il backend (token di dispositivo?) (RNF-10, RNF-11).
- Se il comando di interruzione del formatore (`aborted_by_trainer`) è nell'MVP.
- Quale LRS di prova usare (D1).
- Verifica degli IRI del profilo xAPI-SG sulla definizione ufficiale.
