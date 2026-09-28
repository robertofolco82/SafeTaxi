import {describe, it, expect} from 'vitest';
import {filterFeed, matchesQuery, queryWords, FEED_PAGE} from '../../src/lib/feed.js';
import {seedReports} from '../../src/lib/seed.js';

// Stessi casi di supabase/tests/database/12_filtro_feed.test.sql (esclusa la variante della parola, solo nel database).
const R = [
  {id:'1', city:'feed_a', type:'tariffa', description:'Il tassametro segnava 24 euro, me ne ha chiesti 40.', from:'Stazione', to:'Centro', targa:'FF123FF', licenza:'5151', createdAt:3},
  {id:'2', city:'feed_a', type:'positiva', description:'Città pulita e autista gentilissimo.', from:'', to:'Aeroporto', createdAt:2},
  {id:'3', city:'feed_b', type:'percorso', description:'Giro lungo, tassametro partito prima.', createdAt:1},
];

describe('filtro del feed (IMP-03)', () => {
  it('città, tipo e pagine', () => {
    expect(filterFeed(R, {city:'feed_a'}).map(r => r.id)).toEqual(['1', '2']);
    expect(filterFeed(R, {kind:'pos'}).map(r => r.id)).toEqual(['2']);
    expect(filterFeed(R, {kind:'neg', city:'feed_a'}).map(r => r.id)).toEqual(['1']);
    expect(filterFeed(R, {before:3}).map(r => r.id)).toEqual(['2', '3']);
  });
  it('parola chiave per inizio di parola, senza maiuscole e accenti, tutte le parole', () => {
    expect(filterFeed(R, {q:'tassam'}).map(r => r.id)).toEqual(['1', '3']);
    expect(filterFeed(R, {q:'CITTA gentil'}).map(r => r.id)).toEqual(['2']);
    expect(filterFeed(R, {q:'aeroporto'}).map(r => r.id)).toEqual(['2']);
    expect(filterFeed(R, {q:'tassametro aeroporto'})).toEqual([]);
  });
  it('mai su targa o licenza', () => {
    expect(matchesQuery(R[0], 'FF123FF')).toBe(false);
    expect(matchesQuery(R[0], '5151')).toBe(false);
  });
  it('ignora simboli e parole di una lettera, al massimo 8 parole', () => {
    expect(queryWords('tassametro & | ! :* a')).toEqual(['tassametro']);
    expect(queryWords('uno due tre quattro cinque sei sette otto nove')).toHaveLength(8);
  });
  it('a pagine da 12 sui dati demo', () => {
    expect(filterFeed(seedReports(Date.UTC(2026, 8, 26)))).toHaveLength(FEED_PAGE);
  });
});
