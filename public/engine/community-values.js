import { METRICS, signature, configurationIssues } from "./database.js";
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const slots = {
  muzzle: "Muzzle",
  barrel: "Barrel",
  laser: "Laser",
  optic: "Optic",
  underbarrel: "Underbarrel",
  magazine: "Magazine",
  ammunition: "Ammunition",
  "rear-grip": "Rear Grip",
  stock: "Stock",
  comb: "Comb",
  bolt: "Bolt",
  guard: "Guard",
  "trigger-action": "Trigger Action",
  cylinder: "Cylinder",
  "fire-mods": "Fire Mods",
};
const fields = (o, allowed) => {
  if (
    !o ||
    typeof o !== "object" ||
    Array.isArray(o) ||
    Object.keys(o).some((k) => !allowed.includes(k))
  )
    throw Error("Unbekanntes Quellenfeld");
};
export function validateCommunityValues(data, catalog) {
  if (
    !data ||
    data.schemaVersion !== 1 ||
    data.gameId !== "cod-mw4-2026" ||
    !Array.isArray(data.pages) ||
    data.pages.length > 200 ||
    !Array.isArray(data.references) ||
    !/^[a-f0-9]{64}$/.test(data.hash)
  )
    throw Error("Ungültige Community-Werte");
  if (
    Object.keys(data).some(
      (k) =>
        ![
          "schemaVersion",
          "gameId",
          "patchRevision",
          "pages",
          "references",
          "hash",
        ].includes(k),
    ) ||
    !/^[a-f0-9]{64}$/.test(data.patchRevision)
  )
    throw Error("Unbekanntes Community-Feld/Patch");
  const urls = new Set();
  for (const r of data.references) {
    fields(r, [
      "weaponId",
      "url",
      "asOf",
      "mode",
      "stage",
      "note",
      "reason",
      "observations",
    ]);
    const url = new URL(r.url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (r.weaponId && !catalog.weapons.some((w) => w.id === r.weaponId))
    )
      throw Error("Ungültige zusätzliche Quellenreferenz");
    if (
      r.observations &&
      (!Array.isArray(r.observations) ||
        r.observations.some(
          (s) =>
            typeof s.label !== "string" ||
            typeof s.unit !== "string" ||
            !(typeof s.value === "string" || Number.isFinite(s.value)),
        ))
    )
      throw Error("Ungültiger zusätzlicher Quellenwert");
  }
  for (const p of data.pages) {
    fields(p, [
      "weaponId",
      "title",
      "url",
      "mode",
      "stage",
      "asOf",
      "stats",
      "ratings",
      "zones",
      "health",
      "builds",
      "tier",
      "hash",
    ]);
    if (
      slug(p.title) !== p.weaponId ||
      (p.asOf !== null && !/^\d{4}-\d{2}-\d{2}$/.test(p.asOf)) ||
      new URL(p.url).username ||
      new URL(p.url).password
    )
      throw Error("Falsche Quellenidentität/Datum");
    if (
      !catalog.weapons.some((w) => w.id === p.weaponId) ||
      new URL(p.url).protocol !== "https:" ||
      urls.has(p.url)
    )
      throw Error("Unbekannte/doppelte Quellenzuordnung");
    urls.add(p.url);
    if (
      !["multiplayer", "dmz"].includes(p.mode) ||
      !["launch", "beta", "unknown"].includes(p.stage) ||
      !Array.isArray(p.stats) ||
      !Array.isArray(p.ratings) ||
      !Array.isArray(p.zones) ||
      !Array.isArray(p.builds)
    )
      throw Error("Ungültiger Quellenumfang");
    for (const s of p.stats) {
      fields(s, ["label", "metric", "value", "unit", "raw"]);
      if (
        typeof s.label !== "string" ||
        typeof s.unit !== "string" ||
        !(typeof s.value === "string" || Number.isFinite(s.value)) ||
        (s.metric && (!METRICS[s.metric] || s.unit !== METRICS[s.metric][1]))
      )
        throw Error("Ungültiger Community-Wert");
    }
    for (const r of p.ratings)
      if (
        !METRICS[r.metric] ||
        r.unit !== "/100" ||
        !Number.isFinite(r.value) ||
        r.value < 0 ||
        r.value > 100
      )
        throw Error("Ungültige Menübewertung");
    for (const z of p.zones) {
      let end = 0;
      for (const b of z.bands) {
        if (
          b.from !== end ||
          !Number.isFinite(b.to) ||
          b.to <= b.from ||
          !Number.isFinite(b.damage) ||
          b.damage <= 0 ||
          !Number.isInteger(b.shots) ||
          b.shots < 1
        )
          throw Error("Ungültiges Quellen-Schadensprofil");
        end = b.to;
      }
    }
    for (const b of p.builds)
      if (
        typeof b.title !== "string" ||
        !Array.isArray(b.parts) ||
        b.parts.length > 20 ||
        b.parts.some(
          (a) => !slots[a.slot] || typeof a.name !== "string" || !a.name,
        )
      )
        throw Error("Ungültiger Quellen-Build");
  }
  return data;
}
export function hydrateCommunityValues(database, data, patch) {
  const db = structuredClone(database);
  db.communityValues = data;
  for (const p of data.pages) {
    if (
      p.mode !== "multiplayer" ||
      p.stage !== "launch" ||
      !p.asOf ||
      data.patchRevision !== patch
    )
      continue;
    const w = db.weapons.find((w) => w.id === p.weaponId);
    if (!w) continue;
    const sourceId = "metka-" + w.id;
    db.sources.push({
      id: sourceId,
      url: p.url,
      title: "Metka · " + p.title,
      kind: "community",
      publishedAt: p.asOf,
      checkedAt: (p.asOf ?? "2026-10-24") + "T12:00:00Z",
      automation: "allowed",
      termsUrl: "https://metka.gg/en/imprint/",
      note: "Veröffentlichte Community-Werte; nicht unabhängig im Spiel gemessen. Zuordnung zum berücksichtigten Launch-Stand, keine offizielle Bestätigung.",
      independenceGroup: "metka",
    });
    const sourceIds = [sourceId];
    const stat = (key, value, unit) => {
      if (!w.base[key] && METRICS[key])
        w.base[key] = {
          value,
          unit,
          sourceIds,
          patchRevision: patch,
          status: "reported",
        };
    };
    for (const s of p.stats)
      if (s.metric && Number.isFinite(s.value)) stat(s.metric, s.value, s.unit);
    for (const r of p.ratings) stat(r.metric, r.value, r.unit);
    const body = p.zones.find((z) => /^(body|upper body|chest)$/i.test(z.zone));
    if (body?.bands.length) {
      stat("damage", body.bands[0].damage, "HP");
      if (body.bands.length > 1) stat("range", body.bands[0].to, "m");
    }
    w.reportedTier = p.tier;
    for (const b of p.builds) {
      const refs = [];
      for (const part of [
        ...b.parts,
        ...(b.apex ? [{ slot: "apex", ...b.apex }] : []),
      ]) {
        const slot = part.slot === "apex" ? "Apex" : slots[part.slot];
        if (!slot) continue;
        let a = db.attachments.find(
          (a) =>
            a.weaponIds.includes(w.id) &&
            a.slot === slot &&
            slug(a.name) === slug(part.name),
        );
        if (!a) {
          a = {
            id: ("reported-" + w.id + "-" + slug(part.name)).slice(0, 100),
            name: part.name,
            names: { en: part.name, de: null },
            slot,
            weaponIds: [w.id],
            unlock: {
              level: part.level,
              condition: "Von Community-Quelle genannt; Level kann abweichen.",
              sourceIds,
            },
            pros: [],
            cons: [],
            special: [],
            modifiers: [],
            effectsComplete: false,
            blocks: [],
            conflicts: [],
            sourceIds,
            checkedAt: db.sources.at(-1).checkedAt,
            patchRevision: patch,
            status: "reported",
            availability: true,
          };
          db.attachments.push(a);
        } else {
          a.sourceIds = [...new Set([...a.sourceIds, ...sourceIds])];
          if (a.patchRevision !== patch) {
            a.patchRevision = patch;
            a.status = "reported";
          }
          if (a.availability === null) {
            a.availability = true;
            a.status = "reported";
            a.special.push(
              "In aktueller Community-Konfiguration aufgeführt; Live-Verfügbarkeit nicht offiziell bestätigt.",
            );
          }
        }
        refs.push({ slot, attachmentId: a.id });
      }
      if (!refs.length || configurationIssues(db, w.id, refs, patch).length)
        continue;
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
        id: "metka-" + w.id + "-" + b.id,
        weaponId: w.id,
        attachments: refs,
        sourceIds,
        publishedAt: p.asOf,
        checkedAt: db.sources.at(-1).checkedAt,
        patchRevision: patch,
        mode: "multiplayer",
        reviewed: true,
        testSupported: false,
        note:
          b.title +
          " · veröffentlichte Quellenempfehlung, keine unabhängig verifizierte Leistungsberechnung.",
      });
    }
  }
  return db;
}
export function communityTTK(
  data,
  weaponId,
  { distance = 10, zone = "Body", health = 100 } = {},
) {
  const p = data?.pages.find(
    (p) =>
      p.weaponId === weaponId &&
      p.mode === "multiplayer" &&
      p.stage === "launch" &&
      p.asOf,
  );
  if (!p) return null;
  const z = p.zones.find((z) => z.zone.toLowerCase() === zone.toLowerCase()),
    b = z?.bands.find((b) => distance >= b.from && distance < b.to),
    rpm = p.stats.find((s) => s.metric === "rpm")?.value;
  const mode = p.stats.find((s) => /Fire mode/i.test(s.label))?.raw ?? "";
  if (
    !b ||
    !rpm ||
    !Number.isFinite(health) ||
    health <= 0 ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    /burst/i.test(mode) ||
    !/(auto|semi|bolt)/i.test(mode)
  )
    return null;
  const shots = Math.ceil(health / b.damage);
  return {
    shots,
    ms: ((shots - 1) * 60000) / rpm,
    damage: b.damage,
    rpm,
    health,
    distance,
    zone,
    sourceUrl: p.url,
    asOf: p.asOf,
    status: "reported",
    note: "Theoretische Trefferfolge ab erstem Treffer, ohne Flugzeit, Vorlaufzeit, Fehlschüsse oder Aufsatzwirkung; Community-Schadensprofil.",
  };
}
