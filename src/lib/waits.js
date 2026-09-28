/* Attese dei taxi (IMP-07): regole pure per la heatmap delle code, senza DOM.
   Una segnalazione di attesa ha minuti di attesa, posizione pubblica arrotondata (~100 m) e orario dell'attesa. */

import {dayType, romeParts} from './holidays.js';

export const WAIT_WINDOW_HOURS = 2;

// Livelli dell'attesa con i colori di stato del design system (sempre accompagnati da testo).
export function waitLevel(min){
  if (min < 10) return {k:'breve', l:'Attesa breve', c:'var(--st-good)'};
  if (min < 20) return {k:'media', l:'Attesa media', c:'var(--st-caution)'};
  if (min < 40) return {k:'lunga', l:'Attesa lunga', c:'var(--st-warning)'};
  return {k:'molto_lunga', l:'Attesa molto lunga', c:'var(--st-critical)'};
}

const when = r => r.waitedAt || r.createdAt;

// Attese delle ultime ore raggruppate per punto (stesse coordinate pubbliche): media, massimo, numero, ultima.
export function recentWaits(reports, now = Date.now(), hours = WAIT_WINDOW_HOURS){
  const from = now - hours*3600e3, groups = new Map();
  (reports || []).filter(r => r.type === 'attesa' && r.wait != null && r.lat != null && when(r) >= from && when(r) <= now + 300e3)
    .forEach(r => {
      const key = Number(r.lat).toFixed(3) + ',' + Number(r.lng).toFixed(3);
      const g = groups.get(key) || {lat:+Number(r.lat).toFixed(3), lng:+Number(r.lng).toFixed(3), city:r.city, sum:0, n:0, max:0, last:0, place:''};
      g.sum += r.wait; g.n++; g.max = Math.max(g.max, r.wait);
      if (when(r) >= g.last) { g.last = when(r); g.place = r.place || g.place; }
      groups.set(key, g);
    });
  return [...groups.values()].map(g => ({lat:g.lat, lng:g.lng, city:g.city, avg:Math.round(g.sum/g.n), max:g.max, n:g.n, last:g.last, place:g.place}))
    .sort((a, b) => b.avg - a.avg);
}

/* Storico e previsioni (IMP-07, parte 2). Stesse regole nel database (public.get_wait_places, get_wait_profile,
   get_wait_same_date): solo segnalazioni di attesa di account verificati, ora italiana dell'attesa,
   fasce di 2 ore, media mostrata solo con almeno 5 segnalazioni nella fascia (sotto: dati insufficienti). */
export const SLOT_HOURS = 2;
export const MIN_WAIT_SAMPLE = 5;
export const HISTORY_MONTHS = 24;
export const SAME_DATE_YEARS = 5;
// Punto dello storico: le segnalazioni entro circa 300 m (0,003° di latitudine, 0,004° di longitudine).
const NEAR_LAT = 0.003, NEAR_LNG = 0.004;

export const slotLabel = s => String(s*SLOT_HOURS).padStart(2, '0') + '–' + String((s + 1)*SLOT_HOURS).padStart(2, '0');

const monthsAgo = (now, m) => { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - m); return d.getTime(); };
const historyOf = (reports, city, lat, lng) => (reports || []).filter(r => r.type === 'attesa' && r.verified && r.wait != null
  && r.lat != null && (!city || r.city === city) && (lat == null || (Math.abs(r.lat - lat) <= NEAR_LAT && Math.abs(r.lng - lng) <= NEAR_LNG)));
const avgOf = list => list.length >= MIN_WAIT_SAMPLE ? Math.round(list.reduce((s, r) => s + r.wait, 0)/list.length) : null;

// Punti con più segnalazioni di attesa negli ultimi 24 mesi (celle di circa 100 m, almeno 5 segnalazioni): i primi 8.
export function waitPlaces(reports, city, now = Date.now()){
  const from = monthsAgo(now, HISTORY_MONTHS), cells = new Map();
  historyOf(reports, city).filter(r => when(r) >= from && when(r) <= now).forEach(r => {
    const key = Number(r.lat).toFixed(3) + ',' + Number(r.lng).toFixed(3);
    const c = cells.get(key) || {lat:+Number(r.lat).toFixed(3), lng:+Number(r.lng).toFixed(3), n:0, names:{}};
    c.n++; if (r.place) c.names[r.place] = (c.names[r.place] || 0) + 1;
    cells.set(key, c);
  });
  return [...cells.values()].filter(c => c.n >= MIN_WAIT_SAMPLE).sort((a, b) => b.n - a.n).slice(0, 8)
    .map(c => ({lat:c.lat, lng:c.lng, n:c.n, place:Object.entries(c.names).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || ''}));
}

// Profilo dell'attesa per fascia oraria in un tipo di giorno, sugli ultimi 24 mesi.
export function waitProfile(reports, {city = null, lat = null, lng = null, type, now = Date.now()} = {}){
  const from = monthsAgo(now, HISTORY_MONTHS), slots = Array.from({length:24/SLOT_HOURS}, () => []);
  historyOf(reports, city, lat, lng).filter(r => when(r) >= from && when(r) <= now).forEach(r => {
    const p = romeParts(when(r));
    if (dayType(p.date) === type) slots[Math.floor(p.hour/SLOT_HOURS)].push(r);
  });
  return slots.map((list, slot) => ({slot, n:list.length, avg:avgOf(list), demo:list.some(r => r.demo)}));
}

// Stessa data (giorno e mese) negli anni precedenti, fino a 5 anni, e nell'anno scelto se già passata.
export function sameDateHistory(reports, {city = null, lat = null, lng = null, date, now = Date.now()} = {}){
  const md = date.slice(5, 10), year = +date.slice(0, 4), today = romeParts(now).date, byYear = new Map();
  historyOf(reports, city, lat, lng).forEach(r => {
    const d = romeParts(when(r)).date, y = +d.slice(0, 4);
    if (d.slice(5, 10) !== md || y > year || y < year - SAME_DATE_YEARS || d >= today) return;
    byYear.set(y, [...(byYear.get(y) || []), r]);
  });
  return [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([y, list]) => ({year:y, n:list.length, avg:avgOf(list),
    max:list.length >= MIN_WAIT_SAMPLE ? Math.max(...list.map(r => r.wait)) : null, demo:list.some(r => r.demo)}));
}
