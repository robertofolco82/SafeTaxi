/* Export a terzi: solo dati anonimizzati (niente nomi, targhe o licenze; coordinate a 2 decimali) */
export function toOpenDataRows(reports){
  return reports.map(r => ({id:r.id, data:new Date(r.createdAt).toISOString().slice(0, 10), citta:r.city, tipo:r.type, valutazione:r.rating,
    importo_eur:r.cost, durata_min:r.duration, verificata:r.verified, allegati:r.attachments || 0,
    lat: r.lat != null ? +r.lat.toFixed(2) : null, lng: r.lng != null ? +r.lng.toFixed(2) : null}));
}
export function toCsv(rows){
  const h = Object.keys(rows[0]);
  return [h.join(';')].concat(rows.map(o => h.map(k => o[k] == null ? '' : String(o[k]).replace(/;/g, ',')).join(';'))).join('\n');
}
