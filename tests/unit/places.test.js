import {describe, it, expect} from 'vitest';
import {addRecent, saveFavorite, renameFavorite, removeFavorite, sortFavorites, parsePlaces, MAX_RECENTS} from '../../src/lib/places.js';

const termini = {name:'Stazione Termini', lat:41.9010, lng:12.5018};
const colosseo = {name:'Colosseo', lat:41.8902, lng:12.4922};

describe('recenti (IMP-04)', () => {
  it('mette l\'ultima destinazione in cima, senza doppioni', () => {
    let r = addRecent([], termini);
    r = addRecent(r, colosseo);
    r = addRecent(r, {...termini, lat:41.90102});  // stesso luogo entro circa 50 m
    expect(r.map(x => x.name)).toEqual(['Stazione Termini', 'Colosseo']);
  });
  it('tiene al massimo le ultime 10', () => {
    let r = [];
    for (let i = 0; i < 15; i++) r = addRecent(r, {name:'Luogo ' + i, lat:41 + i/10, lng:12});
    expect(r).toHaveLength(MAX_RECENTS);
    expect(r[0].name).toBe('Luogo 14');
  });
});

describe('preferiti (IMP-04)', () => {
  it('salva con un\'etichetta, e la stessa etichetta aggiorna il luogo', () => {
    let f = saveFavorite([], 'Casa', termini, 'a');
    f = saveFavorite(f, 'casa', colosseo, 'b');
    expect(f).toEqual([{id:'a', label:'casa', name:'Colosseo', lat:41.8902, lng:12.4922}]);
    expect(() => saveFavorite(f, '  ', termini)).toThrow(/nome/);
  });
  it('rinomina ed elimina; niente due preferiti con lo stesso nome', () => {
    let f = saveFavorite(saveFavorite([], 'Casa', termini, 'a'), 'Palestra', colosseo, 'b');
    expect(() => renameFavorite(f, 'b', 'CASA')).toThrow(/Esiste già/);
    f = renameFavorite(f, 'b', 'Lavoro');
    expect(f.find(x => x.id === 'b').label).toBe('Lavoro');
    expect(removeFavorite(f, 'a').map(x => x.id)).toEqual(['b']);
  });
  it('ordina Casa e Lavoro prima degli altri', () => {
    const f = [{id:'1', label:'Zia'}, {id:'2', label:'Lavoro'}, {id:'3', label:'Amici'}, {id:'4', label:'Casa'}];
    expect(sortFavorites(f).map(x => x.label)).toEqual(['Casa', 'Lavoro', 'Amici', 'Zia']);
  });
  it('un archivio rovinato non blocca l\'app', () => {
    expect(parsePlaces('non json')).toEqual({favorites:[], recents:[]});
    expect(parsePlaces(null)).toEqual({favorites:[], recents:[]});
    expect(parsePlaces({favorites:[{id:'a', label:'Casa', lat:'x', lng:1}], recents:[termini]})).toEqual({favorites:[], recents:[termini]});
  });
});
