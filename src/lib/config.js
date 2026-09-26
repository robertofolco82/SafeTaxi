/* ================= CONFIGURAZIONE (valori DEMO da sostituire) ================= */
export const CITIES = {
  roma:    {n:'Roma', lat:41.9028,lng:12.4964,lic:7700,dem:38000,t:{start:3.5,km:1.30}},
  milano:  {n:'Milano', lat:45.4642,lng:9.1900, lic:4850,dem:30000,t:{start:3.6,km:1.35}},
  napoli:  {n:'Napoli', lat:40.8518,lng:14.2681,lic:2350,dem:16000,t:{start:3.5,km:1.20}},
  torino:  {n:'Torino', lat:45.0703,lng:7.6869, lic:1500,dem:9000, t:{start:3.6,km:1.25}},
  firenze: {n:'Firenze', lat:43.7696,lng:11.2558,lic:700, dem:6500, t:{start:3.8,km:1.30}},
  bologna: {n:'Bologna', lat:44.4949,lng:11.3426,lic:700, dem:5000, t:{start:3.5,km:1.30}},
  venezia: {n:'Venezia', lat:45.4408,lng:12.3155,lic:400, dem:3000, t:{start:3.5,km:1.30}},
  genova:  {n:'Genova', lat:44.4056,lng:8.9463, lic:850, dem:5000, t:{start:3.5,km:1.25}},
  palermo: {n:'Palermo', lat:38.1157,lng:13.3615,lic:300, dem:4500, t:{start:3.3,km:1.20}},
  bari:    {n:'Bari',    lat:41.1171,lng:16.8719,lic:200, dem:2500, t:{start:3.3,km:1.20}},
  catania: {n:'Catania', lat:37.5079,lng:15.0830,lic:150, dem:2500, t:{start:3.3,km:1.20}}
};
// st = valutazione media utenti Safe Taxi (DEMO), rv = n. recensioni, ext = rating esterno (null = non disponibile)
// Numeri telefonici: DA VERIFICARE prima della pubblicazione
export const APPS = [
  {id:'uber',   n:'Uber', store:'uber', f:['app','h24','airport'], st:4.3, rv:64, ext:null, d:'In alcune città consente di prenotare anche taxi ufficiali. Pagamento in app e tracciamento corsa.'},
  {id:'ittaxi', n:'itTaxi',   store:'ittaxi',  f:['app','h24'],           st:4.0, rv:27, ext:null, d:'App delle cooperative taxi italiane.'},
 {id:'freenow',n:'FREENOW', store:'freenow', f:['app','h24'],           st:3.8, rv:19, ext:null, d:'Prenotazione taxi via app.'}
];
export const COOPS = {
  roma:[{n:'Radio Taxi 3570',tel:'063570',f:['h24','airport'],st:4.2,rv:48,ext:null},
        {n:'Pronto Taxi 6645',tel:'066645',f:['h24','airport'],st:3.9,rv:31,ext:null},
        {n:'La Capitale 4994',tel:'064994',f:['h24'],st:3.8,rv:18,ext:null},
        {n:'Samarcanda 5551',tel:'065551',f:['h24'],st:3.7,rv:22,ext:null}],
  milano:[{n:'Taxiblu 4040',tel:'024040',f:['h24','airport'],st:4.2,rv:41,ext:null},
          {n:'Radio Taxi 8585',tel:'028585',f:['h24','airport'],st:4.0,rv:26,ext:null},
          {n:'Taxi Milano 6969',tel:'026969',f:['h24'],st:3.8,rv:17,ext:null},
 {n:'Autoradiotaxi 5353',tel:'025353',f:['h24'],st:3.7,rv:12,ext:null}],
  torino:[{n:'Radio Taxi Torino',tel:'0115737',f:['h24','airport'],st:4.1,rv:23,ext:null},
          {n:'Pronto Taxi Torino',tel:'0115730',f:['h24'],st:3.9,rv:14,ext:null}],
  bologna:[{n:'CAT Taxi Bologna',tel:'0514590',f:['h24','airport'],st:4.3,rv:29,ext:null},
 {n:'COTABO',tel:'051372727',f:['h24','airport'],st:4.1,rv:21,ext:null}],
 firenze:[{n:'SO.CO.TA. 4390',tel:'0554390',f:['h24','airport'],st:3.9,rv:20,ext:null},
 {n:'CO.TA.FI. 4242',tel:'0554242',f:['h24'],st:3.7,rv:15,ext:null}]
};
export const STORES = {
 uber:{ios:'https://apps.apple.com/it/app/uber/id368677368',and:'https://play.google.com/store/apps/details?id=com.ubercab',web:'https://www.uber.com/it/it/'},
 ittaxi:{web:'https://www.ittaxi.it/'},
 freenow:{web:'https://www.free-now.com/it/'},
 whereareu:{ios:'https://apps.apple.com/it/app/112-where-are-u/id888964800',and:'https://play.google.com/store/apps/details?id=it.Beta80Group.whereareu',web:'https://apps.apple.com/it/app/112-where-are-u/id888964800'}
};
export const TYPES = {positiva:'👍 Esperienza positiva',tariffa:'💰 Tariffa scorretta',rifiuto:'🚫 Rifiuto corsa o POS',percorso:'🛣️ Percorso allungato',comportamento:'😠 Comportamento scorretto',sicurezza:'⚠️ Guida pericolosa',igiene:'🧼 Veicolo in cattive condizioni',altro:'❓ Altro'};
export const NEG = Object.keys(TYPES).filter(k => k !== 'positiva');
export const FILTERS = {all:'Tutti',rec:'🏆 Recommended',h24:'🕐 24/7',airport:'✈️ Aeroporti',app:'📱 App'};
export const LEVELS = [{min:0,name:'Passeggero'},{min:200,name:'Osservatore'},{min:500,name:'Contributor'},{min:1000,name:'Guardiano'}];
export const REWARDS = [{n:'Buono trasporto pubblico 10 €',c:500},{n:'Sconto 15 € su corsa partner',c:1000},{n:'Donazione 20 € a ONLUS sicurezza stradale',c:1500}];
export const MIN_DRIVER_REPORTS = 5;
export const OCCUPANCY = 0.55; // tasso di occupazione ipotizzato per stima ricavo orario (DEMO)
// Punti: stessi valori per segnalazioni positive e negative (disciplina Omnibus, D.Lgs. 26/2023)
export const POINTS = {report:50, attachments:20, rideRating:10};
