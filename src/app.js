/* Safe Taxi: logica dell'interfaccia (DOM, mappe, stato).
   Le regole di calcolo pure stanno in ./lib e sono coperte dai test.
   I dati arrivano dal backend (./backend): Supabase, oppure demo locale se non configurato. */
import L from 'leaflet';
import {CITIES, APPS, COOPS, STORES, TYPES, TYPE_ICONS, NEG, FILTERS, FILTER_ICONS, REWARDS} from './lib/config.js';
import {figure, sourceLine} from './lib/official.js';
import {esc, fmtNum, fmtEur, fmtTel, ago, haversine, normPlate, maskPlate, starCount} from './lib/utils.js';
import {seedReports} from './lib/seed.js';
import {indexOf, mood, perMinOf, nearestCity, estimateTrip, isRec, level} from './lib/indices.js';
import {icon} from './lib/icons.js';
import {toOpenDataRows, toCsv} from './lib/opendata.js';
import {STATUS_LABELS, NOTICE_CATEGORIES, NOTICE_STATUS, italianPosition} from './lib/remote.js';
import {createBackend} from './backend/index.js';
import {dragRect} from './lib/faces.js';
import {shouldSendPosition, liveLink, liveToken, hhmm} from './lib/live.js';
import {RIDE_RULES, shouldPingRide, rideIdForReport} from './lib/ride.js';
import {textFlags, FLAG_HINTS, descMin, descHelp, descPlaceholder} from './lib/textcheck.js';
import {gaugeSvg} from './lib/gauge.js';
import {trendSvg} from './lib/trend.js';
import {FEED_PAGE} from './lib/feed.js';
import {addRecent, saveFavorite, renameFavorite, removeFavorite, sortFavorites, parsePlaces, FAVORITE_LABELS} from './lib/places.js';
import {publicBase, openExternal, isNative} from './native/platform.js';
import {getPosition, watchRide} from './native/location.js';
import {deviceGet, deviceSet, deviceRemove} from './native/storage.js';
import {attachmentKind, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS} from '../supabase/functions/_shared/attachment-types.js';

/* ================= UTILITY ================= */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2800); }
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /android/i.test(navigator.userAgent);

/* ================= ICONE ================= */
// Sostituisce ogni <span data-icon="nome" data-icon-size="N"> del markup statico con l'SVG di src/lib/icons.js.
function mountIcons(root){
  Array.from((root || document).querySelectorAll('[data-icon]')).forEach(el => {
    el.innerHTML = icon(el.dataset.icon, {size: +el.dataset.iconSize || 18});
  });
}
// Umore del Termometro (v. src/lib/indices.js): la logica pura restituisce solo una chiave, mai un'icona.
function starsHtml(n){
  const filled = starCount(n);
  return '<span class="stars">' + Array.from({length:5}, (_, i) => icon('star', {size:14, className: i < filled ? 'on' : ''})).join('') + '</span>';
}

/* ================= STORAGE ================= */
// Demo locale: tutto nel browser (DB_KEY). Supabase: nel browser restano solo le preferenze (PREFS_KEY).
const DB_KEY = 'safetaxi.v3', PREFS_KEY = 'safetaxi.prefs';
let DB = null, memOnly = false, backend = null, loading = true, loadError = null;
const isLocal = () => !backend || backend.mode === 'locale';
function loadDB(){
  DB = null;
  try { const raw = localStorage.getItem(isLocal() ? DB_KEY : PREFS_KEY); if (raw) DB = JSON.parse(raw); } catch(e) { memOnly = true; }
  const base = {reports:[], user:null, points:0, ledger:[], myReports:[], contacts:[], powerSave:false, privacyOk:false};
  if (!isLocal()) { DB = Object.assign(base, DB || {}, {reports:[], user:null, points:0, ledger:[], myReports:[]}); return; }
  if (!DB || !Array.isArray(DB.reports)) { DB = Object.assign(base, {reports: seedReports()}); saveDB(); }
  DB.myReports = [];
}
function saveDB(){
  if (memOnly) return;
  try {
    if (isLocal()) localStorage.setItem(DB_KEY, JSON.stringify(DB));
    else localStorage.setItem(PREFS_KEY, JSON.stringify({powerSave:DB.powerSave, privacyOk:DB.privacyOk}));
  } catch(e) { memOnly = true; }
}
// Dati solo sul dispositivo (IMP-04): preferiti, recenti e contatti di emergenza, mai inviati al server.
// Nell'app nativa stanno nell'archivio del sistema operativo (src/native/storage.js), sul web nel browser.
const PLACES_KEY = 'safetaxi.places', CONTACTS_KEY = 'safetaxi.contacts';
let places = {favorites:[], recents:[]};
async function loadDeviceData(){
  places = parsePlaces(await deviceGet(PLACES_KEY));
  let contacts = null;
  try { contacts = JSON.parse(await deviceGet(CONTACTS_KEY)); } catch(e) {}
  if (Array.isArray(contacts)) DB.contacts = contacts.filter(c => c && c.name && c.phone);
  else if (DB.contacts.length) await saveContacts();  // contatti salvati dalle versioni precedenti nelle preferenze del browser
}
const savePlaces = () => deviceSet(PLACES_KEY, JSON.stringify(places));
const saveContacts = () => deviceSet(CONTACTS_KEY, JSON.stringify(DB.contacts));
async function clearPlaces(){ places = {favorites:[], recents:[]}; await deviceRemove(PLACES_KEY); }
// Ricarica dal backend segnalazioni, utente, punti e segnalazioni personali.
async function reloadData(){
  try {
    DB.reports = await backend.loadReports();
    loadError = null;
  } catch(e) { DB.reports = []; loadError = e.message; }
  try { DB.official = await backend.officialFigures(); } catch(e) { DB.official = []; }
  DB.user = backend.user();
  DB.role = await backend.role().catch(() => 'utente');
  try {
    const p = await backend.points(); DB.points = p.total; DB.ledger = p.ledger;
    DB.myReports = await backend.myReports();
    DB.myNotices = await backend.myContentNotices();
  } catch(e) { DB.points = 0; DB.ledger = []; DB.myReports = []; DB.myNotices = []; }
  loading = false;
  trendCache = {};
  await loadFeed(true);
  refreshAll();
}


/* ================= INDICI ================= */
const byCity = k => DB.reports.filter(r => r.city === k);

/* ================= ENERGIA ================= */
let battery = null;
const autoPowerSave = () => !!(battery && !battery.charging && battery.level <= 0.2);
const isPowerSave = () => !!(DB && DB.powerSave) || autoPowerSave();
function initBattery(){
  if (navigator.getBattery) {
 navigator.getBattery().then(b => { battery = b; const upd = () => { applyPower(); }; b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd); upd(); }).catch(() => {});
  }
  applyPower();
}
function applyPower(){
 document.body.classList.toggle('powersave', isPowerSave());
  const el = $('#batteryBanner');
  if (autoPowerSave()) { el.innerHTML = icon('battery-low', {size:14}) + ' Batteria al ' + Math.round(battery.level*100) + '%: risparmio energetico attivo.'; el.classList.remove('hidden'); }
  else if (DB.powerSave) { el.innerHTML = icon('battery-charging', {size:14}) + ' Risparmio energetico attivo (manuale).'; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}
function setPowerSave(v){ DB.powerSave = !!v; saveDB(); applyPower(); }

/* ================= POSIZIONE ================= */
let lastPos = null;
async function getPos(high){
  const p = await getPosition({highAccuracy: !!high && !isPowerSave(), maximumAge: isPowerSave() ? 300000 : 60000});
  lastPos = {lat:p.lat, lng:p.lng, acc:p.acc, ts:Date.now()};
  return lastPos;
}
let geoLast = {t:0, p:null, label:null};
async function reverseGeocode(p, force){
  const gap = isPowerSave() ? 60000 : 20000;
  if (!force && geoLast.p && (Date.now() - geoLast.t < gap || haversine(p, geoLast.p) < 0.1)) return geoLast.label;
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=it&lat=' + p.lat + '&lon=' + p.lng);
    if (!r.ok) throw new Error('geo');
    const j = await r.json(); const a = j.address || {};
    const road = a.road || a.pedestrian || a.square || a.neighbourhood || '';
    const town = a.city || a.town || a.village || '';
    const label = (road ? road + (a.house_number ? ' ' + a.house_number : '') : 'Via non disponibile') + (town ? ', ' + town : '');
    geoLast = {t:Date.now(), p, label}; return label;
  } catch(e) { return geoLast.label; }
}
const mapsLink = p => 'https://maps.google.com/?q=' + p.lat.toFixed(6) + ',' + p.lng.toFixed(6);

/* ================= MAPPE ================= */
const hasL = () => !!L;
let homeMap = null, rideMap = null, italyMap = null, destMarker = null, destLine = null, rideLine = null, rideMarker = null, reportLayer = null;
const cityLayers = {};
function makeMap(id, center, zoom){
  const el = document.getElementById(id);
  if (!hasL()) { el.innerHTML = '<div class="nomap">Mappa non disponibile: serve connessione per caricare OpenStreetMap.</div>'; return null; }
  const m = L.map(el).setView(center, zoom);
  // Prefisso senza la bandiera che Leaflet aggiunge di default dalla 1.8: l'app resta neutrale sui simboli politici.
  m.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(m);
  return m;
}

/* ================= NAVIGAZIONE / MODALI ================= */
// IMP-05a: dal Termometro alla ricerca città nella tab Mappa.
function openCitySearch(){
  openTab('mappa');
  const el = $('#citySearch'); el.scrollIntoView({block:'center'}); el.focus();
}
function openTab(name){
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  window.scrollTo(0, 0);
  if (name === 'corsa' && !rideMap) rideMap = makeMap('rideMap', [41.9, 12.5], 6);
  if (name === 'mappa' && !italyMap) initItalyMap();
  if (name === 'profilo') renderProfile();
  if (name === 'segnala') updateAnonNotice();
  if (name === 'news') renderNews();
  if (name === 'moderazione') renderModeration();
  setTimeout(() => { [homeMap, rideMap, italyMap].forEach(m => m && m.invalidateSize()); }, 80);
}
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
// Nell'app nativa i link esterni (news) si aprono fuori dalla WebView.
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[data-ext]');
  if (a && isNative()) { e.preventDefault(); openExternal(a.href); }
});
document.addEventListener('click', e => { const t = e.target; if (t.classList && t.classList.contains('modal') && t.id !== 'm-confirm') t.classList.remove('open'); });
function confirmDialog(title, text, ok){
  return new Promise(res => {
 $('#cTitle').textContent = title; $('#cText').textContent = text; $('#cYes').textContent = ok || 'Conferma';
    const done = v => { closeModal('m-confirm'); $('#cYes').onclick = null; $('#cNo').onclick = null; res(v); };
    $('#cYes').onclick = () => done(true); $('#cNo').onclick = () => done(false);
 openModal('m-confirm');
  });
}
function openPrivacy(e){ e.preventDefault(); openModal('m-privacy'); }
function acceptPrivacy(){ DB.privacyOk = true; saveDB(); closeModal('m-privacy'); }
function storeUrl(key){ const s = STORES[key]; if (!s) return null; if (isIOS() && s.ios) return s.ios; if (isAndroid() && s.and) return s.and; return s.web; }
function openStore(key){ const u = storeUrl(key); if (u) openExternal(u); }

