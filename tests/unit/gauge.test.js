import {describe, it, expect} from 'vitest';
import {gaugeSvg, gaugePoint, GAUGE_BANDS} from '../../src/lib/gauge.js';

describe('tachimetro del Termometro (IMP-05a)', () => {
  it('va dal rosso (0, a sinistra) al verde (100, a destra) passando per l\'alto', () => {
    expect(gaugePoint(0)).toEqual({x:20, y:100});
    expect(gaugePoint(50)).toEqual({x:100, y:20});
    expect(gaugePoint(100)).toEqual({x:180, y:100});
    expect(GAUGE_BANDS[0].color).toBe('var(--st-critical)');
    expect(GAUGE_BANDS.at(-1).color).toBe('var(--st-great)');
  });
  it('le fasce coprono 0–100 senza buchi, con le soglie del giudizio', () => {
    GAUGE_BANDS.forEach((b, i) => { if (i) expect(b.from).toBe(GAUGE_BANDS[i-1].to); });
    expect(GAUGE_BANDS.map(b => b.to)).toEqual([35, 50, 65, 80, 100]);
  });
  it('ha un\'etichetta accessibile con valore e giudizio, non solo il colore', () => {
    expect(gaugeSvg(72)).toContain('aria-label="Termometro 72 su 100: Buono"');
    expect(gaugeSvg(72)).toContain('<line');
    expect(gaugeSvg(null)).toContain('dati insufficienti');
    expect(gaugeSvg(null)).not.toContain('<line');
  });
});
