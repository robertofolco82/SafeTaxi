/* Backend demo locale: dati DEMO e accesso simulato, tutto salvato nel browser.
   Solo per sviluppo e test offline: nessun dato lascia il dispositivo. */
import {POINTS} from '../lib/config.js';
import {normPlate} from '../lib/utils.js';
import {driverRatingFrom, trendOf} from '../lib/indices.js';
import {filterFeed} from '../lib/feed.js';
import {OFFICIAL} from '../lib/official-data.js';
import {waitPlaces, waitProfile, sameDateHistory} from '../lib/waits.js';

export function createLocalBackend(getState, save){
  const award = (n, why) => { const s = getState(); if (!s.user) return 0; s.points += n; s.ledger.unshift({ts:Date.now(), n, why}); s.ledger = s.ledger.slice(0, 30); return n; };
  return {
    mode:'locale',
    async init(){},
    user: () => getState().user,
    async loadReports(){ return getState().reports; },
    async feed(params){ return filterFeed(getState().reports, params); },
    async officialFigures(){ return OFFICIAL; },
    async thermometerTrend(city){ return trendOf(getState().reports.filter(r => !city || r.city === city)); },
    async waitPlaces(city){ return waitPlaces(getState().reports, city); },
    async waitProfile(q){ return waitProfile(getState().reports, q); },
    async waitSameDate(q){ return sameDateHistory(getState().reports, q); },
    async submitWaitReport(d){
      const s = getState();
      s.reports.push({id:'w' + Date.now(), createdAt:Date.now(), city:d.city, licenza:'', targa:'', type:'attesa', rating:d.rating,
        description:d.description, wait:d.wait, place:d.place || '', waitedAt:d.waitedAt, verified:!!s.user, attachments:d.files.length,
        demo:false, status:'in_moderazione', lat:+d.lat.toFixed(3), lng:+d.lng.toFixed(3)});
      let points = award(POINTS.report, 'Segnalazione di attesa'); if (d.files.length) points += award(POINTS.attachments, 'Allegati a supporto');
      save();
      return {verified:!!s.user, pending:false, points};
    },
    async submitReport(d){
      const s = getState();
      s.reports.push({id:'r' + Date.now(), createdAt:Date.now(), city:d.city, licenza:d.license.trim(), targa:normPlate(d.plate),
        from:d.from, to:d.to, type:d.type, rating:d.rating, description:d.description, cost:d.cost, meter:d.meter ?? null, duration:d.duration,
        verified:!!s.user, attachments:d.attachments, demo:false, status:'in_moderazione', lat:d.lat, lng:d.lng});
      let points = award(POINTS.report, 'Segnalazione completa'); if (d.attachments) points += award(POINTS.attachments, 'Allegati a supporto');
      save();
      return {verified:!!s.user, pending:false, points};
    },
    async submitRideRating(d){
      const s = getState();
      const rating = Math.round((d.driverRating + d.rideRating)/2);
      let type = d.type; if (type === 'positiva' && rating <= 2) type = 'altro';
      s.reports.push({id:'r' + Date.now(), createdAt:Date.now(), city:d.city, licenza:'', targa:d.plate || '', from:'', to:'', type, rating,
        driverRating:d.driverRating, rideRating:d.rideRating,
        description:d.comment || (type === 'positiva' ? 'Corsa valutata positivamente.' : 'Corsa valutata con criticità.'),
        cost:d.cost, duration:d.duration, verified:!!s.user, attachments:0, demo:false, lat:d.lat, lng:d.lng});
      const points = award(POINTS.rideRating, 'Valutazione di fine corsa');
      save();
      return {verified:!!s.user, pending:false, points};
    },
    async driverRating(plate, license){ return driverRatingFrom(getState().reports, plate, license); },
    async myReports(){ return []; },
    async points(){ const s = getState(); return {total:s.points, ledger:s.ledger}; },
    async signIn(email){ getState().user = {name:email.split('@')[0], email, provider:'email'}; save(); return {needsConfirmation:false}; },
    async signUp(email){ return this.signIn(email); },
    async signInGoogle(){ getState().user = {name:'Utente Google', email:'', provider:'google'}; save(); },
    async resetPassword(){ throw new Error('Nella modalità demo locale le password non vengono salvate.'); },
    async updatePassword(){},
    async signOut(){ getState().user = null; save(); },
    async role(){ return 'utente'; },
    // In modalità demo niente feed: solo esempi segnaposto, senza link.
    async loadNews(){ return [
      {title:'Esempio · Nuovo bando comunale per licenze taxi', source:'Segnaposto', placeholder:true},
      {title:'Esempio · Sciopero di categoria annunciato', source:'Segnaposto', placeholder:true},
      {title:'Esempio · Nuove tariffe approvate dalla Giunta', source:'Segnaposto', placeholder:true}]; },
    async startRide(){ return null; },
    hasSession: () => !!getState().user,
    async deleteAccount(){ const s = getState(); s.user = null; s.points = 0; s.ledger = []; save(); },
    async startLiveShare(){ throw new Error('La condivisione in tempo reale richiede il backend Supabase.'); },
    async getLiveShare(){ return {status:'non_trovata'}; },
    async submitDriverReply(){ throw new Error('Le repliche richiedono il backend Supabase.'); },
    async submitContentNotice(){ throw new Error('La segnalazione di contenuti richiede il backend Supabase.'); },
    async myContentNotices(){ return []; },
    async redeem(r){
      const s = getState();
      s.points -= r.c; s.ledger.unshift({ts:Date.now(), n:-r.c, why:'Riscatto: ' + r.n}); save();
    },
  };
}
