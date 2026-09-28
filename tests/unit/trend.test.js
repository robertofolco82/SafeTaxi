import {describe, it, expect} from 'vitest';
import {trendOf, indexOf, MIN_TREND_REPORTS} from '../../src/lib/indices.js';
import {trendSvg, monthLabel} from '../../src/lib/trend.js';

// Stesso caso di supabase/tests/database/13_trend_termometro.test.sql.
const at = s => Date.parse(s);
const R = [
  ...[1, 2, 3, 4, 5].map(i => ({rating:5, verified:true, createdAt:at('2026-08-10T00:00:00Z') + i*864e5})),
  ...[1, 2, 3, 4, 5].map(i => ({rating:1, verified:true, createdAt:at('2026-09-10T00:00:00Z') + i*864e5})),
  {rating:1, verified:false, createdAt:at('2026-07-15T00:00:00Z')},
  {rating:1, verified:false, createdAt:at('2026-07-16T00:00:00Z')},
];
const NOW = at('2026-09-26T00:00:00Z');

describe('trend del Termometro (IMP-05b)', () => {
  const t = trendOf(R, NOW);
  it('12 mesi, l\'ultimo è il mese in corso', () => {
    expect(t).toHaveLength(12);
    expect(t.at(-1).month).toBe('2026-09-01');
    expect(t[0].month).toBe('2025-10-01');
  });
  it('valore a fine mese con la stessa regola dell\'indice', () => {
    expect(t.find(p => p.month === '2026-08-01').idx).toBe(100);
    expect(t.at(-1).idx).toBe(indexOf(R, NOW));
  });
  it('sotto la soglia nel mese il punto non si mostra; contano solo le verificate', () => {
    expect(MIN_TREND_REPORTS).toBe(5);
    expect(t.find(p => p.month === '2026-07-01')).toEqual({month:'2026-07-01', idx:null, n:0});
  });
  it('grafico accessibile, interrotto nei mesi senza dati, con la tabella dei dati', () => {
    const svg = trendSvg(t);
    expect(svg).toContain('role="img"');
    expect(svg).toMatch(/ultimo valore \d+ su 100 \(set 26\)/);
    expect((svg.match(/<polyline/g) || []).length).toBe(1);
    expect(svg).toContain('<summary>Vedi i dati</summary>');
    expect(trendSvg(t.map(p => ({...p, idx:null})))).toContain('Dati insufficienti');
    expect(monthLabel('2026-01-01')).toBe('gen 26');
  });
});
