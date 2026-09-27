-- Safe Taxi · pubblicazione come le grandi piattaforme di recensioni (decisione del 27/09/2026).
--
-- - Controlli automatici su ogni testo (private.text_flags): dati personali di terzi (telefoni, email, nomi),
--   etichette di reato ("truffatore", "ladro"...) e insulti. Le stesse regole sono in src/lib/textcheck.js per
--   avvisare chi scrive mentre scrive.
-- - Account verificato + nessun problema trovato => la segnalazione è pubblicata subito.
--   Ospiti (accesso anonimo) o testi segnalati dai controlli => prima la revisione di un moderatore.
-- - Dopo la pubblicazione: controllo a campione dei moderatori (coda "recent_auto") e segnalazioni DSA.
-- - Punti anche alla pubblicazione immediata; +20 per gli allegati quando vengono registrati su una
--   segnalazione già pubblicata; tolti se il contenuto viene rimosso (remove_report).
-- - Nuovo campo oggettivo: importo indicato dal tassametro (meter_eur), accanto all'importo pagato.
-- Principio: si pubblicano i fatti (diritto di critica: verità, pertinenza, continenza); le etichette e gli
-- insulti vanno in revisione. Analisi in docs/legal/assessment-recensioni-e-reati.md.

-- ---------------------------------------------------------------------
-- Controlli automatici sul testo
-- ---------------------------------------------------------------------
create function private.text_flags(p text) returns text[]
language sql immutable set search_path = '' as $$
  select array_remove(array[
    case when coalesce(p, '') ~* '[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}'
           or coalesce(p, '') ~* '(\+39[ .-]?)?\m3[0-9]{2}[ .-]?[0-9]{3}[ .-]?[0-9]{3,4}\M'
           or coalesce(p, '') ~* '\m0[0-9]{1,3}[ ./-]?[0-9]{5,8}\M'
           or coalesce(p, '') ~ '(si chiama|di nome|il signor|la signora)[[:space:]]+[A-ZÀ-Ý][a-zà-ÿ]+'
         then 'dati_personali' end,
    case when coalesce(p, '') ~* '\m(truffator|truffatric|ladr[oi]\M|ladron|criminal|delinquent|mafios|estorsor|spacciator|stuprator|farabutt|imbroglion)'
         then 'etichetta_reato' end,
    case when coalesce(p, '') ~* '\m(stronz|bastard|coglion|merd|cazz|vaffancul|fancul|idiot|deficient|imbecill|cretin|porc[oa]\M|troi[ae]\M|puttan|zoccol|froci|negr[oi]\M|zingar|terron)'
         then 'insulto' end
  ], null);
$$;

alter table public.reports
  add column auto_flags text[] not null default '{}',
  add column meter_eur numeric(8, 2) check (meter_eur >= 0 and meter_eur <= 2000);
grant select (meter_eur) on public.reports to anon, authenticated;
create index reports_recent_auto_idx on public.reports (created_at desc) where moderated_by is null and status = 'pubblicata';

-- ---------------------------------------------------------------------
-- Invio: pubblicazione immediata se l'account è verificato e i controlli non trovano nulla
-- ---------------------------------------------------------------------
drop function public.submit_report(text, public.report_type, integer, text, text, text, text, text, text,
  numeric, integer, double precision, double precision, uuid);

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

create or replace function public.submit_ride_rating(
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
  v_verified boolean := private.is_verified_user(v_uid);
  v_flags text[] := private.text_flags(p_comment);
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
    cost_eur, duration_min, lat, lng, plate_masked, verified, auto_flags, status)
  values (v_uid, 'valutazione_corsa', p_city, v_type, v_rating, p_driver_rating, p_ride_rating,
    coalesce(nullif(trim(p_comment), ''),
             case when v_type = 'positiva' then 'Corsa valutata positivamente.' else 'Corsa valutata con criticità.' end),
    p_cost, p_duration, p_lat, p_lng, case when v_plate is not null then private.mask_plate(v_plate) end,
    v_verified, v_flags,
    case when v_verified and cardinality(v_flags) = 0 then 'pubblicata' else 'in_moderazione' end::public.report_status)
  returning id into v_id;

  if v_plate is not null then
    insert into private.reports_private (report_id, plate) values (v_id, v_plate);
  end if;
  perform private.claim_ride(p_ride_id, v_uid, v_id, v_plate);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Punti: anche alla pubblicazione immediata e per gli allegati aggiunti dopo
-- ---------------------------------------------------------------------
create or replace function private.award_points_on_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pubblicata' and (tg_op = 'INSERT' or old.status is distinct from 'pubblicata')
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

drop trigger reports_award_points on public.reports;
create trigger reports_award_points
  after insert or update of status on public.reports
  for each row execute function private.award_points_on_publish();

create function private.award_points_on_attachment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.points_ledger (user_id, delta, reason, report_id)
  select r.author_id, 20, 'Allegati a supporto', r.id
    from public.reports r
   where r.id = new.report_id and r.status = 'pubblicata' and r.kind = 'segnalazione'
     and r.verified and r.author_id is not null
  on conflict (report_id, reason) do nothing;
  return new;
end $$;

create trigger attachments_award_points
  after insert on public.attachments
  for each row execute function private.award_points_on_attachment();

