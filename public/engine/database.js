// Shared browser/Node contract. Unknown values are null or absent, never zero.
export const METRICS = {
  damage: ["Schaden", "HP", 1],
  range: ["Schadensreichweite", "m", 1],
  velocity: ["Geschossgeschwindigkeit", "m/s", 1],
  horizontalRecoil: ["Horizontaler Rückstoß", "°", -1],
  verticalRecoil: ["Vertikaler Rückstoß", "°", -1],
  gunKick: ["Gun Kick", "°", -1],
  ads: ["ADS-Zeit", "ms", -1],
  sprintToFire: ["Sprint-to-Fire", "ms", -1],
  movement: ["Bewegung", "m/s", 1],
  adsMovement: ["ADS-Bewegung", "m/s", 1],
  hipSpread: ["Hüftfeuerstreuung", "°", -1],
  stability: ["Zielschwanken", "°", -1],
  magazine: ["Magazinkapazität", "Schuss", 1],
  reserve: ["Reservemunition", "Schuss", 1],
  reload: ["Nachladezeit", "ms", -1],
  rpm: ["Feuerrate", "RPM", 1],
  zoom: ["Vergrößerung", "×", 1],
  recenter: ["Nachzentrieren", "ms", -1],
  ttk: ["TTK", "ms", -1],
  headMultiplier: ["Kopftreffer-Multiplikator", "×", 1],
  weaponLevels: ["Maximales Waffenlevel", "Level", 1],
  unlockLevel: ["Freischaltung Spielerlevel", "Level", -1],
  adsOut: ["ADS verlassen", "ms", -1],
  ratingDamage: ["Menüwert Schaden", "/100", 1],
  ratingRange: ["Menüwert Reichweite", "/100", 1],
  ratingAccuracy: ["Menüwert Präzision", "/100", 1],
  ratingMobility: ["Menüwert Mobilität", "/100", 1],
  ratingHandling: ["Menüwert Handling", "/100", 1],
};
export const signature = (refs) =>
  refs
    .map((r) => `${r.slot}:${r.attachmentId}`)
    .sort()
    .join("|");
