import {describe, it, expect} from 'vitest';
import {recentWaits, waitLevel} from '../../src/lib/waits.js';

const NOW = Date.UTC(2026, 8, 28, 12);
const W = (min, lat, ago, place = '', extra = {}) => ({type:'attesa', wait:min, lat, lng:12.5018, city:'roma', place, waitedAt:NOW - ago*60e3, createdAt:NOW, ...extra});

describe('attese (IMP-07)', () => {
  it('livelli con colore e testo', () => {
    expect(waitLevel(5).l).toBe('Attesa breve');
    expect(waitLevel(15).k).toBe('media');
    expect(waitLevel(25).k).toBe('lunga');
    expect(waitLevel(40)).toMatchObject({k:'molto_lunga', c:'var(--st-critical)'});
  });
  it('raggruppa per punto le attese delle ultime 2 ore, dalla più lunga', () => {
    const r = recentWaits([
      W(40, 41.9010, 10, 'Termini, uscita via Marsala'), W(20, 41.90104, 30), W(5, 41.8800, 20, 'Ostiense'),
      W(90, 41.9010, 180),                               // più di 2 ore fa: esclusa
      {type:'tariffa', wait:null, lat:41.9, lng:12.5, createdAt:NOW},  // non è un'attesa
    ], NOW);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({avg:30, max:40, n:2, place:'Termini, uscita via Marsala', city:'roma'});
    expect(r[1]).toMatchObject({avg:5, n:1, place:'Ostiense'});
  });
});
