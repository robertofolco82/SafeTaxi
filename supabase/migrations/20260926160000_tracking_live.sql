-- Safe Taxi · punto 3: tracking live con link temporaneo.
--
-- Chi è in corsa crea una condivisione e manda il link a un contatto, che vede la posizione senza account.
-- Privacy:
-- - il link contiene un token casuale di 192 bit; nel database c'è solo la sua impronta SHA-256;
-- - la condivisione scade (3 ore di norma, massimo 6) e ne resta attiva una sola per utente;
-- - alla fine della corsa le posizioni vengono cancellate subito: chi guarda vede solo "corsa conclusa";
-- - le condivisioni vecchie vengono eliminate del tutto dopo 24 ore.
-- Tutto passa da funzioni: nessun client legge o scrive direttamente le tabelle.

create table public.ride_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  plate_masked text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  last_street text check (char_length(last_street) <= 200),
  last_update timestamptz
);
create index ride_shares_owner_idx on public.ride_shares (owner_id, created_at desc);

create table public.ride_share_points (
  id bigint generated always as identity primary key,
  share_id uuid not null references public.ride_shares (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  recorded_at timestamptz not null default now()
);
create index ride_share_points_share_idx on public.ride_share_points (share_id, recorded_at);

revoke all on public.ride_shares, public.ride_share_points from anon, authenticated;
alter table public.ride_shares enable row level security;
alter table public.ride_share_points enable row level security;

create function private.token_hash(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'), 'hex');
$$;

-- Pulizia: posizioni delle condivisioni finite o scadute subito, righe intere dopo 24 ore.
create function private.cleanup_ride_shares() returns void
language sql security definer set search_path = '' as $$
  delete from public.ride_share_points p using public.ride_shares s
   where p.share_id = s.id and (s.ended_at is not null or s.expires_at < now());
  delete from public.ride_shares where coalesce(ended_at, expires_at) < now() - interval '24 hours';
$$;

create function public.start_ride_share(p_hours integer default 3, p_plate text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_user();
  v_token text := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  v_plate text := nullif(private.norm_plate(p_plate), '');
  v_id uuid;
  v_expires timestamptz := now() + make_interval(hours => least(greatest(coalesce(p_hours, 3), 1), 6));
begin
  perform private.cleanup_ride_shares();
  -- Una sola condivisione attiva per utente: le precedenti si chiudono (e perdono le posizioni).
  update public.ride_shares set ended_at = now(), last_street = null
   where owner_id = v_uid and ended_at is null and expires_at > now();
  delete from public.ride_share_points p using public.ride_shares s
   where p.share_id = s.id and s.owner_id = v_uid and s.ended_at is not null;
  insert into public.ride_shares (owner_id, token_hash, plate_masked, expires_at)
  values (v_uid, private.token_hash(v_token),
          case when v_plate ~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$' then private.mask_plate(v_plate) end, v_expires)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end $$;

-- Nuova posizione: solo dal proprietario, su condivisione attiva, al massimo una ogni 4 secondi e 3.000 in tutto.
create function public.update_ride_share(p_id uuid, p_lat double precision, p_lng double precision, p_street text default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_last timestamptz;
begin
  select last_update into v_last from public.ride_shares
   where id = p_id and owner_id = (select auth.uid()) and ended_at is null and expires_at > now();
  if not found then
    raise exception 'Condivisione non attiva' using errcode = 'P0002';
  end if;
  if v_last > now() - interval '4 seconds'
     or (select count(*) from public.ride_share_points where share_id = p_id) >= 3000 then
    return false;
  end if;
  insert into public.ride_share_points (share_id, lat, lng) values (p_id, p_lat, p_lng);
  update public.ride_shares set last_street = left(nullif(trim(p_street), ''), 200), last_update = now() where id = p_id;
  return true;
end $$;

create function public.end_ride_share(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.ride_shares set ended_at = coalesce(ended_at, now()), last_street = null
   where id = p_id and owner_id = (select auth.uid());
  delete from public.ride_share_points where share_id = p_id
   and exists (select 1 from public.ride_shares s where s.id = p_id and s.owner_id = (select auth.uid()));
end $$;

-- Lettura per chi ha il link (anche senza account).
create function public.get_ride_share(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.ride_shares;
begin
  select * into s from public.ride_shares where token_hash = private.token_hash(p_token);
  if not found then return jsonb_build_object('status', 'non_trovata'); end if;
  if s.ended_at is not null then return jsonb_build_object('status', 'conclusa', 'ended_at', s.ended_at); end if;
  if s.expires_at <= now() then return jsonb_build_object('status', 'scaduta', 'expires_at', s.expires_at); end if;
  return jsonb_build_object('status', 'attiva', 'expires_at', s.expires_at, 'plate_masked', s.plate_masked,
    'street', s.last_street, 'updated_at', s.last_update,
    'points', coalesce((select jsonb_agg(jsonb_build_array(q.lat, q.lng) order by q.recorded_at)
      from (select lat, lng, recorded_at from public.ride_share_points where share_id = s.id
            order by recorded_at desc limit 500) q), '[]'::jsonb));
end $$;

revoke all on function private.token_hash(text), private.cleanup_ride_shares() from public, anon, authenticated;
revoke all on function public.start_ride_share(integer, text), public.update_ride_share(uuid, double precision, double precision, text),
  public.end_ride_share(uuid), public.get_ride_share(text) from public, anon;
grant execute on function public.start_ride_share(integer, text), public.update_ride_share(uuid, double precision, double precision, text),
  public.end_ride_share(uuid) to authenticated;
grant execute on function public.get_ride_share(text) to anon, authenticated;
