import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blankWeapon, validateState, hash, applyOperations, canonical } from '../scripts/lib/model.mjs';
import { propose } from '../scripts/lib/update.mjs';
import { parseArticle, extractLinks, createFetcher, collect } from '../scripts/lib/sources.mjs';
import { atomicJson } from '../scripts/lib/io.mjs';
import { loadProgress, saveProgress, validateProgress, progressPercent, PROGRESS_KEY } from '../public/progress.js';

const url = 'https://www.callofduty.com/patchnotes/2026/10/call-of-duty-modern-warfare-4-test';
const now = '2026-10-24T12:00:00.000Z';
const doc = () => ({ url, title: 'Modern Warfare 4 Patch Notes', hash: hash('patch-1'), kind: 'patch', publishedAt: '2026-10-23', catalog: [], headings: ['Weapons'], signals: { weapons: true, camos: true, builds: true } });
function empty() { return { schemaVersion: 1, gameId: 'cod-mw4-2026', patchVersion: null, patchRevision: null, lastSuccessfulUpdate: null, lastChangedAt: null, lastChangedWeaponIds: [], weapons: [], attachments: [], documents: {}, changelog: [] }; }
function initial() { return propose(empty(), [{ ...doc(), catalog: [{ name: 'Test Rifle', weaponClass: 'assault-rifle', id: 'test-rifle' }] }], { now }).state; }
function html(body, title = 'Modern Warfare 4 Patch Notes') { return `<main><h1>${title}</h1><p class="dateline">October 23, 2026</p><div class="article-body-container">${body}<p>${'Developer update. '.repeat(20)}</p></div></main>`; }

