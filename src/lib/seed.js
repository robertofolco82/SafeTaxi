/* Segnalazioni DEMO generate con seed fisso: tutte marcate demo:true, mai presentate come reali */
import {CITIES, NEG} from './config.js';
import {mulberry32} from './utils.js';
import {addDays, dayType, romeParts, romeTime} from './holidays.js';

export function seedReports(now = Date.now()){
  const rnd = mulberry32(20260925), out = [];
  const bias = {roma:2.7,milano:3.3,napoli:2.9,torino:3.7,firenze:3.2,bologna:3.9,venezia:3.4,genova:3.3,palermo:2.6,bari:3.1,catania:2.5};
  const pos = ['Autista cortese e puntuale, POS funzionante.','Percorso più breve, prezzo in linea con il tassametro.','Auto pulita e guida prudente.'];
  const neg = {tariffa:'Importo superiore al tassametro, supplementi non spiegati.',rifiuto:'Rifiutata la corsa breve e il pagamento con carta.',percorso:'Percorso chiaramente allungato rispetto al navigatore.',comportamento:'Toni aggressivi e uso del telefono durante la guida.',sicurezza:'Velocità eccessiva e sorpassi pericolosi.',igiene:'Veicolo sporco e climatizzatore guasto.',altro:'Tassametro non avviato alla partenza.'};
  const L = 'ABCDEFGHJKLMNPRSTVWXYZ';
  const ch = () => L[Math.floor(rnd()*L.length)];
  const plate = () => ch() + ch() + String(100 + Math.floor(rnd()*900)) + ch() + ch();
 Object.keys(CITIES).forEach(k => {
    const c = CITIES[k], n = 8 + Math.floor(rnd()*12);
    for (let i = 0; i < n; i++) {
      const rating = Math.max(1, Math.min(5, Math.round(bias[k] + (rnd()-0.5)*2.6)));
      const type = rating >= 4 ? 'positiva' : NEG[Math.floor(rnd()*NEG.length)];
      const dur = 6 + Math.floor(rnd()*28);
      let cost = c.t.start + dur*0.37*c.t.km*(0.9 + rnd()*0.5);
      if (type === 'tariffa') cost *= 1.4;
 out.push({id:'s'+k+i, createdAt: now - Math.floor(rnd()*60*864e5), city:k, licenza:String(1000+Math.floor(rnd()*8000)), targa:plate(),
        from:'', to:'', type, rating, description: type === 'positiva' ? pos[Math.floor(rnd()*pos.length)] : neg[type],
        cost: Math.round(cost*2)/2, duration: dur, verified: rnd() > 0.15, attachments:0, demo:true,
        lat: c.lat + (rnd()-0.5)*0.06, lng: c.lng + (rnd()-0.5)*0.08});
    }
  });
  for (let i = 0; i < 7; i++) {
 out.push({id:'sd'+i, createdAt: now - i*5*864e5, city:'roma', licenza:'2468', targa:'AB123CD', from:'Termini', to:'Trastevere',
      type: i === 3 ? 'percorso' : 'positiva', rating: i === 3 ? 2 : (i % 2 ? 5 : 4),
      description: i === 3 ? 'Giro più lungo del necessario.' : 'Puntuale e gentile.', cost: 14 + i, duration: 18,
      verified:true, attachments:0, demo:true, lat:41.8986, lng:12.4769});
  }
  return out;
}

/* Attese DEMO per lo storico (IMP-07, parte 2): due punti, un giorno ogni giorno per 24 mesi (a partire da 2 giorni fa,
   così la mappa delle ultime 2 ore mostra solo le segnalazioni vere), di più e più lunghe nei festivi e a Natale.
   Stessa logica, con numeri casuali diversi, nel blocco SQL di scripts/generate-seed.mjs. Tutte demo:true. */
export const DEMO_WAIT_PLACES = [
  {city:'roma', lat:41.901, lng:12.502, place:'Stazione Termini, uscita via Marsala'},
  {city:'milano', lat:45.486, lng:9.204, place:'Stazione Centrale, piazza Duca d\'Aosta'}
];
// Peso della fascia oraria (ore 0–23) nella scelta dell'ora e attesa di base in minuti.
export const DEMO_WAIT_HOURS = [1,0,0,0,0,1,2,4,6,5,3,3,3,3,3,4,5,6,6,5,4,3,2,1];
export const demoWaitBase = h => (h >= 7 && h <= 9) || (h >= 17 && h <= 20) ? 18 : h >= 22 || h <= 5 ? 12 : 8;
const PEAKS = ['12-24', '12-25', '12-26', '12-31', '01-01', '08-15'];

export function seedWaits(now = Date.now()){
  const rnd = mulberry32(20260928), out = [], today = romeParts(now).date, total = DEMO_WAIT_HOURS.reduce((a, b) => a + b, 0);
  const hour = () => { let x = rnd()*total; for (let h = 0; h < 24; h++) { x -= DEMO_WAIT_HOURS[h]; if (x < 0) return h; } return 23; };
  for (let d = 2; d <= 730; d++) {
    const date = addDays(today, -d), type = dayType(date), peak = PEAKS.includes(date.slice(5, 10));
    DEMO_WAIT_PLACES.forEach((p, pi) => {
      const n = (type === 'lavorativo' ? 1 : 2) + (peak ? 6 : 0);
      for (let i = 0; i < n; i++) {
        const h = hour(), m = Math.floor(rnd()*60);
        const wait = Math.round(demoWaitBase(h)*(type === 'lavorativo' ? 1 : 1.4)*(peak ? 2.2 : 1)*(0.6 + rnd()*0.8));
        const rating = wait < 10 ? 4 + Math.round(rnd()) : wait < 20 ? 3 : 1 + Math.round(rnd());
        const at = romeTime(date, h, m);
        out.push({id:'sw' + pi + '_' + d + '_' + i, createdAt:at, waitedAt:at, city:p.city, licenza:'', targa:'', type:'attesa', rating,
          description: rating >= 4 ? 'Taxi disponibili, attesa breve.' : 'Coda lunga al posteggio, pochi taxi disponibili.',
          wait, place:p.place, verified:true, attachments:0, demo:true, lat:p.lat, lng:p.lng});
      }
    });
  }
  return out;
}
