# Improvements app — backlog

Miglioramenti dell'app segnalati da Roberto (test su `safetaxi-nu.vercel.app`). Le priorità tengono conto di cosa è pronto nel backend (roadmap in `CLAUDE.md`).

Legenda priorità: **P1** subito (quick win) · **P2** prossimo giro · **P3** richiede lavoro di backend o dati.
Stato: `da fare` · `in corso` · `fatto` · `bloccato`.

## Riepilogo

| ID | Miglioramento | Priorità | Tocca il backend | Stato |
|----|---------------|----------|------------------|-------|
| IMP-01 | Descrizione: "OK" basta per 4–5 stelle, 20 caratteri per 1–3 stelle | P1 | sì (migrazione `submit_report`) | da fare |
| IMP-02 | Ricerca del rating con targa, licenza o entrambe | P1 | sì (migrazione `get_driver_rating`) | da fare |
| IMP-05a | Termometro a tachimetro + "Seleziona città" verso la Mappa | P1 | no | da fare |
| IMP-04 | Partenza modificabile, indirizzi preferiti e recenti (solo sul telefono) | P2 | no | da fare |
| IMP-03 | Filtro del feed per città e parola chiave | P2 | sì (ricerca lato server) | da fare |
| IMP-05b | Trend del termometro sugli ultimi 12 mesi (Italia e città) | P3 | sì (serie mensile) | da fare |
| IMP-06 | Dati ufficiali su licenze, fabbisogno, redditi, tariffe | P3 | sì (tabella con fonti) | da fare |
| IMP-07 | Nuovo tipo di segnalazione "Taxi non disponibile / attesa lunga" | P3 | sì (nuovo tipo) | proposta |

IMP-01 e IMP-02 vanno nella stessa pull request (una migrazione). I P1 partono quando la chat master ("Roadmap planning e verifica locale", branch `claude/dreamy-johnson-abhi3m`) ha finito il lavoro in corso: sessione ferma, nessuna pull request aperta, branch allineato a `main`.

## Dettaglio

### IMP-01 — Descrizione in base alle stelle
Decisione di Roberto:
- 4–5 stelle: basta un carattere (anche "OK").
- 1–3 stelle: minimo 20 caratteri. Nel campo commento (placeholder e testo di aiuto sotto) si spiega che per le recensioni negative o neutre serve la descrizione dell'accaduto. Il testo di aiuto cambia quando si scelgono le stelle.

Cosa cambia:
- Frontend: `src/app.js` (validazione della descrizione), `index.html` (placeholder e testo di aiuto).
- Backend: nuova migrazione che ridefinisce `public.submit_report` (ultima versione in `20260926200000_corsa_verificata.sql`) con la stessa regola; test pgTAP in `supabase/tests/database/01_accessi_e_regole.test.sql` per entrambi i casi.
- Restano invariati i 20 caratteri su replica del tassista e segnalazione DSA.

### IMP-02 — Targa e licenza: obbligatorie nelle recensioni, una delle due nella ricerca
Decisione di Roberto:
- Recensione: targa **e** licenza obbligatorie (come oggi, nessuna modifica).
- Ricerca del rating prima della corsa: due campi, targa e licenza. Basta uno dei due; si possono compilare entrambi.

