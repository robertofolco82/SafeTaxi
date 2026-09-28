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
  - Dati e accesso tramite `src/backend/`: `supabase.js` (predefinito, configurato in `.env`) o `local.js` (demo nel browser, `VITE_BACKEND=locale`). Nel browser restano solo le preferenze; preferiti, recenti e contatti di emergenza restano solo sul dispositivo (`src/native/storage.js`: archivio nativo nell'app, browser sul web), mai sul server.
  - Accesso: email/password con conferma, Google, anonimo (creato solo al primo invio o alla prima ricerca per targa). Impostazioni dei pannelli in `docs/configurazione-accesso.md`.
- Backend Supabase, progetto di sviluppo `SafeTaxi` (ref `emgookqbvrehcroxpypx`, Francoforte, piano Free) con schema e dati DEMO.
  - Schema in `supabase/migrations/`, seed DEMO in `supabase/seed.sql` (generato da `scripts/generate-seed.mjs`), test pgTAP in `supabase/tests/`.
  - Ogni modifica allo schema: nuova migrazione nel repo, test `npm run test:db` in locale, poi applicazione al progetto remoto.
  - Dati personali (nome segnalatore, targa, licenza) solo in `private.reports_private`. Scritture dei client solo tramite funzioni (`submit_report`, `submit_ride_rating`).
- Test: `npm test` (Vitest, regole in `src/lib`), `npm run test:e2e` (Playwright: progetto `demo` senza backend e `supabase` contro lo stack locale, con registrazione ed email via Mailpit) e `npm run test:db` (pgTAP). La CI su GitHub Actions li esegue a ogni push e pull request.
- Prima di consegnare una modifica: `npm test`, `npm run build`, `npm run test:e2e` e, se tocchi il database, `npm run test:db` devono passare.
- Tutti i dati sono DEMO: segnalazioni generate con seed fisso, licenze/domanda/tariffe per città, rating delle cooperative. Le news sono reali (feed RSS, solo titoli con link alla fonte); in modalità demo locale restano segnaposto.

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
   - Statistiche nazionali e per città: licenze attive vs fabbisogno calcolato con la metodologia ART (delibera 46/2022), costo medio al minuto.
   - "Corse al giorno equivalenti ai ricavi dichiarati" (ricavi medi MEF ÷ giorni di servizio ÷ prezzo della corsa tipo da delibera tariffaria) e, a parte, reddito medio dichiarato MEF: solo a livello aggregato, formula e fonti in pagina. Niente ricavo orario stimato (deciso da Roberto).
   - Fonti ufficiali: sempre l'ultima pubblicazione, uscita da non più di 12 mesi, con fonte, anno di riferimento e data di pubblicazione in pagina; se scaduta, il dato non si mostra. Dettagli in `docs/improvements-app.md`.
10. Prenota
    - Uber in cima, con link allo store del dispositivo.
    - Poi le cooperative della città, ordinate per rating Safe Taxi. Chiamata con conferma.
    - Bollo RECOMMENDED: rating ≥ 4,0 e almeno 20 recensioni verificate in 12 mesi, con nota esplicativa in pagina.
    - Filtri: Recommended, 24/7, aeroporti, app.
    - Rating esterni (TrustPilot/Google) solo se disponibili tramite API ufficiali.
11. News sul settore taxi: aggregatore RSS, sempre con link alla fonte. Fonti: Google News (ricerca taxi/tassisti/NCC) e Consumerismo No Profit; solo fonti gratuite dove basta citare la fonte: si mostrano titolo, testata, data e link, mai testo o immagini.
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
- Dati verificati il 27/09/2026 (fonti in `docs/fonti-dati.md`): numeri delle cooperative di 11 città, link agli store, licenze (ART 2024), tariffe di Roma, Milano, Napoli, Torino, Firenze e Bologna.
- Ancora da verificare: tariffe di Venezia, Genova, Palermo, Bari e Catania (tariffari da leggere a mano); numeri di La Capitale (Roma) e Nuova Co.Ta.Ba. (Bari); domanda giornaliera stimata (nessuna fonte ufficiale).
- Redditi medi dichiarati: il MEF non li pubblica per città (open data per codice attività solo sopra 100.000 euro; ISA DG72U mescola taxi e NCC ed esclude i forfettari). Il confronto resta nascosto finché non c'è una fonte ufficiale aggregata.
- Termini di Google sull'uso dei feed RSS di Google News in un'app con pubblicità (se non compatibili: passare ai feed diretti delle testate).
- Fornitore delle mappe per la produzione: le tile pubbliche di OSM non sono pensate per uso intensivo. Rispettare i limiti d'uso di Nominatim.

## Roadmap
1. ✅ Struttura del repository: git, build con Vite, test minimi, CI.
2. Backend Supabase (a blocchi, una pull request per blocco)
   - ✅ 2a. Schema (profiles, reports + private.reports_private, attachments, driver_stats, cities, coops, points_ledger, news), regole di accesso RLS, limiti anti-fake, moderazione e punti lato database.
   - ✅ 2c. Allegati: foto ripulite dai metadati e con volti pixelati sul dispositivo (MediaPipe), bucket privato, verifica lato server (funzione `register-attachment`), video e audio solo ai moderatori, foto pubbliche solo dopo revisione. Targhe sfocate a mano dal moderatore (blocco 2d).
   - ✅ 2b. Autenticazione email/password con conferma, Google e anonima (Apple e Facebook rinviati); app collegata al database.
   - ✅ 2d. Pagina "Moderazione" nell'app (solo moderatori): coda con dati riservati, pubblica/rifiuta con motivo, sfocatura manuale delle targhe, approvazione delle foto, repliche dei tassisti (diritto di replica) verificate dal moderatore.
   - ✅ 2e. Misure contro le recensioni fake: email confermata, limiti di frequenza, bollino "corsa verificata" (corsa registrata sul server: almeno 3 minuti e 500 m, velocità plausibili, entro 24 ore, una segnalazione per corsa, targa coincidente; il server tiene solo durata e km), pagina "Come verifichiamo le recensioni" (Omnibus, `#m-verifica`).
   - API ed export SFTP: rinviati.
3. ✅ Tracking live: link temporaneo (`?live=<token>`, 3 ore, una condivisione attiva per utente); token salvato solo come impronta SHA-256; posizioni cancellate a fine corsa; pagina per chi riceve il link con aggiornamento ogni 8 secondi. Nel browser il GPS si ferma in background: serve l'app nativa (punto 4).
4. Packaging con Capacitor per iOS e Android (appId `it.safetaxi.app`, da confermare prima della pubblicazione: non si può cambiare dopo)
   - ✅ 4a. Progetti `android/` e `ios/`, GPS durante la corsa anche a schermo spento (servizio in primo piano, senza "posizione sempre"), login e link email che tornano all'app (`it.safetaxi.app://auth`), link esterni fuori dalla WebView, invio posizioni del tracking live con HTTP nativo, APK Android e build iOS in CI.
   - ✅ 4b. Cancellazione dell'account dall'app e dal sito (`?account=elimina`, funzione `delete-account`); bozze di "Sicurezza dei dati" (Google Play) ed etichette privacy (Apple) in `docs/store/`, da validare.
   - GPS in background, fotocamera, notifiche push.
   - Requisiti store: cancellazione dell'account, dichiarazione sull'uso della posizione in background, sezione "sicurezza dei dati" di Google Play.
5. Compliance: valutazione d'impatto privacy (DPIA), informativa, termini d'uso, procedura di segnalazione e rimozione prevista dal Digital Services Act, consenso per cookie e pubblicità.
   - ✅ 5a. Segnalazione di contenuti (DSA artt. 16–17): "Segnala contenuto" su segnalazioni e repliche, decisione motivata del moderatore, esito nel profilo, punti tolti ai contenuti rimossi.
   - 5b. Bozze in `docs/legal/` (informativa, termini, DPIA, cookie e pubblicità, DSA): da validare con un legale e completare (titolare, email di contatto) prima di pubblicarle nell'app.
   - Da fare dopo la validazione: testi nell'app, sospensione degli account che abusano (art. 23 DSA). Conservazione: vedi "Decisioni prese".

## Backlog miglioramenti app
Richieste di Roberto sull'app, con priorità e dipendenze dal backend: `docs/improvements-app.md`. Consultarlo prima di pianificare un nuovo blocco. Lo sviluppo dei punti del backlog lo fa la chat master, non la chat che raccoglie le richieste (deciso da Roberto il 27/09/2026). I P1 (IMP-01, IMP-02, IMP-05a) sono pronti per partire.

## Decisioni prese
- Titolare: iniziativa personale di Roberto Folco (nessun legame con Telepass).
- Backend: Supabase, piano Free per sviluppo e test. Per la produzione valutare il piano Pro (backup, niente pausa per inattività).
- Moderazione (dal 27/09/2026, sostituisce la moderazione preventiva): come le grandi piattaforme di recensioni. Le segnalazioni di account verificati che superano i controlli automatici (dati personali, insulti, etichette di reato) si pubblicano subito; ospiti e testi segnalati dai controlli vanno prima a un moderatore; foto pubbliche solo dopo revisione; dopo la pubblicazione controllo a campione e su segnalazione (DSA). Criterio: si rimuove solo ciò che è manifestamente illecito o contrario alle regole, mai un fatto perché negativo. Regola per chi scrive: fatti sì, etichette e insulti no. Analisi in `docs/legal/assessment-recensioni-e-reati.md`.
- Conservazione: segnalazioni, targhe, licenze e account non si cancellano (sono il patrimonio del servizio); si cancellano solo i dati tecnici che non servono più al servizio e ciò che l'utente cancella con il proprio account.
- Accesso, prima fase: email/password, Google e accesso anonimo. Apple e Facebook rinviati.
- Allegati: volti sfocati in automatico sul dispositivo, targhe sfocate a mano in moderazione, video e audio mai pubblici (solo moderatori).
- Canali: app iOS e Android sugli store più versione web (mobile e desktop).
- Build: Vite.
- Condivisione con terzi via API REST e SFTP (requisito 2): rinviata finché non c'è un destinatario concreto. Resta l'export CSV/JSON anonimizzato.
- Flusso di lavoro: sviluppo su branch separato, una pull request per blocco; Claude fa il merge su `main` quando tutti i controlli della CI sono verdi (autorizzato da Roberto).
- Hosting della versione web: Vercel (produzione `https://safetaxi-nu.vercel.app`), collegato al repository (deploy automatico da `main` e anteprima per ogni pull request). Il piano gratuito Hobby è solo per uso non commerciale: con la pubblicità serve il piano Pro.
- Punti: assegnati alla pubblicazione della segnalazione (anche automatica), tolti se il contenuto viene rimosso.
- Coordinate pubbliche delle segnalazioni arrotondate a 3 decimali (circa 100 m); quelle esatte solo ai moderatori.
- Descrizione della segnalazione (IMP-01, 28/09/2026): con 4–5 stelle basta anche "OK"; con 1–3 stelle almeno 20 caratteri con la descrizione dell'accaduto. Replica del tassista e segnalazione DSA restano a 20 caratteri.
- Età minima: 18 anni (dichiarazione nel modulo di segnalazione, nota nell'accesso, termini d'uso).
- Possibili reati nelle segnalazioni: si pubblicano se raccontati come fatti (diritto di critica: verità, pertinenza, continenza); non si pubblicano etichette ("truffatore", "ladro") e insulti. Safe Taxi non accerta fatti né reati e non è un canale di denuncia: l'avviso nel modulo rimanda a forze dell'ordine e 112.
- Ricerca per targa, licenza o entrambe (27/09/2026; due campi dal 28/09, IMP-02: con entrambi devono corrispondere tutti e due): mostra rating, criticità e, con almeno 5 segnalazioni verificate, le segnalazioni pubblicate di quel taxi con le repliche; targa sempre mascherata nel feed. Limite: 5 ricerche all'ora per utente (accesso anche anonimo) e 30 all'ora per indirizzo di rete (salvato solo come impronta, cancellata dopo 2 ore).
- News: funzione `refresh-news` chiamata ogni ora da pg_cron sul progetto remoto (job `refresh-news`, SQL nel README).

## Decisioni aperte (chiedere prima di procedere)
- Segnalazioni che attribuiscono reati al conducente (art. 10 GDPR, art. 2-octies Codice privacy): serve un parere legale sul perimetro ammesso (vedi `docs/legal/dpia.md`, rischio R1).
- Titolare, email di contatto privacy e punto di contatto DSA da indicare nei testi legali.
- Notifiche push: servono un progetto Firebase (Android) e una chiave APNs con account Apple Developer (iOS).
- Account sviluppatore per gli store: Apple Developer 99 $/anno, Google Play 25 $ una tantum.
- CAPTCHA (Cloudflare Turnstile) per accessi anonimi e registrazioni: da aggiungere prima dell'apertura al pubblico.
- SMTP per le email di Supabase (senza, arrivano solo agli indirizzi del team).
- Protezione password compromesse (HaveIBeenPwned): richiede il piano Pro di Supabase.

## Modo di lavorare
- Autonomia: si procede da un blocco al successivo della roadmap senza chiedere conferma. Le scelte tecniche con una soluzione ragionevole si prendono e si dichiarano nel riepilogo e nella pull request.
- Si chiede prima di procedere solo per: costi (piani a pagamento, servizi nuovi), azioni irreversibili o su dati reali/produzione, credenziali e segreti, testi legali, pubblicazione sugli store, e le voci in "Decisioni aperte".
- Supabase: migrazioni, funzioni, SQL, estensioni, job pianificati e impostazioni del progetto si eseguono senza chiedere autorizzazione (deciso da Roberto). Resta da chiedere solo il passaggio a piani a pagamento.
- Temi legali (Roberto chiede a Claude di agire come il suo legale più esperto): MAI indicazioni legali non verificate. Ogni affermazione legale va verificata su fonti primarie o autorevoli (norme, sentenze, provvedimenti del Garante, linee guida ufficiali, regole pubblicate dalle piattaforme), citata con il link, e sottoposta a un assessment dei rischi e delle alternative; ciò che non si è potuto verificare va dichiarato come tale.
- Prima di scrivere codice, raccogliere i dettagli; fare domande mirate solo quando la risposta cambia davvero il lavoro.
- Comunicazione diretta e critica; dire chiaramente cosa non è possibile.
- Modifiche incrementali verificate eseguendo il codice. Niente riscritture totali non richieste.