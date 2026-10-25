import { load } from "cheerio";
import { createFetcher } from "./sources.mjs";
import { hash } from "./model.mjs";
import {
  parseEffect,
  EFFECT_LABELS,
  normalName,
  validateEffectEvidence,
} from "../../public/engine/effect-evidence.js";
const clean = (s) => s.replace(/\s+/g, " ").trim();
export function parseEffectProfile(html, url, weapon) {
  const $ = load(html),
    main = $("main").first();
  const title = clean($("h1").first().text());
  if (
    !normalName(title).includes(normalName(weapon.name)) ||
    !main.length ||
    !/Call of Duty: Modern Warfare 4/.test(main.text()) ||
    !/Launch 2026/.test(main.text()) ||
    !main
      .find("a[href]")
      .toArray()
      .some(
        (e) =>
          clean($(e).text()) === "Multiplayer" &&
          new URL($(e).attr("href"), url).href === url,
      )
  )
    throw Error("Wrong game, weapon, mode or launch stage: " + url);
  const stamp = clean(main.text()).match(
    /Last updated:\s*(\d{1,2}) ([A-Za-z]+) (\d{4})/,
  );
  const date = stamp
    ? Date.parse(`${stamp[2]} ${stamp[1]}, ${stamp[3]} UTC`)
    : NaN;
  if (!Number.isFinite(date)) throw Error("Effect source date missing");
  const section = main
    .find("h2")
    .filter((_, e) => / Attachments$/.test(clean($(e).text())))
    .parent();
  if (section.length !== 1) throw Error("Effect attachment layout missing");
  const attachments = [];
  for (const h of section.find("h3").toArray()) {
    const slot = clean($(h).text())
      .replace(/^APEX$/, "Apex")
      .replace(/^Triggeraction$/, "Trigger Action");
    const entries = $(h).parent().children("ul").children("li");
    if (!entries.length) throw Error("Empty attachment slot: " + slot);
    for (const li of entries.toArray()) {
      const item = $(li),
        name = clean(item.find("h4").first().text());
      const unlockLabel = clean(item.find("h4").first().next("span").text());
      const effects = item
        .find("ul")
        .first()
        .children("li")
        .map((_, e) => parseEffect(clean($(e).text())))
        .get();
      if (!name) throw Error("Partial effect row: " + url);
      attachments.push({ name, slot, unlockLabel, effects });
    }
  }
  if (attachments.length < 10 || !attachments.some((a) => a.effects.length))
    throw Error("Implausibly partial attachment list: " + url);
  const statSection = main
    .find("h2")
    .filter((_, e) => / Stats$/.test(clean($(e).text())))
    .parent();
  const stats = [];
  for (const h of statSection.find("h3").toArray()) {
    for (const li of $(h).parent().children("ul").children("li").toArray()) {
      const spans = $(li).children("span");
      if (spans.length !== 2) continue;
      const label = clean(spans.first().text()),
        raw = clean(spans.last().text());
      const match = raw.replaceAll(",", "").match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
      const units = { rpm: "RPM", x: "×", sec: "s" };
      stats.push({
        label,
        raw,
        metric: EFFECT_LABELS[label] ?? null,
        value: match ? Number(match[1]) : null,
        unit: match ? (units[match[2]] ?? match[2]) : null,
      });
    }
  }
  if (stats.length < 15) throw Error("Effect base stats missing");
  const profile = {
    weaponId: weapon.id,
    url,
    state: "available",
    reason: null,
    asOf: new Date(date).toISOString().slice(0, 10),
    stats,
    attachments,
  };
  return { ...profile, hash: hash(profile) };
}
export async function collectEffectEvidence(
  config,
  meta,
  fetchPage = createFetcher(config),
  { now = new Date().toISOString() } = {},
) {
  if (
    config.allowedOrigins.length !== 1 ||
    config.allowedOrigins[0] !== "https://ggranked.com" ||
    !config.restrictions.some(
      (r) => r.source === "ggranked / WZ Ranked" && r.automation === "allowed",
    )
  )
    throw Error("Effect source is not approved for automation");
  if (config.termsUrl) {
    const terms = load(await fetchPage(config.termsUrl));
    terms("script,style,nav,header,footer").remove();
    const text = terms("main").text().replace(/\s+/g, " ").trim();
    if (
      !text.includes("Acceptance of Terms") ||
      hash(text) !== config.termsFingerprint
    )
      throw Error(
        "Effect source terms changed or unavailable; review before collecting data",
      );
  }
  const index = await fetchPage(config.index),
    $ = load(index);
  if (!/Launch 2026/.test($.text()))
    throw Error("Wrong effect source index version");
  const links = new Set(
    $("a[href]")
      .map((_, e) => new URL($(e).attr("href"), config.index).href)
      .get(),
  );
  const profiles = [];
  for (const w of meta.weapons) {
    const page = config.pages.find((p) => p.weaponId === w.id);
    if (!page) {
      if (!config.notApplicable.includes(w.id))
        throw Error("Missing configured weapon " + w.id);
      const p = {
        weaponId: w.id,
        url: null,
        state: "not-applicable",
        reason:
          "Offizielle Waffenübersicht: keine Gunsmith-Aufsatzslots. Keine passende Seite im öffentlichen Launch-Index.",
        asOf: null,
        stats: [],
        attachments: [],
      };
      profiles.push({ ...p, hash: hash(p) });
      continue;
    }
    if (!links.has(page.url))
      throw Error("Previously known effect source removed: " + w.id);
    const profile = parseEffectProfile(await fetchPage(page.url), page.url, w);
    if (
      page.minimumAttachments &&
      profile.attachments.length < page.minimumAttachments
    )
      throw Error("Effect inventory unexpectedly shrank: " + w.id);
    if (
      page.slots?.some(
        (slot) => !profile.attachments.some((a) => a.slot === slot),
      )
    )
      throw Error("Effect inventory lost a slot: " + w.id);
    profiles.push(profile);
  }
  const content = {
    schemaVersion: 1,
    gameId: meta.gameId,
    mode: "multiplayer",
    patchRevision: config.patchRevision,
    profiles,
    restrictions: config.restrictions,
    aliasReviews: config.aliasReviews,
  };
  const data = { ...content, checkedAt: now, hash: hash(content) };
  return validateEffectEvidence(data, meta);
}
export function proposeEffectRefresh(
  db,
  before,
  after,
  { now = after.checkedAt, previous = null } = {},
) {
  if (before.hash === after.hash) return null;
  const changed = after.profiles.filter(
    (p) =>
      before.profiles.find((o) => o.weaponId === p.weaponId)?.hash !== p.hash,
  );
  const detectedAt =
    previous?.effectEvidenceHash === after.hash ? previous.detectedAt : now;
  const database = structuredClone(db);
  database.history.unshift({
    at: detectedAt,
    patchRevision: db.patchRevision,
    summary: `Aufsatzeffekte: ${changed.length} Waffenprofile mit nachvollziehbaren Quellenänderungen.`,
    changedWeaponIds: changed.map((p) => p.weaponId),
    sourceValues: changed.map((p) => ({
      weaponId: p.weaponId,
      url: p.url,
      before: before.profiles.find((o) => o.weaponId === p.weaponId) ?? null,
      after: p,
    })),
  });
  return {
    database,
    review: {
      schemaVersion: 1,
      policy: "REVIEW_REQUIRED",
      effectEvidenceHash: after.hash,
      fingerprint: hash({ effects: after.hash }),
      detectedAt,
      changedWeaponIds: changed.map((p) => p.weaponId),
      effectChanges: changed.map((p) => ({
        weaponId: p.weaponId,
        before: before.profiles.find((o) => o.weaponId === p.weaponId) ?? null,
        after: p,
      })),
    },
  };
}
