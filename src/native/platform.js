/* Differenze tra web e app nativa (Capacitor, iOS e Android). */
import {Capacitor} from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();
export const APP_SCHEME = 'it.safetaxi.app';
// Link di ritorno dopo login Google, conferma email e recupero password nell'app nativa.
export const AUTH_REDIRECT = APP_SCHEME + '://auth';

// Indirizzo pubblico dell'app web: nei link condivisi (tracking live) l'app nativa non ha un dominio proprio.
export function publicBase(){
  if (!isNative()) return location.origin + location.pathname;
  return (import.meta.env.VITE_PUBLIC_URL || 'https://safetaxi-nu.vercel.app') + '/';
}

// Link esterni (WhatsApp, store, siti): nell'app nativa vanno aperti fuori dalla WebView.
export function openExternal(url){
  if (isNative()) location.href = url;
  else window.open(url, '_blank', 'noopener');
}
