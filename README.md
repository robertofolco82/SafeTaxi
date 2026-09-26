# Safe Taxi

App gratuita per segnalare comportamenti scorretti o positivi dei taxi in Italia: SOS, tracking della corsa, rating dei tassisti, heatmap nazionale e prenotazione.

**Stato:** prototipo collegato al backend Supabase di sviluppo (dati DEMO). Accesso con email, Google o anonimo. Contesto, requisiti e regole del progetto sono in [`CLAUDE.md`](CLAUDE.md).

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
| `npm run test:e2e` | Test end-to-end (Playwright): progetto `demo` (senza backend) e `supabase` (stack locale avviato); richiede Chromium (`npx playwright install chromium`) |
| `npm run test:db` | Test del database (pgTAP); richiede il database locale avviato |
| `npm run db:seed` | Rigenera `supabase/seed.sql` dai dati DEMO dell'app |

## Struttura

```
index.html          markup dell'app
src/main.js         punto di ingresso (CSS di Leaflet, stili, app)
src/styles.css      stili
src/app.js          interfaccia: DOM, mappe, stato
src/backend/        dati e accesso: supabase.js (reale) e local.js (demo nel browser)
src/lib/            regole pure, senza DOM, coperte dai test
  config.js         città, cooperative, tipi, soglie e punti (valori DEMO)
  utils.js          formattazione, targhe, distanze
  indices.js        Termometro, stima costo, RECOMMENDED, livelli
  opendata.js       export anonimizzato
  seed.js           segnalazioni DEMO con seed fisso
tests/unit/         test Vitest
tests/e2e/          test Playwright (OpenStreetMap simulato): demo.spec.js e supabase.spec.js
docs/               guide (configurazione dell'accesso)
```

## App nativa (Capacitor)

I progetti `android/` e `ios/` usano la stessa app web (`dist/`). Differenze gestite in `src/native/`:
- posizione durante la corsa anche a schermo spento (plugin `@capacitor-community/background-geolocation`, servizio in primo piano con notifica "Corsa in corso", senza permesso "posizione sempre");
- login Google e link delle email che tornano all'app con `it.safetaxi.app://auth` (va aggiunto ai Redirect URLs di Supabase);
- link esterni (WhatsApp, store) aperti fuori dall'app; link del tracking live con l'indirizzo pubblico (`VITE_PUBLIC_URL`).

```bash
npm run build && npx cap sync          # copia la build web nei progetti nativi
cd android && ./gradlew assembleDebug  # APK di prova (serve Android SDK e Java 21)
npx cap open ios                       # su Mac con Xcode
```

La CI compila l'APK Android a ogni push: si scarica dalla pagina dell'esecuzione su GitHub (Actions → CI → Artifacts → `safetaxi-android-debug`). Il job `ios` verifica che il progetto iOS compili; per installarlo su un iPhone servono un Mac e un account Apple Developer.

## Database (Supabase)

Lo schema è in `supabase/migrations/`, i dati DEMO per lo sviluppo in `supabase/seed.sql` (generato con `npm run db:seed`, mai da caricare in produzione). L'app legge e scrive sul database tramite `src/backend/supabase.js`.

### Modalità dell'app

| File | Backend | Uso |
|---|---|---|
| `.env` | Supabase di sviluppo (remoto) | `npm run dev`, build di Vercel |
| `.env.test` | demo locale (dati nel browser, accesso simulato) | test end-to-end `demo` |
| `.env.integration` | Supabase locale (`npx supabase start`) | test end-to-end `supabase` |

I file `.env*` contengono solo valori pubblici (URL e chiave *publishable*). Valori personali o segreti vanno in `.env.local`, ignorato da git.

L'accesso (email con conferma, Google, anonimo) richiede alcune impostazioni nei pannelli di Supabase e Google: vedi [`docs/configurazione-accesso.md`](docs/configurazione-accesso.md).

In locale serve Docker:

```bash
npx supabase start -x studio,imgproxy,logflare,vector,supavisor,realtime,postgres-meta
                         # avvia database, autenticazione, API ed email di prova (Mailpit su http://127.0.0.1:54324)
npm run test:db          # test pgTAP su regole di accesso, limiti anti-fake, moderazione e punti
npx supabase db reset    # riparte da zero (riapplica migrazioni e seed)
```

