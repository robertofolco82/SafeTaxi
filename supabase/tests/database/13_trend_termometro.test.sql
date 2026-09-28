-- Test pgTAP di IMP-05b: serie mensile del Termometro con la stessa regola dell'indice.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.cities (key, name, lat, lng) values ('trend_a', 'Trend A', 42, 12);
-- Agosto 2026: 5 verificate da 5 stelle. Settembre: 5 verificate da 1 stella, più 2 non verificate e 1 in revisione.
insert into public.reports (city_key, type, rating, description, verified, status, created_at)
  select 'trend_a', 'positiva', 5, 'Test', true, 'pubblicata', '2026-08-10'::timestamptz + make_interval(days => i) from generate_series(1, 5) i;
insert into public.reports (city_key, type, rating, description, verified, status, created_at)
  select 'trend_a', 'altro', 1, 'Test', true, 'pubblicata', '2026-09-10'::timestamptz + make_interval(days => i) from generate_series(1, 5) i;
insert into public.reports (city_key, type, rating, description, verified, status, created_at) values
  ('trend_a', 'altro', 1, 'Test', false, 'pubblicata', '2026-07-15'),
  ('trend_a', 'altro', 1, 'Test', false, 'pubblicata', '2026-07-16'),
  ('trend_a', 'altro', 1, 'Test', true, 'in_moderazione', '2026-09-20');

set local role anon;
select is((select count(*)::int from public.get_thermometer_trend('trend_a', 12, '2026-09-26')), 12, '12 mesi');
select is((select month from public.get_thermometer_trend('trend_a', 12, '2026-09-26') order by month desc limit 1), '2026-09-01'::date,
  'l''ultimo punto è il mese in corso');
select is((select idx from public.get_thermometer_trend('trend_a', 12, '2026-09-26') where month = '2026-08-01'), 100,
  'agosto: solo 5 stelle, indice 100 alla fine del mese');
select is((select idx from public.get_thermometer_trend('trend_a', 12, '2026-09-26') where month = '2026-09-01'),
  (select idx from public.get_thermometer('trend_a', '2026-09-26')), 'mese in corso: uguale al Termometro di adesso');
select is((select month_count from public.get_thermometer_trend('trend_a', 12, '2026-09-26') where month = '2026-09-01'), 5::bigint,
  'contano solo le verificate pubblicate');
select is((select idx from public.get_thermometer_trend('trend_a', 12, '2026-09-26') where month = '2026-07-01'), null,
  'sotto le 5 segnalazioni verificate nel mese il punto non si mostra');
select is((select count(*)::int from public.get_thermometer_trend('trend_a', 99, '2026-09-26')), 24, 'al massimo 24 mesi');
reset role;

select * from finish();
rollback;
