import { METRICS, configurationIssues, signature } from "./database.js";
import { calculateStats, timeToKill } from "./calculator.js";
import { analyzeCommunity } from "./community.js";
export const OBJECTIVES = {
  meta: {
    ttk: 25,
    horizontalRecoil: 15,
    verticalRecoil: 15,
    ads: 15,
    movement: 10,
    range: 10,
    reload: 10,
  },
  longshot: {
    range: 25,
    velocity: 20,
    horizontalRecoil: 15,
    verticalRecoil: 15,
    stability: 15,
    zoom: 10,
  },
  headshot: {
    horizontalRecoil: 25,
    verticalRecoil: 25,
    stability: 20,
    recenter: 20,
    ads: 10,
  },
  hipfire: { hipSpread: 40, sprintToFire: 20, movement: 20, ttk: 20 },
  multikill: {
    magazine: 30,
    reload: 25,
    movement: 15,
    horizontalRecoil: 10,
    verticalRecoil: 10,
    ads: 10,
  },
};
export function objectiveWeights(goal, weaponClass) {
  const weights = structuredClone(OBJECTIVES[goal] ?? OBJECTIVES.meta);
  if (goal === "meta") {
    if (["smg", "pistol", "shotgun"].includes(weaponClass)) {
      weights.movement += 10;
      weights.sprintToFire = 10;
      weights.range = 5;
    }
    if (["sniper", "marksman"].includes(weaponClass)) {
      weights.stability = 15;
      weights.ads += 10;
    }
    if (weaponClass === "lmg") {
      weights.reload += 10;
      weights.magazine = 10;
    }
  }
  return weights; // UI preference policy, not game balance data.
}
export function optimize(
  db,
  weaponId,
  {
    goal = "meta",
    weights = null,
    patch = db.patchRevision,
    exhaustiveLimit = 100000,
    beamWidth = 160,
    maxEvaluations = 200000,
    context = {},
    allowApex = true,
  } = {},
) {
  const w = db.weapons.find((w) => w.id === weaponId);
  if (!w) throw new Error("Unknown weapon");
  weights = weights ?? objectiveWeights(goal, w.weaponClass);
  if (
    Object.entries(weights).some(
      ([k, v]) => !METRICS[k] || !Number.isFinite(v) || v < 0,
    ) ||
    !Object.values(weights).some((v) => v > 0)
  )
    throw new Error("Ungültige Gewichtung");
  if (
    !Number.isInteger(beamWidth) ||
    beamWidth < 1 ||
    beamWidth > 1000 ||
    !Number.isInteger(maxEvaluations) ||
    maxEvaluations < 1 ||
    maxEvaluations > 1000000 ||
    !Number.isInteger(exhaustiveLimit) ||
    exhaustiveLimit < 1
  )
    throw new Error("Ungültiges Suchbudget");
  const unavailable = (reasons) => {
    const builds = db.communityValues
      ? analyzeCommunity(db, weaponId, patch).builds.filter(
          (b) => allowApex || !b.attachments.some((a) => a.slot === "Apex"),
        )
      : [];
    const patterns = {
      meta: /balanced|meta|versatile/i,
      longshot: /long|distance|distanz/i,
      headshot: /precision|accuracy|head/i,
      hipfire: /hip|close/i,
      multikill: /magazine|multikill|sustain/i,
    };
    const pattern = patterns[goal] ?? null;
    const ranked = builds
      .map((b) => {
        const notes = db.community
          .filter(
            (c) =>
              c.weaponId === weaponId &&
              signature(c.attachments) === signature(b.attachments),
          )
          .map((c) => c.note)
          .join(" ");
        return {
          ...b,
          title: notes,
          goalMatch: pattern?.test(b.label ?? "") ?? false,
        };
      })
      .sort(
        (a, b) =>
          Number(b.goalMatch) - Number(a.goalMatch) ||
          b.independentSources - a.independentSources,
      );
    return {
      status: ranked.length ? "source-based" : "unavailable",
      sourceBuild: ranked[0] ?? null,
      reasons,
      results: [],
      evaluated: 0,
      algorithm: null,
      patchRevision: patch,
      policy:
        "Quellenempfehlung anhand des veröffentlichten Einsatzzwecks und unabhängiger Quellen. Numerische Slider-Gewichte werden ohne vollständige Aufsatz-Messwerte nicht ausgewertet. Keine mathematische Optimalitätsbehauptung.",
    };
  };
  if (w.rules.patchRevision !== patch || w.rules.maxAttachments === null)
    return unavailable(["Patchaktuelle Slot-Regeln oder Aufsatzlimit fehlen"]);
  if (db.effectEvidence && w.rules.maxAttachments === 0)
    return unavailable([
      "Diese Waffe besitzt laut offizieller Übersicht keine Gunsmith-Aufsatzslots.",
    ]);
  if (db.effectEvidence && !w.coverage.stackingVerified)
    return unavailable([
      "Keine zuverlässige mathematische Optimierung möglich: Einzelwirkungen wurden recherchiert, aber vollständige Effekte, Stapelregeln und Wechselwirkungen sind nicht verifiziert. Community-Builds bleiben getrennte Empfehlungen.",
    ]);
  if (goal === "longshot" && w.rules.longshotDistance?.patchRevision !== patch)
    return unavailable([
      "Die tatsächliche Longshot-Distanz dieser Klasse ist nicht verifiziert",
    ]);
  const required = Object.keys(weights).filter((k) => weights[k] > 0),
    total = Object.values(weights).reduce((a, b) => a + b, 0);
  const evaluate = (refs) => {
    const c = calculateStats(db, weaponId, refs, patch);
    if (c.issues.length) return null;
    const values = Object.fromEntries(
      Object.entries(c.values).map(([k, v]) => [k, v.value]),
    );
    if (required.includes("ttk")) {
      const t = timeToKill(db, weaponId, refs, context, patch);
      if (t.available) values.ttk = t.ms;
    }
    return required.every(
      (k) =>
        Number.isFinite(values[k]) &&
        (k === "ttk" || c.values[k]?.status === "verified"),
    )
      ? { attachments: structuredClone(refs), values }
      : null;
  };
  const base = evaluate([]);
  if (!base)
    return unavailable([
      "Für diese Gewichtung fehlen verifizierte Basiswerte: " +
        required
          .filter((k) => !w.base[k] && k !== "ttk")
          .map((k) => METRICS[k][0])
          .join(", "),
      ...(required.includes("ttk")
        ? [timeToKill(db, weaponId, [], context, patch).reason].filter(Boolean)
        : []),
    ]);
  const score = (r) =>
    required.reduce(
      (s, k) =>
        s +
        ((weights[k] / total) *
          METRICS[k][2] *
          (r.values[k] - base.values[k])) /
          Math.max(Math.abs(base.values[k]), 1e-9),
      0,
    );
  const available = db.attachments.filter(
    (a) =>
      a.weaponIds.includes(weaponId) &&
      a.availability === true &&
      a.patchRevision === patch &&
      (allowApex || a.slot !== "Apex"),
  );
  const slots = [...new Set(available.map((a) => a.slot))].sort();
  const choices = slots.map((slot) => [
    null,
    ...available
      .filter((a) => a.slot === slot)
      .sort((a, b) => a.id.localeCompare(b.id)),
  ]);
  const estimate = choices.reduce(
    (n, c) => Math.min(Number.MAX_SAFE_INTEGER, n * c.length),
    1,
  );
  let evaluated = 0,
    unknown = 0,
    invalid = 0,
    truncated = false;
  const best = [];
  const seen = new Set();
  const inspect = (refs) => {
    if (evaluated >= maxEvaluations) {
      truncated = true;
      return null;
    }
    const key = signature(refs);
    if (seen.has(key)) return null;
    seen.add(key);
    evaluated++;
    if (configurationIssues(db, weaponId, refs, patch).length) {
      invalid++;
      return null;
    }
    const r = evaluate(refs);
    if (!r) {
      unknown++;
      return null;
    }
    r.score = score(r);
    best.push(r);
    best.sort(
      (a, b) =>
        b.score - a.score ||
        a.attachments.length - b.attachments.length ||
        signature(a.attachments).localeCompare(signature(b.attachments)),
    );
    if (best.length > 20) best.length = 20;
    return r;
  };
  const algorithm = estimate <= exhaustiveLimit ? "exhaustive" : "beam";
  if (algorithm === "exhaustive") {
    const walk = (i, refs) => {
      if (truncated) return;
      if (i === choices.length) {
        inspect(refs);
        return;
      }
      for (const a of choices[i]) {
        const next = a ? [...refs, { slot: a.slot, attachmentId: a.id }] : refs;
        if (!configurationIssues(db, weaponId, next, patch).length)
          walk(i + 1, next);
        else invalid++;
      }
    };
    walk(0, []);
  } else {
    let beam = [base];
    inspect([]);
    for (let i = 0; i < choices.length && !truncated; i++) {
      const candidates = [];
      for (const b of beam)
        for (const a of choices[i]) {
          const refs = a
            ? [...b.attachments, { slot: a.slot, attachmentId: a.id }]
            : b.attachments;
          if (configurationIssues(db, weaponId, refs, patch).length) {
            invalid++;
            continue;
          }
          const r = inspect(refs) ?? (!a ? b : null);
          if (r) candidates.push(r);
        }
      candidates.sort(
        (a, b) =>
          (b.score ?? score(b)) - (a.score ?? score(a)) ||
          signature(a.attachments).localeCompare(signature(b.attachments)),
      );
      beam = [
        ...new Map(
          candidates.map((c) => [signature(c.attachments), c]),
        ).values(),
      ].slice(0, beamWidth);
    }
  }
  const unresolved = db.attachments.some(
    (a) =>
      a.weaponIds.includes(weaponId) &&
      a.availability !== false &&
      (a.availability !== true || a.patchRevision !== patch),
  );
  const coverage = w.coverage;
  if (
    db.communityValues &&
    unknown > 0 &&
    best.every((b) => !b.attachments.length)
  )
    return unavailable([
      "Für Aufsätze fehlen vollständige Messwerte; stattdessen wird ein verfügbarer Quellen-Build empfohlen.",
    ]);
  const usesReported = required.some((k) => w.base[k]?.status === "reported");
  const certified =
    !usesReported &&
    !unresolved &&
    algorithm === "exhaustive" &&
    !truncated &&
    !unknown &&
    coverage.catalogComplete &&
    coverage.compatibilityComplete &&
    coverage.modifiersComplete &&
    coverage.stackingVerified;
  const community = analyzeCommunity(db, weaponId, patch);
  const hybridCandidates = best.filter((r) =>
    community.builds.some(
      (c) => signature(c.attachments) === signature(r.attachments),
    ),
  );
  const hybrid = hybridCandidates.length
    ? hybridCandidates
        .map((r) => ({
          ...r,
          hybridScore:
            r.score +
            0.05 *
              community.builds
                .filter(
                  (c) => signature(c.attachments) === signature(r.attachments),
                )
                .reduce(
                  (n, c) => Math.max(n, Math.min(c.independentSources, 3) / 3),
                  0,
                ),
        }))
        .sort((a, b) => b.hybridScore - a.hybridScore)[0]
    : null;
  return {
    status: certified ? "optimal" : "partial",
    reasons: certified
      ? []
      : [
          ...(usesReported
            ? ["Berechnung verwendet ausgewiesene Community-Werte"]
            : []),
          ...(unresolved
            ? ["Verfügbarkeit oder Patchstand einzelner Aufsätze ungeklärt"]
            : []),
          ...(!coverage.catalogComplete
            ? ["Der recherchierte Aufsatzkatalog ist unvollständig"]
            : []),
          ...(!coverage.compatibilityComplete
            ? ["Kompatibilitätsregeln unvollständig"]
            : []),
          ...(!coverage.modifiersComplete || !coverage.stackingVerified
            ? ["Effekte oder Kombinationsregeln unvollständig"]
            : []),
          ...(unknown
            ? [`${unknown} Konfigurationen ohne vollständige Messwerte`]
            : []),
          ...(algorithm === "beam"
            ? ["Beam-Suche: keine Garantie für das globale Optimum"]
            : []),
          ...(truncated ? ["Suchbudget erreicht"] : []),
        ],
    results: best,
    hybrid,
    evaluated,
    unknown,
    invalid,
    estimate,
    algorithm,
    truncated,
    weights,
    context,
    patchRevision: patch,
    goal,
    policy:
      "Relative Änderung zur Basis, nach Prioritäten gewichtet. Keine Gewichtsumverteilung bei fehlenden Werten. TTK gilt nur für das angegebene Szenario. Hybrid: maximal 0,05 zusätzlicher Quellenbonus; kein mathematisches Optimum.",
  };
}
