import {describe, it, expect} from 'vitest';
import {recentWaits, waitLevel, waitProfile, waitPlaces, sameDateHistory, slotLabel} from '../../src/lib/waits.js';
import {romeTime} from '../../src/lib/holidays.js';
import {seedWaits} from '../../src/lib/seed.js';

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

describe('storico e previsioni delle attese (IMP-07, parte 2)', () => {
  const at = (iso, h, m = 10) => romeTime(iso, h, m);
  const H = (wait, ts, extra = {}) => ({type:'attesa', wait, lat:42, lng:12, city:'att', verified:true, waitedAt:ts, createdAt:ts, place:'Uscita nord', ...extra});
  const now = Date.parse('2026-12-30T11:00:00Z');
  // Stessi dati del test pgTAP 16_storico_attese.
  const list = [
    ...[30, 40, 50, 60, 70].map(w => H(w, at('2025-12-25', 18))),
    H(500, at('2025-12-25', 18), {verified:false}),
    ...[1, 2, 3, 4].map(() => H(10, at('2025-12-22', 8, 30), {place:''})),
    ...[1, 2, 3, 4, 5].map(() => H(10, at('2025-12-22', 8, 30), {lat:42.1, lng:12.1, place:''})),
    ...[1, 2, 3, 4, 5].map(() => H(5, at('2025-07-01', 0, 30), {lat:42.2, lng:12.2, place:''}))
  ];
  it('profilo per fascia di 2 ore nel tipo di giorno, solo verificate', () => {
    const p = waitProfile(list, {city:'att', type:'festivo', now});
    expect(p).toHaveLength(12);
    expect(p[9]).toMatchObject({n:5, avg:50});
    expect(slotLabel(9)).toBe('18–20');
  });
  it('città intera o punto, con la soglia delle 5 segnalazioni', () => {
    expect(waitProfile(list, {city:'att', type:'lavorativo', now})[4]).toMatchObject({n:9, avg:10});
    expect(waitProfile(list, {city:'att', lat:42, lng:12, type:'lavorativo', now})[4]).toMatchObject({n:4, avg:null});
    expect(waitProfile(list, {city:'att', lat:42.2, lng:12.2, type:'lavorativo', now})[0].n).toBe(5);
    expect(waitProfile(list, {city:'att', type:'festivo', now:Date.parse('2028-01-01T11:00:00Z')})[9].n).toBe(0);
  });
  it('stessa data negli anni precedenti', () => {
    expect(sameDateHistory(list, {city:'att', date:'2026-12-25', now:Date.parse('2026-12-20T11:00:00Z')}))
      .toEqual([{year:2025, n:5, avg:50, max:70, demo:false}]);
  });
  it('punti con almeno 5 segnalazioni e nome più usato', () => {
    expect(waitPlaces(list, 'att', now).map(p => p.n + ':' + (p.place || '-'))).toEqual(['9:Uscita nord', '5:-', '5:-']);
  });
  it('dati DEMO: più attese nei festivi, nessuna nelle ultime 2 ore', () => {
    const demo = seedWaits(now);
    expect(demo.every(r => r.demo && r.type === 'attesa')).toBe(true);
    expect(recentWaits(demo, now)).toHaveLength(0);
    expect(sameDateHistory(demo, {city:'roma', date:'2026-12-25', now}).map(r => r.year)).toEqual([2026, 2025]);
  });
});