Regole principali:
- I client non scrivono nelle tabelle: inviano solo tramite `submit_report` e `submit_ride_rating`, che validano i dati e applicano i limiti (5 segnalazioni al giorno, una per targa ogni 30 giorni, 10 valutazioni al giorno).
- Nome del segnalatore, targa e licenza stanno nello schema `private`, non esposto dalle API.
- Il pubblico vede solo le segnalazioni pubblicate, con targa mascherata e coordinate approssimate (circa 100 m).
- Rating del tassista (`get_driver_rating`) solo con almeno 5 segnalazioni verificate e pubblicate.
- Verificata = utente non anonimo con email confermata. I punti si assegnano alla pubblicazione, uguali per positive e negative.

### Cancellazione dell'account

Profilo → **Elimina account e dati**, anche per chi ha usato l'app senza registrarsi. Dal sito: https://safetaxi-nu.vercel.app/?account=elimina (link da indicare negli store). La funzione `delete-account` cancella segnalazioni e repliche non pubblicate con i loro file, il nome del segnalatore e i contatti, poi l'utente (a cascata profilo, punti e condivisioni della corsa). Le segnalazioni pubblicate restano anonime.

Bozze delle dichiarazioni per gli store: `docs/store/`.

### Tracking live

Scheda **Corsa → Condividi la corsa in tempo reale** (con la corsa avviata): crea un link `?live=<token>` valido 3 ore e lo inserisce nel messaggio WhatsApp/SMS. Chi apre il link vede posizione, via e percorso, aggiornati ogni 8 secondi, senza account. Alla fine della corsa (o con "Interrompi") le posizioni vengono cancellate e il link mostra solo "Corsa conclusa". Funzioni: `start_ride_share`, `update_ride_share`, `end_ride_share`, `get_ride_share`; nel database il token è salvato solo come impronta SHA-256.

### Corsa verificata e recensioni (Omnibus)

Con un account con email confermata, **Inizia corsa** registra la corsa anche sul server (`start_ride`, `ride_ping`, `end_ride`): il server somma i km e controlla le velocità, ma conserva solo l'ultimo punto (cancellato a fine corsa), mai il percorso. La corsa vale il bollino **corsa verificata** se dura almeno 3 minuti, copre almeno 500 m con almeno 3 posizioni e nessun salto oltre 200 km/h. La segnalazione o valutazione va inviata entro 24 ore dalla fine, una sola per corsa, e se all'inizio era stata indicata la targa deve coincidere (`submit_report` / `submit_ride_rating` con `p_ride_id`). Le corse si cancellano dopo 7 giorni. La corsa simulata non vale mai il bollino.

La pagina **Come verifichiamo le recensioni** (link sotto il feed e nel modulo di segnalazione) spiega verifica, moderazione, limiti anti-abuso, punti e calcolo dei rating, come richiesto dal Codice del consumo (art. 22, modificato dal D.Lgs. 26/2023). Il testo è in `index.html` (`#m-verifica`): se cambiano le regole nel database, va aggiornato anche lì.

### Moderare dall'app

