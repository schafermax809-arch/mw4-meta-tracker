import { METRICS } from './database.js';

// These are exactly the explicit fields in mw4-aufsatz-pruefbericht.csv.
// Documentation coverage is deliberately distinct from independent verification.
export const RESEARCH_FIELDS = ['ads', 'sprintToFire', 'horizontalRecoil', 'verticalRecoil', 'gunKick', 'range', 'velocity', 'movement', 'hipSpread', 'magazine', 'reload'];
export const RESEARCH_KEY = 'mw4-local-research-v1';
export const RESEARCH_STATUSES = { draft: 'Entwurf', reported: 'Quelle übertragen', measured: 'Selbst gemessen', crosschecked: 'Mit zweiter Quelle abgeglichen (lokale Angabe)' };
export const MODELS = { unknown: 'Unbekannt', add: 'Absolute Änderung', percent: 'Prozentänderung', factor: 'Multiplikator', set: 'Absoluter Endwert' };
const fail = (ok, message) => { if (!ok) throw Error(message); };
const exact = (v, keys) => fail(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => keys.includes(k)), 'Unbekannte oder unzulässige Datenfelder');
const str = (v, max = 2000) => typeof v === 'string' && v.length <= max;
const id = v => typeof v === 'string' && /^[a-z0-9-]{1,100}$/.test(v);
const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const num = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 10000000;
export const emptyResearch = () => ({ schemaVersion: 1, gameId: 'cod-mw4-2026', mode: 'multiplayer', records: [] });
export const recordKey = r => `${r.weaponId}/${r.attachmentId}`;
export function comparison(before, after) {
  fail(num(before) && num(after) && before >= 0 && after >= 0, 'Vorher/Nachher müssen nichtnegative Zahlen sein');
  return { absolute: after - before, percent: before === 0 ? null : (after / before - 1) * 100, factor: before === 0 ? null : after / before, model: 'unknown' };
}
export function validateResearch(data) {
  exact(data, ['schemaVersion', 'gameId', 'mode', 'records']);
  fail(data.schemaVersion === 1 && data.gameId === 'cod-mw4-2026' && data.mode === 'multiplayer' && Array.isArray(data.records) && data.records.length <= 10000, 'Falsches Spiel, Modus oder Format');
  const records = new Set();
  for (const r of data.records) {
    exact(r, ['weaponId', 'attachmentId', 'patchRevision', 'updatedAt', 'fields', 'otherEffects', 'otherReviewed', 'checklist']);
    fail(id(r.weaponId) && id(r.attachmentId) && /^[a-f0-9]{64}$/.test(r.patchRevision) && Number.isFinite(Date.parse(r.updatedAt)) && !records.has(recordKey(r)), 'Doppelte oder ungültige Aufsatzzuordnung');
    records.add(recordKey(r));
    fail(Array.isArray(r.fields) && r.fields.length <= 80 && str(r.otherEffects, 10000) && typeof r.otherReviewed === 'boolean' && Array.isArray(r.checklist) && new Set(r.checklist).size === r.checklist.length && r.checklist.every(k => RESEARCH_FIELDS.includes(k)), 'Ungültige Checkliste / Effekte');
    fail(!r.otherReviewed || r.otherEffects.trim().length >= 3, 'Sonstige Effekte mit Quelle dokumentieren oder „keine“ ausdrücklich begründen');
    const fields = new Set();
    for (const f of r.fields) {
      exact(f, ['metric', 'model', 'value', 'unit', 'before', 'after', 'status', 'source', 'secondSource', 'date', 'note', 'replacePublished', 'useBaseline']);
      fail(Object.hasOwn(METRICS, f.metric) && f.metric !== 'ttk' && !fields.has(f.metric), 'Unbekannter oder doppelter Messwert');
      fields.add(f.metric);
      fail(Object.hasOwn(MODELS, f.model) && Object.hasOwn(RESEARCH_STATUSES, f.status), 'Ungültiges Rechenmodell / Status');
      const unit = ['percent', 'factor'].includes(f.model) ? (f.model === 'percent' ? '%' : 'factor') : METRICS[f.metric][1];
      fail(f.unit === unit, `Falsche Einheit für ${f.metric}: ${unit} erwartet`);
      fail(f.value === null ? f.model === 'unknown' : num(f.value), 'Ungültiger Zahlenwert');
      if (f.value !== null) fail(f.model === 'factor' || f.model === 'set' ? f.value >= 0 : f.model !== 'percent' || f.value >= -100, 'Ungültiger Faktor / Endwert / Prozentwert');
      if (f.metric === 'magazine' && ['set', 'add'].includes(f.model) && f.value !== null) fail(Number.isInteger(f.value), 'Magazinkapazität in ganzen Schuss eintragen');
      fail((f.before === null || num(f.before) && f.before >= 0) && (f.after === null || num(f.after) && f.after >= 0), 'Ungültige Messung');
      fail((f.before === null) === (f.after === null), 'Vorher und Nachher gemeinsam eintragen');
      fail(str(f.source) && f.source.trim().length >= 3 && str(f.secondSource) && str(f.note) && day(f.date), 'Quelle und gültiges Messdatum sind erforderlich');
      for (const s of [f.source, f.secondSource]) if (/^[a-z][a-z0-9+.-]*:/i.test(s)) fail(/^https:\/\//i.test(s) && !new URL(s).username && !new URL(s).password, 'Quellenlinks müssen sichere HTTPS-Adressen sein');
      fail(f.status !== 'crosschecked' || f.secondSource.trim().length >= 3 && f.secondSource.trim() !== f.source.trim(), 'Zweite unterschiedliche Quelle erforderlich');
      fail(typeof f.replacePublished === 'boolean' && typeof f.useBaseline === 'boolean' && (!f.useBaseline || f.before !== null), 'Ungültige lokale Übernahmeoption');
      if (f.before !== null && f.model !== 'unknown' && f.value !== null) {
        const c = comparison(f.before, f.after);
        const expected = f.model === 'add' ? c.absolute : f.model === 'percent' ? c.percent : f.model === 'factor' ? c.factor : f.after;
        fail(expected !== null && Math.abs(expected - f.value) <= 0.0001 * Math.max(1, Math.abs(expected)), 'Effekt widerspricht der Vorher-/Nachher-Messung');
      }
    }
  }
  return data;
}
export function loadResearch(storage) {
  const raw = storage.getItem(RESEARCH_KEY);
  if (raw && raw.length > 15000000) throw Error('Recherchedatei zu groß');
  return raw ? validateResearch(JSON.parse(raw)) : emptyResearch();
}
export function saveResearch(storage, data) {
  validateResearch(data);
  const text = JSON.stringify(data);
  fail(text.length <= 15000000, 'Recherchedatei zu groß');
  storage.setItem(RESEARCH_KEY, text);
  return data;
}
export function upsertResearch(data, record) {
  const next = structuredClone(data), i = next.records.findIndex(r => recordKey(r) === recordKey(record));
  if (i < 0) next.records.push(record); else next.records[i] = record;
  return validateResearch(next);
}
// Merging never replaces an existing local record implicitly.
export function mergeResearch(current, incoming, choices = {}) {
  validateResearch(current); validateResearch(incoming);
  let next = structuredClone(current);
  for (const r of incoming.records) {
    const old = next.records.find(x => recordKey(x) === recordKey(r));
    if (!old || choices[recordKey(r)] === 'replace') next = upsertResearch(next, r);
  }
  return next;
}
export function publishedEffects(a, metric, patch, weaponId = null) {
  return [...a.modifiers.filter(m => m.patchRevision === patch), ...(a.evidence?.patchRevision === patch ? a.evidenceModifiers ?? [] : []), ...(a.localEffects ?? []).filter(m => m.patchRevision === patch && (!m.conflict || m.replacePublished) && (!weaponId || m.weaponId === weaponId))].filter(m => m.stat === metric);
}
export function localOperation(f) {
  if (f.status === 'draft' || f.model === 'unknown' || f.value === null) return null;
  return { stat: f.metric, operation: f.model === 'set' ? 'set' : ['factor', 'percent'].includes(f.model) ? 'multiply' : 'add', value: f.model === 'percent' ? 1 + f.value / 100 : f.value, unit: ['factor', 'percent'].includes(f.model) ? 'factor' : f.unit };
}
export function fieldConflict(a, f, patch) {
  const m = localOperation(f), old = publishedEffects(a, f.metric, patch);
  return !!m && old.some(x => x.operation !== m.operation || Math.abs(x.value - m.value) > 1e-8);
}
export function researchRows(db, data, patch = db.patchRevision) {
  const saved = new Map(data.records.map(r => [recordKey(r), r]));
  return db.weapons.flatMap(w => db.attachments.filter(a => a.weaponIds.includes(w.id)).map(a => {
    const r = saved.get(`${w.id}/${a.id}`), current = r?.patchRevision === patch;
    const conflicts = current ? r.fields.filter(f => fieldConflict(a, f, patch)) : [];
    const documented = RESEARCH_FIELDS.filter(k => publishedEffects(a, k, patch, w.id).length || (current && r.fields.some(f => f.metric === k && localOperation(f) && (!fieldConflict(a, f, patch) || f.replacePublished))));
    const missing = RESEARCH_FIELDS.filter(k => !documented.includes(k));
    const status = r && !current ? 'stale' : conflicts.length || a.compatibilityConflict || a.modifierConflicts?.length ? 'conflict' : !missing.length && (r?.otherReviewed || a.effectsComplete) ? 'complete' : current && r.fields.length ? 'local' : documented.length ? 'partial' : 'missing';
    const complete = !missing.length && !!(current && r?.otherReviewed || a.effectsComplete) && !conflicts.some(f => !f.replacePublished) && !a.compatibilityConflict;
    return { weapon: w, attachment: a, record: r, missing, documented, conflicts, status: complete ? 'complete' : status, complete };
  }));
}
export function hydrateLocalResearch(database, data, patch = database.patchRevision, scope = 'local') {
  validateResearch(data);
  const db = structuredClone(database);
  const summary = { count: data.records.length, active: 0, inactive: [], conflicts: [], records: structuredClone(data.records) };
  if (scope === 'repository') db.repositoryResearch = summary; else db.localResearch = summary;
  // An attachment may be shared across weapons. Split it per selected weapon
  // without changing stable IDs: calculator resolves a weapon-specific overlay.
  for (const r of data.records) {
    const w = db.weapons.find(w => w.id === r.weaponId), a = db.attachments.find(a => a.id === r.attachmentId && a.weaponIds.includes(r.weaponId));
    if (!w || !a || r.patchRevision !== patch) { summary.inactive.push(recordKey(r)); continue; }
    summary.active++;
    for (const [index, f] of r.fields.entries()) {
      const m = localOperation(f);
      if (!m) continue;
      const sourceId = `${scope}-${r.weaponId}-${index}-${summary.active}`;
      const conflict = fieldConflict(a, f, patch);
      db.sources.push({ id: sourceId, title: (scope === 'repository' ? 'REPOSITORY · manuell beigetragen · ' : 'LOKAL · ') + RESEARCH_STATUSES[f.status] + ' · ' + f.source, url: /^https:\/\//.test(f.source) ? f.source : null, kind: 'local', checkedAt: r.updatedAt, publishedAt: f.date, note: f.note, automation: 'manual', independenceGroup: 'local-user' });
      if (conflict) summary.conflicts.push({ weaponId: w.id, attachmentId: a.id, metric: f.metric, resolvedLocally: f.replacePublished });
      // Applied by calculateStats, not inserted into published modifiers.
      if (f.replacePublished) a.localEffects = (a.localEffects ?? []).filter(old => old.weaponId !== w.id || old.stat !== f.metric);
      (a.localEffects ??= []).push({ ...m, weaponId: w.id, sourceIds: [sourceId], patchRevision: patch, order: 0, status: 'reported', scope, replacePublished: f.replacePublished, conflict });
      if (f.useBaseline && f.before !== null) {
        (w.localBaselines ??= {})[f.metric] ??= [];
        if (f.replacePublished) w.localBaselines[f.metric] = w.localBaselines[f.metric].filter(b => b.recordKey !== recordKey(r));
        w.localBaselines[f.metric].push({ value: f.before, unit: METRICS[f.metric][1], sourceIds: [sourceId], status: 'reported', patchRevision: patch, replacePublished: f.replacePublished, recordKey: recordKey(r), scope });
      }
    }
  }
  return db;
}