/* ================= HOME ================= */
function renderThermo(){
  const v = indexOf(DB.reports), m = mood(v), now = Date.now();
  const last = DB.reports.filter(r => now - r.createdAt < 30*864e5);
  const prev = DB.reports.filter(r => { const a = now - r.createdAt; return a >= 30*864e5 && a < 60*864e5; });
  const vl = indexOf(last), vp = indexOf(prev);
  const tr = (vl != null && vp != null) ? vl - vp : null;
  const trTxt = tr == null ? '—' : tr > 0 ? '▲ +' + tr : tr < 0 ? '▼ ' + tr : '= 0';
  const cities = new Set(DB.reports.map(r => r.city)).size;
  const ver = DB.reports.filter(r => r.verified).length;
 $('#thermo').innerHTML =
    '<div class="muted">Termometro Safe Taxi · Italia</div>' +
    gaugeSvg(v) +
    '<div class="val">' + (v == null ? '—' : v) + '<span style="font-size:16px;color:var(--mut)">/100</span></div>' +
    '<div style="font-weight:700">' + m.l + '</div>' +
    '<button class="btn sec sm" style="margin:10px auto 0" onclick="openCitySearch()">' + icon('map-pin', {size:14}) + 'Seleziona città</button>' +
    '<h3 style="margin-top:14px;text-align:left">Andamento negli ultimi 12 mesi</h3><div id="trendItalia" class="trend-box"></div>' +
    '<div class="stats3"><div class="stat"><b>' + fmtNum(DB.reports.length) + '</b><span>segnalazioni</span></div>' +
    '<div class="stat"><b>' + cities + '</b><span>città</span></div>' +
    '<div class="stat"><b>' + trTxt + '</b><span>vs 30 gg prec.</span></div></div>' +
    '<div class="note">Indice 0–100 calcolato solo sulle segnalazioni di utenti verificati (' + fmtNum(ver) + '), con peso che si dimezza ogni 90 giorni. <span class="badge b-demo">DATI DEMO</span></div>';
  if (!loading) showTrend('trendItalia', null);
}
// Feed (IMP-03): tipo, città e parola chiave filtrati dal backend (sul server con Supabase), a pagine da 12.
// IMP-05b: andamento mensile del Termometro, letto dal backend e tenuto in memoria fino al prossimo aggiornamento dei dati.
let trendCache = {};
async function showTrend(boxId, city){
  const key = city || '', box = document.getElementById(boxId); if (!box) return;
  try {
    if (!trendCache[key]) trendCache[key] = backend.thermometerTrend(city || null);
    const pts = await trendCache[key], el = document.getElementById(boxId);
    if (el) el.innerHTML = trendSvg(pts, {title:'Andamento del Termometro ' + (city ? CITIES[city].n : 'Italia')});
  } catch(e) { delete trendCache[key]; box.innerHTML = '<p class="muted" style="font-size:13px">Andamento non disponibile.</p>'; }
}
let feedFilter = 'all', feedCity = '', feedQuery = '', feedItems = [], feedMore = false, feedSeq = 0;
function setFeedFilter(f){ feedFilter = f; $$('[data-feed]').forEach(b => b.classList.toggle('on', b.dataset.feed === f)); loadFeed(true); }
function setFeedCity(c){ feedCity = c; loadFeed(true); }
function searchFeed(e){ e.preventDefault(); feedQuery = $('#feedQuery').value.trim(); loadFeed(true); }
async function loadFeed(reset){
  const seq = ++feedSeq, last = feedItems[feedItems.length - 1];
  if (reset) { feedItems = []; feedMore = false; }
  try {
    const page = await backend.feed({city:feedCity, q:feedQuery, kind:feedFilter, before:reset || !last ? null : last.createdAt, limit:FEED_PAGE});
    if (seq !== feedSeq) return;  // una richiesta più recente ha già aggiornato il feed
    feedItems = feedItems.concat(page); feedMore = page.length === FEED_PAGE; feedError = null;
  } catch(e) { if (seq !== feedSeq) return; feedError = e.message; }
  renderFeed();
}
let feedError = null;
function renderFeed(){
  const list = feedItems, filtered = feedFilter !== 'all' || feedCity || feedQuery;
  $('#feedMore').classList.toggle('hidden', !feedMore);
  $('#feed').innerHTML = list.length ? list.map(r =>
    '<div class="feed-item ' + (r.type === 'positiva' ? 'pos' : 'neg') + '">' +
    '<div class="row between"><b>' + esc(CITIES[r.city] ? CITIES[r.city].n : r.city) + '</b><span class="muted">' + ago(r.createdAt) + '</span></div>' +
    '<div class="row between" style="margin:4px 0"><span style="font-size:12px;display:inline-flex;align-items:center;gap:4px">' + icon(TYPE_ICONS[r.type] || 'circle-help', {size:13}) + (TYPES[r.type] || '') + '</span>' + starsHtml(r.rating) + '</div>' +
    '<div style="font-size:13px">' + esc(r.description) + '</div>' + amountsLine(r.meter, r.cost) +
    '<div class="muted" style="margin-top:4px;display:flex;align-items:center;gap:4px;flex-wrap:wrap">' + icon('car-taxi-front', {size:13}) + esc(maskPlate(r.targa)) + ((r.from || r.to) ? ' · ' + esc(r.from) + ' → ' + esc(r.to) : '') + ' ' +
    (r.verified ? '<span class="badge b-ok">verificata</span>' : '<span class="badge">anonima</span>') + (r.rideVerified ? '<span class="badge b-ok">corsa verificata</span>' : '') + (r.attachments ? '<span style="display:inline-flex;align-items:center;gap:3px">' + icon('paperclip', {size:12}) + r.attachments + '</span>' : '') + '</div>' +
    (r.photos && r.photos.length ? '<div class="feed-photos">' + r.photos.slice(0, 3).map(u => '<img src="' + esc(u) + '" alt="Foto allegata (volti e targhe sfocati)" loading="lazy">').join('') + '</div>' : '') +
    (r.replies || []).map(d => '<div class="reply"><b>' + icon('message-square', {size:13}) + 'Replica del tassista</b> <span class="muted">· verificata dal moderatore</span><br>' + esc(d.body) +
      (!isLocal() ? '<br><button class="linkbtn" onclick="openNotice(\'replica\', \'' + d.id + '\')">Segnala questa replica</button>' : '') + '</div>').join('') +
    (!isLocal() && !r.demo ? '<div class="row" style="gap:14px"><button class="linkbtn" onclick="openReply(\'' + r.id + '\')">Sei il tassista? Replica</button>' +
      '<button class="linkbtn" onclick="openNotice(\'segnalazione\', \'' + r.id + '\')">Segnala contenuto</button></div>' : '') + '</div>'
  ).join('') : '<p class="muted">' + (loading ? 'Caricamento…' : (loadError || feedError) ? 'Segnalazioni non disponibili: ' + esc(loadError || feedError) : filtered ? 'Nessuna segnalazione con questi filtri.' : 'Nessuna segnalazione.') + '</p>';
}
function initHome(){
  homeMap = makeMap('homeMap', [42.3, 12.6], 5);
  getPos(false).then(p => {
    if (homeMap) { L.circleMarker([p.lat, p.lng], {radius:8, color:'#fff', weight:3, fillColor:'#2563eb', fillOpacity:1}).addTo(homeMap).bindPopup('Sei qui'); homeMap.setView([p.lat, p.lng], 14); }
    const nc = nearestCity(p);
    if (nc.dist < 60) { $('#bookCity').value = nc.key; renderBook(); renderCityStats(nc.key); }
  }).catch(() => {
 $('#estimateBox').innerHTML = '<div class="note">Posizione non disponibile: consenti l’accesso alla posizione per stimare il costo dal punto in cui ti trovi.</div>';
  });
}
// Ricerca indirizzi: solo con il pulsante "Cerca", mai mentre si scrive (regole d'uso di Nominatim).
let destResults = [], startResults = [], startPlace = null, currentDest = null;
async function searchAddress(q, box, onPick){
  if (q.length < 3) { toast('Scrivi almeno 3 caratteri'); return []; }
  box.innerHTML = '<p class="muted">Cerco…</p>';
  try {
    let url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=it&accept-language=it&q=' + encodeURIComponent(q);
    if (lastPos) { const d = 0.4; url += '&viewbox=' + (lastPos.lng-d) + ',' + (lastPos.lat+d) + ',' + (lastPos.lng+d) + ',' + (lastPos.lat-d); }
    const r = await fetch(url), list = await r.json();
    if (!list.length) { box.innerHTML = '<p class="muted">Nessun risultato.</p>'; return []; }
    box.innerHTML = list.map((x, i) => {
      const parts = x.display_name.split(',');
      return '<button class="opt" style="padding:8px" onclick="' + onPick + '(' + i + ')"><div><b style="font-size:13px">' + esc(parts.slice(0,2).join(',')) + '</b><span>' + esc(parts.slice(2,5).join(',')) + '</span></div></button>';
    }).join('');
    return list.map(x => ({name:x.display_name.split(',')[0], lat:+x.lat, lng:+x.lon}));
  } catch(err) { box.innerHTML = '<p class="muted">Ricerca non disponibile (serve connessione).</p>'; return []; }
}
async function searchDestination(e){
  e.preventDefault();
  destResults = await searchAddress($('#destInput').value.trim(), $('#destResults'), 'pickDest');
}
async function searchStart(e){
  e.preventDefault();
  startResults = await searchAddress($('#startInput').value.trim(), $('#startResults'), 'pickStart');
}
// Partenza: "Posizione attuale" (GPS) se non si sceglie altro.
function toggleStartSearch(){
  if (startPlace) return setStart(null);
  const open = $('#startPanel').classList.toggle('hidden') === false;
  $('#startToggle').textContent = open ? 'Chiudi' : 'Cambia';
  if (open) { renderPlaces(); $('#startInput').focus(); }
}
function setStart(p){
  startPlace = p;
  $('#startLabel').textContent = p ? p.name : 'Posizione attuale';
  $('#startToggle').textContent = p ? 'Usa posizione attuale' : 'Cambia';
  $('#startPanel').classList.add('hidden'); $('#startResults').innerHTML = ''; $('#startInput').value = '';
  renderPlaces();
  if (currentDest) showEstimate(currentDest);
}
function pickStart(i){ const x = startResults[i]; if (x) setStart(x); }
function pickDest(i){ const x = destResults[i]; if (x) chooseDest(x); }
// Preferiti e recenti: con il pannello "Partenza" aperto il tocco imposta la partenza, altrimenti la destinazione.
function pickPlace(kind, i){
  const list = kind === 'fav' ? sortFavorites(places.favorites) : places.recents, x = list[i]; if (!x) return;
  if (!$('#startPanel').classList.contains('hidden')) setStart({name:x.name, lat:x.lat, lng:x.lng});
  else chooseDest({name:x.name, lat:x.lat, lng:x.lng});
}
function renderPlaces(){
  const box = $('#placesBox'); if (!box) return;
  const favs = sortFavorites(places.favorites), forStart = !$('#startPanel').classList.contains('hidden');
  const favIcon = l => l.toLowerCase() === 'casa' ? 'house' : l.toLowerCase() === 'lavoro' ? 'briefcase' : 'bookmark';
  box.innerHTML = (favs.length || places.recents.length) ? '<div class="muted" style="font-size:12px;margin-top:8px">' + (forStart ? 'Tocca per usarlo come partenza' : 'Tocca per usarlo come destinazione') + '</div>' +
    (favs.length ? '<div class="chips" style="margin-top:6px" aria-label="Preferiti">' + favs.map((f, i) => '<button class="chip" onclick="pickPlace(\'fav\',' + i + ')">' + icon(favIcon(f.label), {size:13}) + esc(f.label) + '</button>').join('') + '</div>' : '') +
    (places.recents.length ? '<div style="margin-top:8px"><div class="row between"><b style="font-size:13px;display:flex;align-items:center;gap:4px">' + icon('history', {size:13}) + 'Recenti</b><button class="btn sec sm" onclick="clearRecents()">Cancella cronologia</button></div>' +
      places.recents.map((r, i) => '<button class="opt" style="padding:6px 8px" onclick="pickPlace(\'rec\',' + i + ')"><div><b style="font-size:13px">' + esc(r.name) + '</b></div></button>').join('') + '</div>' : '') : '';
}
async function clearRecents(){
  if (!(await confirmDialog('Cancellare la cronologia?', 'Le ultime destinazioni salvate su questo dispositivo verranno cancellate.', 'Cancella'))) return;
  places.recents = []; await savePlaces(); renderPlaces(); toast('Cronologia cancellata');
}
async function saveCurrentFavorite(){
  if (!currentDest) return;
  try { places.favorites = saveFavorite(places.favorites, $('#favLabel').value, currentDest); }
  catch(e) { return toast(e.message); }
  await savePlaces(); renderPlaces(); toast('Salvato nei preferiti');
}
function chooseDest(dest){
  currentDest = dest;
  places.recents = addRecent(places.recents, dest); savePlaces(); renderPlaces();
  showEstimate(dest);
}
function showEstimate(dest){
  const name = dest.name, origin = startPlace || lastPos;
 $('#destResults').innerHTML = '';
  if (homeMap) {
    if (destMarker) homeMap.removeLayer(destMarker);
    if (destLine) homeMap.removeLayer(destLine);
    destMarker = L.circleMarker([dest.lat, dest.lng], {radius:9, color:'#fff', weight:3, fillColor:'#facc15', fillOpacity:1}).addTo(homeMap).bindPopup(esc(name));
    if (origin) { destLine = L.polyline([[origin.lat, origin.lng], [dest.lat, dest.lng]], {dashArray:'6 6', color:'#0f766e'}).addTo(homeMap); homeMap.fitBounds(destLine.getBounds(), {padding:[30,30]}); }
    else homeMap.setView([dest.lat, dest.lng], 14);
  }
  const favForm = '<div class="row" style="margin-top:8px"><input id="favLabel" list="favLabels" placeholder="Salva come: Casa, Lavoro o un nome" aria-label="Nome del preferito">' +
    '<datalist id="favLabels">' + FAVORITE_LABELS.map(l => '<option value="' + l + '">').join('') + '</datalist>' +
    '<button class="btn sec sm" onclick="saveCurrentFavorite()">' + icon('star', {size:13}) + 'Salva</button></div>';
  if (!origin) { $('#estimateBox').innerHTML = '<div class="note">Attiva la posizione o scegli una partenza per stimare il costo.' + favForm + '</div>'; return; }
  const e = estimateTrip(origin, dest, DB.reports);
 $('#estimateBox').innerHTML = '<div class="note" style="font-size:13px"><b>' + esc(name) + '</b>' +
    '<div class="kv"><span>Distanza stimata</span><b>' + fmtNum(e.km, 1) + ' km</b></div>' +
    '<div class="kv"><span>Tempo stimato</span><b>' + Math.round(e.min) + ' min</b></div>' +
    '<div class="kv"><span>Costo stimato</span><b>' + fmtEur(e.lo) + ' – ' + fmtEur(e.hi) + '</b></div>' +
    '<div class="muted">Base: ' + esc(e.basis) + '. Distanza in linea d’aria × 1,3: stima indicativa, non vincolante.</div>' +
    (startPlace ? '<div class="muted">Partenza: ' + esc(startPlace.name) + '</div>' : '') +
    '<button class="btn sm" style="margin-top:8px" onclick="openTab(\'prenota\')">' + icon('phone', {size:14}) + 'Prenota un taxi</button>' + favForm + '</div>';
}

