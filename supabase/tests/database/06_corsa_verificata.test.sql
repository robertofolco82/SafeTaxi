-- Test pgTAP del blocco 2e: bollino "corsa verificata".
-- Dentro una transazione now() non cambia: il tempo che passa tra una posizione e l'altra si simula spostando
-- indietro last_ping_at / started_at come superutente.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('a1111111-1111-4111-8111-111111111111', 'corsa@example.com', now(), false),
  ('a2222222-2222-4222-8222-222222222222', null, null, true),
  ('a3333333-3333-4333-8333-333333333333', 'altro@example.com', now(), false);
insert into public.cities (key, name, lat, lng) values ('citta_corsa', 'Città Corsa', 41.9, 12.5);

-- Funzione di comodo del test (da superutente): "passano" p_seconds secondi sulla corsa.
create function pg_temp.wait(p_ride uuid, p_seconds integer) returns void language sql as $$
  update public.rides set last_ping_at = last_ping_at - make_interval(secs => p_seconds),
    started_at = started_at - make_interval(secs => p_seconds) where id = p_ride;
$$;

-- ---------------------------------------------------------------------
-- Avvio: solo utenti con email confermata
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok($$ select public.start_ride() $$, '42501', null, 'un utente anonimo non registra corse');
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('test.r1', public.start_ride('ab 123 cd')::text, true);
select ok(current_setting('test.r1') <> '', 'un utente verificato avvia la corsa');
select throws_ok($$ select * from public.rides $$, '42501', null, 'nessuno legge direttamente le corse');

-- Posizioni: la prima vale, una seconda subito dopo è ignorata.
select is(public.ride_ping(current_setting('test.r1')::uuid, 41.9000, 12.5000), true, 'la prima posizione è registrata');
select is(public.ride_ping(current_setting('test.r1')::uuid, 41.9001, 12.5000), false, 'posizioni a meno di 5 secondi vengono ignorate');
select set_config('request.jwt.claims', '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select throws_ok(format('select public.ride_ping(%L, 41.9, 12.5)', current_setting('test.r1')), 'P0002', null,
  'un altro utente non invia posizioni sulla corsa');
select throws_ok(format('select public.end_ride(%L)', current_setting('test.r1')), 'P0002', null,
  'un altro utente non chiude la corsa');
reset role;

select pg_temp.wait(current_setting('test.r1')::uuid, 30);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.ride_ping(current_setting('test.r1')::uuid, 41.9027, 12.5000);
reset role;
select pg_temp.wait(current_setting('test.r1')::uuid, 30);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.ride_ping(current_setting('test.r1')::uuid, 41.9054, 12.5000);
reset role;

select ok((select distance_m between 580 and 620 from public.rides where id = current_setting('test.r1')::uuid),
  'il server somma i km tra le posizioni');
select is((select pings from public.rides where id = current_setting('test.r1')::uuid), 3, 'conta solo le posizioni accettate');
update public.rides set started_at = now() - interval '10 minutes' where id = current_setting('test.r1')::uuid;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is(public.end_ride(current_setting('test.r1')::uuid)->>'verified', 'true', 'corsa di 10 minuti e 600 m: vale il bollino');
reset role;
select is((select array[last_lat, last_lng] from public.rides where id = current_setting('test.r1')::uuid), array[null, null]::double precision[],
  'a fine corsa l''ultima posizione viene cancellata');

-- ---------------------------------------------------------------------
-- Collegamento con la valutazione di fine corsa
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('test.rep1', public.submit_ride_rating('citta_corsa', 5, 5, 'positiva', null, 'AB123CD', null, 10, null, null,
  current_setting('test.r1')::uuid)::text, true);
select set_config('test.rep2', public.submit_ride_rating('citta_corsa', 4, 4, 'positiva', null, 'AB123CD', null, 10, null, null,
  current_setting('test.r1')::uuid)::text, true);
reset role;
select is((select ride_verified from public.reports where id = current_setting('test.rep1')::uuid), true,
  'la valutazione collegata a una corsa valida ha il bollino');
select is((select report_id from public.rides where id = current_setting('test.r1')::uuid), current_setting('test.rep1')::uuid,
  'la corsa resta legata a quella valutazione');
select is((select ride_verified from public.reports where id = current_setting('test.rep2')::uuid), false,
  'una corsa vale per una sola segnalazione');
update public.reports set status = 'pubblicata' where id = current_setting('test.rep1')::uuid;
set local role anon;
select is((select ride_verified from public.reports where id = current_setting('test.rep1')::uuid), true,
  'il bollino è visibile a tutti');
