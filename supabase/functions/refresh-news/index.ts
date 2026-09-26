// Aggiorna le news sul settore taxi dai feed RSS (fonti e filtro in ../_shared/news.js).
// La chiama ogni ora un job pianificato del database (pg_cron + pg_net, vedi README). Non richiede chiavi:
// il database limita gli aggiornamenti a uno ogni 15 minuti (news_refresh_due), quindi chiamarla più spesso
// non fa nulla. Salva solo titolo, testata, data e link all'articolo originale.
import {FEEDS, parseFeed, selectNews} from '../_shared/news.js';

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, {error: 'Metodo non consentito'});
  const base = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const r = await fetch(base + '/rest/v1/rpc/' + fn, {method: 'POST', body: JSON.stringify(args),
      headers: {apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json'}});
    if (!r.ok) throw new Error(fn + ': ' + r.status + ' ' + await r.text());
    return r.json();
  };

  if (!(await rpc('news_refresh_due', {p_minutes: 15}))) return reply(200, {skipped: true});

  const items: unknown[] = [], errors: string[] = [];
  for (const feed of FEEDS) {
    try {
      const r = await fetch(feed.url, {headers: {'User-Agent': 'SafeTaxi/1.0 (+https://safetaxi-nu.vercel.app)'},
        signal: AbortSignal.timeout(15000)});
      if (!r.ok) throw new Error('HTTP ' + r.status);
      items.push(...parseFeed(await r.text(), feed));
    } catch (e) {
      errors.push(feed.id + ': ' + (e as Error).message);
    }
  }
  const rows = selectNews(items, Date.now());
  const inserted = rows.length ? await rpc('save_news', {p_items: rows}) : 0;
  return reply(200, {read: items.length, kept: rows.length, inserted, errors});
});
