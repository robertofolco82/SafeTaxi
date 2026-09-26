// Formati di allegato accettati, per tipo, con l'estensione usata nel nome del file.
// Condiviso da app (src/backend/supabase.js) e funzione register-attachment. Deve restare allineato
// alla lista allowed_mime_types del bucket e all'espressione regolare in private.can_attach (migrazione 2c).
export const ATTACHMENT_TYPES = {
  foto: {'image/jpeg': 'jpg'},  // le foto sono sempre riesportate in JPEG sul dispositivo
  video: {'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp'},
  audio: {'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'weba',
    'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/3gpp': '3ga', 'audio/amr': 'amr'},
};
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 6;

export function attachmentKind(mime){
  return Object.keys(ATTACHMENT_TYPES).find(k => ATTACHMENT_TYPES[k][mime]) || null;
}
export const extensionFor = mime => { const k = attachmentKind(mime); return k ? ATTACHMENT_TYPES[k][mime] : null; };
