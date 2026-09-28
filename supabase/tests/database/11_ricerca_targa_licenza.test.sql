-- Test pgTAP di IMP-02: ricerca del rating con targa, licenza o entrambe.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('e7111111-1111-4111-8111-111111111111', 'targalicenza@example.com', now(), false);
insert into public.cities (key, name, lat, lng) values ('citta_tl', 'Città Targa Licenza', 42, 12);
-- Stessa targa TL111TL: 5 segnalazioni verificate con licenza 7070, 2 con licenza 8080 (taxi con licenza diversa).
insert into public.reports (id, city_key, type, rating, description, verified, status)
  select ('e8000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'citta_tl', 'positiva', 4,
         'Segnalazione ' || i, true, 'pubblicata'
  from generate_series(1, 7) i;
insert into private.reports_private (report_id, plate, license)
  select ('e8000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'TL111TL', case when i <= 5 then '7070' else '8080' end
  from generate_series(1, 7) i;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e7111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((public.get_driver_rating(p_plate => 'tl 111 tl')->>'verified_count')::int, 7, 'solo targa: tutte le segnalazioni della targa');
select is((public.get_driver_rating(p_license => '8080')->>'verified_count')::int, 2, 'solo licenza: solo quella licenza');
select is((public.get_driver_rating(p_plate => 'TL111TL', p_license => '7070')->>'verified_count')::int, 5,
  'targa e licenza: solo le segnalazioni che corrispondono a tutte e due');
select is((public.get_driver_rating(p_plate => 'TL111TL', p_license => '8080')->>'sufficient')::boolean, false,
  'targa e licenza: sotto la soglia di 5 non si mostra nulla');
select is((public.get_driver_rating(p_plate => 'TL111TL', p_license => '7070')->'reports'->0) ? 'plate', false,
  'nessuna targa in chiaro nell''elenco');
reset role;
select is((select count(*)::int from private.lookup_log where user_id = 'e7111111-1111-4111-8111-111111111111'), 5,
  'ogni ricerca conta una volta nel limite orario, anche con due campi');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e7111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok($$ select public.get_driver_rating(p_plate => 'TL111TL', p_license => '7070') $$, 'P0001', null,
  'il limite di 5 ricerche all''ora resta');
reset role;

select * from finish();
rollback;