-- ---------------------------------------------------------------------
-- Moderazione dopo la pubblicazione
-- ---------------------------------------------------------------------
-- Rimuove una segnalazione pubblicata, sempre con motivazione (che l'autore vede); toglie i punti ricevuti.
create function public.remove_report(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_moderator() then
    raise exception 'Solo i moderatori possono rimuovere' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Scrivi la motivazione della rimozione (almeno 10 caratteri)' using errcode = '22023';
  end if;
  update public.reports set status = 'rifiutata', moderated_by = auth.uid(), moderated_at = now(),
    rejection_reason = 'Rimossa dopo verifica: ' || trim(p_reason)
   where id = p_id and status = 'pubblicata';
  if not found then
    raise exception 'Segnalazione pubblicata non trovata' using errcode = 'P0002';
  end if;
  insert into public.points_ledger (user_id, delta, reason, report_id)
  select l.user_id, -sum(l.delta), 'Segnalazione rimossa dopo verifica', p_id
    from public.points_ledger l where l.report_id = p_id and l.delta > 0
   group by l.user_id having sum(l.delta) > 0
  on conflict (report_id, reason) do nothing;
end $$;

-- Coda: si aggiungono i segnali dei controlli automatici e le pubblicazioni automatiche da controllare a campione.
create or replace function public.moderation_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_moderator() then
    raise exception 'Solo i moderatori possono vedere la coda' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'reports', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.created_at) from (
        select r.id, r.kind, r.city_key, r.type, r.rating, r.driver_rating, r.ride_rating, r.description, r.from_place,
               r.to_place, r.cost_eur, r.meter_eur, r.duration_min, r.lat, r.lng, r.verified, r.ride_verified, r.auto_flags,
               r.created_at, (r.author_id is null) as author_deleted,
               p.reporter_name, p.plate, p.license,
               coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'storage_path', a.storage_path,
                   'mime_type', a.mime_type, 'faces_detected', a.faces_detected, 'plates_blurred', a.plates_blurred,
                   'is_public', a.is_public) order by a.created_at)
                 from public.attachments a where a.report_id = r.id), '[]'::jsonb) as attachments
        from public.reports r left join private.reports_private p on p.report_id = r.id
        where r.status = 'in_moderazione'
        order by r.created_at
        limit 100) q), '[]'::jsonb),
    'recent_auto', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
        select r.id, r.kind, r.city_key, r.type, r.rating, r.description, r.cost_eur, r.meter_eur, r.ride_verified,
               r.created_at, p.plate
        from public.reports r left join private.reports_private p on p.report_id = r.id
        where r.status = 'pubblicata' and r.moderated_by is null and not r.is_demo
          and r.created_at > now() - interval '7 days'
        order by r.created_at desc
        limit 50) q), '[]'::jsonb),
    'published_with_photos', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
        select r.id, r.city_key, r.type, r.description, r.created_at,
               jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'storage_path', a.storage_path,
                 'mime_type', a.mime_type, 'faces_detected', a.faces_detected, 'plates_blurred', a.plates_blurred,
                 'is_public', a.is_public) order by a.created_at) as attachments
        from public.reports r join public.attachments a on a.report_id = r.id and a.kind = 'foto' and not a.is_public
        where r.status = 'pubblicata'
        group by r.id
        order by r.created_at desc
        limit 50) q), '[]'::jsonb),
    'replies', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.created_at) from (
        select d.id, d.report_id, d.body, d.created_at, c.contact, c.identifier, c.identifier_matches,
               r.description as report_description, r.city_key, r.plate_masked
        from public.driver_replies d
        join private.driver_reply_contacts c on c.reply_id = d.id
        join public.reports r on r.id = d.report_id
        where d.status = 'in_moderazione'
        order by d.created_at
        limit 100) q), '[]'::jsonb),
    'notices', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.created_at) from (
        select n.id, case when n.report_id is not null then 'segnalazione' else 'replica' end as kind,
               n.category, n.explanation, n.created_at, c.name as notifier_name, c.email as notifier_email,
               coalesce(r.description, d.body) as content, coalesce(r.city_key, rr.city_key) as city_key,
               coalesce(r.plate_masked, rr.plate_masked) as plate_masked
        from public.content_notices n
        left join private.content_notice_contacts c on c.notice_id = n.id
        left join public.reports r on r.id = n.report_id
        left join public.driver_replies d on d.id = n.reply_id
        left join public.reports rr on rr.id = d.report_id
        where n.status = 'ricevuta'
        order by n.created_at
        limit 100) q), '[]'::jsonb));
end $$;

-- Allegati: con la pubblicazione immediata l'autore li carica anche sulla propria segnalazione già pubblicata,
-- sempre entro un'ora dall'invio. Le foto restano private finché un moderatore non le approva.
create or replace function private.can_attach(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|mp4|mov|webm|3gp|mp3|m4a|aac|weba|ogg|wav|3ga|amr)$'
    and exists (
      select 1 from public.reports r
      where r.id::text = split_part(p_name, '/', 1)
        and r.author_id = (select auth.uid())
        and r.status in ('in_moderazione', 'pubblicata')
        and r.created_at > now() - interval '1 hour')
    and (select count(*) from storage.objects o
         where o.bucket_id = 'attachments' and split_part(o.name, '/', 1) = split_part(p_name, '/', 1)) < 6;
$$;

revoke all on function private.text_flags(text), private.award_points_on_attachment() from public, anon, authenticated;
revoke all on function public.submit_report(text, public.report_type, integer, text, text, text, text, text, text, numeric,
  integer, double precision, double precision, uuid, numeric), public.remove_report(uuid, text) from public, anon;
grant execute on function public.submit_report(text, public.report_type, integer, text, text, text, text, text, text, numeric,
  integer, double precision, double precision, uuid, numeric), public.remove_report(uuid, text) to authenticated;