reset role;

-- ---------------------------------------------------------------------
-- Casi senza bollino
-- ---------------------------------------------------------------------
-- Corsa troppo breve (3 posizioni subito, pochi metri).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('test.r2', public.start_ride()::text, true);
select public.ride_ping(current_setting('test.r2')::uuid, 41.9, 12.5);
select is(public.end_ride(current_setting('test.r2')::uuid)->>'verified', 'false', 'corsa brevissima: niente bollino');
select set_config('test.rep3', public.submit_report('citta_corsa', 'tariffa', 2, 'Tariffa più alta del previsto, test.', 'Mario Rossi',
  'CC111CC', '10', null, null, null, null, null, null, current_setting('test.r2')::uuid)::text, true);
reset role;
select is((select ride_verified from public.reports where id = current_setting('test.rep3')::uuid), false,
  'una segnalazione legata a una corsa non valida non ha il bollino');

-- Salto impossibile: 10 km in 30 secondi.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('test.r3', public.start_ride()::text, true);
select public.ride_ping(current_setting('test.r3')::uuid, 41.90, 12.50);
reset role;
select pg_temp.wait(current_setting('test.r3')::uuid, 30);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.ride_ping(current_setting('test.r3')::uuid, 41.99, 12.50);
reset role;
select is((select implausible from public.rides where id = current_setting('test.r3')::uuid), true,
  'una velocità oltre 200 km/h rende la corsa non valida');

-- Corsa valida ma con targa diversa, e corsa valida ma conclusa da più di 24 ore.
insert into public.rides (id, owner_id, plate, started_at, ended_at, distance_m, pings) values
  ('b0000000-0000-4000-8000-000000000001', 'a1111111-1111-4111-8111-111111111111', 'DD222DD', now() - interval '20 minutes', now() - interval '5 minutes', 3000, 10),
  ('b0000000-0000-4000-8000-000000000002', 'a1111111-1111-4111-8111-111111111111', null, now() - interval '26 hours', now() - interval '25 hours', 3000, 10),
  ('b0000000-0000-4000-8000-000000000003', 'a3333333-3333-4333-8333-333333333333', null, now() - interval '20 minutes', now() - interval '5 minutes', 3000, 10),
  ('b0000000-0000-4000-8000-000000000004', 'a1111111-1111-4111-8111-111111111111', null, now() - interval '8 days', now() - interval '8 days', 3000, 10);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('test.rep4', public.submit_report('citta_corsa', 'percorso', 2, 'Percorso allungato senza motivo, test.', 'Mario Rossi',
  'EE333EE', '11', null, null, null, null, null, null, 'b0000000-0000-4000-8000-000000000001')::text, true);
select set_config('test.rep5', public.submit_report('citta_corsa', 'percorso', 2, 'Percorso allungato senza motivo, test.', 'Mario Rossi',
  'FF444FF', '12', null, null, null, null, null, null, 'b0000000-0000-4000-8000-000000000002')::text, true);
select set_config('test.rep6', public.submit_report('citta_corsa', 'percorso', 2, 'Percorso allungato senza motivo, test.', 'Mario Rossi',
  'GG555GG', '13', null, null, null, null, null, null, 'b0000000-0000-4000-8000-000000000003')::text, true);
reset role;
select is((select ride_verified from public.reports where id = current_setting('test.rep4')::uuid), false,
  'targa della corsa diversa da quella segnalata: niente bollino');
select is((select ride_verified from public.reports where id = current_setting('test.rep5')::uuid), false,
  'corsa conclusa da più di 24 ore: niente bollino');
select is((select ride_verified from public.reports where id = current_setting('test.rep6')::uuid), false,
  'la corsa di un altro utente non vale');

-- Una sola corsa aperta per utente; le corse più vecchie di 7 giorni si cancellano.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('test.r4', public.start_ride()::text, true);
select set_config('test.r5', public.start_ride()::text, true);
reset role;
select is((select count(*)::int from public.rides where owner_id = 'a1111111-1111-4111-8111-111111111111' and ended_at is null), 1,
  'resta aperta una sola corsa per utente');
select is((select count(*)::int from public.rides where id = 'b0000000-0000-4000-8000-000000000004'), 0,
  'le corse più vecchie di 7 giorni vengono cancellate');

-- Senza corsa, l'invio funziona come prima.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok($$ select public.submit_report('citta_corsa', 'positiva', 5, 'Autista gentile e puntuale, test.', 'Mario Rossi', 'HH666HH', '14') $$,
  'la segnalazione senza corsa resta possibile');
reset role;

select * from finish();
rollback;
