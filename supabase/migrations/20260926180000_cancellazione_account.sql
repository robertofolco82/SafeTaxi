-- Safe Taxi · punto 4b: cancellazione dell'account (obbligatoria per App Store e Google Play).
--
-- La esegue la funzione delete-account (chiave di servizio), dopo aver verificato l'utente:
-- 1. purge_account_data() cancella segnalazioni e repliche non ancora pubblicate (con i riferimenti agli allegati)
--    e i contatti delle repliche; restituisce i percorsi dei file da cancellare dallo spazio file;
-- 2. la funzione cancella i file e poi l'utente da Supabase Auth: a cascata spariscono profilo, punti e
--    condivisioni della corsa; le segnalazioni pubblicate restano anonime e il nome del segnalatore viene
--    cancellato (trigger forget_reporter).

create function public.purge_account_data(p_uid uuid) returns text[]
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
  return v_paths;
end $$;

revoke all on function public.purge_account_data(uuid) from public, anon, authenticated;
grant execute on function public.purge_account_data(uuid) to service_role;
