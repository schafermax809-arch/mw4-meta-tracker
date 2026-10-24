import { readJson, atomicJson } from './lib/io.mjs';
import { hash, validateState } from './lib/model.mjs';
import { propose } from './lib/update.mjs';
const input = process.argv[process.argv.indexOf('--input') + 1];
if (!process.argv.includes('--input') || !input) throw new Error('Usage: npm run apply-review -- --input reviews/approved.json');
const approval = await readJson(input);
if (Object.keys(approval).some(k => !['baseStateHash', 'operations', 'documents'].includes(k))) throw new Error('Unexpected approval field');
const current = await readJson('public/data/meta.json');
if (approval.baseStateHash !== hash(current)) throw new Error('Stale review; regenerate against current catalog');
// Review input is authored by the maintainer on a branch, never accepted from an untrusted API.
const docs = approval.documents.map(d => ({ ...d, catalog: [], headings: [], signals: { weapons: false, camos: false, builds: false } }));
const result = propose(current, docs, { operations: approval.operations });
if (result) { validateState(result.state); await atomicJson('public/data/meta.json', result.state); console.log('Review changes applied locally. Inspect the diff, test, commit and merge your PR.'); }
