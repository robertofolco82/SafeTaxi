import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {freshness, figure, sourceLine, monthsBetween} from '../../src/lib/official.js';
import {OFFICIAL} from '../../src/lib/official-data.js';
import {CITIES} from '../../src/lib/config.js';

const at = s => Date.parse(s + 'T12:00:00Z');

describe('regola di aggiornamento dei dati ufficiali (IMP-06)', () => {
  const lic = {rule:'periodico', published:'2025-09-24'};
  it('pubblicazioni periodiche: fino a 12 mesi normali, poi con avviso, oltre 24 mesi nascoste', () => {
    expect(freshness(lic, at('2026-09-23'))).toEqual({show:true, stale:false});
    expect(freshness(lic, at('2026-09-28'))).toEqual({show:true, stale:true});
    expect(freshness(lic, at('2027-09-23'))).toEqual({show:true, stale:true});
    expect(freshness(lic, at('2027-09-24'))).toEqual({show:false, stale:true});
    expect(monthsBetween('2025-09-24', at('2026-09-28'))).toBe(12);
  });
  it('tariffe: vale la delibera in vigore, qualunque sia la data', () => {
    expect(freshness({rule:'in_vigore', published:'2019-01-01'}, at('2026-09-28'))).toEqual({show:true, stale:false});
  });
  it('fonte, anno e data di pubblicazione in pagina', () => {
    const f = figure(OFFICIAL, 'roma', 'licenze_taxi', at('2026-09-28'));
    expect(f).toMatchObject({value:7701, stale:true});
    expect(sourceLine(f)).toBe('Fonte: ART, dataset "Diffusione TAXI e NCC", anno 2024, pubblicato il 24/09/2025');
    expect(sourceLine(figure(OFFICIAL, 'roma', 'tariffa_km'))).toMatch(/Delibera G\.C\. n\. 157.*\(in vigore\)/);
    expect(figure(OFFICIAL, 'bari', 'tariffa_km')).toBeNull();
    expect(figure(OFFICIAL, 'roma', 'licenze_taxi', at('2027-10-01'))).toBeNull();
  });
});

describe('coerenza dei dati ufficiali', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20260928160000_dati_ufficiali.sql', import.meta.url), 'utf8');
  it('la migrazione contiene gli stessi valori del modulo', () => {
    OFFICIAL.forEach(f => expect(sql).toContain(`('${f.city}', '${f.metric}', ${f.value}, `));
    expect((sql.match(/^  \('/gm) || []).length).toBe(OFFICIAL.length);
  });
  it('ogni dato ha fonte con link, anno e data', () => {
    OFFICIAL.forEach(f => {
      expect(f.url).toMatch(/^https:\/\//);
      expect(f.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.year).toBeGreaterThan(2000);
    });
  });
  it('licenze e tariffe della stima del costo coincidono con i dati ufficiali', () => {
    Object.entries(CITIES).forEach(([k, c]) => {
      expect(figure(OFFICIAL, k, 'licenze_taxi', at('2026-01-01')).value).toBe(c.lic);
      const ts = figure(OFFICIAL, k, 'tariffa_partenza'), tk = figure(OFFICIAL, k, 'tariffa_km');
      if (c.tv) { expect(ts.value).toBe(c.t.start); expect(tk.value).toBe(c.t.km); } else expect(ts).toBeNull();
    });
  });
});
