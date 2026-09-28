-- Test pgTAP di IMP-03: filtro del feed per città, parola chiave e tipo, sul server.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.cities (key, name, lat, lng) values ('feed_a', 'Feed A', 42, 12), ('feed_b', 'Feed B', 43, 11);
insert into public.reports (id, city_key, type, rating, description, from_place, to_place, verified, status, created_at) values
  ('f1000000-0000-4000-8000-000000000001', 'feed_a', 'tariffa', 2, 'Il tassametro segnava 24 euro, me ne ha chiesti 40.', 'Stazione', 'Centro', true, 'pubblicata', now() - interval '1 hour'),
  ('f1000000-0000-4000-8000-000000000002', 'feed_a', 'positiva', 5, 'Città pulita e autista gentilissimo.', null, 'Aeroporto', true, 'pubblicata', now() - interval '2 hours'),
  ('f1000000-0000-4000-8000-000000000003', 'feed_b', 'percorso', 2, 'Giro lungo, tassametro partito prima.', null, null, true, 'pubblicata', now() - interval '3 hours'),
  ('f1000000-0000-4000-8000-000000000004', 'feed_a', 'tariffa', 1, 'Tassametro manomesso, ancora in revisione.', null, null, true, 'in_moderazione', now());
insert into private.reports_private (report_id, plate, license) values
  ('f1000000-0000-4000-8000-000000000001', 'FF123FF', '5151');

set local role anon;
select is((select count(*)::int from public.feed_reports(p_city => 'feed_a')), 2, 'filtro città: solo le pubblicate di quella città');
select is((select count(*)::int from public.feed_reports(p_query => 'tassam') where city_key like 'feed_%'), 2,
  'parola chiave per inizio di parola, senza le segnalazioni in revisione');
select is((select count(*)::int from public.feed_reports(p_city => 'feed_a', p_query => 'tassametri')), 1, 'trova anche le varianti della parola');
select is((select count(*)::int from public.feed_reports(p_query => 'CITTA gentile')), 1, 'senza distinguere maiuscole e accenti, tutte le parole');
select is((select count(*)::int from public.feed_reports(p_query => 'aeroporto') where city_key = 'feed_a'), 1, 'cerca anche nella tratta');
select is((select count(*)::int from public.feed_reports(p_query => 'FF123FF')), 0, 'mai sulla targa');
select is((select count(*)::int from public.feed_reports(p_query => '5151')), 0, 'mai sulla licenza');
select is((select count(*)::int from public.feed_reports(p_city => 'feed_a', p_kind => 'pos')), 1, 'solo positive');
select is((select count(*)::int from public.feed_reports(p_city => 'feed_a', p_kind => 'neg')), 1, 'solo negative');
select is((select description from public.feed_reports(p_city => 'feed_a', p_before => now() - interval '90 minutes')),
  'Città pulita e autista gentilissimo.', 'pagina successiva: prima della data indicata');
select lives_ok($$ select * from public.feed_reports(p_query => 'tassametro & | ! :* ''') $$, 'la sintassi di ricerca non passa dall''utente');
select ok(not exists (select 1 from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'reports' and c.column_name = 'search_tsv'
    and has_column_privilege('anon', 'public.reports', 'search_tsv', 'select')),
  'l''indice di ricerca non è leggibile dai client');
reset role;

select * from finish();
rollback;
