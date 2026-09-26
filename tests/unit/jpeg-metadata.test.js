import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {jpegMetadata} from '../../supabase/functions/_shared/jpeg-metadata.js';

const seg = (marker, text) => { const body = [...Buffer.from(text, 'latin1')]; const len = body.length + 2; return [0xff, marker, len >> 8, len & 255, ...body]; };
const jpeg = (...segments) => new Uint8Array([0xff, 0xd8, ...segments.flat(), 0xff, 0xda, 0, 2, 0xff, 0xd9]);

describe('metadati JPEG', () => {
  it('trova EXIF e GPS nel file di prova', () => {
    const r = jpegMetadata(readFileSync('tests/fixtures/volto-con-gps.jpg'));
    expect(r.valid).toBe(true);
    expect(r.metadata).toContain('EXIF');
  });
  it('considera pulito un JPEG con solo JFIF e profilo colore', () => {
    expect(jpegMetadata(jpeg(seg(0xe0, 'JFIF\0...'), seg(0xe2, 'ICC_PROFILE\0')))).toEqual({valid: true, metadata: []});
  });
  it('riconosce XMP, IPTC e commenti', () => {
    const r = jpegMetadata(jpeg(seg(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x/>'), seg(0xed, 'Photoshop 3.0'), seg(0xfe, 'ciao')));
    expect(r.metadata).toEqual(['XMP', 'IPTC', 'COMMENTO']);
  });
  it('rifiuta file che non sono JPEG o sono troncati', () => {
    expect(jpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47])).valid).toBe(false);
    expect(jpegMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x10, 0x00])).valid).toBe(false);
  });
});