const assert = (v, m) => {
  if (!v) throw new Error(m);
};
const exact = (v, fields, label) => {
  assert(v && typeof v === "object" && !Array.isArray(v), label);
  assert(
    Object.keys(v).every((k) => fields.includes(k)),
    `${label}: unknown field`,
  );
};
const ids = (values) => {
  assert(
    Array.isArray(values) && new Set(values).size === values.length,
    "Duplicate IDs",
  );
  values.forEach((v) =>
    assert(typeof v === "string" && /^[a-z0-9-]{1,100}$/.test(v), "Invalid ID"),
  );
};
const revision = (v) => v === null || /^[a-f0-9]{64}$/.test(v);
export function validateDatabase(db, catalog = null) {
  const personalKeys = new Set([
    "progress",
    "entries",
    "localStorage",
    "camoProgress",
    "token",
    "password",
  ]);
  const inspect = (v) => {
    if (v && typeof v === "object")
      for (const [k, child] of Object.entries(v)) {
        assert(
          !personalKeys.has(k),
          "Personal data is forbidden in Gunsmith database",
        );
        inspect(child);
      }
  };
  inspect(db);
  exact(
    db,
    [
      "schemaVersion",
      "gameId",
      "mode",
      "patchRevision",
      "reviewedAt",
      "sources",
      "weapons",
      "attachments",
      "community",
      "history",
    ],
    "database",
  );
  assert(
    db.schemaVersion === 1 &&
      db.gameId === "cod-mw4-2026" &&
      db.mode === "multiplayer" &&
      revision(db.patchRevision),
    "Wrong game/mode/schema",
  );
  assert(Number.isFinite(Date.parse(db.reviewedAt)), "Review date required");
  assert(
    Array.isArray(db.sources) &&
      Array.isArray(db.weapons) &&
      Array.isArray(db.attachments) &&
      Array.isArray(db.community) &&
      Array.isArray(db.history),
    "Database lists required",
  );
  ids(db.sources.map((s) => s.id));
  ids(db.weapons.map((w) => w.id));
  ids(db.attachments.map((a) => a.id));
  ids(db.community.map((c) => c.id));
  const sourceIds = new Set(db.sources.map((s) => s.id)),
    weaponIds = new Set(db.weapons.map((w) => w.id));
  const evidence = (arr) =>
    assert(
      Array.isArray(arr) && arr.length && arr.every((i) => sourceIds.has(i)),
      "Missing source evidence",
    );
  for (const s of db.sources) {
    exact(
      s,
      [
        "id",
        "url",
        "title",
        "kind",
        "publishedAt",
        "checkedAt",
        "automation",
        "termsUrl",
        "note",
        "independenceGroup",
      ],
      "source",
    );
    assert(
      new URL(s.url).protocol === "https:" &&
        ["official", "editorial", "community", "test", "reference"].includes(
          s.kind,
        ),
      "Invalid source",
    );
    assert(
      ["allowed", "manual-only", "unavailable"].includes(s.automation),
      "Source automation policy required",
    );
    assert(
      typeof s.note === "string" && Number.isFinite(Date.parse(s.checkedAt)),
      "Invalid source review",
    );
  }
  const values = (entries) => {
    exact(entries, Object.keys(METRICS), "values");
    for (const [key, v] of Object.entries(entries)) {
      exact(
        v,
        ["value", "unit", "sourceIds", "patchRevision", "status"],
        "stat",
      );
      assert(
        Number.isFinite(v.value) &&
          v.value >= 0 &&
          v.unit === METRICS[key][1] &&
          revision(v.patchRevision) &&
          ["verified", "reported"].includes(v.status),
        "Invalid stat/unit",
      );
      evidence(v.sourceIds);
    }
  };
  for (const w of db.weapons) {
    exact(
      w,
      [
        "id",
        "name",
        "weaponClass",
        "sourceIds",
        "base",
        "rules",
        "coverage",
        "damageProfile",
        "fireModel",
        "interactions",
        "snapshots",
        "notes",
      ],
      "weapon",
    );
    evidence(w.sourceIds);
    values(w.base);
    assert(
      !catalog || catalog.weapons.some((c) => c.id === w.id),
      "Unknown weapon",
    );
    assert(
      [
        "assault-rifle",
        "smg",
        "shotgun",
        "lmg",
        "marksman",
        "sniper",
        "pistol",
        "launcher",
        "melee",
      ].includes(w.weaponClass) &&
        typeof w.name === "string" &&
        w.name.length > 0,
      "Invalid weapon identity",
    );
    exact(
      w.rules,
      [
        "slots",
        "maxAttachments",
        "apexSeparate",
        "patchRevision",
        "sourceIds",
        "longshotDistance",
      ],
      "rules",
    );
    evidence(w.rules.sourceIds);
    assert(
      Array.isArray(w.rules.slots) &&
        new Set(w.rules.slots).size === w.rules.slots.length &&
        (w.rules.maxAttachments === null ||
          (Number.isInteger(w.rules.maxAttachments) &&
            w.rules.maxAttachments >= 0 &&
            w.rules.maxAttachments <= 20)) &&
        revision(w.rules.patchRevision),
      "Invalid slot rules",
    );
    if (w.rules.longshotDistance !== null) {
      const l = w.rules.longshotDistance;
      exact(l, ["value", "unit", "sourceIds", "patchRevision"], "longshot");
      assert(
        l.value > 0 && l.unit === "m" && revision(l.patchRevision),
        "Invalid longshot",
      );
      evidence(l.sourceIds);
    }
    exact(
      w.coverage,
      [
        "catalogComplete",
        "compatibilityComplete",
        "modifiersComplete",
        "stackingVerified",
        "missing",
        "checkedAt",
      ],
      "coverage",
    );
    for (const k of [
      "catalogComplete",
      "compatibilityComplete",
      "modifiersComplete",
      "stackingVerified",
    ])
      assert(typeof w.coverage[k] === "boolean", "Coverage must be explicit");
    assert(
      typeof w.rules.apexSeparate === "boolean" &&
        Number.isFinite(Date.parse(w.coverage.checkedAt)),
      "Rule/coverage verification missing",
    );
    assert(
      Array.isArray(w.coverage.missing) &&
        Array.isArray(w.interactions) &&
        Array.isArray(w.snapshots) &&
        Array.isArray(w.notes),
      "Weapon arrays required",
    );
    if (w.fireModel !== null) {
      exact(
        w.fireModel,
        ["type", "preFireMs", "patchRevision", "sourceIds"],
        "fire model",
      );
      assert(
        ["continuous", "semi-auto", "burst", "projectile", "melee"].includes(
          w.fireModel.type,
        ) &&
          Number.isFinite(w.fireModel.preFireMs) &&
          w.fireModel.preFireMs >= 0 &&
          revision(w.fireModel.patchRevision),
        "Invalid fire model",
      );
      evidence(w.fireModel.sourceIds);
    }
    if (w.damageProfile !== null) {
      exact(
        w.damageProfile,
        ["patchRevision", "sourceIds", "bands"],
        "damage profile",
      );
      evidence(w.damageProfile.sourceIds);
      assert(
        revision(w.damageProfile.patchRevision) &&
          Array.isArray(w.damageProfile.bands) &&
          w.damageProfile.bands.length,
        "Invalid damage profile",
      );
      let end = 0;
      for (const b of w.damageProfile.bands) {
        exact(b, ["from", "to", "zones"], "damage band");
        assert(
          b.from === end && (b.to === null || b.to > b.from),
          "Invalid damage intervals",
        );
        end = b.to;
        exact(
          b.zones,
          ["head", "upperTorso", "lowerTorso", "arm", "leg"],
          "zones",
        );
        assert(
          Object.values(b.zones).every((n) => Number.isFinite(n) && n > 0),
          "Invalid damage",
        );
      }
    }
    for (const i of w.interactions) {
      exact(
        i,
        ["attachmentIds", "modifiers", "patchRevision", "sourceIds"],
        "interaction",
      );
      ids(i.attachmentIds);
      evidence(i.sourceIds);
      assert(revision(i.patchRevision), "Invalid interaction patch");
      i.modifiers.forEach(modifier);
    }
    for (const s of w.snapshots) {
      exact(
        s,
        ["attachments", "values", "patchRevision", "sourceIds"],
        "snapshot",
      );
      evidence(s.sourceIds);
      values(s.values);
      assert(
        revision(s.patchRevision) && Array.isArray(s.attachments),
        "Invalid snapshot",
      );
    }
  }
  function modifier(m) {
    exact(
      m,
      [
        "stat",
        "operation",
        "value",
        "unit",
        "order",
        "sourceIds",
        "patchRevision",
      ],
      "modifier",
    );
    assert(
      METRICS[m.stat] &&
        ["add", "multiply", "set"].includes(m.operation) &&
        Number.isFinite(m.value) &&
        Number.isInteger(m.order) &&
        revision(m.patchRevision),
      "Invalid modifier",
    );
    assert(
      m.unit === (m.operation === "multiply" ? "factor" : METRICS[m.stat][1]),
      "Modifier unit mismatch",
    );
    assert(m.operation !== "multiply" || m.value >= 0, "Negative multiplier");
    evidence(m.sourceIds);
  }
  for (const a of db.attachments) {
    exact(
      a,
      [
        "id",
        "name",
        "names",
        "slot",
        "weaponIds",
        "unlock",
        "pros",
        "cons",
        "special",
        "modifiers",
        "effectsComplete",
        "blocks",
        "conflicts",
        "sourceIds",
        "checkedAt",
        "patchRevision",
        "status",
        "availability",
      ],
      "attachment",
    );
    ids(a.weaponIds);
    assert(
      a.weaponIds.length && a.weaponIds.every((i) => weaponIds.has(i)),
      "Attachment weapon missing",
    );
    evidence(a.sourceIds);
    exact(a.names, ["en", "de"], "names");
    assert(
      a.names.en === a.name &&
        (a.names.de === null || typeof a.names.de === "string"),
      "Invalid names",
    );
    assert(
      typeof a.name === "string" &&
        typeof a.slot === "string" &&
        Array.isArray(a.pros) &&
        Array.isArray(a.cons) &&
        Array.isArray(a.special) &&
        Array.isArray(a.blocks) &&
        Array.isArray(a.conflicts) &&
        Array.isArray(a.modifiers) &&
        typeof a.effectsComplete === "boolean" &&
        revision(a.patchRevision),
      "Invalid attachment",
    );
    assert(
      ["verified", "reported"].includes(a.status) &&
        [true, false, null].includes(a.availability),
      "Invalid verification",
    );
    assert(
      Number.isFinite(Date.parse(a.checkedAt)),
      "Attachment verification date missing",
    );
    exact(a.unlock, ["level", "condition", "sourceIds"], "unlock");
    assert(
      a.unlock.level === null ||
        (Number.isInteger(a.unlock.level) && a.unlock.level >= 0),
      "Invalid unlock",
    );
    evidence(a.unlock.sourceIds);
    a.modifiers.forEach(modifier);
    assert(
      a.conflicts.every((id) => db.attachments.some((x) => x.id === id)),
      "Unknown conflict",
    );
  }
  for (const w of db.weapons)
    for (const s of w.snapshots)
      assert(
        !configurationIssues(db, w.id, s.attachments, s.patchRevision).length,
        "Invalid snapshot combination",
      );
  for (const c of db.community) {
    exact(
      c,
      [
        "id",
        "weaponId",
        "attachments",
        "sourceIds",
        "publishedAt",
        "checkedAt",
        "patchRevision",
        "mode",
        "reviewed",
        "testSupported",
        "note",
      ],
      "recommendation",
    );
    evidence(c.sourceIds);
    assert(
      weaponIds.has(c.weaponId) &&
        Array.isArray(c.attachments) &&
        revision(c.patchRevision) &&
        ["multiplayer", "dmz", "warzone"].includes(c.mode) &&
        typeof c.reviewed === "boolean" &&
        typeof c.testSupported === "boolean" &&
        typeof c.note === "string",
      "Invalid recommendation",
    );
    assert(
      !configurationIssues(db, c.weaponId, c.attachments, c.patchRevision).some(
        (s) => !s.includes("Patch"),
      ),
      "Invalid community combination",
    );
  }
  for (const h of db.history) {
    exact(
      h,
      [
        "at",
        "patchRevision",
        "summary",
        "changedWeaponIds",
        "changes",
        "sourceValues",
      ],
      "history",
    );
    assert(
      Number.isFinite(Date.parse(h.at)) &&
        revision(h.patchRevision) &&
        typeof h.summary === "string",
      "Invalid history",
    );
    ids(h.changedWeaponIds);
    if (h.changes) {
      exact(
        h.changes,
        ["weapons", "attachments", "community"],
        "history changes",
      );
      for (const list of Object.values(h.changes)) {
        assert(Array.isArray(list), "History list required");
        for (const c of list) {
          exact(c, ["id", "before", "after"], "historic record");
          assert(
            c.after?.id === c.id &&
              (c.before === null || c.before?.id === c.id),
            "Invalid historic before/after",
          );
        }
      }
    }
  }
  return db;
}
export function configurationIssues(
  db,
  weaponId,
  refs,
  patch = db.patchRevision,
) {
  const w = db.weapons.find((w) => w.id === weaponId);
  if (!w) return ["Unbekannte Waffe"];
  if (!Array.isArray(refs)) return ["Ungültige Aufsätze"];
  const issues = [],
    slots = new Set();
  const standard = refs.filter((r) => r.slot !== "Apex");
  if (refs.length && w.rules.patchRevision !== patch)
    issues.push("Patch der Slot-Regeln nicht aktuell");
  if (standard.length && w.rules.maxAttachments === null)
    issues.push("Aufsatzlimit unbekannt");
  if (
    w.rules.maxAttachments !== null &&
    standard.length > w.rules.maxAttachments
  )
    issues.push("Aufsatzlimit überschritten");
  if (refs.filter((r) => r.slot === "Apex").length > 1)
    issues.push("Nur ein Apex zulässig");
  for (const r of refs) {
    const a = db.attachments.find((a) => a.id === r.attachmentId);
    if (slots.has(r.slot)) issues.push("Slot doppelt belegt");
    slots.add(r.slot);
    if (!a || a.slot !== r.slot || !a.weaponIds.includes(weaponId)) {
      issues.push("Aufsatz inkompatibel");
      continue;
    }
    if (
      !w.rules.slots.includes(r.slot) &&
      !(r.slot === "Apex" && w.rules.apexSeparate)
    )
      issues.push("Slot nicht freigegeben");
    if (a.availability !== true)
      issues.push("Aktuelle Verfügbarkeit nicht bestätigt");
    if (a.patchRevision !== patch)
      issues.push("Patch des Aufsatzes nicht aktuell");
    if (a.blocks.some((s) => refs.some((r) => r.slot === s)))
      issues.push("Apex blockiert belegten Slot");
    if (a.conflicts.some((i) => refs.some((r) => r.attachmentId === i)))
      issues.push("Aufsätze im Konflikt");
  }
  return [...new Set(issues)];
}
export function coverageReport(db, patch = db.patchRevision) {
  return db.weapons.map((w) => ({
    weaponId: w.id,
    name: w.name,
    baseValues: Object.keys(w.base).length,
    currentValues: Object.values(w.base).filter(
      (v) => v.patchRevision === patch && v.status === "verified",
    ).length,
    attachments: db.attachments.filter((a) => a.weaponIds.includes(w.id))
      .length,
    ...w.coverage,
    patchCurrent: w.rules.patchRevision === patch,
  }));
}
