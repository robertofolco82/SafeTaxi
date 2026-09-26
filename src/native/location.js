/* Posizione: GPS del browser sul web; nell'app nativa GPS anche con schermo spento durante la corsa
   (servizio in primo piano con notifica "Corsa in corso", senza permesso di localizzazione "sempre"). */
import {registerPlugin} from '@capacitor/core';
import {isNative} from './platform.js';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

export async function getPosition({highAccuracy = true, maximumAge = 60000} = {}){
  if (isNative()) {
    const {Geolocation} = await import('@capacitor/geolocation');
    const p = await Geolocation.getCurrentPosition({enableHighAccuracy: highAccuracy, timeout: 12000, maximumAge});
    return {lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy};
  }
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Geolocalizzazione non supportata'));
    navigator.geolocation.getCurrentPosition(
      p => res({lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy}), rej,
      {enableHighAccuracy: highAccuracy, timeout: 12000, maximumAge});
  });
}

// Segue la posizione durante la corsa. Restituisce una funzione che interrompe il tracciamento.
export async function watchRide(onPosition, onError, {powerSave = false} = {}){
  if (!isNative()) {
    if (!navigator.geolocation) throw new Error('GPS non disponibile su questo dispositivo');
    const id = navigator.geolocation.watchPosition(
      p => onPosition({lat: p.coords.latitude, lng: p.coords.longitude}),
      err => onError(new Error('Posizione non disponibile: ' + err.message)),
      {enableHighAccuracy: !powerSave, maximumAge: powerSave ? 30000 : 5000, timeout: 20000});
    return () => navigator.geolocation.clearWatch(id);
  }
  await askNotificationPermission();
  const id = await BackgroundGeolocation.addWatcher({
    backgroundTitle: 'Corsa in corso',
    backgroundMessage: 'Safe Taxi segue la corsa per la tua sicurezza. Tocca per aprire.',
    requestPermissions: true, stale: false, distanceFilter: powerSave ? 50 : 15,
  }, (loc, err) => {
    if (err) {
      onError(new Error(err.code === 'NOT_AUTHORIZED'
        ? 'Serve il permesso di posizione: attivalo nelle impostazioni del telefono.' : 'Posizione non disponibile'));
      if (err.code === 'NOT_AUTHORIZED') BackgroundGeolocation.openSettings();
      return;
    }
    onPosition({lat: loc.latitude, lng: loc.longitude});
  });
  return () => BackgroundGeolocation.removeWatcher({id});
}

// Android 13+: senza questo permesso la notifica fissa "Corsa in corso" non si vede (il GPS funziona comunque).
async function askNotificationPermission(){
  try {
    const {LocalNotifications} = await import('@capacitor/local-notifications');
    const p = await LocalNotifications.checkPermissions();
    if (p.display === 'prompt' || p.display === 'prompt-with-rationale') await LocalNotifications.requestPermissions();
  } catch (e) { /* permesso facoltativo */ }
}
