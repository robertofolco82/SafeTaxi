/* Backend Supabase: dati reali del progetto configurato in .env. */
import {createClient} from '@supabase/supabase-js';
import {PUBLIC_REPORT_COLUMNS, fromDbReport, authErrorMessage} from '../lib/remote.js';

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
      return data.map(fromDbReport);
    },
    async submitReport(d){
      await ensureSession();
      const {error} = await sb.rpc('submit_report', {p_city:d.city, p_type:d.type, p_rating:d.rating, p_description:d.description,
        p_reporter_name:d.name, p_plate:d.plate, p_license:d.license, p_from:d.from || null, p_to:d.to || null,
        p_cost:d.cost, p_duration:d.duration, p_lat:d.lat, p_lng:d.lng});
      if (error) fail(error);
      return {verified:verified(), pending:true, points:0};
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
