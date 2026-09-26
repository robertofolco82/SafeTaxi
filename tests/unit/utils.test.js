import {describe, it, expect} from 'vitest';
import {normPlate, maskPlate, esc, haversine, fmtTel} from '../../src/lib/utils.js';

describe('targhe', () => {
  it('normalizza maiuscole, spazi e trattini', () => {
    expect(normPlate('ab 123-cd')).toBe('AB123CD');
    expect(normPlate(null)).toBe('');
  });
  it('maschera sempre la targa nel feed pubblico', () => {
    expect(maskPlate('ab123cd')).toBe('AB•••CD');
    expect(maskPlate('AB1')).toBe('•••');
  });
});

describe('utility', () => {
  it('esegue l\'escape dell\'HTML', () => {
    expect(esc('<img src=x onerror="a">')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;');
  });
  it('calcola la distanza Roma–Milano in km', () => {
    const d = haversine({lat:41.9028, lng:12.4964}, {lat:45.4642, lng:9.19});
    expect(d).toBeGreaterThan(470);
    expect(d).toBeLessThan(490);
  });
  it('formatta i numeri di telefono', () => {
    expect(fmtTel('063570')).toBe('06 3570');
    expect(fmtTel('0115737')).toBe('011 5737');
  });
});
