-- Test pgTAP della ricerca per targa o licenza: segnalazioni del taxi e limite di 5 ricerche all'ora.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('e5111111-1111-4111-8111-111111111111', 'cerca@example.com', now(), false),
  ('e5222222-2222-4222-8222-222222222222', null, null, true);
insert into public.cities (key, name, lat, lng) values ('citta_ricerca', 'Città Ricerca', 42, 12);
-- 5 segnalazioni verificate pubblicate, 1 anonima pubblicata e 1 in revisione per la stessa targa.
insert into public.reports (id, city_key, type, rating, description, verified, status, meter_eur, cost_eur, created_at)
  select ('e6000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'citta_ricerca',
         case when i = 1 then 'tariffa' else 'positiva' end::public.report_type, 4,
         'Racconto numero ' || i, i <= 6 and i <> 6, case when i = 7 then 'in_moderazione' else 'pubblicata' end::public.report_status,
         case when i = 1 then 24 end, case when i = 1 then 50 end, now() - make_interval(hours => i)
  from generate_series(1, 7) i;
insert into private.reports_private (report_id, plate, license)
  select ('e6000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'RT123RT', '9191' from generate_series(1, 7) i;
insert into public.driver_replies (report_id, body, status)
  values ('e6000000-0000-4000-8000-000000000001', 'Replica pubblicata del tassista alla segnalazione.', 'pubblicata');

set local role anon;
select throws_ok($$ select public.get_driver_rating(p_plate => 'RT123RT') $$, '42501', null, 'senza accesso (anche anonimo) non si cerca');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.0.0.1"}', true);
select set_config('test.r', public.get_driver_rating(p_plate => 'rt 123 rt')::text, true);
select is((current_setting('test.r')::jsonb->>'verified_count')::int, 5, 'il rating conta solo le segnalazioni verificate');
select is(jsonb_array_length(current_setting('test.r')::jsonb->'reports'), 6,
  'si vedono le segnalazioni pubblicate del taxi, anche anonime, non quelle in revisione');
select is(current_setting('test.r')::jsonb->'reports'->0->>'description', 'Racconto numero 1', 'dalla più recente');
select is(current_setting('test.r')::jsonb->'reports'->0->'replies', '["Replica pubblicata del tassista alla segnalazione."]'::jsonb,
  'con le repliche pubblicate del tassista');
select is(current_setting('test.r')::jsonb->'reports'->0->>'meter_eur', '24.00', 'con gli importi');
select ok(not (current_setting('test.r')::jsonb->'reports'->0 ? 'plate'), 'senza targa né licenza in chiaro');
select is((public.get_driver_rating(p_license => '9191')->>'sufficient')::boolean, true, 'si cerca anche per licenza');
select is((public.get_driver_rating(p_plate => 'ZZ000ZZ')->>'sufficient')::boolean, false, 'sotto la soglia non si mostra nulla');
select lives_ok($$ select public.get_driver_rating(p_plate => 'RT123RT') $$, 'quarta ricerca dell''ora');
select lives_ok($$ select public.get_driver_rating(p_plate => 'RT123RT') $$, 'quinta ricerca dell''ora');
select throws_ok($$ select public.get_driver_rating(p_plate => 'RT123RT') $$, 'P0001', null, 'la sesta ricerca nell''ora è bloccata');
reset role;
select is((select count(*)::int from private.lookup_log where user_id = 'e5111111-1111-4111-8111-111111111111'
                 and ip_hash is not null and ip_hash !~ '203\.0\.113'), 5,
  'dell''indirizzo si salva solo un''impronta, mai l''indirizzo');

select * from finish();
rollback;
