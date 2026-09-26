// Analisi dei segmenti di un file JPEG per trovare metadati personali (EXIF/GPS, XMP, IPTC, commenti).
// Usato dalla funzione register-attachment e dai test unitari: nessuna dipendenza, gira in Deno e in Node.

const SOI = 0xd8, SOS = 0xda, EOI = 0xd9;

// Restituisce {valid, metadata: [...]} dove metadata elenca i blocchi trovati (vuoto = file pulito).
export function jpegMetadata(bytes){
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 4 || b[0] !== 0xff || b[1] !== SOI) return {valid: false, metadata: []};
  const metadata = [];
  const ascii = (start, len) => String.fromCharCode(...b.subarray(start, Math.min(start + len, b.length)));
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return {valid: false, metadata};
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }            // byte di riempimento
    if (marker === SOS || marker === EOI) break;        // da qui in poi solo dati dell'immagine
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return {valid: false, metadata};
    const data = i + 4;
    if (marker === 0xe1) {                                // APP1: EXIF o XMP
      if (ascii(data, 6) === 'Exif\0\0') metadata.push('EXIF');
      else if (ascii(data, 28) === 'http://ns.adobe.com/xap/1.0/') metadata.push('XMP');
      else metadata.push('APP1');
    } else if (marker === 0xed) metadata.push('IPTC');    // APP13: Photoshop/IPTC (autore, didascalie)
    else if (marker === 0xfe) metadata.push('COMMENTO');  // COM
    else if (marker >= 0xe3 && marker <= 0xef) metadata.push('APP' + (marker - 0xe0)); // altri blocchi applicativi
    // APP0 (JFIF) e APP2 (profilo colore ICC) non contengono dati personali.
    i += 2 + len;
  }
  return {valid: true, metadata};
}
