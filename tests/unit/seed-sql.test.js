import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildSeedSql, SEED_PATH} from '../../scripts/generate-seed.mjs';

describe('supabase/seed.sql', () => {
  it('è allineato al generatore dei dati DEMO (rigenera con npm run db:seed)', () => {
    expect(readFileSync(SEED_PATH, 'utf8')).toBe(buildSeedSql());
  });
  it('marca come DEMO tutte le città, cooperative e segnalazioni', () => {
    const sql = buildSeedSql();
    expect(sql).not.toMatch(/, false, 'DEMO/);
    expect(sql.match(/'pubblicata', true,/g)).toHaveLength(150);
  });
});
