import {describe, it, expect} from 'vitest';
import {parseAuthLink} from '../../src/lib/deeplink.js';

const S = 'it.safetaxi.app';
describe('link di ritorno all\'app nativa', () => {
  it('legge il codice di accesso (Google, conferma email)', () => {
    expect(parseAuthLink(S + '://auth?code=abc123', S)).toEqual({code: 'abc123', recovery: false, error: null});
  });
  it('riconosce il recupero password', () => {
    expect(parseAuthLink(S + '://auth?flow=recovery&code=xyz', S)).toEqual({code: 'xyz', recovery: true, error: null});
  });
  it('riporta l\'errore di Supabase', () => {
    expect(parseAuthLink(S + '://auth#error=access_denied&error_description=Email+link+is+invalid', S).error).toBe('Email link is invalid');
  });
  it('ignora i link di altre app o percorsi', () => {
    expect(parseAuthLink('https://safetaxi-nu.vercel.app/?code=1', S)).toBeNull();
    expect(parseAuthLink('altra.app://auth?code=1', S)).toBeNull();
    expect(parseAuthLink(undefined, S)).toBeNull();
  });
});
