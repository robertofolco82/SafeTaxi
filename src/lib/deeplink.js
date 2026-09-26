/* Link di ritorno all'app nativa dopo login Google, conferma email o recupero password
   (es. it.safetaxi.app://auth?code=...&flow=recovery). Restituisce null se il link non è per noi. */
export function parseAuthLink(url, scheme){
  if (typeof url !== 'string' || !url.startsWith(scheme + '://auth')) return null;
  let q;
  try { q = new URL(url).searchParams; } catch (e) { return null; }
  // Supabase può mettere i parametri d'errore anche dopo il # (flusso implicito).
  const hash = new URLSearchParams(url.includes('#') ? url.slice(url.indexOf('#') + 1) : '');
  const get = k => q.get(k) || hash.get(k);
  return {code: get('code'), recovery: get('flow') === 'recovery' || get('type') === 'recovery',
    error: get('error_description') || get('error') || null};
}
