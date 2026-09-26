// Genera supabase/seed.sql con i dati DEMO dell'app (stesso generatore di src/lib/seed.js).
// Solo per gli ambienti di sviluppo: mai in produzione.
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {CITIES, COOPS} from '../src/lib/config.js';
import {seedReports} from '../src/lib/seed.js';
import {maskPlate} from '../src/lib/utils.js';

const q = v => v == null ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const uuid = i => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');

export const SEED_PATH = fileURLToPath(new URL('../supabase/seed.sql', import.meta.url));

export function buildSeedSql(){
  // createdAt relativo: generato con now = 0, in SQL diventa now() meno l'età della segnalazione.
  const reports = seedReports(0);

  const out = [
    '-- DATI DEMO generati da scripts/generate-seed.mjs: NON modificare a mano, NON caricare in produzione.',
    '-- Città, cooperative e segnalazioni sono inventate o da verificare: tutte marcate is_demo.',
    '',
    'insert into public.cities (key, name, lat, lng, licenses, daily_demand, tariff_start, tariff_km, is_demo, source) values',
    Object.entries(CITIES).map(([k, c]) =>
      `  (${[k, c.n, c.lat, c.lng, c.lic, c.dem, c.t.start, c.t.km].map(q).join(', ')}, true, 'DEMO: licenze, domanda e tariffe da verificare con i Comuni')`).join(',\n') + ';',
    '',
    'insert into public.coops (city_key, name, phone, features, phone_verified, is_demo) values',
    Object.entries(COOPS).flatMap(([k, list]) => list.map(c =>
      `  (${q(k)}, ${q(c.n)}, ${q(c.tel)}, array[${c.f.map(q).join(', ')}]::text[], false, true)`)).join(',\n') + ';',
    '',
    'insert into public.reports (id, kind, city_key, type, rating, description, from_place, to_place, cost_eur, duration_min, lat, lng, plate_masked, verified, status, is_demo, created_at) values',
    reports.map((r, i) =>
      `  (${q(uuid(i + 1))}, 'segnalazione', ${q(r.city)}, ${q(r.type)}, ${r.rating}, ${q(r.description)}, ${q(r.from || null)}, ${q(r.to || null)}, ${q(r.cost)}, ${q(r.duration)}, ${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}, ${q(maskPlate(r.targa))}, ${r.verified}, 'pubblicata', true, now() - interval '${-r.createdAt} milliseconds')`).join(',\n') + ';',
    '',
    'insert into private.reports_private (report_id, reporter_name, plate, license) values',
    reports.map((r, i) => `  (${q(uuid(i + 1))}, null, ${q(r.targa)}, ${q(r.licenza)})`).join(',\n') + ';',
    '',
    'insert into public.news (title, source_name, url, is_placeholder) values',
    "  ('Esempio · Nuovo bando comunale per licenze taxi', 'Fonte da configurare (comunicati dei Comuni)', null, true),",
    "  ('Esempio · Sciopero di categoria annunciato', 'Fonte da configurare (agenzie di stampa)', null, true),",
    "  ('Esempio · Nuove tariffe approvate dalla Giunta', 'Fonte da configurare (albo pretorio)', null, true);",
    '',
  ];
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(SEED_PATH, buildSeedSql());
  const reports = seedReports(0);
  console.log(`seed.sql: ${Object.keys(CITIES).length} città, ${Object.values(COOPS).flat().length} cooperative, ${reports.length} segnalazioni DEMO`);
}
