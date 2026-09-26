import {describe, it, expect} from 'vitest';
import {shouldSendPosition, liveLink, liveToken} from '../../src/lib/live.js';

describe('tracking live', () => {
  const last = {lat: 41.9, lng: 12.5, ts: 1_000_000};
  it('invia la prima posizione subito', () => {
    expect(shouldSendPosition(null, {lat: 41.9, lng: 12.5}, 0, false)).toBe(true);
  });
  it('invia ogni 15 secondi o dopo 50 metri', () => {
    expect(shouldSendPosition(last, {lat: 41.9001, lng: 12.5}, last.ts + 10000, false)).toBe(false);
    expect(shouldSendPosition(last, {lat: 41.9001, lng: 12.5}, last.ts + 15000, false)).toBe(true);
    expect(shouldSendPosition(last, {lat: 41.9006, lng: 12.5}, last.ts + 2000, false)).toBe(true);
  });
  it('in risparmio energetico invia meno spesso', () => {
    expect(shouldSendPosition(last, {lat: 41.9006, lng: 12.5}, last.ts + 30000, true)).toBe(false);
    expect(shouldSendPosition(last, {lat: 41.9006, lng: 12.5}, last.ts + 60000, true)).toBe(true);
  });
  it('costruisce e legge il link', () => {
    const token = 'Ab3_-xY9Ab3_-xY9Ab3_-xY9Ab3_-xY9';
    const link = liveLink('https://safetaxi-nu.vercel.app', '/', token);
    expect(link).toBe('https://safetaxi-nu.vercel.app/?live=' + token);
    expect(liveToken(new URL(link).search)).toBe(token);
    expect(liveToken('?live=<script>')).toBeNull();
    expect(liveToken('')).toBeNull();
  });
});