/* ================= CORSA ================= */
let ride = null, lastRide = null;
async function toggleRide(){ if (ride) endRide(); else await startRide(false); }
async function startRide(sim){
  if (!rideMap) rideMap = makeMap('rideMap', [41.9, 12.5], 6);
  if (rideLine) rideLine.setLatLngs([]);
  ride = {start:Date.now(), path:[], km:0, stopWatch:null, timer:null, simTimer:null, sim:!!sim, plate: normPlate($('#lookupPlate').value)};
  $('#rideBtn').innerHTML = icon('square', {size:16}) + 'Termina corsa'; $('#rideBtn').classList.add('red');
 $('#rideState').textContent = 'In corso'; $('#rideState').className = 'badge b-ok';
  ride.timer = setInterval(updateRideStats, 1000);
  // Bollino "corsa verificata": il server registra la corsa (durata e km) solo per account con email confermata.
  if (!sim && canVerifyRide()) {
    const r = ride;
    backend.startRide(r.plate).then(id => {
      r.serverId = id; renderRideVerify();
      if (id && ride === r && r.path.length) pingRide(r.path[r.path.length - 1]);  // posizione arrivata prima della risposta
    }).catch(() => {});
  }
  renderRideVerify();
  if (!sim) {
    try { ride.stopWatch = await watchRide(onRidePos, err => toast(err.message), {powerSave: isPowerSave()}); }
    catch(e) { toast(e.message); }
  }
}
function onRidePos(p){
  if (!ride) return;
  const prev = ride.path[ride.path.length-1];
  if (prev) { const d = haversine(prev, p); if (d < 0.015) return; ride.km += d; }
  ride.path.push(p); lastPos = {lat:p.lat, lng:p.lng, ts:Date.now()};
  pingRide(p);
 $('#rideCoords').textContent = p.lat.toFixed(5) + ', ' + p.lng.toFixed(5);
  if (rideMap) {
    const ll = ride.path.map(x => [x.lat, x.lng]);
    if (!rideLine) rideLine = L.polyline(ll, {color:'#0f766e', weight:5}).addTo(rideMap); else rideLine.setLatLngs(ll);
    if (!rideMarker) rideMarker = L.circleMarker([p.lat, p.lng], {radius:8, color:'#fff', weight:3, fillColor:'#dc2626', fillOpacity:1}).addTo(rideMap); else rideMarker.setLatLng([p.lat, p.lng]);
 rideMap.setView([p.lat, p.lng], 16);
  }
  reverseGeocode(p, ride.sim).then(l => { if (l) $('#rideStreet').textContent = l; sendLive(p, l); });
}
function updateRideStats(){
  if (!ride) return;
  const s = Math.floor((Date.now() - ride.start)/1000);
 $('#rideTime').textContent = String(Math.floor(s/60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
 $('#rideKm').textContent = fmtNum(ride.km, 1) + ' km';
  const k = ride.path.length ? nearestCity(ride.path[0]).key : 'roma';
  const pm = perMinOf(byCity(k)), t = CITIES[k].t;
 $('#rideCost').textContent = fmtEur(pm ? Math.max(t.start, pm*s/60) : t.start + t.km*ride.km);
}
function endRide(){
  if (!ride) return;
  if (ride.stopWatch) ride.stopWatch();
 clearInterval(ride.timer); if (ride.simTimer) clearInterval(ride.simTimer);
  const r = ride; ride = null;
 $('#rideBtn').innerHTML = icon('play', {size:16}) + 'Inizia corsa'; $('#rideBtn').classList.remove('red');
 $('#rideState').textContent = 'Conclusa'; $('#rideState').className = 'badge';
  lastRide = {durMin: Math.max(1, Math.round((Date.now() - r.start)/60000)), plate: r.plate, city: r.path.length ? nearestCity(r.path[0]).key : null};
  const lr = lastRide;
  if (r.serverId) lr.check = backend.endRide(r.serverId)
    .then(res => { lr.rideId = r.serverId; lr.verified = !!res.verified; lr.endedAt = Date.parse(res.ended_at); })
    .catch(() => {}).then(() => { lr.check = null; renderRateVerify(); });
  renderRideVerify();
  stopLiveShare(false);
  openRating();
}
const canVerifyRide = () => !isLocal() && !!(DB.user && DB.user.verified);
function pingRide(p){
  const r = ride, now = Date.now();
  if (!r || !r.serverId || !shouldPingRide(r.lastPing, p, now, isPowerSave())) return;
  r.lastPing = {lat:p.lat, lng:p.lng, ts:now};
  backend.pingRide(r.serverId, p).catch(() => {});
}
const verifyLink = '<button class="linkbtn" style="margin:0" onclick="openModal(\'m-verifica\')">Come funziona</button>';
function renderRideVerify(){
  const box = $('#rideVerify');
  if (!ride || ride.sim || isLocal()) { box.innerHTML = ''; return; }
  box.innerHTML = ride.serverId
    ? icon('shield-check', {size:13}) + ' Corsa registrata per il bollino "corsa verificata": il server conserva solo durata e km. ' + verifyLink
    : canVerifyRide() ? '' : 'Accedi con un account con email confermata per ottenere il bollino "corsa verificata". ' + verifyLink;
}
function renderRateVerify(){
  const lr = lastRide || {}, box = $('#rateVerify');
  const msg = lr.check ? 'Verifico la corsa…'
    : lr.rideId && lr.verified && !lr.claimed ? icon('shield-check', {size:14}) + ' Corsa verificata: la valutazione avrà il bollino "corsa verificata".'
    : lr.rideId && !lr.verified ? 'Corsa troppo breve per il bollino "corsa verificata" (servono almeno ' + RIDE_RULES.minMinutes + ' minuti e ' + RIDE_RULES.minMeters + ' m).'
    : '';
  box.innerHTML = msg; box.classList.toggle('hidden', !msg);
}
function simulateRide(){
  if (ride) return toast('Termina prima la corsa in corso');
  const pts = [[41.9009,12.5010],[41.9003,12.4960],[41.8990,12.4900],[41.8985,12.4850],[41.8995,12.4800],[41.9010,12.4765],[41.9030,12.4740],[41.9056,12.4769],[41.9060,12.4800]];
 startRide(true).then(() => {
    let i = 0;
    ride.simTimer = setInterval(() => {
      if (!ride) return;
      if (i >= pts.length) { clearInterval(ride.simTimer); ride.simTimer = null; toast('Simulazione terminata: premi "Termina corsa"'); return; }
 onRidePos({lat:pts[i][0], lng:pts[i][1]}); i++;
    }, 2500);
  });
}

/* ================= TRACKING LIVE ================= */
// Chi è in corsa crea un link temporaneo; le posizioni si inviano con parsimonia (vedi shouldSendPosition).
let liveShare = null, liveLast = null;
async function startLiveShare(){
  if (isLocal()) return toast('La condivisione in tempo reale richiede il backend Supabase.');
  if (!ride) return toast('Avvia prima la corsa: la posizione si condivide solo durante la corsa.');
  if (!liveShare) {
    try {
      const s = await backend.startLiveShare(ride.plate);
      liveShare = {id:s.id, link:liveLink(publicBase(), '', s.token), expires:Date.parse(s.expires_at)};
      liveLast = null;
      if (ride.path.length) sendLive(ride.path[ride.path.length - 1], geoLast.label);
    } catch(e) { return toast(e.message); }
    renderLiveState();
  }
  openShare(false);
}
function sendLive(p, street){
  if (!liveShare) return;
  const now = Date.now();
  if (!shouldSendPosition(liveLast, p, now, isPowerSave())) return;
  liveLast = {lat:p.lat, lng:p.lng, ts:now};
  backend.updateLiveShare(liveShare.id, p, street).catch(e => { if (/non attiva/.test(e.message)) stopLiveShare(false); });
}
async function stopLiveShare(notify = true){
  if (!liveShare) return;
  const id = liveShare.id; liveShare = null; renderLiveState();
  try { await backend.endLiveShare(id); } catch(e) {}
  if (notify) toast('Condivisione interrotta: la posizione non è più visibile.');
}
function renderLiveState(){
  $('#liveState').innerHTML = liveShare ? '<span class="live-dot"></span>Condivisione attiva fino alle ' + hhmm(liveShare.expires) + ' · <button class="linkbtn" onclick="stopLiveShare()">Interrompi</button>' : '';
}
// Pagina di chi riceve il link: aggiornamento ogni 8 secondi finché la corsa è attiva.
async function startLiveViewer(token){
  document.body.classList.add('live-mode'); $('#liveView').classList.remove('hidden');
  const map = makeMap('liveMap', [42.3, 12.6], 5);
  let line = null, marker = null, centered = false, timer = null;
  const ended = {conclusa:'La corsa è terminata. Per privacy la posizione non è più visibile.',
    scaduta:'Il link è scaduto: la posizione non è più visibile.', non_trovata:'Link non valido: controlla di averlo aperto per intero.'};
  const tick = async () => {
    let d;
    try { d = await backend.getLiveShare(token); } catch(e) { $('#liveStatus').textContent = 'Non raggiungibile'; return; }
    const labels = {attiva:'In corso', conclusa:'Corsa conclusa', scaduta:'Link scaduto', non_trovata:'Link non valido'};
    $('#liveStatus').textContent = labels[d.status] || d.status;
    $('#liveStatus').className = 'badge' + (d.status === 'attiva' ? ' b-ok' : '');
    if (d.status !== 'attiva') {
      $('#liveStreet').textContent = ended[d.status] || ''; $('#liveInfo').textContent = '';
      if (map) { if (line) map.removeLayer(line); if (marker) map.removeLayer(marker); }
      clearInterval(timer); return;
    }
    $('#liveStreet').textContent = d.street || 'In attesa della prima posizione…';
    $('#liveInfo').textContent = (d.updated_at ? 'Aggiornata ' + ago(Date.parse(d.updated_at)) : 'Nessuna posizione ancora') +
      (d.plate_masked ? ' · Taxi ' + d.plate_masked : '') + ' · link valido fino alle ' + hhmm(Date.parse(d.expires_at));
    if (map && d.points.length) {
      const last = d.points[d.points.length - 1];
      if (!line) line = L.polyline(d.points, {color:'#0f766e', weight:5}).addTo(map); else line.setLatLngs(d.points);
      if (!marker) marker = L.circleMarker(last, {radius:9, color:'#fff', weight:3, fillColor:'#dc2626', fillOpacity:1}).addTo(map); else marker.setLatLng(last);
      if (!centered) { map.setView(last, 16); centered = true; } else map.panTo(last);
    }
  };
  await tick();
  timer = setInterval(tick, 8000);
}

/* ================= RATING TASSISTA ================= */
async function doLookup(e){
  if (e) e.preventDefault();
  const plate = normPlate($('#lookupPlate').value), license = normPlate($('#lookupLicense').value), box = $('#lookupResult');
  if (plate.length < 2 && license.length < 2) { box.innerHTML = '<div class="note">Inserisci la targa, la licenza o entrambe.</div>'; return; }
  const q = plate.length >= 2 ? plate : license;
  box.innerHTML = '<p class="muted">Verifico…</p>';
  let d;
  try { d = await backend.driverRating(plate, license); } catch(e) { box.innerHTML = '<div class="note">' + esc(e.message) + '</div>'; return; }
  if (!d.sufficient) {
    box.innerHTML = '<div class="note">Storico insufficiente: ' + d.verified_count + ' segnalazioni verificate (minimo ' + d.min_required + '). Sotto questa soglia il rating non viene mostrato, a tutela del tassista.</div>'; return;
  }
  const crit = Object.keys(d.issues || {}).map(k => TYPES[k] + ' ×' + d.issues[k]).join(', ') || 'nessuna';
  box.innerHTML = '<div class="note" style="font-size:13px"><div class="row between"><b style="display:flex;align-items:center;gap:5px">' + icon('car-taxi-front', {size:15}) + esc(maskPlate(q)) + (plate.length >= 2 && license.length >= 2 ? ' <span class="muted" style="font-weight:400">targa e licenza</span>' : '') + '</b>' + starsHtml(d.avg_rating) + '</div>' +
    '<div class="kv"><span>Rating medio</span><b>' + fmtNum(d.avg_rating, 1) + ' / 5</b></div>' +
    '<div class="kv"><span>Segnalazioni verificate</span><b>' + d.verified_count + '</b></div>' +
    '<div class="kv"><span>Criticità</span><b style="text-align:right">' + crit + '</b></div></div>' +
    (d.reports && d.reports.length ? '<h3 style="margin:12px 0 6px">Segnalazioni su questo taxi (' + d.reports.length + ')</h3>' + d.reports.map(r =>
      '<div class="feed-item ' + (r.type === 'positiva' ? 'pos' : 'neg') + '">' +
      '<div class="row between"><span style="font-size:12px;display:inline-flex;align-items:center;gap:4px">' + icon(TYPE_ICONS[r.type] || 'circle-help', {size:13}) + (TYPES[r.type] || '') + '</span>' + starsHtml(r.rating) + '</div>' +
      '<div style="font-size:13px;margin-top:4px">' + esc(r.description) + '</div>' + amountsLine(r.meter_eur, r.cost_eur) +
      '<div class="muted" style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;align-items:center">' + esc(CITIES[r.city_key] ? CITIES[r.city_key].n : (r.city_key || '')) + ' · ' + ago(Date.parse(r.created_at)) + ' ' +
      (r.verified ? '<span class="badge b-ok">verificata</span>' : '<span class="badge">anonima</span>') + (r.ride_verified ? '<span class="badge b-ok">corsa verificata</span>' : '') + '</div>' +
      (r.replies || []).map(b => '<div class="reply"><b>' + icon('message-square', {size:13}) + 'Replica del tassista</b><br>' + esc(b) + '</div>').join('') + '</div>').join('') : '');
}
const rateState = {driver:0, ride:0};
function starPicker(id, onChange){
  const el = document.getElementById(id); el.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span'); s.innerHTML = icon('star', {size:30}); s.dataset.v = i;
    s.onclick = () => { onChange(i); Array.from(el.children).forEach(c => c.classList.toggle('on', +c.dataset.v <= i)); };
    el.appendChild(s);
  }
}
function openRating(){
  rateState.driver = 0; rateState.ride = 0;
 starPicker('rateDriver', v => rateState.driver = v);
 starPicker('rateRide', v => rateState.ride = v);
 $('#rateIssue').innerHTML = '<option value="positiva">Nessun problema</option>' + NEG.map(k => '<option value="' + k + '">' + TYPES[k] + '</option>').join('');
  $('#rateCost').value = ''; $('#rateComment').value = '';
  renderRateVerify();
  openModal('m-rate');
}
async function submitRating(){
  if (!rateState.driver || !rateState.ride) return toast('Dai un voto al tassista e alla corsa');
  const lr = lastRide || {}, cost = parseFloat($('#rateCost').value), pos = italianPosition(lastPos);
  const plate = /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(lr.plate || '') ? lr.plate : null;
  if (lr.check) await lr.check;
  const rideId = rideIdForReport(lr, Date.now());
  try {
    const res = await backend.submitRideRating({rideId,city: lr.city || (lastPos ? nearestCity(lastPos).key : 'roma'),
      driverRating:rateState.driver, rideRating:rateState.ride, type:$('#rateIssue').value, comment:$('#rateComment').value.trim(),
      plate, cost: isNaN(cost) ? null : cost, duration: lr.durMin || null, lat:pos.lat, lng:pos.lng});
    if (rideId) lr.claimed = true;
    closeModal('m-rate'); await afterSubmit();
    toast('Grazie! ' + sentMessage(res, 'Valutazione'));
  } catch(e) { toast(e.message); }
}

// Importi oggettivi della corsa: tassametro e pagato, affiancati.
function amountsLine(meter, cost){
  if (meter == null && cost == null) return '';
  return '<div class="muted" style="margin-top:4px">' + [meter != null ? 'Tassametro ' + fmtEur(+meter) : '', cost != null ? 'Pagato ' + fmtEur(+cost) : ''].filter(Boolean).join(' · ') + '</div>';
}
// Messaggio dopo un invio: il database pubblica subito o manda in revisione (ospiti, testi segnalati dai controlli).
function sentMessage(res, what){
  if (res.pending) return res.verified
    ? what + ' inviata: contiene espressioni da verificare (etichette, insulti o dati personali), la pubblicherà un moderatore dopo la revisione.'
    : what + ' anonima inviata: sarà pubblicata dopo la revisione di un moderatore e non concorre ai rating.';
  return res.verified ? what + ' pubblicata: +' + res.points + ' punti' : what + ' anonima inviata: visibile, ma non concorre ai rating';
}
async function afterSubmit(){
  if (!isLocal()) { try { DB.myReports = await backend.myReports(); } catch(e) {} }
  await loadFeed(true);
  refreshAll();
}

/* ================= SEGNALAZIONE ================= */
let reportRating = 0, attachments = [], reportGeo = null;
function initReportForm(){
 $('#reportCity').innerHTML = '<option value="">Seleziona…</option>' + Object.keys(CITIES).map(k => '<option value="' + k + '">' + CITIES[k].n + '</option>').join('');
 $('#reportType').innerHTML = '<option value="">Seleziona…</option>' + Object.keys(TYPES).map(k => '<option value="' + k + '">' + TYPES[k] + '</option>').join('');
 starPicker('reportStars', setReportRating);
 ['camPhoto','camVideo','micAudio','gallery'].forEach(id => document.getElementById(id).addEventListener('change', onFiles));
  $('#reportDesc').addEventListener('input', e => showTextHint('#descHint', e.target.value));
  $('#rateComment').addEventListener('input', e => showTextHint('#rateHint', e.target.value));
}
// IMP-01: testo di aiuto e segnaposto della descrizione cambiano con le stelle (regola in src/lib/textcheck.js).
function setReportRating(v){
  reportRating = v;
 $('#descHelp').textContent = descHelp(v);
 $('#reportDesc').placeholder = descPlaceholder(v);
}
// Avviso mentre si scrive: stesse regole dei controlli del database (src/lib/textcheck.js).
function showTextHint(sel, text){
  const flags = textFlags(text), box = $(sel);
  box.innerHTML = flags.length ? icon('triangle-alert', {size:14}) + ' ' + flags.map(f => FLAG_HINTS[f]).join(' ') + ' Se lasci il testo così, la segnalazione passa prima dalla revisione di un moderatore.' : '';
  box.classList.toggle('hidden', !flags.length);
}
function pick(id){ document.getElementById(id).click(); }
// Foto: elaborate subito sul dispositivo (niente metadati, volti pixelati); l'anteprima mostra ciò che verrà inviato.
// Video e audio: allegati così come sono, visibili solo ai moderatori.
async function onFiles(e){
  const files = Array.from(e.target.files || []); e.target.value = '';
  for (const f of files) {
    if (attachments.length >= MAX_ATTACHMENTS) { toast('Massimo ' + MAX_ATTACHMENTS + ' allegati'); break; }
    const kind = f.type.indexOf('image/') === 0 ? 'foto' : attachmentKind(f.type);
    if (!kind) { toast('"' + f.name + '": formato non supportato'); continue; }
    if (kind !== 'foto' && f.size > MAX_ATTACHMENT_BYTES) { toast('"' + f.name + '" supera 10 MB'); continue; }
    const a = {id: Math.random().toString(36).slice(2), kind, name: f.name, file: kind === 'foto' ? null : f, url: null, faces: null, processing: kind === 'foto'};
    attachments.push(a); renderThumbs();
    if (kind !== 'foto') continue;
    try {
      const {processPhoto} = await import('./media/photo.js');
      const r = await processPhoto(f);
      if (r.blob.size > MAX_ATTACHMENT_BYTES) throw new Error('"' + f.name + '" supera 10 MB anche dopo la compressione');
      a.file = r.blob; a.faces = r.faces; a.url = URL.createObjectURL(r.blob); a.processing = false;
    } catch(err) { attachments = attachments.filter(x => x !== a); toast(err.message); }
    renderThumbs();
  }
}
function renderThumbs(){
 $('#thumbs').innerHTML = attachments.map(a => {
    const ic = icon(a.processing ? 'hourglass' : a.kind === 'video' ? 'video' : a.kind === 'audio' ? 'mic' : 'file-text', {size:24});
    const info = a.processing ? 'Preparo la foto…' : a.kind === 'foto' ? (a.faces ? a.faces + (a.faces === 1 ? ' volto sfocato' : ' volti sfocati') : 'Nessun volto trovato') : 'Visibile solo ai moderatori';
    return '<div class="thumb" title="' + esc(a.name + ' · ' + info) + '">' + (a.url ? '<img src="' + a.url + '" alt="">' : ic) +
      (a.kind === 'foto' && !a.processing ? '<span class="faces">' + (a.faces ? icon('eye-off', {size:10}) + a.faces : icon('check', {size:10})) + '</span>' : '') +
      '<button type="button" onclick="removeAtt(\'' + a.id + '\')" aria-label="Rimuovi allegato">' + icon('x', {size:12}) + '</button></div>';
  }).join('');
}
function removeAtt(id){ const a = attachments.find(x => x.id === id); if (a && a.url) URL.revokeObjectURL(a.url); attachments = attachments.filter(x => x.id !== id); renderThumbs(); }
async function attachLocation(){
 $('#reportLoc').textContent = 'Rilevo…';
  try {
    const p = await getPos(true); reportGeo = p;
    const lbl = await reverseGeocode(p, true);
 $('#reportLoc').textContent = (lbl ? lbl + ' ' : '') + '(' + p.lat.toFixed(4) + ', ' + p.lng.toFixed(4) + ')';
    const nc = nearestCity(p); if (nc.dist < 60 && !$('#reportCity').value) $('#reportCity').value = nc.key;
  } catch(e) { $('#reportLoc').textContent = 'Posizione non disponibile'; }
}
let submitting = false;
async function submitReport(e){
  e.preventDefault();
  if (submitting) return;
  const f = e.target, d = Object.fromEntries(new FormData(f).entries()), errs = [];
  if (!d.name || d.name.trim().length < 3) errs.push('nome e cognome');
  if (!d.licenza || !d.licenza.trim()) errs.push('licenza');
  if (!/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(normPlate(d.targa))) errs.push('targa (formato AB123CD)');
  if (!d.city) errs.push('città');
  if (!d.type) errs.push('tipo');
  if (!reportRating) errs.push('valutazione');
  if ((d.description || '').trim().length < descMin(reportRating)) errs.push(reportRating >= 4 ? 'commento (anche solo "OK")' : 'descrizione dell\'accaduto (min. 20 caratteri)');
  if (!d.consent) errs.push('dichiarazione e privacy');
  if (errs.length) return toast('Completa: ' + errs.join(', '));
  if (attachments.some(a => a.processing)) return toast('Attendi: sto preparando le foto');
  const n = attachments.length, pos = italianPosition(reportGeo), btn = f.querySelector('button[type=submit]');
  submitting = true; if (btn) btn.disabled = true;
  const rideId = rideIdForReport(lastRide, Date.now());
  try {
    const res = await backend.submitReport({rideId,name:d.name.trim(), license:d.licenza, plate:normPlate(d.targa), city:d.city,
      from:(d.from || '').trim(), to:(d.to || '').trim(), type:d.type, rating:reportRating, description:d.description.trim(),
      cost: d.cost ? parseFloat(d.cost) : null, meter: d.meter ? parseFloat(d.meter) : null, duration: d.duration ? parseInt(d.duration, 10) : null,
      attachments:n, files:attachments.map(a => ({kind:a.kind, blob:a.file, faces:a.faces})), lat:pos.lat, lng:pos.lng});
    if (rideId) lastRide.claimed = true;
    attachments.forEach(a => a.url && URL.revokeObjectURL(a.url)); attachments = []; renderThumbs();
    f.reset(); showTextHint('#descHint', ''); setReportRating(0); starPicker('reportStars', setReportRating); reportGeo = null; $('#reportLoc').textContent = 'Non allegato';
    await afterSubmit(); openTab('home');
    toast(sentMessage(res, 'Segnalazione') + (res.attachmentErrors && res.attachmentErrors.length ? ' Allegati non caricati: ' + res.attachmentErrors.join('; ') : ''));
  } catch(err) { toast(err.message); }
  finally { submitting = false; if (btn) btn.disabled = false; }
}
function updateAnonNotice(){
 $('#anonNotice').innerHTML = DB.user
    ? icon('circle-check-big', {size:14}) + (isLocal() ? 'Segnalazione verificata: concorre ai rating e vale punti.' : 'Segnalazione verificata: se supera i controlli automatici è pubblicata subito, concorre ai rating e vale punti.')
    : icon('user', {size:14}) + 'Stai segnalando come ospite: la segnalazione ' + (isLocal() ? 'sarà visibile' : 'sarà pubblicata dopo la revisione di un moderatore') + ' ma non concorre ai rating. <a href="#" onclick="event.preventDefault();openModal(\'m-login\')">Accedi</a>';
  const rid = rideIdForReport(lastRide, Date.now());
  $('#reportRide').innerHTML = rid ? icon('shield-check', {size:14}) + ' Collegata alla corsa conclusa alle ' + hhmm(lastRide.endedAt) + ': se la targa coincide con quella indicata all\'inizio della corsa, avrà il bollino "corsa verificata".' : '';
  $('#reportRide').classList.toggle('hidden', !rid);
  const i = document.querySelector('#reportForm [name=name]');
  if (DB.user && i && !i.value) i.value = DB.user.name;
}

/* ================= MAPPA ITALIA ================= */
const heatRadius = (v, n) => 10000 + (100 - (v == null ? 50 : v))*350 + n*400;
function initItalyMap(){
  italyMap = makeMap('italyMap', [42.3, 12.6], 5);
  if (!italyMap) return;
 Object.keys(CITIES).forEach(k => {
    const c = CITIES[k], reps = byCity(k), v = indexOf(reps), col = mood(v).c;
    const heat = L.circle([c.lat, c.lng], {radius:heatRadius(v, reps.length), weight:0, fillColor:col, fillOpacity:0.35}).addTo(italyMap);
    const dot = L.circleMarker([c.lat, c.lng], {radius:7, color:'#fff', weight:2, fillColor:col, fillOpacity:1}).addTo(italyMap)
      .bindTooltip(c.n + ' · ' + (v == null ? 'n.d.' : v) + '/100');
    heat.on('click', () => selectCity(k)); dot.on('click', () => selectCity(k));
    cityLayers[k] = {heat, dot};
  });
 italyMap.on('zoomend', toggleLayersByZoom);
  buildReportLayer();
}
function buildReportLayer(){
  if (!italyMap) return;
  if (reportLayer) italyMap.removeLayer(reportLayer);
  reportLayer = L.layerGroup();
  DB.reports.forEach(r => { if (r.lat == null) return; L.circle([r.lat, r.lng], {radius:350, weight:0, fillColor: r.type === 'positiva' ? '#16a34a' : '#dc2626', fillOpacity:0.4}).addTo(reportLayer); });
 toggleLayersByZoom();
}
function toggleLayersByZoom(){
  if (!italyMap) return;
  const city = italyMap.getZoom() >= 10;
 Object.values(cityLayers).forEach(l => { if (city && italyMap.hasLayer(l.heat)) italyMap.removeLayer(l.heat); if (!city && !italyMap.hasLayer(l.heat)) l.heat.addTo(italyMap); });
  if (reportLayer) { if (city && !italyMap.hasLayer(reportLayer)) reportLayer.addTo(italyMap); if (!city && italyMap.hasLayer(reportLayer)) italyMap.removeLayer(reportLayer); }
}
function refreshItalyMap(){
  if (!italyMap) return;
 Object.keys(cityLayers).forEach(k => {
    const reps = byCity(k), v = indexOf(reps), col = mood(v).c, l = cityLayers[k];
 l.heat.setStyle({fillColor:col}); l.heat.setRadius(heatRadius(v, reps.length));
 l.dot.setStyle({fillColor:col}); l.dot.setTooltipContent(CITIES[k].n + ' · ' + (v == null ? 'n.d.' : v) + '/100');
  });
  buildReportLayer();
}
function selectCity(k){ if (!CITIES[k]) return; if (italyMap) italyMap.flyTo([CITIES[k].lat, CITIES[k].lng], 12, {duration:0.8}); renderCityStats(k); }
function resetItaly(){ if (italyMap) italyMap.flyTo([42.3, 12.6], 5, {duration:0.8}); }
function searchCity(){
  const q = $('#citySearch').value.trim().toLowerCase(); if (!q) return;
  const keys = Object.keys(CITIES);
  const k = keys.find(x => CITIES[x].n.toLowerCase() === q) || keys.find(x => CITIES[x].n.toLowerCase().indexOf(q) === 0);
  if (k) { $('#citySearch').value = CITIES[k].n; selectCity(k); } else geocodeCity(q);
}
async function geocodeCity(q){
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=it&accept-language=it&q=' + encodeURIComponent(q));
    const j = await r.json();
    if (!j[0]) return toast('Città non trovata');
    if (italyMap) italyMap.flyTo([+j[0].lat, +j[0].lon], 12);
 $('#cityStats').innerHTML = '<h3>' + icon('landmark', {size:15}) + esc(j[0].display_name.split(',')[0]) + '</h3><p class="muted">Città non ancora monitorata: nessuna segnalazione disponibile.</p>';
  } catch(e) { toast('Ricerca non disponibile offline'); }
}
function renderNational(){
  const v = indexOf(DB.reports), m = mood(v), pm = perMinOf(DB.reports);
  const ranks = Object.keys(CITIES).map(k => ({k, v:indexOf(byCity(k)), n:byCity(k).length})).filter(x => x.v != null).sort((a, b) => b.v - a.v);
  const lics = Object.keys(CITIES).map(k => figure(DB.official, k, 'licenze_taxi')).filter(Boolean);
  const lic = lics.reduce((a, f) => a + Number(f.value), 0);
 $('#nationalStats').innerHTML = '<h3>' + icon('globe', {size:16}) + 'Statistiche nazionali</h3>' +
    '<div class="stats3"><div class="stat"><b style="color:' + m.c + '">' + (v == null ? '—' : v) + '</b><span>Indice 0–100</span></div>' +
    '<div class="stat"><b>' + fmtNum(DB.reports.length) + '</b><span>Segnalazioni</span></div>' +
    '<div class="stat"><b>' + (pm ? fmtEur(pm) : '—') + '</b><span>Costo medio/min</span></div></div>' +
    '<h3 style="margin-top:14px">Classifica città</h3>' +
    ranks.map((x, i) => '<div class="kv" style="cursor:pointer" onclick="selectCity(\'' + x.k + '\')"><span>' + (i+1) + '. ' + CITIES[x.k].n + '</span><b style="display:flex;align-items:center;gap:5px;color:' + mood(x.v).c + '">' + '<span class="gauge-mini">' + gaugeSvg(x.v, {width:40}) + '</span><span class="rank-val">' + x.v + '/100</span> <span class="muted rank-n">(' + x.n + ')</span></b></div>').join('') +
    (lics.length ? '<div class="muted" style="margin-top:6px">Licenze taxi nelle città monitorate: ' + fmtNum(lic) + '. ' + esc(sourceLine(lics[0])) + (lics[0].stale ? ' ' + staleBadge() : '') + '</div>' : '');
}
function renderCityStats(k){
  const c = CITIES[k], reps = byCity(k), v = indexOf(reps), m = mood(v), pm = perMinOf(reps);
  const neg = reps.filter(r => r.type !== 'positiva'), cnt = {};
  neg.forEach(r => cnt[r.type] = (cnt[r.type] || 0) + 1);
  const probs = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
  const lic = figure(DB.official, k, 'licenze_taxi'), ts = figure(DB.official, k, 'tariffa_partenza'),
    tk = figure(DB.official, k, 'tariffa_km'), std = figure(DB.official, k, 'corsa_standard');
 $('#cityStats').innerHTML =
    '<h3>' + icon('landmark', {size:15}) + c.n + '</h3>' +
    '<div class="thermo">' + gaugeSvg(v, {width:160}) + '<div class="val" style="font-size:30px">' + (v == null ? '—' : v) + '<span style="font-size:14px;color:var(--mut)">/100</span></div><div style="font-weight:700">' + m.l + '</div></div>' +
    '<h3 style="margin-top:10px">Andamento negli ultimi 12 mesi</h3><div id="trendCity" class="trend-box"></div>' +
    '<h3 style="margin-top:12px">' + icon('landmark', {size:14}) + 'Dati ufficiali</h3>' +
    (lic ? officialRow('Licenze taxi', fmtNum(Number(lic.value)), lic) : '') +
    (ts && tk ? officialRow('Tariffa (partenza feriale diurna, al km)', fmtEur(Number(ts.value)) + ' + ' + fmtEur(Number(tk.value)) + '/km', ts) : '<div class="kv"><span>Tariffa comunale</span><b class="muted">delibera da verificare</b></div>') +
    (std ? officialRow('Corsa standard (5 km e 5 minuti di attesa, feriale)', fmtEur(Number(std.value)), std) : '') +
    '<div class="note" style="font-size:12px">Fabbisogno di licenze (metodologia ART) e redditi o ricavi dichiarati (MEF) non sono pubblicati per città da fonti ufficiali: non mostriamo stime.</div>' +
    '<h3 style="margin-top:12px">' + icon('bell', {size:14}) + 'Dati Safe Taxi</h3>' +
    '<div class="kv"><span>Segnalazioni (verificate)</span><b>' + reps.length + ' (' + reps.filter(r => r.verified).length + ')</b></div>' +
    '<div class="kv"><span>Costo medio al minuto (dalle segnalazioni)</span><b>' + (pm ? fmtEur(pm) : '—') + '</b></div>' +
    '<h3 style="margin-top:12px">Problemi segnalati</h3>' +
    (probs.length ? probs.map(p => { const pc = Math.round(cnt[p]/neg.length*100); return '<div class="pbar"><span class="t">' + TYPES[p] + '</span><span class="p"><i style="width:' + pc + '%"></i></span><b>' + pc + '%</b></div>'; }).join('') : '<p class="muted">Nessuna criticità segnalata.</p>') +
    '<div class="note">Il confronto con i redditi dichiarati si farà solo su dati ufficiali aggregati e con metodologia pubblica, mai sul singolo tassista.</div>';
  if (!loading) showTrend('trendCity', k);
}
// Dato ufficiale con la sua fonte (link) e, se la pubblicazione ha più di 12 mesi, l'avviso.
const staleBadge = () => '<span class="badge b-demo">ultima pubblicazione ufficiale oltre 12 mesi fa</span>';
function officialRow(label, value, f){
  return '<div class="kv"><span>' + label + '</span><b style="white-space:nowrap">' + value + '</b></div>' +
    '<div class="muted" style="font-size:12px;margin:-2px 0 6px"><a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(sourceLine(f)) + '</a>' + (f.stale ? ' ' + staleBadge() : '') + '</div>';
}

