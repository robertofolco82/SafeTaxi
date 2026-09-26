-- Test pgTAP del punto 3: condivisione della corsa con link temporaneo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('e1111111-1111-4111-8111-111111111111', null, null, true),
  ('e2222222-2222-4222-8222-222222222222', null, null, true);

-- ---------------------------------------------------------------------
-- Avvio e aggiornamenti dal proprietario
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}', true);
select set_config('test.share', public.start_ride_share(3, 'ab 123 cd')::text, true);
select ok(length(current_setting('test.share')::jsonb->>'token') = 32, 'il link contiene un token casuale di 192 bit');
select ok((current_setting('test.share')::jsonb->>'expires_at')::timestamptz between now() + interval '179 minutes' and now() + interval '181 minutes',
  'la condivisione scade dopo 3 ore');
select is(public.update_ride_share((current_setting('test.share')::jsonb->>'id')::uuid, 41.9, 12.5, 'Via del Corso, Roma'), true,
  'il proprietario invia la posizione');
select is(public.update_ride_share((current_setting('test.share')::jsonb->>'id')::uuid, 41.91, 12.51, 'Via del Corso, Roma'), false,
  'posizioni troppo ravvicinate (meno di 4 secondi) vengono ignorate');
select throws_ok($$ select * from public.ride_share_points $$, '42501', null, 'nessuno legge direttamente le posizioni');
reset role;
select is((select count(*)::int from public.ride_shares where token_hash = current_setting('test.share')::jsonb->>'token'), 0,
  'il token non è salvato in chiaro nel database');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":true}', true);
select throws_ok(format('select public.update_ride_share(%L, 45.0, 9.0)', current_setting('test.share')::jsonb->>'id'), 'P0002', null,
  'un altro utente non può inviare posizioni sulla condivisione');
select lives_ok(format('select public.end_ride_share(%L)', current_setting('test.share')::jsonb->>'id'),
  'un altro utente che prova a chiuderla non ottiene nulla');
reset role;

-- ---------------------------------------------------------------------
-- Chi ha il link (senza account)
-- ---------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_ride_share(current_setting('test.share')::jsonb->>'token')->>'status', 'attiva', 'con il link si vede la corsa attiva');
select is(public.get_ride_share(current_setting('test.share')::jsonb->>'token')->>'street', 'Via del Corso, Roma', 'si vede la via attuale');
select is(public.get_ride_share(current_setting('test.share')::jsonb->>'token')->'points', '[[41.9, 12.5]]'::jsonb, 'si vede il percorso');
select is(public.get_ride_share(current_setting('test.share')::jsonb->>'token')->>'plate_masked', 'AB•••CD', 'la targa del taxi è mascherata');
select is(public.get_ride_share('token-inventato')->>'status', 'non_trovata', 'un link inventato non mostra nulla');
select throws_ok($$ select public.start_ride_share() $$, '42501', null, 'serve un accesso (anche anonimo) per condividere');
reset role;

-- ---------------------------------------------------------------------
-- Fine corsa, nuova condivisione, scadenza
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}', true);
select public.end_ride_share((current_setting('test.share')::jsonb->>'id')::uuid);
select is(public.get_ride_share(current_setting('test.share')::jsonb->>'token') - 'ended_at', '{"status": "conclusa"}'::jsonb,
  'a corsa conclusa si vede solo lo stato, non l''ultima posizione');
reset role;
select is((select count(*)::int from public.ride_share_points where share_id = (current_setting('test.share')::jsonb->>'id')::uuid), 0,
  'alla fine della corsa le posizioni vengono cancellate');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}', true);
select set_config('test.share2', public.start_ride_share(99)::text, true);
select set_config('test.share3', public.start_ride_share(1)::text, true);
reset role;
select ok((select expires_at <= now() + interval '6 hours' from public.ride_shares where id = (current_setting('test.share2')::jsonb->>'id')::uuid),
  'la durata massima è 6 ore');
select is((select count(*)::int from public.ride_shares where owner_id = 'e1111111-1111-4111-8111-111111111111' and ended_at is null), 1,
  'resta attiva una sola condivisione per utente');

select * from finish();
rollback;
