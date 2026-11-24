# Guida per lo sviluppatore Unity

Questa guida spiega, in parole semplici, come il visore parla con il backend di QuestZero.
Le regole precise (campi, tipi di evento, codici di errore) stanno nel contratto
[`docs/eventi-xapi.md`](eventi-xapi.md), bozza 0.7: in caso di dubbio vale il contratto.

## In breve

1. Il formatore crea la sessione dalla dashboard e legge un **codice di 6 cifre**.
2. Il partecipante (o il formatore) inserisce il codice nel visore con i controller.
3. Il visore manda il codice a **`pair`** e riceve un **token**: è il suo "pass" per quella sessione.
4. Durante lo scenario il visore scrive ogni evento su disco e lo manda a **`events`**, insieme al token.
5. Se la rete cade, gli eventi restano su disco e partono quando la rete torna.

Il visore **non** ha un account Supabase, **non** conosce l'email del partecipante e **non** manda mai posizioni, rotazioni o direzione dello sguardo (RNF-13, RNF-19).

## Indirizzi

| Ambiente | Indirizzo base | Quando |
|---|---|---|
| Online | `https://xqwcjnvbptrcjjsnmnjc.supabase.co/functions/v1` | Uso normale, prove in aula |
| Locale | `http://<IP-del-PC>:44321/functions/v1` | Sviluppo, con il backend acceso sul PC (`npm start` in `backend/`) |

- Le due funzioni sono `.../pair` e `.../events`.
- In locale `127.0.0.1` **non funziona dal visore**: è un altro dispositivo. Serve l'indirizzo del PC nella rete Wi-Fi (in PowerShell: `ipconfig`, voce "Indirizzo IPv4", es. `192.168.1.20`). Visore e PC devono essere sulla stessa rete, e Windows deve consentire le connessioni in entrata sulla porta `44321` (Windows Defender Firewall → Regole connessioni in entrata).
- In locale l'indirizzo è `http`, non `https`: su Android (Quest) va permesso in Unity, **Player Settings → Other Settings → Allow downloads over HTTP**. Online si usa sempre `https`.
- Tieni l'indirizzo base in **un solo punto** della configurazione del progetto Unity, così si passa da locale a online senza toccare il codice.
- Non serve nessuna chiave: le due funzioni accettano il visore senza login Supabase. Basta l'header `Content-Type: application/json` (e il token per `events`).

## 1. Abbinamento con il codice di 6 cifre

**Richiesta**

```http
POST https://xqwcjnvbptrcjjsnmnjc.supabase.co/functions/v1/pair
Content-Type: application/json

{ "pairingCode": "482913", "clientVersion": "0.3.0" }
```

**Risposta `200`**

```json
{
  "sessionId": "c2a1e7d4-5b6f-4e8a-9c0d-1f2e3a4b5c6d",
  "sessionToken": "3f9c…(64 caratteri)…",
  "scenarioId": "incendio-magazzino",
  "privacyRequired": true,
  "privacyNoticeVersion": "2026-12-01"
}
```

Cosa fare:
- Salva **subito su disco** `sessionId` e `sessionToken` (insieme alla coda, vedi sotto). Il token non si mostra a nessuno e non si scrive nei log.
- Se `privacyRequired` è `true`: mostra l'informativa; quando il partecipante accetta, metti in coda un evento `privacy.accepted` con `privacyNoticeVersion` ricevuta qui e `attemptId: null`, **prima** di `scenario.started`. Se è `false`, non mostrare nulla: l'ha già accettata.

**Errori**

| Codice | Significato | Cosa fa il visore |
|---|---|---|
| `400` | Il codice non è di 6 cifre | "Inserisci 6 cifre" |
| `404` | Codice sbagliato, scaduto (vale 10 minuti) o già usato | "Codice non valido, chiedi un nuovo codice al formatore" |
| `429` | Troppi codici sbagliati negli ultimi 10 minuti | "Riprova tra qualche minuto" |
| `5xx` o niente rete | Problema temporaneo | Riprova tra qualche secondo |

Se il visore si riavvia a sessione iniziata e ha perso il token, il formatore genera un **nuovo codice per la stessa sessione** e il visore si abbina di nuovo.

