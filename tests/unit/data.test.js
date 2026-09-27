import {describe, it, expect} from 'vitest';
import {toOpenDataRows, toCsv} from '../../src/lib/opendata.js';
import {seedReports} from '../../src/lib/seed.js';
import {CITIES, COOPS, APPS, STORES, FILTERS} from '../../src/lib/config.js';

const NOW = Date.UTC(2026, 8, 26);

describe('export a terzi', () => {
  const rows = toOpenDataRows([{id:'r1', createdAt:NOW, city:'roma', type:'tariffa', rating:2, cost:20, duration:15, verified:true,
    attachments:1, lat:41.901234, lng:12.498765, licenza:'2468', targa:'AB123CD', name:'Mario Rossi', description:'testo libero'}]);
  it('non contiene nomi, targhe, licenze o testo libero', () => {
    expect(Object.keys(rows[0])).not.toEqual(expect.arrayContaining(['licenza']));
    const json = JSON.stringify(rows);
    ['2468', 'AB123CD', 'Mario', 'testo libero'].forEach(s => expect(json).not.toContain(s));
  });
  it('arrotonda le coordinate a 2 decimali', () => {
    expect(rows[0]).toMatchObject({lat:41.9, lng:12.5});
  });
  it('produce un CSV separato da punto e virgola', () => {
    expect(toCsv(rows).split('\n')[0]).toBe('id;data;citta;tipo;valutazione;importo_eur;durata_min;verificata;allegati;lat;lng');
  });
});

describe('dati di configurazione', () => {
  it('ogni cooperativa dichiara se il numero è verificato, in un formato chiamabile', () => {
    Object.entries(COOPS).forEach(([k, list]) => {
      expect(CITIES[k]).toBeDefined();
      list.forEach(c => {
        expect(typeof c.v).toBe('boolean');
        expect(c.tel).toMatch(/^0[0-9]{4,11}$/);
        c.f.forEach(f => expect(Object.keys(FILTERS)).toContain(f));
      });
    });
  });
  it('ogni tariffa verificata ha la fonte', () => {
    Object.values(CITIES).forEach(c => {
      expect(c.lic).toBeGreaterThan(0);
      if (c.tv) expect(c.tSrc).toMatch(/\d{4}/); else expect(c.tSrc).toBeUndefined();
    });
  });
  it('ogni app ha il link di App Store e Google Play', () => {
    APPS.forEach(a => {
      expect(STORES[a.store].ios).toMatch(/^https:\/\/apps\.apple\.com\/it\/app\/id\d+$/);
      expect(STORES[a.store].and).toMatch(/^https:\/\/play\.google\.com\/store\/apps\/details\?id=[\w.]+$/);
    });
  });
});

describe('dati DEMO', () => {
  it('sono deterministici e tutti marcati come demo', () => {
    const a = seedReports(NOW), b = seedReports(NOW);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(80);
    expect(a.every(r => r.demo === true)).toBe(true);
  });
});
