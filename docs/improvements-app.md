# Improvements app — backlog

Miglioramenti dell'app segnalati da Roberto (test su `safetaxi-nu.vercel.app`). Le priorità tengono conto di cosa è pronto nel backend (roadmap in `CLAUDE.md`).

Legenda priorità: **P1** subito (quick win) · **P2** prossimo giro · **P3** richiede lavoro di backend o dati.
Stato: `da fare` · `in corso` · `fatto` · `bloccato`.

## Riepilogo

| ID | Miglioramento | Priorità | Tocca il backend | Stato |
|----|---------------|----------|------------------|-------|
| IMP-01 | Descrizione senza minimo di 20 caratteri | P1 | sì (migrazione `submit_report`) | da fare |
| IMP-02 | Targa obbligatoria, licenza facoltativa | P1 | sì (migrazione `submit_report`) | da fare |
| IMP-05a | Termometro a tachimetro + "Seleziona città" verso la Mappa | P1 | no | da fare |
| IMP-04 | Partenza modificabile, indirizzi preferiti e recenti | P2 | no (solo sul dispositivo) | da fare |
| IMP-03 | Filtro del feed per città e parola chiave | P2 | sì (ricerca lato server) | da fare |
| IMP-05b | Trend del termometro sugli ultimi 12 mesi (Italia e città) | P3 | sì (serie mensile) | da fare |
| IMP-06 | Dati ufficiali su licenze, fabbisogno, redditi, tariffe | P3 | sì (tabella con fonti) | da fare |
| IMP-07 | Nuovo tipo di segnalazione "Taxi non disponibile / attesa lunga" | P3 | sì (nuovo tipo) | proposta |

IMP-01 e IMP-02 vanno nella stessa pull request: modificano la stessa funzione `submit_report`. Da coordinare con la chat master per non avere due migrazioni in parallelo sulla stessa funzione.

## Dettaglio

### IMP-01 — Descrizione senza minimo di caratteri
Richiesta: basta anche "OK".
- Frontend: `src/app.js` (controllo `min. 20 caratteri` in validazione), placeholder in `index.html`.
- Backend: nuova migrazione che ridefinisce `public.submit_report` (ultima versione in `20260926200000_corsa_verificata.sql`) con minimo 1 carattere; aggiornare il test pgTAP in `supabase/tests/database/01_accessi_e_regole.test.sql`.
- Resta il minimo di 20 caratteri su replica del tassista e segnalazione DSA: lì serve una motivazione.
- Nota: per le segnalazioni **negative** un testo di due lettere non dà al moderatore i fatti da valutare, né al tassista qualcosa a cui replicare. Proposta alternativa: nessun minimo per le positive, 10 caratteri per le negative. Decide Roberto; di default si applica la richiesta (nessun minimo).

### IMP-02 — Targa obbligatoria, licenza facoltativa
Motivo: la targa si legge sempre, il numero di licenza spesso no.
- Frontend: `src/app.js` (validazione `licenza`), asterisco in `index.html`.
- Backend: in `submit_report` togliere l'errore "Licenza obbligatoria" e salvare `null` se vuota (la colonna `private.reports_private.license` è già facoltativa, ma la regola sul formato rifiuta la stringa vuota).
- `get_driver_rating` cerca già per targa **o** licenza: nessuna modifica.
- Aggiornare il requisito 1 in `CLAUDE.md`.
- Da sapere: la targa identifica l'auto, non il conducente (sostituti alla guida, auto cambiata). Il rating per targa resta un rating del "taxi", è accettabile e va detto nella pagina "Come verifichiamo le recensioni".

### IMP-03 — Filtro del feed per città e parola chiave
- Filtro città: menu accanto a Tutte/Positive/Negative.
- Parola chiave: solo sul testo pubblico della segnalazione (descrizione, tratta), mai su targa o licenza (la ricerca per targa esiste già nel rating, con le sue regole).
- Con il backend Supabase il filtro va fatto sul server (il feed è paginato): parametri città e testo nella query, indice di ricerca testuale in una migrazione.

