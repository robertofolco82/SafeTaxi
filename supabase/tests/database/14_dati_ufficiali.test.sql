-- Test pgTAP di IMP-06: dati ufficiali leggibili da tutti, modificabili solo dalle migrazioni.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

set local role anon;
select is((select value from public.official_figures where city_key = 'roma' and metric = 'licenze_taxi'), 7701::numeric,
  'licenze di Roma (ART 2024) leggibili senza accesso');
select is((select count(*)::int from public.official_figures where source_url !~ '^https://'), 0, 'ogni dato ha il link alla fonte');
select throws_ok($$ insert into public.official_figures (city_key, metric, value, unit, source_name, source_url, reference_year, published_on, rule)
  values ('roma', 'corsa_standard', 1, '€', 'x', 'https://x.it', 2026, '2026-01-01', 'in_vigore') $$, '42501', null, 'i client non possono scrivere');
reset role;
set local role authenticated;
select throws_ok($$ update public.official_figures set value = 1 $$, '42501', null, 'nemmeno gli utenti registrati');
reset role;
select throws_ok($$ insert into public.official_figures (city_key, metric, value, unit, source_name, source_url, reference_year, published_on, rule)
  values ('roma', 'fabbisogno', 1, 'x', 'x', 'https://x.it', 2026, '2026-01-01', 'periodico') $$, '23514', null, 'solo le metriche previste');

select * from finish();
rollback;
