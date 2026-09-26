-- Safe Taxi · news sul settore taxi da feed RSS (requisito 11).
--
-- La funzione refresh-news legge i feed (Google News e Consumerismo, vedi supabase/functions/_shared/news.js)
-- e salva solo titolo, testata, data e link all'articolo originale. Un job pianificato la chiama ogni ora
-- (configurazione del progetto remoto nel README): qui ci sono solo i dati e le funzioni che usa.

alter table public.news add column feed text;
create unique index news_url_key on public.news (url);
create index news_published_idx on public.news (published_at desc nulls last);

-- Ultimo aggiornamento: la funzione è chiamabile senza chiave, quindi si limita la frequenza qui.
create table private.news_refresh (
  id boolean primary key default true check (id),
  last_run timestamptz
);
alter table private.news_refresh enable row level security;
insert into private.news_refresh default values;

-- true se l'ultimo aggiornamento è più vecchio di p_minutes (e segna quello nuovo), altrimenti false.
create function public.news_refresh_due(p_minutes integer default 15) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update private.news_refresh set last_run = now()
   where id and (last_run is null or last_run < now() - make_interval(mins => greatest(p_minutes, 1)));
  return found;
end $$;

-- Salva le notizie nuove (i link già presenti si ignorano), toglie i segnaposto e le notizie più vecchie
-- di 30 giorni. Restituisce quante notizie sono state aggiunte.
create function public.save_news(p_items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  insert into public.news (title, source_name, url, published_at, feed)
  select left(trim(i->>'title'), 300), left(trim(i->>'source_name'), 120), i->>'url',
         (i->>'published_at')::timestamptz, i->>'feed'
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
   where coalesce(trim(i->>'title'), '') <> '' and coalesce(trim(i->>'source_name'), '') <> ''
     and i->>'url' ~ '^https?://'
  on conflict (url) do nothing;
  get diagnostics v_count = row_count;
  if exists (select 1 from public.news where not is_placeholder) then
    delete from public.news where is_placeholder;
  end if;
  delete from public.news where not is_placeholder and coalesce(published_at, created_at) < now() - interval '30 days';
  return v_count;
end $$;

revoke all on table private.news_refresh from public, anon, authenticated;
revoke all on function public.news_refresh_due(integer), public.save_news(jsonb) from public, anon, authenticated;
grant execute on function public.news_refresh_due(integer), public.save_news(jsonb) to service_role;
