-- Safe Taxi · IMP-05b: trend del Termometro negli ultimi 12 mesi, Italia e singola città.
--
-- - Stessa regola di public.get_thermometer (schema iniziale) e di src/lib/indices.js: solo segnalazioni pubblicate
--   di utenti verificati, peso dimezzato ogni 90 giorni.
-- - Il punto di ogni mese è il valore dell'indice alla fine del mese (per il mese in corso: adesso), calcolato sulle
--   segnalazioni fino a quel momento.
-- - Il punto si mostra solo se nel mese ci sono almeno 5 segnalazioni verificate (stessa soglia del rating del
--   tassista): con meno dati il valore dipenderebbe da poche opinioni. Altrimenti idx è null.
-- - Mesi di calendario in UTC (fuso del database).

create function public.get_thermometer_trend(p_city text default null, p_months integer default 12, p_now timestamptz default now())
returns table (month date, idx integer, month_count bigint)
language sql stable security invoker set search_path = '' as $$
  with m as (
    select (date_trunc('month', p_now) - make_interval(months => g))::date as month,
           least(date_trunc('month', p_now) - make_interval(months => g) + interval '1 month', p_now) as t_end
    from generate_series(0, least(greatest(coalesce(p_months, 12), 1), 24) - 1) g
  )
  select m.month,
         case when s.n >= 5 and s.w > 0 then round(s.sw / s.w)::integer end,
         s.n
  from m cross join lateral (
    select sum(power(0.5, extract(epoch from (m.t_end - r.created_at)) / 86400.0 / 90.0)) as w,
           sum(power(0.5, extract(epoch from (m.t_end - r.created_at)) / 86400.0 / 90.0) * (r.rating - 1) * 25) as sw,
           count(*) filter (where r.created_at >= m.month) as n
    from public.reports r
    where r.status = 'pubblicata' and r.verified and r.created_at <= m.t_end
      and (p_city is null or r.city_key = p_city)
  ) s
  order by m.month;
$$;

revoke all on function public.get_thermometer_trend(text, integer, timestamptz) from public;
grant execute on function public.get_thermometer_trend(text, integer, timestamptz) to anon, authenticated;
