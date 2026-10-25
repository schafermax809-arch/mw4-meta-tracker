import { METRICS } from "./database.js";

// Source labels are kept verbatim. In particular a percentage "speed" change
// must not silently become the same percentage change of a duration in ms.
export const EFFECT_LABELS = {
  "ADS In Speed": "ads",
  "ADS Out Speed": "adsOut",
  "Sprint to Fire Speed": "sprintToFire",
  "Reload Speed": "reload",
  "Damage Range": "range",
  "Muzzle Velocity": "velocity",
  "Move Speed": "movement",
  "ADS Move Speed": "adsMovement",
  "Firing Move Speed": "firingMovement",
  "Strafe Speed": "strafeMovement",
  "Crouch Speed": "crouchMovement",
  "Sprint Speed": "sprint",
  "Tactical Sprint Speed": "tacticalSprint",
  "ADS Horizontal Recoil Control": "horizontalRecoil",
  "ADS Vertical Recoil Control": "verticalRecoil",
  "ADS Horizontal Gun Kick": "horizontalGunKick",
  "ADS Vertical Gun Kick": "verticalGunKick",
  "ADS Idle Sway": "stability",
  "ADS Gun Bob": "adsGunBob",
  "Hip Horizontal Recoil Control": "hipHorizontalRecoil",
  "Hip Vertical Recoil Control": "hipVerticalRecoil",
  "Hip Horizontal Gun Kick": "hipHorizontalGunKick",
  "Hip Vertical Gun Kick": "hipVerticalGunKick",
  "Hip Idle Sway": "hipIdleSway",
  "Hip Gun Bob": "hipGunBob",
  Magazine: "magazine",
  Rounds: "magazine",
  "Reserve Ammo": "reserve",
  "Fire Rate": "rpm",
  "Zoom Level": "zoom",
  "Pre-Fire Delay": "preFire",
  "Rechambering Speed": "recenter",
  "Raise Speed": "raise",
  "Drop Speed": "drop",
  "Flinch Received": "flinch",
  "Flinch Infliction": "flinchInfliction",
  "Bullet Penetration": "penetration",
};
export const normalName = (s) =>
  s
    .toLowerCase()
    .replace(/(\d)\.(?=\d)/g, "$1decimalpoint")
    .replace(/(\d)\/(?=\d)/g, "$1fractionbar")
    .replace(/[^a-z0-9]/g, "");
