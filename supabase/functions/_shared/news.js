// News sul settore taxi: fonti, lettura dei feed RSS e filtro. Nessuna dipendenza: la usano la funzione
// refresh-news (Deno) e i test unitari (Vitest).
//
// Si salvano e si mostrano solo titolo, testata, data e link all'articolo originale: niente testo né immagini,
// così basta citare la fonte (i titoli sono esclusi dai diritti degli editori, art. 43-bis L. 633/1941).

export const FEEDS = [
  {id:'google_news', name:'Google News',
   url:'https://news.google.com/rss/search?q=taxi+OR+tassisti+OR+tassista+OR+NCC+OR+radiotaxi&hl=it&gl=IT&ceid=IT:it'},
  {id:'consumerismo', name:'Consumerismo No Profit', source:'Consumerismo No Profit', url:'https://www.consumerismo.it/feed'},
];

export const NEWS_MAX_AGE_DAYS = 30;
export const NEWS_MAX_PER_RUN = 60;

// Deve parlare di taxi o NCC (NCC solo in maiuscolo: "ncc" è anche altro)...
const RELEVANT = /\b(taxi|radiotaxi|tassist[ai]|tassametro)\b/i;
const RELEVANT_NCC = /\b(NCC|Ncc)\b/;
// ...e non di taxi acquei (anche "in laguna"), film, videogiochi o dell'omonima società svedese.
const EXCLUDED = /taxi acque|laguna|taxi driver|crazy taxi|taxi bar\b|corone svedesi|pista da bob/i;
// Siti che ripubblicano i titoli di altre testate: si tiene l'originale.
const EXCLUDED_SOURCES = ['agenziagiornalisticaopinione.it'];
const MIN_TITLE = 25;

export const isRelevant = title => title.length >= MIN_TITLE && (RELEVANT.test(title) || RELEVANT_NCC.test(title)) && !EXCLUDED.test(title);

const ENTITIES = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' '};
export function decodeXml(s){
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ').trim();
}
const tag = (item, name) => { const m = item.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i')); return m ? decodeXml(m[1]) : ''; };

// Elementi di un feed RSS 2.0: titolo, link, data e testata (Google News la indica in <source>).
export function parseFeed(xml, feed){
  return (String(xml).match(/<item[\s>][\s\S]*?<\/item>/gi) || []).map(item => {
    const source = tag(item, 'source') || feed.source || feed.name;
    let title = tag(item, 'title');
    // Google News aggiunge " - Testata" in fondo al titolo.
    if (title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3)).trim();
    const date = Date.parse(tag(item, 'pubDate'));
    return {title, url:tag(item, 'link'), source, publishedAt:isNaN(date) ? null : date, feed:feed.id};
  });
}

const titleKey = t => t.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, ' ').trim();

// Notizie da salvare: pertinenti, con link valido, recenti, senza doppioni, dalla più recente.
export function selectNews(items, now){
  const seen = new Set(), out = [];
  const minDate = now - NEWS_MAX_AGE_DAYS * 864e5;
  for (const n of [...items].sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))) {
    if (!n.title || !/^https?:\/\//.test(n.url) || !isRelevant(n.title) || EXCLUDED_SOURCES.includes(n.source)) continue;
    if (n.publishedAt && (n.publishedAt < minDate || n.publishedAt > now + 864e5)) continue;
    const k = titleKey(n.title);
    if (seen.has(k) || seen.has(n.url)) continue;
    seen.add(k); seen.add(n.url);
    out.push({title:n.title.slice(0, 300), url:n.url, source_name:n.source.slice(0, 120), feed:n.feed,
      published_at:n.publishedAt ? new Date(n.publishedAt).toISOString() : null});
    if (out.length >= NEWS_MAX_PER_RUN) break;
  }
  return out;
}
