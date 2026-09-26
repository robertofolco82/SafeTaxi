-- Safe Taxi · blocco 2a: schema, regole di accesso (RLS) e funzioni.
--
-- Principi:
-- - I client non scrivono mai direttamente nelle tabelle: inviano segnalazioni e valutazioni solo tramite
--   le funzioni submit_report / submit_ride_rating, che validano i dati e applicano i limiti anti-fake.
-- - I dati personali (nome del segnalatore, targa, licenza) stanno nello schema private, mai esposto dalle API.
-- - Il pubblico vede solo le segnalazioni pubblicate, con targa mascherata e coordinate approssimate.
-- - I punti si assegnano alla pubblicazione, con gli stessi valori per positive e negative (Omnibus).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- Le funzioni di supporto usate nelle policy devono essere eseguibili dagli utenti: solo quelle ricevono EXECUTE.
grant usage on schema private to anon, authenticated;

-- =====================================================================
-- Tipi
-- =====================================================================
create type public.report_type as enum
  ('positiva', 'tariffa', 'rifiuto', 'percorso', 'comportamento', 'sicurezza', 'igiene', 'altro');
create type public.report_kind as enum ('segnalazione', 'valutazione_corsa');
create type public.report_status as enum ('in_moderazione', 'pubblicata', 'rifiutata');
create type public.user_role as enum ('utente', 'moderatore', 'admin');
create type public.attachment_kind as enum ('foto', 'video', 'audio');

-- =====================================================================
-- Profili utente (1:1 con auth.users, creati da trigger)
-- =====================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  role public.user_role not null default 'utente',
  created_at timestamptz not null default now()
);

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 80));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('moderatore', 'admin')
  );
$$;

-- =====================================================================
-- Città e cooperative (valori DEMO finché non verificati)
-- =====================================================================
create table public.cities (
  key text primary key check (key ~ '^[a-z_]+$'),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  licenses integer check (licenses >= 0),
  daily_demand integer check (daily_demand >= 0),
  tariff_start numeric(6, 2) check (tariff_start >= 0),
  tariff_km numeric(6, 2) check (tariff_km >= 0),
  is_demo boolean not null default true,
  source text
);

create table public.coops (
  id uuid primary key default gen_random_uuid(),
  city_key text not null references public.cities (key),
  name text not null,
  phone text check (phone ~ '^[0-9]{5,12}$'),
  features text[] not null default '{}',
  phone_verified boolean not null default false,
  is_demo boolean not null default true,
  created_at timestamptz not null default now()
);
create index coops_city_key_idx on public.coops (city_key);

-- =====================================================================
-- Segnalazioni e valutazioni di fine corsa
-- =====================================================================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  kind public.report_kind not null default 'segnalazione',
  city_key text not null references public.cities (key),
  type public.report_type not null,
  rating smallint not null check (rating between 1 and 5),
  driver_rating smallint check (driver_rating between 1 and 5),
  ride_rating smallint check (ride_rating between 1 and 5),
  description text not null check (char_length(description) between 1 and 2000),
  from_place text check (char_length(from_place) <= 120),
  to_place text check (char_length(to_place) <= 120),
  cost_eur numeric(7, 2) check (cost_eur >= 0 and cost_eur < 10000),
  duration_min integer check (duration_min > 0 and duration_min < 1440),
  -- Posizione esatta: visibile solo ai moderatori. Il pubblico vede lat_approx/lng_approx (circa 100 m).
  lat double precision check (lat between 35 and 48),
  lng double precision check (lng between 6 and 19),
  lat_approx numeric generated always as (round(lat::numeric, 3)) stored,
  lng_approx numeric generated always as (round(lng::numeric, 3)) stored,
  plate_masked text,
  -- verified: autore non anonimo con email confermata. Solo le verificate contano nei rating.
  verified boolean not null default false,
  -- ride_verified: collegata a una corsa tracciata nell'app (blocco 3).
  ride_verified boolean not null default false,
  status public.report_status not null default 'in_moderazione',
  moderated_by uuid references public.profiles (id) on delete set null,
  moderated_at timestamptz,
  rejection_reason text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index reports_status_created_idx on public.reports (status, created_at desc);