Cosa cambia:
- Oggi c'è un solo campo "targa o licenza" e `get_driver_rating(p_query)` cerca `targa = q oppure licenza = q`. Partire dall'ultima versione della funzione (`20260927120000_ricerca_targa.sql`: elenco delle segnalazioni del taxi, limite di 5 ricerche all'ora) e mantenerne le regole.
- Nuova firma `get_driver_rating(p_plate, p_license)`: con un solo campo cerca su quello; con entrambi cerca le segnalazioni che corrispondono a **tutti e due** (risultato più preciso). Restano la soglia di 5 segnalazioni verificate e la targa mascherata.
- Frontend: due campi nel riquadro di ricerca; modalità demo in `src/lib/indices.js` allineata.

### IMP-03 — Filtro del feed per città e parola chiave
- Filtro città: menu accanto a Tutte/Positive/Negative.
- Parola chiave: solo sul testo pubblico della segnalazione (descrizione, tratta), mai su targa o licenza.
- Con il backend Supabase il filtro va fatto sul server (il feed è paginato): parametri città e testo nella query, indice di ricerca testuale in una migrazione.

### IMP-04 — Punto di partenza, preferiti, recenti (Home, "Dove vai?")
Decisione di Roberto: funzione dell'app, dati salvati solo sul telefono.
- Campo "Partenza" con "Posizione attuale" (GPS) come valore predefinito, modificabile.
- Indirizzi preferiti: Casa, Lavoro, etichette libere. Aggiungi, rinomina, elimina.
- Recenti: ultime 10 destinazioni, con "Cancella cronologia".
- Salvataggio: nell'app nativa con `@capacitor/preferences` (archivio del sistema operativo); sul web nel browser. Motivo: su iOS lo spazio dati della WebView può essere cancellato dal sistema quando la memoria scarseggia, l'archivio nativo no. Plugin gratuito, ufficiale Capacitor.
- Mai inviati al server; si cancellano con "Elimina account" e disinstallando l'app. Aggiornare la bozza "Sicurezza dei dati" (`docs/store/`): dati trattati solo sul dispositivo.
- Da valutare nello stesso intervento: anche i contatti di emergenza del SOS oggi sono nello spazio dati della WebView, meglio spostarli sull'archivio nativo.
- Vincolo: le regole d'uso di Nominatim vietano l'autocompletamento mentre si scrive. Ricerca con il pulsante "Cerca" finché non scegliamo un fornitore di mappe per la produzione.

### IMP-05a — Termometro a tachimetro e selezione città
- Sostituire la faccina con un tachimetro dal rosso (0) al verde (100), valore e giudizio in testo (non solo colore, per accessibilità).
- Pulsante "Seleziona città" che apre la tab Mappa sulla ricerca città.
- Stessa grafica nella scheda di ogni città.

### IMP-05b — Trend 12 mesi
- Grafico con il valore dell'indice a fine mese per gli ultimi 12 mesi, Italia e singola città.
- Backend: funzione che calcola la serie mensile con la stessa regola dell'indice (solo utenti verificati, peso dimezzato ogni 90 giorni).
- Con meno segnalazioni del minimo in un mese il punto non si mostra.

### IMP-06 — Dati ufficiali
Vedi la sezione "Fonti". Ogni dato salvato nel database con fonte, link, anno di riferimento e data di pubblicazione, mostrati in pagina.

### IMP-07 — Segnalazione "Taxi non disponibile / attesa lunga"
Nuovo tipo di segnalazione con luogo, orario e minuti di attesa. Unico modo di avere un dato proprio sulla domanda non servita, mostrato come "dati Safe Taxi", separato dai dati ufficiali.

## Fonti per i dati di città e Italia

### Regola di aggiornamento
Decisione di Roberto: niente dati vecchi. Regola proposta, applicabile a tutti i dati:
- si usa sempre **l'ultima pubblicazione ufficiale**, uscita da non più di 12 mesi;
- in pagina si mostrano sempre fonte, anno di riferimento e data di pubblicazione;
- se la fonte non ha pubblicato negli ultimi 12 mesi, il dato si nasconde (non si mostra un dato scaduto).

Limite da sapere: i dati fiscali hanno un ritardo strutturale. Il MEF pubblica nel 2026 i redditi dell'anno d'imposta 2024 (dichiarazioni presentate nel 2025). Non esiste un reddito dichiarato più recente: con una regola "dato riferito agli ultimi 12 mesi" il reddito non si potrebbe mai mostrare.

### Fonti scelte

| Dato | Fonte principale | Aggiornamento | Note |
|------|------------------|---------------|------|
| Licenze taxi per comune | **RENT**, Registro elettronico nazionale taxi e NCC (MIT, DM 203/2024, pienamente operativo da aprile 2026) | Continuo | Da verificare se esiste una consultazione o un export per comune. In alternativa: richiesta di accesso civico generalizzato (FOIA, D.Lgs. 33/2013 art. 5) al MIT per il conteggio per comune, ripetuta ogni 6 mesi |
| Licenze taxi (conferma) | Comuni: albo/open data, delibere e bandi di nuove licenze | Alla delibera | Per le città monitorate. FOIA al Comune se non pubblicato |
| Licenze taxi (serie storica) | ISTAT, "Dati ambientali nelle città" | Annuale, ritardo circa 18 mesi | Solo per il confronto negli anni, non come dato corrente |
| Fabbisogno di licenze | Metodologia delle Linee guida ART (delibera 46/2022) e pareri ART ai singoli Comuni | Pareri alla richiesta del Comune | Il metodo è del regolatore. Input da tenere entro 12 mesi: popolazione ISTAT (bilancio mensile), presenze turistiche ISTAT, passeggeri aeroporti (Assaeroporti mensile, ENAC annuale) |
| Tariffe | Delibere comunali | Alla delibera | Sempre la delibera in vigore |
| Ricavi e reddito dichiarati | MEF – Dipartimento delle Finanze, statistiche dichiarazioni e ISA (ATECO 49.32.10 fino al 2023, 49.33.10 dal 2024) | Annuale | Livello nazionale e regionale; per provincia da verificare, altrimenti FOIA al Dipartimento delle Finanze |
| Corse / chiamate inevase | Nessuna fonte pubblica | — | Solo cooperative radiotaxi (dati privati). Dato proprio: IMP-07 |

### Carenza di taxi
- Il numero di corse richieste non è pubblico: l'attuale "Richieste per licenza al giorno" è DEMO e va tolto.
- Indicatore proposto: **fabbisogno di licenze calcolato con la metodologia ART** sui dati ufficiali più recenti, confrontato con le licenze attive (RENT o Comune). Dove esiste un parere ART per quella città si cita quello. Formula e fonti pubblicate in pagina.

### Ricavo stimato: proposta di sostituzione
Il requisito 9 prevede "ricavo orario stimato vs reddito medio dichiarato". Così non è difendibile:
- il **reddito** è quello che resta dopo i costi (carburante, auto, assicurazione, radiotaxi); il **ricavo** è l'incasso. Confrontarli significa mettere a confronto grandezze diverse: un tassista lo contesterebbe, e avrebbe ragione;
- il ricavo orario richiede di sapere quanto l'auto viaggia a vuoto, e questo dato pubblico non esiste: qualunque percentuale scegliamo è un'ipotesi nostra.

Proposta, solo con dati ufficiali e una convenzione dichiarata:
- **Corse al giorno equivalenti ai ricavi dichiarati** = ricavi medi dichiarati (MEF) ÷ giorni di servizio all'anno ÷ prezzo della "corsa tipo".
- Prezzo della corsa tipo: calcolato dalla delibera tariffaria della città per un percorso standard fisso (per esempio 6 km e 15 minuti, diurno feriale, uguale per tutte le città).
- Giorni di servizio: dal regolamento comunale dei turni, se lo indica; altrimenti una convenzione dichiarata.
- In pagina si mostra il risultato ("i ricavi dichiarati corrispondono in media a N corse tipo al giorno") con tutti gli ingredienti e le fonti, senza commenti. Chiunque può rifare il calcolo.
- Il reddito dichiarato si mostra a parte, come dato MEF, senza confronto con stime.
- Solo livello aggregato; validazione legale prima della pubblicazione.
- **Confermato da Roberto** (27/09/2026): requisito 9 di `CLAUDE.md` aggiornato.

### Da verificare
- RENT: esiste una consultazione pubblica o un export per comune? Se no, preparare la richiesta FOIA al MIT.
- Delibera ART 46/2022: variabili richieste dalla metodologia e disponibilità pubblica di ciascuna.
- Pareri ART esistenti per le città monitorate.
- MEF: disponibilità dei ricavi (non solo del reddito) per l'ATECO dei taxi e livello territoriale minimo.
