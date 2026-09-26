/* Condivisione della corsa in tempo reale: regole pure, testate in tests/unit. */
import {haversine} from './utils.js';

// Invia una nuova posizione ogni 15 s o dopo 50 m; in risparmio energetico ogni 60 s o dopo 200 m.
export function shouldSendPosition(last, pos, now, powerSave){
  if (!last) return true;
  const minMs = powerSave ? 60000 : 15000, minKm = powerSave ? 0.2 : 0.05;
  return now - last.ts >= minMs || haversine(last, pos) >= minKm;
}

export const liveLink = (origin, path, token) => origin + path + '?live=' + encodeURIComponent(token);

// Token dal link (?live=...): solo caratteri base64url, altrimenti null.
export function liveToken(search){
  const t = new URLSearchParams(search).get('live');
  return t && /^[A-Za-z0-9_-]{20,64}$/.test(t) ? t : null;
}

export const hhmm = ts => new Date(ts).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'});
