/* Backend Supabase: dati reali del progetto configurato in .env. */
import {createClient} from '@supabase/supabase-js';
import {PUBLIC_REPORT_COLUMNS, fromDbReport, authErrorMessage} from '../lib/remote.js';
import {extensionFor} from '../../supabase/functions/_shared/attachment-types.js';

export function createSupabaseBackend(url, key){
  const sb = createClient(url, key, {auth:{flowType:'pkce', persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}});
  let session = null;
  const redirectTo = () => location.origin + location.pathname;
  const fail = error => { throw new Error(authErrorMessage(error)); };
  const userFrom = s => {
    const u = s && s.user;
    if (!u || u.is_anonymous) return null;
    const meta = u.user_metadata || {};
    return {id:u.id, email:u.email || '', name:meta.full_name || meta.name || (u.email || '').split('@')[0] || 'Utente',
      provider:(u.app_metadata && u.app_metadata.provider) || 'email', verified:!!u.email_confirmed_at};
  };
  // Accesso anonimo solo al primo invio: dà un'identità per i limiti anti-fake senza chiedere la registrazione.
  async function ensureSession(){
    if (session) return;
    const {data, error} = await sb.auth.signInAnonymously();
    if (error) fail(error);
    session = data.session;
  }
  const verified = () => { const u = userFrom(session); return !!(u && u.verified); };

  // Carica gli allegati di una segnalazione appena inviata: file nel bucket privato, poi verifica e registrazione
  // lato server (register-attachment). Restituisce l'elenco degli errori, vuoto se tutto è andato bene.
  async function uploadAttachments(reportId, files){
    const errors = [];
    for (const f of files || []) {
      const mime = f.kind === 'foto' ? 'image/jpeg' : (f.blob.type || '').split(';')[0];
      const path = reportId + '/' + crypto.randomUUID() + '.' + extensionFor(mime);
      const up = await sb.storage.from('attachments').upload(path, f.blob, {contentType: mime, upsert: false});
      if (up.error) { errors.push(up.error.message); continue; }
      const {data, error} = await sb.functions.invoke('register-attachment', {body: {report_id: reportId, path, kind: f.kind, faces_detected: f.faces}});
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).error || msg; } catch(e) {}
        errors.push(msg);
      } else if (!data || !data.id) errors.push('registrazione non riuscita');
    }
    return errors;
  }
  // Repliche dei tassisti pubblicate, raggruppate per segnalazione.
  async function publicReplies(){
    const {data, error} = await sb.from('driver_replies').select('report_id,body,created_at').order('created_at').limit(500);
    if (error) return {};
    const byReport = {};
    data.forEach(d => (byReport[d.report_id] = byReport[d.report_id] || []).push({body:d.body, createdAt:Date.parse(d.created_at)}));
    return byReport;
  }
  const call = async (fn, args) => { const {data, error} = await sb.rpc(fn, args); if (error) fail(error); return data; };

  // Foto rese pubbliche dal moderatore: link temporanei (1 ora) raggruppati per segnalazione.
  async function publicPhotos(){
    const {data, error} = await sb.from('attachments').select('report_id,storage_path').eq('is_public', true).eq('kind', 'foto').limit(300);
    if (error || !data.length) return {};
    const {data: signed} = await sb.storage.from('attachments').createSignedUrls(data.map(a => a.storage_path), 3600);
    const byReport = {};
    (signed || []).forEach((s, i) => { if (s.signedUrl) (byReport[data[i].report_id] = byReport[data[i].report_id] || []).push(s.signedUrl); });
    return byReport;
  }

  return {
    mode:'supabase',
    async init(onChange){
      const {data} = await sb.auth.getSession();
      session = data.session;
      sb.auth.onAuthStateChange((event, s) => { session = s; setTimeout(() => onChange(event), 0); });
    },
    user: () => userFrom(session),
    async loadReports(){
      const {data, error} = await sb.from('reports').select(PUBLIC_REPORT_COLUMNS).order('created_at', {ascending:false}).limit(1000);
      if (error) fail(error);
      const [photos, replies] = await Promise.all([publicPhotos().catch(() => ({})), publicReplies().catch(() => ({}))]);
      return data.map(r => Object.assign(fromDbReport(r), {photos: photos[r.id] || [], replies: replies[r.id] || []}));
    },
    async submitReport(d){
      await ensureSession();
      const {data: reportId, error} = await sb.rpc('submit_report', {p_city:d.city, p_type:d.type, p_rating:d.rating, p_description:d.description,
        p_reporter_name:d.name, p_plate:d.plate, p_license:d.license, p_from:d.from || null, p_to:d.to || null,
        p_cost:d.cost, p_duration:d.duration, p_lat:d.lat, p_lng:d.lng});
      if (error) fail(error);
      const attachmentErrors = await uploadAttachments(reportId, d.files);
      return {verified:verified(), pending:true, points:0, attachmentErrors};
    },
    async submitRideRating(d){
      await ensureSession();
      const {error} = await sb.rpc('submit_ride_rating', {p_city:d.city, p_driver_rating:d.driverRating, p_ride_rating:d.rideRating,
        p_type:d.type, p_comment:d.comment || null, p_plate:d.plate || null, p_cost:d.cost, p_duration:d.duration, p_lat:d.lat, p_lng:d.lng});
      if (error) fail(error);
      return {verified:verified(), pending:true, points:0};
    },
    async driverRating(q){
      const {data, error} = await sb.rpc('get_driver_rating', {p_query:q});
      if (error) fail(error);
      return data;
    },
    async myReports(){
      if (!session) return [];
      const {data, error} = await sb.rpc('my_reports');
      if (error) fail(error);
      return data;
    },
    async points(){
      if (!userFrom(session)) return {total:0, ledger:[]};
      const {data, error} = await sb.from('points_ledger').select('delta,reason,created_at').order('created_at', {ascending:false});
      if (error) fail(error);
      return {total:data.reduce((a, l) => a + l.delta, 0), ledger:data.map(l => ({ts:Date.parse(l.created_at), n:l.delta, why:l.reason}))};
    },
    async signIn(email, password){
      const {error} = await sb.auth.signInWithPassword({email, password});
      if (error) fail(error);
      return {needsConfirmation:false};
    },
    async signUp(email, password){
      const {data, error} = await sb.auth.signUp({email, password, options:{emailRedirectTo:redirectTo()}});
      if (error) fail(error);
      return {needsConfirmation:!data.session};
    },
    async signInGoogle(){
      const {error} = await sb.auth.signInWithOAuth({provider:'google', options:{redirectTo:redirectTo()}});
      if (error) fail(error);
    },
    async resetPassword(email){
      const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo:redirectTo()});
      if (error) fail(error);
    },
    async updatePassword(password){
      const {error} = await sb.auth.updateUser({password});
      if (error) fail(error);
    },
    async signOut(){ await sb.auth.signOut(); session = null; },
    async redeem(){ throw new Error('Riscatto dei premi non ancora disponibile: i premi sono DEMO.'); },
    // ---- tracking live ----
    async startLiveShare(plate){ await ensureSession(); return call('start_ride_share', {p_hours:3, p_plate:plate || null}); },
    updateLiveShare: (id, p, street) => call('update_ride_share', {p_id:id, p_lat:p.lat, p_lng:p.lng, p_street:street || null}),
    endLiveShare: id => call('end_ride_share', {p_id:id}),
    getLiveShare: token => call('get_ride_share', {p_token:token}),
    async role(){ return userFrom(session) ? (await call('my_role')) || 'utente' : 'utente'; },
    async submitDriverReply(reportId, identifier, contact, body){
      await ensureSession();
      await call('submit_driver_reply', {p_report_id:reportId, p_identifier:identifier, p_contact:contact, p_body:body});
    },
    // ---- moderazione (le funzioni del database verificano il ruolo) ----
    moderationQueue: () => call('moderation_queue'),
    moderateReport: (id, status, reason) => call('moderate_report', {p_id:id, p_status:status, p_reason:reason || null}),
    moderateAttachment: (id, isPublic) => call('moderate_attachment', {p_id:id, p_public:isPublic}),
    moderateReply: (id, status, reason) => call('moderate_reply', {p_id:id, p_status:status, p_reason:reason || null}),
    async signedUrls(paths){
      if (!paths.length) return {};
      const {data, error} = await sb.storage.from('attachments').createSignedUrls(paths, 3600);
      if (error) fail(error);
      const out = {}; data.forEach((d, i) => { if (d.signedUrl) out[paths[i]] = d.signedUrl; }); return out;
    },
    // Sostituisce una foto con la versione a targhe sfocate: nuovo file, poi verifica e scambio lato server.
    async replacePhoto(att, blob){
      const path = att.storage_path.split('/')[0] + '/' + crypto.randomUUID() + '.jpg';
      const up = await sb.storage.from('attachments').upload(path, blob, {contentType:'image/jpeg', upsert:false});
      if (up.error) fail(up.error);
      const {error} = await sb.functions.invoke('register-attachment', {body:{replace_attachment_id:att.id, path}});
      if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch(e) {} throw new Error(m); }
    },
  };
}
