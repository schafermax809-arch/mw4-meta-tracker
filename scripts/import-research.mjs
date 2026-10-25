import { readFile, writeFile, rename } from 'node:fs/promises';
import { validateResearch, mergeResearch, recordKey } from '../public/engine/local-research.js';
import { hydrateCommunityValues } from '../public/engine/community-values.js';
import { hydrateAttachmentCatalog } from '../public/engine/attachment-catalog.js';
import { hydrateEffectEvidence } from '../public/engine/effect-evidence.js';
const path = process.argv[2];
if (!path || path.startsWith('--')) throw Error('Aufruf: node scripts/import-research.mjs <mw4-recherche.json> [--apply] [--replace]');
const read = async n => JSON.parse(await readFile('public/data/' + n + '.json', 'utf8'));
const bytes = await readFile(path); if (bytes.length > 15000000) throw Error('Datei zu groß');
const incoming = validateResearch(JSON.parse(bytes.toString('utf8')));
const [raw, meta, community, catalog, effects, previous] = await Promise.all(['gunsmith', 'meta', 'community-values', 'attachment-catalog', 'effect-evidence', 'manual-research'].map(read));
const db = hydrateEffectEvidence(hydrateAttachmentCatalog(hydrateCommunityValues(raw, community, meta.patchRevision), catalog, meta.patchRevision), effects, meta.patchRevision);
for (const r of incoming.records) {
  if (!db.attachments.some(a => a.id === r.attachmentId && a.weaponIds.includes(r.weaponId))) throw Error('Unbekannte Zuordnung: ' + recordKey(r));
  if (r.patchRevision !== meta.patchRevision) throw Error('Veralteter Patchstand: ' + recordKey(r));
}
const existing = new Set(previous.records.map(recordKey));
const duplicates = incoming.records.filter(r => existing.has(recordKey(r)));
if (duplicates.length && !process.argv.includes('--replace')) throw Error(`${duplicates.length} bestehende Einträge. Vorher prüfen; zum ausdrücklichen Ersetzen --replace verwenden.`);
const choices = Object.fromEntries(incoming.records.map(r => [recordKey(r), 'replace']));
const merged = mergeResearch(previous, incoming, choices);
console.log(`${incoming.records.length} Einträge validiert; ${duplicates.length} Überschneidungen. Status bleibt manuell, keine unabhängige Verifizierung.`);
if (process.argv.includes('--apply')) {
  const target = 'public/data/manual-research.json';
  await writeFile(target + '.tmp', JSON.stringify(merged, null, 2) + '\n');
  await rename(target + '.tmp', target);
  console.log('Repository-Datei aktualisiert. Diff prüfen, Tests ausführen und per Pull Request veröffentlichen. Keine Camo-Dateien gelesen oder geändert.');
} else console.log('Nur Prüfung. Keine Datei geändert. Mit --apply bewusst in die Repository-Datei übernehmen.');
