-- Safe Taxi · IMP-07 (parte 2): storico delle attese per data e ora, giorni festivi e lavorativi, previsioni.
--
-- - Tipo di giorno nell'ora italiana (Europe/Rome): 'festivo' (domenica e festività nazionali), 'sabato', 'lavorativo'.
--   Festività nazionali: L. 260/1949 e successive modifiche; San Francesco (4 ottobre) dal 2026 per la L. 8 ottobre 2025
--   n. 151 (GU n. 236 del 10/10/2025). Santi patroni esclusi (feste solo locali). Stessa regola in src/lib/holidays.js.
-- - Contano solo le segnalazioni di attesa pubblicate di account verificati, con l'orario dell'attesa (waited_at).
-- - Fasce di 2 ore; la media si restituisce solo con almeno 5 segnalazioni (sotto: dato insufficiente, avg_min null).
-- - Profilo sugli ultimi 24 mesi; stessa data negli anni precedenti fino a 5 anni. Punto: posizioni pubbliche
--   (arrotondate a circa 100 m) entro circa 300 m. Mai dati personali: solo conteggi e medie.
-- - Stesse regole nel backend demo: src/lib/waits.js.

-- Domenica di Pasqua (calendario gregoriano, algoritmo di Meeus/Jones/Butcher).
create function private.easter_sunday(p_year integer) returns date
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  a int := p_year % 19; b int := p_year / 100; c int := p_year % 100; d int := b / 4; e int := b % 4;
  f int := (b + 8) / 25; g int := (b - f + 1) / 3; h int := (19*a + b - d - g + 15) % 30;
  i int := c / 4; k int := c % 4; l int := (32 + 2*e + 2*i - h - k) % 7; m int := (a + 11*h + 22*l) / 451;
begin
  return make_date(p_year, (h + l - 7*m + 114) / 31, ((h + l - 7*m + 114) % 31) + 1);
end $$;

create function private.holiday_name(p_date date) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case to_char(p_date, 'MM-DD')
    when '01-01' then 'Capodanno' when '01-06' then 'Epifania' when '04-25' then 'Festa della Liberazione'
    when '05-01' then 'Festa del Lavoro' when '06-02' then 'Festa della Repubblica' when '08-15' then 'Ferragosto'
    when '11-01' then 'Ognissanti' when '12-08' then 'Immacolata Concezione' when '12-25' then 'Natale'
    when '12-26' then 'Santo Stefano'
    when '10-04' then case when extract(year from p_date) >= 2026 then 'San Francesco' end
    else case when p_date = private.easter_sunday(extract(year from p_date)::int) + 1 then 'Lunedì dell''Angelo' end
  end;
$$;

create function private.day_type(p_date date) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when extract(isodow from p_date) = 7 or private.holiday_name(p_date) is not null then 'festivo'
              when extract(isodow from p_date) = 6 then 'sabato' else 'lavorativo' end;
$$;

-- Segnalazioni di attesa che entrano nello storico, con data e ora italiane dell'attesa.
create function private.wait_history(p_city text, p_lat numeric, p_lng numeric)
returns table (ts timestamptz, local_ts timestamp, wait_min integer, lat_approx numeric, lng_approx numeric, place_name text, is_demo boolean)
language sql stable set search_path = '' as $$
  select coalesce(r.waited_at, r.created_at), coalesce(r.waited_at, r.created_at) at time zone 'Europe/Rome', r.wait_min, r.lat_approx, r.lng_approx, r.place_name, r.is_demo
  from public.reports r
  where r.type = 'attesa' and r.status = 'pubblicata' and r.verified and r.wait_min is not null and r.lat_approx is not null
    and (p_city is null or r.city_key = p_city)
    and (p_lat is null or p_lng is null or (abs(r.lat_approx - p_lat) <= 0.003 and abs(r.lng_approx - p_lng) <= 0.004));
$$;

-- Punti con più segnalazioni di attesa negli ultimi 24 mesi (almeno 5): i primi 8, con il nome più usato.
create function public.get_wait_places(p_city text, p_now timestamptz default now())
returns table (lat numeric, lng numeric, place_name text, n integer)
language sql stable security definer set search_path = '' as $$
  with h as (
    select * from private.wait_history(p_city, null, null)
    where ts between p_now - interval '24 months' and p_now
  ), cells as (
    select h.lat_approx, h.lng_approx, count(*)::int as n from h group by 1, 2 having count(*) >= 5
  )
  select c.lat_approx, c.lng_approx,
    (select h.place_name from h where h.lat_approx = c.lat_approx and h.lng_approx = c.lng_approx and h.place_name is not null
     group by h.place_name order by count(*) desc, h.place_name limit 1), c.n
  from cells c order by c.n desc, c.lat_approx, c.lng_approx limit 8;
$$;

-- Profilo dell'attesa per fascia di 2 ore in un tipo di giorno, sugli ultimi 24 mesi: 12 righe (fascia 0 = ore 0–2).
create function public.get_wait_profile(
  p_city text, p_day_type text, p_lat numeric default null, p_lng numeric default null, p_now timestamptz default now()
) returns table (slot integer, n integer, avg_min integer, is_demo boolean)
language sql stable security definer set search_path = '' as $$
  with h as (
    select extract(hour from local_ts)::int / 2 as slot, wait_min, is_demo
    from private.wait_history(p_city, p_lat, p_lng)
    where ts between p_now - interval '24 months' and p_now
      and private.day_type(local_ts::date) = p_day_type
  )
  select s, count(h.wait_min)::int, case when count(h.wait_min) >= 5 then round(avg(h.wait_min))::int end, coalesce(bool_or(h.is_demo), false)
  from generate_series(0, 11) s left join h on h.slot = s
  group by s order by s;
$$;

-- La stessa data (giorno e mese) negli anni precedenti, fino a 5 anni, e nell'anno scelto se già passata.
create function public.get_wait_same_date(
  p_city text, p_date date, p_lat numeric default null, p_lng numeric default null, p_now timestamptz default now()
) returns table (year integer, n integer, avg_min integer, max_min integer, is_demo boolean)
language sql stable security definer set search_path = '' as $$
  select extract(year from local_ts)::int, count(*)::int,
    case when count(*) >= 5 then round(avg(wait_min))::int end, case when count(*) >= 5 then max(wait_min) end, bool_or(is_demo)
  from private.wait_history(p_city, p_lat, p_lng)
  where to_char(local_ts, 'MM-DD') = to_char(p_date, 'MM-DD')
    and extract(year from local_ts) between extract(year from p_date) - 5 and extract(year from p_date)
    and local_ts::date < (p_now at time zone 'Europe/Rome')::date
  group by 1 order by 1 desc;
$$;

revoke all on function private.easter_sunday(integer), private.holiday_name(date), private.day_type(date),
  private.wait_history(text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.get_wait_places(text, timestamptz), public.get_wait_profile(text, text, numeric, numeric, timestamptz),
  public.get_wait_same_date(text, date, numeric, numeric, timestamptz) from public;
grant execute on function public.get_wait_places(text, timestamptz), public.get_wait_profile(text, text, numeric, numeric, timestamptz),
  public.get_wait_same_date(text, date, numeric, numeric, timestamptz) to anon, authenticated;
