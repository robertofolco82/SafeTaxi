# Safe Taxi

App gratuita per segnalare comportamenti scorretti o positivi dei taxi in Italia: SOS, tracking della corsa, rating dei tassisti, heatmap nazionale e prenotazione.

**Stato:** prototipo. Tutti i dati sono DEMO e non c'è ancora un backend (i dati restano nel browser). Contesto, requisiti e regole del progetto sono in [`CLAUDE.md`](CLAUDE.md).

## Avvio in locale

Serve Node.js 22.12 o successivo.

```bash
npm install
npm run dev        # server di sviluppo su http://localhost:5173
```

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Avvia l'app in sviluppo, con ricarica automatica |
| `npm run build` | Crea la versione di produzione in `dist/` |
| `npm run preview` | Serve localmente la versione di produzione |
| `npm test` | Test unitari (Vitest) sulle regole di calcolo e privacy |
| `npm run test:e2e` | Test end-to-end (Playwright) sui flussi principali; richiede Chromium (`npx playwright install chromium`) |

## Struttura

```
index.html          markup dell'app
src/main.js         punto di ingresso (CSS di Leaflet, stili, app)
src/styles.css      stili
src/app.js          interfaccia: DOM, mappe, stato locale
src/lib/            regole pure, senza DOM, coperte dai test
  config.js         città, cooperative, tipi, soglie e punti (valori DEMO)
  utils.js          formattazione, targhe, distanze
  indices.js        Termometro, stima costo, RECOMMENDED, livelli
  opendata.js       export anonimizzato
  seed.js           segnalazioni DEMO con seed fisso
tests/unit/         test Vitest
tests/e2e/          test Playwright (le chiamate a OpenStreetMap sono simulate)
```

## Servizi esterni

- Mappe: tile di OpenStreetMap. Per la produzione serve un fornitore commerciale, le tile pubbliche non sono pensate per uso intensivo.
- Ricerca indirizzi: Nominatim, da usare nel rispetto dei suoi limiti (massimo una richiesta al secondo).
