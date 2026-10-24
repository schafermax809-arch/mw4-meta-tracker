import { hash, canonical } from "./model.mjs";
import { validateDatabase } from "../../public/engine/database.js";
import { optimize, OBJECTIVES } from "../../public/engine/optimizer.js";
export function recompute(db, patch = db.patchRevision) {
  return {
    schemaVersion: 1,
    databaseHash: hash(db),
    patchRevision: patch,
    weapons: db.weapons.map((w) => ({
      weaponId: w.id,
      objectives: Object.fromEntries(
        Object.keys(OBJECTIVES).map((goal) => [
          goal,
          optimize(db, w.id, { goal, patch }),
        ]),
      ),
    })),
  };
}
export function proposeGunsmith(
  current,
  baseline,
  docs,
  research,
  { now = new Date().toISOString(), previous = null, catalog = null } = {},
) {
  validateDatabase(current);
  const guide = docs.find((d) => d.weaponFacts?.length),
    facts = guide?.weaponFacts ?? baseline.officialWeapons;
  // Removed feed entries are not removed from history. A small RSS window is not deletion evidence.
  const observed = new Map(baseline.documents.map((d) => [d.url, d]));
  for (const d of research) observed.set(d.url, d);
  const documents = [...observed.values()].sort((a, b) =>
    a.url.localeCompare(b.url),
  );
  const changedResearch = research.filter(
    (d) => baseline.documents.find((b) => b.url === d.url)?.hash !== d.hash,
  );
  const changedFacts = facts.filter(
    (f) =>
      canonical(baseline.officialWeapons.find((w) => w.id === f.id)) !==
      canonical(f),
  );
  const sourceChanges = docs.filter(
    (d) => baseline.officialDocuments?.[d.url] !== d.hash,
  );
  const newWeapons = (catalog ?? docs.flatMap((d) => d.catalog ?? [])).filter(
    (w) => !current.weapons.some((c) => c.id === w.id),
  );
  if (
    !changedFacts.length &&
    !changedResearch.length &&
    !sourceChanges.length &&
    !newWeapons.length
  )
    return null;
  const fingerprint = hash({
    facts,
    documents,
    newWeapons,
    officialDocuments: Object.fromEntries(docs.map((d) => [d.url, d.hash])),
  });
  const at = previous?.fingerprint === fingerprint ? previous.detectedAt : now;
  const next = structuredClone(current),
    changedWeaponIds = changedFacts.map((f) => f.id);
  // Only explicit labelled numeric facts are proposed. No inferred buffs, tiers or effects.
  const changes = { weapons: [], attachments: [], community: [] };
  for (const f of changedFacts) {
    let w = next.weapons.find((w) => w.id === f.id);
    const before = w ? structuredClone(w) : null;
    if (!w) {
      const catalog = docs
        .flatMap((d) => d.catalog ?? [])
        .find((w) => w.id === f.id);
      if (!catalog) continue;
      w = {
        id: f.id,
        name: f.name,
        weaponClass: catalog.weaponClass,
        sourceIds: ["official-weapons"],
        base: {},
        rules: {
          slots: f.slots,
          maxAttachments: null,
          apexSeparate: false,
          patchRevision: null,
          sourceIds: ["official-weapons"],
          longshotDistance: null,
        },
        coverage: {
          catalogComplete: false,
          compatibilityComplete: false,
          modifiersComplete: false,
          stackingVerified: false,
          missing: ["Neue Waffe: Aufsätze, Regeln und Messwerte prüfen"],
          checkedAt: at,
        },
        damageProfile: null,
        fireModel: null,
        interactions: [],
        snapshots: [],
        notes: [],
      };
      next.weapons.push(w);
    }
    for (const [key, unit] of [
      ["rpm", "RPM"],
      ["magazine", "Schuss"],
      ["reserve", "Schuss"],
    ])
      if (f[key] !== null)
        w.base[key] = {
          value: f[key],
          unit,
          sourceIds: ["official-weapons"],
          patchRevision: current.patchRevision,
          status: "verified",
        };
    // Slot/Apex changes and ambiguous units remain explicit review findings below.
    if (canonical(before) !== canonical(w))
      changes.weapons.push({ id: w.id, before, after: structuredClone(w) });
  }
  for (const item of newWeapons) {
    if (next.weapons.some((w) => w.id === item.id)) continue;
    const w = {
      id: item.id,
      name: item.name,
      weaponClass: item.weaponClass,
      sourceIds: ["official-patch"],
      base: {},
      rules: {
        slots: [],
        maxAttachments: null,
        apexSeparate: false,
        patchRevision: null,
        sourceIds: ["official-patch"],
        longshotDistance: null,
      },
      coverage: {
        catalogComplete: false,
        compatibilityComplete: false,
        modifiersComplete: false,
        stackingVerified: false,
        missing: ["Neue Waffe: Aufsätze, Regeln und Messwerte prüfen"],
        checkedAt: at,
      },
      damageProfile: null,
      fireModel: null,
      interactions: [],
      snapshots: [],
      notes: [],
    };
    next.weapons.push(w);
    if (!changedWeaponIds.includes(w.id)) changedWeaponIds.push(w.id);
    changes.weapons.push({ id: w.id, before: null, after: structuredClone(w) });
  }
  const review = {
    schemaVersion: 1,
    fingerprint,
    detectedAt: at,
    baseHash: hash(current),
    policy: "REVIEW_REQUIRED",
    changedWeaponIds,
    weaponFacts: changedFacts,
    sourceChanges: sourceChanges.map((d) => ({
      url: d.url,
      hash: d.hash,
      signals: d.signals,
    })),
    research: changedResearch,
    manualSources: current.sources
      .filter((s) => s.automation !== "allowed")
      .map((s) => ({ url: s.url, status: s.automation, note: s.note })),
    unresolved: [
      "Neue Effekte, Verfügbarkeit, Konflikte, Longshot-Regeln und Stat-Stapelung nur mit Messbeleg freigeben.",
      "Reddit benötigt autorisierten Zugang. Kein automatischer Reddit-Abruf und kein fingierter Tagescheck.",
      "Neue Patchrevisionen machen alte Berechnungen ungültig; unveränderte Zahlen werden nicht ungeprüft neu gestempelt.",
    ],
  };
  if (changedFacts.length || newWeapons.length)
    next.history.unshift({
      at,
      patchRevision: current.patchRevision,
      summary: `${changedWeaponIds.length} neue/geänderte offizielle Waffen-Datensätze zur Prüfung.`,
      changedWeaponIds,
      changes,
    });
  validateDatabase(next);
  return {
    database: next,
    review,
    baseline: {
      schemaVersion: 1,
      officialWeapons: facts,
      officialDocuments: Object.fromEntries(docs.map((d) => [d.url, d.hash])),
      documents,
    },
    computed: recompute(next),
  };
}