### IMP-04 — Punto di partenza, preferiti, recenti (Home, "Dove vai?")
- Campo "Partenza" con il GPS come valore predefinito ("Posizione attuale"), modificabile.
- Indirizzi preferiti: Casa, Lavoro, etichette libere.
- Recenti: ultime 5–10 ricerche, con "Cancella cronologia".
- Privacy: l'indirizzo di casa è un dato personale delicato. Prima versione **solo sul dispositivo** (preferenze locali), niente server: nessun impatto su DPIA e informativa. La sincronizzazione tra dispositivi si valuta dopo.
- Vincolo tecnico: le regole d'uso di Nominatim vietano l'autocompletamento mentre si scrive. Ricerca con il pulsante "Cerca" (come oggi) finché non scegliamo un fornitore di mappe per la produzione (voce già in "Da verificare prima del rilascio").

### IMP-05a — Termometro a tachimetro e selezione città
- Sostituire la faccina con un tachimetro dal rosso (0) al verde (100), valore e giudizio in testo (non solo colore, per accessibilità).
- Pulsante "Seleziona città" che apre la tab Mappa sulla ricerca città.
- Stessa grafica nella scheda di ogni città.

### IMP-05b — Trend 12 mesi
- Grafico con il valore dell'indice a fine mese per gli ultimi 12 mesi, Italia e singola città.
- Backend: funzione che calcola la serie mensile con la stessa regola dell'indice (solo utenti verificati, peso dimezzato ogni 90 giorni).
- Con meno segnalazioni del minimo in un mese il punto non si mostra (evita trend inventati dal rumore).

### IMP-06 — Dati ufficiali (vedi sezione "Fonti")
Sostituire i dati DEMO di licenze, domanda, tariffe e redditi con dati ufficiali, ognuno con fonte, anno e link salvati nel database e mostrati in pagina.

### IMP-07 — Segnalazione "Taxi non disponibile / attesa lunga"
Nuovo tipo di segnalazione con luogo, orario e minuti di attesa. È l'unico modo di avere un dato proprio sulla domanda non servita, da mostrare come "dati Safe Taxi", separato dai dati ufficiali.

## Fonti per i dati di città e Italia

Obiettivo: far emergere la carenza di taxi rispetto alla domanda con dati ufficiali e pubblici.

| Dato | Fonte | Livello | Affidabilità |
|------|-------|---------|--------------|
| Licenze taxi e licenze ogni 10.000 abitanti | ISTAT, rilevazione "Dati ambientali nelle città" (mobilità urbana) | Comuni capoluogo, annuale | Ufficiale (Sistan). Verificare l'ultimo anno pubblicato |
| Fabbisogno di licenze | Pareri ART ai Comuni sul contingente (art. 37 DL 201/2011) e metodologia delle Linee guida ART, delibera 46/2022 | Solo i Comuni che hanno chiesto il parere | Ufficiale. È il metodo del regolatore |
| Popolazione, presenze turistiche | ISTAT | Comune | Ufficiale |
| Passeggeri aeroporti | ENAC / Assaeroporti | Aeroporto | Ufficiale (ENAC) |
| Tariffe | Delibere comunali | Comune | Ufficiale |
| Reddito dichiarato | MEF – Dipartimento delle Finanze, statistiche per ATECO (49.32.10 fino all'anno d'imposta 2023, 49.33.10 da ATECO 2025) | Nazionale e regionale; per città da verificare | Ufficiale |
| Numero di corse / chiamate inevase | Nessuna fonte pubblica | — | Solo cooperative radiotaxi (dati privati) |

Conclusioni:
- **Il numero di corse richieste non è pubblico.** Non si può mostrare come dato ufficiale. L'attuale "Richieste per licenza al giorno" è DEMO e va tolto o sostituito.
- **La carenza si può dimostrare in modo difendibile** calcolando il fabbisogno di licenze di ogni città con la metodologia delle Linee guida ART (delibera 46/2022) su dati ISTAT/ENAC e confrontandolo con le licenze ISTAT. Dove esiste un parere ART per quella città, si cita quello. Formula e fonti pubblicate in pagina, etichetta "Stima Safe Taxi su metodologia ART".
- **Reddito dichiarato vs ricavo stimato**: il ricavo è una nostra stima, il reddito un dato fiscale. Affiancarli suggerisce evasione di una categoria: rischio reputazionale e legale. Solo aggregato, metodo pubblicato, testo neutro ("differenza tra stima e dichiarato"), validazione legale prima della pubblicazione.
- Da fare: verificare che la delibera ART 46/2022 usi solo variabili pubbliche, scaricare le tabelle ISTAT più recenti, cercare i pareri ART per le città monitorate.
