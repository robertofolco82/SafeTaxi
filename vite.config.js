import {defineConfig} from 'vite';
import {cpSync, mkdirSync} from 'node:fs';

// Copia i file WebAssembly di MediaPipe (riconoscimento volti) tra i file pubblici: così sono serviti dal nostro
// dominio e scaricati solo quando l'utente allega una foto. La cartella generata è ignorata da git.
function mediapipeWasm(){
  return {
    name: 'safetaxi-mediapipe-wasm',
    configResolved(){
      mkdirSync('public/mediapipe', {recursive: true});
      // Varianti usate da FilesetResolver: con istruzioni SIMD (browser recenti) e senza (dispositivi più vecchi).
      for (const f of ['vision_wasm_internal', 'vision_wasm_nosimd_internal'])
        for (const ext of ['.js', '.wasm']) cpSync(`node_modules/@mediapipe/tasks-vision/wasm/${f}${ext}`, `public/mediapipe/${f}${ext}`);
    },
  };
}

export default defineConfig({
  plugins: [mediapipeWasm()],
  test: {
    include: ['tests/unit/**/*.test.js'],
  },
});
