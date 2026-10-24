import { readJson } from './lib/io.mjs';
import { validateState } from './lib/model.mjs';
const path = process.argv[2] || 'public/data/meta.json';
validateState(await readJson(path));
console.log(`Validated ${path}`);
