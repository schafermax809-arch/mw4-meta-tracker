import { applyOperations, blankWeapon, canonical, changesBetween, hash, validateState } from './model.mjs';

export function propose(current, docs, { now = new Date().toISOString(), previous = null, operations = [] } = {}) {
  validateState(current);
  if (!docs.length) throw new Error('No source documents');
  const documents = Object.fromEntries(Object.entries(current.documents));
  const changedDocs = docs.filter(d => current.documents[d.url]?.hash !== d.hash);
  if (!changedDocs.length && !operations.length) return null;
  for (const d of docs) documents[d.url] = { hash: d.hash, title: d.title, publishedAt: d.publishedAt, kind: d.kind, camoCandidates: d.camoCandidates ?? current.documents[d.url]?.camoCandidates ?? [] };
  const fingerprint = hash({ documents, operations });
  const at = previous?.fingerprint === fingerprint ? previous.detectedAt : now;
  let next = structuredClone(current);
  // Existing data is never overwritten by text inference. Only new explicit catalog entries are proposed.
  for (const d of changedDocs) for (const w of d.catalog) {
    const existing = next.weapons.find(old => old.id === w.id);
    if (!existing) next.weapons.push(blankWeapon(w.name, w.weaponClass, d.url));
  }
  next = applyOperations(next, operations, docs.map(d => d.url));
  const newestPatch = Object.entries(documents).filter(([, d]) => d.kind === 'patch' && d.publishedAt).sort((a, b) => b[1].publishedAt.localeCompare(a[1].publishedAt) || a[0].localeCompare(b[0]))[0];
  if (newestPatch) {
    next.patchVersion = `${newestPatch[1].title} · ${newestPatch[1].publishedAt}`;
    next.patchRevision = newestPatch[1].hash;
  }
  // Retain older verified builds; the UI marks them stale and excludes them from current Meta.
  const changes = changesBetween(current, next);
  next.documents = documents;
  next.lastSuccessfulUpdate = at;
  if (changes.length) { next.lastChangedAt = at; next.lastChangedWeaponIds = changes.map(c => c.weaponId); }
  const evidence = changedDocs.length ? changedDocs.map(d => d.url) : docs.map(d => d.url);
  next.changelog.unshift({ id: fingerprint, at, patchVersion: next.patchVersion, summary: changes.length ? `${changes.length} Waffe(n) geändert; ${changedDocs.length} Quellenrevision(en) geprüft.` : `${changedDocs.length} neue Quellenrevision(en); keine verifizierten Waffen- oder Meta-Änderungen.`, weaponChanges: changes, sourceUrls: evidence });
  validateState(next);
  const review = {
    schemaVersion: 1, fingerprint, detectedAt: at, baseStateHash: hash(current),
    policy: 'REVIEW_REQUIRED', operations,
    documents: changedDocs.map(d => ({
      url: d.url, hash: d.hash, previousHash: current.documents[d.url]?.hash ?? null, title: d.title, publishedAt: d.publishedAt, kind: d.kind, signals: d.signals, headings: d.headings,
      catalogCandidates: d.catalog.filter(w => !current.weapons.some(old => old.id === w.id)),
      catalogConflicts: d.catalog.filter(w => current.weapons.some(old => old.id === w.id && (old.name !== w.name || old.weaponClass !== w.weaponClass))),
      camoChanges: (d.camoCandidates ?? []).flatMap(c => {
        const old = current.documents[d.url]?.camoCandidates?.find(o => o.id === c.id);
        return old?.requirementsHash === c.requirementsHash ? [] : [{ ...c, change: old ? 'requirements-changed' : 'new-section', previousHash: old?.requirementsHash ?? null }];
      })
    })),
    changedWeaponIds: changes.map(c => c.weaponId),
    unresolved: ['Meta-Tiers und Aufsätze werden nicht aus Patchtexten abgeleitet.', 'Camo-Signale sind Prüfhinweise; konkrete Anforderungen nur nach Quellenprüfung eintragen.']
  };
  return { state: next, review, changed: canonical(current) !== canonical(next) };
}
