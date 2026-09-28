/* Filtro del feed (IMP-03) per la modalità demo: stesse regole di public.feed_reports nel database
   (supabase/migrations/20260928120000_filtro_feed.sql). Città, tipo (tutte, positive, negative) e parola chiave
   solo sul testo pubblico (descrizione e tratta), mai su targa o licenza; senza distinguere maiuscole e accenti,
   per inizio di parola, tutte le parole obbligatorie. Il database riconosce anche le varianti della parola
   ("tassametri" trova "tassametro"): qui la modalità demo si limita all'inizio di parola. */

export const FEED_PAGE = 12;

export const normalizeText = t => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const queryWords = q => (normalizeText(q).match(/[\p{L}\p{N}]{2,}/gu) || []).slice(0, 8);

export function matchesQuery(r, q){
  const words = queryWords(q);
  if (!words.length) return true;
  const text = normalizeText([r.description, r.from, r.to].filter(Boolean).join(' ')).match(/[\p{L}\p{N}]+/gu) || [];
  return words.every(w => text.some(t => t.startsWith(w)));
}

export function filterFeed(reports, {city = '', q = '', kind = 'all', before = null, limit = FEED_PAGE} = {}){
  return (reports || [])
    .filter(r => !city || r.city === city)
    .filter(r => kind === 'pos' ? r.type === 'positiva' : kind === 'neg' ? r.type !== 'positiva' : true)
    .filter(r => before == null || r.createdAt < before)
    .filter(r => matchesQuery(r, q))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
