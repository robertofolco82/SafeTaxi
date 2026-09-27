-- Test pgTAP del blocco 2a: si eseguono con `npm run test:db` (database locale Supabase).
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- ---------------------------------------------------------------------
-- Utenti di prova: verificato, anonimo, email non confermata, moderatore
-- ---------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, is_anonymous, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'verificato@example.com', now(), false, '{"full_name":"Utente Verificato"}'),
  ('22222222-2222-4222-8222-222222222222', null, null, true, '{}'),
  ('33333333-3333-4333-8333-333333333333', 'nonconfermato@example.com', null, false, '{}'),
  ('44444444-4444-4444-8444-444444444444', 'moderatore@example.com', now(), false, '{}');
update public.profiles set role = 'moderatore' where id = '44444444-4444-4444-8444-444444444444';

insert into public.cities (key, name, lat, lng, is_demo) values ('citta_test', 'Città Test', 42, 12, true);

select is((select count(*)::int from public.profiles where id in ('11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222')), 2, 'il trigger crea il profilo per ogni nuovo utente');
select is((select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Utente Verificato', 'il nome visualizzato arriva dai metadati');

-- ---------------------------------------------------------------------
-- RLS attiva su tutte le tabelle
-- ---------------------------------------------------------------------
select is((select count(*)::int from pg_tables where schemaname in ('public', 'private') and not rowsecurity), 0,
  'RLS attiva su tutte le tabelle');

-- ---------------------------------------------------------------------
-- Visitatore non autenticato (anon)
-- ---------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from private.reports_private $$, '42501', null, 'anon non legge i dati personali');
select throws_ok($$ select lat, lng from public.reports $$, '42501', null, 'anon non legge le coordinate esatte');
select throws_ok($$ select author_id from public.reports $$, '42501', null, 'anon non vede chi ha scritto la segnalazione');
select lives_ok($$ select id, lat_approx, plate_masked from public.reports $$, 'anon legge le colonne pubbliche');
select throws_ok($$ select public.submit_report('citta_test', 'tariffa', 2, 'Descrizione lunga almeno venti caratteri',
  'Mario Rossi', 'AB123CD', '1234') $$, '42501', null, 'anon non può inviare segnalazioni senza accesso');
select throws_ok($$ insert into public.reports (city_key, type, rating, description) values ('citta_test', 'positiva', 5, 'x') $$,
  '42501', null, 'nessuno scrive direttamente nella tabella reports');
reset role;

-- ---------------------------------------------------------------------
-- Utente anonimo: può inviare, ma la segnalazione non è verificata
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":true}', true);
select lives_ok($$ select public.submit_report('citta_test', 'tariffa', 2, 'Importo più alto del tassametro, senza spiegazioni.',
  'Anna Bianchi', 'cd 456-ef', '7788') $$, 'l''utente anonimo può inviare una segnalazione');
select is((select count(*)::int from public.my_reports()), 1, 'l''autore vede la propria segnalazione con my_reports()');
select is((select verified from public.my_reports() limit 1), false, 'la segnalazione anonima non è verificata');
select is((select status from public.my_reports() limit 1), 'in_moderazione'::public.report_status,
  'ogni segnalazione parte in moderazione');
select is((select count(*)::int from public.reports where city_key = 'citta_test'), 0,
  'le segnalazioni in moderazione non sono pubbliche');
reset role;
select is((select plate_masked from public.reports where city_key = 'citta_test'), 'CD•••EF',
  'la targa viene normalizzata e mascherata');

-- ---------------------------------------------------------------------
-- Utente verificato: validazioni e limiti anti-fake
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok($$ select public.submit_report('citta_test', 'tariffa', 2, 'Troppo corta', 'Mario Rossi', 'AB123CD', '1234') $$,
  '22023', 'Descrizione di almeno 20 caratteri', 'descrizione minima di 20 caratteri');
select throws_ok($$ select public.submit_report('citta_test', 'tariffa', 2, 'Descrizione lunga almeno venti caratteri',
  'Mario Rossi', 'XYZ', '1234') $$, '22023', 'Targa non valida (formato AB123CD)', 'formato targa controllato');
select throws_ok($$ select public.submit_report('citta_test', 'tariffa', 2, 'Descrizione lunga almeno venti caratteri',
  'Mario Rossi', 'AB123CD', ' ') $$, '22023', 'Licenza obbligatoria', 'licenza obbligatoria');
select lives_ok($$ select public.submit_report('citta_test', 'percorso', 2, 'Percorso molto più lungo del navigatore.',
  'Mario Rossi', 'AB123CD', '1234') $$, 'segnalazione valida accettata');
select is((select verified from public.my_reports() limit 1), true, 'la segnalazione di un utente con email confermata è verificata');
select throws_ok($$ select public.submit_report('citta_test', 'tariffa', 1, 'Seconda segnalazione sulla stessa targa.',
  'Mario Rossi', 'AB123CD', '1234') $$, 'P0001', 'Hai già segnalato questa targa negli ultimi 30 giorni',
  'una sola segnalazione per targa ogni 30 giorni');
select lives_ok($$ select public.submit_ride_rating('citta_test', 5, 4, 'positiva', null, 'GH789JK') $$,
  'valutazione di fine corsa accettata');
select throws_ok($$ update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'un utente non può darsi il ruolo di moderatore o admin');
select throws_ok($$ select public.moderate_report((select id from public.my_reports() limit 1), 'pubblicata') $$,
  '42501', 'Solo i moderatori possono moderare', 'solo i moderatori pubblicano');
reset role;

-- Utente con email non confermata: segnalazione non verificata
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select public.submit_report('citta_test', 'positiva', 5, 'Autista gentile e corsa puntuale, tutto regolare.',
  'Luca Verdi', 'LM321NP', '5555');
select is((select verified from public.my_reports() limit 1), false, 'email non confermata: segnalazione non verificata');
reset role;

-- ---------------------------------------------------------------------
-- Moderazione e punti (stessi punti per positive e negative)
-- ---------------------------------------------------------------------
-- Id della segnalazione negativa dell'utente verificato, letto con privilegi pieni.
select set_config('test.report_id', (select r.id::text from public.reports r join private.reports_private p on p.report_id = r.id
  where p.plate = 'AB123CD' and r.city_key = 'citta_test'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
select throws_ok($$ select public.moderate_report(current_setting('test.report_id')::uuid, 'rifiutata') $$,
  '22023', 'Indica il motivo del rifiuto', 'il rifiuto richiede un motivo');
select lives_ok($$ select public.moderate_report(current_setting('test.report_id')::uuid, 'pubblicata') $$,
  'il moderatore pubblica con moderate_report');
reset role;
select is((select moderated_by from public.reports where id = current_setting('test.report_id')::uuid),
  '44444444-4444-4444-8444-444444444444'::uuid, 'la moderazione registra chi ha deciso');
-- Le altre si pubblicano come dal pannello Supabase.
update public.reports set status = 'pubblicata' where city_key = 'citta_test' and status = 'in_moderazione';

select is((select coalesce(sum(delta), 0)::int from public.points_ledger where user_id = '11111111-1111-4111-8111-111111111111'),
  60, 'utente verificato: 50 punti per la segnalazione negativa + 10 per la valutazione');
select is((select coalesce(sum(delta), 0)::int from public.points_ledger where user_id = '22222222-2222-4222-8222-222222222222'),
  0, 'utente anonimo: nessun punto');
select is((select coalesce(sum(delta), 0)::int from public.points_ledger where user_id = '33333333-3333-4333-8333-333333333333'),
  0, 'email non confermata: nessun punto');
update public.reports set status = 'rifiutata' where city_key = 'citta_test';
update public.reports set status = 'pubblicata' where city_key = 'citta_test';
select is((select count(*)::int from public.points_ledger where user_id = '11111111-1111-4111-8111-111111111111'), 2,
  'ripubblicare non assegna punti due volte');

-- Stessi punti per una segnalazione positiva
insert into public.reports (id, author_id, city_key, type, rating, description, verified)
  values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'citta_test', 'positiva', 5,
          'Esperienza positiva di prova.', true);
update public.reports set status = 'pubblicata' where id = '55555555-5555-4555-8555-555555555555';
select is((select delta from public.points_ledger where report_id = '55555555-5555-4555-8555-555555555555'), 50,
  'segnalazione positiva: stessi 50 punti della negativa');

-- ---------------------------------------------------------------------
-- Rating del tassista: soglia di 5 segnalazioni verificate
-- ---------------------------------------------------------------------
insert into public.reports (id, city_key, type, rating, description, verified, status, is_demo)
  select ('66666666-6666-4666-8666-' || lpad(i::text, 12, '0'))::uuid, 'citta_test',
         case when i = 1 then 'tariffa' else 'positiva' end::public.report_type, 4, 'Test', true, 'pubblicata', true
  from generate_series(1, 4) i;
insert into private.reports_private (report_id, plate, license)
  select ('66666666-6666-4666-8666-' || lpad(i::text, 12, '0'))::uuid, 'ZZ999ZZ', '4242' from generate_series(1, 4) i;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((public.get_driver_rating('zz 999 zz') ->> 'sufficient')::boolean, false, 'con 4 segnalazioni il rating non si mostra');
reset role;
insert into public.reports (id, city_key, type, rating, description, verified, status, is_demo)
  values ('66666666-6666-4666-8666-000000000005', 'citta_test', 'positiva', 5, 'Test', true, 'pubblicata', true);
insert into private.reports_private (report_id, plate, license) values ('66666666-6666-4666-8666-000000000005', 'ZZ999ZZ', '4242');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is(public.get_driver_rating('4242') - 'issues' - 'reports',
  '{"sufficient": true, "verified_count": 5, "min_required": 5, "plate_masked": "42•••42", "avg_rating": 4.2}'::jsonb,
  'con 5 segnalazioni verificate il rating si mostra (ricerca per licenza)');
select is(public.get_driver_rating('ZZ999ZZ') -> 'issues', '{"tariffa": 1}'::jsonb, 'criticità conteggiate per tipo');
reset role;

-- ---------------------------------------------------------------------
-- Termometro: peso dimezzato ogni 90 giorni (come src/lib/indices.js)
-- ---------------------------------------------------------------------
insert into public.cities (key, name, lat, lng) values ('termo_test', 'Termometro Test', 42, 12);
insert into public.reports (city_key, type, rating, description, verified, status, created_at) values
  ('termo_test', 'positiva', 5, 'Test', true, 'pubblicata', '2026-09-26'),
  ('termo_test', 'altro', 1, 'Test', true, 'pubblicata', '2026-09-26'::timestamptz - interval '90 days'),
  ('termo_test', 'altro', 1, 'Test', false, 'pubblicata', '2026-09-26');
select is((select idx from public.get_thermometer('termo_test', '2026-09-26')), 67,
  'Termometro: (100×1 + 0×0,5) / 1,5 = 67, le non verificate non contano');

select * from finish();
rollback;