test('published catalog passes strict validation', async () => { validateState(JSON.parse(await readFile(new URL('../public/data/meta.json', import.meta.url), 'utf8'))); });
test('same sources produce no candidate and never mutate the current state', () => {
  const current = initial(); const bytes = canonical(current); const result = propose(current, [doc()], { now: '2026-10-25T12:00:00.000Z' });
  assert.equal(result, null); assert.equal(canonical(current), bytes);
});
test('new weapon is proposed with unknown meta and no fabricated camos/builds', () => {
  const current = initial(); const revised = { ...doc(), hash: hash('patch-2'), catalog: [{ id: 'new-rifle', name: 'New Rifle', weaponClass: 'assault-rifle' }] };
  const result = propose(current, [revised], { now });
  assert.equal(current.weapons.length, 1); assert.equal(result.state.weapons.length, 2);
  const weapon = result.state.weapons[1]; assert.equal(weapon.tier, null); assert.deepEqual(weapon.builds, []); assert.deepEqual(weapon.camos, []);
  assert.deepEqual(result.state.lastChangedWeaponIds, ['new-rifle']); assert.equal(result.review.policy, 'REVIEW_REQUIRED');
});
test('changed source text cannot overwrite an existing weapon', () => {
  const current = initial(); current.weapons[0].tier = 'S'; current.weapons[0].tierRevision = current.patchRevision;
  const result = propose(current, [{ ...doc(), hash: hash('patch-2'), catalog: [{ id: 'test-rifle', name: 'Different name', weaponClass: 'pistol' }] }], { now });
  assert.deepEqual(result.state.weapons[0], current.weapons[0]); assert.equal(result.state.changelog[0].weaponChanges.length, 0);
});
test('an unchanged repeated pending proposal has byte-identical output', () => {
  const current = initial(); const docs = [{ ...doc(), hash: hash('patch-2') }];
  const first = propose(current, docs, { now }); const second = propose(current, docs, { now: '2026-10-25T12:00:00.000Z', previous: first.review });
  assert.deepEqual(second, first);
});
test('revision-only update does not claim weapons changed on the new date', () => {
  const current = initial(); const result = propose(current, [{ ...doc(), hash: hash('patch-2') }], { now: '2026-10-25T12:00:00.000Z' });
  assert.equal(result.state.lastChangedAt, current.lastChangedAt); assert.deepEqual(result.state.lastChangedWeaponIds, current.lastChangedWeaponIds);
  assert.equal(result.state.changelog[0].weaponChanges.length, 0);
});
test('a tier/build/camo review records complete before and after values', () => {
  const current = initial(); const updated = structuredClone(current.weapons[0]); updated.tier = 'A'; updated.tierRevision = current.patchRevision;
  updated.camos = [{ id: 'sample-camo', name: 'Test Camo', mode: 'multiplayer', requirement: 'Test requirement only', target: 50, unit: 'Kills', dependsOn: [], sourceUrls: [url] }];
  const result = propose(current, [doc()], { now, operations: [{ type: 'upsert-weapon', value: updated }] });
  assert.equal(result.state.changelog[0].weaponChanges[0].before.tier, null); assert.equal(result.state.changelog[0].weaponChanges[0].after.tier, 'A');
  assert(result.state.changelog[0].weaponChanges[0].fields.includes('camos'));
});
test('metadata cannot change personal progress or accept delete operations', () => {
  const s = initial(); s.progress = { done: true }; assert.throws(() => validateState(s), /forbidden field progress/);
  const c = initial(); c.weapons[0].completed = true; assert.throws(() => validateState(c), /forbidden field completed/);
  assert.throws(() => applyOperations(initial(), [{ type: 'delete-weapon', value: {} }], [url]), /Unsupported/);
});
test('operations require source provenance', () => {
  assert.throws(() => applyOperations(initial(), [{ type: 'upsert-weapon', value: blankWeapon('Other', 'pistol', 'https://example.com/unverified') }], [url]), /lacks fetched source/);
});
test('duplicate IDs, invalid targets and dependency cycles fail validation', () => {
  const duplicate = initial(); duplicate.weapons.push(duplicate.weapons[0]); assert.throws(() => validateState(duplicate), /duplicate/);
  const s = initial(); const c = { id: 'test', name: 'Test', mode: 'shared', requirement: 'Test', target: 0, unit: 'Kills', dependsOn: [], sourceUrls: [url] }; s.weapons[0].camos.push(c);
  assert.throws(() => validateState(s), /target/); c.target = 1; c.dependsOn = ['other']; s.weapons[0].camos.push({ ...c, id: 'other', dependsOn: ['test'] });
  assert.throws(() => validateState(s), /Cyclic/);
});
test('invalid attachment compatibility is rejected', () => {
  const s = initial(); s.attachments.push({ id: 'optic', name: 'Test optic', slot: 'optic', weaponIds: ['test-rifle'], sourceUrls: [url] });
  s.weapons[0].builds.push({ id: 'meta', mode: 'multiplayer', kind: 'meta', notes: 'Test build', sourceUrls: [url], patchRevision: s.patchRevision, attachments: [{ slot: 'muzzle', attachmentId: 'optic' }] });
  assert.throws(() => validateState(s), /Incompatible/);
});
test('new patch retains old build evidence without relabeling it current', () => {
  const s = initial(); s.attachments.push({ id: 'optic', name: 'Test optic', slot: 'optic', weaponIds: ['test-rifle'], sourceUrls: [url] });
  s.weapons[0].builds.push({ id: 'meta', mode: 'multiplayer', kind: 'meta', notes: 'Test build', sourceUrls: [url], patchRevision: s.patchRevision, attachments: [{ slot: 'optic', attachmentId: 'optic' }] });
  const next = propose(s, [{ ...doc(), hash: hash('next') }], { now }).state;
  assert.notEqual(next.weapons[0].builds[0].patchRevision, next.patchRevision); assert.deepEqual(next.weapons[0].builds, s.weapons[0].builds);
});
test('parser isolates article content and correctly parses publication date in every timezone', () => {
  const a = parseArticle(html('<p><b>ASSAULT RIFLES</b></p><ul><li>Test Rifle</li></ul>'), url);
  const b = parseArticle(html('<p><b>ASSAULT RIFLES</b></p><ul><li>Test Rifle</li></ul>') + '<footer>Random footer 123</footer>', url);
  assert.equal(a.hash, b.hash); assert.equal(a.publishedAt, '2026-10-23'); assert.equal(a.catalog[0].weaponClass, 'assault-rifle');
});
test('parser rejects wrong games and changed layouts', () => {
  assert.throws(() => parseArticle(html('Data', 'Warzone patch notes'), url), /Wrong game/);
  assert.throws(() => parseArticle('<h1>Modern Warfare 4</h1>', url), /layout changed/);
});
test('new Camo sections and changed challenge requirements become separate review findings', () => {
  const first = parseArticle(html('<h3>Gold Camo</h3><p>Test requirement 50 kills.</p>'), url);
  const base = propose(empty(), [first], { now }).state;
  const revised = parseArticle(html('<h3>Gold Camo</h3><p>Test requirement 60 kills.</p><h3>New Event Camo</h3><p>Test event requirement.</p>'), url);
  const result = propose(base, [revised], { now });
  const changes = result.review.documents[0].camoChanges;
  assert.equal(changes.find(c => c.id === 'gold-camo').change, 'requirements-changed');
  assert.equal(changes.find(c => c.id === 'new-event-camo').change, 'new-section');
  assert.equal(base.weapons.length, 0); assert.equal(result.state.weapons.length, 0);
});
test('Camo discovery baseline detects unchanged definitions without false additions', () => {
  const first = parseArticle(html('<h3>Gold Camo</h3><p>Test requirement.</p>'), url);
  const base = propose(empty(), [first], { now }).state;
  const revised = { ...first, hash: hash('unrelated-content-change') };
  const result = propose(base, [revised], { now });
  assert.deepEqual(result.review.documents[0].camoChanges, []);
});
test('discovery rejects foreign origins and other games', () => {
  const links = extractLinks(`<a href="${url}">MW4</a><a href="https://evil.example/blog/modern-warfare-4">foreign</a><a href="/patchnotes/2026/10/black-ops-7">BO7</a>`, url, ['https://www.callofduty.com']);
  assert.deepEqual(links, [url]);
});
const config = () => ({ allowedOrigins: ['https://www.callofduty.com'], timeoutMs: 500, maxBytes: 10000, requestDelayMs: 0, indexes: [], articles: [url], maxArticles: 10, discoveryFrom: '2026-10' });
test('robots disallow stops the source fetch', async () => {
  const calls = []; const fetcher = createFetcher(config(), async u => { calls.push(u); return new Response('User-agent: *\nDisallow: /'); });
  await assert.rejects(fetcher(url), /robots.txt/); assert.equal(calls.length, 1);
});
test('redirects, oversized responses, forbidden hosts and source outages fail closed', async () => {
  for (const response of [() => new Response('', { status: 302, headers: { location: 'https://evil.example' } }), () => new Response('x'.repeat(10001)), () => new Response('Forbidden', { status: 403 })]) {
    const fetcher = createFetcher(config(), async u => u.endsWith('/robots.txt') ? new Response('User-agent: *\nAllow: /') : response());
    await assert.rejects(fetcher(url));
  }
  await assert.rejects(createFetcher(config())('https://evil.example/robots.txt'), /allowlist/);
  await assert.rejects(collect(config(), async () => { throw new Error('Network outage'); }), /Network outage/);
});
test('empty discovery cannot masquerade as a successful daily check', async () => {
  await assert.rejects(collect({ ...config(), indexes: ['https://www.callofduty.com/patchnotes'] }, async () => '<p>New layout</p>'), /No MW4 links/);
});
test('atomic data publication leaves valid JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mw4-meta-test-'));
  try { const path = join(dir, 'meta.json'); await writeFile(path, '{"old":true}'); await atomicJson(path, initial()); validateState(JSON.parse(await readFile(path, 'utf8'))); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
test('personal progress survives source changes, corrected targets and new weapons byte-for-byte', () => {
  const storage = new Map(); const api = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  saveProgress(api, { schemaVersion: 1, entries: { 'test-rifle:sample-camo': 35, 'retired-weapon:historic-camo': 12 } });
  const bytes = storage.get(PROGRESS_KEY);
  propose(initial(), [{ ...doc(), hash: hash('patch-3'), catalog: [{ name: 'New', id: 'new', weaponClass: 'pistol' }] }], { now });
  assert.equal(storage.get(PROGRESS_KEY), bytes); assert.equal(loadProgress(api).entries['test-rifle:sample-camo'], 35);
  assert.equal(progressPercent(35, 50), 70); assert.equal(progressPercent(35, 20), 100);
});
test('invalid progress import is rejected without touching saved data', () => {
  assert.throws(() => validateProgress({ schemaVersion: 1, entries: { 'test:camo': -1 } }));
  assert.throws(() => validateProgress({ schemaVersion: 1, entries: [], unexpected: 'field' }));
});