## 2. Invio degli eventi

Gli eventi possibili sono 7: `privacy.accepted`, `scenario.started`, `objective.completed`, `choice.made`, `error.committed`, `safety_distance.violated`, `scenario.ended`. Campi e significato sono nel contratto, sezione "Tipi di evento".

Regole della "busta" comune a tutti:
- `schemaVersion`: sempre `1`.
- `eventId`: un UUID nuovo per ogni evento (`System.Guid.NewGuid().ToString()`), generato **una volta** e salvato con l'evento: se lo reinvii, deve essere lo stesso.
- `seq`: numero progressivo **per sessione**, parte da 1, senza buchi. Va salvato su disco: dopo un riavvio si continua dal numero successivo.
- `attemptId`: un UUID nuovo a ogni `scenario.started`, uguale per tutti gli eventi di quel tentativo; `null` solo per `privacy.accepted`.
- `timestamp`: l'ora in cui l'evento **accade**, in UTC con millisecondi e la `Z` finale: `DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture)`.
- `scenarioId` e `scenarioVersion`: quelli del catalogo dello scenario.
- Indicatori ed esito li calcola il visore e li manda in `scenario.ended` (RF-13, RF-14). Punti e livello **non** decidono l'esito (RF-8).

**Esempio di richiesta completa** (un pacchetto con 3 eventi):

```http
POST https://xqwcjnvbptrcjjsnmnjc.supabase.co/functions/v1/events
Content-Type: application/json
Authorization: Bearer 3f9c…(il sessionToken ricevuto da pair)…

[
  {
    "schemaVersion": 1,
    "eventId": "8b0f0a4e-3c1d-4f2a-9a57-2d6f1c9e7b10",
    "sessionId": "c2a1e7d4-5b6f-4e8a-9c0d-1f2e3a4b5c6d",
    "attemptId": null,
    "seq": 1,
    "type": "privacy.accepted",
    "timestamp": "2026-12-10T10:14:02.118Z",
    "scenarioId": "incendio-magazzino",
    "scenarioVersion": "1.0.0",
    "payload": { "privacyNoticeVersion": "2026-12-01" }
  },
  {
    "schemaVersion": 1,
    "eventId": "1d6a2c55-8f0b-4e4e-9d1a-7b3c2e9f0a11",
    "sessionId": "c2a1e7d4-5b6f-4e8a-9c0d-1f2e3a4b5c6d",
    "attemptId": "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b",
    "seq": 2,
    "type": "scenario.started",
    "timestamp": "2026-12-10T10:15:00.004Z",
    "scenarioId": "incendio-magazzino",
    "scenarioVersion": "1.0.0",
    "payload": { "attemptNumber": 1, "clientVersion": "0.3.0" }
  },
  {
    "schemaVersion": 1,
    "eventId": "a7c41e90-2b3d-4c8e-8f1a-5d6e7f8a9b0c",
    "sessionId": "c2a1e7d4-5b6f-4e8a-9c0d-1f2e3a4b5c6d",
    "attemptId": "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b",
    "seq": 3,
    "type": "choice.made",
    "timestamp": "2026-12-10T10:15:32.481Z",
    "scenarioId": "incendio-magazzino",
    "scenarioVersion": "1.0.0",
    "payload": { "choiceId": "tipo-estintore", "optionId": "co2", "correct": true, "pointsAwarded": 15, "pointsTotal": 15 }
  }
]
```

**Risposta `200`**

```json
{
  "accepted": ["8b0f0a4e-…", "1d6a2c55-…", "a7c41e90-…"],
  "rejected": []
}
```

- `accepted`: eventi salvati (anche quelli che il backend aveva già: un reinvio non crea doppioni).
- `rejected`: eventi che non rispettano il contratto, ognuno con `reason`. **Non** si reinviano: scrivili nel log del visore, ti dicono cosa correggere.
- Dopo una risposta `200` togli dalla coda **sia gli accettati sia i rifiutati**.

**Errori sull'intera richiesta** (nessun evento salvato):

