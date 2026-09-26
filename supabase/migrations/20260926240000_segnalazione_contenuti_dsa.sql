-- Safe Taxi · punto 5: segnalazione di contenuti illeciti o contrari ai termini (Digital Services Act,
-- Reg. UE 2022/2065, artt. 16 e 17).
--
-- - Chiunque (anche con accesso anonimo) segnala una segnalazione o una replica pubblicata: categoria,
--   spiegazione, nome ed email, dichiarazione di buona fede (art. 16, par. 2).
-- - Il moderatore decide (rimuovere o mantenere) sempre con una motivazione: il segnalante vede l'esito nel
--   profilo (art. 16, par. 5), l'autore di un contenuto rimosso vede il motivo tra le sue segnalazioni (art. 17).
-- - Nome ed email del segnalante sono solo per i moderatori e si cancellano con l'account.
-- - Se un contenuto pubblicato viene rimosso, i punti ricevuti per quel contenuto vengono tolti.

create table public.content_notices (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports (id) on delete cascade,
  reply_id uuid references public.driver_replies (id) on delete cascade,
  category text not null check (category in ('dati_personali', 'diffamatorio', 'offensivo', 'falso', 'altro')),
  explanation text not null check (char_length(explanation) between 20 and 2000),
  notifier_id uuid references public.profiles (id) on delete set null,
  status text not null default 'ricevuta' check (status in ('ricevuta', 'accolta', 'respinta')),
  decision_reason text,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint content_notices_one_target check ((report_id is null) <> (reply_id is null))
);
create index content_notices_status_idx on public.content_notices (status, created_at);
create index content_notices_notifier_idx on public.content_notices (notifier_id, created_at desc);
create index content_notices_report_idx on public.content_notices (report_id);
create index content_notices_reply_idx on public.content_notices (reply_id);
create index content_notices_decided_by_idx on public.content_notices (decided_by);

create table private.content_notice_contacts (
  notice_id uuid primary key references public.content_notices (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 120),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200)
);

revoke all on public.content_notices from anon, authenticated;
revoke all on private.content_notice_contacts from public, anon, authenticated;
alter table public.content_notices enable row level security;
alter table private.content_notice_contacts enable row level security;

create function public.submit_content_notice(p_kind text, p_target uuid, p_category text, p_explanation text,
  p_name text, p_email text, p_good_faith boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_user();
  v_id uuid;
begin
  if p_kind not in ('segnalazione', 'replica') then
    raise exception 'Contenuto non valido' using errcode = '22023';
  end if;
  if (p_kind = 'segnalazione' and not exists (select 1 from public.reports where id = p_target and status = 'pubblicata'))
     or (p_kind = 'replica' and not exists (select 1 from public.driver_replies where id = p_target and status = 'pubblicata')) then
    raise exception 'Contenuto non trovato' using errcode = 'P0002';
  end if;
  if p_category is null or p_category not in ('dati_personali', 'diffamatorio', 'offensivo', 'falso', 'altro') then
    raise exception 'Scegli il motivo della segnalazione' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_explanation, ''))) < 20 then
    raise exception 'Spiega il motivo in almeno 20 caratteri' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 3 then
    raise exception 'Indica nome e cognome' using errcode = '22023';
  end if;
  if coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Indica un indirizzo email valido' using errcode = '22023';
  end if;
  if not coalesce(p_good_faith, false) then
    raise exception 'Serve la dichiarazione di buona fede' using errcode = '22023';
  end if;
  if (select count(*) from public.content_notices where notifier_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Limite giornaliero di segnalazioni raggiunto' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.content_notices where notifier_id = v_uid and status = 'ricevuta'
             and (report_id = p_target or reply_id = p_target)) then
    raise exception 'Hai già segnalato questo contenuto: la verifica è in corso' using errcode = 'P0001';
  end if;

  insert into public.content_notices (report_id, reply_id, category, explanation, notifier_id)
  values (case when p_kind = 'segnalazione' then p_target end, case when p_kind = 'replica' then p_target end,
          p_category, left(trim(p_explanation), 2000), v_uid)
  returning id into v_id;
  insert into private.content_notice_contacts (notice_id, name, email) values (v_id, left(trim(p_name), 120), lower(trim(p_email)));
  return v_id;
