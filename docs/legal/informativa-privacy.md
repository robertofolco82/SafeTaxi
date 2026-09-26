# Informativa sul trattamento dei dati personali — Safe Taxi

> **BOZZA — DA VERIFICARE CON UN LEGALE/DPO PRIMA DELLA PUBBLICAZIONE.** Non è ancora mostrata nell'app.
> I campi tra parentesi quadre vanno completati. Ogni affermazione descrive il funzionamento reale dell'app al
> 26/09/2026 (codice nel repository): se il codice cambia, va aggiornata anche l'informativa.

Informativa resa ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 ("GDPR") e del D.Lgs. 196/2003
("Codice privacy").

## 1. Titolare del trattamento e contatti

- Titolare: [NOME E COGNOME / RAGIONE SOCIALE], [INDIRIZZO].
- Contatto privacy: [EMAIL DEDICATA, es. privacy@dominio] — da usare anche per l'esercizio dei diritti.
- Responsabile della protezione dei dati (DPO): [non nominato / nominativo]. *Nota: la nomina non è obbligatoria
  per una persona fisica o una piccola impresa, salvo monitoraggio regolare e sistematico su larga scala
  (art. 37 GDPR): da rivalutare con la crescita degli utenti.*

## 2. Quali dati trattiamo e perché

| Dati | Da chi | Finalità | Base giuridica | Conservazione |
|---|---|---|---|---|
| Email, password (cifrata), eventuale nome da Google | Utente registrato | Account, accesso, verifica delle recensioni | Contratto (art. 6.1.b) | Fino alla cancellazione dell'account |
| Identificativo anonimo del dispositivo (accesso anonimo) | Ospite, al primo invio | Limiti anti-abuso, collegare le segnalazioni al dispositivo | Legittimo interesse (art. 6.1.f): prevenire recensioni false | Fino alla cancellazione dell'account anonimo |
| Nome e cognome del segnalatore | Autore della segnalazione | Serietà e verificabilità della segnalazione; mai pubblicato | Legittimo interesse (art. 6.1.f) | [PROPOSTA: finché la segnalazione è pubblicata; cancellato con l'account] |
| Contenuto della segnalazione (città, tipo, voto, descrizione, tratta, importo, durata) | Autore | Pubblicazione della recensione, rating, statistiche | Contratto (art. 6.1.b) | [PROPOSTA: 3 anni, poi solo in forma aggregata] |
| Foto, video, audio allegati | Autore | Prova a supporto, verificata dal moderatore | Contratto (art. 6.1.b) | Come la segnalazione; video e audio mai pubblici |
| Posizione precisa della segnalazione | Autore, solo se la allega | Contesto della segnalazione | Consenso (art. 6.1.a), revocabile | Esatta solo ai moderatori; pubblica arrotondata a circa 100 m |
| Posizione durante la corsa | Utente, solo se avvia la corsa | Tracciamento sul dispositivo; condivisione in tempo reale se attivata; bollino "corsa verificata" per gli account verificati | Contratto (art. 6.1.b) | Condivisione: cancellata a fine corsa (max 3 ore); verifica: solo durata e km, 7 giorni |
| Contatti di emergenza | Utente | Messaggio SOS | Contratto | Solo sul dispositivo, mai inviati ai nostri server |
| Nome, email, motivo di una segnalazione di contenuto (DSA) | Chi segnala un contenuto | Gestione della segnalazione (Reg. UE 2022/2065, art. 16) | Obbligo legale (art. 6.1.c) | Nome ed email fino alla cancellazione dell'account; la decisione resta, anonima |
| Contatto e targa/licenza indicati nella replica | Tassista che replica | Verifica dell'identità del tassista | Legittimo interesse (diritto di replica) | Come la replica |
| Punti | Utente registrato | Programma premi | Contratto | Fino alla cancellazione dell'account |

## 3. Dati dei tassisti (art. 14 GDPR)

Le segnalazioni riguardano un servizio pubblico (taxi e NCC) e contengono dati che possono identificare
indirettamente il conducente: **targa e numero di licenza**. Questi dati:

- sono conservati in un'area riservata del database, visibile solo ai moderatori;
- **non sono mai pubblicati**: nel feed la targa è mascherata (es. AB•••CD) e la licenza non compare;
- servono a calcolare il rating del singolo conducente, visibile solo con almeno 5 segnalazioni verificate;
- non sono mai ceduti a terzi: l'export di dati è anonimo (senza targhe, licenze, nomi; coordinate arrotondate).

Base giuridica: legittimo interesse (art. 6.1.f) degli utenti a informarsi sulla qualità di un servizio pubblico
e a segnalarne i disservizi, bilanciato dalle misure sopra. [VALUTAZIONE DI BILANCIAMENTO (LIA) DA ALLEGARE.]

Il tassista può: replicare pubblicamente a una segnalazione; chiedere accesso, rettifica o cancellazione;
opporsi al trattamento (art. 21) scrivendo a [EMAIL]; segnalare un contenuto con il modulo "Segnala contenuto".

Poiché informare singolarmente ogni conducente richiederebbe uno sforzo sproporzionato e i dati non sono
pubblicati in forma identificabile, questa informativa è resa pubblica (art. 14, par. 5, lett. b). [DA VALUTARE:
comunicazione alle associazioni di categoria.]

## 4. Moderazione e decisioni automatizzate

Ogni segnalazione è letta da un moderatore prima della pubblicazione. Non ci sono decisioni basate
unicamente su trattamenti automatizzati con effetti giuridici (art. 22). Sul dispositivo, un algoritmo
(MediaPipe) individua e sfoca i volti nelle foto prima dell'invio: la foto originale non lascia il telefono.

## 5. Destinatari e fornitori

Nessuna vendita o cessione di dati. Fornitori che trattano dati per nostro conto (responsabili, art. 28):

| Fornitore | Servizio | Luogo dei dati | Trasferimenti extra UE |
|---|---|---|---|
| Supabase Inc. | Database, autenticazione, file, funzioni | UE (Francoforte) | Possibile accesso dagli USA per assistenza: [VERIFICARE DPA e clausole/DPF] |
| Vercel Inc. | Hosting della versione web | Rete globale | USA: [VERIFICARE DPA e Data Privacy Framework] |
| Google LLC | Accesso con Google (solo se scelto) | — | USA: Data Privacy Framework |
| OpenStreetMap Foundation (tile e ricerca indirizzi Nominatim) | Mappe e nome della via | Regno Unito | Decisione di adeguatezza |

Il browser o l'app contattano direttamente anche le testate giornalistiche quando apri una notizia.

## 6. Diritti

Accesso, rettifica, cancellazione, limitazione, portabilità, opposizione (artt. 15–22 GDPR), revoca del
consenso in qualsiasi momento. L'account e i dati si cancellano direttamente dall'app (Profilo → Elimina account
e dati) o dal sito (`?account=elimina`). Reclamo al Garante per la protezione dei dati personali
(www.garanteprivacy.it).

## 7. Sicurezza

Connessioni cifrate; accesso ai dati regolato riga per riga nel database; dati personali in un'area separata
accessibile solo ai moderatori; metadati (anche GPS) rimossi dalle foto sul dispositivo e verificati dal server;
video e audio mai pubblici; link di condivisione della corsa salvati solo come impronta crittografica.

## 8. Età minima

L'app è riservata ai maggiori di 18 anni (dichiarazione richiesta all'invio di una segnalazione).

## 9. Modifiche

Data dell'ultimo aggiornamento: [DATA]. Le modifiche sostanziali saranno comunicate nell'app.
