// Registra un allegato già caricato nel bucket "attachments", dopo averlo verificato:
// - chi chiama è l'autore della segnalazione, entro un'ora dall'invio (anche se già pubblicata);
// - formato e dimensione ammessi per il tipo dichiarato;
// - le foto sono JPEG senza metadati (EXIF/GPS, XMP, IPTC): se ne contengono, il file viene cancellato.
// Modalità "replace" (solo moderatori): sostituisce una foto con la versione a targhe sfocate, dopo gli stessi controlli.
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

  let body: {report_id?: unknown; path?: unknown; kind?: unknown; faces_detected?: unknown; replace_attachment_id?: unknown};
  try { body = await req.json(); } catch { return reply(400, {error: 'Richiesta non valida'}); }
  const objectUrl = (p: string) => '/storage/v1/object/attachments/' + p.split('/').map(encodeURIComponent).join('/');
  const removeObject = (p: string) => admin('/storage/v1/object/attachments', {method: 'DELETE',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify({prefixes: [p]})});

  if (body.replace_attachment_id !== undefined) {
    const [profile] = await (await admin(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`)).json().catch(() => []);
    if (!profile || !['moderatore', 'admin'].includes(profile.role)) return reply(403, {error: 'Solo i moderatori'});
    const aid = encodeURIComponent(String(body.replace_attachment_id));
    const [att] = await (await admin(`/rest/v1/attachments?id=eq.${aid}&select=id,report_id,kind,storage_path`)).json().catch(() => []);
    const newPath = body.path;
    if (!att || att.kind !== 'foto' || typeof newPath !== 'string' || !newPath.startsWith(att.report_id + '/') || newPath === att.storage_path)
      return reply(400, {error: 'Richiesta non valida'});
    const dl = await admin(objectUrl(newPath));
    if (!dl.ok) return reply(404, {error: 'File non trovato'});
    const file = await dl.blob();
    const bad = async (status: number, error: string) => { await removeObject(newPath); return reply(status, {error}); };
    if ((dl.headers.get('content-type') || '').split(';')[0] !== 'image/jpeg') return bad(415, 'La foto deve essere JPEG');
    if (file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) return bad(413, 'File troppo grande (massimo 10 MB)');
    const check = jpegMetadata(new Uint8Array(await file.arrayBuffer()));
    if (!check.valid) return bad(415, 'Foto non valida');
    if (check.metadata.length) return bad(422, 'La foto contiene metadati (' + check.metadata.join(', ') + ')');
    const upd = await admin(`/rest/v1/attachments?id=eq.${aid}`, {method: 'PATCH',
      headers: {'Content-Type': 'application/json', Prefer: 'return=minimal'},
      body: JSON.stringify({storage_path: newPath, size_bytes: file.size, plates_blurred: true,
        moderated_by: user.id, moderated_at: new Date().toISOString()})});
    if (!upd.ok) return bad(500, 'Sostituzione non riuscita');
    await removeObject(att.storage_path);
    return reply(200, {id: att.id, replaced: true});
  }

  const {report_id, path, kind} = body;
  if (typeof report_id !== 'string' || typeof path !== 'string' || !path.startsWith(report_id + '/') ||
      !['foto', 'video', 'audio'].includes(kind as string)) return reply(400, {error: 'Richiesta non valida'});

  const id = encodeURIComponent(report_id);
  // Allegati solo dall'autore, entro un'ora dall'invio, anche se la segnalazione è già pubblicata
  // (pubblicazione automatica): le foto restano comunque private fino alla revisione del moderatore.
  const [report] = await (await admin(`/rest/v1/reports?id=eq.${id}&select=id,author_id,status,created_at`)).json().catch(() => []);
  if (!report || report.author_id !== user.id || !['in_moderazione', 'pubblicata'].includes(report.status) ||
      Date.now() - Date.parse(report.created_at) > 3600e3)
    return reply(403, {error: 'Segnalazione non modificabile'});

  const existing = await (await admin(`/rest/v1/attachments?report_id=eq.${id}&select=id`)).json().catch(() => []);
  if (existing.length >= MAX_ATTACHMENTS) return reply(409, {error: 'Massimo 6 allegati per segnalazione'});

  const dl = await admin(objectUrl(path));
  if (!dl.ok) return reply(404, {error: 'File non trovato'});
  const file = await dl.blob();
  const reject = async (status: number, error: string) => { await removeObject(path); return reply(status, {error}); };

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
