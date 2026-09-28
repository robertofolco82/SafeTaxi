-- Test pgTAP di IMP-07 (parte 1): segnalazione di attesa/coda senza targa né licenza.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('a7111111-1111-4111-8111-111111111111', 'attesa@example.com', now(), false),
  ('a7222222-2222-4222-8222-222222222222', null, null, true);
insert into public.cities (key, name, lat, lng) values ('citta_attesa', 'Città Attesa', 41.9, 12.5);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a7111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok($$ select public.submit_wait_report('citta_attesa', 2, 'Coda lunghissima al parcheggio dei taxi.', 'Mario Rossi', 40, null, null) $$,
  '22023', 'Indica il luogo dell''attesa (posizione in Italia)', 'il luogo è obbligatorio');
select throws_ok($$ select public.submit_wait_report('citta_attesa', 2, 'Coda lunghissima al parcheggio dei taxi.', 'Mario Rossi', 999, 41.9, 12.5) $$,
  '22023', 'Indica i minuti di attesa (da 0 a 600)', 'minuti di attesa entro i limiti');
select throws_ok($$ select public.submit_wait_report('citta_attesa', 2, 'Coda lunghissima al parcheggio dei taxi.', 'Mario Rossi', 40, 41.9, 12.5,
  null, now() - interval '2 days') $$, '22023', 'L''orario dell''attesa deve essere nelle ultime 24 ore', 'orario entro 24 ore');
select throws_ok($$ select public.submit_wait_report('citta_attesa', 2, 'Coda', 'Mario Rossi', 40, 41.9, 12.5) $$,
  '22023', null, 'con 1–3 stelle serve la descrizione (IMP-01)');
select set_config('test.w', public.submit_wait_report('citta_attesa', 2, 'Coda lunghissima al parcheggio dei taxi, nessuna auto.',
  'Mario Rossi', 40, 41.90123, 12.50123, 'Uscita via Marsala', now() - interval '10 minutes')::text, true);
select throws_ok($$ select public.submit_wait_report('citta_attesa', 5, 'OK', 'Mario Rossi', 5, 41.9, 12.5) $$,
  'P0001', 'Hai già segnalato un''attesa negli ultimi 15 minuti', 'una segnalazione di attesa ogni 15 minuti');
reset role;

select is((select type::text from public.reports where id = current_setting('test.w')::uuid), 'attesa', 'tipo attesa');
select is((select status::text from public.reports where id = current_setting('test.w')::uuid), 'pubblicata',
  'account verificato senza espressioni da verificare: pubblicata subito');
select ok((select plate is null and license is null and reporter_name = 'Mario Rossi' from private.reports_private
  where report_id = current_setting('test.w')::uuid), 'senza targa né licenza, nome riservato');

set local role anon;
select is((select wait_min from public.feed_reports(p_city => 'citta_attesa')), 40, 'il feed mostra i minuti di attesa');
select is((select lat_approx from public.reports where id = current_setting('test.w')::uuid), 41.901, 'posizione pubblica arrotondata');
select is((select count(*)::int from public.feed_reports(p_query => 'marsala') where city_key = 'citta_attesa'), 1,
  'si trova cercando il nome del punto');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a7222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select set_config('test.g', public.submit_wait_report('citta_attesa', 1,
  'Attesa di un'' ora senza taxi in arrivo.', 'Ospite Prova', 60, 41.9, 12.5)::text, true);
reset role;
select is((select status::text from public.reports where id = current_setting('test.g')::uuid), 'in_moderazione',
  'ospite: passa prima dal moderatore');

select * from finish();
rollback;
