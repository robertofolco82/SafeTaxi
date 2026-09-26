// Cancellazione dell'account richiesta dall'utente (anche anonimo), dall'app o dal sito.
// 1. cancella i contenuti non pubblicati e i dati personali (purge_account_data);
// 2. cancella i file allegati di quei contenuti;
// 3. cancella l'utente da Supabase Auth (a cascata: profilo, punti, condivisioni della corsa).
// Nessuna dipendenza esterna: usa direttamente le API REST di Auth, database e Storage.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {status, headers: {...cors, 'Content-Type': 'application/json'}});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: cors});
  if (req.method !== 'POST') return reply(405, {error: 'Metodo non consentito'});

  const base = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = (path: string, init: RequestInit = {}) => fetch(base + path, {...init,
    headers: {apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json', ...(init.headers || {})}});
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const userRes = await fetch(base + '/auth/v1/user', {headers: {apikey: service, Authorization: 'Bearer ' + token}});
  const user = userRes.ok ? await userRes.json() : null;
  if (!user?.id) return reply(401, {error: 'Accesso richiesto'});

  const purge = await admin('/rest/v1/rpc/purge_account_data', {method: 'POST', body: JSON.stringify({p_uid: user.id})});
  if (!purge.ok) return reply(500, {error: 'Cancellazione dei dati non riuscita: riprova'});
  const paths: string[] = await purge.json();
  if (paths.length) {
    await admin('/storage/v1/object/attachments', {method: 'DELETE', body: JSON.stringify({prefixes: paths})});
  }
  const del = await admin('/auth/v1/admin/users/' + encodeURIComponent(user.id), {method: 'DELETE'});
  if (!del.ok) return reply(500, {error: 'Cancellazione dell\'account non riuscita: riprova'});
  return reply(200, {deleted: true, files: paths.length});
});
