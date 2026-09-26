# App Store · Etichette privacy (Privacy Nutrition Labels) — BOZZA

> **BOZZA da validare** con informativa privacy e DPIA (punto 5). Da aggiornare quando si aggiungerà la pubblicità.

## Tracciamento

**L'app non traccia gli utenti** (nessun collegamento con dati di altre aziende, nessun identificativo pubblicitario): non serve la richiesta App Tracking Transparency.

## Dati collegati all'utente

| Categoria Apple | Dato | Utilizzo |
|---|---|---|
| Informazioni di contatto → Nome | Nome e cognome del segnalatore | Funzionalità dell'app |
| Informazioni di contatto → Email | Email dell'account (facoltativo) | Funzionalità dell'app |
| Informazioni di contatto → Altro | Contatto del tassista che replica | Funzionalità dell'app |
| Posizione → Posizione precisa | Segnalazioni (facoltativo), condivisione live della corsa | Funzionalità dell'app |
| Contenuti utente → Foto o video | Allegati | Funzionalità dell'app |
| Contenuti utente → Dati audio | Allegati | Funzionalità dell'app |
| Contenuti utente → Altri contenuti | Testo di segnalazioni, valutazioni e repliche | Funzionalità dell'app |
| Identificatori → ID utente | ID dell'account | Funzionalità dell'app |

## Dati non raccolti

Salute, finanze, contatti della rubrica, cronologia di navigazione e ricerca, dati d'uso, diagnostica, identificativo pubblicitario.

## Altri requisiti Apple

- **Cancellazione dell'account nell'app** (linea guida 5.1.1(v)): Profilo → Elimina account e dati.
- **Login con Google** senza "Accedi con Apple": ammesso finché si offre anche email e password (linea guida 4.8, alternative equivalenti). Da ricontrollare al momento della pubblicazione.
- **Posizione in background:** la modalità "location" serve solo durante una corsa avviata dall'utente; iOS mostra l'indicatore blu. In revisione va spiegato nelle note per il revisore, con un video.
- **Privacy manifest** (`PrivacyInfo.xcprivacy`): Capacitor include il proprio; quello dell'app va aggiunto in Xcode prima dell'invio.