create index reports_city_idx on public.reports (city_key, status);
create index reports_author_idx on public.reports (author_id, created_at desc);
create index reports_moderated_by_idx on public.reports (moderated_by);

-- Dati personali della segnalazione: schema private, nessun accesso dalle API.
create table private.reports_private (
  report_id uuid primary key references public.reports (id) on delete cascade,
  reporter_name text check (char_length(reporter_name) between 3 and 120),
  plate text check (plate ~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$'),
  license text check (license ~ '^[A-Z0-9]{1,20}$'),
  created_at timestamptz not null default now()
);
create index reports_private_plate_idx on private.reports_private (plate);
create index reports_private_license_idx on private.reports_private (license);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  kind public.attachment_kind not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  exif_stripped boolean not null default false,
  faces_blurred boolean not null default false,
  plates_blurred boolean not null default false,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  -- Pubblicabili solo le foto ripulite: video e audio restano sempre riservati ai moderatori.
  constraint attachments_public_only_clean_photos
    check (not is_public or (kind = 'foto' and exif_stripped and faces_blurred and plates_blurred))
);
create index attachments_report_idx on public.attachments (report_id);

create table public.points_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null,
  report_id uuid references public.reports (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (report_id, reason)
);
create index points_ledger_user_idx on public.points_ledger (user_id, created_at desc);

create table public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_name text not null,
  url text check (url ~ '^https?://'),
  published_at timestamptz,
  is_placeholder boolean not null default false,
  created_at timestamptz not null default now(),
  -- Ogni notizia reale deve avere il link alla fonte.
  constraint news_url_required check (is_placeholder or url is not null)
);

-- Statistiche per tassista, solo per uso interno (moderatori e funzioni).
create view private.driver_stats as
  select p.plate, count(*) as verified_reports, round(avg(r.rating), 1) as avg_rating,
         count(*) filter (where r.type <> 'positiva') as negative_reports, max(r.created_at) as last_report_at
  from public.reports r join private.reports_private p on p.report_id = r.id
  where r.status = 'pubblicata' and r.verified and p.plate is not null
  group by p.plate;

-- =====================================================================
-- Privilegi e policy RLS
-- Supabase concede di default tutto ad anon e authenticated: si revoca e si riconcede il minimo.
-- =====================================================================
revoke all on public.profiles, public.cities, public.coops, public.reports, public.attachments,
  public.points_ledger, public.news from anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.cities enable row level security;
alter table public.coops enable row level security;
alter table public.reports enable row level security;
alter table public.attachments enable row level security;
alter table public.points_ledger enable row level security;
alter table public.news enable row level security;
alter table private.reports_private enable row level security;

-- Profili: ognuno vede il proprio, i moderatori tutti. Si può cambiare solo il nome visualizzato, mai il ruolo.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy "profilo: lettura propria o moderatore" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_moderator()));
create policy "profilo: modifica del proprio" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Dati di riferimento: lettura pubblica.
grant select on public.cities, public.coops, public.news to anon, authenticated;
create policy "città: lettura pubblica" on public.cities for select to anon, authenticated using (true);
create policy "cooperative: lettura pubblica" on public.coops for select to anon, authenticated using (true);
create policy "news: lettura pubblica" on public.news for select to anon, authenticated using (true);

-- Segnalazioni: solo le colonne pubbliche, solo le righe pubblicate.
-- Esclusi: author_id, lat/lng esatte, dati di moderazione. L'autore vede le proprie con my_reports().
grant select (id, kind, city_key, type, rating, driver_rating, ride_rating, description, from_place, to_place,
  cost_eur, duration_min, lat_approx, lng_approx, plate_masked, verified, ride_verified, status, is_demo, created_at)
  on public.reports to anon, authenticated;
create policy "segnalazioni: pubblicate visibili a tutti" on public.reports for select to anon, authenticated
  using (status = 'pubblicata');

