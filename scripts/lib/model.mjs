import { createHash } from 'node:crypto';

export const CLASSES = ['assault-rifle', 'smg', 'shotgun', 'lmg', 'marksman', 'sniper', 'pistol', 'launcher', 'melee'];
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
export const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
export const slug = value => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const blankWeapon = (name, weaponClass, sourceUrl) => ({ id: slug(name), name, weaponClass, tier: null, tierRevision: null, builds: [], camos: [], sourceUrls: [sourceUrl] });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
function keys(value, allowed, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: object required`);
  for (const k of Object.keys(value)) assert(allowed.includes(k), `${label}: forbidden field ${k}`);
}
function str(value, label, max = 2000) { assert(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${label}: invalid string`); }
function id(value) { assert(typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,100}$/.test(value), 'Invalid stable ID'); }
function unique(values, label) { assert(new Set(values).size === values.length, `${label}: duplicate ID`); }
function urls(values) {
  assert(Array.isArray(values) && values.length > 0, 'Evidence URL required');
  for (const value of values) { const u = new URL(value); assert(u.protocol === 'https:' && !u.username && !u.password, 'HTTPS evidence required'); }
}
function date(value) { assert(typeof value === 'string' && Number.isFinite(Date.parse(value)) && /T.*Z$/.test(value), 'UTC timestamp required'); }
export function validateState(state) {
  keys(state, ['schemaVersion', 'gameId', 'patchVersion', 'patchRevision', 'lastSuccessfulUpdate', 'lastChangedAt', 'lastChangedWeaponIds', 'weapons', 'attachments', 'changelog', 'documents'], 'state');
  assert(state.schemaVersion === 1 && state.gameId === 'cod-mw4-2026', 'Wrong schema or game');
  if (state.patchVersion !== null) str(state.patchVersion, 'patchVersion');
  if (state.patchRevision !== null) assert(/^[a-f0-9]{64}$/.test(state.patchRevision), 'Invalid patch revision');
  if (state.lastSuccessfulUpdate !== null) date(state.lastSuccessfulUpdate);
  if (state.lastChangedAt !== null) date(state.lastChangedAt);
  for (const field of ['weapons', 'attachments', 'changelog', 'lastChangedWeaponIds']) assert(Array.isArray(state[field]), `${field}: array required`);
  assert(state.weapons.length <= 1000, 'Implausible weapon count');
  unique(state.weapons.map(w => w.id), 'weapons'); unique(state.attachments.map(a => a.id), 'attachments');
  const weaponIds = new Set(state.weapons.map(w => w.id));
  for (const a of state.attachments) {
    keys(a, ['id', 'name', 'slot', 'weaponIds', 'sourceUrls'], 'attachment');
    id(a.id); str(a.name, 'attachment name'); str(a.slot, 'attachment slot'); urls(a.sourceUrls);
    assert(Array.isArray(a.weaponIds) && a.weaponIds.length > 0 && a.weaponIds.every(i => weaponIds.has(i)), 'Unknown attachment weapon');
  }
  for (const w of state.weapons) {
    keys(w, ['id', 'name', 'weaponClass', 'tier', 'tierRevision', 'builds', 'camos', 'sourceUrls'], 'weapon');
    id(w.id); str(w.name, 'weapon name', 120); assert(CLASSES.includes(w.weaponClass), 'Unknown weapon class');
    assert(w.tier === null || ['S', 'A', 'B', 'C'].includes(w.tier), 'Invalid tier'); urls(w.sourceUrls);
    assert(w.tierRevision === null || /^[a-f0-9]{64}$/.test(w.tierRevision), 'Invalid tier revision');
    assert(w.tier === null || w.tierRevision !== null, 'Tier requires a verified patch revision');
    assert(Array.isArray(w.builds) && Array.isArray(w.camos), 'Builds/camos must be arrays');
    unique(w.camos.map(c => c.id), 'camos'); unique(w.builds.map(b => b.id), 'builds');
    for (const b of w.builds) {
      keys(b, ['id', 'mode', 'kind', 'attachments', 'notes', 'sourceUrls', 'patchRevision'], 'build');
      id(b.id); assert(['multiplayer', 'dmz', 'warzone'].includes(b.mode), 'Invalid build mode');
      assert(['meta', 'camo'].includes(b.kind), 'Invalid build kind'); str(b.notes, 'build notes'); urls(b.sourceUrls);
      assert(/^[a-f0-9]{64}$/.test(b.patchRevision), 'Build requires a verified patch revision');
      assert(Array.isArray(b.attachments) && b.attachments.length > 0 && b.attachments.length <= 8, 'Invalid attachment count');
      unique(b.attachments.map(a => a.slot), 'build slots');
      for (const ref of b.attachments) {
        keys(ref, ['slot', 'attachmentId'], 'attachment ref');
        assert(state.attachments.some(a => a.id === ref.attachmentId && a.slot === ref.slot && a.weaponIds.includes(w.id)), 'Incompatible/unknown attachment');
      }
    }
    for (const c of w.camos) {
      keys(c, ['id', 'name', 'mode', 'requirement', 'target', 'unit', 'dependsOn', 'sourceUrls'], 'camo');
      id(c.id); str(c.name, 'camo name'); str(c.requirement, 'camo requirement'); str(c.unit, 'camo unit'); urls(c.sourceUrls);
      assert(['multiplayer', 'dmz', 'shared'].includes(c.mode), 'Invalid camo mode');
      assert(Number.isInteger(c.target) && c.target > 0 && c.target <= 10000000, 'Invalid camo target');
      assert(Array.isArray(c.dependsOn) && c.dependsOn.every(i => i !== c.id && w.camos.some(other => other.id === i)), 'Invalid camo prerequisite');
    }
    const visit = (c, path = new Set()) => { assert(!path.has(c.id), 'Cyclic camo prerequisites'); for (const dep of c.dependsOn) visit(w.camos.find(x => x.id === dep), new Set([...path, c.id])); };
    w.camos.forEach(c => visit(c));
  }
  assert(state.lastChangedWeaponIds.every(i => weaponIds.has(i)), 'Unknown changed weapon');
  keys(state.documents, Object.keys(state.documents), 'documents');
  for (const [url, doc] of Object.entries(state.documents)) {
    urls([url]); keys(doc, ['hash', 'title', 'publishedAt', 'kind', 'camoCandidates'], 'document');
    assert(/^[a-f0-9]{64}$/.test(doc.hash), 'Invalid document hash'); str(doc.title, 'document title');
    if (doc.publishedAt !== null) assert(/^\d{4}-\d{2}-\d{2}$/.test(doc.publishedAt) && Number.isFinite(Date.parse(doc.publishedAt)), 'Invalid publication date');
    assert(['patch', 'guide'].includes(doc.kind), 'Invalid document kind');
    if (doc.camoCandidates !== undefined) {
      assert(Array.isArray(doc.camoCandidates), 'Invalid Camo discovery baseline'); unique(doc.camoCandidates.map(c => c.id), 'Camo discovery');
      for (const c of doc.camoCandidates) { keys(c, ['id', 'name', 'requirementsHash'], 'Camo candidate'); id(c.id); str(c.name, 'Camo candidate name', 150); assert(/^[a-f0-9]{64}$/.test(c.requirementsHash), 'Invalid Camo requirements hash'); }
    }
  }
  unique(state.changelog.map(e => e.id), 'changelog');
  for (const e of state.changelog) {
    keys(e, ['id', 'at', 'patchVersion', 'summary', 'weaponChanges', 'sourceUrls'], 'changelog entry');
    str(e.id, 'changelog ID'); date(e.at); str(e.summary, 'summary'); urls(e.sourceUrls);
    assert(e.patchVersion === null || typeof e.patchVersion === 'string', 'Invalid changelog patch');
    assert(Array.isArray(e.weaponChanges), 'weaponChanges must be array');
    for (const c of e.weaponChanges) {
      keys(c, ['weaponId', 'fields', 'before', 'after'], 'weapon change');
      assert(weaponIds.has(c.weaponId) && Array.isArray(c.fields), 'Invalid weapon change');
      // Full historic records remain available even if a later patch changes the catalog.
      assert(c.after?.id === c.weaponId && (c.before === null || c.before?.id === c.weaponId), 'Invalid historic record');
    }
  }
  return state;
}

