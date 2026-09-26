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
| `npm run test:db` | Test del database (pgTAP); richiede il database locale avviato |
| `npm run db:seed` | Rigenera `supabase/seed.sql` dai dati DEMO dell'app |

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

## Database (Supabase)

Lo schema è in `supabase/migrations/`, i dati DEMO per lo sviluppo in `supabase/seed.sql` (generato con `npm run db:seed`, mai da caricare in produzione). L'app non usa ancora il database: il collegamento arriva con l'autenticazione (blocco 2b).

In locale serve Docker:

```bash
npx supabase db start    # avvia Postgres locale con migrazioni e dati DEMO
npm run test:db          # test pgTAP su regole di accesso, limiti anti-fake, moderazione e punti
npx supabase db reset    # riparte da zero (riapplica migrazioni e seed)
```

Regole principali:
- I client non scrivono nelle tabelle: inviano solo tramite `submit_report` e `submit_ride_rating`, che validano i dati e applicano i limiti (5 segnalazioni al giorno, una per targa ogni 30 giorni, 10 valutazioni al giorno).
- Nome del segnalatore, targa e licenza stanno nello schema `private`, non esposto dalle API.
- Il pubblico vede solo le segnalazioni pubblicate, con targa mascherata e coordinate approssimate (circa 100 m).
- Rating del tassista (`get_driver_rating`) solo con almeno 5 segnalazioni verificate e pubblicate.
- Verificata = utente non anonimo con email confermata. I punti si assegnano alla pubblicazione, uguali per positive e negative.

### Moderare dal pannello Supabase

Finché non c'è la pagina di moderazione nell'app:
1. Su supabase.com apri il progetto, poi **Table Editor → reports** e filtra `status = in_moderazione`.
2. Per pubblicare, imposta `status` a `pubblicata`; per rifiutare, `rifiutata` e scrivi il motivo in `rejection_reason`.
3. Nome del segnalatore, targa e licenza sono nella tabella `reports_private` dello schema `private` (selettore dello schema in alto a sinistra).

Per rendere moderatore un utente: **SQL Editor** → `update public.profiles set role = 'moderatore' where id = '<id utente>';`

## Servizi esterni

- Mappe: tile di OpenStreetMap. Per la produzione serve un fornitore commerciale, le tile pubbliche non sono pensate per uso intensivo.
- Ricerca indirizzi: Nominatim, da usare nel rispetto dei suoi limiti (massimo una richiesta al secondo).
