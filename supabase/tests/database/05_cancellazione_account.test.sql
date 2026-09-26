-- Test pgTAP del punto 4b: cancellazione dell'account.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, email_confirmed_at) values ('f1111111-1111-4111-8111-111111111111', 'via@example.com', now());
insert into public.cities (key, name, lat, lng) values ('citta_cancellazione', 'Città Cancellazione', 42, 12);
insert into public.reports (id, author_id, city_key, type, rating, description, status, verified) values
  ('70000000-0000-4000-8000-000000000001', 'f1111111-1111-4111-8111-111111111111', 'citta_cancellazione', 'tariffa', 2, 'Pubblicata', 'pubblicata', true),
  ('70000000-0000-4000-8000-000000000002', 'f1111111-1111-4111-8111-111111111111', 'citta_cancellazione', 'tariffa', 2, 'In attesa', 'in_moderazione', true);
insert into private.reports_private (report_id, reporter_name, plate, license) values
  ('70000000-0000-4000-8000-000000000001', 'Nome Da Cancellare', 'AB123CD', '1'),
  ('70000000-0000-4000-8000-000000000002', 'Nome Da Cancellare', 'AB123CD', '1');
insert into public.attachments (report_id, kind, storage_path, mime_type, size_bytes) values
  ('70000000-0000-4000-8000-000000000002', 'audio', '70000000-0000-4000-8000-000000000002/a.m4a', 'audio/mp4', 10);
insert into public.driver_replies (id, report_id, author_id, body, status) values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'f1111111-1111-4111-8111-111111111111', 'Replica pubblicata di prova, abbastanza lunga.', 'pubblicata');
insert into private.driver_reply_contacts values ('71000000-0000-4000-8000-000000000001', 'contatto@example.com', 'AB123CD', true);
insert into public.points_ledger (user_id, delta, reason) values ('f1111111-1111-4111-8111-111111111111', 50, 'Prova');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok($$ select public.purge_account_data('f1111111-1111-4111-8111-111111111111') $$, '42501', null,
  'la pulizia non si chiama dall''app: solo dalla funzione delete-account');
reset role;

set local role service_role;
select is(public.purge_account_data('f1111111-1111-4111-8111-111111111111'),
  array['70000000-0000-4000-8000-000000000002/a.m4a'], 'restituisce i file da cancellare');
reset role;
select is((select count(*)::int from public.reports where id = '70000000-0000-4000-8000-000000000002'), 0,
  'le segnalazioni non pubblicate vengono cancellate');
select is((select count(*)::int from public.attachments where report_id = '70000000-0000-4000-8000-000000000002'), 0,
  'con i loro allegati');
select is((select reporter_name from private.reports_private where report_id = '70000000-0000-4000-8000-000000000001'), null,
  'il nome del segnalatore viene cancellato dalle segnalazioni pubblicate');
select is((select count(*)::int from private.driver_reply_contacts where reply_id = '71000000-0000-4000-8000-000000000001'), 0,
  'i contatti delle repliche vengono cancellati');

-- Poi la funzione cancella l'utente: a cascata profilo e punti; le pubblicate restano anonime.
delete from auth.users where id = 'f1111111-1111-4111-8111-111111111111';
select is((select count(*)::int from public.points_ledger where user_id = 'f1111111-1111-4111-8111-111111111111'), 0, 'i punti vengono cancellati');
select is((select author_id from public.reports where id = '70000000-0000-4000-8000-000000000001'), null,
  'la segnalazione pubblicata resta, senza autore');
select is((select count(*)::int from public.profiles where id = 'f1111111-1111-4111-8111-111111111111'), 0, 'il profilo viene cancellato');

select * from finish();
rollback;
