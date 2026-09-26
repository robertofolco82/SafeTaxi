/* Safe Taxi: logica dell'interfaccia (DOM, mappe, stato).
   Le regole di calcolo pure stanno in ./lib e sono coperte dai test.
   I dati arrivano dal backend (./backend): Supabase, oppure demo locale se non configurato. */
import L from 'leaflet';
import {CITIES, APPS, COOPS, STORES, TYPES, TYPE_ICONS, NEG, FILTERS, FILTER_ICONS, REWARDS, OCCUPANCY} from './lib/config.js';
import {esc, fmtNum, fmtEur, fmtTel, ago, haversine, normPlate, maskPlate, starCount} from './lib/utils.js';
import {seedReports} from './lib/seed.js';
import {indexOf, mood, perMinOf, nearestCity, estimateTrip, isRec, level} from './lib/indices.js';
import {icon} from './lib/icons.js';
import {toOpenDataRows, toCsv} from './lib/opendata.js';
import {STATUS_LABELS, italianPosition} from './lib/remote.js';
import {createBackend} from './backend/index.js';
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
const MOOD_ICON = {insufficiente:'circle-help', critico:'angry', scarso:'frown', cosicosi:'meh', buono:'smile', ottimo:'laugh'};
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
    else localStorage.setItem(PREFS_KEY, JSON.stringify({contacts:DB.contacts, powerSave:DB.powerSave, privacyOk:DB.privacyOk}));
  } catch(e) { memOnly = true; }
}
// Ricarica dal backend segnalazioni, utente, punti e segnalazioni personali.
async function reloadData(){
  try {
    DB.reports = await backend.loadReports();
    loadError = null;
  } catch(e) { DB.reports = []; loadError = e.message; }
  DB.user = backend.user();
  try {
    const p = await backend.points(); DB.points = p.total; DB.ledger = p.ledger;
    DB.myReports = await backend.myReports();
  } catch(e) { DB.points = 0; DB.ledger = []; DB.myReports = []; }
  loading = false;
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
function getPos(high){
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Geolocalizzazione non supportata'));
 navigator.geolocation.getCurrentPosition(p => {
      lastPos = {lat:p.coords.latitude, lng:p.coords.longitude, acc:p.coords.accuracy, ts:Date.now()}; res(lastPos);
    }, e => rej(e), {enableHighAccuracy: !!high && !isPowerSave(), timeout:12000, maximumAge: isPowerSave() ? 300000 : 60000});
  });
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
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© OpenStreetMap'}).addTo(m);
  return m;
}

