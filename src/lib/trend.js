/* Grafico del trend del Termometro (IMP-05b): una sola serie, scala fissa 0–100, 12 mesi.
   Linea sottile interrotta nei mesi senza dati sufficienti, punti con il valore al passaggio (title),
   griglia leggera a 0, 50 e 100, etichetta solo sull'ultimo valore. Colori dai token del design system;
   i testi usano i colori del testo, mai quello della serie. Funzione pura: restituisce il markup. */

const W = 320, H = 132, L = 26, R = 30, T = 10, B = 22;
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const monthLabel = iso => MONTHS[+iso.slice(5, 7) - 1] + ' ' + iso.slice(2, 4);

export function trendSvg(points, {title = 'Andamento del Termometro'} = {}){
  const n = points.length, x = i => L + (n < 2 ? 0 : i*(W - L - R)/(n - 1)), y = v => T + (100 - v)*(H - T - B)/100;
  const shown = points.map((p, i) => ({...p, i})).filter(p => p.idx != null);
  if (!shown.length) return '<p class="muted" style="font-size:13px">Dati insufficienti per l\'andamento: servono almeno 5 segnalazioni verificate in un mese.</p>';
  // Segmenti solo tra mesi consecutivi con dati: nessuna linea attraverso i mesi mancanti.
  const segs = []; let cur = [];
  points.forEach((p, i) => { if (p.idx == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(`${x(i).toFixed(1)},${y(p.idx).toFixed(1)}`); });
  if (cur.length) segs.push(cur);
  const last = shown[shown.length - 1];
  const summary = `${title}: ultimo valore ${last.idx} su 100 (${monthLabel(last.month)}), ${shown.length} mesi con dati su ${n}`;
  const grid = [0, 50, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>` +
    `<text x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--mut)">${v}</text>`).join('');
  const ticks = points.map((p, i) => i % 3 === (n - 1) % 3 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--mut)">${monthLabel(p.month)}</text>` : '').join('');
  const lines = segs.filter(s => s.length > 1).map(s => `<polyline points="${s.join(' ')}" fill="none" stroke="var(--pri)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const dots = shown.map(p => `<g class="trend-pt"><circle cx="${x(p.i)}" cy="${y(p.idx)}" r="12" fill="transparent"/>` +
    `<circle cx="${x(p.i)}" cy="${y(p.idx)}" r="4" fill="var(--pri)" stroke="var(--card, #fff)" stroke-width="2"/>` +
    `<title>${monthLabel(p.month)}: ${p.idx}/100 (${p.n} segnalazioni verificate)</title></g>`).join('');
  const lastLabel = `<text x="${x(last.i) + 8}" y="${y(last.idx) + 4}" font-size="11" font-weight="700" fill="var(--txt)">${last.idx}</text>`;
  const table = '<details class="trend-data"><summary>Vedi i dati</summary><table><thead><tr><th>Mese</th><th>Indice</th><th>Segnalazioni verificate</th></tr></thead><tbody>' +
    points.map(p => `<tr><td>${monthLabel(p.month)}</td><td>${p.idx == null ? '—' : p.idx}</td><td>${p.n}</td></tr>`).join('') + '</tbody></table></details>';
  return `<svg class="trend" role="img" aria-label="${summary}" viewBox="0 0 ${W} ${H}" width="100%">${grid}${ticks}${lines}${dots}${lastLabel}</svg>` + table;
}
