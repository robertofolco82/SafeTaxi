-- Test pgTAP del blocco 2d: coda di moderazione, pubblicazione delle foto e repliche dei tassisti.
-- I controlli sono limitati ai dati del test (id 40000000-... e città citta_moderazione).
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('d1111111-1111-4111-8111-111111111111', 'mod@example.com', now(), false),
  ('d2222222-2222-4222-8222-222222222222', 'utente@example.com', now(), false),
  ('d3333333-3333-4333-8333-333333333333', null, null, true);
update public.profiles set role = 'moderatore' where id = 'd1111111-1111-4111-8111-111111111111';
insert into public.cities (key, name, lat, lng) values ('citta_moderazione', 'Città Moderazione', 42, 12);
insert into public.reports (id, author_id, city_key, type, rating, description, status, verified) values
  ('40000000-0000-4000-8000-000000000001', 'd2222222-2222-4222-8222-222222222222', 'citta_moderazione', 'tariffa', 2, 'In coda', 'in_moderazione', true),
  ('40000000-0000-4000-8000-000000000002', 'd2222222-2222-4222-8222-222222222222', 'citta_moderazione', 'percorso', 2, 'Pubblicata', 'pubblicata', true);
insert into private.reports_private (report_id, reporter_name, plate, license) values
  ('40000000-0000-4000-8000-000000000001', 'Mario Rossi', 'AB123CD', '1234'),
  ('40000000-0000-4000-8000-000000000002', 'Anna Bianchi', 'EF456GH', '5678');
insert into public.attachments (id, report_id, kind, storage_path, mime_type, size_bytes, exif_stripped, faces_blurred, faces_detected) values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'foto', '40000000-0000-4000-8000-000000000001/a.jpg', 'image/jpeg', 100, true, true, 2),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'video', '40000000-0000-4000-8000-000000000001/b.mp4', 'video/mp4', 100, false, false, null);

-- ---------------------------------------------------------------------
-- Coda: solo moderatori, con i dati riservati
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok($$ select public.moderation_queue() $$, '42501', null, 'un utente normale non vede la coda');
select is(public.my_role(), 'utente'::public.user_role, 'my_role restituisce il ruolo dell''utente');
select throws_ok($$ select public.moderate_attachment('50000000-0000-4000-8000-000000000001', true) $$, '42501', null,
  'un utente normale non pubblica foto');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is(public.my_role(), 'moderatore'::public.user_role, 'my_role riconosce il moderatore');
select is((select q->>'reporter_name' from jsonb_array_elements(public.moderation_queue()->'reports') q
           where q->>'id' = '40000000-0000-4000-8000-000000000001'), 'Mario Rossi', 'la coda mostra il nome del segnalatore');
select is((select q->>'plate' from jsonb_array_elements(public.moderation_queue()->'reports') q
           where q->>'id' = '40000000-0000-4000-8000-000000000001'), 'AB123CD', 'la coda mostra la targa completa');
select is((select jsonb_array_length(q->'attachments') from jsonb_array_elements(public.moderation_queue()->'reports') q
           where q->>'id' = '40000000-0000-4000-8000-000000000001'), 2, 'la coda include gli allegati');
select ok(not exists (select 1 from jsonb_array_elements(public.moderation_queue()->'reports') q
           where q->>'id' = '40000000-0000-4000-8000-000000000002'), 'le segnalazioni già pubblicate non sono in coda');

-- ---------------------------------------------------------------------
-- Foto: pubblicazione e sicurezza di video e audio
-- ---------------------------------------------------------------------
select throws_ok($$ select public.moderate_attachment('50000000-0000-4000-8000-000000000002', true) $$, '22023',
  'Video e audio non possono essere pubblicati', 'video e audio non si pubblicano');
select lives_ok($$ select public.moderate_attachment('50000000-0000-4000-8000-000000000001', true) $$, 'il moderatore pubblica una foto');
reset role;
select is((select array[is_public, plates_blurred] from public.attachments where id = '50000000-0000-4000-8000-000000000001'),
  array[true, true], 'pubblicare una foto conferma anche le targhe');
select is((select moderated_by from public.attachments where id = '50000000-0000-4000-8000-000000000001'),
  'd1111111-1111-4111-8111-111111111111'::uuid, 'la moderazione della foto registra chi ha deciso');

-- ---------------------------------------------------------------------
-- Repliche dei tassisti
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d3333333-3333-4333-8333-333333333333","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$ select public.submit_driver_reply('40000000-0000-4000-8000-000000000001', 'AB123CD', 'tassista@example.com',
  'Replica a una segnalazione non ancora pubblicata.') $$, 'P0002', null, 'non si replica a segnalazioni non pubblicate');
select lives_ok($$ select public.submit_driver_reply('40000000-0000-4000-8000-000000000002', 'ZZ999ZZ', 'tassista@example.com',
  'Targa sbagliata: la risposta non deve rivelarlo.') $$, 'con targa sbagliata la replica è accettata come le altre');
select throws_ok($$ select public.submit_driver_reply('40000000-0000-4000-8000-000000000002', 'ef 456 gh', 'tassista@example.com',
  'Seconda replica mentre la prima è in verifica.') $$, 'P0001', null, 'una sola replica in verifica per segnalazione');
select is((select count(*)::int from public.driver_replies where report_id = '40000000-0000-4000-8000-000000000002'), 0,
  'le repliche in verifica non sono pubbliche');
select throws_ok($$ select * from private.driver_reply_contacts $$, '42501', null, 'i contatti dei tassisti sono riservati');
reset role;
insert into public.driver_replies (id, report_id, author_id, body) values
  ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'd2222222-2222-4222-8222-222222222222', 'Replica con licenza corretta, per il test.');
insert into private.driver_reply_contacts values ('60000000-0000-4000-8000-000000000001', '333 1234567', '5678', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((select array_agg((q->>'identifier_matches')::boolean order by (q->>'identifier_matches')::boolean) from jsonb_array_elements(public.moderation_queue()->'replies') q
           where q->>'report_id' = '40000000-0000-4000-8000-000000000002'), array[false, true],
  'solo il moderatore vede se targa o licenza corrispondono');
select throws_ok($$ select public.moderate_reply('60000000-0000-4000-8000-000000000001', 'rifiutata') $$, '22023',
  'Indica il motivo del rifiuto', 'il rifiuto di una replica richiede un motivo');
select lives_ok($$ select public.moderate_reply('60000000-0000-4000-8000-000000000001', 'pubblicata') $$, 'il moderatore pubblica la replica');
reset role;

set local role anon;
select is((select body from public.driver_replies where report_id = '40000000-0000-4000-8000-000000000002'),
  'Replica con licenza corretta, per il test.', 'la replica pubblicata è visibile a tutti');
select throws_ok($$ select author_id from public.driver_replies $$, '42501', null, 'l''autore della replica non è pubblico');
reset role;

select * from finish();
rollback;
