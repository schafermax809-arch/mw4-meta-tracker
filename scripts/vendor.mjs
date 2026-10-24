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
}
