/* Grafico dell'attesa tipica per fascia oraria (IMP-07, parte 2): una sola serie, barre per le 12 fasce di 2 ore.
   Colore della barra dal livello dell'attesa (stessi colori della mappa), sempre con il valore scritto sopra;
   le fasce senza dati sufficienti restano vuote con un trattino, mai con un valore stimato.
   Griglia leggera, tabella dei dati sotto il grafico. Funzione pura: restituisce il markup. */
import {waitLevel, slotLabel, MIN_WAIT_SAMPLE} from './waits.js';

const W = 320, H = 150, L = 26, R = 6, T = 14, B = 22;

export function waitProfileSvg(profile, {title = 'Attesa tipica per fascia oraria'} = {}){
  const shown = profile.filter(p => p.avg != null);
  if (!shown.length) return `<p class="muted" style="font-size:13px">Dati insufficienti: servono almeno ${MIN_WAIT_SAMPLE} segnalazioni di attesa verificate in una fascia oraria.</p>`;
  const top = Math.max(30, Math.ceil(Math.max(...shown.map(p => p.avg))/10)*10), n = profile.length;
  const bw = (W - L - R)/n, y = v => T + (top - v)*(H - T - B)/top;
  const worst = shown.reduce((a, b) => b.avg > a.avg ? b : a);
  const summary = `${title}: dati in ${shown.length} fasce su ${n}, la più lunga ${slotLabel(worst.slot)} con ${worst.avg} minuti in media`;
  const grid = [0, top/2, top].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>` +
    `<text x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--mut)">${v}</text>`).join('');
  const bars = profile.map((p, i) => {
    const x = L + i*bw + 2, w = bw - 4, cx = L + i*bw + bw/2;
    const label = i % 2 === 0 ? `<text x="${L + i*bw}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--mut)">${String(p.slot*2).padStart(2, '0')}</text>` : '';
    if (p.avg == null) return label + `<line x1="${x + 2}" x2="${x + w - 2}" y1="${y(0) - 1}" y2="${y(0) - 1}" stroke="var(--mut)" stroke-width="2" stroke-dasharray="2 2"/>` +
      `<title>${slotLabel(p.slot)}: dati insufficienti (${p.n} segnalazioni)</title>`;
    return label + `<g><rect x="${x}" y="${y(p.avg)}" width="${w}" height="${y(0) - y(p.avg)}" rx="3" fill="${waitLevel(p.avg).c}"/>` +
      `<text x="${cx}" y="${y(p.avg) - 3}" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--txt)">${p.avg}</text>` +
      `<title>${slotLabel(p.slot)}: ${p.avg} min in media, ${waitLevel(p.avg).l.toLowerCase()} (${p.n} segnalazioni)</title></g>`;
  }).join('');
  const table = '<details class="trend-data"><summary>Vedi i dati</summary><table><thead><tr><th>Fascia</th><th>Media (min)</th><th>Segnalazioni</th></tr></thead><tbody>' +
    profile.map(p => `<tr><td>${slotLabel(p.slot)}</td><td>${p.avg == null ? '—' : p.avg}</td><td>${p.n}</td></tr>`).join('') + '</tbody></table></details>';
  return `<svg class="trend" role="img" aria-label="${summary}" viewBox="0 0 ${W} ${H}" width="100%">${grid}${bars}</svg>` + table;
}