/* ================= NAVIGAZIONE / MODALI ================= */
function openTab(name){
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  window.scrollTo(0, 0);
  if (name === 'corsa' && !rideMap) rideMap = makeMap('rideMap', [41.9, 12.5], 6);
  if (name === 'mappa' && !italyMap) initItalyMap();
  if (name === 'profilo') renderProfile();
  setTimeout(() => { [homeMap, rideMap, italyMap].forEach(m => m && m.invalidateSize()); }, 80);
}
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
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
function openStore(key){ const u = storeUrl(key); if (u) window.open(u, '_blank', 'noopener'); }

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
    '<div class="mood-icon">' + icon(MOOD_ICON[m.k], {size:52}) + '</div>' +
    '<div class="val" style="color:' + m.c + '">' + (v == null ? '—' : v) + '<span style="font-size:16px;color:var(--mut)">/100</span></div>' +
    '<div style="font-weight:700">' + m.l + '</div>' +
    '<div class="bar"><i style="left:' + (v == null ? 50 : v) + '%"></i></div>' +
    '<div class="stats3"><div class="stat"><b>' + fmtNum(DB.reports.length) + '</b><span>segnalazioni</span></div>' +
    '<div class="stat"><b>' + cities + '</b><span>città</span></div>' +
    '<div class="stat"><b>' + trTxt + '</b><span>vs 30 gg prec.</span></div></div>' +
    '<div class="note">Indice 0–100 calcolato solo sulle segnalazioni di utenti verificati (' + fmtNum(ver) + '), con peso che si dimezza ogni 90 giorni. <span class="badge b-demo">DATI DEMO</span></div>';
}
let feedFilter = 'all';
function setFeedFilter(f){ feedFilter = f; $$('[data-feed]').forEach(b => b.classList.toggle('on', b.dataset.feed === f)); renderFeed(); }
function renderFeed(){
  let list = DB.reports.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (feedFilter === 'pos') list = list.filter(r => r.type === 'positiva');
  if (feedFilter === 'neg') list = list.filter(r => r.type !== 'positiva');
  list = list.slice(0, 12);
  $('#feed').innerHTML = list.length ? list.map(r =>
    '<div class="feed-item ' + (r.type === 'positiva' ? 'pos' : 'neg') + '">' +
    '<div class="row between"><b>' + esc(CITIES[r.city] ? CITIES[r.city].n : r.city) + '</b><span class="muted">' + ago(r.createdAt) + '</span></div>' +
    '<div class="row between" style="margin:4px 0"><span style="font-size:12px;display:inline-flex;align-items:center;gap:4px">' + icon(TYPE_ICONS[r.type] || 'circle-help', {size:13}) + (TYPES[r.type] || '') + '</span>' + starsHtml(r.rating) + '</div>' +
    '<div style="font-size:13px">' + esc(r.description) + '</div>' +
    '<div class="muted" style="margin-top:4px;display:flex;align-items:center;gap:4px;flex-wrap:wrap">' + icon('car-taxi-front', {size:13}) + esc(maskPlate(r.targa)) + ((r.from || r.to) ? ' · ' + esc(r.from) + ' → ' + esc(r.to) : '') + ' ' +
    (r.verified ? '<span class="badge b-ok">verificata</span>' : '<span class="badge">anonima</span>') + (r.attachments ? '<span style="display:inline-flex;align-items:center;gap:3px">' + icon('paperclip', {size:12}) + r.attachments + '</span>' : '') + '</div>' +
    (r.photos && r.photos.length ? '<div class="feed-photos">' + r.photos.slice(0, 3).map(u => '<img src="' + esc(u) + '" alt="Foto allegata (volti e targhe sfocati)" loading="lazy">').join('') + '</div>' : '') + '</div>'
  ).join('') : '<p class="muted">' + (loading ? 'Caricamento…' : loadError ? 'Segnalazioni non disponibili: ' + esc(loadError) : 'Nessuna segnalazione.') + '</p>';
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
let destResults = [];
async function searchDestination(e){
  e.preventDefault();
  const q = $('#destInput').value.trim();
  if (q.length < 3) return toast('Scrivi almeno 3 caratteri');
 $('#destResults').innerHTML = '<p class="muted">Cerco…</p>';
  try {
    let url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=it&accept-language=it&q=' + encodeURIComponent(q);
    if (lastPos) { const d = 0.4; url += '&viewbox=' + (lastPos.lng-d) + ',' + (lastPos.lat+d) + ',' + (lastPos.lng+d) + ',' + (lastPos.lat-d); }
    const r = await fetch(url); destResults = await r.json();
    if (!destResults.length) { $('#destResults').innerHTML = '<p class="muted">Nessun risultato.</p>'; return; }
 $('#destResults').innerHTML = destResults.map((x, i) => {
      const parts = x.display_name.split(',');
      return '<button class="opt" style="padding:8px" onclick="pickDest(' + i + ')"><div><b style="font-size:13px">' + esc(parts.slice(0,2).join(',')) + '</b><span>' + esc(parts.slice(2,5).join(',')) + '</span></div></button>';
    }).join('');
  } catch(err) { $('#destResults').innerHTML = '<p class="muted">Ricerca non disponibile (serve connessione).</p>'; }
}
function pickDest(i){
  const x = destResults[i]; if (!x) return;
  const dest = {lat:+x.lat, lng:+x.lon}, name = x.display_name.split(',')[0];
 $('#destResults').innerHTML = '';
  if (homeMap) {
    if (destMarker) homeMap.removeLayer(destMarker);
    if (destLine) homeMap.removeLayer(destLine);
    destMarker = L.circleMarker([dest.lat, dest.lng], {radius:9, color:'#fff', weight:3, fillColor:'#facc15', fillOpacity:1}).addTo(homeMap).bindPopup(esc(name));
    if (lastPos) { destLine = L.polyline([[lastPos.lat, lastPos.lng], [dest.lat, dest.lng]], {dashArray:'6 6', color:'#0f766e'}).addTo(homeMap); homeMap.fitBounds(destLine.getBounds(), {padding:[30,30]}); }
    else homeMap.setView([dest.lat, dest.lng], 14);
  }
  if (!lastPos) { $('#estimateBox').innerHTML = '<div class="note">Attiva la posizione per stimare il costo dal punto in cui ti trovi.</div>'; return; }
  const e = estimateTrip(lastPos, dest, DB.reports);
 $('#estimateBox').innerHTML = '<div class="note" style="font-size:13px"><b>' + esc(name) + '</b>' +
    '<div class="kv"><span>Distanza stimata</span><b>' + fmtNum(e.km, 1) + ' km</b></div>' +
    '<div class="kv"><span>Tempo stimato</span><b>' + Math.round(e.min) + ' min</b></div>' +
    '<div class="kv"><span>Costo stimato</span><b>' + fmtEur(e.lo) + ' – ' + fmtEur(e.hi) + '</b></div>' +
    '<div class="muted">Base: ' + esc(e.basis) + '. Distanza in linea d’aria × 1,3: stima indicativa, non vincolante.</div>' +
    '<button class="btn sm" style="margin-top:8px" onclick="openTab(\'prenota\')">' + icon('phone', {size:14}) + 'Prenota un taxi</button></div>';
}

/* ================= CORSA ================= */
let ride = null, lastRide = null;
async function toggleRide(){ if (ride) endRide(); else await startRide(false); }
async function startRide(sim){
  if (!rideMap) rideMap = makeMap('rideMap', [41.9, 12.5], 6);
  if (rideLine) rideLine.setLatLngs([]);
  ride = {start:Date.now(), path:[], km:0, watch:null, timer:null, simTimer:null, sim:!!sim, plate: normPlate($('#lookupInput').value)};
 $('#rideBtn').innerHTML = icon('square', {size:16}) + 'Termina corsa'; $('#rideBtn').classList.add('red');
 $('#rideState').textContent = 'In corso'; $('#rideState').className = 'badge b-ok';
  ride.timer = setInterval(updateRideStats, 1000);
  if (!sim) {
    if (!navigator.geolocation) { toast('GPS non disponibile su questo dispositivo'); return; }
    ride.watch = navigator.geolocation.watchPosition(
      p => onRidePos({lat:p.coords.latitude, lng:p.coords.longitude}),
      err => toast('Posizione non disponibile: ' + err.message),
 {enableHighAccuracy: !isPowerSave(), maximumAge: isPowerSave() ? 30000 : 5000, timeout:20000});
  }
}
function onRidePos(p){
  if (!ride) return;
  const prev = ride.path[ride.path.length-1];
  if (prev) { const d = haversine(prev, p); if (d < 0.015) return; ride.km += d; }
  ride.path.push(p); lastPos = {lat:p.lat, lng:p.lng, ts:Date.now()};
 $('#rideCoords').textContent = p.lat.toFixed(5) + ', ' + p.lng.toFixed(5);
  if (rideMap) {
    const ll = ride.path.map(x => [x.lat, x.lng]);
    if (!rideLine) rideLine = L.polyline(ll, {color:'#0f766e', weight:5}).addTo(rideMap); else rideLine.setLatLngs(ll);
    if (!rideMarker) rideMarker = L.circleMarker([p.lat, p.lng], {radius:8, color:'#fff', weight:3, fillColor:'#dc2626', fillOpacity:1}).addTo(rideMap); else rideMarker.setLatLng([p.lat, p.lng]);
 rideMap.setView([p.lat, p.lng], 16);
  }
  reverseGeocode(p, ride.sim).then(l => { if (l) $('#rideStreet').textContent = l; });
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
  if (ride.watch != null) navigator.geolocation.clearWatch(ride.watch);
 clearInterval(ride.timer); if (ride.simTimer) clearInterval(ride.simTimer);
  const r = ride; ride = null;
 $('#rideBtn').innerHTML = icon('play', {size:16}) + 'Inizia corsa'; $('#rideBtn').classList.remove('red');
 $('#rideState').textContent = 'Conclusa'; $('#rideState').className = 'badge';
  lastRide = {durMin: Math.max(1, Math.round((Date.now() - r.start)/60000)), plate: r.plate, city: r.path.length ? nearestCity(r.path[0]).key : null};
  openRating();
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

/* ================= RATING TASSISTA ================= */
async function doLookup(){
  const q = $('#lookupInput').value, n = normPlate(q), box = $('#lookupResult');
  if (!n) { box.innerHTML = ''; return; }
  box.innerHTML = '<p class="muted">Verifico…</p>';
  let d;
  try { d = await backend.driverRating(n); } catch(e) { box.innerHTML = '<div class="note">Verifica non disponibile: ' + esc(e.message) + '</div>'; return; }
  if (!d.sufficient) {
    box.innerHTML = '<div class="note">Storico insufficiente: ' + d.verified_count + ' segnalazioni verificate (minimo ' + d.min_required + '). Sotto questa soglia il rating non viene mostrato, a tutela del tassista.</div>'; return;
  }
  const crit = Object.keys(d.issues || {}).map(k => TYPES[k] + ' ×' + d.issues[k]).join(', ') || 'nessuna';
  box.innerHTML = '<div class="note" style="font-size:13px"><div class="row between"><b style="display:flex;align-items:center;gap:5px">' + icon('car-taxi-front', {size:15}) + esc(maskPlate(q)) + '</b>' + starsHtml(d.avg_rating) + '</div>' +
    '<div class="kv"><span>Rating medio</span><b>' + fmtNum(d.avg_rating, 1) + ' / 5</b></div>' +
    '<div class="kv"><span>Segnalazioni verificate</span><b>' + d.verified_count + '</b></div>' +
    '<div class="kv"><span>Criticità</span><b style="text-align:right">' + crit + '</b></div></div>';
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
  openModal('m-rate');
}
async function submitRating(){
  if (!rateState.driver || !rateState.ride) return toast('Dai un voto al tassista e alla corsa');
  const lr = lastRide || {}, cost = parseFloat($('#rateCost').value), pos = italianPosition(lastPos);
  const plate = /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(lr.plate || '') ? lr.plate : null;
  try {
    const res = await backend.submitRideRating({city: lr.city || (lastPos ? nearestCity(lastPos).key : 'roma'),
      driverRating:rateState.driver, rideRating:rateState.ride, type:$('#rateIssue').value, comment:$('#rateComment').value.trim(),
      plate, cost: isNaN(cost) ? null : cost, duration: lr.durMin || null, lat:pos.lat, lng:pos.lng});
    closeModal('m-rate'); await afterSubmit();
    toast('Grazie! ' + sentMessage(res, 'Valutazione'));
  } catch(e) { toast(e.message); }
}

// Messaggio dopo un invio: con Supabase la segnalazione passa dalla moderazione e i punti arrivano alla pubblicazione.
function sentMessage(res, what){
  if (res.pending) return res.verified
    ? what + ' inviata. Sarà pubblicata dopo la moderazione; i punti arrivano alla pubblicazione.'
    : what + ' anonima inviata: in moderazione, non concorre ai rating.';
  return res.verified ? what + ' inviata: +' + res.points + ' punti' : what + ' anonima inviata: visibile, ma non concorre ai rating';
}
async function afterSubmit(){
  if (!isLocal()) { try { DB.myReports = await backend.myReports(); } catch(e) {} }
  refreshAll();
}

/* ================= SEGNALAZIONE ================= */
let reportRating = 0, attachments = [], reportGeo = null;
function initReportForm(){
 $('#reportCity').innerHTML = '<option value="">Seleziona…</option>' + Object.keys(CITIES).map(k => '<option value="' + k + '">' + CITIES[k].n + '</option>').join('');
 $('#reportType').innerHTML = '<option value="">Seleziona…</option>' + Object.keys(TYPES).map(k => '<option value="' + k + '">' + TYPES[k] + '</option>').join('');
 starPicker('reportStars', v => reportRating = v);
 ['camPhoto','camVideo','micAudio','gallery'].forEach(id => document.getElementById(id).addEventListener('change', onFiles));
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
  if (!d.description || d.description.trim().length < 20) errs.push('descrizione (min. 20 caratteri)');
  if (!d.consent) errs.push('dichiarazione e privacy');
  if (errs.length) return toast('Completa: ' + errs.join(', '));
  if (attachments.some(a => a.processing)) return toast('Attendi: sto preparando le foto');
  const n = attachments.length, pos = italianPosition(reportGeo), btn = f.querySelector('button[type=submit]');
  submitting = true; if (btn) btn.disabled = true;
  try {
    const res = await backend.submitReport({name:d.name.trim(), license:d.licenza, plate:normPlate(d.targa), city:d.city,
      from:(d.from || '').trim(), to:(d.to || '').trim(), type:d.type, rating:reportRating, description:d.description.trim(),
      cost: d.cost ? parseFloat(d.cost) : null, duration: d.duration ? parseInt(d.duration, 10) : null,
      attachments:n, files:attachments.map(a => ({kind:a.kind, blob:a.file, faces:a.faces})), lat:pos.lat, lng:pos.lng});
    attachments.forEach(a => a.url && URL.revokeObjectURL(a.url)); attachments = []; renderThumbs();
    f.reset(); reportRating = 0; starPicker('reportStars', v => reportRating = v); reportGeo = null; $('#reportLoc').textContent = 'Non allegato';
    await afterSubmit(); openTab('home');
    toast(sentMessage(res, 'Segnalazione') + (res.attachmentErrors && res.attachmentErrors.length ? ' Allegati non caricati: ' + res.attachmentErrors.join('; ') : ''));
  } catch(err) { toast(err.message); }
  finally { submitting = false; if (btn) btn.disabled = false; }
}
function updateAnonNotice(){
 $('#anonNotice').innerHTML = DB.user
    ? icon('circle-check-big', {size:14}) + (isLocal() ? 'Segnalazione verificata: concorre ai rating e vale punti.' : 'Segnalazione verificata: dopo la moderazione concorre ai rating e vale punti.')
    : icon('user', {size:14}) + 'Stai segnalando come ospite: la segnalazione ' + (isLocal() ? 'sarà visibile' : 'sarà pubblicata dopo la moderazione') + ' ma non concorre ai rating. <a href="#" onclick="event.preventDefault();openModal(\'m-login\')">Accedi</a>';
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
  const lic = Object.values(CITIES).reduce((a, c) => a + c.lic, 0);
 $('#nationalStats').innerHTML = '<h3>' + icon('globe', {size:16}) + 'Statistiche nazionali</h3>' +
    '<div class="stats3"><div class="stat"><b style="color:' + m.c + '">' + (v == null ? '—' : v) + '</b><span>Indice 0–100</span></div>' +
    '<div class="stat"><b>' + fmtNum(DB.reports.length) + '</b><span>Segnalazioni</span></div>' +
    '<div class="stat"><b>' + (pm ? fmtEur(pm) : '—') + '</b><span>Costo medio/min</span></div></div>' +
    '<h3 style="margin-top:14px">Classifica città</h3>' +
    ranks.map((x, i) => '<div class="kv" style="cursor:pointer" onclick="selectCity(\'' + x.k + '\')"><span>' + (i+1) + '. ' + CITIES[x.k].n + '</span><b style="display:flex;align-items:center;gap:5px;color:' + mood(x.v).c + '">' + icon(MOOD_ICON[mood(x.v).k], {size:14}) + x.v + '/100 <span class="muted">(' + x.n + ')</span></b></div>').join('') +
    '<div class="muted" style="margin-top:6px">Licenze nelle città monitorate: ' + fmtNum(lic) + ' <span class="badge b-demo">demo</span></div>';
}
function renderCityStats(k){
  const c = CITIES[k], reps = byCity(k), v = indexOf(reps), m = mood(v), pm = perMinOf(reps);
  const neg = reps.filter(r => r.type !== 'positiva'), cnt = {};
  neg.forEach(r => cnt[r.type] = (cnt[r.type] || 0) + 1);
  const probs = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
  const ratio = c.dem/c.lic, gross = pm ? pm*60*OCCUPANCY : null;
  const rc = ratio > 6 ? '#dc2626' : ratio > 4 ? '#f97316' : '#16a34a';
 $('#cityStats').innerHTML =
    '<div class="row between"><h3>' + icon('landmark', {size:15}) + c.n + '</h3><span class="badge" style="background:' + m.c + ';color:#fff">' + icon(MOOD_ICON[m.k], {size:12}) + (v == null ? 'n.d.' : v) + '/100</span></div>' +
    '<div class="kv"><span>Segnalazioni (verificate)</span><b>' + reps.length + ' (' + reps.filter(r => r.verified).length + ')</b></div>' +
    '<div class="kv"><span>Licenze taxi</span><b>' + fmtNum(c.lic) + ' <span class="badge b-demo">demo</span></b></div>' +
    '<div class="kv"><span>Richieste giornaliere stimate</span><b>' + fmtNum(c.dem) + ' <span class="badge b-demo">demo</span></b></div>' +
    '<div class="kv"><span>Richieste per licenza al giorno</span><b style="color:' + rc + '">' + fmtNum(ratio, 1) + '</b></div>' +
    '<div class="kv"><span>Costo medio al minuto</span><b>' + (pm ? fmtEur(pm) : '—') + '</b></div>' +
    '<div class="kv"><span>Ricavo lordo orario stimato</span><b>' + (gross ? fmtEur(gross) : '—') + '</b></div>' +
    '<div class="kv"><span>Reddito medio dichiarato</span><b class="muted">da integrare (fonte MEF)</b></div>' +
    '<h3 style="margin-top:12px">Problemi segnalati</h3>' +
    (probs.length ? probs.map(p => { const pc = Math.round(cnt[p]/neg.length*100); return '<div class="pbar"><span class="t">' + TYPES[p] + '</span><span class="p"><i style="width:' + pc + '%"></i></span><b>' + pc + '%</b></div>'; }).join('') : '<p class="muted">Nessuna criticità segnalata.</p>') +
    '<div class="note">Ricavo lordo orario = costo medio al minuto × 60 × occupazione ipotizzata (' + Math.round(OCCUPANCY*100) + '%). Il confronto con i redditi dichiarati si fa solo su dati aggregati ufficiali e con metodologia pubblica, mai sul singolo tassista.</div>';
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
  html += '<div class="muted" style="padding:0 4px 10px">Valutazioni demo. Numeri di telefono da verificare con le cooperative prima della pubblicazione.</div>';
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
  const plate = (ride && ride.plate) || normPlate($('#lookupInput').value);
  const t = new Date().toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
  const lines = [shareSOS ? 'Ciao' + nome + ', ho bisogno di aiuto.' : 'Ciao' + nome + ', ti avviso che sono su un taxi e ti condivido la mia posizione.'];
  if (geoLast.label) lines.push('📍 ' + geoLast.label);
  lines.push(shareP ? '🗺️ ' + mapsLink(shareP) : '🗺️ Posizione non disponibile');
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
    window.open((n ? 'https://wa.me/' + n : 'https://wa.me/') + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
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
    myReportsCard() +
    '<div class="card"><h3>' + icon('gift', {size:16}) + 'Punti e premi</h3><div class="thermo"><div class="val">' + fmtNum(DB.points) + '</div><div class="muted">Livello <b>' + lv.name + '</b>' + (lv.next ? ' · ' + (lv.next.min - DB.points) + ' punti a ' + lv.next.name : '') + '</div></div>' +
    '<div class="pbar"><span class="p"><i style="width:' + lv.pct + '%;background:var(--pri)"></i></span></div>' +
    '<div class="note">Stessi punti per segnalazioni positive e negative: +50 segnalazione completa, +20 con allegati, +10 valutazione di fine corsa. Si premia la partecipazione, non il giudizio espresso.</div>' +
    REWARDS.map((r, i) => '<div class="kv"><span>' + esc(r.n) + '</span><button class="btn sm' + (DB.points >= r.c ? '' : ' sec') + '" onclick="redeem(' + i + ')">' + fmtNum(r.c) + ' pt</button></div>').join('') +
    (DB.ledger.length ? '<h3 style="margin-top:12px">Movimenti</h3>' + DB.ledger.slice(0, 8).map(l => '<div class="kv"><span>' + esc(l.why) + '</span><b style="color:' + (l.n > 0 ? '#16a34a' : '#dc2626') + '">' + (l.n > 0 ? '+' : '') + l.n + '</b></div>').join('') : '') + '</div>' +
    '<div class="card"><h3>' + icon('life-buoy', {size:16}) + 'Contatti di emergenza</h3>' +
 (DB.contacts.length ? DB.contacts.map((c, i) => '<div class="kv"><span>' + esc(c.name) + ' · ' + esc(c.phone) + '</span><button class="btn sec sm" onclick="removeContact(' + i + ')" aria-label="Rimuovi contatto">' + icon('x', {size:13}) + '</button></div>').join('') : '<p class="muted">Nessun contatto salvato.</p>') +
    '<div class="row" style="margin-top:8px"><input id="cName" placeholder="Nome"><input id="cPhone" placeholder="Telefono" inputmode="tel"></div>' +
    '<button class="btn sec" style="margin-top:8px" onclick="addContact()">+ Aggiungi contatto</button></div>' +
    '<div class="card"><h3>' + icon(battery && battery.charging ? 'battery-charging' : battery && battery.level <= 0.2 ? 'battery-low' : 'battery', {size:16}) + 'Energia</h3><div class="kv"><span>Batteria</span><b>' + bat + '</b></div>' +
    '<label class="row" style="margin-top:8px;font-size:14px"><input type="checkbox" style="width:auto"' + (DB.powerSave ? ' checked' : '') + ' onchange="setPowerSave(this.checked)"> Risparmio energetico manuale</label>' +
    '<div class="note">In risparmio: GPS a bassa precisione, nome via aggiornato ogni 60 secondi invece di 20, animazioni disattivate. Si attiva da solo sotto il 20% se il browser espone il livello batteria (Safari su iPhone non lo espone).</div></div>' +
    '<div class="card"><h3>' + icon('package', {size:16}) + 'Dati aperti</h3><p class="muted">Dataset anonimizzato: niente nomi, targhe o licenze; coordinate arrotondate a circa 1 km. In produzione lo stesso formato è servito via API REST e SFTP ai soggetti accreditati.</p>' +
    '<div class="row" style="margin-top:8px"><button class="btn sec" onclick="exportData(\'json\')">JSON</button><button class="btn sec" onclick="exportData(\'csv\')">CSV</button></div></div>' +
    '<div class="card"><h3>' + icon('lock', {size:16}) + 'Privacy</h3><button class="btn sec" onclick="openModal(\'m-privacy\')">Leggi l’informativa</button>' + (isLocal() ? '<button class="btn sec" style="margin-top:8px" onclick="resetDemo()">Ripristina dati demo</button>' : '') + '</div>';
}
function myReportsCard(){
  if (!DB.myReports.length) return '';
  return '<div class="card"><h3>' + icon('file-text', {size:16}) + 'Le tue segnalazioni</h3>' + DB.myReports.slice(0, 10).map(r =>
    '<div class="kv"><span>' + (TYPES[r.type] || '') + ' · ' + esc(CITIES[r.city_key] ? CITIES[r.city_key].n : r.city_key) + ' · ' + ago(Date.parse(r.created_at)) +
    (r.rejection_reason ? '<br><span class="muted">Motivo: ' + esc(r.rejection_reason) + '</span>' : '') + '</span>' +
    '<span class="badge' + (r.status === 'pubblicata' ? ' b-ok' : '') + '">' + (STATUS_LABELS[r.status] || r.status) + '</span></div>').join('') +
    '<div class="note">Ogni segnalazione è pubblicata solo dopo la revisione di un moderatore.' + (DB.user ? '' : ' Senza account le segnalazioni restano legate a questo dispositivo.') + '</div></div>';
}
function addContact(){
  const n = $('#cName').value.trim(), p = $('#cPhone').value.trim();
  if (!n || p.replace(/\D/g, '').length < 6) return toast('Inserisci nome e numero');
 DB.contacts.push({name:n, phone:p}); saveDB(); renderProfile();
}
function removeContact(i){ DB.contacts.splice(i, 1); saveDB(); renderProfile(); }
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
function onAuthChange(event){
  if (event === 'PASSWORD_RECOVERY') { openModal('m-newpwd'); return; }
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
  if (await confirmDialog('Ripristinare i dati demo?', 'Cancella segnalazioni, punti e contatti salvati su questo dispositivo.', 'Ripristina')) {
    try { localStorage.removeItem(DB_KEY); } catch(e) {}
    loadDB(); await reloadData(); toast('Dati demo ripristinati');
  }
}

/* ================= NEWS ================= */
function renderNews(){
  const items = [
    {t:'Esempio · Nuovo bando comunale per licenze taxi', s:'Fonte da configurare (comunicati dei Comuni)'},
    {t:'Esempio · Sciopero di categoria annunciato', s:'Fonte da configurare (agenzie di stampa)'},
    {t:'Esempio · Nuove tariffe approvate dalla Giunta', s:'Fonte da configurare (albo pretorio)'}];
 $('#newsList').innerHTML = items.map(n => '<div class="card"><span class="badge b-demo">SEGNAPOSTO</span><h3 style="margin-top:6px">' + esc(n.t) + '</h3><p class="muted">' + esc(n.s) + '</p></div>').join('');
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
  loadDB(); initBattery(); initReportForm(); initBook(); renderNews();
  $('#loginNote').textContent = isLocal()
    ? 'Modalità demo locale: accesso simulato sul dispositivo, la password non viene salvata.'
    : 'Registrandoti con email riceverai un link di conferma: solo gli account confermati contano nei rating.';
 $('#cityList').innerHTML = Object.values(CITIES).map(c => '<option value="' + c.n + '">').join('');
 $('#citySearch').addEventListener('change', searchCity);
 $('#shareText').addEventListener('input', () => { shareEdited = true; });
 renderCityStats('roma');
  refreshAll();
  initHome();
  if (!DB.privacyOk) openModal('m-privacy');
  await backend.init(onAuthChange);
  await reloadData();
}
document.addEventListener('DOMContentLoaded', init);

// Funzioni richiamate dagli attributi onclick/onchange/onsubmit dell'HTML: nei moduli non sono globali,
// quindi vanno esposte su window. Da sostituire gradualmente con addEventListener.
Object.assign(window, {acceptPrivacy, addContact, attachLocation, call112, callNumber, closeModal, doLookup, emailLogin, emailSignup, exportData, forgotPassword, googleLogin, fillShareText, logout, openModal, openPrivacy, openSOS, openShare, openStore, openTab, pick, pickDest, redeem, removeAtt, removeContact, renderBook, resetDemo, resetItaly, searchCity, searchDestination, selectCity, sendShare, setBookFilter, setFeedFilter, saveNewPassword, setPowerSave, simulateRide, submitRating, submitReport, toggleRide});