// Only named catalog fields can cross the update boundary. Personal state has no representation here.
export function applyOperations(current, operations, evidenceUrls) {
  assert(Array.isArray(operations), 'operations must be array');
  const next = structuredClone(current);
  for (const op of operations) {
    keys(op, ['type', 'value'], 'operation');
    assert(['upsert-weapon', 'upsert-attachment'].includes(op.type), 'Unsupported operation (deletion/progress forbidden)');
    const list = op.type === 'upsert-weapon' ? next.weapons : next.attachments;
    assert(op.value && typeof op.value === 'object', 'Operation value required');
    urls(op.value.sourceUrls);
    assert(op.value.sourceUrls.every(url => evidenceUrls.includes(url)), 'Operation lacks fetched source evidence');
    const index = list.findIndex(item => item.id === op.value.id);
    if (index < 0) list.push(structuredClone(op.value)); else list[index] = structuredClone(op.value);
  }
  return next;
}

export function changesBetween(before, after) {
  return after.weapons.flatMap(w => {
    const old = before.weapons.find(o => o.id === w.id) ?? null;
    const fields = Object.keys(w).filter(k => canonical(old?.[k] ?? null) !== canonical(w[k]));
    return fields.length ? [{ weaponId: w.id, fields, before: old, after: w }] : [];
  });
}
