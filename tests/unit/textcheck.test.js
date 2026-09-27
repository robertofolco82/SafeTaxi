import {describe, it, expect} from 'vitest';
import {textFlags, FLAG_HINTS} from '../../src/lib/textcheck.js';

// Stessi casi di supabase/tests/database/09_pubblicazione_automatica.test.sql: app e database devono coincidere.
const CASES = [
  ['Il tassametro segnava 24 euro, me ne ha chiesti 50 e ha rifiutato la ricevuta.', []],
  ["Mi ha molestata verbalmente durante la corsa e ha guidato a 130 all'ora.", []],
  ['Questo tassista è un truffatore', ['etichetta_reato']],
  ['Sono dei LADRI', ['etichetta_reato']],
  ['Un vero stronzo', ['insulto']],
  ['Chiamatelo al 333 123 4567', ['dati_personali']],
  ['Scrivetegli a mario.rossi@example.com', ['dati_personali']],
  ['Il tassista si chiama Giuseppe', ['dati_personali']],
  ['Ladro e bastardo', ['etichetta_reato', 'insulto']],
  ['Ha fatto una deviazione di 3 km sulla tangenziale alle 23:40', []],
];

describe('controlli sul testo delle segnalazioni', () => {
  it.each(CASES)('%s', (text, flags) => {
    expect(textFlags(text).sort()).toEqual([...flags].sort());
  });

  it('non confonde parole che contengono le radici', () => {
    expect(textFlags('Ha preso la strada per Porcari e poi per Ladispoli')).toEqual([]);
    expect(textFlags('Mi ha lasciato in piazza Negroni')).toEqual([]);
  });

  it('ogni segnale ha un suggerimento per chi scrive', () => {
    ['etichetta_reato', 'insulto', 'dati_personali'].forEach(f => expect(FLAG_HINTS[f]).toBeTruthy());
  });
});
