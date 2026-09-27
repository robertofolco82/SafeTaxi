-- Safe Taxi · ricerca per targa o licenza con le segnalazioni del taxi e limite di consultazione
-- (decisione di Roberto del 27/09/2026).
--
-- - Chi cerca una targa o una licenza vede rating, criticità e, con almeno 5 segnalazioni verificate, anche le
--   segnalazioni pubblicate di quel taxi (testo, data, importi, bollini) e le repliche del tassista.
-- - Sotto le 5 segnalazioni verificate non si mostra nulla (tutela del conducente, regola invariata).
-- - Limite: 5 ricerche all'ora per utente (anche anonimo: l'app crea l'accesso anonimo alla prima ricerca) e
--   30 all'ora per indirizzo di rete, contro chi crea account in serie. Il limite per indirizzo è più alto perché
--   molti operatori mobili fanno condividere lo stesso indirizzo pubblico a molti clienti.
-- - Dell'indirizzo si salva solo un'impronta (SHA-256 con un segreto casuale), cancellata dopo 2 ore.

create table private.lookup_salt (id boolean primary key default true check (id), salt text not null);
insert into private.lookup_salt (salt) values (encode(extensions.gen_random_bytes(32), 'hex'));

create table private.lookup_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index lookup_log_user_idx on private.lookup_log (user_id, created_at);
create index lookup_log_ip_idx on private.lookup_log (ip_hash, created_at);

alter table private.lookup_salt enable row level security;
alter table private.lookup_log enable row level security;
revoke all on private.lookup_salt, private.lookup_log from public, anon, authenticated;

-- Impronta dell'indirizzo di chi chiama (primo valore di X-Forwarded-For), null se non disponibile.
create function private.client_ip_hash() returns text
language sql stable security definer set search_path = '' as $$
  select case when ip is null or ip = '' then null
    else encode(extensions.digest(convert_to(ip || (select salt from private.lookup_salt), 'UTF8'), 'sha256'), 'hex') end
  from (select trim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1)) as ip) h;
$$;

drop function public.get_driver_rating(text);

create function public.get_driver_rating(p_query text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_user();
  v_ip text := private.client_ip_hash();
  v_q text := private.norm_plate(p_query);
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

  -- Le segnalazioni pubblicate di questo taxi (le più recenti), con le repliche pubblicate del tassista.
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc), '[]'::jsonb) into v_reports
  from (select r.id, r.kind, r.city_key, r.type, r.rating, r.description, r.cost_eur, r.meter_eur, r.duration_min,
               r.verified, r.ride_verified, r.created_at,
               coalesce((select jsonb_agg(d.body order by d.created_at) from public.driver_replies d
                         where d.report_id = r.id and d.status = 'pubblicata'), '[]'::jsonb) as replies
        from public.reports r join private.reports_private p on p.report_id = r.id
        where r.status = 'pubblicata' and (p.plate = v_q or p.license = v_q)
        order by r.created_at desc
        limit 20) q;

  return jsonb_build_object('sufficient', true, 'verified_count', v_count, 'min_required', 5,
    'plate_masked', private.mask_plate(v_q), 'avg_rating', v_avg, 'issues', v_issues, 'reports', v_reports);
end $$;

revoke all on function private.client_ip_hash() from public, anon, authenticated;
revoke all on function public.get_driver_rating(text) from public, anon;
grant execute on function public.get_driver_rating(text) to authenticated;
