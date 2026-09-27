import {describe, it, expect} from 'vitest';
import {fromDbReport, italianPosition, authErrorMessage} from '../../src/lib/remote.js';
import {driverRatingFrom} from '../../src/lib/indices.js';
import {seedReports} from '../../src/lib/seed.js';

describe('dati dal database', () => {
  it('converte una riga pubblica di reports nel formato dell\'interfaccia', () => {
    const r = fromDbReport({id:'x', kind:'segnalazione', city_key:'roma', type:'tariffa', rating:2, description:'Test',
      from_place:null, to_place:'Termini', cost_eur:'14.50', duration_min:18, lat_approx:'41.899', lng_approx:'12.477',
      plate_masked:'AB•••CD', verified:true, is_demo:true, created_at:'2026-09-26T10:00:00Z'});
    expect(r).toMatchObject({city:'roma', from:'', to:'Termini', cost:14.5, lat:41.899, lng:12.477, targa:'AB•••CD', demo:true, licenza:''});
    expect(r.createdAt).toBe(Date.UTC(2026, 8, 26, 10));
  });
  it('allega la posizione solo se in Italia', () => {
    expect(italianPosition({lat:41.9, lng:12.5})).toEqual({lat:41.9, lng:12.5});
    expect(italianPosition({lat:48.85, lng:2.35})).toEqual({lat:null, lng:null});
    expect(italianPosition(null)).toEqual({lat:null, lng:null});
  });
  it('traduce gli errori di accesso in italiano', () => {
    expect(authErrorMessage({code:'invalid_credentials', message:'Invalid login credentials'})).toBe('Email o password non corretti.');
    expect(authErrorMessage({message:'Failed to fetch'})).toBe('Connessione non disponibile: riprova.');
  });
});

describe('rating del tassista in modalità demo locale', () => {
  const reports = seedReports(Date.UTC(2026, 8, 26));
  it('restituisce la stessa struttura della funzione del database', () => {
    const d = driverRatingFrom(reports, 'ab 123 cd');
    expect(d).toMatchObject({sufficient:true, verified_count:7, min_required:5, plate_masked:'AB•••CD', avg_rating:4, issues:{percorso:1}});
    expect(d.reports.length).toBeGreaterThanOrEqual(7);
    expect(d.reports[0]).not.toHaveProperty('targa');
    expect(d.reports[0]).not.toHaveProperty('licenza');
  });
  it('non mostra il rating sotto le 5 segnalazioni verificate', () => {
    expect(driverRatingFrom(reports, 'ZZ999ZZ')).toEqual({sufficient:false, verified_count:0, min_required:5});
  });
});
