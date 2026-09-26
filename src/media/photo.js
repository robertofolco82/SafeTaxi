/* Elaborazione delle foto sul dispositivo, prima di qualsiasi invio:
   - la foto viene ridisegnata su un canvas e riesportata in JPEG: così perde tutti i metadati (EXIF, GPS, XMP);
   - i volti trovati da MediaPipe vengono pixelati in modo irreversibile.
   Se il riconoscimento dei volti non è disponibile la foto NON viene allegata. */
import {expandBox, detectionTiles, pixelBlock, mergeFaces} from '../lib/faces.js';

let detectorPromise = null;
function detector(){
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const {FilesetResolver, FaceDetector} = await import('@mediapipe/tasks-vision');
      const base = import.meta.env.BASE_URL;
      const fileset = await FilesetResolver.forVisionTasks(base + 'mediapipe');
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: {modelAssetPath: base + 'models/blaze_face_short_range.tflite', delegate: 'CPU'},
        runningMode: 'IMAGE', minDetectionConfidence: 0.4,
      });
    })();
    detectorPromise.catch(() => { detectorPromise = null; });
  }
  return detectorPromise;
}

function findFaces(det, canvas){
  const faces = [];
  for (const t of detectionTiles(canvas.width, canvas.height)) {
    const tile = document.createElement('canvas'); tile.width = t.w; tile.height = t.h;
    tile.getContext('2d').drawImage(canvas, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
    for (const d of det.detect(tile).detections) {
      const b = d.boundingBox;
      faces.push({x: t.x + b.originX, y: t.y + b.originY, w: b.width, h: b.height});
    }
  }
  return mergeFaces(faces);
}

function pixelate(canvas, box){
  const ctx = canvas.getContext('2d'), bs = pixelBlock(box);
  const sw = Math.max(1, Math.round(box.w/bs)), sh = Math.max(1, Math.round(box.h/bs));
  const small = document.createElement('canvas'); small.width = sw; small.height = sh;
  small.getContext('2d').drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, sw, sh);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, sw, sh, box.x, box.y, box.w, box.h);
  ctx.imageSmoothingEnabled = true;
}

// Restituisce {blob, faces}: blob è un JPEG senza metadati con i volti pixelati.
export async function processPhoto(file, {maxSide = 1920, quality = 0.85} = {}){
  let bitmap;
  try { bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'}); }
  catch (e) { throw new Error('Formato della foto non supportato: scatta o scegli una foto JPEG o PNG.'); }
  const scale = Math.min(1, maxSide/Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width*scale); canvas.height = Math.round(bitmap.height*scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let det;
  try { det = await detector(); }
  catch (e) { throw new Error('Riconoscimento dei volti non disponibile (serve connessione la prima volta): foto non allegata.'); }
  const faces = findFaces(det, canvas);
  faces.forEach(f => pixelate(canvas, expandBox(f, 1.4, canvas.width, canvas.height)));
  const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Elaborazione della foto non riuscita.')), 'image/jpeg', quality));
  return {blob, faces: faces.length};
}
