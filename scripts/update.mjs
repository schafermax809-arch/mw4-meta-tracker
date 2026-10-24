import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { collect } from './lib/sources.mjs';
import { propose } from './lib/update.mjs';
import { readJson, atomicJson } from './lib/io.mjs';

await mkdir('work', { recursive: true });
try {
  const current = await readJson('public/data/meta.json');
  const config = await readJson('config/sources.json');
  let previous = null;
  try { previous = await readJson('work/previous-review.json'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const docs = await collect(config);
  const result = propose(current, docs, { previous });
  const report = { checkedAt: new Date().toISOString(), status: result ? 'review-required' : 'unchanged', sources: docs.map(d => ({ url: d.url, hash: d.hash })) };
  await atomicJson('work/run-report.json', report);
  if (result) {
    // Write to staging only. The workflow promotes validated staging to a proposal branch.
    await atomicJson('work/candidate/data/meta.json', result.state);
    await atomicJson('work/candidate/reviews/pending.json', result.review);
    await writeFile('work/pr-body.md', `## Neue MW4-Quellen zur Prüfung\n\n${result.review.documents.length} Quellenrevision(en), ${result.review.changedWeaponIds.length} geänderte Waffen.\n\nDie vorgeschlagene Datendatei wird erst durch das Mergen dieses PRs veröffentlicht. Tier-Einstufungen und Builds werden niemals aus Patchtexten geraten.\n\n### Quellen\n\n${result.review.documents.map(d => `- [${d.title.replace(/[\[\]]/g, '')}](${d.url}) — ${d.publishedAt ?? 'Datum unbekannt'}; SHA-256: \`${d.hash}\`; Waffen: ${d.signals.weapons}, Camos: ${d.signals.camos}, Builds: ${d.signals.builds}`).join('\n')}\n\n### Freigabe\n\n- \`reviews/pending.json\` und den Diff von \`public/data/meta.json\` prüfen.\n- Neue Waffen/Camos sowie Änderungen an Tiers und Builds mit Quellen belegen.\n- Bei Bedarf über \`npm run apply-review -- --input reviews/approved.json\` ergänzen (README).\n- Tests in diesem Workflow wurden vor dem Commit ausgeführt. Gegebenenfalls weitere PR-Workflows in GitHub freigeben.\n- Persönlicher Camo-Fortschritt bleibt ausschließlich im Browser.\n`, 'utf8');
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${Boolean(result)}\n`);
  console.log(result ? 'Validated proposal staged; human review required.' : 'No source changes. Published data untouched.');
} catch (error) {
  await atomicJson('work/run-report.json', { checkedAt: new Date().toISOString(), status: 'failed', error: error.message });
  console.error(`Update aborted; previous data retained: ${error.message}`);
  process.exitCode = 1;
}
