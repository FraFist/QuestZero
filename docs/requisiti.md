# Requisiti di QuestZero (MVP)

Fonte: specifica dei requisiti consegnata il 18/11/2026 (ISO/IEC/IEEE 29148). Questo file è la versione operativa per lo sviluppo.
- «deve» = obbligatorio, «dovrebbe» = desiderabile.
- Le soglie numeriche sono ipotesi di progetto (vedi Ipotesi): se cambiano, cambia solo il criterio della prova.
- Quando implementi o testi un requisito, cita il suo ID (es. `RF-12`) nel commit e nel nome o nella descrizione del test.

> **Differenze rispetto alla specifica consegnata.** Decise dal gruppo dopo la consegna, da segnalare al docente e nella relazione:
> - Il partecipante ha un account e consulta i propri risultati nella dashboard (nuovi RU-8, RF-20, RF-21, RNF-19; modificati RF-11, RNF-10, RNF-18). Nella specifica i profili dei partecipanti erano fuori perimetro.
> - L'interruzione della sessione dalla dashboard del formatore resta fuori dall'MVP.
> - Ogni formatore vede solo i propri studenti e le proprie sessioni; un amministratore vede tutto (nuovo RF-22; modificati Ruoli, RF-17, RNF-11). Nella specifica l'amministratore non era un utente del sistema.
> - La sessione si chiude dal formatore oppure da sola dopo 30 minuti di inattività (nuovo RF-23). La specifica non diceva come si chiude una sessione.
> - Il formatore può registrare un partecipante con il solo codice, senza email né invito; l'email serve solo per dare allo studente l'accesso alla dashboard (modificati RF-20, A8).
> - LRS di prova online: LRS.io di Veracity, piano gratuito (precisata D1).

## Perimetro
Dentro: un solo scenario decisionale in VR (emergenza incendio con estintore) per un partecipante alla volta, con obiettivi intermedi, punti e livello; proiezione della vista in aula; tracciamento e valutazione dell'esito; dashboard del formatore in tempo reale; account del partecipante per consultare i propri risultati; invio dei risultati in xAPI a un sistema esterno; struttura che permette di aggiungere scenari senza modificare il resto.

Fuori (non implementare): altri scenari, gestione di corsi, profili dei partecipanti oltre all'account di RF-20 e RF-21 (gruppi, anagrafiche, registrazione libera), interruzione della sessione dalla dashboard, attestati, avvio da LMS, prova di richiamo a distanza, sessioni con più visori, aula virtuale condivisa, misurazione fisiologica dello stress.

## Ruoli
- **Partecipante**: svolge lo scenario nel visore; con il proprio account consulta i propri risultati nella dashboard.
- **Formatore**: conduce l'aula, segue la sessione dalla dashboard, fa il debriefing. Invita i propri studenti e vede solo loro e le proprie sessioni.
- **Amministratore**: vede tutti i dati di tutti i formatori e studenti; assegna i ruoli e sposta uno studente da un formatore a un altro.
- Gli altri stakeholder (ente di formazione, amministratore IT, responsabile privacy) non sono utenti del sistema, ma generano requisiti.

## Requisiti utente
| ID | Requisito | Fonte |
|---|---|---|
| RU-1 | Il partecipante deve poter svolgere uno scenario di sicurezza sul lavoro in un ambiente virtuale immersivo. | Partecipante |
| RU-2 | Il partecipante deve ricevere un riscontro immediato sulle scelte compiute. | Partecipante |
| RU-3 | Il partecipante deve poter vedere il proprio punteggio e i propri progressi. | Partecipante |
| RU-4 | Il formatore deve poter seguire una sessione in tempo reale e proiettare la vista del partecipante. | Formatore |
| RU-5 | Il formatore deve poter consultare esiti ed errori di ogni partecipante. | Formatore |
| RU-6 | L'ente deve poter aggiungere nuovi scenari senza modificare il sistema esistente. | Ente, SdA R2 |
| RU-7 | L'amministratore IT deve poter ricevere i risultati in un sistema esterno di tracciamento. | Amm. IT, SdA R7 |
| RU-8 | Il partecipante deve poter consultare in seguito esiti, punti ed errori dei propri tentativi. | Partecipante |