-- Allegati: visibili solo se pubblici (foto ripulite) e la segnalazione è pubblicata.
grant select (id, report_id, kind, mime_type, is_public, created_at) on public.attachments to anon, authenticated;
create policy "allegati: pubblici di segnalazioni pubblicate" on public.attachments for select to anon, authenticated
  using (is_public and exists (select 1 from public.reports r where r.id = report_id and r.status = 'pubblicata'));

-- Punti: ognuno vede solo i propri movimenti. Nessuna scrittura dai client.
grant select on public.points_ledger to authenticated;
create policy "punti: solo i propri" on public.points_ledger for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on function private.is_moderator() from public;
grant execute on function private.is_moderator() to anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;

-- =====================================================================
-- Funzioni di supporto
-- =====================================================================
create function private.norm_plate(p text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create function private.mask_plate(p text) returns text
language sql immutable set search_path = '' as $$
  select case when char_length(p) < 4 then '•••' else left(p, 2) || '•••' || right(p, 2) end;
$$;

-- Verificato = utente non anonimo con email confermata (Google conferma l'email da sé).
create function private.is_verified_user(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select not coalesce(u.is_anonymous, false) and u.email_confirmed_at is not null
                   from auth.users u where u.id = uid), false);
$$;

create function private.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'Serve un accesso, anche anonimo' using errcode = '28000';
  end if;
  return v;
end $$;

revoke all on function private.norm_plate(text), private.mask_plate(text), private.is_verified_user(uuid),
  private.require_user() from public, anon, authenticated;

-- =====================================================================
-- Invio segnalazione (con limiti anti-fake)
-- =====================================================================
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
  p_lng double precision default null
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

  return v_id;
end $$;

-- =====================================================================
-- Valutazione di fine corsa (tassista e corsa separati; targa facoltativa)
-- =====================================================================
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
  p_lng double precision default null
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
  return v_id;
end $$;

-- =====================================================================
-- Consultazione
-- =====================================================================
-- Le segnalazioni dell'utente, con lo stato di moderazione.
create function public.my_reports()
returns table (id uuid, kind public.report_kind, city_key text, type public.report_type, rating smallint,
  description text, status public.report_status, rejection_reason text, verified boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.kind, r.city_key, r.type, r.rating, r.description, r.status, r.rejection_reason, r.verified, r.created_at
  from public.reports r
  where r.author_id = (select auth.uid())
  order by r.created_at desc;
$$;

-- Rating del tassista per targa o licenza: visibile solo con almeno 5 segnalazioni verificate e pubblicate.
create function public.get_driver_rating(p_query text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := private.norm_plate(p_query);
  v_count integer;
  v_avg numeric;
  v_issues jsonb;
begin
  if char_length(v_q) < 2 then
    return jsonb_build_object('sufficient', false, 'verified_count', 0, 'min_required', 5);
  end if;
  select count(*), round(avg(r.rating), 1) into v_count, v_avg
  from public.reports r join private.reports_private p on p.report_id = r.id
  where r.status = 'pubblicata' and r.verified and (p.plate = v_q or p.license = v_q);

  if v_count < 5 then
    return jsonb_build_object('sufficient', false, 'verified_count', v_count, 'min_required', 5);
  end if;

  select coalesce(jsonb_object_agg(t.type, t.n), '{}'::jsonb) into v_issues
  from (select r.type, count(*) as n
        from public.reports r join private.reports_private p on p.report_id = r.id
        where r.status = 'pubblicata' and r.verified and r.type <> 'positiva' and (p.plate = v_q or p.license = v_q)
        group by r.type) t;

  return jsonb_build_object('sufficient', true, 'verified_count', v_count, 'min_required', 5,
    'plate_masked', private.mask_plate(v_q), 'avg_rating', v_avg, 'issues', v_issues);
end $$;

-- Termometro Safe Taxi 0–100: solo segnalazioni pubblicate di utenti verificati,
-- peso dimezzato ogni 90 giorni. Stessa formula di src/lib/indices.js (indexOf).
create function public.get_thermometer(p_city text default null, p_now timestamptz default now())
returns table (idx integer, verified_count bigint, reports_count bigint)
language sql stable security invoker set search_path = '' as $$
  with w as (
    select r.rating, r.verified,
           power(0.5, extract(epoch from (p_now - r.created_at)) / 86400.0 / 90.0) as wt
    from public.reports r
    where r.status = 'pubblicata' and (p_city is null or r.city_key = p_city)
  )
  select case when sum(wt) filter (where verified) > 0
              then round(sum(wt * (rating - 1) * 25) filter (where verified) / sum(wt) filter (where verified))::integer
         end,
         count(*) filter (where verified),
         count(*)
  from w;
$$;

-- =====================================================================
-- Moderazione e punti
-- =====================================================================
create function public.moderate_report(p_id uuid, p_status public.report_status, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_moderator() then
    raise exception 'Solo i moderatori possono moderare' using errcode = '42501';
  end if;
  if p_status = 'in_moderazione' then
    raise exception 'Stato non valido' using errcode = '22023';
  end if;
  if p_status = 'rifiutata' and char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indica il motivo del rifiuto' using errcode = '22023';
  end if;
  update public.reports
     set status = p_status, moderated_by = auth.uid(), moderated_at = now(),
         rejection_reason = case when p_status = 'rifiutata' then trim(p_reason) end
   where id = p_id;
  if not found then
    raise exception 'Segnalazione non trovata' using errcode = 'P0002';
  end if;
end $$;

-- Punti alla pubblicazione. Il tipo (positiva/negativa) non entra nel calcolo: stessi punti per tutti.
create function private.award_points_on_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pubblicata' and old.status is distinct from 'pubblicata'
     and new.author_id is not null and new.verified then
    if new.kind = 'segnalazione' then
      insert into public.points_ledger (user_id, delta, reason, report_id)
      values (new.author_id, 50, 'Segnalazione completa', new.id)
      on conflict (report_id, reason) do nothing;
      if exists (select 1 from public.attachments a where a.report_id = new.id) then
        insert into public.points_ledger (user_id, delta, reason, report_id)
        values (new.author_id, 20, 'Allegati a supporto', new.id)
        on conflict (report_id, reason) do nothing;
      end if;
    else
      insert into public.points_ledger (user_id, delta, reason, report_id)
      values (new.author_id, 10, 'Valutazione di fine corsa', new.id)
      on conflict (report_id, reason) do nothing;
    end if;
  end if;
  return new;
end $$;

create trigger reports_award_points
  after update of status on public.reports
  for each row execute function private.award_points_on_publish();

-- Cancellazione dell'account: le segnalazioni restano anonime, il nome del segnalatore viene cancellato.
create function private.forget_reporter() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update private.reports_private p set reporter_name = null
    from public.reports r where r.id = p.report_id and r.author_id = old.id;
  return old;
end $$;

create trigger profiles_forget_reporter
  before delete on public.profiles
  for each row execute function private.forget_reporter();

revoke all on function private.award_points_on_publish(), private.forget_reporter() from public, anon, authenticated;

-- Esecuzione delle funzioni pubbliche: invio e consultazione personale solo con accesso (anche anonimo).
revoke all on function public.submit_report(text, public.report_type, integer, text, text, text, text, text, text,
  numeric, integer, double precision, double precision) from public, anon;
revoke all on function public.submit_ride_rating(text, integer, integer, public.report_type, text, text, numeric,
  integer, double precision, double precision) from public, anon;
revoke all on function public.my_reports() from public, anon;
revoke all on function public.moderate_report(uuid, public.report_status, text) from public, anon;
revoke all on function public.get_driver_rating(text) from public;
revoke all on function public.get_thermometer(text, timestamptz) from public;

grant execute on function public.submit_report(text, public.report_type, integer, text, text, text, text, text, text,
  numeric, integer, double precision, double precision) to authenticated;
grant execute on function public.submit_ride_rating(text, integer, integer, public.report_type, text, text, numeric,
  integer, double precision, double precision) to authenticated;
grant execute on function public.my_reports() to authenticated;
grant execute on function public.moderate_report(uuid, public.report_status, text) to authenticated;
grant execute on function public.get_driver_rating(text) to anon, authenticated;
grant execute on function public.get_thermometer(text, timestamptz) to anon, authenticated;
