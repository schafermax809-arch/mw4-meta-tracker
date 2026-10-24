import { cp, mkdir, readFile } from 'node:fs/promises';
import { validateState } from './lib/model.mjs';
import { prepareVendor } from './vendor.mjs';
validateState(JSON.parse(await readFile('public/data/meta.json', 'utf8')));
await mkdir('dist', { recursive: true });
await prepareVendor();
await cp('public', 'dist', { recursive: true });
console.log('Static site built in dist/. No backend or paid API needed.');