## Requisiti funzionali
Componente indicativo: **VR** = client Unity, **BE** = backend, **DB** = dashboard. È una guida per lo sviluppo, non fa parte della specifica consegnata.

| ID | Area | Requisito | Origine | Componente |
|---|---|---|---|---|
| RF-1 | Scenario | Proporre uno scenario decisionale di sicurezza in un ambiente 3D immersivo, con un obiettivo di apprendimento dichiarato. | RU-1 | VR |
| RF-2 | Scenario | Mostrare le conseguenze simulate di ogni scelta. | RU-2 | VR |
| RF-3 | Scenario | Consentire di ripetere lo scenario concluso senza limite di tentativi. | RU-1 | VR |
| RF-4 | Scenario | Conservare lo storico dei tentativi di ogni partecipante. | RU-5 | BE |
| RF-5 | Gamification | Suddividere lo scenario in obiettivi intermedi e mostrare quelli completati. | RU-3 | VR |
| RF-6 | Gamification | Assegnare punti a ogni azione corretta. | RU-3 | VR |
| RF-7 | Gamification | Assegnare un livello in base ai punti accumulati. | RU-3 | VR |
| RF-8 | Gamification | **Non** usare punti o livello per decidere l'esito. | SdA R1 | VR, BE |
| RF-9 | Proiezione | Consentire al formatore di avviare la proiezione della vista del partecipante su proiettore o schermo. | RU-4 | VR |
| RF-10 | Proiezione | Proporre una fase di familiarizzazione con i comandi prima dello scenario. | Partecipante | VR |
| RF-11 | Tracciamento | Associare ogni sessione a un partecipante identificato dal codice del suo account (RF-20), scelto dal formatore alla creazione della sessione. | RU-5 | BE, DB |
| RF-12 | Tracciamento | Registrare per ogni sessione gli eventi rilevanti (inizio e fine scenario, scelta effettuata, errore, violazione della distanza di sicurezza), ciascuno con data e ora. | RU-5, SdA R3, R6 | VR → BE |
| RF-13 | Tracciamento | Calcolare numero di errori, tempo di completamento e rispetto della sequenza di sicurezza prevista. | SdA R3 | VR |
| RF-14 | Tracciamento | Assegnare l'esito «superato» o «non superato» confrontando gli indicatori di RF-13 con i criteri dello scenario. | RU-5 | VR |
| RF-15 | Tracciamento | Inviare i risultati di ogni sessione a un sistema esterno di tracciamento in formato xAPI. | RU-7, SdA R2 | BE |
| RF-16 | Dashboard | Mostrare, durante la sessione, scenario in corso, tempo trascorso, errori commessi e punti ottenuti. | RU-4, SdA R8 | DB |
| RF-17 | Dashboard | Mostrare per ogni proprio partecipante esito, punteggio, livello ed errori. | RU-5 | DB |
| RF-18 | Dashboard | Mostrare gli errori più frequenti tra tutte le sessioni dello scenario. | RU-5 | BE, DB |
| RF-19 | Dashboard | Consentire di scaricare il report di una sessione in PDF. | RU-5 | BE, DB |
| RF-20 | Account | Consentire al formatore di registrare un partecipante con il solo codice partecipante, senza email, per avviare subito una sessione; se il formatore indica anche l'email, il partecipante riceve un invito per accedere alla dashboard (RF-21). Non è prevista la registrazione libera. | RU-8 | BE, DB |
| RF-21 | Account | Consentire al partecipante autenticato di consultare solo i propri tentativi, con esito, punti, livello ed errori. | RU-8 | BE, DB |
| RF-22 | Account | Limitare ogni formatore ai propri studenti (quelli che ha registrato o invitato) e alle proprie sessioni; consentire all'amministratore di vedere tutto. Gli errori più frequenti (RF-18) restano calcolati su tutte le sessioni, ma come soli conteggi. | RU-5 | BE, DB |
| RF-23 | Tracciamento | Chiudere una sessione quando il formatore lo chiede oppure automaticamente dopo 30 minuti senza attività (nessun evento ricevuto dal visore e nessun abbinamento). Una sessione chiusa non si riapre. | RU-4, RU-5 | BE, DB |

