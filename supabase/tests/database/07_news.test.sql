-- Test pgTAP delle news da feed RSS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

update private.news_refresh set last_run = null;

set local role anon;
select throws_ok($$ select public.save_news('[]') $$, '42501', null, 'dall''app non si scrivono news');
select throws_ok($$ select public.news_refresh_due() $$, '42501', null, 'dall''app non si avvia l''aggiornamento');
reset role;

set local role service_role;
select is(public.news_refresh_due(15), true, 'il primo aggiornamento parte');
select is(public.news_refresh_due(15), false, 'un secondo aggiornamento entro 15 minuti non parte');
select is(public.save_news($$[
  {"title":"Taxi, nuove tariffe a Test","source_name":"Testata di prova","url":"https://example.com/news-test-1","published_at":"2026-09-26T10:00:00Z","feed":"google_news"},
  {"title":"Tassisti in sciopero a Test","source_name":"Testata di prova","url":"https://example.com/news-test-2","published_at":null,"feed":"consumerismo"},
  {"title":"Senza link","source_name":"Testata di prova","url":"javascript:alert(1)"},
  {"title":"","source_name":"Testata di prova","url":"https://example.com/news-test-3"}
]$$::jsonb), 2, 'salva solo le notizie con titolo, testata e link validi');
select is(public.save_news($$[{"title":"Taxi, nuove tariffe a Test (bis)","source_name":"Altra","url":"https://example.com/news-test-1"}]$$::jsonb), 0,
  'un link già salvato non si duplica');
reset role;

select is((select count(*)::int from public.news where is_placeholder), 0, 'con notizie vere i segnaposto spariscono');

insert into public.news (title, source_name, url, published_at) values ('Taxi, notizia vecchia', 'Prova', 'https://example.com/news-old', now() - interval '40 days');
set local role service_role;
select public.save_news('[]');
reset role;
select is((select count(*)::int from public.news where url = 'https://example.com/news-old'), 0, 'le notizie più vecchie di 30 giorni si cancellano');

set local role anon;
select is((select source_name from public.news where url = 'https://example.com/news-test-2'), 'Testata di prova', 'le news sono leggibili da tutti');
select throws_ok($$ insert into public.news (title, source_name, url) values ('x', 'y', 'https://example.com/x') $$, '42501', null,
  'nessuno scrive direttamente nella tabella');
reset role;

select * from finish();
rollback;