/* ================= PRENOTA ================= */
let bookFilter = 'all';
function initBook(){
 $('#bookCity').innerHTML = Object.keys(CITIES).map(k => '<option value="' + k + '">' + CITIES[k].n + '</option>').join('');
 $('#bookFilters').innerHTML = Object.keys(FILTERS).map(f => '<button class="chip' + (f === 'all' ? ' on' : '') + '" data-bf="' + f + '" onclick="setBookFilter(\'' + f + '\')">' + (FILTER_ICONS[f] ? icon(FILTER_ICONS[f], {size:13}) : '') + FILTERS[f] + '</button>').join('');
  renderBook();
}
function setBookFilter(f){ bookFilter = f; $$('[data-bf]').forEach(b => b.classList.toggle('on', b.dataset.bf === f)); renderBook(); }
const passes = x => bookFilter === 'all' ? true : bookFilter === 'rec' ? isRec(x) : (x.f || []).indexOf(bookFilter) >= 0;
function coopCard(x, priority){
  const rec = isRec(x);
  const st = x.st != null ? starsHtml(x.st) + ' <b>' + fmtNum(x.st, 1) + '</b> <span class="muted">(' + x.rv + ' recensioni Safe Taxi)</span>' : '<span class="muted">Recensioni insufficienti</span>';
  const ext = x.ext ? '<div class="muted">' + esc(x.ext.src) + ': ' + fmtNum(x.ext.v, 1) + '/5</div>' : '';
  const action = x.tel
    ? '<button class="btn sm" data-tel="' + x.tel + '" data-name="' + esc(x.n) + '" onclick="callNumber(this.dataset.tel, this.dataset.name)">' + icon('phone-call', {size:14}) + fmtTel(x.tel) + '</button>'
    : '<button class="btn sm" onclick="openStore(\'' + x.store + '\')">' + icon('smartphone', {size:14}) + 'Apri o scarica</button>';
  return '<div class="card" style="' + (rec ? 'border:1.5px solid var(--pri)' : '') + '">' +
    '<div class="row between"><b>' + esc(x.n) + (priority ? ' <span class="badge b-ok">Priorità</span>' : '') + '</b>' + (rec ? '<span class="badge rec">' + icon('trophy', {size:12}) + 'RECOMMENDED</span>' : '') + '</div>' +
    '<div style="margin:6px 0;font-size:13px;display:flex;align-items:center;gap:4px">' + st + '</div>' + ext +
    (x.v === false ? '<div style="margin:6px 0"><span class="badge b-demo">Numero da verificare</span></div>' : '') +
    '<div class="chips" style="margin:6px 0">' + (x.f || []).map(f => '<span class="badge">' + (FILTER_ICONS[f] ? icon(FILTER_ICONS[f], {size:11}) : '') + (FILTERS[f] || f) + '</span>').join('') + '</div>' +
    (x.d ? '<div class="muted" style="margin-bottom:8px">' + esc(x.d) + '</div>' : '') + action + '</div>';
}
function renderBook(){
  const k = $('#bookCity').value || 'roma';
  const apps = APPS.filter(passes);
  const all = COOPS[k] || [], coops = all.filter(passes).sort((a, b) => (b.st || 0) - (a.st || 0));
  let html = apps.map(x => coopCard(x, x.id === 'uber')).join('');
  html += '<h3 style="margin:14px 2px 8px">' + icon('building-2', {size:15}) + 'Cooperative a ' + CITIES[k].n + '</h3>';
  html += coops.length ? coops.map(x => coopCard(x, false)).join('') : '<div class="card muted">' + (all.length ? 'Nessuna cooperativa corrisponde al filtro.' : 'Cooperative di questa città non ancora censite.') + '</div>';
  html += '<div class="card"><h3>' + icon('trophy', {size:16}) + 'Cosa significa RECOMMENDED</h3><div style="font-size:13px;line-height:1.5">Il bollo è assegnato automaticamente a chi ha, sulle esperienze degli utenti Safe Taxi verificati: valutazione media pari o superiore a 4,0 su 5; almeno 20 recensioni negli ultimi 12 mesi. Il calcolo è aggiornato ogni mese. Il bollo non è acquistabile e si perde se i requisiti non sono più rispettati. La voce "Priorità" indica il posizionamento in elenco: se deriva da un accordo commerciale, viene indicata come "Sponsorizzato".</div></div>';
  html += '<div class="muted" style="padding:0 4px 10px">Valutazioni Safe Taxi demo. Numeri e servizi verificati sui siti ufficiali delle cooperative il 27/09/2026, salvo quelli marcati "da verificare".</div>';
 $('#bookList').innerHTML = html;
}
async function callNumber(tel, name){ if (await confirmDialog('Chiamare ' + name + '?', 'Verrà avviata una chiamata al numero ' + fmtTel(tel) + ' fuori dall’app.', 'Chiama')) location.href = 'tel:' + tel; }

