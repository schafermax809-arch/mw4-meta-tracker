import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { RESEARCH_FIELDS } from '../public/engine/local-research.js';
import { METRICS } from '../public/engine/database.js';
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { if (quoted && s[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ';' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (quoted) throw Error('Unvollständiges CSV');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
if (process.argv[1]?.endsWith('prepare-research-audit.mjs')) {
  const path = process.argv[2]; if (!path) throw Error('CSV-Pfad fehlt');
  const bytes = await readFile(path), [headers, ...source] = parseCSV(bytes.toString('utf8'));
  const idx = n => { const i = headers.indexOf(n); if (i < 0) throw Error('CSV-Spalte fehlt: ' + n); return i; };
  const name = idx('Waffe'), id = idx('ID'), slot = idx('Slot'), missing = idx('Fehlende explizite Messfelder');
  const data = { schemaVersion: 1, sourceFile: basename(path), csvHash: createHash('sha256').update(bytes).digest('hex'), fields: RESEARCH_FIELDS, rows: source.map(r => ({ weaponName: r[name], attachmentId: r[id], slot: r[slot], missing: RESEARCH_FIELDS.filter(k => r[missing].split(' | ').includes(METRICS[k][0])) })) };
  await writeFile('public/data/research-audit.json', JSON.stringify(data, null, 2) + '\n');
  console.log(`CSV-Ausgangsbericht: ${data.rows.length} Einträge importiert.`);
}
