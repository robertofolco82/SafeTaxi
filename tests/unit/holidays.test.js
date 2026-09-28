import {describe, it, expect} from 'vitest';
import {easterSunday, holidayName, dayType, romeParts, romeTime, addDays} from '../../src/lib/holidays.js';

describe('calendario italiano (IMP-07)', () => {
  it('Pasqua e Lunedì dell\'Angelo', () => {
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(holidayName('2027-03-29')).toBe('Lunedì dell\'Angelo');
    expect(holidayName('2026-04-06')).toBe('Lunedì dell\'Angelo');
  });
  it('San Francesco festa nazionale solo dal 2026 (L. 151/2025)', () => {
    expect(holidayName('2026-10-04')).toBe('San Francesco');
    expect(holidayName('2025-10-04')).toBeNull();
  });
  it('tipo di giorno, come private.day_type nel database', () => {
    expect(dayType('2026-12-25')).toBe('festivo');
    expect(dayType('2026-12-26')).toBe('festivo');   // Santo Stefano di sabato
    expect(dayType('2026-12-19')).toBe('sabato');
    expect(dayType('2026-12-20')).toBe('festivo');   // domenica
    expect(dayType('2026-12-28')).toBe('lavorativo');
    expect(dayType('2026-06-02')).toBe('festivo');
  });
  it('ora italiana con ora legale e solare', () => {
    expect(romeParts(Date.parse('2025-06-30T22:30:00Z'))).toEqual({date:'2025-07-01', hour:0, minute:30});
    expect(romeParts(Date.parse('2025-12-25T17:10:00Z'))).toEqual({date:'2025-12-25', hour:18, minute:10});
    expect(romeTime('2025-07-01', 0, 30)).toBe(Date.parse('2025-06-30T22:30:00Z'));
    expect(romeTime('2025-12-25', 18, 10)).toBe(Date.parse('2025-12-25T17:10:00Z'));
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
