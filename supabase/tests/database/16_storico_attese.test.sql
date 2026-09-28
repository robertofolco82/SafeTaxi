-- Test pgTAP di IMP-07 (parte 2): calendario italiano, profilo delle attese per fascia oraria, stessa data negli anni.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.cities (key, name, lat, lng) values ('att_a', 'Attese A', 42, 12);
-- Natale 2025 (festivo), ore 18 italiane: 5 verificate e pubblicate, più una non verificata e una in moderazione (escluse).
insert into public.reports (kind, city_key, type, rating, description, lat, lng, wait_min, waited_at, verified, status, place_name)
select 'segnalazione', 'att_a', 'attesa', 2, 'Coda lunga al posteggio dei taxi.', 42, 12, w, '2025-12-25 18:10:00+01', v, s::public.report_status, 'Uscita nord'
from (values (30, true, 'pubblicata'), (40, true, 'pubblicata'), (50, true, 'pubblicata'), (60, true, 'pubblicata'), (70, true, 'pubblicata'),
             (500, false, 'pubblicata'), (500, true, 'in_moderazione')) v (w, v, s);
-- Lunedì 22/12/2025 ore 8 (lavorativo): 4 nello stesso punto, 5 in un altro punto della città.
insert into public.reports (kind, city_key, type, rating, description, lat, lng, wait_min, waited_at, verified, status)
select 'segnalazione', 'att_a', 'attesa', 3, 'Attesa media al posteggio.', lat, lng, 10, '2025-12-22 08:30:00+01', true, 'pubblicata'
from (values (42, 12), (42, 12), (42, 12), (42, 12), (42.1, 12.1), (42.1, 12.1), (42.1, 12.1), (42.1, 12.1), (42.1, 12.1)) v (lat, lng);
-- Martedì 1/7/2025 alle 00:30 ora legale (22:30 UTC del giorno prima): fascia 0 nell'ora italiana.
insert into public.reports (kind, city_key, type, rating, description, lat, lng, wait_min, waited_at, verified, status)
select 'segnalazione', 'att_a', 'attesa', 4, 'OK', 42.2, 12.2, 5, '2025-07-01 00:30:00+02', true, 'pubblicata' from generate_series(1, 5);

select is(private.easter_sunday(2027), '2027-03-28'::date, 'Pasqua 2027');
select is(private.holiday_name('2027-03-29'), 'Lunedì dell''Angelo', 'Lunedì dell''Angelo 2027');
select is(private.holiday_name('2026-10-04'), 'San Francesco', 'San Francesco festa nazionale dal 2026 (L. 151/2025)');
select is(private.holiday_name('2025-10-04'), null, 'prima del 2026 il 4 ottobre non è festivo');
select is(private.day_type('2026-12-26'), 'festivo', 'Santo Stefano di sabato: festivo');
select is(private.day_type('2026-12-19'), 'sabato', 'sabato non festivo');
select is(private.day_type('2026-12-28'), 'lavorativo', 'lunedì non festivo');

set local role anon;
select is((select count(*)::int from public.get_wait_profile('att_a', 'festivo', p_now => '2026-12-30 12:00+01')), 12, 'dodici fasce di 2 ore');
select is((select row(n, avg_min) from public.get_wait_profile('att_a', 'festivo', p_now => '2026-12-30 12:00+01') where slot = 9),
  row(5, 50), 'Natale ore 18–20: solo verificate e pubblicate, media delle attese');
select is((select row(n, avg_min) from public.get_wait_profile('att_a', 'lavorativo', p_now => '2026-12-30 12:00+01') where slot = 4),
  row(9, 10), 'città intera: tutti i punti');
select is((select row(n, avg_min) from public.get_wait_profile('att_a', 'lavorativo', 42, 12, '2026-12-30 12:00+01') where slot = 4),
  row(4, null::int), 'punto: sotto le 5 segnalazioni la media non si mostra');
select is((select n from public.get_wait_profile('att_a', 'lavorativo', 42.2, 12.2, '2026-12-30 12:00+01') where slot = 0), 5,
  'fascia nell''ora italiana, anche con l''ora legale');
select is((select n from public.get_wait_profile('att_a', 'festivo', p_now => '2028-01-01 12:00+01') where slot = 9), 0,
  'profilo sugli ultimi 24 mesi');
select is((select row(year, n, avg_min, max_min) from public.get_wait_same_date('att_a', '2026-12-25', p_now => '2026-12-20 12:00+01')),
  row(2025, 5, 50, 70), 'stessa data negli anni precedenti');
select is((select string_agg(n || ':' || coalesce(place_name, '-'), ' ' order by n desc) from public.get_wait_places('att_a', '2026-12-30 12:00+01')),
  '9:Uscita nord 5:- 5:-', 'punti con almeno 5 segnalazioni, con il nome più usato');
reset role;

select ok(not has_function_privilege('anon', 'private.wait_history(text, numeric, numeric)', 'execute'),
  'lo storico grezzo non è accessibile ai client');

select * from finish();
rollback;
