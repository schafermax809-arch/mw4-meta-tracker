import { load } from "cheerio";
import { hash } from "./model.mjs";
import { createFetcher } from "./sources.mjs";
import { validateDatabase } from "../../public/engine/database.js";
const clean = (s) => s.replace(/\s+/g, " ").trim();
const numericText = (s) =>
  s.replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, (value) =>
    value.replaceAll(",", ""),
  );
const number = (s) => {
  const m = numericText(s).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const mappings = {
  "Fire rate": ["rpm", "RPM", 1],
  "ADS time": ["ads", "ms", 1],
  "Sprint-to-fire": ["sprintToFire", "ms", 1],
  Magazine: ["magazine", "Schuss", 1],
  Reserve: ["reserve", "Schuss", 1],
  Reload: ["reload", "ms", 1000],
  "Bullet velocity": ["velocity", "m/s", 1],
  "Head multiplier": ["headMultiplier", "×", 1],
  "Weapon levels": ["weaponLevels", "Level", 1],
  "ADS out": ["adsOut", "ms", 1],
};
const explicitUnit = (label, raw) => {
  raw = numericText(raw);
  if (["Magazine", "Reserve", "Weapon levels"].includes(label))
    return /^\d+(?:\s*(?:rounds|levels?))?$/i.test(raw);
  if (label === "Fire rate") return /^\d+(?:\.\d+)?\s*RPM$/i.test(raw);
  if (["ADS time", "Sprint-to-fire", "ADS out"].includes(label))
    return /^\d+(?:\.\d+)?\s*ms$/i.test(raw);
  if (label === "Reload") return /^\d+(?:\.\d+)?\s*(?:ms|s)$/i.test(raw);
  if (label === "Bullet velocity") return /^\d+(?:\.\d+)?\s*m\/s$/i.test(raw);
  if (label === "Head multiplier")
    return /^(?:×\s*)?\d+(?:\.\d+)?(?:\s*[x×])?$/i.test(raw);
  return false;
};
// Astro's public server-rendered props contain the same selectable builds as the UI.
// Decode only primitive/object/array values; never execute scripts from a source.
function decode(v) {
  if (Array.isArray(v) && v.length === 2 && Number.isInteger(v[0])) {
    if (v[0] === 0) return decode(v[1]);
    if (v[0] === 1) return v[1].map(decode);
    return null;
  }
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, decode(x)]),
    );
  return v;
}
export function parseCommunityValues(html, url, weaponId) {
  const $ = load(html),
    title = clean($("main h1").first().text());
  if (!title || !$(".weapon-page").length)
    throw Error("Community weapon layout changed: " + url);
  const article = $('script[type="application/ld+json"]')
    .toArray()
    .map((e) => {
      try {
        return JSON.parse($(e).text());
      } catch {
        return {};
      }
    })
    .find((a) => a["@type"] === "Article");
  const asOf = article?.dateModified?.slice(0, 10) ?? null;
  const stage = /Launch data/i.test($(".hero .status").text())
    ? "launch"
    : /beta/i.test($(".hero .status").text())
      ? "beta"
      : "unknown";
  const mode = /\/dmz\//.test(url) ? "dmz" : "multiplayer";
  const stats = [];
  for (const dt of $("dl.spec dt").toArray()) {
    const label = clean($(dt).text()),
      raw = clean($(dt).next("dd").text());
    if (!raw) continue;
    const map = mappings[label],
      v = number(raw);
    if (map && v !== null && explicitUnit(label, raw))
      stats.push({
        label,
        metric: map[0],
        value: v * (label === "Reload" && /\bms\b/.test(raw) ? 1 : map[2]),
        unit: map[1],
        raw,
      });
    else
      stats.push({
        label,
        metric: null,
        value: raw,
        unit: "Quellenangabe",
        raw,
      });
  }
  const ratings = [];
  for (const li of $(".stats li").toArray()) {
    const text = clean($(li).text());
    const m = text.match(
      /^(Damage|Range|Accuracy|Mobility|Handling)\s*(\d+(?:\.\d+)?)$/i,
    );
    if (m)
      ratings.push({
        metric: "rating" + m[1],
        value: Number(m[2]),
        unit: "/100",
      });
  }
  const zones = [];
  for (const row of $(".zones > .hitrow").toArray()) {
    const zone = clean($(row).prev(".zl").text());
    const bands = $(row)
      .find(".seg[data-damage]")
      .toArray()
      .map((e) => ({
        from: Number($(e).attr("data-from")),
        to: Number($(e).attr("data-to")),
        damage: Number($(e).attr("data-damage")),
        shots: Number($(e).attr("data-shots")),
      }));
    if (zone && bands.length) zones.push({ zone, bands });
  }
  const health = number(
    clean($(".kill .note").text()).match(/\d+\s*HP/)?.[0] ?? "",
  );
  const builds = [];
  for (const el of $("astro-island[props]").toArray()) {
    if (!/BuildBlock/.test($(el).attr("component-url") ?? "")) continue;
    const props = decode(JSON.parse($(el).attr("props")));
    for (const [i, v] of (props.view?.variants ?? []).entries())
      builds.push({
        id: String(i),
        title: v.label,
        parts: Object.entries(v.parts ?? {}).map(([slot, p]) => ({
          slot,
          name: p.name,
          level: number(p.level ?? ""),
        })),
        apex: v.apex
          ? { name: v.apex.name, level: number(v.apex.level ?? "") }
          : null,
      });
  }
  const tier =
    clean($(".hero .badge .vh").first().text()).match(
      /^([SABCD]) tier$/,
    )?.[1] ?? null;
  const page = {
    weaponId,
    title,
    url,
    mode,
    stage,
    asOf,
    stats,
    ratings,
    zones,
    health,
    builds,
    tier,
  };
  return { ...page, hash: hash(page) };
}
export async function collectCommunityValues(
  config,
  fetchPage = createFetcher(config),
) {
  const pages = [];
  for (const source of config.pages)
    pages.push(
      parseCommunityValues(
        await fetchPage(source.url),
        source.url,
        source.weaponId,
      ),
    );
  return {
    schemaVersion: 1,
    gameId: "cod-mw4-2026",
    patchRevision: config.patchRevision,
    pages,
    references: config.references ?? [],
    hash: hash(pages),
  };
}
export function proposeCommunityValueRefresh(
  db,
  before,
  after,
  { now = new Date().toISOString(), previous = null } = {},
) {
  if (hash(before) === hash(after)) return null;
  const fingerprint = hash(after),
    at =
      (previous?.sourceValuesFingerprint ?? previous?.fingerprint) ===
      fingerprint
        ? previous.detectedAt
        : now;
  const sourceValues = after.pages
    .filter((p) => before.pages.find((o) => o.url === p.url)?.hash !== p.hash)
    .map((p) => ({
      weaponId: p.weaponId,
      url: p.url,
      before: before.pages.find((o) => o.url === p.url) ?? null,
      after: p,
    }));
  const changedWeaponIds = [
    ...new Set([
      ...sourceValues.map((p) => p.weaponId),
      ...(hash(before.references) !== hash(after.references)
        ? after.references.map((r) => r.weaponId).filter(Boolean)
        : []),
    ]),
  ];
  const database = structuredClone(db);
  database.reviewedAt = at;
  database.history.unshift({
    at,
    patchRevision: db.patchRevision,
    summary: `${changedWeaponIds.length} Community-Werteprofile/Quellen geändert; offizielle Basiswerte beibehalten.`,
    changedWeaponIds,
    sourceValues,
  });
  validateDatabase(database);
  return {
    database,
    review: {
      schemaVersion: 1,
      policy: "REVIEW_REQUIRED",
      fingerprint,
      sourceValuesFingerprint: fingerprint,
      detectedAt: at,
      changedWeaponIds,
      communityValueChanges: sourceValues,
    },
  };
}
