// Registra un allegato già caricato nel bucket "attachments", dopo averlo verificato:
// - chi chiama è l'autore della segnalazione, ancora in moderazione;
// - formato e dimensione ammessi per il tipo dichiarato;
// - le foto sono JPEG senza metadati (EXIF/GPS, XMP, IPTC): se ne contengono, il file viene cancellato.
// Solo questa funzione (con la chiave di servizio) può scrivere in public.attachments.
// Nessuna dipendenza esterna: usa direttamente le API REST di Auth, database e Storage.
import {jpegMetadata} from '../_shared/jpeg-metadata.js';
import {attachmentKind, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS} from '../_shared/attachment-types.js';

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
    headers: {apikey: service, Authorization: 'Bearer ' + service, ...(init.headers || {})}});
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const userRes = await fetch(base + '/auth/v1/user', {headers: {apikey: service, Authorization: 'Bearer ' + token}});
  const user = userRes.ok ? await userRes.json() : null;
  if (!user?.id) return reply(401, {error: 'Accesso richiesto'});

  let body: {report_id?: unknown; path?: unknown; kind?: unknown; faces_detected?: unknown};
  try { body = await req.json(); } catch { return reply(400, {error: 'Richiesta non valida'}); }
  const {report_id, path, kind} = body;
  if (typeof report_id !== 'string' || typeof path !== 'string' || !path.startsWith(report_id + '/') ||
      !['foto', 'video', 'audio'].includes(kind as string)) return reply(400, {error: 'Richiesta non valida'});

  const id = encodeURIComponent(report_id);
  const [report] = await (await admin(`/rest/v1/reports?id=eq.${id}&select=id,author_id,status`)).json().catch(() => []);
  if (!report || report.author_id !== user.id || report.status !== 'in_moderazione')
    return reply(403, {error: 'Segnalazione non modificabile'});

  const existing = await (await admin(`/rest/v1/attachments?report_id=eq.${id}&select=id`)).json().catch(() => []);
  if (existing.length >= MAX_ATTACHMENTS) return reply(409, {error: 'Massimo 6 allegati per segnalazione'});

  const objectPath = '/storage/v1/object/attachments/' + path.split('/').map(encodeURIComponent).join('/');
  const dl = await admin(objectPath);
  if (!dl.ok) return reply(404, {error: 'File non trovato'});
  const file = await dl.blob();
  const reject = async (status: number, error: string) => {
    await admin('/storage/v1/object/attachments', {method: 'DELETE', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({prefixes: [path]})});
    return reply(status, {error});
  };

  const mime = (dl.headers.get('content-type') || '').split(';')[0];
  if (attachmentKind(mime) !== kind) return reject(415, 'Formato non ammesso per questo tipo di allegato');
  if (file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) return reject(413, 'File troppo grande (massimo 10 MB)');

  let faces: number | null = null;
  if (kind === 'foto') {
    const check = jpegMetadata(new Uint8Array(await file.arrayBuffer()));
    if (!check.valid) return reject(415, 'Foto non valida');
    if (check.metadata.length) return reject(422, 'La foto contiene ancora metadati (' + check.metadata.join(', ') + '): non è stata caricata');
    const n = Number(body.faces_detected);
    faces = Number.isInteger(n) && n >= 0 && n < 1000 ? n : 0;
  }

  const ins = await admin('/rest/v1/attachments?select=id', {method: 'POST',
    headers: {'Content-Type': 'application/json', Prefer: 'return=representation'},
    body: JSON.stringify({report_id, kind, storage_path: path, mime_type: mime, size_bytes: file.size,
      exif_stripped: kind === 'foto', faces_blurred: kind === 'foto', faces_detected: faces})});
  if (!ins.ok) return reject(500, 'Registrazione non riuscita');
  const [row] = await ins.json();
  return reply(200, {id: row.id, exif_stripped: kind === 'foto'});
});