## Requisiti non funzionali
| ID | Caratteristica (ISO 25010) | Requisito | Fonte |
|---|---|---|---|
| RNF-1 | Idoneità funzionale | Gli esiti calcolati devono coincidere con il calcolo manuale su 10 sessioni di prova. | Ente |
| RNF-2 | Efficienza prestazionale | Il client deve mantenere almeno 72 fps per il 95% della durata dello scenario. | Partecipante |
| RNF-3 | Efficienza prestazionale | Feedback visivo o sonoro entro 1 s da ogni scelta. | Partecipante |
| RNF-4 | Efficienza prestazionale | La dashboard deve mostrare un evento entro 3 s dal momento in cui si verifica. | Formatore |
| RNF-5 | Compatibilità | I risultati inviati devono rispettare il profilo xAPI per i serious game (xAPI-SG). | Amm. IT, SdA R2 |
| RNF-6 | Compatibilità | Il client deve funzionare su un visore standalone, senza computer. | Ente |
| RNF-7 | Capacità di interazione | Lo scenario si svolge solo con i controller del visore, senza tastiera né mouse. | Partecipante |
| RNF-8 | Capacità di interazione | La vista in tempo reale di una sessione si raggiunge in non più di 3 clic dalla pagina iniziale della dashboard. | Formatore |
| RNF-9 | Affidabilità | Se cade la connessione durante una sessione, il sistema conserva tutti gli eventi e li invia al ripristino, senza perdite in 10 prove. | Formatore |
| RNF-10 | Sicurezza informatica | Accesso alla dashboard solo a utenti autenticati (formatori e partecipanti). | Amm. IT |
| RNF-11 | Sicurezza informatica | Accesso a ogni funzione limitato ai ruoli autorizzati (partecipante, formatore, amministratore). | Amm. IT |
| RNF-12 | Sicurezza informatica | Dati personali cifrati durante la trasmissione. | Amm. IT, Privacy |
| RNF-13 | Sicurezza informatica | **Non** memorizzare i movimenti continui di testa, mani e sguardo. | Privacy, SdA R6 |
| RNF-14 | Manutenibilità | Un nuovo scenario si aggiunge senza modificare tracciamento, valutazione e dashboard. | Ente, SdA R2 |
| RNF-15 | Manutenibilità | I criteri di superamento si modificano senza toccare il contenuto dello scenario. | Ente, SdA R2 |
| RNF-16 | Safety | La sessione si interrompe entro 1 s dal comando di interruzione del partecipante, disponibile in ogni momento. | Partecipante |
| RNF-17 | Safety | Nei contenuti visivi non più di 3 lampeggiamenti al secondo. | Partecipante |
| RNF-18 | Vincoli esterni | Mostrare l'informativa sul trattamento dei dati e registrarne l'accettazione prima del primo utilizzo: una volta per partecipante, di nuovo se cambia la versione dell'informativa. | Privacy, GDPR |
| RNF-19 | Sicurezza informatica | L'email del partecipante resta nel backend: non compare negli eventi, nel visore né nei dati inviati al sistema esterno, dove si usa solo il codice partecipante. | Privacy, GDPR |

## Vincoli che pesano sul codice
- **RF-8**: l'esito dipende solo dagli indicatori di RF-13. Punti e livello non entrano mai nel calcolo dell'esito.
- **RF-12 + RNF-13**: si inviano solo eventi discreti, mai uno per frame o flussi continui di posizione e sguardo.
- **RNF-9**: il client mette gli eventi in coda e li reinvia al ripristino della connessione, senza duplicarli.
- **RNF-14 + RNF-15**: tracciamento, valutazione e dashboard non contengono logica specifica dello scenario incendio; i criteri di superamento sono dati di configurazione, non codice.
- **RNF-11 + RF-21 + RF-22**: le regole di accesso stanno nel database (RLS): il partecipante legge solo le proprie righe, il formatore quelle dei propri studenti e delle proprie sessioni, l'amministratore tutte.
- **RNF-19**: l'email vive solo nel sistema di autenticazione; ovunque altrove il partecipante è il suo codice.
- Il formato degli eventi VR → backend e la mappatura in xAPI sono definiti in `docs/eventi-xapi.md`.

## Prove di verifica
Gli ID P-n sono aggiunti qui per comodità; nella specifica le prove non sono numerate.

