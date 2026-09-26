/* Segnalazioni DEMO generate con seed fisso: tutte marcate demo:true, mai presentate come reali */
import {CITIES, NEG} from './config.js';
import {mulberry32} from './utils.js';

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
