-- Safe Taxi · blocco 2e: bollino "corsa verificata" (misura contro le recensioni fake, disciplina Omnibus).
--
-- Una segnalazione o valutazione ha il bollino se è collegata a una corsa registrata dall'app:
-- - l'utente (con email confermata) avvia la corsa: il server crea una riga in public.rides;
-- - durante la corsa l'app invia la posizione (al massimo ogni 5 secondi): il server somma i km e controlla
--   che la velocità sia plausibile, ma conserva SOLO l'ultimo punto (mai il percorso), cancellato a fine corsa;
-- - a fine corsa la corsa è "valida" se: almeno 3 minuti, almeno 500 m, almeno 3 posizioni, nessun salto
--   impossibile (oltre 200 km/h);
-- - la segnalazione va inviata entro 24 ore dalla fine, una sola per corsa; se la corsa aveva una targa,
--   deve coincidere con quella della segnalazione.
-- Il bollino dice che una corsa c'è stata, non prova chi era a bordo né che il GPS non sia stato falsificato.
-- Le corse si cancellano dopo 7 giorni: nella segnalazione resta solo ride_verified = true.

create table public.rides (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  plate text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_lat double precision check (last_lat between -90 and 90),
  last_lng double precision check (last_lng between -180 and 180),
  last_ping_at timestamptz,
  distance_m double precision not null default 0,
  pings integer not null default 0,
  implausible boolean not null default false,
  report_id uuid unique references public.reports (id) on delete set null
);
create index rides_owner_idx on public.rides (owner_id, started_at desc);

revoke all on public.rides from anon, authenticated;
alter table public.rides enable row level security;

