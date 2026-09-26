/* Funzioni pure, senza DOM: testate in tests/unit */
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmtNum = (v, d) => Number(v).toLocaleString('it-IT', {minimumFractionDigits:d||0, maximumFractionDigits:d||0});
export const fmtEur = v => (v == null || isNaN(v)) ? '—' : '€ ' + fmtNum(v, 2);
export function fmtTel(t){ const p = /^0(2|6)/.test(t) ? 2 : 3; return t.slice(0,p) + ' ' + t.slice(p); }
export function ago(ts){ const m = Math.round((Date.now()-ts)/60000); if (m < 1) return 'ora'; if (m < 60) return m + ' min fa'; const h = Math.round(m/60); if (h < 24) return h + ' h fa'; return Math.round(h/24) + ' g fa'; }
export function haversine(a, b){ const R = 6371, r = Math.PI/180; const dLat = (b.lat-a.lat)*r, dLng = (b.lng-a.lng)*r; const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(x)); }
export const normPlate = p => (p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function maskPlate(p){ p = normPlate(p); return p.length < 4 ? '•••' : p.slice(0,2) + '•••' + p.slice(-2); }
export function stars(n){ n = Math.max(0, Math.min(5, Math.round(n))); return '★'.repeat(n) + '☆'.repeat(5-n); }
export function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
