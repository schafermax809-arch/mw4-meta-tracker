import { configurationIssues, signature } from "./database.js";
const slots = new Set([
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
]);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const exact = (o, keys) => {
  if (
    !o ||
    typeof o !== "object" ||
    Array.isArray(o) ||
    Object.keys(o).some((k) => !keys.includes(k))
  )
    throw Error("Unexpected attachment catalog field");
};
const url = (u) => {
  const x = new URL(u);
  return (
    x.protocol === "https:" &&
    x.origin === "https://warzoneloadout.games" &&
    !x.username &&
    !x.password
  );
};
export function validateAttachmentCatalog(data, meta) {
  exact(data, [
    "schemaVersion",
    "gameId",
    "mode",
    "patchRevision",
    "catalog",
    "profiles",
    "hash",
  ]);
  if (
    data.schemaVersion !== 1 ||
    data.gameId !== meta.gameId ||
    data.mode !== "multiplayer" ||
    !/^[a-f0-9]{64}$/.test(data.patchRevision) ||
    !/^[a-f0-9]{64}$/.test(data.hash) ||
    !Array.isArray(data.catalog) ||
    !data.catalog.length ||
    data.catalog.length > 5000 ||
    !Array.isArray(data.profiles) ||
    data.profiles.length !== meta.weapons.length
  )
    throw Error("Invalid attachment catalog");
  const ids = new Set(),
    weapons = new Set();
  for (const a of data.catalog) {
    exact(a, ["id", "name", "url", "slot", "unlockWeapon", "unlockLevel"]);
    if (
      !a.id ||
      ids.has(a.id) ||
      typeof a.name !== "string" ||
      !a.name ||
      !url(a.url) ||
      !slots.has(a.slot) ||
      (a.unlockLevel !== null &&
        (!Number.isInteger(a.unlockLevel) || a.unlockLevel < 0))
    )
      throw Error("Invalid catalog attachment");
    ids.add(a.id);
  }
  for (const p of data.profiles) {
    exact(p, [
      "weaponId",
      "url",
      "title",
      "declared",
      "attachments",
      "builds",
      "tier",
      "hash",
    ]);
    const w = meta.weapons.find((w) => w.id === p.weaponId);
    if (
      !w ||
      weapons.has(w.id) ||
      !url(p.url) ||
      !norm(p.title).includes(norm(w.name)) ||
      !Array.isArray(p.attachments) ||
      p.attachments.length !== p.declared ||
      !Array.isArray(p.builds) ||
      !Number.isInteger(p.declared)
    )
      throw Error("Invalid weapon inventory");
    weapons.add(w.id);
    const keys = new Set();
    for (const a of p.attachments) {
      exact(a, ["slot", "name", "label", "level"]);
      const key = a.slot + ":" + norm(a.name);
      if (
        !slots.has(a.slot) ||
        !a.name ||
        typeof a.label !== "string" ||
        (a.level !== null && (!Number.isInteger(a.level) || a.level < 0)) ||
        keys.has(key)
      )
        throw Error("Invalid inventory option");
      keys.add(key);
    }
    for (const b of p.builds) {
      exact(b, ["label", "parts", "tier"]);
      if (
        typeof b.label !== "string" ||
        !Array.isArray(b.parts) ||
        !b.parts.length ||
        b.parts.length > 16
      )
        throw Error("Invalid catalog build");
      for (const a of b.parts) {
        exact(a, ["slot", "name"]);
        if (!slots.has(a.slot) || typeof a.name !== "string" || !a.name)
          throw Error("Invalid build part");
      }
    }
  }
  return data;
}
export const privateCatalogSource = (id) =>
  id === "warzoneloadout" || id.startsWith("catalog-source-");
