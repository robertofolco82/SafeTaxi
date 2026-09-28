/* Regola di aggiornamento dei dati ufficiali (IMP-06, decisioni di Roberto del 28/09/2026):
   - pubblicazioni periodiche (es. licenze ART): si mostrano se uscite da non più di 12 mesi; tra 12 e 24 mesi si
     mostrano con l'avviso "ultima pubblicazione ufficiale oltre 12 mesi fa"; oltre 24 mesi si nascondono;
   - tariffe: vale la delibera in vigore, qualunque sia la sua data. */

export function monthsBetween(fromIso, now){
  const a = new Date(fromIso + 'T00:00:00Z'), b = new Date(now);
  return (b.getUTCFullYear() - a.getUTCFullYear())*12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}

export function freshness(fig, now = Date.now()){
  if (fig.rule === 'in_vigore') return {show:true, stale:false};
  const m = monthsBetween(fig.published, now);
  return {show:m < 24, stale:m >= 12};
}

// Valore di una metrica per una città (o somma per l'Italia sulle città monitorate), solo se da mostrare.
export function figure(list, city, metric, now = Date.now()){
  const f = (list || []).find(x => x.city === city && x.metric === metric);
  if (!f) return null;
  const fr = freshness(f, now);
  return fr.show ? {...f, stale:fr.stale} : null;
}

const fmtDate = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
export function sourceLine(f){
  return f.rule === 'in_vigore' ? 'Fonte: ' + f.source + ' (in vigore)' : 'Fonte: ' + f.source + ', anno ' + f.year + ', pubblicato il ' + fmtDate(f.published);
}
