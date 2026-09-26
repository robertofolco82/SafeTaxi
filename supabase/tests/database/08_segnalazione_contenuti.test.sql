-- Test pgTAP del punto 5: segnalazione di contenuti (Digital Services Act, artt. 16 e 17).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('c1111111-1111-4111-8111-111111111111', 'mod.dsa@example.com', now(), false),
  ('c2222222-2222-4222-8222-222222222222', 'autore.dsa@example.com', now(), false),
  ('c3333333-3333-4333-8333-333333333333', null, null, true);
update public.profiles set role = 'moderatore' where id = 'c1111111-1111-4111-8111-111111111111';
insert into public.cities (key, name, lat, lng) values ('citta_dsa', 'Città DSA', 42, 12);
insert into public.reports (id, author_id, city_key, type, rating, description, status, verified) values
  ('90000000-0000-4000-8000-000000000001', 'c2222222-2222-4222-8222-222222222222', 'citta_dsa', 'comportamento', 1, 'Pubblicata con dati di terzi', 'in_moderazione', true),
  ('90000000-0000-4000-8000-000000000002', 'c2222222-2222-4222-8222-222222222222', 'citta_dsa', 'tariffa', 2, 'Pubblicata e corretta', 'pubblicata', true),
  ('90000000-0000-4000-8000-000000000003', 'c2222222-2222-4222-8222-222222222222', 'citta_dsa', 'tariffa', 2, 'Ancora in moderazione', 'in_moderazione', true);
update public.reports set status = 'pubblicata' where id = '90000000-0000-4000-8000-000000000001';  -- assegna i punti
insert into public.driver_replies (id, report_id, author_id, body, status) values
  ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', 'c2222222-2222-4222-8222-222222222222', 'Replica pubblicata da segnalare.', 'pubblicata');

select is((select sum(delta)::int from public.points_ledger where report_id = '90000000-0000-4000-8000-000000000001'), 50,
  'l''autore ha ricevuto i punti alla pubblicazione');

-- ---------------------------------------------------------------------
-- Invio della segnalazione (anche con accesso anonimo)
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$ select public.submit_content_notice('segnalazione', '90000000-0000-4000-8000-000000000003', 'offensivo',
  'Contenuto non ancora pubblicato da segnalare.', 'Anna Verdi', 'anna@example.com', true) $$, 'P0002', null,
  'si segnalano solo contenuti pubblicati');
select throws_ok($$ select public.submit_content_notice('segnalazione', '90000000-0000-4000-8000-000000000001', 'dati_personali',
  'Contiene nome e cognome del tassista.', 'Anna Verdi', 'anna@example.com', false) $$, '22023', 'Serve la dichiarazione di buona fede',
  'serve la dichiarazione di buona fede');
select throws_ok($$ select public.submit_content_notice('segnalazione', '90000000-0000-4000-8000-000000000001', 'dati_personali',
  'Contiene nome e cognome del tassista.', 'Anna Verdi', 'non-una-email', true) $$, '22023', 'Indica un indirizzo email valido',
  'serve un''email valida');
select set_config('test.n1', public.submit_content_notice('segnalazione', '90000000-0000-4000-8000-000000000001', 'dati_personali',
  'Contiene nome e cognome del tassista.', 'Anna Verdi', 'Anna@Example.com', true)::text, true);
select ok(current_setting('test.n1') <> '', 'con accesso anonimo si può segnalare un contenuto');
select throws_ok($$ select public.submit_content_notice('segnalazione', '90000000-0000-4000-8000-000000000001', 'offensivo',
  'Seconda segnalazione dello stesso contenuto.', 'Anna Verdi', 'anna@example.com', true) $$, 'P0001', null,
  'non si segnala due volte lo stesso contenuto mentre la verifica è in corso');
select set_config('test.n2', public.submit_content_notice('segnalazione', '90000000-0000-4000-8000-000000000002', 'falso',
  'Secondo me la tariffa indicata non è vera.', 'Anna Verdi', 'anna@example.com', true)::text, true);
select set_config('test.n3', public.submit_content_notice('replica', '91000000-0000-4000-8000-000000000001', 'offensivo',
  'La replica contiene espressioni offensive.', 'Anna Verdi', 'anna@example.com', true)::text, true);
select throws_ok($$ select * from public.content_notices $$, '42501', null, 'nessuno legge direttamente le segnalazioni');
select throws_ok($$ select public.resolve_content_notice(current_setting('test.n1')::uuid, true, 'Contiene dati personali.') $$, '42501', null,
  'solo i moderatori decidono');
select is((select count(*)::int from public.my_content_notices()), 3, 'il segnalante vede le sue segnalazioni');
reset role;
select is((select email from private.content_notice_contacts where notice_id = current_setting('test.n1')::uuid), 'anna@example.com',
  'nome ed email del segnalante restano riservati');

-- ---------------------------------------------------------------------
-- Decisioni del moderatore
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is(jsonb_array_length(public.moderation_queue()->'notices'), 3, 'le segnalazioni sono nella coda di moderazione');
select is((select q->>'notifier_email' from jsonb_array_elements(public.moderation_queue()->'notices') q
           where q->>'id' = current_setting('test.n1')), 'anna@example.com', 'il moderatore vede il contatto del segnalante');
select throws_ok(format('select public.resolve_content_notice(%L, true, %L)', current_setting('test.n1'), 'no'), '22023', null,
  'ogni decisione va motivata');
select lives_ok(format('select public.resolve_content_notice(%L, true, %L)', current_setting('test.n1'),
  'Contiene nome e cognome del tassista, dato personale di terzi.'), 'il moderatore rimuove il contenuto');
select lives_ok(format('select public.resolve_content_notice(%L, false, %L)', current_setting('test.n2'),
  'La segnalazione riporta un''esperienza personale: nessuna violazione.'), 'il moderatore mantiene il contenuto');
select lives_ok(format('select public.resolve_content_notice(%L, true, %L)', current_setting('test.n3'),
  'Linguaggio offensivo verso il cliente.'), 'si rimuove anche una replica');
reset role;

select is((select array[status::text, rejection_reason] from public.reports where id = '90000000-0000-4000-8000-000000000001'),
  array['rifiutata', 'Rimossa dopo una segnalazione: Contiene nome e cognome del tassista, dato personale di terzi.'],
  'il contenuto rimosso non è più pubblico e l''autore vede il motivo');
select is((select sum(delta)::int from public.points_ledger where report_id = '90000000-0000-4000-8000-000000000001'), 0,
  'i punti del contenuto rimosso vengono tolti');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated","is_anonymous":true}', true);
select is((select array_agg(status || ':' || (decision_reason is not null) order by status) from public.my_content_notices()),
  array['accolta:true', 'accolta:true', 'respinta:true'],
  'il segnalante vede l''esito di ogni segnalazione, con la motivazione');
reset role;

set local role service_role;
select public.purge_account_data('c3333333-3333-4333-8333-333333333333');
reset role;
select is((select count(*)::int from private.content_notice_contacts c join public.content_notices n on n.id = c.notice_id
           where n.notifier_id = 'c3333333-3333-4333-8333-333333333333'), 0,
  'con la cancellazione dell''account si cancellano nome ed email del segnalante');

select * from finish();
rollback;