export function hydrateAttachmentCatalog(database, data, patch) {
  const db = structuredClone(database);
  db.attachmentCatalog = data;
  if (data.patchRevision !== patch) return db;
  for (const p of data.profiles) {
    const w = db.weapons.find((w) => w.id === p.weaponId);
    if (!w) continue;
    const sourceId = "catalog-source-" + w.id,
      checkedAt = db.reviewedAt;
    db.sources.push({
      id: sourceId,
      url: p.url,
      title: "Waffen- und Aufsatzkatalog",
      kind: "community",
      publishedAt: null,
      checkedAt,
      automation: "allowed",
      termsUrl: "https://warzoneloadout.games/terms",
      note: "Datenübernahme vom Nutzer am 25.10.2026 als freigegeben bestätigt. Herkunft intern erhalten, ohne separate Quellenhinweise im Waffenmenü. Vollständige veröffentlichte Waffenliste, keine unabhängige Messung.",
      independenceGroup: "codmunity",
    });
    w.coverage.reportedCatalogComplete = true;
    w.coverage.reportedCatalogCount = p.declared;
    w.reportedTier = p.tier ?? w.reportedTier;
    const find = (slot, name) =>
      db.attachments.find(
        (a) =>
          a.weaponIds.includes(w.id) &&
          a.slot === slot &&
          norm(a.name) === norm(name),
      );
    const add = (part, fromBuild = false) => {
      let a = find(part.slot, part.name);
      if (!a) {
        a = {
          id: (
            "catalog-" +
            w.id +
            "-" +
            slug(part.slot) +
            "-" +
            slug(part.name)
          ).slice(0, 100),
          name: part.name,
          names: { en: part.name, de: null },
          slot: part.slot,
          weaponIds: [w.id],
          unlock: {
            level: part.level ?? null,
            condition: fromBuild
              ? "In veröffentlichter Konfiguration aufgeführt."
              : "Über Waffenlevel oder einmalige Freischaltung an einer kompatiblen Waffe.",
            sourceIds: [sourceId],
          },
          pros: [],
          cons: [],
          special: part.label ? [part.label] : [],
          modifiers: [],
          effectsComplete: false,
          blocks: [],
          conflicts: [],
          sourceIds: [sourceId],
          checkedAt,
          patchRevision: patch,
          status: "reported",
          availability: true,
        };
        db.attachments.push(a);
      } else {
        a.sourceIds = [...new Set([...a.sourceIds, sourceId])];
        a.patchRevision = patch;
        if (a.availability !== false) a.availability = true;
        if (a.status !== "verified") a.status = "reported";
        if (part.label && !a.special.includes(part.label))
          a.special.push(part.label);
      }
      if (part.level !== undefined) {
        a.unlock = {
          level: part.level,
          condition:
            "Waffenlevel laut veröffentlichtem Katalog; bereits an kompatibler Waffe freigeschaltete Aufsätze werden geteilt.",
          sourceIds: [sourceId],
        };
      }
      return { slot: part.slot, attachmentId: a.id };
    };
    w.catalogAttachmentIds = p.attachments.map((a) => add(a).attachmentId);
    w.rules.slots = [
      ...new Set([
        ...w.rules.slots,
        ...p.attachments.map((a) => a.slot).filter((s) => s !== "Apex"),
      ]),
    ];
    for (const [i, b] of p.builds.entries()) {
      const refs = b.parts.map((a) => add(a, true));
      w.catalogAttachmentIds = [
        ...new Set([
          ...w.catalogAttachmentIds,
          ...refs.map((a) => a.attachmentId),
        ]),
      ];
      if (configurationIssues(db, w.id, refs, patch).length) continue;
      if (
        db.community.some(
          (c) =>
            c.weaponId === w.id &&
            signature(c.attachments) === signature(refs) &&
            c.sourceIds.includes(sourceId),
        )
      )
        continue;
      db.community.push({
        id: "catalog-build-" + w.id + "-" + i,
        weaponId: w.id,
        attachments: refs,
        sourceIds: [sourceId],
        publishedAt: checkedAt.slice(0, 10),
        checkedAt,
        patchRevision: patch,
        mode: "multiplayer",
        reviewed: true,
        testSupported: false,
        note:
          b.label +
          " · veröffentlichter Multiplayer-Build; numerische Aufsatzeffekte nicht unabhängig vermessen.",
      });
    }
  }
  return db;
}