| ID | Prova | Metodo | Requisiti | Criterio di superamento |
|---|---|---|---|---|
| P-1 | Esecuzione dello scenario davanti al formatore | Dimostrazione | RF-1, RF-2, RF-3, RF-5, RF-9, RF-10, RNF-7, RNF-18 | Ogni funzione è mostrata funzionante, lo scenario si svolge solo con i controller e l'informativa compare al primo accesso. |
| P-2 | Sessioni di prova con risultati attesi noti | Test | RF-4, RF-6, RF-7, RF-11, RF-12, RF-13, RF-14, RF-23 | Eventi, indicatori, punti, livello ed esiti coincidono con i valori attesi. |
| P-3 | Dashboard | Test, dimostrazione | RF-16, RF-17, RF-18, RF-19, RF-21, RNF-8 | Dati attesi in tempo reale, vista live in non più di 3 clic, report PDF scaricato; il partecipante vede i propri tentativi. |
| P-4 | Invio a un sistema di tracciamento di prova | Test | RF-15, RNF-5 | I risultati arrivano al sistema di prova in formato xAPI. |
| P-5 | Misure di prestazione | Test | RNF-2, RNF-3, RNF-4 | Soglie rispettate durante lo scenario e sulla dashboard. |
| P-6 | Affidabilità e accesso | Test | RF-20, RF-21, RF-22, RNF-9, RNF-10, RNF-11 | Nessuna perdita di eventi in 10 prove; accessi consentiti solo ai ruoli previsti; un partecipante non vede i dati di un altro; un formatore non vede studenti e sessioni di un altro; l'amministratore vede tutto; solo il formatore crea account partecipante. |
| P-7 | Compatibilità con il visore | Test | RNF-6 | Il client si installa e funziona sul visore senza computer. |
| P-8 | Interruzione sul visore | Test | RNF-16 | La sessione si interrompe entro 1 s dal comando. |
| P-9 | Controllo di dati e contenuti | Ispezione | RNF-12, RNF-13, RNF-17, RNF-19 | Trasmissione cifrata, nessun movimento continuo nei dati salvati, nessuna email fuori dal sistema di autenticazione, non più di 3 lampeggiamenti al secondo. |
| P-10 | Analisi di dati e progetto | Analisi | RF-8, RNF-1, RNF-14, RNF-15 | L'esito non dipende da punti o livello, coincide con il calcolo manuale su 10 sessioni, scenario e criteri sono separati da tracciamento, valutazione e dashboard. |

Le prove si svolgono sul prototipo dell'MVP, senza utenti esterni al gruppo; quelle di affidabilità si ripetono 10 volte.

## Ipotesi e dipendenze
- A1. In aula ci sono un proiettore o uno schermo e una rete Wi-Fi.
- A2. Il visore è standalone e lo fornisce il gruppo.
- A3. Un solo partecipante alla volta; il formatore è presente in aula.
- A4. Scenario dimostrativo: emergenza incendio con uso dell'estintore.
- A5. Il sistema è progettato per accogliere altri scenari, ma l'MVP ne include uno solo.
- A6. Il limite dell'area di movimento e l'avviso di prossimità li gestisce il sistema del visore.
- A7. Le soglie numeriche (72 fps, 3 s, 10 sessioni…) sono ipotesi da validare sul prototipo.
- A8. L'email del partecipante è facoltativa: serve solo se deve consultare i propri risultati nella dashboard (RF-20, RF-21).
- D1. È disponibile un sistema di tracciamento di prova (LRS) che riceve i risultati in xAPI: in locale SQL LRS di Yet Analytics (Docker), online LRS.io di Veracity, piano gratuito.
- D2. I contenuti normativi e procedurali dello scenario li fornisce un esperto di sicurezza.

## Glossario
- **Scenario**: situazione simulata in cui il partecipante prende decisioni di sicurezza.
- **Obiettivo intermedio**: tappa dello scenario (es. raggiungere l'estintore).
- **Indicatori**: numero di errori, tempo di completamento, rispetto della sequenza di sicurezza (RF-13).
- **LRS**: sistema che riceve e conserva i dati di apprendimento in formato xAPI.
- **xAPI / xAPI-SG**: formato standard per registrare le attività di apprendimento / suo profilo per i serious game.
- **SdA R1–R8**: requisiti emersi dallo Stato dell'arte.
