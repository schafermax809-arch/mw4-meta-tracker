import { cp, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
export async function prepareVendor() {
  const files = [
    "build/three.module.js",
    "build/three.core.js",
    "examples/jsm/controls/OrbitControls.js",
    "examples/jsm/loaders/GLTFLoader.js",
    "examples/jsm/utils/BufferGeometryUtils.js",
    "examples/jsm/utils/SkeletonUtils.js",
    "LICENSE",
  ];
  for (const file of files) {
    const target = `public/vendor/three/${file}`;
    await mkdir(dirname(target), { recursive: true });
    await cp(`node_modules/three/${file}`, target);
  }
  const ocr = ['tesseract.esm.min.js', 'worker.min.js', 'tesseract.min.js.LICENSE.txt', 'worker.min.js.LICENSE.txt'];
  await mkdir('public/vendor/ocr/core', { recursive: true });
  await mkdir('public/vendor/ocr/lang', { recursive: true });
  for (const file of ocr) await cp(`node_modules/tesseract.js/dist/${file}`, `public/vendor/ocr/${file}`);
  await cp('node_modules/tesseract.js/LICENSE.md', 'public/vendor/ocr/LICENSE');
  await cp('node_modules/tesseract.js-core/LICENSE', 'public/vendor/ocr/core/LICENSE');
  for (const name of ['tesseract-core', 'tesseract-core-simd', 'tesseract-core-lstm', 'tesseract-core-simd-lstm']) {
    await cp(`node_modules/tesseract.js-core/${name}.wasm.js`, `public/vendor/ocr/core/${name}.wasm.js`);
  }
  for (const lang of ['eng', 'deu']) {
    await cp(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `public/vendor/ocr/lang/${lang}.traineddata.gz`);
    await cp('node_modules/tesseract.js-core/LICENSE', `public/vendor/ocr/lang/${lang}-LICENSE`);
  }
}
