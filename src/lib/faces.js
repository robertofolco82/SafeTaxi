/* Geometria per la sfocatura dei volti: funzioni pure, testate in tests/unit. */

// Allarga il riquadro del volto (capelli, orecchie, mento) e lo mantiene dentro l'immagine.
export function expandBox(b, factor, w, h){
  const cx = b.x + b.w/2, cy = b.y + b.h/2, nw = b.w*factor, nh = b.h*factor*1.15;
  const x = Math.max(0, Math.floor(cx - nw/2)), y = Math.max(0, Math.floor(cy - nh/2));
  return {x, y, w:Math.min(w, Math.ceil(cx + nw/2)) - x, h:Math.min(h, Math.ceil(cy + nh/2)) - y};
}

// Riquadri su cui cercare i volti: l'immagine intera più una griglia 2×2 sovrapposta,
// così anche i volti piccoli (lontani dalla fotocamera) diventano abbastanza grandi per il modello.
export function detectionTiles(w, h){
  const tiles = [{x:0, y:0, w, h}];
  if (Math.max(w, h) < 480) return tiles;
  const tw = Math.round(w*0.6), th = Math.round(h*0.6);
  for (const x of [0, w - tw]) for (const y of [0, h - th]) tiles.push({x, y, w:tw, h:th});
  return tiles;
}

// Lato dei blocchi di pixelatura: almeno 8 px e al massimo 8 blocchi sul lato lungo del volto (non riconoscibile).
export const pixelBlock = b => Math.max(8, Math.ceil(Math.max(b.w, b.h)/8));

// Unisce i riquadri dello stesso volto trovati più volte (immagine intera e riquadri sovrapposti):
// due riquadri sono lo stesso volto se l'area comune supera metà del più piccolo.
export function mergeFaces(boxes){
  const out = [];
  for (const b of boxes) {
    const same = out.find(o => {
      const iw = Math.min(o.x + o.w, b.x + b.w) - Math.max(o.x, b.x), ih = Math.min(o.y + o.h, b.y + b.h) - Math.max(o.y, b.y);
      return iw > 0 && ih > 0 && iw*ih > 0.5*Math.min(o.w*o.h, b.w*b.h);
    });
    if (!same) { out.push({...b}); continue; }
    const x = Math.min(same.x, b.x), y = Math.min(same.y, b.y);
    same.w = Math.max(same.x + same.w, b.x + b.w) - x; same.h = Math.max(same.y + same.h, b.y + b.h) - y; same.x = x; same.y = y;
  }
  return out;
}