/* ================= SOS E CONDIVISIONE ================= */
async function openSOS(){
  openModal('m-sos'); $('#sosLoc').innerHTML = icon('map-pin', {size:13}) + ' Rilevo la posizione…';
  try {
    const p = (lastPos && Date.now() - (lastPos.ts || 0) < 60000) ? lastPos : await getPos(true);
    const lbl = await reverseGeocode(p, true);
 $('#sosLoc').innerHTML = icon('map-pin', {size:13}) + ' <b>' + esc(lbl || 'Posizione rilevata') + '</b><br><span class="muted">' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5) + (p.acc ? ' · precisione ±' + Math.round(p.acc) + ' m' : '') + '</span>';
  } catch(e) { $('#sosLoc').innerHTML = icon('map-pin', {size:13}) + ' Posizione non disponibile: comunica a voce dove ti trovi.'; }
}
async function call112(){ if (await confirmDialog('Chiamare il 112?', 'Stai per chiamare il Numero Unico di Emergenza. Usalo solo in caso di reale emergenza.', 'Chiama il 112')) location.href = 'tel:112'; }
let shareSOS = false, shareEdited = false, shareP = null;
async function openShare(fromSOS){
  shareSOS = !!fromSOS; shareEdited = false;
  const sel = $('#shareContact');
  sel.innerHTML = '<option value="">— Numero manuale —</option>' + DB.contacts.map((c, i) => '<option value="' + i + '">' + esc(c.name) + ' (' + esc(c.phone) + ')</option>').join('');
  sel.value = DB.contacts.length ? '0' : '';
 $('#sharePhone').value = '';
 openModal('m-share');
  shareP = lastPos;
  if (!shareP) { try { shareP = await getPos(true); } catch(e) { shareP = null; } }
  if (shareP) { try { await reverseGeocode(shareP, true); } catch(e) {} }
  fillShareText();
}
function fillShareText(){
  const sel = $('#shareContact'), c = sel.value !== '' ? DB.contacts[+sel.value] : null;
  if (c) $('#sharePhone').value = c.phone;
  if (shareEdited) return;
  const nome = c ? ' ' + c.name.split(' ')[0] : '';
  const plate = (ride && ride.plate) || normPlate($('#lookupPlate').value);
  const t = new Date().toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
  const lines = [shareSOS ? 'Ciao' + nome + ', ho bisogno di aiuto.' : 'Ciao' + nome + ', ti avviso che sono su un taxi e ti condivido la mia posizione.'];
  if (geoLast.label) lines.push('📍 ' + geoLast.label);
  lines.push(shareP ? '🗺️ ' + mapsLink(shareP) : '🗺️ Posizione non disponibile');
  if (liveShare) lines.push('🔴 Segui la corsa in tempo reale: ' + liveShare.link + ' (fino alle ' + hhmm(liveShare.expires) + ')');
  if (plate) lines.push('🚕 Taxi: ' + plate);
  lines.push('🕐 ' + t);
  lines.push(shareSOS ? 'Se non rispondo, chiama il 112.' : 'Se non mi senti entro 30 minuti, chiamami.');
 $('#shareText').value = lines.join('\n');
}
function sendShare(kind){
  const phone = ($('#sharePhone').value || '').replace(/[^\d+]/g, ''), text = $('#shareText').value;
  if (kind === 'whatsapp') {
    let n = phone.replace(/^\+/, '').replace(/^00/, '');
    if (n && n.length === 10 && n.charAt(0) === '3') n = '39' + n;
    openExternal((n ? 'https://wa.me/' + n : 'https://wa.me/') + '?text=' + encodeURIComponent(text));
  } else {
    location.href = 'sms:' + phone + (isIOS() ? '&' : '?') + 'body=' + encodeURIComponent(text);
  }
 closeModal('m-share');
}

