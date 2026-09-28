/* Attese dei taxi (IMP-07): regole pure per la heatmap delle code, senza DOM.
   Una segnalazione di attesa ha minuti di attesa, posizione pubblica arrotondata (~100 m) e orario dell'attesa. */

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
