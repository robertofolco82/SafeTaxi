/* Tachimetro del Termometro Safe Taxi (IMP-05a): semicerchio dal rosso (0) al verde (100), con lancetta.
   Fasce uguali alle soglie di mood() in indices.js e ai colori di stato del design system.
   Funzione pura: restituisce il markup SVG. Valore e giudizio vanno sempre mostrati anche in testo. */
import {mood} from './indices.js';

export const GAUGE_BANDS = [
  {from:0, to:35, color:'var(--st-critical)'},
  {from:35, to:50, color:'var(--st-warning)'},
  {from:50, to:65, color:'var(--st-caution)'},
  {from:65, to:80, color:'var(--st-good)'},
  {from:80, to:100, color:'var(--st-great)'}
];

const CX = 100, CY = 100, R = 80;
// Punto sull'arco per un valore 0–100: 0 a sinistra, 100 a destra, passando per l'alto.
export function gaugePoint(v, r = R){
  const a = Math.PI*(1 - Math.min(100, Math.max(0, v))/100);
  return {x:+(CX + r*Math.cos(a)).toFixed(2), y:+(CY - r*Math.sin(a)).toFixed(2)};
}
const arc = (a, b) => { const p = gaugePoint(a), q = gaugePoint(b); return `M${p.x} ${p.y}A${R} ${R} 0 0 1 ${q.x} ${q.y}`; };

export function gaugeSvg(v, {width = 200} = {}){
  const m = mood(v), label = v == null ? 'Termometro: dati insufficienti' : `Termometro ${v} su 100: ${m.l}`;
  const bands = GAUGE_BANDS.map(b => `<path d="${arc(b.from, b.to)}" stroke="${v == null ? 'var(--line)' : b.color}" stroke-width="16" fill="none"/>`).join('');
  const tip = v == null ? null : gaugePoint(v, R - 22);
  const needle = tip ? `<line x1="${CX}" y1="${CY}" x2="${tip.x}" y2="${tip.y}" stroke="var(--txt)" stroke-width="4" stroke-linecap="round"/>` : '';
  return `<svg class="gauge" role="img" aria-label="${label}" viewBox="0 0 200 112" width="${width}" height="${Math.round(width*0.56)}">` +
    bands + needle + `<circle cx="${CX}" cy="${CY}" r="7" fill="var(--txt)"/></svg>`;
}
