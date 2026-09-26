/* Indici e regole di calcolo (Termometro, stime, RECOMMENDED, livelli) */
import {CITIES, LEVELS, MIN_DRIVER_REPORTS} from './config.js';
import {haversine, normPlate, maskPlate} from './utils.js';

// Termometro 0–100: solo segnalazioni verificate, peso dimezzato ogni 90 giorni
export function indexOf(reps, now = Date.now()){ let w = 0, s = 0; reps.forEach(r => { if (!r.verified) return; const wt = Math.pow(0.5, ((now - r.createdAt)/864e5)/90); w += wt; s += wt*(r.rating-1)*25; }); return w ? Math.round(s/w) : null; }
export function mood(v){
  if (v == null) return {e:'🤷', l:'Dati insufficienti', c:'#94a3b8'};
  if (v < 35) return {e:'😡', l:'Critico', c:'#dc2626'};
  if (v < 50) return {e:'😟', l:'Scarso', c:'#f97316'};
  if (v < 65) return {e:'😐', l:'Così così', c:'#eab308'};
  if (v < 80) return {e:'🙂', l:'Buono', c:'#22c55e'};
  return {e:'😄', l:'Ottimo', c:'#16a34a'};
}
export function perMinOf(reps){ let c = 0, d = 0; reps.forEach(r => { if (r.cost > 0 && r.duration > 0) { c += r.cost; d += r.duration; } }); return d > 0 ? c/d : null; }
export function nearestCity(p){ let best = 'roma', bd = 1e9; Object.keys(CITIES).forEach(k => { const d = haversine(p, CITIES[k]); if (d < bd) { bd = d; best = k; } }); return {key:best, dist:bd}; }
export function estimateTrip(o, d, reports){
  const km = haversine(o, d)*1.3, min = Math.max(4, km/22*60);
  const nc = nearestCity(o), key = nc.dist < 60 ? nc.key : null;
  const hist = key ? reports.filter(r => r.city === key).filter(r => r.cost > 0 && r.duration > 0) : [];
  const pm = perMinOf(hist);
  let cost, basis;
  if (key && hist.length >= 5 && pm) { cost = pm*min; basis = 'storico di ' + hist.length + ' corse a ' + CITIES[key].n; }
  else { const t = key ? CITIES[key].t : {start:3.5, km:1.3}; cost = t.start + t.km*km; basis = 'tariffa di riferimento (parametri demo)'; }
  return {km, min, lo:cost*0.85, hi:cost*1.15, basis};
}
// Bollo RECOMMENDED: rating >= 4,0 e almeno 20 recensioni
export const isRec = x => x.st != null && x.st >= 4.0 && x.rv >= 20;
export function level(p){
  let i = 0; LEVELS.forEach((l, j) => { if (p >= l.min) i = j; });
  const next = LEVELS[i+1];
  return {name:LEVELS[i].name, next, pct: next ? Math.round((p - LEVELS[i].min)/(next.min - LEVELS[i].min)*100) : 100};
}
// Rating del tassista in modalità demo locale: stessa risposta della funzione get_driver_rating del database.
export function driverRatingFrom(reports, query){
  const q = normPlate(query);
  if (q.length < 2) return {sufficient:false, verified_count:0, min_required:MIN_DRIVER_REPORTS};
  const reps = reports.filter(r => r.verified && (normPlate(r.targa) === q || normPlate(r.licenza) === q));
  if (reps.length < MIN_DRIVER_REPORTS) return {sufficient:false, verified_count:reps.length, min_required:MIN_DRIVER_REPORTS};
  const issues = {};
  reps.filter(r => r.type !== 'positiva').forEach(r => issues[r.type] = (issues[r.type] || 0) + 1);
  return {sufficient:true, verified_count:reps.length, min_required:MIN_DRIVER_REPORTS, plate_masked:maskPlate(q),
    avg_rating:Math.round(reps.reduce((a, r) => a + r.rating, 0)/reps.length*10)/10, issues};
}