const duration = new Set([
  "ads",
  "adsOut",
  "sprintToFire",
  "reload",
  "recenter",
  "raise",
  "drop",
]);
export function parseEffect(raw) {
  const text = raw.replace(/\s+/g, " ").trim();
  const match = text.match(
    /^(.*?)\s+(=\s*|[x×]\s*|[+−-])([0-9]+(?:\.[0-9]+)?)\s*(%|ms|m\/s|rpm|x|°\/s|°|in|sec)?$/i,
  );
  if (!match)
    return {
      raw: text,
      label: text,
      metric: null,
      kind: "qualitative",
      value: null,
      unit: null,
      operation: null,
      reason: "Qualitative Angabe, keine Zahl veröffentlicht.",
    };
  const label = match[1],
    token = match[2].trim(),
    metric = EFFECT_LABELS[label] ?? null;
  const value = Number(match[3]) * (/^[−-]/.test(token) ? -1 : 1);
  let kind =
    token === "="
      ? "absolute"
      : /^[x×]$/.test(token)
        ? "factor"
        : match[4] === "%"
          ? "percent"
          : "additive";
  const unit =
    kind === "percent"
      ? "%"
      : kind === "factor"
        ? "factor"
        : match[4] === "x"
          ? "×"
          : match[4] === "rpm"
            ? "RPM"
            : (match[4] ?? (metric ? METRICS[metric][1] : null));
  let operation =
      kind === "absolute"
        ? "set"
        : kind === "factor" || kind === "percent"
          ? "multiply"
          : "add",
    reason = null;
  if (!metric) {
    operation = null;
    reason =
      "Kein eindeutig zugeordneter Messwert; generisches Recoil wird nicht auf einzelne Achsen verteilt.";
  } else if (kind === "percent" && duration.has(metric)) {
    operation = null;
    reason =
      "Prozentuale Speed-Angabe: Umrechnung in Zeit ohne dokumentierte Definition ungeklärt.";
  } else if (
    !["percent", "factor"].includes(kind) &&
    unit !== METRICS[metric][1]
  ) {
    operation = null;
    reason = "Einheit stimmt nicht mit dem Rechenmodell überein.";
  }
  return { raw: text, label, metric, kind, value, unit, operation, reason };
}
const exact = (o, fields) => {
  if (
    !o ||
    typeof o !== "object" ||
    Array.isArray(o) ||
    Object.keys(o).some((k) => !fields.includes(k))
  )
    throw Error("Unexpected effect evidence field");
};
export function validateEffectEvidence(data, meta) {
  exact(data, [
    "schemaVersion",
    "gameId",
    "mode",
    "patchRevision",
    "checkedAt",
    "profiles",
    "restrictions",
    "aliasReviews",
    "hash",
  ]);
  if (
    data.schemaVersion !== 1 ||
    data.gameId !== meta.gameId ||
    data.mode !== "multiplayer" ||
    !/^[a-f0-9]{64}$/.test(data.patchRevision) ||
    !/^[a-f0-9]{64}$/.test(data.hash) ||
    !Number.isFinite(Date.parse(data.checkedAt)) ||
    !Array.isArray(data.profiles) ||
    data.profiles.length !== meta.weapons.length
  )
    throw Error("Invalid effect evidence");
  const seen = new Set();
  for (const p of data.profiles) {
    exact(p, [
      "weaponId",
      "url",
      "state",
      "reason",
      "asOf",
      "stats",
      "attachments",
      "hash",
    ]);
    if (
      !meta.weapons.some((w) => w.id === p.weaponId) ||
      seen.has(p.weaponId) ||
      !["available", "not-applicable", "unavailable"].includes(p.state) ||
      !Array.isArray(p.stats) ||
      !Array.isArray(p.attachments) ||
      !/^[a-f0-9]{64}$/.test(p.hash)
    )
      throw Error("Invalid evidence weapon");
    seen.add(p.weaponId);
    if (
      p.state === "available" &&
      (!p.url?.startsWith(
        "https://ggranked.com/games/call-of-duty-modern-warfare-4/meta/weapons/",
      ) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(p.asOf) ||
        !p.attachments.length)
    )
      throw Error("Wrong evidence scope");
    const rows = new Set();
    for (const a of p.attachments) {
      exact(a, ["name", "slot", "unlockLabel", "effects"]);
      const key = a.slot + ":" + normalName(a.name);
      if (
        !a.name ||
        rows.has(key) ||
        !Array.isArray(a.effects) ||
        ![
          "Optic",
          "Muzzle",
          "Barrel",
          "Underbarrel",
          "Magazine",
          "Rear Grip",
          "Stock",
          "Laser",
          "Ammunition",
          "Apex",
          "Comb",
          "Bolt",
          "Guard",
          "Trigger Action",
          "Cylinder",
          "Fire Mods",
        ].includes(a.slot)
      )
        throw Error("Invalid evidence attachment");
      rows.add(key);
      for (const e of a.effects) {
        exact(e, [
          "raw",
          "label",
          "metric",
          "kind",
          "value",
          "unit",
          "operation",
          "reason",
        ]);
        if (JSON.stringify(e) !== JSON.stringify(parseEffect(e.raw)))
          throw Error("Effect interpretation mismatch");
      }
    }
    for (const s of p.stats) {
      exact(s, ["label", "raw", "metric", "value", "unit"]);
      if (
        typeof s.label !== "string" ||
        typeof s.raw !== "string" ||
        (s.value !== null && !Number.isFinite(s.value)) ||
        (s.metric !== null && !METRICS[s.metric])
      )
        throw Error("Invalid evidence stat");
    }
  }
  if (!Array.isArray(data.restrictions) || !Array.isArray(data.aliasReviews))
    throw Error("Evidence audit missing");
  for (const r of data.restrictions) {
    exact(r, ["source", "url", "automation", "reason", "checkedOn"]);
    if (
      !["allowed", "manual-only", "unavailable"].includes(r.automation) ||
      !r.url.startsWith("https://") ||
      !r.reason
    )
      throw Error("Invalid source restriction");
  }
  for (const a of data.aliasReviews) {
    exact(a, ["weaponId", "names", "decision", "reason", "urls"]);
    if (
      a.decision !== "keep-separate" ||
      !meta.weapons.some((w) => w.id === a.weaponId) ||
      !Array.isArray(a.names) ||
      !Array.isArray(a.urls)
    )
      throw Error("Invalid alias review");
  }
  return data;
}
export function hydrateEffectEvidence(database, data, patch) {
  const db = structuredClone(database);
  db.effectEvidence = data;
  if (data.patchRevision !== patch) return db;
  for (const p of data.profiles) {
    const w = db.weapons.find((w) => w.id === p.weaponId);
    if (!w || p.state !== "available") continue;
    const sourceId = "ggranked-" + w.id;
    db.sources.push({
      id: sourceId,
      url: p.url,
      title: "ggranked · " + w.name,
      kind: "community",
      publishedAt: p.asOf,
      checkedAt: data.checkedAt,
      automation: "allowed",
      termsUrl: "https://ggranked.com/legal/terms",
      note: "Öffentliches MW4-Multiplayer-Launchprofil; quellengeprüft, nicht unabhängig im Spiel vermessen. Einzeloperationen veröffentlicht, Stapelregeln ungeklärt.",
      independenceGroup: "onetwodata",
    });
    w.evidenceConflicts = [];
    for (const s of p.stats) {
      if (
        !s.metric ||
        s.value === null ||
        s.value < 0 ||
        s.unit !== METRICS[s.metric][1]
      )
        continue;
      if (w.base[s.metric] && Math.abs(w.base[s.metric].value - s.value) > 1e-8)
        w.evidenceConflicts.push({
          stat: s.metric,
          before: structuredClone(w.base[s.metric]),
          reported: { ...s, sourceIds: [sourceId] },
        });
      else if (!w.base[s.metric])
        w.base[s.metric] = {
          value: s.value,
          unit: s.unit,
          sourceIds: [sourceId],
          patchRevision: patch,
          status: "reported",
        };
    }
    for (const row of p.attachments) {
      let a = db.attachments.find(
        (a) =>
          a.weaponIds.includes(w.id) &&
          a.slot === row.slot &&
          normalName(a.name) === normalName(row.name),
      );
      if (!a) {
        const id = ("evidence-" + w.id + "-" + row.slot + "-" + row.name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/-$/, "")
          .slice(0, 100);
        a = {
          id,
          name: row.name,
          names: { en: row.name, de: null },
          slot: row.slot,
          weaponIds: [w.id],
          unlock: {
            level: null,
            condition: row.unlockLabel,
            sourceIds: [sourceId],
          },
          pros: [],
          cons: [],
          special: [],
          modifiers: [],
          effectsComplete: false,
          blocks: [],
          conflicts: [],
          sourceIds: [sourceId],
          checkedAt: data.checkedAt,
          patchRevision: patch,
          status: "reported",
          availability: true,
        };
        db.attachments.push(a);
      }
      a.aliases = [
        ...new Set([
          ...(a.aliases ?? []),
          ...(a.name !== row.name ? [row.name] : []),
        ]),
      ];
      a.sourceIds = [...new Set([...a.sourceIds, sourceId])];
      if (a.patchRevision !== patch) {
        a.patchRevision = patch;
        a.status = "reported";
      }
      if (a.availability === null) {
        a.availability = true;
        a.status = "reported";
      }
      a.evidence = {
        sourceIds: [sourceId],
        checkedAt: data.checkedAt,
        asOf: p.asOf,
        gameId: data.gameId,
        mode: data.mode,
        patchRevision: data.patchRevision,
        status: "reported",
        unlockLabel: row.unlockLabel,
        effects: row.effects,
        complete: false,
      };
      a.checkedAt = data.checkedAt;
      if (
        row.slot !== "Apex" &&
        w.officialSlots &&
        !w.officialSlots.includes(row.slot)
      ) {
        a.compatibilityConflict =
          "Diese Slot-Kategorie fehlt in der offiziellen Waffenübersicht. Kompatibilität vor Verwendung prüfen.";
        a.availability = false;
      }
      // Preserve existing official assertions. Newly observed effects stay in a
      // separate evidence list; runtime calculation never upgrades their status.
      a.evidenceModifiers = row.effects
        .filter((e) => e.operation)
        .map((e) => ({
          stat: e.metric,
          operation: e.operation,
          value: e.kind === "percent" ? 1 + e.value / 100 : e.value,
          unit: e.operation === "multiply" ? "factor" : e.unit,
          order: 0,
          sourceIds: [sourceId],
          patchRevision: patch,
          status: "reported",
          raw: e.raw,
        }));
      a.modifierConflicts = a.evidenceModifiers.flatMap((m) =>
        a.modifiers
          .filter(
            (old) =>
              old.stat === m.stat &&
              (old.operation !== m.operation ||
                Math.abs(old.value - m.value) > 1e-8),
          )
          .map((old) => ({ stat: m.stat, before: old, reported: m })),
      );
      if (!w.rules.slots.includes(row.slot) && row.slot !== "Apex")
        w.rules.slots.push(row.slot);
      if (!w.catalogAttachmentIds?.includes(a.id))
        w.catalogAttachmentIds?.push(a.id);
    }
  }
  return db;
}
export function effectCoverage(db, patch = db.patchRevision) {
  return db.weapons.map((w) => {
    const rows = db.attachments.filter((a) => a.weaponIds.includes(w.id));
    const current = (a) => a.patchRevision === patch;
    const numeric = (a) =>
      current(a) &&
      Boolean(
        a.modifiers.length ||
          (a.evidence?.patchRevision === patch &&
            a.evidence.effects.some((e) => e.kind !== "qualitative")),
      );
    const verified = (a) =>
      current(a) &&
      a.modifiers.length &&
      a.modifiers.some(
        (m) =>
          m.patchRevision === patch &&
          m.sourceIds.some((id) =>
            ["official", "test"].includes(
              db.sources.find((s) => s.id === id)?.kind,
            ),
          ),
      );
    const complete = rows.filter((a) => current(a) && a.effectsComplete).length;
    return {
      weaponId: w.id,
      name: w.name,
      attachments: rows.length,
      sourceChecked: rows.filter((a) => a.evidence?.patchRevision === patch)
        .length,
      numeric: rows.filter(numeric).length,
      verifiedNumeric: rows.filter(verified).length,
      incomplete: rows.length - complete,
      conflicting: rows.filter(
        (a) => a.modifierConflicts?.length || a.compatibilityConflict,
      ).length,
      baseConflicts: w.evidenceConflicts?.length ?? 0,
      completeness: rows.length
        ? Math.round((complete / rows.length) * 1000) / 10
        : null,
      numericCoverage: rows.length
        ? Math.round((rows.filter(numeric).length / rows.length) * 1000) / 10
        : null,
      optimizerReliable: false,
    };
  });
}
