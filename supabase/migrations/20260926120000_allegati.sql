-- Safe Taxi · blocco 2c: allegati (foto, video, audio).
--
-- Flusso: l'app elabora le foto sul dispositivo (niente metadati, volti pixelati), carica il file nel bucket privato
-- "attachments" con percorso <id segnalazione>/<uuid>.<estensione>, poi chiama la funzione register-attachment,
-- che verifica il file (formato, dimensione, assenza di EXIF/GPS nelle foto) e registra la riga in public.attachments.
-- Video e audio non diventano mai pubblici; una foto diventa pubblica solo dopo la revisione del moderatore
-- (targhe sfocate), come impone il vincolo attachments_public_only_clean_photos.

alter table public.attachments add column faces_detected smallint check (faces_detected >= 0);
comment on column public.attachments.faces_detected is 'Volti trovati e pixelati sul dispositivo (solo foto)';
comment on column public.attachments.exif_stripped is 'Verificato dal server: nessun metadato EXIF/XMP/IPTC nel file';

-- Il percorso contiene solo l'id della segnalazione e un nome casuale: nessun dato sull'autore.
grant select (storage_path) on public.attachments to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760, array[
  'image/jpeg',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav',
  'audio/3gpp', 'audio/amr'])
on conflict (id) do nothing;

-- Caricamento consentito solo all'autore, sulla propria segnalazione in moderazione inviata da meno di un'ora,
-- con al massimo 6 file e un nome nel formato previsto.
create function private.can_attach(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|mp4|mov|webm|3gp|mp3|m4a|aac|weba|ogg|wav|3ga|amr)$'
    and exists (
      select 1 from public.reports r
      where r.id::text = split_part(p_name, '/', 1)
        and r.author_id = (select auth.uid())
        and r.status = 'in_moderazione'
        and r.created_at > now() - interval '1 hour')
    and (select count(*) from storage.objects o
         where o.bucket_id = 'attachments' and split_part(o.name, '/', 1) = split_part(p_name, '/', 1)) < 6;
$$;

-- Lettura: moderatori, autore della segnalazione, e chiunque per le foto rese pubbliche di segnalazioni pubblicate.
create function private.can_read_attachment(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_moderator()
    or exists (select 1 from public.reports r
               where r.id::text = split_part(p_name, '/', 1) and r.author_id = (select auth.uid()))
    or exists (select 1 from public.attachments a join public.reports r on r.id = a.report_id
               where a.storage_path = p_name and a.is_public and r.status = 'pubblicata');
$$;

revoke all on function private.can_attach(text), private.can_read_attachment(text) from public;
grant execute on function private.can_attach(text) to authenticated;
grant execute on function private.can_read_attachment(text) to anon, authenticated;

create policy "allegati: caricamento dell'autore" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and private.can_attach(name));
create policy "allegati: lettura di autore, moderatori e foto pubbliche" on storage.objects for select to anon, authenticated
  using (bucket_id = 'attachments' and private.can_read_attachment(name));
-- Nessuna policy di modifica o cancellazione: i file restano come inviati (li gestiscono solo i moderatori dal pannello).
