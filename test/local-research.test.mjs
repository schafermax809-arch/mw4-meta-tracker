import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RESEARCH_KEY, RESEARCH_FIELDS, emptyResearch, comparison, validateResearch, loadResearch, saveResearch, upsertResearch, mergeResearch, hydrateLocalResearch, researchRows } from '../public/engine/local-research.js';
import { hydrateCommunityValues } from '../public/engine/community-values.js';
import { hydrateAttachmentCatalog } from '../public/engine/attachment-catalog.js';
import { hydrateEffectEvidence } from '../public/engine/effect-evidence.js';
import { calculateStats } from '../public/engine/calculator.js';
import { optimize } from '../public/engine/optimizer.js';
import { parseOCRText } from '../public/research-media.js';
import { parseCSV } from '../scripts/prepare-research-audit.mjs';
const json = async n => JSON.parse(await readFile(new URL('../public/data/' + n + '.json', import.meta.url), 'utf8'));
const [raw, meta, community, catalog, effects, audit] = await Promise.all(['gunsmith', 'meta', 'community-values', 'attachment-catalog', 'effect-evidence', 'research-audit'].map(json));
const db = hydrateEffectEvidence(hydrateAttachmentCatalog(hydrateCommunityValues(raw, community, raw.patchRevision), catalog, raw.patchRevision), effects, raw.patchRevision);
const a = db.attachments.find(a => a.weaponIds.includes('m4') && a.name === 'FSS Fireline Grip');
const field = (changes = {}) => ({ metric: 'ads', model: 'add', value: -30, unit: 'ms', before: 300, after: 270, status: 'measured', source: 'Eigene Testmessung, keine Spieldaten', secondSource: '', date: '2026-10-25', note: 'Synthetischer Test', replacePublished: true, useBaseline: true, ...changes });
const record = (changes = {}) => ({ weaponId: 'm4', attachmentId: a.id, patchRevision: raw.patchRevision, updatedAt: '2026-10-25T12:00:00Z', fields: [field()], otherEffects: '', otherReviewed: false, checklist: [], ...changes });
const data = r => upsertResearch(emptyResearch(), r ?? record());
const refs = [{ slot: a.slot, attachmentId: a.id }];
test('all 33 weapons and 1629 CSV associations are in the live worklist', () => {
  const rows = researchRows(db, emptyResearch());
  assert.equal(db.weapons.length, 33); assert.equal(rows.length, 1629); assert.equal(audit.rows.length, 1629);
  assert.deepEqual(audit.fields, RESEARCH_FIELDS);
  for (const original of audit.rows) assert.ok(rows.some(r => r.weapon.name === original.weaponName && r.attachment.id === original.attachmentId && r.attachment.slot === original.slot));
  assert.equal(rows.filter(r => r.complete).length, 0);
  assert.equal(rows.reduce((s, r) => s + r.missing.length + r.documented.length, 0), rows.length * 11);
});
test('300 to 270 produces -30ms, -10%, factor .9 but no inferred model', () => {
  const c = comparison(300, 270); assert.equal(c.absolute, -30); assert.ok(Math.abs(c.percent + 10) < 1e-10); assert.equal(c.factor, .9); assert.equal(c.model, 'unknown');
  assert.equal(comparison(0, 2).percent, null); assert.throws(() => comparison(-1, 2));
});
test('strict import rejects unknown properties, personal data and duplicate records', () => {
  assert.throws(() => validateResearch({ ...data(), progress: { entries: {} } }));
  const duplicated = data(); duplicated.records.push(record()); assert.throws(() => validateResearch(duplicated));
  const duplicateField = record({ fields: [field(), field()] }); assert.throws(() => data(duplicateField));
  assert.throws(() => data(record({ fields: [field({ source: 'javascript:alert(1)' })] })));
});
test('units, dates, finite numbers and complete measurement pairs are checked', () => {
  for (const invalid of [{ unit: '%' }, { value: Infinity }, { date: '2026-02-30' }, { after: null }, { source: '' }, { metric: '__proto__' }, { before: -3 }]) assert.throws(() => data(record({ fields: [field(invalid)] })));
  assert.throws(() => data(record({ fields: [field({ model: 'factor', unit: 'factor', value: -1, before: null, after: null })] })));
  assert.throws(() => data(record({ fields: [field({ metric: 'magazine', model: 'set', unit: 'Schuss', value: 30.5, before: null, after: null })] })));
});
test('manual crosschecking requires a second source and never becomes verified', () => {
  assert.throws(() => data(record({ fields: [field({ status: 'crosschecked' })] })));
  const hydrated = hydrateLocalResearch(db, data(record({ fields: [field({ status: 'crosschecked', secondSource: 'Zweite synthetische Testquelle' })] })));
  assert.equal(hydrated.attachments.find(x => x.id === a.id).localEffects[0].status, 'reported');
  assert.equal(hydrated.attachments.find(x => x.id === a.id).effectsComplete, false);
});
test('chosen mathematical model must agree with before/after evidence', () => {
  assert.throws(() => data(record({ fields: [field({ value: -20 })] })));
  assert.doesNotThrow(() => data(record({ fields: [field({ model: 'percent', unit: '%', value: -10 })] })));
  assert.doesNotThrow(() => data(record({ fields: [field({ model: 'factor', unit: 'factor', value: .9 })] })));
});
test('unknown and draft values cannot alter calculator or close missing fields', () => {
  for (const f of [field({ status: 'draft' }), field({ model: 'unknown', value: null })]) {
    const saved = data(record({ fields: [f] })), hydrated = hydrateLocalResearch(db, saved);
    assert.equal(hydrated.attachments.find(x => x.id === a.id).localEffects, undefined);
    assert.equal(calculateStats(hydrated, 'm4', refs).preview.ads.value, calculateStats(db, 'm4', refs).preview.ads.value);
  }
});
test('confirmed local effect and baseline produce 270ms without mutating published data', () => {
  const before = JSON.stringify(db), hydrated = hydrateLocalResearch(db, data());
  const c = calculateStats(hydrated, 'm4', refs);
  assert.equal(c.preview.ads.value, 270); assert.equal(c.base.ads.value, 300); assert.equal(c.preview.ads.status, 'reported'); assert.equal(c.values.ads, undefined);
  assert.equal(JSON.stringify(db), before);
});
test('conflicts do not replace published values without explicit confirmation', () => {
  const hydrated = hydrateLocalResearch(db, data(record({ fields: [field({ replacePublished: false, useBaseline: false })] })));
  const c = calculateStats(hydrated, 'm4', refs);
  assert.equal(c.preview.ads, undefined); assert.match(c.previewMissing.ads, /Widerspruch|widerspricht/);
  assert.equal(hydrated.localResearch.conflicts[0].resolvedLocally, false);
});
test('stale patch and unknown IDs survive export but are inactive', () => {
  const stale = data(record({ patchRevision: 'a'.repeat(64) }));
  assert.equal(hydrateLocalResearch(db, stale).localResearch.active, 0);
  assert.equal(researchRows(db, stale).find(r => r.attachment.id === a.id).status, 'stale');
  const unknown = data(record({ attachmentId: 'new-unmatched' }));
  assert.equal(hydrateLocalResearch(db, unknown).localResearch.active, 0);
});
test('JSON roundtrip is lossless; imports retain existing records by default', () => {
  const saved = data(), incoming = data(record({ fields: [field({ note: 'Neue Notiz' })] }));
  assert.deepEqual(validateResearch(JSON.parse(JSON.stringify(saved))), saved);
  assert.deepEqual(mergeResearch(saved, incoming), saved);
  assert.equal(mergeResearch(saved, incoming, { [`m4/${a.id}`]: 'replace' }).records[0].fields[0].note, 'Neue Notiz');
});
test('research persistence never reads or writes camo keys and failed writes retain old data', () => {
  const calls = [], map = new Map([['mw4-progress-v1', '{"untouched":7}']]);
  const storage = { getItem(k) { calls.push(k); return map.get(k) ?? null; }, setItem(k, v) { calls.push(k); map.set(k, v); } };
  saveResearch(storage, data()); assert.deepEqual(loadResearch(storage), data());
  assert.deepEqual(calls, [RESEARCH_KEY, RESEARCH_KEY]); assert.equal(map.get('mw4-progress-v1'), '{"untouched":7}');
  const previous = map.get(RESEARCH_KEY);
  assert.throws(() => saveResearch({ setItem() { throw Error('quota'); } }, data())); assert.equal(map.get(RESEARCH_KEY), previous);
  assert.throws(() => loadResearch({ getItem() { return '{invalid'; } }));
});
test('manual completion is measured per field, unknowns and checkbox ticks do not become zeros', () => {
  const target = db.attachments.find(a => !a.evidenceModifiers?.length && !a.modifiers.length && a.weaponIds.includes('m4'));
  const r = record({ attachmentId: target.id, fields: RESEARCH_FIELDS.map(metric => field({ metric, unit: (awaitMetric(metric)), value: 0, before: null, after: null, useBaseline: false })), otherEffects: 'Keine weiteren Effekte laut eigener Messreihe, Test.', otherReviewed: true });
  const row = researchRows(db, data(r)).find(x => x.attachment.id === target.id);
  assert.equal(row.missing.length, 0); assert.equal(row.complete, true);
  const ticked = researchRows(db, data(record({ attachmentId: target.id, fields: [], checklist: RESEARCH_FIELDS }))).find(x => x.attachment.id === target.id);
  assert.equal(ticked.missing.length, 11); assert.equal(ticked.complete, false);
});
function awaitMetric(k) { return { ads: 'ms', sprintToFire: 'ms', horizontalRecoil: '°/s', verticalRecoil: '°/s', gunKick: '°', range: 'm', velocity: 'm/s', movement: 'm/s', hipSpread: '°', magazine: 'Schuss', reload: 'ms' }[k]; }
test('local optimizer uses entered effects but refuses scores with missing objectives', () => {
  const hydrated = hydrateLocalResearch(db, data());
  const r = optimize(hydrated, 'm4', { useLocalResearch: true, weights: { ads: 1 } });
  assert.equal(r.status, 'local-partial'); assert.equal(r.localCandidates[0].values.ads, 270); assert.ok(r.localCandidates[0].score > 0);
  const missing = optimize(hydrated, 'm4', { useLocalResearch: true, weights: { ttk: 1 } });
  assert.equal(missing.localCandidates[0].score, null); assert.deepEqual(missing.localCandidates[0].missing, ['ttk']);
  assert.notEqual(optimize(hydrated, 'm4').status, 'optimal');
});
test('repository contributions remain separate and a local replacement does not double apply', () => {
  const published = hydrateLocalResearch(db, data(), db.patchRevision, 'repository');
  const replaced = hydrateLocalResearch(published, data(record({ fields: [field({ value: -40, after: 260 })] })));
  const c = calculateStats(replaced, 'm4', refs);
  assert.equal(c.preview.ads.value, 260);
  assert.equal(replaced.attachments.find(x => x.id === a.id).localEffects.filter(m => m.stat === 'ads').length, 1);
  assert.ok(replaced.sources.some(s => s.title.startsWith('REPOSITORY')));
});
test('inconsistent local baselines from two attachments block the affected calculation', () => {
  const second = db.attachments.find(x => x.id !== a.id && x.weaponIds.includes('m4') && x.availability === true);
  const saved = upsertResearch(data(), record({ attachmentId: second.id, fields: [field({ before: 310, after: 280 })] }));
  const c = calculateStats(hydrateLocalResearch(db, saved), 'm4', refs);
  assert.equal(c.preview.ads, undefined); assert.match(c.previewMissing.ads, /Widersprüchliche lokale Basis/);
});
test('OCR requires explicit labels and correct units and preserves original text', () => {
  const rows = parseOCRText('ADS Time 300 ms\nSprint-to-Fire 0.25 s\nMagazine 30 rounds\nMove Speed 4,5 m/s\nDamage Range 20 %\nRecoil 70\nADS Time 300 270 ms');
  assert.equal(rows.length, 5); assert.equal(rows[0].value, 300); assert.equal(rows[1].value, 250); assert.equal(rows[2].unit, 'Schuss'); assert.equal(rows[3].value, 4.5); assert.equal(rows[4].valid, false);
  assert.equal(parseOCRText('ADS Time 300')[0].valid, false);
});
test('CSV reader respects quoted semicolons, escaped quotes and newlines', () => {
  assert.deepEqual(parseCSV('\uFEFF"A";"B"\r\n"one;two";"line\n""quote"""'), [['A', 'B'], ['one;two', 'line\n"quote"']]);
  assert.throws(() => parseCSV('"unterminated'));
});
