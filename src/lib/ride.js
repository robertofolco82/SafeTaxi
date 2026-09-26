/* Bollino "corsa verificata": regole pure, testate in tests/unit. Le stesse regole le applica il database
   (supabase/migrations/20260926200000_corsa_verificata.sql): qui servono per l'interfaccia e i testi. */
import {shouldSendPosition} from './live.js';

export const RIDE_RULES = {minMinutes:3, minMeters:500, minPositions:3, maxKmh:200, claimHours:24, keepDays:7};

// Posizione al server per la verifica: come per il tracking live, ma mai a meno di 6 secondi dalla precedente
// (il server ignora quelle a meno di 5).
export function shouldPingRide(last, pos, now, powerSave){
  if (!last) return true;
  return now - last.ts >= 6000 && shouldSendPosition(last, pos, now, powerSave);
}

// Corsa da collegare a una segnalazione: solo se valida, non ancora usata e conclusa da meno di 24 ore.
export function rideIdForReport(lastRide, now){
  if (!lastRide || !lastRide.rideId || !lastRide.verified || lastRide.claimed) return null;
  return now - lastRide.endedAt < RIDE_RULES.claimHours * 3600e3 ? lastRide.rideId : null;
}
