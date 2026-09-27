import {describe, it, expect} from 'vitest';
import {indexOf, mood, isRec, estimateTrip, level} from '../../src/lib/indices.js';
import {MIN_DRIVER_REPORTS} from '../../src/lib/config.js';

const DAY = 864e5, NOW = Date.UTC(2026, 8, 26);
const rep = (o) => ({verified:true, createdAt:NOW, rating:3, ...o});

describe('Termometro Safe Taxi', () => {
  it('ignora le segnalazioni non verificate', () => {
    expect(indexOf([rep({verified:false, rating:1})], NOW)).toBeNull();
    expect(indexOf([rep({rating:5}), rep({verified:false, rating:1})], NOW)).toBe(100);
  });
  it('dimezza il peso di una segnalazione ogni 90 giorni', () => {
    // pesi 1 e 0,5: (100×1 + 0×0,5) / 1,5 = 66,7
    expect(indexOf([rep({rating:5}), rep({rating:1, createdAt:NOW - 90*DAY})], NOW)).toBe(67);
  });
  it('restituisce "dati insufficienti" senza segnalazioni', () => {
    expect(mood(null).l).toBe('Dati insufficienti');
  });
});

describe('regole di pubblicazione', () => {
  it('mostra il rating individuale solo da 5 segnalazioni verificate', () => {
    expect(MIN_DRIVER_REPORTS).toBe(5);
  });
  it('assegna RECOMMENDED solo con rating ≥ 4,0 e almeno 20 recensioni', () => {
    expect(isRec({st:4.0, rv:20})).toBe(true);
    expect(isRec({st:3.9, rv:50})).toBe(false);
    expect(isRec({st:4.5, rv:19})).toBe(false);
    expect(isRec({st:null, rv:99})).toBe(false);
  });
});

describe('stima del costo', () => {
  const roma = {lat:41.9028, lng:12.4964}, termini = {lat:41.9009, lng:12.5010};
  it('usa la tariffa comunale verificata con meno di 5 corse nello storico', () => {
    const e = estimateTrip(roma, termini, []);
    expect(e.basis).toMatch(/tariffa comunale di Roma/);
    expect(e.lo).toBeCloseTo((3.5 + 1.33*e.km)*0.85);
  });
  it('dichiara demo la tariffa delle città non ancora verificate', () => {
    const bari = {lat:41.1171, lng:16.8719}, stazione = {lat:41.1177, lng:16.8697};
    expect(estimateTrip(bari, stazione, []).basis).toMatch(/parametri demo/);
  });
  it('usa lo storico della città con almeno 5 corse', () => {
    const hist = Array.from({length:5}, () => ({city:'roma', cost:20, duration:20}));
    const e = estimateTrip(roma, termini, hist);
    expect(e.basis).toMatch(/storico di 5 corse a Roma/);
    expect(e.lo).toBeLessThan(e.hi);
  });
});

describe('livelli', () => {
  it('calcola livello e avanzamento', () => {
    expect(level(0).name).toBe('Passeggero');
    expect(level(350)).toMatchObject({name:'Osservatore', pct:50});
    expect(level(5000)).toMatchObject({name:'Guardiano', pct:100});
  });
});
