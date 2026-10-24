import { signature, configurationIssues } from "./database.js";
export function analyzeCommunity(db, weaponId, patch = db.patchRevision) {
  const records = db.community.filter((c) => c.weaponId === weaponId);
  const accepted = [],
    excluded = [];
  for (const r of records) {
    const reasons = [];
    if (r.patchRevision !== patch) reasons.push("Älterer/unbestätigter Patch");
    if (r.mode !== db.mode) reasons.push("Anderer Spielmodus");
    if (!r.reviewed) reasons.push("Quellenprüfung ausstehend");
    reasons.push(...configurationIssues(db, weaponId, r.attachments, patch));
    if (reasons.length) excluded.push({ ...r, reasons: [...new Set(reasons)] });
    else accepted.push(r);
  }
  const groups = new Map(),
    frequency = new Map();
  for (const r of accepted) {
    const key = signature(r.attachments);
    if (!groups.has(key))
      groups.set(key, {
        attachments: r.attachments,
        records: [],
        independent: new Set(),
        tests: new Set(),
        sourceIds: new Set(),
      });
    const g = groups.get(key);
    g.records.push(r);
    for (const id of r.sourceIds) {
      const s = db.sources.find((s) => s.id === id),
        ind = s.independenceGroup;
      g.independent.add(ind);
      g.sourceIds.add(id);
      if (r.testSupported && s.kind === "test") g.tests.add(ind);
      for (const a of r.attachments) {
        if (!frequency.has(a.attachmentId))
          frequency.set(a.attachmentId, new Set());
        frequency.get(a.attachmentId).add(ind);
      }
    }
  }
  const builds = [...groups.values()]
    .map((g) => ({
      attachments: g.attachments,
      sourceIds: [...g.sourceIds],
      independentSources: g.independent.size,
      testSources: g.tests.size,
      confidence:
        g.independent.size >= 2 && g.tests.size
          ? "high"
          : g.independent.size >= 2
            ? "medium"
            : "low",
      checkedAt: g.records
        .map((r) => r.checkedAt)
        .sort()
        .at(-1),
      patchRevision: patch,
    }))
    .sort(
      (a, b) =>
        b.testSources - a.testSources ||
        b.independentSources - a.independentSources ||
        signature(a.attachments).localeCompare(signature(b.attachments)),
    );
  return {
    builds,
    excluded,
    disagreement: builds.length > 1,
    recurring: [...frequency]
      .map(([attachmentId, s]) => ({
        attachmentId,
        independentSources: s.size,
      }))
      .sort((a, b) => b.independentSources - a.independentSources),
    policy:
      "Unabhängige Quellen zählen einmal. Wiederholbare Tests erhöhen die Evidenz. Stimmen/Likes werden nicht gewertet. Häufigkeit ist kein mathematischer Leistungsbeweis.",
  };
}
