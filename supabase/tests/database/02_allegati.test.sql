-- Test pgTAP del blocco 2c: regole dello spazio file "attachments" e pubblicazione delle foto.
-- I conteggi sono limitati alle segnalazioni di prova (id 10000000-...): il database può contenere altri dati.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('a1111111-1111-4111-8111-111111111111', null, null, true),                         -- autore anonimo
  ('b2222222-2222-4222-8222-222222222222', 'altro@example.com', now(), false),         -- altro utente
  ('c3333333-3333-4333-8333-333333333333', 'verificato@example.com', now(), false);    -- autore verificato
insert into public.cities (key, name, lat, lng) values ('citta_allegati', 'Città Allegati', 42, 12);
insert into public.reports (id, author_id, city_key, type, rating, description, status, created_at, verified) values
  ('10000000-0000-4000-8000-000000000001', 'a1111111-1111-4111-8111-111111111111', 'citta_allegati', 'tariffa', 2, 'In moderazione', 'in_moderazione', now(), false),
  ('10000000-0000-4000-8000-000000000002', 'b2222222-2222-4222-8222-222222222222', 'citta_allegati', 'tariffa', 2, 'Di un altro', 'in_moderazione', now(), true),
  ('10000000-0000-4000-8000-000000000003', 'a1111111-1111-4111-8111-111111111111', 'citta_allegati', 'tariffa', 2, 'Vecchia', 'in_moderazione', now() - interval '2 hours', false),
  ('10000000-0000-4000-8000-000000000004', 'a1111111-1111-4111-8111-111111111111', 'citta_allegati', 'tariffa', 2, 'Già pubblicata', 'pubblicata', now(), false),
  ('10000000-0000-4000-8000-000000000005', 'c3333333-3333-4333-8333-333333333333', 'citta_allegati', 'percorso', 2, 'Verificata con foto', 'in_moderazione', now(), true);

create function pg_temp.obj(report text, n int, ext text default 'jpg') returns text language sql as
  $$ select report || '/' || '20000000-0000-4000-8000-' || lpad(n::text, 12, '0') || '.' || ext $$;
-- Esegue una modifica e restituisce quante righe ha toccato (con RLS le righe non consentite sono ignorate).
create function pg_temp.affected(q text) returns int language plpgsql as
  $$ declare n int; begin execute q; get diagnostics n = row_count; return n; end $$;

-- ---------------------------------------------------------------------
-- Caricamento
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}', true);
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('attachments', pg_temp.obj('10000000-0000-4000-8000-000000000001', 1), 'a1111111-1111-4111-8111-111111111111') $$,
  'l''autore carica un file sulla propria segnalazione in moderazione');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('attachments', pg_temp.obj('10000000-0000-4000-8000-000000000002', 2)) $$,
  '42501', null, 'non si carica sulla segnalazione di un altro');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('attachments', pg_temp.obj('10000000-0000-4000-8000-000000000003', 3)) $$,
  '42501', null, 'non si carica dopo un''ora dall''invio');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('attachments', pg_temp.obj('10000000-0000-4000-8000-000000000004', 4)) $$,
  '42501', null, 'non si carica su una segnalazione già pubblicata');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('attachments', '10000000-0000-4000-8000-000000000001/virus.exe') $$,
  '42501', null, 'nome o estensione non ammessi');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
  select 'attachments', pg_temp.obj('10000000-0000-4000-8000-000000000001', n, 'm4a'), 'a1111111-1111-4111-8111-111111111111' from generate_series(10, 14) n $$,
  'fino a 6 file per segnalazione');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('attachments', pg_temp.obj('10000000-0000-4000-8000-000000000001', 20)) $$,
  '42501', null, 'il settimo file viene rifiutato');
select is((select count(*)::int from storage.objects where bucket_id = 'attachments' and name like '10000000-%'), 6, 'l''autore vede i propri file');
select is(pg_temp.affected($$ update storage.objects set name = name || 'x' where bucket_id = 'attachments' $$), 0,
  'nessuno modifica i file caricati');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'allegati%' and cmd in ('DELETE', 'UPDATE', 'ALL')), 0,
  'nessuna policy consente di cancellare o sostituire i file (le API di Storage applicano le policy)');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'attachments' and name like '10000000-%'), 0, 'un altro utente non vede i file');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'attachments' and name like '10000000-%'), 0, 'il pubblico non vede i file in moderazione');
select throws_ok($$ insert into public.attachments (report_id, kind, storage_path, mime_type, size_bytes) values
  ('10000000-0000-4000-8000-000000000001', 'foto', 'x', 'image/jpeg', 1) $$, '42501', null,
  'gli allegati si registrano solo dalla funzione di verifica');
reset role;

-- ---------------------------------------------------------------------
-- Registrazione (come la funzione register-attachment) e pubblicazione
-- ---------------------------------------------------------------------
insert into public.attachments (id, report_id, kind, storage_path, mime_type, size_bytes, exif_stripped, faces_blurred, faces_detected) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'foto', pg_temp.obj('10000000-0000-4000-8000-000000000001', 1), 'image/jpeg', 1000, true, true, 1),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'audio', pg_temp.obj('10000000-0000-4000-8000-000000000001', 10, 'm4a'), 'audio/mp4', 1000, false, false, null);
select throws_ok($$ update public.attachments set is_public = true where id = '30000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'una foto non diventa pubblica senza targhe verificate dal moderatore');
select throws_ok($$ update public.attachments set is_public = true, plates_blurred = true where id = '30000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'audio e video non diventano mai pubblici');
update public.attachments set plates_blurred = true, is_public = true where id = '30000000-0000-4000-8000-000000000001';

set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'attachments' and name like '10000000-%'), 0,
  'foto pubblica ma segnalazione non ancora pubblicata: file non visibile');
reset role;
update public.reports set status = 'pubblicata' where id = '10000000-0000-4000-8000-000000000001';
set local role anon;
select is((select array_agg(name) from storage.objects where bucket_id = 'attachments' and name like '10000000-%'),
  array[pg_temp.obj('10000000-0000-4000-8000-000000000001', 1)], 'dopo la pubblicazione il pubblico vede solo la foto approvata');
select is((select storage_path from public.attachments where storage_path like '10000000-%'), pg_temp.obj('10000000-0000-4000-8000-000000000001', 1),
  'il percorso pubblico contiene solo id della segnalazione e nome casuale');
reset role;

-- Punti: +20 per gli allegati, solo per l'autore verificato.
insert into public.attachments (report_id, kind, storage_path, mime_type, size_bytes, exif_stripped, faces_blurred) values
  ('10000000-0000-4000-8000-000000000005', 'foto', pg_temp.obj('10000000-0000-4000-8000-000000000005', 30), 'image/jpeg', 1000, true, true);
update public.reports set status = 'pubblicata' where id = '10000000-0000-4000-8000-000000000005';
select is((select sum(delta)::int from public.points_ledger where user_id = 'c3333333-3333-4333-8333-333333333333'), 70,
  'autore verificato: 50 punti + 20 per gli allegati');
select is((select count(*)::int from public.points_ledger where user_id = 'a1111111-1111-4111-8111-111111111111'), 0,
  'autore anonimo: nessun punto, neanche per gli allegati');

select * from finish();
rollback;
