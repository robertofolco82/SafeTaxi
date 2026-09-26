# Safe Taxi — contesto progetto

## Cos'è
App gratuita per iOS e Android per segnalare comportamenti scorretti o positivi dei taxi in Italia.
Include SOS, tracking della corsa, rating dei tassisti, heatmap nazionale e prenotazione.
Si sostiene con pubblicità non invasiva.

## Stato attuale
- Prototipo funzionante, HTML/CSS/JS senza framework, con build Vite (struttura e comandi nel `README.md`).
  - `index.html`: markup. `src/app.js`: interfaccia (DOM, mappe, stato). `src/lib/`: regole pure, senza DOM.
  - Le funzioni richiamate da `onclick`/`onchange`/`onsubmit` sono esposte su `window` in fondo a `src/app.js`: se ne aggiungi una, registrala lì.
  - Mappe con Leaflet (dipendenza npm) + tile OpenStreetMap, ricerca indirizzi con Nominatim.
  - Design system in `design-system/` (direzione "C — Blu notte + ciano tecnico"): token in `tokens.css`, regole in `README.md` e `components.md`. Font Plus Jakarta Sans + Inter self-hosted, icone Lucide via `src/lib/icons.js` (`icon()` o `data-icon` nell'HTML), mai emoji nell'interfaccia.
  - Dati e accesso tramite `src/backend/`: `supabase.js` (predefinito, configurato in `.env`) o `local.js` (demo nel browser, `VITE_BACKEND=locale`). Nel browser restano solo le preferenze.
  - Accesso: email/password con conferma, Google, anonimo (creato solo al primo invio). Impostazioni dei pannelli in `docs/configurazione-accesso.md`.
- Backend Supabase, progetto di sviluppo `SafeTaxi` (ref `emgookqbvrehcroxpypx`, Francoforte, piano Free) con schema e dati DEMO.
  - Schema in `supabase/migrations/`, seed DEMO in `supabase/seed.sql` (generato da `scripts/generate-seed.mjs`), test pgTAP in `supabase/tests/`.
  - Ogni modifica allo schema: nuova migrazione nel repo, test `npm run test:db` in locale, poi applicazione al progetto remoto.
  - Dati personali (nome segnalatore, targa, licenza) solo in `private.reports_private`. Scritture dei client solo tramite funzioni (`submit_report`, `submit_ride_rating`).
- Test: `npm test` (Vitest, regole in `src/lib`), `npm run test:e2e` (Playwright: progetto `demo` senza backend e `supabase` contro lo stack locale, con registrazione ed email via Mailpit) e `npm run test:db` (pgTAP). La CI su GitHub Actions li esegue a ogni push e pull request.
- Prima di consegnare una modifica: `npm test`, `npm run build`, `npm run test:e2e` e, se tocchi il database, `npm run test:db` devono passare.
- Tutti i dati sono DEMO: segnalazioni generate con seed fisso, licenze/domanda/tariffe per città, rating delle cooperative. Le news sono segnaposto.

## Requisiti funzionali
1. Segnalazione
   - Obbligatori: nome e cognome del segnalatore, licenza, targa, città, descrizione.
   - Facoltativi: tratta, importo, durata, posizione GPS.
   - Allegati foto, video e audio, da fotocamera o galleria.
2. Segnalazioni salvate nel database e condivisibili con terzi via API REST e SFTP, solo come dati anonimizzati o aggregati.
3. Home
   - Feed delle segnalazioni.
   - Indice nazionale "Termometro Safe Taxi" 0–100: conta solo gli utenti verificati, il peso di ogni segnalazione si dimezza ogni 90 giorni.
   - Mappa con ricerca della destinazione e stima del costo basata sullo storico.
4. SOS, sempre visibile e anche in un'area dedicata durante la corsa
   - Chiamata al 112 solo dopo popup di conferma, mai automatica.
   - Aiuto senza voce tramite l'app ufficiale 112 Where ARE U.
   - Messaggio WhatsApp/SMS precompilato e modificabile, con la posizione.
5. Tracking della corsa in tempo reale con il nome della via attraversata. Il link di condivisione "live" richiede il backend.
6. Rating del tassista consultabile prima della corsa (per targa o licenza) e valutazione a fine corsa (tassista e corsa separati).
7. Premi con gli stessi punti per segnalazioni positive e negative.
8. Accesso
   - Email/password e SSO Google, Apple, Facebook.
   - Uso anonimo consentito almeno per valutazioni e SOS.
   - Le segnalazioni anonime non contano nei rating.
9. Mappa Italia
   - Heatmap dell'insoddisfazione, zoom fino al livello città, ricerca città.
   - Statistiche nazionali e per città: licenze vs domanda stimata, costo medio al minuto.
   - Ricavo orario stimato vs reddito medio dichiarato: solo a livello aggregato.
10. Prenota
    - Uber in cima, con link allo store del dispositivo.
    - Poi le cooperative della città, ordinate per rating Safe Taxi. Chiamata con conferma.
    - Bollo RECOMMENDED: rating ≥ 4,0 e almeno 20 recensioni verificate in 12 mesi, con nota esplicativa in pagina.
    - Filtri: Recommended, 24/7, aeroporti, app.
    - Rating esterni (TrustPilot/Google) solo se disponibili tramite API ufficiali.
11. News sul settore taxi: aggregatore RSS, sempre con link alla fonte.
12. Batteria: GPS solo quando serve, risparmio energetico manuale e automatico sotto il 20%.

## Regole non negoziabili
- Mai presentare come reali dati inventati. Ogni valore non verificato va marcato DEMO o DA VERIFICARE, nel codice e nell'interfaccia.
- Privacy del tassista
  - Targa sempre mascherata nel feed pubblico.
  - Rating individuale visibile solo con almeno 5 segnalazioni verificate.
  - Confronto con i redditi solo aggregato.
  - Moderazione delle segnalazioni e diritto di replica.
- Privacy dell'utente
  - Nome del segnalatore mai pubblico.
  - Posizione rilevata solo su azione dell'utente.
  - Export a terzi anonimizzato: niente nomi, targhe o licenze, coordinate arrotondate a 2 decimali.
- Il 112 non si chiama mai in automatico.
- Stessi punti per recensioni positive e negative (disciplina Omnibus, D.Lgs. 26/2023).
- Interfaccia e testi in italiano.

## Da verificare prima del rilascio
- Numeri di telefono delle cooperative (Roma, Milano, Torino, Bologna, Firenze) e censimento delle altre città.
- Licenze per città (Comuni), tariffe (delibere comunali), redditi medi dichiarati (MEF).
- Fornitore delle mappe per la produzione: le tile pubbliche di OSM non sono pensate per uso intensivo. Rispettare i limiti d'uso di Nominatim.

## Roadmap
1. ✅ Struttura del repository: git, build con Vite, test minimi, CI.
2. Backend Supabase (a blocchi, una pull request per blocco)
   - ✅ 2a. Schema (profiles, reports + private.reports_private, attachments, driver_stats, cities, coops, points_ledger, news), regole di accesso RLS, limiti anti-fake, moderazione e punti lato database.
   - ✅ 2c. Allegati: foto ripulite dai metadati e con volti pixelati sul dispositivo (MediaPipe), bucket privato, verifica lato server (funzione `register-attachment`), video e audio solo ai moderatori, foto pubbliche solo dopo revisione. Targhe sfocate a mano dal moderatore (blocco 2d).
   - ✅ 2b. Autenticazione email/password con conferma, Google e anonima (Apple e Facebook rinviati); app collegata al database.
   - ✅ 2d. Pagina "Moderazione" nell'app (solo moderatori): coda con dati riservati, pubblica/rifiuta con motivo, sfocatura manuale delle targhe, approvazione delle foto, repliche dei tassisti (diritto di replica) verificate dal moderatore.
   - Misure contro le recensioni fake: email confermata, limiti di frequenza, bollino "corsa verificata", pagina che spiega come verifichiamo le recensioni (Omnibus).
   - API ed export SFTP: rinviati.
3. ✅ Tracking live: link temporaneo (`?live=<token>`, 3 ore, una condivisione attiva per utente); token salvato solo come impronta SHA-256; posizioni cancellate a fine corsa; pagina per chi riceve il link con aggiornamento ogni 8 secondi. Nel browser il GPS si ferma in background: serve l'app nativa (punto 4).
4. Packaging con Capacitor per iOS e Android (appId `it.safetaxi.app`, da confermare prima della pubblicazione: non si può cambiare dopo)
   - ✅ 4a. Progetti `android/` e `ios/`, GPS durante la corsa anche a schermo spento (servizio in primo piano, senza "posizione sempre"), login e link email che tornano all'app (`it.safetaxi.app://auth`), link esterni fuori dalla WebView, invio posizioni del tracking live con HTTP nativo, APK Android e build iOS in CI.
   - ✅ 4b. Cancellazione dell'account dall'app e dal sito (`?account=elimina`, funzione `delete-account`); bozze di "Sicurezza dei dati" (Google Play) ed etichette privacy (Apple) in `docs/store/`, da validare.
   - GPS in background, fotocamera, notifiche push.
   - Requisiti store: cancellazione dell'account, dichiarazione sull'uso della posizione in background, sezione "sicurezza dei dati" di Google Play.
5. Compliance: valutazione d'impatto privacy (DPIA), informativa, termini d'uso, procedura di segnalazione e rimozione prevista dal Digital Services Act, consenso per cookie e pubblicità.

## Decisioni prese
- Titolare: iniziativa personale di Roberto Folco (nessun legame con Telepass).
- Backend: Supabase, piano Free per sviluppo e test. Per la produzione valutare il piano Pro (backup, niente pausa per inattività).
- Moderazione: tutte le segnalazioni si pubblicano solo dopo la revisione di un moderatore.
- Accesso, prima fase: email/password, Google e accesso anonimo. Apple e Facebook rinviati.
- Allegati: volti sfocati in automatico sul dispositivo, targhe sfocate a mano in moderazione, video e audio mai pubblici (solo moderatori).
- Canali: app iOS e Android sugli store più versione web (mobile e desktop).
- Build: Vite.
- Condivisione con terzi via API REST e SFTP (requisito 2): rinviata finché non c'è un destinatario concreto. Resta l'export CSV/JSON anonimizzato.
- Flusso di lavoro: sviluppo su branch separato, una pull request per blocco; Claude fa il merge su `main` quando tutti i controlli della CI sono verdi (autorizzato da Roberto).
- Hosting della versione web: Vercel (produzione `https://safetaxi-nu.vercel.app`), collegato al repository (deploy automatico da `main` e anteprima per ogni pull request). Il piano gratuito Hobby è solo per uso non commerciale: con la pubblicità serve il piano Pro.
- Punti: assegnati alla pubblicazione della segnalazione (dopo la moderazione), non all'invio.
- Coordinate pubbliche delle segnalazioni arrotondate a 3 decimali (circa 100 m); quelle esatte solo ai moderatori.

## Decisioni aperte (chiedere prima di procedere)
- Limite di consultazione del rating per targa (`get_driver_rating` è pubblica): da valutare contro la raccolta massiva di targhe.
- Notifiche push: servono un progetto Firebase (Android) e una chiave APNs con account Apple Developer (iOS).
- Account sviluppatore per gli store: Apple Developer 99 $/anno, Google Play 25 $ una tantum.
- CAPTCHA (Cloudflare Turnstile) per accessi anonimi e registrazioni: da aggiungere prima dell'apertura al pubblico.
- SMTP per le email di Supabase (senza, arrivano solo agli indirizzi del team).
- Protezione password compromesse (HaveIBeenPwned): richiede il piano Pro di Supabase.

## Modo di lavorare
- Autonomia: si procede da un blocco al successivo della roadmap senza chiedere conferma. Le scelte tecniche con una soluzione ragionevole si prendono e si dichiarano nel riepilogo e nella pull request.
- Si chiede prima di procedere solo per: costi (piani a pagamento, servizi nuovi), azioni irreversibili o su dati reali/produzione, credenziali e segreti, testi legali, pubblicazione sugli store, e le voci in "Decisioni aperte".
- Prima di scrivere codice, raccogliere i dettagli; fare domande mirate solo quando la risposta cambia davvero il lavoro.
- Comunicazione diretta e critica; dire chiaramente cosa non è possibile.
- Modifiche incrementali verificate eseguendo il codice. Niente riscritture totali non richieste.