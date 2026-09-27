# Fonti dei dati di riferimento

Verifiche del 27/09/2026. Valori usati in `src/lib/config.js` e in `supabase/seed.sql` (colonna `source` delle città,
`phone_verified` delle cooperative). Ogni valore senza fonte ufficiale resta marcato DEMO o DA VERIFICARE nell'app.

## Licenze taxi

Autorità di Regolazione dei Trasporti, dataset "Diffusione TAXI e NCC" 2024 (pubblicato il 24/09/2025, 176 Comuni):
[catalogo](https://bdt.autorita-trasporti.it/catalogo-opendata/dataset?id=32),
[CSV](http://bdt.autorita-trasporti.it/wp-content/uploads/dcat/D32-Diffusione-TAXI-NCC-2024-v2.csv).

| Città | Licenze taxi | Nota |
|---|---|---|
| Roma | 7.701 | |
| Milano | 4.855 | |
| Napoli | 2.364 | |
| Torino | 1.501 | |
| Genova | 868 | |
| Firenze | 724 | |
| Bologna | 722 | |
| Palermo | 319 | |
| Catania | 188 | |
| Bari | 150 | |
| Venezia | 120 | Solo taxi su strada (Mestre e terraferma), esclusi i taxi acquei |

Sono dati 2024: non comprendono le licenze aggiuntive dei bandi 2025–2026 (Giubileo, Olimpiadi). Da aggiornare con il
prossimo dataset ART.

La **domanda giornaliera stimata** non ha una fonte ufficiale: resta DEMO.

## Tariffe (partenza feriale diurna e prima fascia al km)

Il modello dell'app usa solo quota di partenza + costo al km: non include la tariffa oraria (traffico e attese) né
i supplementi, quindi sottostima la corsa reale. Per confrontare le città conviene la **corsa standard** (5 km con
5 minuti di attesa, feriale diurna), che ogni Comune deve pubblicare secondo la
[Delibera ART n. 46/2022](https://www.autorita-trasporti.it/delibere/delibera-n-46-2022/).

| Città | Partenza | Al km | Corsa standard | Atto | Documento |
|---|---|---|---|---|---|
| Roma | € 3,50 | € 1,33 (fino a € 7 maturati) | € 13,10 | Delibera G.C. n. 157 del 21/05/2026 | [Tariffario giugno 2026](https://www.comune.roma.it/web-resources/cms/documents/TariffarioTaxi_giugno2026.pdf) |
| Milano (bacino aeroportuale lombardo) | € 4,10 | € 1,32 | € 13,60 | D.G.R. XII/2569 del 17/06/2024, confermata dalla D.G.R. XII/4445 del 26/05/2025 | [Regione Lombardia](https://www.regione.lombardia.it/infrastrutture-trasporti-e-mobilita/taxi-collegamenti-aeroportuali-e-noleggio/servizio-e-tariffe-taxi-nel-bacino-aeroportuale) |
| Napoli | € 4,00 | € 1,19 (€ 0,05 ogni 42 m) | € 12,10 | Delibera G.C. n. 258 del 27/06/2024 | [Tariffario 2024](https://static-www.comune.napoli.it/wp-content/uploads/2025/05/Tariffario_Taxi_2024.pdf) |
| Torino | € 3,50 | € 1,75 (fino a € 9 maturati) | non indicata | D.C.R. Città Metropolitana n. 186 del 14/06/2023 | [Tariffe per gli utenti](https://www.cittametropolitana.torino.it/sites/default/files/pagina/ub0_uc3/documenti/TAXI%20E%20NCC/TARIFFE_PER_GLI_UTENTI.pdf) |
| Firenze | € 3,80 | € 1,10 | non indicata | Tabella in vigore dal 1/5/2024 | [Comune di Firenze](https://servizi.comune.fi.it/sites/www.comune.fi.it/files/all._3_tariffe_fase_2-16052023_df.pdf) |
| Bologna | € 3,90 | € 1,45 | non indicata | Tariffe in vigore dal 1/1/2025 | [Comune di Bologna](https://www.comune.bologna.it/servizi-informazioni/tariffe-servizio-taxi) |

DA VERIFICARE (valori DEMO nell'app): **Venezia, Genova, Palermo, Bari, Catania**. I tariffari ufficiali esistono
([Genova 2025](https://www.comune.genova.it/sites/default/files/2025-05/TARIFFARIO%20COMPLETO%202025.pdf),
[Bari 2024](https://www.comune.bari.it/-/la-giunta-approva-le-nuove-tariffe-del-trasporto-su-taxi),
[Venezia](https://www.comune.venezia.it/it/content/tariffe-taxi-autovettura)), ma non è stato possibile leggerli
(PDF solo immagine o siti che bloccano l'accesso automatico): vanno letti a mano. Torino: verificare che il D.C.R.
186/2023 sia ancora l'ultimo aggiornamento ISTAT.

## Reddito medio dichiarato dei tassisti

Non esiste un dato pubblico per città.

- Gli open data del Dipartimento delle Finanze per codice attività coprono solo i contribuenti con reddito
  complessivo pari o superiore a 100.000 euro ([statistiche sulle dichiarazioni](https://www1.finanze.gov.it/finanze/analisi_stat/public/index.php?opendata=yes)).
- Le statistiche ISA ([anno d'imposta 2024](https://www1.finanze.gov.it/finanze/pagina_dichiarazioni/public/studisettore.php))
  hanno solo l'indice DG72U "Trasporto terrestre di passeggeri", che unisce taxi, NCC e altri servizi, ed escludono
  i forfettari, che sono gran parte dei tassisti: non è un dato sui tassisti.
- La cifra di circa 19.000 euro lordi annui citata dalla stampa (ATECO 49.32.10, sette province) viene da
  un'elaborazione de Il Sole 24 Ore, non da una pubblicazione del Ministero con metodologia pubblica.

Proposta: non mostrare il confronto con i redditi finché non c'è una fonte ufficiale aggregata (per esempio
una richiesta di elaborazione al Dipartimento delle Finanze). Nell'app la voce resta "non pubblicato per città".

## Cooperative (numeri di prenotazione)

Verificati sul sito ufficiale della cooperativa o su un sito istituzionale. "Servizi" riporta solo quelli dichiarati
dalla cooperativa.

| Città | Nome | Numero | Servizi dichiarati | Fonte |
|---|---|---|---|---|
| Roma | Radiotaxi 3570 | 06 3570 | h24 | [3570.it](https://www.3570.it/) |
| Roma | Pronto Taxi 6645 | 06 6645 | h24, app (InTaxi) | [6645.it](https://www.6645.it/) |
| Roma | Samarcanda | 06 5551 | h24, aeroporti, app | [065551.it](https://065551.it/en/) |
| Roma | Chiama Taxi 060609 (Roma Capitale) | 06 0609 | app | [Roma Capitale](https://www.comune.roma.it/web/it/scheda-servizi.page?contentId=INF47781) |
| Roma | La Capitale 4994 | 06 4994 | — | **DA VERIFICARE**: solo fonti secondarie, attribuito anche a "Taxi Tevere" |
| Milano | Taxiblu | 02 4040 | h24, aeroporti, app | [taxiblu.it](https://www.taxiblu.it/) |
| Milano | Radiotaxi 8585 | 02 8585 | h24, aeroporti, app | [milanoradiotaxi.it](https://milanoradiotaxi.it/) |
| Milano | Radio Taxi 6969 | 02 6969 | h24, aeroporti, app (itTaxi) | [026969.it](https://www.026969.it/) |
| Napoli | Taxi Napoli | 081 8888 | h24 | [taxinapoli.it](https://www.taxinapoli.it/) |
| Napoli | Consortaxi | 081 2222 | h24, app (Wetaxi) | [consortaxi.com](https://www.consortaxi.com/) |
| Torino | Taxi Torino | 011 5730 / 011 5737 | h24 | [Muoversi a Torino (Città di Torino)](https://www.muoversiatorino.it/en/taxi-cabs/) |
| Firenze | Co.Ta.Fi. 4390 | 055 4390 | h24, aeroporti, app (TaxiMove) | [4390.it](https://www.4390.it/) |
| Firenze | Taxi 4242 | 055 4242 | h24, app | [4242.it](https://www.4242.it/) |
| Bologna | C.A.T. | 051 4590 | h24, app (itTaxi) | [taxibologna.it](https://www.taxibologna.it/), [Bologna Welcome](https://www.bolognawelcome.com/it/altro/altro/taxi-cat-consorzio-autonomo-taxisti) |
| Bologna | Co.Ta.Bo. | 051 372727 | h24, app (BTaxi) | [cotabo.it](https://www.cotabo.it/) |
| Venezia | Radio Taxi Venezia (Mestre e terraferma) | 041 5964 | h24 | [radiotaxivenezia.com](https://www.radiotaxivenezia.com/en/contacts/details.php) |
| Genova | Radio Taxi Genova | 010 5966 | app (YOUR TAXI) | [5966.it](https://5966.it/) |
| Palermo | Radio Taxi Trinacria | 091 6878 | h24, aeroporti, app | [6878.it](https://www.6878.it/) |
| Palermo | Autoradio Taxi | 091 8481 | h24, app (appTaxi) | [taxi-palermo.it](https://www.taxi-palermo.it/contatti/) |
| Catania | Radio Taxi Catania (Social Taxi) | 095 8833 | h24, aeroporti, app (appTaxi) | [radiotaxicatania.org](https://www.radiotaxicatania.org/) |
| Bari | Nuova Co.Ta.Ba. | 080 5543333 | — | **DA VERIFICARE**: solo pagina Facebook ed elenchi; il vecchio sito radiotaxibari.it rimanda a un NCC |

Correzioni rispetto ai dati precedenti:
- a Firenze il 4390 è Co.Ta.Fi. (prima era indicato come SO.CO.TA.);
- a Torino le due cooperative si sono fuse in Taxi Torino;
- a Milano è stato tolto il 02 5353: il servizio indica ora un numero mobile;
- a Catania il numero ufficiale è ora 095 8833 (non più 095 330966).

## App (link agli store)

Verificati tramite l'API di ricerca dell'App Store (Italia) e le pagine di Google Play. L'app apre il link dello store
del sistema in uso (iOS o Android), altrimenti il sito.

| App | App Store | Google Play | Sviluppatore |
|---|---|---|---|
| Uber | id368677368 | com.ubercab | Uber Technologies, Inc. |
| itTaxi | id527559443 | it.ud.microtek.ITTaxi | Unione dei Radiotaxi d'Italia U.R.I. |
| Freenow by Lyft (ex FREENOW) | id357852748 | taxi.android.client | Intelligent Apps GmbH |
| 112 Where ARE U | id888964800 | it.Beta80Group.whereareu | AREU |
