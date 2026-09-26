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
      const photos = await publicPhotos().catch(() => ({}));
      return data.map(r => Object.assign(fromDbReport(r), {photos: photos[r.id] || []}));
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
  };
}
