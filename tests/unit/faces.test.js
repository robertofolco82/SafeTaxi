import {describe, it, expect} from 'vitest';
import {expandBox, detectionTiles, pixelBlock, mergeFaces} from '../../src/lib/faces.js';

describe('sfocatura dei volti', () => {
  it('allarga il riquadro del volto restando dentro l\'immagine', () => {
    expect(expandBox({x:100, y:100, w:100, h:100}, 1.4, 1000, 1000)).toEqual({x:80, y:69, w:140, h:162});
    const edge = expandBox({x:0, y:0, w:100, h:100}, 1.4, 120, 120);
    expect(edge.x).toBe(0); expect(edge.y).toBe(0);
    expect(edge.x + edge.w).toBeLessThanOrEqual(120); expect(edge.y + edge.h).toBeLessThanOrEqual(120);
  });
  it('cerca i volti anche su quattro riquadri sovrapposti nelle foto grandi', () => {
    expect(detectionTiles(400, 300)).toHaveLength(1);
    const t = detectionTiles(1000, 800);
    expect(t).toHaveLength(5);
    expect(t[4]).toEqual({x:400, y:320, w:600, h:480});
  });
  it('pixela con al massimo 8 blocchi sul lato lungo del volto', () => {
    expect(pixelBlock({w:40, h:40})).toBe(8);
    expect(pixelBlock({w:200, h:160})).toBe(25);
  });
  it('conta una volta sola lo stesso volto trovato in più riquadri', () => {
    const merged = mergeFaces([{x:100, y:100, w:50, h:50}, {x:105, y:98, w:48, h:52}, {x:400, y:100, w:40, h:40}]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({x:100, y:98, w:53, h:52});
  });
});