-- Distanza in metri tra due punti (formula dell'emisenoverso).
create function private.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- Regole di una corsa valida (usate a fine corsa e al collegamento con la segnalazione).
create function private.ride_is_valid(r public.rides) returns boolean
language sql immutable set search_path = '' as $$
  select r.ended_at is not null and r.ended_at - r.started_at >= interval '3 minutes'
     and r.distance_m >= 500 and r.pings >= 3 and not r.implausible;
$$;

create function public.start_ride(p_plate text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_user();
  v_plate text := nullif(private.norm_plate(p_plate), '');
  v_id uuid;
begin
  if not private.is_verified_user(v_uid) then
    raise exception 'Serve un account con email confermata' using errcode = '42501';
  end if;
  delete from public.rides where started_at < now() - interval '7 days';
  -- Una sola corsa aperta per utente: quelle rimaste aperte si chiudono.
  update public.rides set ended_at = now(), last_lat = null, last_lng = null
   where owner_id = v_uid and ended_at is null;
  insert into public.rides (owner_id, plate)
  values (v_uid, case when v_plate ~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$' then v_plate end)
  returning id into v_id;
  return v_id;
end $$;

-- Posizione durante la corsa: restituisce false se ignorata (troppo ravvicinata).
create function public.ride_ping(p_id uuid, p_lat double precision, p_lng double precision) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r public.rides;
  v_d double precision;
  v_s double precision;
begin
  select * into r from public.rides
   where id = p_id and owner_id = (select auth.uid()) and ended_at is null and started_at > now() - interval '6 hours'
   for update;
  if not found then
    raise exception 'Corsa non attiva' using errcode = 'P0002';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Posizione non valida' using errcode = '22023';
  end if;
  if r.last_ping_at > now() - interval '5 seconds' then
    return false;
  end if;
  if r.last_lat is not null then
    v_d := private.distance_m(r.last_lat, r.last_lng, p_lat, p_lng);
    v_s := extract(epoch from now() - r.last_ping_at);
    if v_s > 0 and v_d / v_s > 200 / 3.6 then
      update public.rides set implausible = true where id = p_id;
    end if;
  end if;
  update public.rides set last_lat = p_lat, last_lng = p_lng, last_ping_at = now(), pings = pings + 1,
    distance_m = distance_m + coalesce(v_d, 0)
   where id = p_id;
  return true;
end $$;

-- Fine corsa: l'ultimo punto si cancella; la risposta dice se la corsa vale il bollino.
create function public.end_ride(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.rides;
begin
  update public.rides set ended_at = coalesce(ended_at, now()), last_lat = null, last_lng = null
   where id = p_id and owner_id = (select auth.uid())
  returning * into r;
  if not found then
    raise exception 'Corsa non trovata' using errcode = 'P0002';
  end if;
  return jsonb_build_object('verified', private.ride_is_valid(r), 'ended_at', r.ended_at,
    'duration_min', round(extract(epoch from r.ended_at - r.started_at) / 60), 'distance_km', round((r.distance_m / 1000)::numeric, 1));
end $$;

-- Collega una segnalazione alla corsa, se valida: restituisce true se il bollino si applica.
create function private.claim_ride(p_ride uuid, p_uid uuid, p_report uuid, p_plate text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare r public.rides;
begin
  if p_ride is null then return false; end if;
  select * into r from public.rides
   where id = p_ride and owner_id = p_uid and report_id is null and ended_at > now() - interval '24 hours'
   for update;
  if not found or not private.ride_is_valid(r) or (r.plate is not null and p_plate is not null and r.plate <> p_plate) then
    return false;
  end if;
  update public.rides set report_id = p_report where id = p_ride;
  update public.reports set ride_verified = true where id = p_report;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- Invio con la corsa collegata: nuove versioni di submit_report e submit_ride_rating (parametro p_ride_id).
-- ---------------------------------------------------------------------
drop function public.submit_report(text, public.report_type, integer, text, text, text, text, text, text,
  numeric, integer, double precision, double precision);
drop function public.submit_ride_rating(text, integer, integer, public.report_type, text, text, numeric,
  integer, double precision, double precision);

create function public.submit_report(
  p_city text,
  p_type public.report_type,
  p_rating integer,
  p_description text,
  p_reporter_name text,
  p_plate text,
  p_license text,
  p_from text default null,
  p_to text default null,
  p_cost numeric default null,
  p_duration integer default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_ride_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_user();
  v_plate text := private.norm_plate(p_plate);
  v_license text := private.norm_plate(p_license);
  v_id uuid;
begin
  if char_length(trim(coalesce(p_reporter_name, ''))) < 3 then
    raise exception 'Nome e cognome obbligatori' using errcode = '22023';
  end if;
  if v_license = '' then
    raise exception 'Licenza obbligatoria' using errcode = '22023';
  end if;
  if v_plate !~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$' then
    raise exception 'Targa non valida (formato AB123CD)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.cities where key = p_city) then
    raise exception 'Città non valida' using errcode = '22023';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Valutazione da 1 a 5' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_description, ''))) < 20 then
    raise exception 'Descrizione di almeno 20 caratteri' using errcode = '22023';
  end if;

  -- Limiti anti-fake: massimo 5 segnalazioni al giorno, una per targa ogni 30 giorni.
  if (select count(*) from public.reports
      where author_id = v_uid and kind = 'segnalazione' and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Limite giornaliero di segnalazioni raggiunto' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reports r join private.reports_private p on p.report_id = r.id
             where r.author_id = v_uid and p.plate = v_plate and r.created_at > now() - interval '30 days') then
    raise exception 'Hai già segnalato questa targa negli ultimi 30 giorni' using errcode = 'P0001';
  end if;

  insert into public.reports (author_id, kind, city_key, type, rating, description, from_place, to_place,
    cost_eur, duration_min, lat, lng, plate_masked, verified)
  values (v_uid, 'segnalazione', p_city, p_type, p_rating, trim(p_description), nullif(trim(p_from), ''),
    nullif(trim(p_to), ''), p_cost, p_duration, p_lat, p_lng, private.mask_plate(v_plate),
    private.is_verified_user(v_uid))
  returning id into v_id;

  insert into private.reports_private (report_id, reporter_name, plate, license)
  values (v_id, trim(p_reporter_name), v_plate, v_license);

  perform private.claim_ride(p_ride_id, v_uid, v_id, v_plate);
  return v_id;
end $$;

create function public.submit_ride_rating(
  p_city text,
  p_driver_rating integer,
  p_ride_rating integer,
  p_type public.report_type default 'positiva',
  p_comment text default null,
  p_plate text default null,
  p_cost numeric default null,
  p_duration integer default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_ride_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_user();
  v_plate text := nullif(private.norm_plate(p_plate), '');
  v_rating integer;
  v_type public.report_type := coalesce(p_type, 'positiva');
  v_id uuid;
begin
  if p_driver_rating is null or p_driver_rating not between 1 and 5
     or p_ride_rating is null or p_ride_rating not between 1 and 5 then
    raise exception 'Dai un voto da 1 a 5 al tassista e alla corsa' using errcode = '22023';
  end if;
  if v_plate is not null and v_plate !~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$' then
    raise exception 'Targa non valida (formato AB123CD)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.cities where key = p_city) then
    raise exception 'Città non valida' using errcode = '22023';
  end if;
  if (select count(*) from public.reports
      where author_id = v_uid and kind = 'valutazione_corsa' and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Limite giornaliero di valutazioni raggiunto' using errcode = 'P0001';
  end if;

  v_rating := round((p_driver_rating + p_ride_rating) / 2.0);
  if v_type = 'positiva' and v_rating <= 2 then v_type := 'altro'; end if;

  insert into public.reports (author_id, kind, city_key, type, rating, driver_rating, ride_rating, description,
    cost_eur, duration_min, lat, lng, plate_masked, verified)
  values (v_uid, 'valutazione_corsa', p_city, v_type, v_rating, p_driver_rating, p_ride_rating,
    coalesce(nullif(trim(p_comment), ''),
             case when v_type = 'positiva' then 'Corsa valutata positivamente.' else 'Corsa valutata con criticità.' end),
    p_cost, p_duration, p_lat, p_lng, case when v_plate is not null then private.mask_plate(v_plate) end,
    private.is_verified_user(v_uid))
  returning id into v_id;

  if v_plate is not null then
    insert into private.reports_private (report_id, plate) values (v_id, v_plate);
  end if;
  perform private.claim_ride(p_ride_id, v_uid, v_id, v_plate);
  return v_id;
end $$;

revoke all on function private.distance_m(double precision, double precision, double precision, double precision),
  private.ride_is_valid(public.rides), private.claim_ride(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.start_ride(text), public.ride_ping(uuid, double precision, double precision), public.end_ride(uuid),
  public.submit_report(text, public.report_type, integer, text, text, text, text, text, text, numeric, integer,
    double precision, double precision, uuid),
  public.submit_ride_rating(text, integer, integer, public.report_type, text, text, numeric, integer,
    double precision, double precision, uuid) from public, anon;
grant execute on function public.start_ride(text), public.ride_ping(uuid, double precision, double precision), public.end_ride(uuid),
  public.submit_report(text, public.report_type, integer, text, text, text, text, text, text, numeric, integer,
    double precision, double precision, uuid),
  public.submit_ride_rating(text, integer, integer, public.report_type, text, text, numeric, integer,
    double precision, double precision, uuid) to authenticated;
