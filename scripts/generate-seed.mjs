// Genera supabase/seed.sql con i dati DEMO dell'app (stesso generatore di src/lib/seed.js).
// Solo per gli ambienti di sviluppo: mai in produzione.
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {CITIES, COOPS, LIC_SRC} from '../src/lib/config.js';
import {seedReports, DEMO_WAIT_PLACES, DEMO_WAIT_HOURS} from '../src/lib/seed.js';
import {maskPlate} from '../src/lib/utils.js';

const q = v => v == null ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const uuid = i => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');

export const SEED_PATH = fileURLToPath(new URL('../supabase/seed.sql', import.meta.url));

const citySource = c => 'Licenze: ' + LIC_SRC + '. Tariffa: ' + (c.tv ? c.tSrc : 'DEMO, da verificare') + '.';

export function buildSeedSql(){
  // createdAt relativo: generato con now = 0, in SQL diventa now() meno l'età della segnalazione.
  const reports = seedReports(0);

  const out = [
    '-- DATI DEMO generati da scripts/generate-seed.mjs: NON modificare a mano, NON caricare in produzione.',
    '-- Segnalazioni e rating delle cooperative sono inventati: righe marcate is_demo.',
    '-- Licenze (ART 2024), numeri delle cooperative (phone_verified) e tariffe indicate in source sono verificati.',
    '',
    'insert into public.cities (key, name, lat, lng, licenses, daily_demand, tariff_start, tariff_km, is_demo, source) values',
    Object.entries(CITIES).map(([k, c]) =>
      `  (${[k, c.n, c.lat, c.lng, c.lic, null, c.t.start, c.t.km].map(q).join(', ')}, true, ${q(citySource(c))})`).join(',\n') + ';',
    '',
    'insert into public.coops (city_key, name, phone, features, phone_verified, is_demo) values',
    Object.entries(COOPS).flatMap(([k, list]) => list.map(c =>
      `  (${q(k)}, ${q(c.n)}, ${q(c.tel)}, array[${c.f.map(q).join(', ')}]::text[], ${c.v === true}, true)`)).join(',\n') + ';',
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
    '-- Attese DEMO per lo storico (IMP-07, parte 2): stessa logica di seedWaits in src/lib/seed.js, generate qui in SQL',
    '-- perché i giorni festivi e le date (Natale, Ferragosto) devono corrispondere alla data di caricamento.',
    '-- Ogni giorno da 2 a 730 giorni fa: 1 segnalazione per punto nei lavorativi, 2 il sabato e nei festivi, 6 in più nei picchi.',
    'select setseed(0.2026);',
    'insert into public.reports (kind, city_key, type, rating, description, lat, lng, wait_min, place_name, waited_at, verified, status, is_demo, created_at)',
    'with places (city, lat, lng, place) as (values',
    DEMO_WAIT_PLACES.map(p => `    (${q(p.city)}, ${p.lat}, ${p.lng}, ${q(p.place)})`).join(',\n') + '),',
    `hours (h, wt) as (select h - 1, wt from unnest(array[${DEMO_WAIT_HOURS.join(', ')}]) with ordinality as w (wt, h)),`,
    'cum as (select h, sum(wt) over (order by h) as c, sum(wt) over () as t from hours),',
    "days as (select d, dt, private.day_type(dt) as ty, to_char(dt, 'MM-DD') in ('12-24', '12-25', '12-26', '12-31', '01-01', '08-15') as pk",
    "  from generate_series(2, 730) d, lateral (select (now() at time zone 'Europe/Rome')::date - d as dt) x),",
    'draws as (select p.*, days.*, random() as r1, random() as r2, random() as r3, random() as r4',
    "  from days cross join places p cross join lateral generate_series(1, case when days.ty = 'lavorativo' then 1 else 2 end + case when days.pk then 6 else 0 end) i),",
    'picked as (select draws.*, (select cum.h from cum where cum.c > draws.r1*cum.t order by cum.h limit 1) as hr from draws),',
    'waits as (select picked.*, round(case when hr between 7 and 9 or hr between 17 and 20 then 18 when hr >= 22 or hr <= 5 then 12 else 8 end',
    "    * case when ty = 'lavorativo' then 1 else 1.4 end * case when pk then 2.2 else 1 end * (0.6 + r3*0.8))::int as w,",
    "    (dt + make_interval(hours => hr::int, mins => floor(r2*60)::int)) at time zone 'Europe/Rome' as ts from picked)",
    "select 'segnalazione', city, 'attesa', case when w < 10 then 4 + round(r4) when w < 20 then 3 else 1 + round(r4) end,",
    "  case when w < 10 then 'Taxi disponibili, attesa breve.' else 'Coda lunga al posteggio, pochi taxi disponibili.' end,",
    "  lat, lng, w, place, ts, true, 'pubblicata', true, ts from waits;",
    '',
  ];
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(SEED_PATH, buildSeedSql());
  const reports = seedReports(0);
  console.log(`seed.sql: ${Object.keys(CITIES).length} città, ${Object.values(COOPS).flat().length} cooperative, ${reports.length} segnalazioni DEMO`);
}