Con un account moderatore: **Profilo → Apri la moderazione**. La pagina mostra:
- le segnalazioni in attesa, con nome del segnalatore, targa, licenza, posizione esatta e allegati (video e audio si riproducono lì);
- per ogni foto: **Sfoca targhe** (trascina sulla foto per coprire le targhe: la versione sfocata sostituisce l'originale, dopo il controllo dei metadati sul server) e **Targhe ok, pubblica**;
- **Pubblica** o **Rifiuta** con motivo (l'autore lo vede tra "Le tue segnalazioni");
- le foto ancora private di segnalazioni già pubblicate;
- le repliche dei tassisti, con il contatto per la verifica e l'indicazione se targa o licenza corrispondono (chi invia non lo scopre mai).

Tutte le azioni passano da funzioni del database che verificano il ruolo (`moderation_queue`, `moderate_report`, `moderate_attachment`, `moderate_reply`).

### Moderare dal pannello Supabase (alternativa)

1. Su supabase.com apri il progetto, poi **Table Editor → reports** e filtra `status = in_moderazione`.
2. Per pubblicare, imposta `status` a `pubblicata`; per rifiutare, `rifiutata` e scrivi il motivo in `rejection_reason`.
3. Nome del segnalatore, targa e licenza sono nella tabella `reports_private` dello schema `private` (selettore dello schema in alto a sinistra).
4. Allegati: **Storage → attachments →** cartella con l'id della segnalazione. Per pubblicare una foto: controlla che non ci siano targhe leggibili (lo strumento per sfocarle arriverà con la pagina di moderazione), poi in **Table Editor → attachments** imposta `plates_blurred = true` e `is_public = true`.

### Allegati

- Le foto sono elaborate sul telefono prima dell'invio (`src/media/photo.js`): riesportate in JPEG senza metadati (EXIF, GPS, XMP) e con i volti pixelati da MediaPipe (modello in `public/models/`, motore WebAssembly copiato in `public/mediapipe/` dalla build e scaricato solo alla prima foto).
- I file vanno nel bucket privato `attachments` (`<id segnalazione>/<nome casuale>`). La funzione `supabase/functions/register-attachment` li verifica (autore, formato, dimensione, assenza di metadati nelle foto) e li registra; una foto con metadati viene cancellata.
- Video e audio restano visibili solo ai moderatori. Una foto diventa pubblica solo quando il moderatore imposta `plates_blurred = true` e `is_public = true` su `attachments` (il database rifiuta le altre combinazioni).
- Il riconoscimento dei volti è pensato per volti vicini e di medie dimensioni: il moderatore controlla sempre la foto prima di pubblicarla.

Per aggiornare la funzione sul progetto remoto: `npx supabase functions deploy register-attachment --project-ref emgookqbvrehcroxpypx` (richiede `npx supabase login`).

Per rendere moderatore un utente: **SQL Editor** → `update public.profiles set role = 'moderatore' where id = '<id utente>';`

### Segnalazione di contenuti (Digital Services Act)

Sotto ogni segnalazione e replica pubblicata c'è **Segnala contenuto** (art. 16 DSA): motivo, spiegazione, nome, email e dichiarazione di buona fede; va bene anche l'accesso anonimo. Il moderatore trova i contenuti segnalati nella pagina Moderazione, con i dati del segnalante, e decide sempre con una motivazione: **Rimuovi il contenuto** (la segnalazione passa a "rifiutata", l'autore vede il motivo e perde i punti ricevuti) o **Mantieni**. Il segnalante vede l'esito e la motivazione nel profilo. Funzioni: `submit_content_notice`, `resolve_content_notice`, `my_content_notices`; nome ed email in `private.content_notice_contacts`, cancellati con l'account.

Bozze dei testi legali (non ancora nell'app, da validare): `docs/legal/` — informativa privacy, termini d'uso, DPIA, cookie e pubblicità, obblighi DSA.

### News dal settore

La funzione `refresh-news` legge i feed RSS di Google News (ricerca "taxi, tassisti, NCC, radiotaxi" sulle testate italiane) e di Consumerismo No Profit, tiene solo le notizie pertinenti (esclusi taxi acquei, film, videogiochi e omonimi) degli ultimi 30 giorni e le salva con `save_news`: solo titolo, testata, data e link all'articolo originale, niente testo né immagini. Fonti e filtro in `supabase/functions/_shared/news.js` (testati con feed reali in `tests/fixtures/`).

La funzione non richiede chiavi (`verify_jwt = false`): il database accetta al massimo un aggiornamento ogni 15 minuti (`news_refresh_due`). Sul progetto remoto la chiama ogni ora un job pianificato, da creare una volta sola nell'editor SQL (non è in una migrazione perché contiene l'indirizzo del progetto):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('refresh-news', '7 * * * *', $$
  select net.http_post(url := 'https://emgookqbvrehcroxpypx.supabase.co/functions/v1/refresh-news',
    headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb)
$$);
```

In locale la funzione non raggiunge i feed se la rete passa da un proxy con certificato proprio: la lettura dei feed si verifica con i test unitari e sul progetto remoto.

## Servizi esterni

- Mappe: tile di OpenStreetMap. Per la produzione serve un fornitore commerciale, le tile pubbliche non sono pensate per uso intensivo.
- Ricerca indirizzi: Nominatim, da usare nel rispetto dei suoi limiti (massimo una richiesta al secondo).
- News: feed RSS di Google News e di Consumerismo No Profit (solo titoli con link alla fonte). Da verificare prima del lancio: i termini di Google sull'uso dei feed di Google News in un'app con pubblicità.
