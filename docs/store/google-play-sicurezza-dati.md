# Google Play · Sicurezza dei dati — BOZZA

> **BOZZA da validare** con chi redigerà informativa privacy e DPIA (punto 5 della roadmap). Va aggiornata a ogni nuova funzione (in particolare quando si aggiungerà la pubblicità, oggi assente).
> Stato del codice a cui si riferisce: blocchi fino al 4b.

## Riepilogo per il modulo di Play Console

| Domanda | Risposta | Note |
|---|---|---|
| L'app raccoglie o condivide dati utente? | Sì, raccoglie | |
| I dati sono criptati in transito? | Sì | Solo HTTPS (Supabase, Vercel) |
| Gli utenti possono chiedere la cancellazione? | Sì | Dall'app (Profilo → Elimina account e dati) e dal sito: https://safetaxi-nu.vercel.app/?account=elimina |
| Condivisione con terze parti | No per i dati personali | L'export "dati aperti" contiene solo dati anonimi. Vedi "Da verificare" per il geocoding |

## Tipi di dati raccolti

| Categoria Play | Dato | Obbligatorio? | Finalità | Dove/quanto |
|---|---|---|---|---|
| Posizione → Posizione precisa | Posizione della segnalazione | Facoltativo | Funzionalità dell'app | Esatta solo per i moderatori; pubblica approssimata a ~100 m |
| Posizione → Posizione precisa | Posizione durante la condivisione live | Facoltativo | Funzionalità dell'app | Cancellata a fine corsa (al massimo 3 ore) |
| Posizione → Posizione precisa | Verifica della corsa (bollino "corsa verificata", solo account con email confermata) | Automatico durante una corsa avviata dall'utente | Prevenzione delle frodi, sicurezza e conformità | Solo l'ultimo punto, cancellato a fine corsa; restano durata e km, cancellati dopo 7 giorni |
| Informazioni personali → Nome | Nome e cognome del segnalatore | Obbligatorio per inviare una segnalazione | Funzionalità, prevenzione frodi | Mai pubblico; cancellato con l'account |
| Informazioni personali → Indirizzo email | Email dell'account | Facoltativo (si può usare l'app senza account) | Gestione dell'account | |
| Informazioni personali → ID utente | ID dell'account (anche anonimo) | Obbligatorio per inviare | Gestione dell'account, prevenzione frodi (limiti anti-fake) | |
| Informazioni personali → Numero di telefono / email | Contatto del tassista che replica | Facoltativo | Verifica dell'identità da parte del moderatore | Mai pubblico; cancellato con l'account |
| Foto e video | Foto e video allegati | Facoltativo | Funzionalità dell'app | Foto: senza metadati e con volti sfocati sul telefono; video solo ai moderatori |
| File audio | Registrazioni allegate | Facoltativo | Funzionalità dell'app | Solo ai moderatori |
| Attività nelle app → Contenuti generati dagli utenti | Testo delle segnalazioni e delle repliche, valutazioni | Facoltativo | Funzionalità dell'app | Pubblici dopo la moderazione, senza nome |

**Non raccolti:** contatti della rubrica (i contatti di emergenza restano solo sul telefono), dati finanziari, dati sanitari, cronologia web, identificativi pubblicitari, analisi d'uso (nessun sistema di statistiche installato).

## Permessi Android e dichiarazioni

- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`: posizione mentre l'app è in uso (SOS, stima costo, segnalazione, corsa).
- `FOREGROUND_SERVICE_LOCATION`: servizio in primo piano durante una corsa avviata dall'utente, con notifica fissa "Corsa in corso". **Richiede la dichiarazione "Autorizzazioni dei servizi in primo piano"** in Play Console, con un breve video della funzione.
- **Non** si usa `ACCESS_BACKGROUND_LOCATION`: nessuna dichiarazione "posizione in background".
- `CAMERA`, `RECORD_AUDIO`: solo per allegare foto, video e audio a una segnalazione.
- `POST_NOTIFICATIONS`: per mostrare la notifica "Corsa in corso".

## Da verificare prima della pubblicazione

- **Geocoding con OpenStreetMap/Nominatim:** le coordinate vengono inviate a Nominatim per ottenere il nome della via. In produzione serve un fornitore con contratto di trattamento dati (DPA) o un servizio proprio; altrimenti va dichiarata come condivisione con terze parti.
- **Mappe:** le tile di OpenStreetMap ricevono l'indirizzo IP e l'area visualizzata. Stesso discorso.
- **Pubblicità:** quando verrà aggiunta cambiano le risposte (identificativi pubblicitari, condivisione, consenso).
- **Conservazione:** definire nell'informativa i tempi di conservazione di segnalazioni e allegati.
