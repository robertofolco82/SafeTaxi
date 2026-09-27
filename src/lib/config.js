/* ================= CONFIGURAZIONE ================= */
// Verifiche del 27/09/2026 su fonti ufficiali (dettaglio e link in docs/fonti-dati.md).
// lic = licenze taxi attive: ART, dataset "Diffusione TAXI e NCC" 2024 (verificato).
// dem = richieste giornaliere stimate: DEMO, nessuna fonte ufficiale.
// t = tariffa diurna feriale: quota di partenza e prima fascia al km (senza tariffa oraria né supplementi).
//     tv:true = verificata sul tariffario ufficiale (tSrc); tv:false = DA VERIFICARE, valori DEMO.
export const LIC_SRC = 'ART, Diffusione TAXI e NCC 2024';
export const CITIES = {
  roma:    {n:'Roma', lat:41.9028,lng:12.4964,lic:7701,dem:38000,t:{start:3.5,km:1.33},tv:true,tSrc:'Roma Capitale, Delibera G.C. n. 157 del 21/05/2026'},
  milano:  {n:'Milano', lat:45.4642,lng:9.1900, lic:4855,dem:30000,t:{start:4.1,km:1.32},tv:true,tSrc:'Regione Lombardia, D.G.R. XII/2569 del 17/06/2024, confermata dalla D.G.R. XII/4445 del 26/05/2025'},
  napoli:  {n:'Napoli', lat:40.8518,lng:14.2681,lic:2364,dem:16000,t:{start:4.0,km:1.19},tv:true,tSrc:'Comune di Napoli, Delibera G.C. n. 258 del 27/06/2024'},
  torino:  {n:'Torino', lat:45.0703,lng:7.6869, lic:1501,dem:9000, t:{start:3.5,km:1.75},tv:true,tSrc:'Città Metropolitana di Torino, D.C.R. n. 186 del 14/06/2023'},
  firenze: {n:'Firenze', lat:43.7696,lng:11.2558,lic:724, dem:6500, t:{start:3.8,km:1.10},tv:true,tSrc:'Comune di Firenze, tabella tariffe taxi in vigore dal 1/5/2024'},
  bologna: {n:'Bologna', lat:44.4949,lng:11.3426,lic:722, dem:5000, t:{start:3.9,km:1.45},tv:true,tSrc:'Comune di Bologna, tariffe in vigore dal 1/1/2025'},
  venezia: {n:'Venezia', lat:45.4408,lng:12.3155,lic:120, dem:3000, t:{start:3.5,km:1.30},tv:false},
  genova:  {n:'Genova', lat:44.4056,lng:8.9463, lic:868, dem:5000, t:{start:3.5,km:1.25},tv:false},
  palermo: {n:'Palermo', lat:38.1157,lng:13.3615,lic:319, dem:4500, t:{start:3.3,km:1.20},tv:false},
  bari:    {n:'Bari',    lat:41.1171,lng:16.8719,lic:150, dem:2500, t:{start:3.3,km:1.20},tv:false},
  catania: {n:'Catania', lat:37.5079,lng:15.0830,lic:188, dem:2500, t:{start:3.3,km:1.20},tv:false}
};
// st = valutazione media utenti Safe Taxi (DEMO), rv = n. recensioni, ext = rating esterno (null = non disponibile)
// f = servizi dichiarati dalla cooperativa sul proprio sito (solo quelli verificati).
export const APPS = [
  {id:'uber',   n:'Uber', store:'uber', f:['app','h24','airport'], st:4.3, rv:64, ext:null, d:'In alcune città consente di prenotare anche taxi ufficiali. Pagamento in app e tracciamento corsa.'},
  {id:'ittaxi', n:'itTaxi',   store:'ittaxi',  f:['app','h24'],           st:4.0, rv:27, ext:null, d:'App dell\'Unione dei Radiotaxi d\'Italia: prenota i taxi delle cooperative aderenti.'},
 {id:'freenow',n:'Freenow by Lyft', store:'freenow', f:['app','h24'],   st:3.8, rv:19, ext:null, d:'Prenotazione taxi via app.'}
];
// v:true = numero verificato sul sito ufficiale della cooperativa o del Comune (fonte in docs/fonti-dati.md);
// v:false = DA VERIFICARE (trovato solo su elenchi o social), mostrato con l'avviso.
export const COOPS = {
  roma:[{n:'Radiotaxi 3570',tel:'063570',v:true,f:['h24'],st:4.2,rv:48,ext:null},
        {n:'Pronto Taxi 6645',tel:'066645',v:true,f:['h24','app'],st:3.9,rv:31,ext:null},
        {n:'Samarcanda 5551',tel:'065551',v:true,f:['h24','airport','app'],st:3.7,rv:22,ext:null},
        {n:'La Capitale 4994',tel:'064994',v:false,f:[],st:3.8,rv:18,ext:null},
        {n:'Chiama Taxi 060609 (Roma Capitale)',tel:'060609',v:true,f:['app'],st:null,rv:0,ext:null}],
  milano:[{n:'Taxiblu 4040',tel:'024040',v:true,f:['h24','airport','app'],st:4.2,rv:41,ext:null},
          {n:'Radiotaxi 8585',tel:'028585',v:true,f:['h24','airport','app'],st:4.0,rv:26,ext:null},
          {n:'Radio Taxi 6969',tel:'026969',v:true,f:['h24','airport','app'],st:3.8,rv:17,ext:null}],
  napoli:[{n:'Taxi Napoli 8888',tel:'0818888',v:true,f:['h24'],st:null,rv:0,ext:null},
          {n:'Consortaxi 2222',tel:'0812222',v:true,f:['h24','app'],st:null,rv:0,ext:null}],
  torino:[{n:'Taxi Torino (anche 011 5737)',tel:'0115730',v:true,f:['h24'],st:4.1,rv:23,ext:null}],
  firenze:[{n:'Co.Ta.Fi. 4390',tel:'0554390',v:true,f:['h24','airport','app'],st:3.9,rv:20,ext:null},
           {n:'Taxi 4242',tel:'0554242',v:true,f:['h24','app'],st:3.7,rv:15,ext:null}],
  bologna:[{n:'C.A.T. 4590',tel:'0514590',v:true,f:['h24','app'],st:4.3,rv:29,ext:null},
           {n:'Co.Ta.Bo. 372727',tel:'051372727',v:true,f:['h24','app'],st:4.1,rv:21,ext:null}],
  venezia:[{n:'Radio Taxi Venezia (Mestre e terraferma)',tel:'0415964',v:true,f:['h24'],st:null,rv:0,ext:null}],
  genova:[{n:'Radio Taxi Genova 5966',tel:'0105966',v:true,f:['app'],st:null,rv:0,ext:null}],
  palermo:[{n:'Radio Taxi Trinacria 6878',tel:'0916878',v:true,f:['h24','airport','app'],st:null,rv:0,ext:null},
           {n:'Autoradio Taxi 8481',tel:'0918481',v:true,f:['h24','app'],st:null,rv:0,ext:null}],
  bari:[{n:'Nuova Co.Ta.Ba.',tel:'0805543333',v:false,f:[],st:null,rv:0,ext:null}],
  catania:[{n:'Radio Taxi Catania 8833',tel:'0958833',v:true,f:['h24','airport','app'],st:null,rv:0,ext:null}]
};
// Link agli store verificati il 27/09/2026 (App Store IT e Google Play): si apre quello del sistema in uso.
export const STORES = {
 uber:{ios:'https://apps.apple.com/it/app/id368677368',and:'https://play.google.com/store/apps/details?id=com.ubercab',web:'https://www.uber.com/it/it/'},
 ittaxi:{ios:'https://apps.apple.com/it/app/id527559443',and:'https://play.google.com/store/apps/details?id=it.ud.microtek.ITTaxi',web:'https://www.ittaxi.it/'},
 freenow:{ios:'https://apps.apple.com/it/app/id357852748',and:'https://play.google.com/store/apps/details?id=taxi.android.client',web:'https://www.free-now.com/it/'},
 whereareu:{ios:'https://apps.apple.com/it/app/id888964800',and:'https://play.google.com/store/apps/details?id=it.Beta80Group.whereareu',web:'https://apps.apple.com/it/app/id888964800'}
};
export const TYPES = {positiva:'Esperienza positiva',tariffa:'Tariffa scorretta',rifiuto:'Rifiuto corsa o POS',percorso:'Percorso allungato',comportamento:'Comportamento scorretto',sicurezza:'Guida pericolosa',igiene:'Veicolo in cattive condizioni',altro:'Altro'};
// Icona per tipo di segnalazione (nome icona in src/lib/icons.js): mai nel testo, solo nelle liste con markup.
export const TYPE_ICONS = {positiva:'thumbs-up',tariffa:'banknote',rifiuto:'ban',percorso:'route',comportamento:'octagon-alert',sicurezza:'triangle-alert',igiene:'spray-can',altro:'circle-help'};
export const NEG = Object.keys(TYPES).filter(k => k !== 'positiva');
export const FILTERS = {all:'Tutti',rec:'Recommended',h24:'24/7',airport:'Aeroporti',app:'App'};
export const FILTER_ICONS = {rec:'trophy',h24:'clock',airport:'plane-takeoff',app:'smartphone'};
export const LEVELS = [{min:0,name:'Passeggero'},{min:200,name:'Osservatore'},{min:500,name:'Contributor'},{min:1000,name:'Guardiano'}];
export const REWARDS = [{n:'Buono trasporto pubblico 10 €',c:500},{n:'Sconto 15 € su corsa partner',c:1000},{n:'Donazione 20 € a ONLUS sicurezza stradale',c:1500}];
export const MIN_DRIVER_REPORTS = 5;
export const OCCUPANCY = 0.55; // tasso di occupazione ipotizzato per stima ricavo orario (DEMO)
// Punti: stessi valori per segnalazioni positive e negative (disciplina Omnibus, D.Lgs. 26/2023)
export const POINTS = {report:50, attachments:20, rideRating:10};