| Codice | Significato | Cosa fa il visore |
|---|---|---|
| `400` | Il corpo non è un array JSON di 1–100 eventi | Errore di programma: log |
| `401` | Token mancante, sbagliato o scaduto | Tieni la coda; chiedi un nuovo codice al formatore e abbinati di nuovo |
| `403` | Un evento ha un `sessionId` diverso da quello del token | Errore di programma: log |
| `413` | Più di 100 eventi | Dividi il pacchetto e reinvia |
| `5xx` o niente rete | Problema temporaneo | Reinvia più tardi, stesso ordine |

## 3. La coda quando manca la rete (RNF-9)

Il visore non deve mai perdere un evento e non deve mai aspettare la rete per andare avanti.

1. **Ogni evento si scrive su disco prima di inviarlo** (per esempio un file JSON per evento, o un file a righe, in `Application.persistentDataPath`). Sullo stesso disco salva `sessionId`, `sessionToken` e l'ultimo `seq` usato.
2. **Un "invio" separato dal gioco** (una coroutine o un task in background) prende dalla coda fino a 100 eventi **in ordine di `seq`** e li manda a `events`.
3. Con risposta `200`: cancella dal disco gli eventi in `accepted` e in `rejected`, poi passa al gruppo successivo.
4. Senza rete o con `5xx`: non cancellare nulla; riprova dopo un'attesa che cresce (2 s, 4 s, 8 s… fino a 60 s). Il gioco intanto continua normalmente.
5. Con `401`: non cancellare nulla; serve un nuovo abbinamento. La coda partirà con il nuovo token.
6. Al riavvio dell'app: se la coda su disco non è vuota, riprende a inviarla.
7. Il **comando di interruzione** del partecipante (RNF-16) chiude lo scenario subito: l'evento `scenario.ended` con `reason: "aborted_by_participant"` va in coda come gli altri, senza aspettare la rete.

Note utili:
- Il token resta valido fino a **24 ore dopo la chiusura** della sessione (al massimo 7 giorni dall'abbinamento): una coda rimasta indietro per un problema di rete arriva comunque.
- La sessione si chiude quando la chiude il formatore, oppure **da sola dopo 30 minuti senza eventi** (RF-23). Gli eventi in coda vengono salvati anche dopo; per un nuovo partecipante serve una nuova sessione e un nuovo codice.
- Mandare un evento due volte non è un problema: il backend riconosce l'`eventId`.

## 4. Schema del codice in Unity (indicativo)

```csharp
// Abbinamento
var body = JsonUtility.ToJson(new PairRequest { pairingCode = codice, clientVersion = Application.version });
using var req = new UnityWebRequest($"{baseUrl}/pair", "POST");
req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
req.downloadHandler = new DownloadHandlerBuffer();
req.SetRequestHeader("Content-Type", "application/json");
yield return req.SendWebRequest();
// 200 → salva sessionId e sessionToken su disco; 404/429 → messaggio al partecipante

// Invio di un gruppo di eventi dalla coda
req.SetRequestHeader("Authorization", $"Bearer {sessionToken}");
// corpo: array JSON degli eventi in ordine di seq (JsonUtility non serializza array alla radice:
// usa Newtonsoft Json.NET, pacchetto com.unity.nuget.newtonsoft-json)
```

## 5. Come provare

1. Sul PC: Docker Desktop acceso, poi in `backend/` `npm start`.
2. Crea un formatore e uno studente di prova (in locale li crea anche il test `npm run test:functions`, oppure da Studio: http://127.0.0.1:44323).
3. Il formatore crea una sessione e genera il codice dalla dashboard (quando ci sarà). Nel frattempo, nell'editor SQL di Studio, con gli id veri del formatore e dello studente:
   ```sql
   -- "Diventa" il formatore per questa connessione, crea la sessione e genera il codice.
   select set_config('request.jwt.claims', '{"sub":"<id formatore>","role":"authenticated"}', false);
   insert into public.sessions (participant_id, trainer_id, scenario_id)
     values ('<id studente>', '<id formatore>', 'incendio-magazzino') returning id;
   select * from public.create_pairing_code('<id sessione restituito sopra>');
   ```
4. Dal visore: abbinamento, poi un tentativo completo.
5. Controlla in Studio le tabelle `events`, `attempts` e `xapi_outbox`.
