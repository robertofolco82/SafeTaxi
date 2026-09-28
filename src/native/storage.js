/* Archivio dei dati che restano solo sul dispositivo (preferiti, recenti, contatti di emergenza).
   App nativa: @capacitor/preferences (archivio del sistema operativo: su iOS lo spazio dati della WebView
   può essere cancellato dal sistema quando manca memoria, questo no). Web: localStorage del browser.
   Mai inviati al server. Ogni errore di lettura o scrittura è gestito: l'app funziona anche senza archivio. */
import {Preferences} from '@capacitor/preferences';
import {isNative} from './platform.js';

export async function deviceGet(key){
  try {
    if (isNative()) return (await Preferences.get({key})).value;
    return localStorage.getItem(key);
  } catch(e) { return null; }
}

export async function deviceSet(key, value){
  try {
    if (isNative()) await Preferences.set({key, value});
    else localStorage.setItem(key, value);
    return true;
  } catch(e) { return false; }
}

export async function deviceRemove(key){
  try {
    if (isNative()) await Preferences.remove({key});
    else localStorage.removeItem(key);
  } catch(e) { /* niente da fare: il dato resta solo sul dispositivo */ }
}
