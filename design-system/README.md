# Safe Taxi — Design System

Fondamenta grafiche dell'app: da qui partono colori, tipografia, icone e componenti.
Obiettivo: un'estetica da app di servizio consumer "high end" (Uber/Bolt/FREE NOW/Lyft/Grab),
che trasmetta sicurezza e affidabilità — mai un prototipo con emoji al posto delle icone.

## Analisi di riferimento (5 app di mobilità)

| App | Cosa prendiamo |
|---|---|
| **Uber** | Palette quasi monocromatica + un solo accento, font geometrico proprietario, icone a linee coerenti, bottoni pieni full‑width. Fiducia costruita su elementi concreti (targa verificata, foto). |
| **Bolt** | Bottoni "a pillola", alto contrasto, target touch generosi, iconografia flat coerente in tutta l'app. |
| **FREE NOW** | Badge di "licenza verificata" molto presenti — riferimento diretto per la nostra logica di verifica. |
| **Lyft** | Le schermate di sicurezza (SOS, condivisione corsa) passano a un registro visivo più sobrio e distinto dal resto dell'app. |
| **Grab** | Iconografia ricorrente a scudo/check per i badge di fiducia in una "super‑app" con più servizi, come Safe Taxi. |

**Pattern comuni applicati:** un solo colore brand dominante + un accento (mai 3+ colori saturi
insieme); font sans geometrico non di sistema; icone a linee coerenti (mai emoji); un solo stile
di bottone per ruolo; il rosso SOS isolato e mai riusato per altro; badge/iconografia a scudo‑check
per la fiducia.

## Direzione scelta: "C — Blu notte + ciano tecnico"

Tre direzioni sono state confrontate visivamente (mockup a schermo intero, stesso layout,
solo palette diversa) prima di scegliere. Blu notte (`#0E1420`) per header e bottoni primari,
un accento ciano tecnico (`#12B5C9`) riservato a badge di verifica e dettagli di fiducia, ambra
(`#F2B807`) solo per le valutazioni a stelle. Il rosso SOS (`#D7263D`) resta isolato: non è mai
usato per nient'altro nell'app, in nessuna delle tre direzioni.

## File

- **`tokens.css`** — unica fonte di colori, tipografia, raggi e ombre. `src/styles.css` importa
  questo file e usa solo le sue variabili (`var(--st-...)`), mai valori hardcoded.
- **`components.md`** — le regole per bottoni, badge, chip e card.
- Le icone vivono in `src/lib/icons.js` (non qui): sono codice, non asset statici, perché sono
  incorporate come stringhe SVG nell'HTML generato da `src/app.js`.

## Tipografia

- **Titoli, numeri, etichette dei bottoni:** Plus Jakarta Sans (700/800) — geometrico e
  distintivo, il più vicino, tra i font gratuiti, allo stile dei font proprietari di Uber/Bolt.
- **Corpo testo:** Inter (400/500/600) — leggibilità molto alta su schermi piccoli.
- Entrambi **self-hosted** via `@fontsource` (nessuna chiamata a Google Fonts a runtime: coerente
  con l'attenzione alla batteria e alla privacy già nel progetto).

## Icone

Libreria **Lucide** (licenza ISC, icone a linee, mai emoji), incorporate come SVG via
`src/lib/icons.js` → `icon('nome-icona', {size, className})`. Lo spessore del tratto è quello
originale di Lucide (2px): non modificarlo icona per icona, per restare coerenti.

- Il colore dell'icona segue sempre il `color` CSS dell'elemento che la contiene
  (`stroke="currentColor"`): non impostare mai un colore fisso sull'SVG.
- Un'icona dentro un `<select><option>` nativo non è possibile (il browser non lo permette):
  lì restano etichette testuali semplici, senza emoji né icona.
- Aggiungere una nuova icona: scegliere il nome esatto in `node_modules/lucide-static/icons/`,
  importarlo in `src/lib/icons.js` con `?raw` e aggiungerlo alla mappa `ICONS`.

## Colore: quando usare cosa

- **`--st-primary`**: header, bottoni primari, testo dei titoli forti, tab attiva.
- **`--st-accent`**: solo per badge "Verificata"/di fiducia e piccoli dettagli — mai per bottoni
  primari (altrimenti competerebbe con il primario e diluirebbe la gerarchia).
- **`--st-rating`**: solo per le stelle di valutazione.
- **`--st-sos`**: solo per il pulsante SOS e gli elementi della sua schermata. Non riusarlo per
  errori generici, badge negativi o altro: deve restare un colore "raro" che l'utente riconosce
  subito come emergenza.
- **`--st-critical` / `--st-warning` / `--st-caution` / `--st-good` / `--st-great`**: solo per il
  Termometro Safe Taxi e la mappa dell'insoddisfazione (stessa scala in entrambi).

## Non fare

- Non aggiungere emoji nell'interfaccia (nemmeno "temporaneamente"): usare sempre `icon(...)`.
- Non introdurre un secondo font o una seconda famiglia di icone in una singola schermata.
- Non creare una nuova variante di bottone senza prima controllare `components.md`.
- Non hardcodare colori in `src/app.js` o `src/styles.css`: aggiungere un token in `tokens.css`
  se manca quello che serve.
