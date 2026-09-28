-- Safe Taxi · IMP-07 (parte 1): segnalazione di attesa/coda e heatmap delle attese (decisioni di Roberto del 28/09/2026).
--
-- - Nuovo tipo 'attesa': segnalazione generica su un luogo (es. uscita di una grande stazione), senza targa né licenza.
--   Conta per il Termometro della città (stelle, solo account verificati), mai per il rating di un tassista.
-- - Dati: minuti di attesa, posizione (obbligatoria: serve alla heatmap; pubblica arrotondata a circa 100 m come le
--   altre), orario dell'attesa (fino a 24 ore prima dell'invio: serve allo storico per data e ora, parte 2),
--   nome del punto facoltativo (es. "uscita via Marsala").
-- - Restano le regole delle altre segnalazioni: nome del segnalatore obbligatorio e mai pubblico, stelle 1–5,
--   descrizione secondo IMP-01, pubblicazione automatica per gli account verificati senza espressioni da verificare,
--   massimo 5 segnalazioni al giorno. In più: al massimo una segnalazione di attesa ogni 15 minuti per utente.

alter type public.report_type add value if not exists 'attesa';

alter table public.reports
  add column wait_min integer check (wait_min between 0 and 600),
  add column place_name text check (char_length(place_name) <= 120),
  add column waited_at timestamptz;
create index reports_waits_idx on public.reports (waited_at desc) where wait_min is not null;
grant select (wait_min, place_name, waited_at) on public.reports to anon, authenticated;

-- La ricerca del feed (IMP-03) comprende anche il nome del punto di attesa.
drop index public.reports_search_idx;
alter table public.reports drop column search_tsv;
alter table public.reports add column search_tsv tsvector generated always as (
  to_tsvector('italian'::regconfig, private.search_text(description || ' ' || coalesce(from_place, '') || ' ' || coalesce(to_place, '')
    || ' ' || coalesce(place_name, '')))
) stored;
create index reports_search_idx on public.reports using gin (search_tsv);

create function public.submit_wait_report(
  p_city text,
  p_rating integer,
  p_description text,
  p_reporter_name text,
  p_wait_min integer,
  p_lat double precision,
  p_lng double precision,
  p_place text default null,
  p_waited_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_user();
  v_verified boolean := private.is_verified_user(v_uid);
  v_when timestamptz := coalesce(p_waited_at, now());
  v_flags text[];
  v_id uuid;
begin
  if char_length(trim(coalesce(p_reporter_name, ''))) < 3 then
    raise exception 'Nome e cognome obbligatori' using errcode = '22023';
  end if;
  if not exists (select 1 from public.cities where key = p_city) then
    raise exception 'Città non valida' using errcode = '22023';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Valutazione da 1 a 5' using errcode = '22023';
  end if;
  if p_rating <= 3 and char_length(trim(coalesce(p_description, ''))) < 20 then
    raise exception 'Per una valutazione da 1 a 3 stelle descrivi l''accaduto in almeno 20 caratteri' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_description, ''))) < 1 then
    raise exception 'Scrivi almeno un commento (anche solo "OK")' using errcode = '22023';
  end if;
  if p_wait_min is null or p_wait_min not between 0 and 600 then
    raise exception 'Indica i minuti di attesa (da 0 a 600)' using errcode = '22023';
  end if;
  if p_lat is null or p_lng is null or p_lat not between 35 and 48 or p_lng not between 6 and 19 then
    raise exception 'Indica il luogo dell''attesa (posizione in Italia)' using errcode = '22023';
  end if;
  if v_when > now() + interval '5 minutes' or v_when < now() - interval '24 hours' then
    raise exception 'L''orario dell''attesa deve essere nelle ultime 24 ore' using errcode = '22023';
  end if;

  if (select count(*) from public.reports
      where author_id = v_uid and kind = 'segnalazione' and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Limite giornaliero di segnalazioni raggiunto' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reports
             where author_id = v_uid and type = 'attesa' and created_at > now() - interval '15 minutes') then
    raise exception 'Hai già segnalato un''attesa negli ultimi 15 minuti' using errcode = 'P0001';
  end if;

  v_flags := private.text_flags(concat_ws(' ', p_description, p_place));
  insert into public.reports (author_id, kind, city_key, type, rating, description, lat, lng, wait_min, place_name, waited_at,
    verified, auto_flags, status)
  values (v_uid, 'segnalazione', p_city, 'attesa', p_rating, trim(p_description), p_lat, p_lng, p_wait_min,
    nullif(trim(p_place), ''), v_when, v_verified, v_flags,
    case when v_verified and cardinality(v_flags) = 0 then 'pubblicata' else 'in_moderazione' end::public.report_status)
  returning id into v_id;

  insert into private.reports_private (report_id, reporter_name) values (v_id, trim(p_reporter_name));
  return v_id;
end $$;

revoke all on function public.submit_wait_report(text, integer, text, text, integer, double precision, double precision, text, timestamptz) from public, anon;
grant execute on function public.submit_wait_report(text, integer, text, text, integer, double precision, double precision, text, timestamptz) to authenticated;

-- Il feed restituisce anche minuti di attesa, luogo e orario dell'attesa.
drop function public.feed_reports(text, text, text, timestamptz, integer);
create function public.feed_reports(
  p_city text default null,
  p_query text default null,
  p_kind text default 'all',
  p_before timestamptz default null,
  p_limit integer default 12
) returns table (
  id uuid, kind public.report_kind, city_key text, type public.report_type, rating smallint, description text,
  from_place text, to_place text, cost_eur numeric, duration_min integer, lat_approx numeric, lng_approx numeric,
  plate_masked text, verified boolean, ride_verified boolean, meter_eur numeric, is_demo boolean, created_at timestamptz,
  wait_min integer, place_name text, waited_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.kind, r.city_key, r.type, r.rating, r.description, r.from_place, r.to_place, r.cost_eur, r.duration_min,
         r.lat_approx, r.lng_approx, r.plate_masked, r.verified, r.ride_verified, r.meter_eur, r.is_demo, r.created_at,
         r.wait_min, r.place_name, r.waited_at
  from public.reports r
  where r.status = 'pubblicata'
    and (nullif(trim(p_city), '') is null or r.city_key = p_city)
    and (coalesce(p_kind, 'all') = 'all' or (p_kind = 'pos' and r.type = 'positiva') or (p_kind = 'neg' and r.type <> 'positiva'))
    and (p_before is null or r.created_at < p_before)
    and (private.feed_tsquery(p_query) is null or r.search_tsv @@ private.feed_tsquery(p_query))
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;
revoke all on function public.feed_reports(text, text, text, timestamptz, integer) from public;
grant execute on function public.feed_reports(text, text, text, timestamptz, integer) to anon, authenticated;
