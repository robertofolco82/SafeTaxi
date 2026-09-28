/* Indirizzi preferiti e recenti (IMP-04): regole pure, senza DOM né archivio.
   Luogo: {name, lat, lng}; preferito: {id, label, name, lat, lng}. Salvati solo sul dispositivo, mai inviati al server. */

export const MAX_RECENTS = 10;
export const MAX_FAVORITES = 20;
export const FAVORITE_LABELS = ['Casa', 'Lavoro'];

// Due luoghi coincidono se distano meno di circa 50 m (4 decimali di grado).
const key = p => Number(p.lat).toFixed(4) + ',' + Number(p.lng).toFixed(4);
const place = p => ({name:String(p.name || '').trim().slice(0, 120) || 'Luogo senza nome', lat:+p.lat, lng:+p.lng});
const valid = p => p && Number.isFinite(+p.lat) && Number.isFinite(+p.lng);

// Recenti: il più recente in cima, senza doppioni, al massimo 10.
export function addRecent(recents, p){
  if (!valid(p)) return recents || [];
  const q = place(p);
  return [q, ...(recents || []).filter(r => key(r) !== key(q))].slice(0, MAX_RECENTS);
}

const cleanLabel = l => String(l || '').trim().replace(/\s+/g, ' ').slice(0, 30);

// Preferiti: etichetta obbligatoria e unica (senza distinguere maiuscole). Salvare di nuovo la stessa etichetta la aggiorna.
export function saveFavorite(favorites, label, p, id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)){
  const l = cleanLabel(label), list = favorites || [];
  if (!l) throw new Error('Scegli un nome per il preferito (es. Casa, Lavoro)');
  if (!valid(p)) throw new Error('Luogo non valido');
  const same = list.find(f => f.label.toLowerCase() === l.toLowerCase());
  if (same) return list.map(f => f === same ? {...f, ...place(p), label:l} : f);
  if (list.length >= MAX_FAVORITES) throw new Error('Massimo ' + MAX_FAVORITES + ' preferiti');
  return [...list, {id, label:l, ...place(p)}];
}

export function renameFavorite(favorites, id, label){
  const l = cleanLabel(label), list = favorites || [];
  if (!l) throw new Error('Il nome del preferito non può essere vuoto');
  if (list.some(f => f.id !== id && f.label.toLowerCase() === l.toLowerCase())) throw new Error('Esiste già un preferito "' + l + '"');
  return list.map(f => f.id === id ? {...f, label:l} : f);
}

export const removeFavorite = (favorites, id) => (favorites || []).filter(f => f.id !== id);

// Casa e Lavoro prima, poi gli altri in ordine alfabetico.
export function sortFavorites(favorites){
  const rank = f => { const i = FAVORITE_LABELS.findIndex(l => l.toLowerCase() === f.label.toLowerCase()); return i < 0 ? 99 : i; };
  return (favorites || []).slice().sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, 'it'));
}

// Dati letti dall'archivio: si tengono solo le voci valide, così un archivio rovinato non blocca l'app.
export function parsePlaces(raw){
  let d = raw;
  if (typeof raw === 'string') { try { d = JSON.parse(raw); } catch(e) { d = null; } }
  const favs = Array.isArray(d && d.favorites) ? d.favorites.filter(f => valid(f) && cleanLabel(f.label) && f.id) : [];
  const recents = Array.isArray(d && d.recents) ? d.recents.filter(valid).slice(0, MAX_RECENTS) : [];
  return {favorites:favs.slice(0, MAX_FAVORITES), recents};
}