/* ================= PROFILO / PREMI / LOGIN ================= */
async function redeem(i){
  const r = REWARDS[i];
  if (!DB.user) return toast('Accedi per riscattare i premi');
  if (DB.points < r.c) return toast('Ti mancano ' + (r.c - DB.points) + ' punti');
  if (await confirmDialog('Riscattare il premio?', r.n + ' per ' + fmtNum(r.c) + ' punti.', 'Riscatta')) {
    try { await backend.redeem(r); renderProfile(); toast('Premio riscattato (simulato)'); } catch(e) { toast(e.message); }
  }
}
function renderProfile(){
  const u = DB.user, lv = level(DB.points);
  const bat = battery ? Math.round(battery.level*100) + '%' + (battery.charging ? ' in carica' : '') : 'non rilevabile su questo dispositivo';
 $('#profileBox').innerHTML =
    '<div class="card">' + (u
      ? '<h2>' + icon('user-round-check', {size:19}) + esc(u.name) + '</h2><p class="muted">Accesso con ' + esc(u.provider === 'google' ? 'Google' : u.provider) + (u.email ? ' · ' + esc(u.email) : '') + ' <span class="badge b-ok">verificato</span></p><button class="btn sec sm" style="margin-top:10px" onclick="logout()">Esci</button>'
      : '<h2>' + icon('user', {size:19}) + 'Ospite</h2><p class="muted">Senza account puoi inviare valutazioni e usare l’SOS. Per far contare le segnalazioni nei rating e accumulare punti serve l’accesso.</p><button class="btn" style="margin-top:10px" onclick="openModal(\'m-login\')">Accedi o registrati</button>') + '</div>' +
    (isMod() ? '<div class="card"><h3>' + icon('shield-check', {size:16}) + 'Moderazione</h3><p class="muted">Segnalazioni, foto e repliche da verificare.</p><button class="btn" style="margin-top:8px" onclick="openTab(\'moderazione\')">Apri la moderazione</button></div>' : '') +
    myReportsCard() + myNoticesCard() +
    '<div class="card"><h3>' + icon('gift', {size:16}) + 'Punti e premi</h3><div class="thermo"><div class="val">' + fmtNum(DB.points) + '</div><div class="muted">Livello <b>' + lv.name + '</b>' + (lv.next ? ' · ' + (lv.next.min - DB.points) + ' punti a ' + lv.next.name : '') + '</div></div>' +
    '<div class="pbar"><span class="p"><i style="width:' + lv.pct + '%;background:var(--pri)"></i></span></div>' +
    '<div class="note">Stessi punti per segnalazioni positive e negative: +50 segnalazione completa, +20 con allegati, +10 valutazione di fine corsa. Si premia la partecipazione, non il giudizio espresso.</div>' +
    REWARDS.map((r, i) => '<div class="kv"><span>' + esc(r.n) + '</span><button class="btn sm' + (DB.points >= r.c ? '' : ' sec') + '" onclick="redeem(' + i + ')">' + fmtNum(r.c) + ' pt</button></div>').join('') +
    (DB.ledger.length ? '<h3 style="margin-top:12px">Movimenti</h3>' + DB.ledger.slice(0, 8).map(l => '<div class="kv"><span>' + esc(l.why) + '</span><b style="color:' + (l.n > 0 ? '#16a34a' : '#dc2626') + '">' + (l.n > 0 ? '+' : '') + l.n + '</b></div>').join('') : '') + '</div>' +
    placesCard() +
    '<div class="card"><h3>' + icon('life-buoy', {size:16}) + 'Contatti di emergenza</h3>' +
 (DB.contacts.length ? DB.contacts.map((c, i) => '<div class="kv"><span>' + esc(c.name) + ' · ' + esc(c.phone) + '</span><button class="btn sec sm" onclick="removeContact(' + i + ')" aria-label="Rimuovi contatto">' + icon('x', {size:13}) + '</button></div>').join('') : '<p class="muted">Nessun contatto salvato.</p>') +
    '<div class="row" style="margin-top:8px"><input id="cName" placeholder="Nome"><input id="cPhone" placeholder="Telefono" inputmode="tel"></div>' +
    '<button class="btn sec" style="margin-top:8px" onclick="addContact()">+ Aggiungi contatto</button></div>' +
    '<div class="card"><h3>' + icon(battery && battery.charging ? 'battery-charging' : battery && battery.level <= 0.2 ? 'battery-low' : 'battery', {size:16}) + 'Energia</h3><div class="kv"><span>Batteria</span><b>' + bat + '</b></div>' +
    '<label class="row" style="margin-top:8px;font-size:14px"><input type="checkbox" style="width:auto"' + (DB.powerSave ? ' checked' : '') + ' onchange="setPowerSave(this.checked)"> Risparmio energetico manuale</label>' +
    '<div class="note">In risparmio: GPS a bassa precisione, nome via aggiornato ogni 60 secondi invece di 20, animazioni disattivate. Si attiva da solo sotto il 20% se il browser espone il livello batteria (Safari su iPhone non lo espone).</div></div>' +
    '<div class="card"><h3>' + icon('package', {size:16}) + 'Dati aperti</h3><p class="muted">Dataset anonimizzato: niente nomi, targhe o licenze; coordinate arrotondate a circa 1 km. In produzione lo stesso formato è servito via API REST e SFTP ai soggetti accreditati.</p>' +
    '<div class="row" style="margin-top:8px"><button class="btn sec" onclick="exportData(\'json\')">JSON</button><button class="btn sec" onclick="exportData(\'csv\')">CSV</button></div></div>' +
    deleteCard() +
    '<div class="card"><h3>' + icon('lock', {size:16}) + 'Privacy</h3><button class="btn sec" onclick="openModal(\'m-privacy\')">Leggi l’informativa</button>' + (isLocal() ? '<button class="btn sec" style="margin-top:8px" onclick="resetDemo()">Ripristina dati demo</button>' : '') + '</div>';
}
// Cancellazione dell'account: richiesta dagli store; raggiungibile anche dal sito con ?account=elimina.
function deleteCard(){
  const has = backend && backend.hasSession();
  return '<div class="card" id="deleteCard"><h3>' + icon('trash-2', {size:16}) + 'Elimina account e dati</h3>' +
    '<p class="muted">Cancelliamo subito: profilo e accesso, punti, condivisioni della corsa, segnalazioni e repliche non ancora pubblicate (con foto, video e audio). ' +
    'Le segnalazioni già pubblicate restano come contributo anonimo: il tuo nome viene cancellato. Su questo dispositivo cancelliamo anche preferiti e recenti. L\'operazione non si può annullare.</p>' +
    (has ? '<button class="btn danger" style="margin-top:10px" onclick="deleteAccount()">Elimina account e dati</button>'
         : '<p class="muted" style="margin-top:8px">Per cancellare il tuo account accedi con lo stesso metodo che usi di solito.</p><button class="btn sec" style="margin-top:8px" onclick="openModal(\'m-login\')">Accedi</button>') + '</div>';
}
async function deleteAccount(){
  if (!(await confirmDialog('Eliminare account e dati?', 'Profilo, punti e contenuti non pubblicati verranno cancellati subito. Non si può annullare.', 'Elimina definitivamente'))) return;
  try { await backend.deleteAccount(); await clearPlaces(); renderPlaces(); await reloadData(); renderProfile(); toast('Account e dati cancellati.'); }
  catch(e) { toast(e.message); }
}
function myReportsCard(){
  if (!DB.myReports.length) return '';
  return '<div class="card"><h3>' + icon('file-text', {size:16}) + 'Le tue segnalazioni</h3>' + DB.myReports.slice(0, 10).map(r =>
    '<div class="kv"><span>' + (TYPES[r.type] || '') + ' · ' + esc(CITIES[r.city_key] ? CITIES[r.city_key].n : r.city_key) + ' · ' + ago(Date.parse(r.created_at)) +
    (r.rejection_reason ? '<br><span class="muted">Motivo: ' + esc(r.rejection_reason) + '</span>' : '') + '</span>' +
    '<span class="badge' + (r.status === 'pubblicata' ? ' b-ok' : '') + '">' + (STATUS_LABELS[r.status] || r.status) + '</span></div>').join('') +
    '<div class="note">Le segnalazioni di account verificati che superano i controlli automatici sono pubblicate subito; le altre dopo la revisione di un moderatore.' + (DB.user ? '' : ' Senza account le segnalazioni restano legate a questo dispositivo.') + '</div></div>';
}
function myNoticesCard(){
  if (!DB.myNotices || !DB.myNotices.length) return '';
  return '<div class="card"><h3>' + icon('flag', {size:16}) + 'Contenuti che hai segnalato</h3>' + DB.myNotices.slice(0, 10).map(n =>
    '<div class="kv"><span>«' + esc(n.content || '') + '»<br><span class="muted">' + esc(NOTICE_CATEGORIES[n.category] || n.category) + ' · ' + ago(Date.parse(n.created_at)) +
    (n.decision_reason ? '<br>Motivazione: ' + esc(n.decision_reason) : '') + '</span></span>' +
    '<span class="badge' + (n.status === 'accolta' ? ' b-ok' : '') + '">' + (NOTICE_STATUS[n.status] || n.status) + '</span></div>').join('') + '</div>';
}
function addContact(){
  const n = $('#cName').value.trim(), p = $('#cPhone').value.trim();
  if (!n || p.replace(/\D/g, '').length < 6) return toast('Inserisci nome e numero');
 DB.contacts.push({name:n, phone:p}); saveContacts(); renderProfile();
}
function removeContact(i){ DB.contacts.splice(i, 1); saveContacts(); renderProfile(); }
// Gestione dei preferiti nel profilo: rinomina ed elimina.
async function renameFav(id){
  const el = document.querySelector('[data-fav="' + id + '"]'); if (!el) return;
  try { places.favorites = renameFavorite(places.favorites, id, el.value); } catch(e) { return toast(e.message); }
  await savePlaces(); renderPlaces(); renderProfile(); toast('Preferito rinominato');
}
async function deleteFav(id){
  places.favorites = removeFavorite(places.favorites, id); await savePlaces(); renderPlaces(); renderProfile();
}
function placesCard(){
  const favs = sortFavorites(places.favorites);
  return '<div class="card"><h3>' + icon('star', {size:16}) + 'Indirizzi preferiti</h3>' +
    (favs.length ? favs.map(f => '<div class="row" style="margin-top:6px"><input data-fav="' + esc(f.id) + '" value="' + esc(f.label) + '" aria-label="Nome del preferito ' + esc(f.label) + '"><button class="btn sec sm" onclick="renameFav(\'' + esc(f.id) + '\')">Rinomina</button><button class="btn sec sm" onclick="deleteFav(\'' + esc(f.id) + '\')" aria-label="Elimina ' + esc(f.label) + '">' + icon('trash-2', {size:13}) + '</button></div><div class="muted" style="font-size:12px">' + esc(f.name) + '</div>').join('')
      : '<p class="muted">Nessun preferito. Cerca una destinazione in Home e salvala come Casa, Lavoro o con un nome.</p>') +
    '<div class="kv" style="margin-top:8px"><span>Destinazioni recenti</span><b>' + places.recents.length + '</b></div>' +
    (places.recents.length ? '<button class="btn sec sm" onclick="clearRecents()">Cancella cronologia</button>' : '') +
    '<div class="note">Preferiti, recenti e contatti di emergenza restano solo su questo dispositivo: non vengono inviati ai nostri server.</div></div>';
}
function loginFields(){
  const em = $('#loginEmail').value.trim(), pw = $('#loginPwd').value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast('Email non valida'); return null; }
  if (pw.length < 8) { toast('Password: minimo 8 caratteri'); return null; }
  return {em, pw};
}
async function emailLogin(){
  const v = loginFields(); if (!v) return;
  try { await backend.signIn(v.em, v.pw); await afterLogin(); } catch(e) { toast(e.message); }
}
async function emailSignup(){
  const v = loginFields(); if (!v) return;
  try {
    const r = await backend.signUp(v.em, v.pw);
    if (r.needsConfirmation) { $('#loginPwd').value = ''; $('#loginNote').innerHTML = icon('mail', {size:13}) + ' Ti abbiamo inviato un\'email a ' + esc(v.em) + ': apri il link per confermare l\'account.'; toast('Controlla la tua email per confermare'); return; }
    await afterLogin();
  } catch(e) { toast(e.message); }
}
async function googleLogin(){
  try { await backend.signInGoogle(); if (isLocal()) await afterLogin(); } catch(e) { toast(e.message); }
}
async function forgotPassword(){
  const em = $('#loginEmail').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast('Scrivi prima la tua email');
  try { await backend.resetPassword(em); $('#loginNote').innerHTML = icon('mail', {size:13}) + ' Se esiste un account per ' + esc(em) + ', riceverai un link per scegliere una nuova password.'; } catch(e) { toast(e.message); }
}
async function saveNewPassword(){
  const pw = $('#newPwd').value;
  if (pw.length < 8) return toast('Password: minimo 8 caratteri');
  try { await backend.updatePassword(pw); $('#newPwd').value = ''; closeModal('m-newpwd'); toast('Password aggiornata'); } catch(e) { toast(e.message); }
}
async function afterLogin(){ closeModal('m-login'); $('#loginPwd').value = ''; await reloadData(); toast(isLocal() ? 'Accesso effettuato (simulato)' : 'Accesso effettuato'); }
async function logout(){ await backend.signOut(); await reloadData(); }
// Eventi di Supabase Auth: accesso dopo conferma email o Google, uscita, recupero password.
function onAuthChange(event, message){
  if (event === 'AUTH_ERROR') { toast(message); return; }
  if (event === 'PASSWORD_RECOVERY') { closeModal('m-login'); openModal('m-newpwd'); return; }
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') reloadData();
}
function exportData(fmt){
  const rows = toOpenDataRows(DB.reports);
  if (!rows.length) return toast('Nessun dato da esportare');
  let blob, name;
  if (fmt === 'csv') {
    const csv = toCsv(rows);
    blob = new Blob([csv], {type:'text/csv'}); name = 'safetaxi_opendata.csv';
  } else {
    blob = new Blob([JSON.stringify({schema:'safetaxi.opendata.v1', generato:new Date().toISOString(), licenza:'CC BY 4.0', record:rows}, null, 2)], {type:'application/json'}); name = 'safetaxi_opendata.json';
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
 document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function resetDemo(){
  if (await confirmDialog('Ripristinare i dati demo?', 'Cancella segnalazioni, punti, contatti, preferiti e recenti salvati su questo dispositivo.', 'Ripristina')) {
    try { localStorage.removeItem(DB_KEY); } catch(e) {}
    await clearPlaces(); await deviceRemove(CONTACTS_KEY);
    loadDB(); await loadDeviceData(); renderPlaces(); await reloadData(); toast('Dati demo ripristinati');
  }
}

/* ================= REPLICA DEL TASSISTA ================= */
let replyTarget = null;
// Segnalazione di un contenuto pubblicato (Digital Services Act, art. 16).
let noticeTarget = null;
function openNotice(kind, id){
  noticeTarget = {kind, id};
  $('#noticeCategory').innerHTML = '<option value="">Scegli il motivo</option>' + Object.entries(NOTICE_CATEGORIES).map(([k, l]) => '<option value="' + k + '">' + esc(l) + '</option>').join('');
  $('#noticeExplanation').value = ''; $('#noticeGoodFaith').checked = false;
  $('#noticeName').value = DB.user ? DB.user.name : ''; $('#noticeEmail').value = DB.user ? DB.user.email : '';
  $('#noticeWhat').textContent = kind === 'replica' ? 'Stai segnalando una replica del tassista.' : 'Stai segnalando una segnalazione pubblicata.';
  openModal('m-notice');
}
async function sendNotice(){
  const d = {kind:noticeTarget.kind, target:noticeTarget.id, category:$('#noticeCategory').value, explanation:$('#noticeExplanation').value.trim(),
    name:$('#noticeName').value.trim(), email:$('#noticeEmail').value.trim(), goodFaith:$('#noticeGoodFaith').checked};
  if (!d.category) return toast('Scegli il motivo della segnalazione');
  if (d.explanation.length < 20) return toast('Spiega il motivo in almeno 20 caratteri');
  if (d.name.length < 3 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return toast('Indica nome, cognome ed email');
  if (!d.goodFaith) return toast('Conferma la dichiarazione di buona fede');
  try {
    await backend.submitContentNotice(d); closeModal('m-notice');
    DB.myNotices = await backend.myContentNotices().catch(() => DB.myNotices);
    toast('Segnalazione ricevuta: un moderatore la verificherà. Trovi l\'esito nel profilo.');
  } catch(e) { toast(e.message); }
}
function openReply(id){ replyTarget = id; ['replyIdent', 'replyContact', 'replyBody'].forEach(i => { $('#' + i).value = ''; }); openModal('m-reply'); }
async function sendReply(){
  const ident = $('#replyIdent').value.trim(), contact = $('#replyContact').value.trim(), body = $('#replyBody').value.trim();
  if (normPlate(ident).length < 2) return toast('Indica la targa o il numero di licenza');
  if (contact.length < 5) return toast('Indica un\'email o un telefono per la verifica');
  if (body.length < 20) return toast('La replica deve avere almeno 20 caratteri');
  try { await backend.submitDriverReply(replyTarget, ident, contact, body); closeModal('m-reply'); toast('Replica inviata: sarà pubblicata dopo la verifica del moderatore.'); }
  catch(e) { toast(e.message); }
}

/* ================= MODERAZIONE ================= */
// La pagina è mostrata solo ai moderatori; i controlli veri sono nelle funzioni del database.
const isMod = () => DB && (DB.role === 'moderatore' || DB.role === 'admin');
let modQueue = null, modUrls = {}, rejectTarget = null, blurState = null;
const kv = (k, v) => '<div class="kv"><span>' + k + '</span><b style="text-align:right">' + esc(v) + '</b></div>';
function modAttachment(id){
  for (const r of modQueue.reports.concat(modQueue.published_with_photos)) for (const a of r.attachments) if (a.id === id) return a;
  return null;
}
async function renderModeration(){
  const box = $('#modBox');
  if (!isMod()) { box.innerHTML = '<div class="card"><p class="muted">Pagina riservata ai moderatori.</p></div>'; return; }
  box.innerHTML = '<div class="card"><p class="muted">Carico la coda…</p></div>';
  try {
    modQueue = await backend.moderationQueue();
    modUrls = await backend.signedUrls(modQueue.reports.concat(modQueue.published_with_photos).flatMap(r => r.attachments.map(a => a.storage_path)));
  } catch(e) { box.innerHTML = '<div class="card"><p class="muted">Coda non disponibile: ' + esc(e.message) + '</p></div>'; return; }
  const q = modQueue, h = (ic, t, n) => '<h3 style="margin:14px 2px 8px">' + icon(ic, {size:16}) + t + ' (' + n + ')</h3>';
  box.innerHTML =
    '<div class="card"><div class="row between"><h2>' + icon('shield-check', {size:19}) + 'Moderazione</h2><button class="btn sec sm" onclick="renderModeration()">' + icon('refresh-cw', {size:14}) + 'Aggiorna</button></div>' +
    '<p class="muted">Pubblica solo contenuti pertinenti, senza insulti né dati personali di terzi. In caso di rifiuto l\'autore vede il motivo.</p></div>' +
    h('file-text', 'Segnalazioni in attesa', q.reports.length) +
    (q.reports.length ? q.reports.map(modReportCard).join('') : '<div class="card muted">Nessuna segnalazione in attesa.</div>') +
    (q.published_with_photos.length ? h('camera', 'Foto da rivedere (segnalazioni già pubblicate)', q.published_with_photos.length) +
      q.published_with_photos.map(r => '<div class="card"><b>' + (TYPES[r.type] || '') + ' · ' + esc(CITIES[r.city_key] ? CITIES[r.city_key].n : r.city_key) + '</b>' +
        '<p class="muted" style="margin-top:4px">' + esc(r.description) + '</p>' + modMedia(r.attachments) + '</div>').join('') : '') +
    h('shield-check', 'Pubblicate in automatico (ultimi 7 giorni, controllo a campione)', q.recent_auto.length) +
    (q.recent_auto.length ? q.recent_auto.map(modAutoCard).join('') : '<div class="card muted">Nessuna pubblicazione da controllare.</div>') +
    h('message-square', 'Repliche dei tassisti', q.replies.length) +
    (q.replies.length ? q.replies.map(modReplyCard).join('') : '<div class="card muted">Nessuna replica in attesa.</div>') +
    h('flag', 'Contenuti segnalati (Digital Services Act)', q.notices.length) +
    (q.notices.length ? q.notices.map(modNoticeCard).join('') : '<div class="card muted">Nessun contenuto segnalato.</div>');
}
function modMedia(atts){
  if (!atts.length) return '';
  return '<div class="mod-media">' + atts.map(a => {
    const u = esc(modUrls[a.storage_path] || '');
    if (a.kind === 'video') return '<figure><video controls preload="metadata" src="' + u + '"></video><figcaption>' + icon('video', {size:12}) + 'Video · solo moderatori</figcaption></figure>';
    if (a.kind === 'audio') return '<figure><audio controls preload="metadata" src="' + u + '"></audio><figcaption>' + icon('mic', {size:12}) + 'Audio · solo moderatori</figcaption></figure>';
    return '<figure><img src="' + u + '" alt="Foto allegata"><figcaption>' +
      (a.faces_detected ? a.faces_detected + (a.faces_detected === 1 ? ' volto sfocato' : ' volti sfocati') : 'Nessun volto trovato') +
      ' · ' + (a.is_public ? 'pubblica' : 'privata') + (a.plates_blurred ? ' · targhe ok' : '') + '</figcaption>' +
      '<button class="btn sec sm" onclick="openBlur(\'' + a.id + '\')">' + icon('eye-off', {size:14}) + 'Sfoca targhe</button>' +
      (a.is_public ? '<button class="btn sec sm" onclick="setPhotoPublic(\'' + a.id + '\', false)">' + icon('lock', {size:14}) + 'Nascondi</button>'
                   : '<button class="btn sm" onclick="setPhotoPublic(\'' + a.id + '\', true)">' + icon('globe', {size:14}) + 'Targhe ok, pubblica</button>') + '</figure>';
  }).join('') + '</div>';
}
function modReportCard(r){
  const city = CITIES[r.city_key] ? CITIES[r.city_key].n : r.city_key;
  return '<div class="card" data-report="' + r.id + '"><div class="row between"><b>' + (TYPES[r.type] || '') + ' · ' + esc(city) + '</b><span class="muted">' + ago(Date.parse(r.created_at)) + '</span></div>' +
    '<div class="row between" style="margin:4px 0"><span style="font-size:12px">' + (r.kind === 'valutazione_corsa' ? icon('star', {size:13}) + 'Valutazione di fine corsa' : icon('file-text', {size:13}) + 'Segnalazione') + ' ' +
    (r.verified ? '<span class="badge b-ok">verificata</span>' : '<span class="badge">anonima</span>') + (r.ride_verified ? ' <span class="badge b-ok">corsa verificata</span>' : '') + '</span>' + starsHtml(r.rating) + '</div>' +
    '<p style="font-size:14px;margin:6px 0">' + esc(r.description) + '</p>' +
    (r.auto_flags && r.auto_flags.length ? '<div class="note" style="margin-top:0">' + icon('triangle-alert', {size:13}) + ' In revisione per: ' + r.auto_flags.map(f => ({etichetta_reato:'etichetta di reato', insulto:'insulto', dati_personali:'dati personali di terzi'})[f] || f).join(', ') + '. Pubblica se è un racconto di fatti; rifiuta se l\'autore non l\'ha riformulato e resta un\'offesa o un dato personale.</div>' : '') +
    kv('Segnalatore', r.reporter_name || '—') + kv('Targa', r.plate || '—') + kv('Licenza', r.license || '—') +
    (r.meter_eur != null ? kv('Tassametro', fmtEur(+r.meter_eur)) : '') +
    (r.from_place || r.to_place ? kv('Tratta', (r.from_place || '…') + ' → ' + (r.to_place || '…')) : '') +
    (r.cost_eur != null || r.duration_min ? kv('Importo e durata', (r.cost_eur != null ? fmtEur(+r.cost_eur) : '—') + ' · ' + (r.duration_min ? r.duration_min + ' min' : '—')) : '') +
    (r.lat != null ? '<div class="kv"><span>Posizione</span><a href="' + mapsLink({lat:r.lat, lng:r.lng}) + '" target="_blank" rel="noopener">' + r.lat.toFixed(4) + ', ' + r.lng.toFixed(4) + '</a></div>' : '') +
    modMedia(r.attachments) +
    '<div class="row" style="margin-top:10px"><button class="btn" onclick="modDecide(\'report\', \'' + r.id + '\', \'pubblicata\')">' + icon('check', {size:15}) + 'Pubblica</button>' +
    '<button class="btn danger" onclick="modDecide(\'report\', \'' + r.id + '\', \'rifiutata\')">' + icon('ban', {size:15}) + 'Rifiuta</button></div></div>';
}
function modReplyCard(d){
  return '<div class="card" data-reply="' + d.id + '"><div class="row between"><b>Replica a: ' + esc(CITIES[d.city_key] ? CITIES[d.city_key].n : d.city_key) + ' · Taxi ' + esc(d.plate_masked || '—') + '</b><span class="muted">' + ago(Date.parse(d.created_at)) + '</span></div>' +
    '<p class="muted" style="margin:4px 0">Segnalazione: ' + esc(d.report_description) + '</p>' +
    '<div class="reply">' + esc(d.body) + '</div>' +
    kv('Targa o licenza indicata', d.identifier) +
    '<div class="kv"><span>Corrispondenza</span><b>' + (d.identifier_matches ? 'corrisponde alla segnalazione' : 'non corrisponde') + '</b></div>' +
    kv('Contatto per la verifica', d.contact) +
    '<div class="row" style="margin-top:10px"><button class="btn" onclick="modDecide(\'reply\', \'' + d.id + '\', \'pubblicata\')">' + icon('check', {size:15}) + 'Pubblica</button>' +
    '<button class="btn danger" onclick="modDecide(\'reply\', \'' + d.id + '\', \'rifiutata\')">' + icon('ban', {size:15}) + 'Rifiuta</button></div></div>';
}
function modAutoCard(r){
  return '<div class="card" data-auto="' + r.id + '"><div class="row between"><b>' + (TYPES[r.type] || '') + ' · ' + esc(CITIES[r.city_key] ? CITIES[r.city_key].n : r.city_key) + '</b><span class="muted">' + ago(Date.parse(r.created_at)) + '</span></div>' +
    '<p style="font-size:14px;margin:6px 0">' + esc(r.description) + '</p>' + amountsLine(r.meter_eur, r.cost_eur) + kv('Targa', r.plate || '—') +
    '<label class="f" for="ar-' + r.id + '">Motivazione, solo se rimuovi (la vede l\'autore)</label><textarea id="ar-' + r.id + '" style="min-height:50px"></textarea>' +
    '<div class="row" style="margin-top:10px"><button class="btn sec" onclick="modAuto(\'' + r.id + '\', false)">' + icon('check', {size:15}) + 'Va bene</button>' +
    '<button class="btn danger" onclick="modAuto(\'' + r.id + '\', true)">' + icon('ban', {size:15}) + 'Rimuovi</button></div></div>';
}
async function modAuto(id, remove){
  if (!remove) return runMod(() => backend.moderateReport(id, 'pubblicata'), 'Controllata.');
  const reason = $('#ar-' + id).value.trim();
  if (reason.length < 10) return toast('Scrivi la motivazione della rimozione (almeno 10 caratteri)');
  await runMod(() => backend.removeReport(id, reason), 'Segnalazione rimossa.');
}
function modNoticeCard(n){
  return '<div class="card" data-notice="' + n.id + '"><div class="row between"><b>' + esc(NOTICE_CATEGORIES[n.category] || n.category) + '</b><span class="muted">' + ago(Date.parse(n.created_at)) + '</span></div>' +
    '<p class="muted" style="margin:4px 0">' + (n.kind === 'replica' ? 'Replica del tassista' : 'Segnalazione') + ' · ' + esc(CITIES[n.city_key] ? CITIES[n.city_key].n : (n.city_key || '')) + (n.plate_masked ? ' · Taxi ' + esc(n.plate_masked) : '') + '</p>' +
    '<div class="reply">' + esc(n.content || '(contenuto non più disponibile)') + '</div>' +
    kv('Motivo indicato', n.explanation) + kv('Segnalante', (n.notifier_name || '—') + ' · ' + (n.notifier_email || '—')) +
    '<label class="f" for="nr-' + n.id + '">Motivazione della decisione (la vedono il segnalante e, se rimosso, l\'autore)</label>' +
    '<textarea id="nr-' + n.id + '" style="min-height:60px"></textarea>' +
    '<div class="row" style="margin-top:10px"><button class="btn danger" onclick="modNotice(\'' + n.id + '\', true)">' + icon('ban', {size:15}) + 'Rimuovi il contenuto</button>' +
    '<button class="btn sec" onclick="modNotice(\'' + n.id + '\', false)">' + icon('check', {size:15}) + 'Mantieni</button></div></div>';
}
async function modNotice(id, remove){
  const reason = $('#nr-' + id).value.trim();
  if (reason.length < 10) return toast('Scrivi la motivazione della decisione (almeno 10 caratteri)');
  await runMod(() => backend.resolveContentNotice(id, remove, reason), remove ? 'Contenuto rimosso.' : 'Contenuto mantenuto.');
}
async function runMod(fn, message){
  try { await fn(); toast(message); await renderModeration(); reloadData(); } catch(e) { toast(e.message); }
}
async function modDecide(what, id, status){
  if (status === 'rifiutata') { rejectTarget = {what, id}; $('#rejectReason').value = ''; openModal('m-reject'); return; }
  await runMod(() => what === 'report' ? backend.moderateReport(id, status) : backend.moderateReply(id, status), 'Pubblicata.');
}
async function confirmReject(){
  const reason = $('#rejectReason').value.trim(), t = rejectTarget;
  if (reason.length < 3) return toast('Indica il motivo del rifiuto');
  closeModal('m-reject');
  await runMod(() => t.what === 'report' ? backend.moderateReport(t.id, 'rifiutata', reason) : backend.moderateReply(t.id, 'rifiutata', reason), 'Rifiutata');
}
async function setPhotoPublic(id, isPublic){
  await runMod(() => backend.moderateAttachment(id, isPublic), isPublic ? 'Foto approvata: visibile quando la segnalazione è pubblicata' : 'Foto nascosta');
}

// Editor delle targhe: il moderatore trascina rettangoli sulla foto, che vengono pixelati; il risultato sostituisce l'originale.
async function openBlur(id){
  const a = modAttachment(id); if (!a) return;
  const {pixelate} = await import('./media/photo.js');
  const img = new Image(); img.crossOrigin = 'anonymous';
  try { await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Foto non caricabile')); img.src = modUrls[a.storage_path]; }); }
  catch(e) { return toast(e.message); }
  const c = $('#blurCanvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  blurState = {att:a, img, pixelate, rects:[], drag:null};
  drawBlur(); openModal('m-blur');
}
function drawBlur(){
  const st = blurState, c = $('#blurCanvas'), ctx = c.getContext('2d');
  ctx.drawImage(st.img, 0, 0);
  st.rects.forEach(r => st.pixelate(c, r));
  const r = st.drag && dragRect(st.drag.a, st.drag.b, c.width, c.height);
  if (r) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = Math.max(2, c.width/250); ctx.strokeRect(r.x, r.y, r.w, r.h); }
}
function canvasPoint(e){ const c = $('#blurCanvas'), b = c.getBoundingClientRect(); return {x:(e.clientX - b.left)*c.width/b.width, y:(e.clientY - b.top)*c.height/b.height}; }
function initBlurEditor(){
  const c = $('#blurCanvas');
  c.addEventListener('pointerdown', e => { if (!blurState) return; c.setPointerCapture(e.pointerId); const p = canvasPoint(e); blurState.drag = {a:p, b:p}; });
  c.addEventListener('pointermove', e => { if (!blurState || !blurState.drag) return; blurState.drag.b = canvasPoint(e); drawBlur(); });
  c.addEventListener('pointerup', e => {
    if (!blurState || !blurState.drag) return;
    const r = dragRect(blurState.drag.a, canvasPoint(e), c.width, c.height);
    blurState.drag = null; if (r) blurState.rects.push(r); drawBlur();
  });
}
function undoBlur(){ if (blurState) { blurState.rects.pop(); drawBlur(); } }
async function saveBlur(){
  if (!blurState || !blurState.rects.length) return toast('Trascina sulla foto per coprire almeno una targa');
  const btn = $('#blurSave'); btn.disabled = true;
  try {
    blurState.drag = null; drawBlur();
    const blob = await new Promise((res, rej) => $('#blurCanvas').toBlob(b => b ? res(b) : rej(new Error('Elaborazione non riuscita')), 'image/jpeg', 0.88));
    await backend.replacePhoto(blurState.att, blob);
    closeModal('m-blur'); blurState = null;
    toast('Targhe sfocate. La foto originale è stata sostituita.');
    await renderModeration();
  } catch(e) { toast(e.message); }
  finally { btn.disabled = false; }
}

/* ================= NEWS ================= */
// Solo titolo, testata e data, con il link all'articolo originale (si apre sul sito della fonte).
let newsLoaded = 0;
async function renderNews(){
  const box = $('#newsList');
  if (Date.now() - newsLoaded < 10 * 60000) return;
  if (!newsLoaded) box.innerHTML = '<div class="card muted">Carico le news…</div>';
  let items;
  try { items = await backend.loadNews(); newsLoaded = Date.now(); }
  catch(e) { box.innerHTML = '<div class="card muted">News non disponibili: ' + esc(e.message) + '</div>'; return; }
  $('#newsBadge').classList.toggle('hidden', !items.some(n => n.placeholder));
  box.innerHTML = items.length ? '<div class="card">' + items.map(n => n.placeholder
    ? '<div class="news-item"><span class="badge b-demo">SEGNAPOSTO</span><b>' + esc(n.title) + '</b></div>'
    : '<a class="news-item" href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer" data-ext><b>' + esc(n.title) + '</b>' +
      '<span class="muted">' + esc(n.source) + (n.publishedAt ? ' · ' + ago(n.publishedAt) : '') + (n.feed === 'google_news' ? ' · via Google News' : '') + '</span></a>'
  ).join('') + '</div>' : '<div class="card muted">Nessuna notizia sul settore negli ultimi 30 giorni.</div>';
}

/* ================= AVVIO ================= */
function refreshAll(){
  renderThermo(); renderFeed(); renderNational(); refreshItalyMap(); updateAnonNotice();
  if ($('#cityStats').dataset.city) renderCityStats($('#cityStats').dataset.city);
  if ($('#tab-profilo').classList.contains('active')) renderProfile();
  const profileBtn = $('#profileBtn');
  profileBtn.innerHTML = icon(DB.user ? 'user-round-check' : 'user', {size:17});
  profileBtn.dataset.auth = DB.user ? 'in' : 'out';
}
const _renderCityStats = renderCityStats;
renderCityStats = function(k){ $('#cityStats').dataset.city = k; _renderCityStats(k); };
async function init(){
  mountIcons();
  backend = await createBackend(() => DB, saveDB);
  const token = liveToken(location.search);
  if (token) { DB = {powerSave:false}; return startLiveViewer(token); }
  loadDB(); await loadDeviceData(); initBattery(); initReportForm(); initBook();
  $('#loginNote').textContent = isLocal()
    ? 'Modalità demo locale: accesso simulato sul dispositivo, la password non viene salvata.'
    : 'Registrandoti con email riceverai un link di conferma: solo gli account confermati contano nei rating. Safe Taxi è riservata ai maggiori di 18 anni.';
 $('#feedCity').innerHTML = '<option value="">Tutte le città</option>' + Object.keys(CITIES).map(k => '<option value="' + k + '">' + CITIES[k].n + '</option>').join('');
 $('#cityList').innerHTML = Object.values(CITIES).map(c => '<option value="' + c.n + '">').join('');
 $('#citySearch').addEventListener('change', searchCity);
 $('#shareText').addEventListener('input', () => { shareEdited = true; });
  initBlurEditor();
 renderCityStats('roma');
  refreshAll();
  initHome(); renderPlaces();
  if (!DB.privacyOk) openModal('m-privacy');
  await backend.init(onAuthChange);
  await reloadData();
  if (new URLSearchParams(location.search).get('account') === 'elimina') {
    if (DB.privacyOk) closeModal('m-privacy');
    openTab('profilo'); const c = $('#deleteCard'); if (c) c.scrollIntoView({block:'center'});
  }
}
document.addEventListener('DOMContentLoaded', init);

// Funzioni richiamate dagli attributi onclick/onchange/onsubmit dell'HTML: nei moduli non sono globali,
// quindi vanno esposte su window. Da sostituire gradualmente con addEventListener.
Object.assign(window, {setFeedCity, searchFeed, loadFeed, toggleStartSearch, searchStart, pickStart, pickPlace, clearRecents, saveCurrentFavorite, renameFav, deleteFav, openCitySearch, modAuto, openNotice, sendNotice, modNotice, deleteAccount, startLiveShare, stopLiveShare, confirmReject, modDecide, openBlur, openReply, renderModeration, saveBlur, sendReply, setPhotoPublic, undoBlur, acceptPrivacy, addContact, attachLocation, call112, callNumber, closeModal, doLookup, emailLogin, emailSignup, exportData, forgotPassword, googleLogin, fillShareText, logout, openModal, openPrivacy, openSOS, openShare, openStore, openTab, pick, pickDest, redeem, removeAtt, removeContact, renderBook, resetDemo, resetItaly, searchCity, searchDestination, selectCity, sendShare, setBookFilter, setFeedFilter, saveNewPassword, setPowerSave, simulateRide, submitRating, submitReport, toggleRide});
