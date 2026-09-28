-- Safe Taxi · miglioramenti IMP-01 e IMP-02 (backlog in docs/improvements-app.md, decisioni di Roberto del 27/09/2026).
--
-- IMP-01 — submit_report: la descrizione dipende dalle stelle.
--   - 4–5 stelle: basta un carattere (anche "OK").
--   - 1–3 stelle: almeno 20 caratteri, con la descrizione dell'accaduto.
--   Tutto il resto resta come in 20260927100000_pubblicazione_automatica.sql (pubblicazione automatica, text_flags,
--   p_meter, limiti anti-fake). Restano invariati i 20 caratteri di replica del tassista e segnalazione DSA.
--
-- IMP-02 — get_driver_rating: ricerca con targa, licenza o entrambe.
--   - Nuova firma get_driver_rating(p_plate, p_license): con un solo campo cerca su quello; con entrambi cerca le
--     segnalazioni che corrispondono a tutti e due.
--   - Restano le regole di 20260927120000_ricerca_targa.sql: accesso obbligatorio, 5 ricerche all'ora per utente e
--     30 per indirizzo di rete, soglia di 5 segnalazioni verificate, elenco delle segnalazioni del taxi.
--   - La vecchia get_driver_rating(p_query) si elimina: l'app aggiornata chiama solo la nuova.

create or replace function public.submit_report(
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
  p_ride_id uuid default null,
  p_meter numeric default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_user();
  v_plate text := private.norm_plate(p_plate);
  v_license text := private.norm_plate(p_license);
  v_verified boolean := private.is_verified_user(v_uid);
  v_flags text[];
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
  -- IMP-01: con 4–5 stelle basta anche "OK"; con 1–3 stelle serve la descrizione dell'accaduto (almeno 20 caratteri).
  if p_rating <= 3 and char_length(trim(coalesce(p_description, ''))) < 20 then
    raise exception 'Per una valutazione da 1 a 3 stelle descrivi l''accaduto in almeno 20 caratteri' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_description, ''))) < 1 then
    raise exception 'Scrivi almeno un commento (anche solo "OK")' using errcode = '22023';
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

  v_flags := private.text_flags(concat_ws(' ', p_description, p_from, p_to));
  insert into public.reports (author_id, kind, city_key, type, rating, description, from_place, to_place,
    cost_eur, meter_eur, duration_min, lat, lng, plate_masked, verified, auto_flags, status)
  values (v_uid, 'segnalazione', p_city, p_type, p_rating, trim(p_description), nullif(trim(p_from), ''),
    nullif(trim(p_to), ''), p_cost, p_meter, p_duration, p_lat, p_lng, private.mask_plate(v_plate),
    v_verified, v_flags,
    case when v_verified and cardinality(v_flags) = 0 then 'pubblicata' else 'in_moderazione' end::public.report_status)
  returning id into v_id;

  insert into private.reports_private (report_id, reporter_name, plate, license)
  values (v_id, trim(p_reporter_name), v_plate, v_license);

  perform private.claim_ride(p_ride_id, v_uid, v_id, v_plate);
  return v_id;
end $$;

-- Il taxi cercato corrisponde alla segnalazione: su un solo campo, o su entrambi se sono stati indicati tutti e due.
create function private.taxi_matches(p_row_plate text, p_row_license text, p_plate text, p_license text) returns boolean
language sql immutable set search_path = '' as $$
  select (char_length(p_plate) >= 2 or char_length(p_license) >= 2)
     and (char_length(p_plate) < 2 or p_row_plate = p_plate)
     and (char_length(p_license) < 2 or p_row_license = p_license);
$$;
revoke all on function private.taxi_matches(text, text, text, text) from public, anon, authenticated;

drop function public.get_driver_rating(text);

create function public.get_driver_rating(p_plate text default null, p_license text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_user();
  v_ip text := private.client_ip_hash();
  v_plate text := coalesce(private.norm_plate(p_plate), '');
  v_license text := coalesce(private.norm_plate(p_license), '');
  v_count integer;
  v_avg numeric;
  v_issues jsonb;
  v_reports jsonb;
begin
  delete from private.lookup_log where created_at < now() - interval '2 hours';
  if (select count(*) from private.lookup_log where user_id = v_uid and created_at > now() - interval '1 hour') >= 5
     or (v_ip is not null and (select count(*) from private.lookup_log where ip_hash = v_ip and created_at > now() - interval '1 hour') >= 30) then
    raise exception 'Hai raggiunto il limite di 5 ricerche in un''ora: riprova più tardi' using errcode = 'P0001';
  end if;
  insert into private.lookup_log (user_id, ip_hash) values (v_uid, v_ip);

  if char_length(v_plate) < 2 and char_length(v_license) < 2 then
    return jsonb_build_object('sufficient', false, 'verified_count', 0, 'min_required', 5);
  end if;
  select count(*), round(avg(r.rating), 1) into v_count, v_avg
  from public.reports r join private.reports_private p on p.report_id = r.id
  where r.status = 'pubblicata' and r.verified and private.taxi_matches(p.plate, p.license, v_plate, v_license);

  if v_count < 5 then
    return jsonb_build_object('sufficient', false, 'verified_count', v_count, 'min_required', 5);
  end if;

  select coalesce(jsonb_object_agg(t.type, t.n), '{}'::jsonb) into v_issues
  from (select r.type, count(*) as n
        from public.reports r join private.reports_private p on p.report_id = r.id
        where r.status = 'pubblicata' and r.verified and r.type <> 'positiva' and private.taxi_matches(p.plate, p.license, v_plate, v_license)
        group by r.type) t;

  -- Le segnalazioni pubblicate di questo taxi (le più recenti), con le repliche pubblicate del tassista.
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc), '[]'::jsonb) into v_reports
  from (select r.id, r.kind, r.city_key, r.type, r.rating, r.description, r.cost_eur, r.meter_eur, r.duration_min,
               r.verified, r.ride_verified, r.created_at,
               coalesce((select jsonb_agg(d.body order by d.created_at) from public.driver_replies d
                         where d.report_id = r.id and d.status = 'pubblicata'), '[]'::jsonb) as replies
        from public.reports r join private.reports_private p on p.report_id = r.id
        where r.status = 'pubblicata' and private.taxi_matches(p.plate, p.license, v_plate, v_license)
        order by r.created_at desc
        limit 20) q;

  return jsonb_build_object('sufficient', true, 'verified_count', v_count, 'min_required', 5,
    'plate_masked', private.mask_plate(case when char_length(v_plate) >= 2 then v_plate else v_license end), 'avg_rating', v_avg, 'issues', v_issues, 'reports', v_reports);
end $$;

revoke all on function public.get_driver_rating(text, text) from public, anon;
grant execute on function public.get_driver_rating(text, text) to authenticated;
