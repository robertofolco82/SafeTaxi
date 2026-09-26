/* Conversioni tra i dati del database Supabase e il formato usato dall'interfaccia. */

// Colonne pubbliche di public.reports (le altre non sono leggibili dai client).
export const PUBLIC_REPORT_COLUMNS = 'id,kind,city_key,type,rating,description,from_place,to_place,cost_eur,duration_min,lat_approx,lng_approx,plate_masked,verified,ride_verified,is_demo,created_at';

const num = v => v == null ? null : Number(v);

export function fromDbReport(r){
  return {id:r.id, kind:r.kind, createdAt:Date.parse(r.created_at), city:r.city_key, type:r.type, rating:r.rating,
    description:r.description, from:r.from_place || '', to:r.to_place || '', cost:num(r.cost_eur), duration:r.duration_min,
    verified:r.verified, rideVerified:!!r.ride_verified, attachments:0, demo:r.is_demo, lat:num(r.lat_approx), lng:num(r.lng_approx),
    targa:r.plate_masked || '', licenza:''};
}

// Posizione inviata solo se dentro i limiti accettati dal database (Italia); altrimenti non si allega.
export function italianPosition(p){
  return p && p.lat >= 35 && p.lat <= 48 && p.lng >= 6 && p.lng <= 19 ? {lat:p.lat, lng:p.lng} : {lat:null, lng:null};
}

export const STATUS_LABELS = {in_moderazione:'In moderazione', pubblicata:'Pubblicata', rifiutata:'Rifiutata'};

// Segnalazione di contenuti (Digital Services Act, art. 16): motivi ed esiti.
export const NOTICE_CATEGORIES = {
  dati_personali:'Contiene dati personali di altre persone',
  diffamatorio:'Accuse false o diffamatorie',
  offensivo:'Linguaggio offensivo, minaccioso o discriminatorio',
  falso:'Segnalazione inventata o fuorviante',
  altro:'Altro contenuto illecito o contrario ai termini d\'uso'};
export const NOTICE_STATUS = {ricevuta:'In verifica', accolta:'Contenuto rimosso', respinta:'Contenuto mantenuto'};

// Messaggi di Supabase Auth tradotti in italiano (codici: https://supabase.com/docs/guides/auth/debugging/error-codes).
const AUTH_ERRORS = {
  invalid_credentials:'Email o password non corretti.',
  email_not_confirmed:'Email non ancora confermata: apri il link che ti abbiamo inviato.',
  user_already_exists:'Esiste già un account con questa email: accedi.',
  email_exists:'Esiste già un account con questa email: accedi.',
  weak_password:'Password troppo debole: usa almeno 8 caratteri.',
  over_email_send_rate_limit:'Troppe email inviate: riprova tra qualche minuto.',
  over_request_rate_limit:'Troppi tentativi: riprova tra qualche minuto.',
  anonymous_provider_disabled:'Invio senza account non ancora attivo: accedi o registrati.',
  provider_disabled:'Questo metodo di accesso non è ancora attivo.',
  same_password:'La nuova password deve essere diversa dalla precedente.',
  email_address_invalid:'Indirizzo email non valido.',
};
export function authErrorMessage(err){
  if (!err) return 'Errore sconosciuto.';
  if (err.code && AUTH_ERRORS[err.code]) return AUTH_ERRORS[err.code];
  if (/fetch|network/i.test(err.message || '')) return 'Connessione non disponibile: riprova.';
  return err.message || 'Errore sconosciuto.';
}
