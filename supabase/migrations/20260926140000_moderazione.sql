-- Safe Taxi · blocco 2d: pagina di moderazione e diritto di replica del tassista.
--
-- - moderation_queue(): coda per i moderatori con i dati riservati (nome del segnalatore, targa, licenza) e gli allegati.
-- - moderate_attachment(): il moderatore conferma le targhe e rende pubblica (o nasconde) una foto.
-- - Sostituzione di una foto con la versione a targhe sfocate: la esegue la funzione register-attachment
--   (modalità "replace"), che verifica anche il nuovo file.
-- - Repliche dei tassisti: sempre moderate. La corrispondenza tra targa/licenza indicata e segnalazione è visibile
--   solo al moderatore: chi invia non scopre mai se la targa che ha scritto è quella giusta.

-- =====================================================================
-- Allegati: tracciamento della moderazione e caricamento dei moderatori
-- =====================================================================
alter table public.attachments
  add column moderated_by uuid references public.profiles (id) on delete set null,
  add column moderated_at timestamptz;
create index attachments_moderated_by_idx on public.attachments (moderated_by);
comment on column public.attachments.plates_blurred is 'Il moderatore ha sfocato le targhe o verificato che non ce ne sono di leggibili';

-- I moderatori caricano la versione a targhe sfocate di una foto (poi registrata da register-attachment).
create policy "allegati: caricamento dei moderatori" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and private.is_moderator()
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$');

-- =====================================================================
-- Repliche dei tassisti
-- =====================================================================
create table public.driver_replies (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 20 and 1000),
  status public.report_status not null default 'in_moderazione',
  moderated_by uuid references public.profiles (id) on delete set null,
  moderated_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);
create index driver_replies_report_idx on public.driver_replies (report_id, status);
create index driver_replies_author_idx on public.driver_replies (author_id, created_at desc);
create index driver_replies_moderated_by_idx on public.driver_replies (moderated_by);

-- Contatto del tassista e identificativo indicato: solo per il moderatore.
create table private.driver_reply_contacts (
  reply_id uuid primary key references public.driver_replies (id) on delete cascade,
  contact text not null check (char_length(contact) between 5 and 200),
  identifier text not null,
  identifier_matches boolean not null
);

revoke all on public.driver_replies from anon, authenticated;
revoke all on private.driver_reply_contacts from public, anon, authenticated;
alter table public.driver_replies enable row level security;
alter table private.driver_reply_contacts enable row level security;

grant select (id, report_id, body, status, created_at) on public.driver_replies to anon, authenticated;
create policy "repliche: pubblicate visibili a tutti" on public.driver_replies for select to anon, authenticated
  using (status = 'pubblicata' and exists (select 1 from public.reports r where r.id = report_id and r.status = 'pubblicata'));

create function public.submit_driver_reply(p_report_id uuid, p_identifier text, p_contact text, p_body text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_user();
  v_id uuid;
  v_ident text := private.norm_plate(p_identifier);
  v_matches boolean;
begin
  if not exists (select 1 from public.reports where id = p_report_id and status = 'pubblicata') then
    raise exception 'Segnalazione non trovata' using errcode = 'P0002';
  end if;
  if char_length(v_ident) < 2 then
    raise exception 'Indica la targa o il numero di licenza' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_contact, ''))) < 5 then
    raise exception 'Indica un contatto (email o telefono) per la verifica' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_body, ''))) < 20 then
    raise exception 'La replica deve avere almeno 20 caratteri' using errcode = '22023';
  end if;
  if (select count(*) from public.driver_replies where author_id = v_uid and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'Limite giornaliero di repliche raggiunto' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.driver_replies where author_id = v_uid and report_id = p_report_id and status = 'in_moderazione') then
    raise exception 'Hai già una replica in verifica per questa segnalazione' using errcode = 'P0001';
  end if;

  select exists (select 1 from private.reports_private p where p.report_id = p_report_id and (p.plate = v_ident or p.license = v_ident))
    into v_matches;
  insert into public.driver_replies (report_id, author_id, body) values (p_report_id, v_uid, trim(p_body)) returning id into v_id;
  insert into private.driver_reply_contacts (reply_id, contact, identifier, identifier_matches)
    values (v_id, trim(p_contact), v_ident, v_matches);
  return v_id;  -- stessa risposta che l'identificativo corrisponda o no
end $$;

-- =====================================================================
-- Moderazione
-- =====================================================================
create function public.moderation_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_moderator() then
    raise exception 'Solo i moderatori possono vedere la coda' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'reports', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.created_at) from (
        select r.id, r.kind, r.city_key, r.type, r.rating, r.driver_rating, r.ride_rating, r.description, r.from_place,
               r.to_place, r.cost_eur, r.duration_min, r.lat, r.lng, r.verified, r.ride_verified, r.created_at,
               (r.author_id is null) as author_deleted,
               p.reporter_name, p.plate, p.license,
               coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'storage_path', a.storage_path,
                   'mime_type', a.mime_type, 'faces_detected', a.faces_detected, 'plates_blurred', a.plates_blurred,
                   'is_public', a.is_public) order by a.created_at)
                 from public.attachments a where a.report_id = r.id), '[]'::jsonb) as attachments
        from public.reports r left join private.reports_private p on p.report_id = r.id
        where r.status = 'in_moderazione'
        order by r.created_at
        limit 100) q), '[]'::jsonb),
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
        limit 100) q), '[]'::jsonb));
end $$;

-- Rende pubblica una foto (conferma delle targhe) o la nasconde. Video e audio restano sempre privati.
create function public.moderate_attachment(p_id uuid, p_public boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_kind public.attachment_kind;
begin
  if not private.is_moderator() then
    raise exception 'Solo i moderatori possono moderare' using errcode = '42501';
  end if;
  select kind into v_kind from public.attachments where id = p_id;
  if v_kind is null then raise exception 'Allegato non trovato' using errcode = 'P0002'; end if;
  if p_public and v_kind <> 'foto' then
    raise exception 'Video e audio non possono essere pubblicati' using errcode = '22023';
  end if;
  update public.attachments
     set is_public = p_public, plates_blurred = plates_blurred or p_public, moderated_by = auth.uid(), moderated_at = now()
   where id = p_id;
end $$;

create function public.moderate_reply(p_id uuid, p_status public.report_status, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_moderator() then
    raise exception 'Solo i moderatori possono moderare' using errcode = '42501';
  end if;
  if p_status = 'in_moderazione' then raise exception 'Stato non valido' using errcode = '22023'; end if;
  if p_status = 'rifiutata' and char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indica il motivo del rifiuto' using errcode = '22023';
  end if;
  update public.driver_replies
     set status = p_status, moderated_by = auth.uid(), moderated_at = now(),
         rejection_reason = case when p_status = 'rifiutata' then trim(p_reason) end
   where id = p_id;
  if not found then raise exception 'Replica non trovata' using errcode = 'P0002'; end if;
end $$;

-- Ruolo dell'utente collegato (per mostrare la pagina di moderazione; i controlli veri sono nelle funzioni).
create function public.my_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid());
$$;

revoke all on function public.submit_driver_reply(uuid, text, text, text), public.moderation_queue(),
  public.moderate_attachment(uuid, boolean), public.moderate_reply(uuid, public.report_status, text), public.my_role()
  from public, anon;
grant execute on function public.submit_driver_reply(uuid, text, text, text), public.moderation_queue(),
  public.moderate_attachment(uuid, boolean), public.moderate_reply(uuid, public.report_status, text), public.my_role()
  to authenticated;
