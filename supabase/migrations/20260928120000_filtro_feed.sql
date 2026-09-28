-- Safe Taxi · IMP-03: filtro del feed per città e parola chiave (backlog in docs/improvements-app.md).
--
-- - Il filtro si fa sul server: il client carica solo le segnalazioni più recenti, quindi filtrare nel browser
--   perderebbe quelle più vecchie.
-- - Parola chiave solo sul testo pubblico della segnalazione (descrizione e tratta), mai su targa o licenza
--   (che stanno in private.reports_private e non entrano nell'indice).
-- - Ricerca in italiano: senza distinguere maiuscole e accenti ("citta" trova "città"), con le varianti della parola
--   ("tassametri" trova "tassametro") e per inizio di parola ("tassam" trova "tassametro"); tutte le parole devono esserci.
-- - public.feed_reports restituisce solo le segnalazioni pubblicate e solo le colonne già pubbliche del feed
--   (come PUBLIC_REPORT_COLUMNS in src/lib/remote.js). È security definer come le altre funzioni dell'app:
--   lo schema private resta chiuso ai client.

create extension if not exists unaccent with schema extensions;

-- Testo normalizzato per la ricerca: minuscole e senza accenti. Immutable per poterlo usare in una colonna calcolata.
create function private.search_text(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, '')));
$$;

alter table public.reports add column search_tsv tsvector generated always as (
  to_tsvector('italian'::regconfig, private.search_text(description || ' ' || coalesce(from_place, '') || ' ' || coalesce(to_place, '')))
) stored;
create index reports_search_idx on public.reports using gin (search_tsv);
create index reports_city_created_idx on public.reports (city_key, created_at desc);

-- Parole cercate → query di ricerca: solo lettere e cifre (nessuna sintassi di ricerca passa dall'utente),
-- parole di almeno 2 caratteri, al massimo 8, ciascuna come inizio di parola, tutte obbligatorie.
create function private.feed_tsquery(p_query text) returns tsquery
language sql immutable parallel safe set search_path = '' as $$
  select case when count(*) = 0 then null
    else to_tsquery('italian'::regconfig, string_agg(w || ':*', ' & ')) end
  from (select m[1] as w
        from regexp_matches(private.search_text(p_query), '([[:alnum:]]{2,})', 'g') as m
        limit 8) t;
$$;

create function public.feed_reports(
  p_city text default null,
  p_query text default null,
  p_kind text default 'all',
  p_before timestamptz default null,
  p_limit integer default 12
) returns table (
  id uuid, kind public.report_kind, city_key text, type public.report_type, rating smallint, description text,
  from_place text, to_place text, cost_eur numeric, duration_min integer, lat_approx numeric, lng_approx numeric,
  plate_masked text, verified boolean, ride_verified boolean, meter_eur numeric, is_demo boolean, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.kind, r.city_key, r.type, r.rating, r.description, r.from_place, r.to_place, r.cost_eur, r.duration_min,
         r.lat_approx, r.lng_approx, r.plate_masked, r.verified, r.ride_verified, r.meter_eur, r.is_demo, r.created_at
  from public.reports r
  where r.status = 'pubblicata'
    and (nullif(trim(p_city), '') is null or r.city_key = p_city)
    and (coalesce(p_kind, 'all') = 'all' or (p_kind = 'pos' and r.type = 'positiva') or (p_kind = 'neg' and r.type <> 'positiva'))
    and (p_before is null or r.created_at < p_before)
    and (private.feed_tsquery(p_query) is null or r.search_tsv @@ private.feed_tsquery(p_query))
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

revoke all on function private.search_text(text), private.feed_tsquery(text) from public, anon, authenticated;
revoke all on function public.feed_reports(text, text, text, timestamptz, integer) from public;
grant execute on function public.feed_reports(text, text, text, timestamptz, integer) to anon, authenticated;