end $$;

-- Le segnalazioni di contenuti fatte dall'utente, con l'esito e la motivazione.
create function public.my_content_notices()
returns table (id uuid, kind text, content text, category text, status text, decision_reason text, created_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select n.id, case when n.report_id is not null then 'segnalazione' else 'replica' end,
         left(coalesce(r.description, d.body), 140), n.category, n.status, n.decision_reason, n.created_at, n.decided_at
    from public.content_notices n
    left join public.reports r on r.id = n.report_id
    left join public.driver_replies d on d.id = n.reply_id
   where n.notifier_id = (select auth.uid())
   order by n.created_at desc
   limit 50;
$$;

-- Decisione del moderatore, sempre motivata. p_remove = true rimuove il contenuto (e toglie i punti ricevuti).
create function public.resolve_content_notice(p_id uuid, p_remove boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare n public.content_notices;
begin
  if not private.is_moderator() then
    raise exception 'Solo i moderatori possono decidere' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Scrivi la motivazione della decisione (almeno 10 caratteri)' using errcode = '22023';
  end if;
  select * into n from public.content_notices where id = p_id and status = 'ricevuta' for update;
  if not found then
    raise exception 'Segnalazione non trovata o già decisa' using errcode = 'P0002';
  end if;

  if p_remove then
    if n.report_id is not null then
      update public.reports set status = 'rifiutata', moderated_by = auth.uid(), moderated_at = now(),
        rejection_reason = 'Rimossa dopo una segnalazione: ' || trim(p_reason)
       where id = n.report_id;
      insert into public.points_ledger (user_id, delta, reason, report_id)
      select l.user_id, -sum(l.delta), 'Segnalazione rimossa dopo verifica', n.report_id
        from public.points_ledger l where l.report_id = n.report_id and l.delta > 0
       group by l.user_id having sum(l.delta) > 0
      on conflict (report_id, reason) do nothing;
    else
      update public.driver_replies set status = 'rifiutata', moderated_by = auth.uid(), moderated_at = now(),
        rejection_reason = 'Rimossa dopo una segnalazione: ' || trim(p_reason)
       where id = n.reply_id;
    end if;
    -- Le altre segnalazioni aperte sullo stesso contenuto si chiudono con la stessa decisione.
    update public.content_notices set status = 'accolta', decision_reason = trim(p_reason), decided_by = auth.uid(), decided_at = now()
     where status = 'ricevuta' and (report_id = n.report_id or reply_id = n.reply_id);
  else
    update public.content_notices set status = 'respinta', decision_reason = trim(p_reason), decided_by = auth.uid(), decided_at = now()
     where id = p_id;
  end if;
end $$;

-- Coda di moderazione: si aggiungono le segnalazioni di contenuti, con i dati del segnalante.
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

-- Cancellazione dell'account: si cancellano anche nome ed email lasciati nelle segnalazioni di contenuti
-- (la segnalazione resta, anonima, per la tracciabilità delle decisioni).
create or replace function public.purge_account_data(p_uid uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare v_paths text[];
begin
  select coalesce(array_agg(a.storage_path), '{}') into v_paths
    from public.attachments a join public.reports r on r.id = a.report_id
   where r.author_id = p_uid and r.status <> 'pubblicata';
  delete from public.reports where author_id = p_uid and status <> 'pubblicata';
  delete from public.driver_replies where author_id = p_uid and status <> 'pubblicata';
  delete from private.driver_reply_contacts c using public.driver_replies d
   where c.reply_id = d.id and d.author_id = p_uid;
  update private.reports_private p set reporter_name = null
    from public.reports r where r.id = p.report_id and r.author_id = p_uid;
  delete from private.content_notice_contacts c using public.content_notices n
   where c.notice_id = n.id and n.notifier_id = p_uid;
  return v_paths;
end $$;

revoke all on function public.submit_content_notice(text, uuid, text, text, text, text, boolean), public.my_content_notices(),
  public.resolve_content_notice(uuid, boolean, text) from public, anon;
grant execute on function public.submit_content_notice(text, uuid, text, text, text, text, boolean), public.my_content_notices(),
  public.resolve_content_notice(uuid, boolean, text) to authenticated;
