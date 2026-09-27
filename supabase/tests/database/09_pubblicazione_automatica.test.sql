-- Test pgTAP della pubblicazione automatica (decisione del 27/09/2026): controlli sul testo, pubblicazione
-- immediata per gli account verificati, revisione per ospiti e testi segnalati, controllo dopo la pubblicazione.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('b1111111-1111-4111-8111-111111111111', 'verificato.auto@example.com', now(), false),
  ('b2222222-2222-4222-8222-222222222222', null, null, true),
  ('b3333333-3333-4333-8333-333333333333', 'mod.auto@example.com', now(), false);
update public.profiles set role = 'moderatore' where id = 'b3333333-3333-4333-8333-333333333333';
insert into public.cities (key, name, lat, lng) values ('citta_auto', 'Città Auto', 42, 12);

-- ---------------------------------------------------------------------
-- Controlli sul testo (stessi casi di tests/unit/textcheck.test.js)
-- ---------------------------------------------------------------------
select is(private.text_flags('Il tassametro segnava 24 euro, me ne ha chiesti 50 e ha rifiutato la ricevuta.'), '{}'::text[],
  'un fatto descritto, anche grave, non viene segnalato');
select is(private.text_flags('Mi ha molestata verbalmente durante la corsa e ha guidato a 130 all''ora.'), '{}'::text[],
  'raccontare un possibile reato come fatto non è un problema');
select is(private.text_flags('Questo tassista è un truffatore'), array['etichetta_reato'], 'etichetta di reato');
select is(private.text_flags('Sono dei LADRI'), array['etichetta_reato'], 'etichetta anche in maiuscolo');
select is(private.text_flags('Un vero stronzo'), array['insulto'], 'insulto');
select is(private.text_flags('Chiamatelo al 333 123 4567'), array['dati_personali'], 'numero di cellulare');
select is(private.text_flags('Scrivetegli a mario.rossi@example.com'), array['dati_personali'], 'email');
select is(private.text_flags('Il tassista si chiama Giuseppe'), array['dati_personali'], 'nome proprio');
select is(private.text_flags('Ladro e bastardo'), array['etichetta_reato', 'insulto'], 'più problemi insieme');
select is(private.text_flags('Ha fatto una deviazione di 3 km sulla tangenziale alle 23:40'), '{}'::text[],
  'numeri di orari e distanze non sono dati personali');
select is(private.text_flags('Ha preso la strada per Porcari e poi per Ladispoli'), '{}'::text[], 'nomi di luoghi con le stesse radici: nessun segnale');
select is(private.text_flags('Mi ha lasciato in piazza Negroni'), '{}'::text[], 'nome di piazza: nessun segnale');

-- ---------------------------------------------------------------------
-- Pubblicazione
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('test.ok', public.submit_report('citta_auto', 'tariffa', 2,
  'Il tassametro segnava 24 euro, me ne ha chiesti 50.', 'Mario Rossi', 'AA111AA', '1', p_meter => 24, p_cost => 50)::text, true);
select set_config('test.flag', public.submit_report('citta_auto', 'tariffa', 1,
  'Il tassista è un truffatore, mi ha chiesto il doppio.', 'Mario Rossi', 'BB222BB', '2')::text, true);
select set_config('test.rate', public.submit_ride_rating('citta_auto', 5, 5, 'positiva', 'Autista gentile e puntuale.')::text, true);
reset role;
select is((select status::text from public.reports where id = current_setting('test.ok')::uuid), 'pubblicata',
  'account verificato e testo corretto: pubblicata subito');
select is((select array[meter_eur, cost_eur] from public.reports where id = current_setting('test.ok')::uuid), array[24, 50]::numeric[],
  'si salvano importo del tassametro e importo pagato');
select is((select sum(delta)::int from public.points_ledger where report_id = current_setting('test.ok')::uuid), 50,
  'i punti arrivano alla pubblicazione immediata');
select is((select array[status::text, array_to_string(auto_flags, ',')] from public.reports where id = current_setting('test.flag')::uuid),
  array['in_moderazione', 'etichetta_reato'], 'un testo con un''etichetta di reato va in revisione, con il motivo');
select is((select status::text from public.reports where id = current_setting('test.rate')::uuid), 'pubblicata',
  'anche la valutazione di fine corsa si pubblica subito');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":true}', true);
select set_config('test.guest', public.submit_report('citta_auto', 'percorso', 2,
  'Percorso allungato di due chilometri senza motivo.', 'Anna Bianchi', 'CC333CC', '3')::text, true);
reset role;
select is((select status::text from public.reports where id = current_setting('test.guest')::uuid), 'in_moderazione',
  'gli ospiti passano sempre dalla revisione');

-- Allegato aggiunto dopo la pubblicazione: +20 punti.
insert into public.attachments (report_id, kind, storage_path, mime_type, size_bytes)
values (current_setting('test.ok')::uuid, 'audio', current_setting('test.ok') || '/a.m4a', 'audio/mp4', 10);
select is((select sum(delta)::int from public.points_ledger where report_id = current_setting('test.ok')::uuid), 70,
  'l''allegato registrato dopo la pubblicazione vale +20 punti');

-- ---------------------------------------------------------------------
-- Controllo dopo la pubblicazione
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok(format('select public.remove_report(%L, %L)', current_setting('test.ok'), 'Motivazione qualsiasi.'), '42501', null,
  'solo i moderatori rimuovono');
select set_config('request.jwt.claims', '{"sub":"b3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select ok(exists (select 1 from jsonb_array_elements(public.moderation_queue()->'recent_auto') q where q->>'id' = current_setting('test.ok')),
  'le pubblicazioni automatiche sono nella coda di controllo a campione');
select is((select q->'auto_flags' from jsonb_array_elements(public.moderation_queue()->'reports') q where q->>'id' = current_setting('test.flag')),
  '["etichetta_reato"]'::jsonb, 'il moderatore vede perché la segnalazione è in revisione');
select throws_ok(format('select public.remove_report(%L, %L)', current_setting('test.ok'), 'breve'), '22023', null,
  'la rimozione va motivata');
select lives_ok(format('select public.remove_report(%L, %L)', current_setting('test.ok'), 'Importi non plausibili, autore non raggiungibile.'),
  'il moderatore rimuove una segnalazione pubblicata');
select public.moderate_report(current_setting('test.rate')::uuid, 'pubblicata');
select ok(not exists (select 1 from jsonb_array_elements(public.moderation_queue()->'recent_auto') q where q->>'id' = current_setting('test.rate')),
  'confermata dal moderatore, esce dalla coda a campione');
reset role;
select is((select array[status::text, rejection_reason] from public.reports where id = current_setting('test.ok')::uuid),
  array['rifiutata', 'Rimossa dopo verifica: Importi non plausibili, autore non raggiungibile.'], 'l''autore vede il motivo');
select is((select sum(delta)::int from public.points_ledger where report_id = current_setting('test.ok')::uuid), 0,
  'i punti della segnalazione rimossa vengono tolti');

select * from finish();
rollback;
