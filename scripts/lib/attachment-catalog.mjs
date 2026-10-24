import { load } from "cheerio";
import { createFetcher } from "./sources.mjs";
import { hash } from "./model.mjs";
import { validateDatabase } from "../../public/engine/database.js";
const clean = (s) => s.replace(/\s+/g, " ").trim();
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function parseAttachmentIndex(html, url) {
  const d = load(html),
    title = clean(d("main h1").text());
  if (!/Modern Warfare 4 Attachments List/.test(title))
    throw Error("Wrong game or attachment index layout");
  const declared = Number(
    clean(d("main").text()).match(/complete list of (\d+) attachments/i)?.[1],
  );
  const catalog = d("main table tbody tr")
    .toArray()
    .map((el) => {
      const cells = d(el).children("td"),
        link = cells.eq(0).find("a[href]").first();
      const level = clean(cells.eq(3).text());
      return {
        id: new URL(link.attr("href"), url).pathname
          .split("/")
          .filter(Boolean)
          .at(-1),
        name: clean(link.text()),
        url: new URL(link.attr("href"), url).href,
        slot: clean(cells.eq(1).text()),
        unlockWeapon: clean(cells.eq(2).text()),
        unlockLevel: /^\d+$/.test(level) ? Number(level) : null,
      };
    });
  if (
    !declared ||
    declared !== catalog.length ||
    new Set(catalog.map((a) => a.id)).size !== declared
  )
    throw Error("Incomplete or duplicate global attachment index");
  return catalog;
}
export function parseWeaponInventory(html, url, weapon) {
  const d = load(html),
    title = clean(d("main h1").text());
  if (!title.includes(weapon.name) && !norm(title).includes(norm(weapon.name)))
    throw Error("Wrong weapon identity: " + weapon.id);
  if (!/Modern Warfare 4/.test(title)) throw Error("Wrong game: " + weapon.id);
  const header = d("main h1").closest("header"),
    declared = Number(clean(header.text()).match(/(\d+)\s*Attachments/i)?.[1]);
  const groups = d("#attachments-h")
    .closest("section")
    .find("details")
    .toArray();
  const attachments = [];
  for (const el of groups) {
    const group = d(el),
      summary = group.children("summary"),
      slot = clean(summary.children("span").first().text().replace("▸", "")),
      count = Number(summary.children("span").last().text());
    const rows = group.find("li").toArray();
    if (rows.length !== count)
      throw Error("Partial slot list: " + weapon.id + " " + slot);
    for (const li of rows) {
      const spans = d(li).children("span").last().children("span"),
        name = clean(spans.first().text()),
        detail = spans.length > 1 ? clean(spans.last().text()) : "";
      const level = detail.match(/Lv\.\s*(\d+)/i);
      if (!name) throw Error("Incomplete attachment: " + weapon.id);
      attachments.push({
        slot,
        name,
        label: clean(detail.replace(/\s*·?\s*Lv\.\s*\d+/i, "")),
        level: level ? Number(level[1]) : null,
      });
    }
  }
  const noSlots = ["launcher", "melee"].includes(weapon.weaponClass);
  if (
    (!Number.isInteger(declared) && !noSlots) ||
    (Number.isInteger(declared) && declared !== attachments.length) ||
    (!noSlots && !attachments.length)
  )
    throw Error("Incomplete weapon inventory: " + weapon.id);
  const builds = [];
  for (const el of d("#loadouts-h")
    .closest("section")
    .find("article")
    .toArray()) {
    const card = d(el),
      label = clean(card.find("h3").first().text()),
      scope = clean(card.find("header p").text());
    if (!/Meta\s*:\s*Multiplayer/i.test(scope)) continue;
    const parts = card
      .find("ol > li")
      .toArray()
      .map((li) => {
        const spans = d(li).children("span").last().children("span");
        return {
          slot: clean(spans.first().text()),
          name: clean(spans.last().text()),
        };
      });
    const expected = Number(scope.match(/(\d+) attachments/)?.[1]);
    if (parts.length !== expected || !label || !parts.length)
      throw Error("Incomplete build: " + weapon.id);
    builds.push({
      label,
      parts,
      tier: clean(card.find(".tier-badge").first().text()) || null,
    });
  }
  const tier = clean(header.find(".tier-badge").first().text()) || null;
  const p = {
    weaponId: weapon.id,
    url,
    title,
    declared: attachments.length,
    attachments,
    builds,
    tier,
  };
  return { ...p, hash: hash(p) };
}
export async function collectAttachmentCatalog(
  config,
  meta,
  fetchPage = createFetcher(config),
) {
  if (config.permission?.status !== "user-confirmed")
    throw Error("Data reuse permission is not configured");
  const root = "https://warzoneloadout.games",
    catalog = parseAttachmentIndex(
      await fetchPage(root + "/mw4/attachments"),
      root,
    ),
    directory = load(await fetchPage(root + "/mw4/weapons")),
    links = new Map();
  for (const el of directory("main a[href]").toArray()) {
    const u = new URL(directory(el).attr("href"), root);
    if (u.origin !== root || !/^\/mw4\/[^/]+\/?$/.test(u.pathname)) continue;
    const slug = u.pathname.split("/").filter(Boolean).at(-1),
      w = meta.weapons.find(
        (w) => norm(w.id) === norm(slug) || norm(w.name) === norm(slug),
      );
    if (w) links.set(w.id, u.href);
  }
  const profiles = [];
  for (const w of meta.weapons) {
    const url = links.get(w.id);
    if (!url) throw Error("Missing source weapon link: " + w.id);
    profiles.push(parseWeaponInventory(await fetchPage(url), url, w));
  }
  const content = {
    schemaVersion: 1,
    gameId: meta.gameId,
    mode: "multiplayer",
    patchRevision: config.patchRevision,
    catalog,
    profiles,
  };
  return { ...content, hash: hash(content) };
}
export function proposeCatalogRefresh(
  db,
  before,
  after,
  { now = new Date().toISOString(), previous = null } = {},
) {
  if (before?.hash === after.hash) return null;
  const at =
    previous?.catalogFingerprint === after.hash ? previous.detectedAt : now;
  const profiles = after.profiles.filter(
    (p) =>
      before?.profiles.find((o) => o.weaponId === p.weaponId)?.hash !== p.hash,
  );
  const indexChanges = after.catalog
    .filter(
      (a) =>
        hash(a) !== hash(before?.catalog.find((o) => o.id === a.id) ?? null),
    )
    .map((a) => ({
      id: a.id,
      before: before?.catalog.find((o) => o.id === a.id) ?? null,
      after: a,
    }));
  const removed = (before?.catalog ?? [])
    .filter((a) => !after.catalog.some((o) => o.id === a.id))
    .map((a) => ({ id: a.id, before: a, after: null }));
  const changedWeaponIds = [
    ...new Set([
      ...profiles.map((p) => p.weaponId),
      ...[...indexChanges, ...removed]
        .flatMap((c) => [c.before?.unlockWeapon, c.after?.unlockWeapon])
        .filter(Boolean)
        .flatMap((name) =>
          db.weapons
            .filter((w) => norm(w.name) === norm(name))
            .map((w) => w.id),
        ),
    ]),
  ];
  const sourceValues = [
    {
      weaponId: "catalog",
      url: "https://warzoneloadout.games/mw4/attachments",
      before: null,
      after: { changed: indexChanges, removed },
    },
    ...profiles.map((p) => ({
      weaponId: p.weaponId,
      url: p.url,
      before: before?.profiles.find((o) => o.weaponId === p.weaponId) ?? null,
      after: p,
    })),
  ];
  const database = structuredClone(db);
  database.reviewedAt = at;
  database.history.unshift({
    at,
    patchRevision: db.patchRevision,
    summary: `Aufsatzkatalog aktualisiert: ${after.catalog.length} Einträge, ${profiles.length} Waffenprofile und ${after.profiles.reduce((n, p) => n + p.builds.length, 0)} veröffentlichte Builds.`,
    changedWeaponIds,
    sourceValues,
  });
  validateDatabase(database);
  return {
    database,
    review: {
      schemaVersion: 1,
      policy: "REVIEW_REQUIRED",
      catalogFingerprint: after.hash,
      detectedAt: at,
      changedWeaponIds,
      attachmentCatalogChanges: sourceValues,
    },
  };
}
