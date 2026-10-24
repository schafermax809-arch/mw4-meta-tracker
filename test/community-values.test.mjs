import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateCommunityValues,
  hydrateCommunityValues,
  communityTTK,
} from "../public/engine/community-values.js";
import { calculateStats } from "../public/engine/calculator.js";
import { configurationIssues } from "../public/engine/database.js";
import { optimize } from "../public/engine/optimizer.js";
import {
  parseCommunityValues,
  proposeCommunityValueRefresh,
  collectCommunityValues,
} from "../scripts/lib/community-values.mjs";
import { hash } from "../scripts/lib/model.mjs";
const json = async (name) =>
  JSON.parse(
    await readFile(
      new URL("../public/data/" + name + ".json", import.meta.url),
      "utf8",
    ),
  );
const [raw, base, catalog] = await Promise.all(
  ["community-values", "gunsmith", "meta"].map(json),
);
test("published community data has valid identities, units, date scopes and a reproducible hash", () => {
  validateCommunityValues(raw, catalog);
  assert.equal(raw.hash, hash(raw.pages));
  assert.ok(raw.pages.some((p) => p.stats.some((s) => s.metric === "ads")));
  assert.ok(raw.pages.some((p) => p.zones.length));
});
test("reported values fill missing facts without overwriting official values or mutating the raw database", () => {
  const before = hash(base),
    db = hydrateCommunityValues(base, raw, base.patchRevision),
    w = db.weapons.find((w) => w.id === "m4");
  assert.equal(w.base.rpm.value, 810);
  assert.equal(w.base.rpm.status, "verified");
  assert.equal(w.base.ads.value, 240);
  assert.equal(w.base.ads.status, "reported");
  assert.equal(calculateStats(db, "m4").values.ads.value, 240);
  assert.equal(w.base.ratingRange.unit, "/100");
  assert.equal(w.base.range.unit, "m");
  assert.equal(hash(base), before);
});
test("source mode, date and patch filters prevent historical or DMZ values becoming current MP values", () => {
  for (const mutate of [
    (d) => d.pages.forEach((p) => (p.mode = "dmz")),
    (d) => d.pages.forEach((p) => (p.stage = "beta")),
    (d) => d.pages.forEach((p) => (p.asOf = null)),
    (d) => (d.patchRevision = "b".repeat(64)),
  ]) {
    const data = structuredClone(raw);
    mutate(data);
    const db = hydrateCommunityValues(base, data, base.patchRevision);
    assert.equal(db.weapons.find((w) => w.id === "m4").base.ads, undefined);
    assert.equal(db.attachments.length, base.attachments.length);
  }
});
test("community schemas reject personal fields, wrong weapon identity, wrong units and corrupt distance bands", () => {
  for (const mutate of [
    (d) => (d.progress = {}),
    (d) => (d.pages[0].stats[0].unit = "percent"),
    (d) => (d.pages[0].weaponId = "foreign-game"),
    (d) => (d.pages[0].title = "Another weapon"),
    (d) => (d.pages[0].zones[0].bands[0].to = -1),
    (d) => d.pages.push(d.pages[0]),
    (d) => (d.references[0].url = "javascript:alert(1)"),
  ]) {
    const data = structuredClone(raw);
    mutate(data);
    assert.throws(() => validateCommunityValues(data, catalog));
  }
});
test("all imported recommendation combinations satisfy current slot, compatibility and Apex rules", () => {
  const db = hydrateCommunityValues(base, raw, base.patchRevision);
  const variants = db.community.filter(
    (c) => c.weaponId === "m4" && c.id.startsWith("metka-"),
  );
  assert.equal(
    variants.length,
    4,
    "all four current M4 variants must remain usable",
  );
  const current = db.attachments.find((a) => a.id === "m4-fss-is300");
  assert.equal(current.patchRevision, base.patchRevision);
  assert.equal(current.status, "reported");
  assert.ok(current.sourceIds.includes("metka-m4"));
  assert.equal(
    base.attachments.find((a) => a.id === "m4-fss-is300").patchRevision,
    null,
  );
  for (const c of db.community)
    assert.deepEqual(
      configurationIssues(db, c.weaponId, c.attachments, base.patchRevision),
      [],
    );
});
test("source-based fallback provides an actual cited build without claiming numeric optimality", () => {
  const db = hydrateCommunityValues(base, raw, base.patchRevision);
  const r = optimize(db, "m4", { goal: "meta" });
  assert.equal(r.status, "source-based");
  assert.ok(r.sourceBuild.attachments.length);
  assert.ok(r.sourceBuild.sourceIds.length);
  assert.equal(r.results.length, 0);
  assert.match(r.policy, /nicht ausgewertet/);
  assert.equal(r.sourceBuild.label, "Balanced");
  assert.equal(r.sourceBuild.goalMatch, true);
  assert.equal(
    optimize(db, "m4", { goal: "longshot" }).sourceBuild.label,
    "Mid/long range",
  );
});
test("community TTK respects source distance boundaries, body zones and first-hit timing", () => {
  const near = communityTTK(raw, "m4", { distance: 10 }),
    far = communityTTK(raw, "m4", { distance: 25 }),
    head = communityTTK(raw, "m4", { distance: 10, zone: "Head" });
  assert.equal(near.shots, 5);
  assert.equal(far.shots, 6);
  assert.equal(head.shots, 4);
  assert.ok(Math.abs(near.ms - (4 * 60000) / 811) < 1e-8);
  assert.equal(communityTTK(raw, "m4", { distance: 60 }), null);
  assert.equal(communityTTK(raw, "hyeon-burst"), null);
  assert.equal(communityTTK(raw, "m4", { health: 0 }), null);
});
test("public HTML parser normalizes seconds versus milliseconds and keeps unknown numeric meaning as raw text", () => {
  const html = (reload) =>
    `<main><div class="weapon-page"><h1>M4</h1><div class="hero"><p class="status">Launch data</p></div><dl class="spec"><dt>Reload</dt><dd>${reload}</dd><dt>Fire mode</dt><dd>Full auto</dd></dl></div></main><script type="application/ld+json">{"@type":"Article","dateModified":"2026-10-24"}</script>`;
  for (const unit of ["2.6 s", "2600 ms"])
    assert.equal(
      parseCommunityValues(
        html(unit),
        "https://metka.gg/en/weapons/mw4/m4/",
        "m4",
      ).stats[0].value,
      2600,
    );
  assert.equal(
    parseCommunityValues(
      html("2.6 s"),
      "https://metka.gg/en/weapons/mw4/m4/",
      "m4",
    ).stats[1].metric,
    null,
  );
  assert.throws(() =>
    parseCommunityValues("<h1>Blocked</h1>", "https://metka.gg/", "m4"),
  );
  const ambiguous = parseCommunityValues(
    html("2.6 percent"),
    "https://metka.gg/en/weapons/mw4/m4/",
    "m4",
  );
  assert.equal(ambiguous.stats[0].metric, null);
  assert.equal(ambiguous.stats[0].value, "2.6 percent");
  const rpm = parseCommunityValues(
    html("2.6 s").replace(
      "<dt>Reload</dt><dd>2.6 s</dd>",
      "<dt>Fire rate</dt><dd>1,110 RPM</dd>",
    ),
    "https://metka.gg/en/weapons/mw4/m4/",
    "m4",
  );
  assert.equal(rpm.stats[0].value, 1110);
  assert.equal(rpm.stats[0].unit, "RPM");
});
test("unchanged source values create no update; changed values retain stable review timing and before/after", () => {
  assert.equal(proposeCommunityValueRefresh(base, raw, raw), null);
  const changed = structuredClone(raw);
  changed.pages[0].stats[0].value += 1;
  changed.pages[0].hash = hash(changed.pages[0]);
  changed.hash = hash(changed.pages);
  const first = proposeCommunityValueRefresh(base, raw, changed, {
      now: "2026-10-25T00:00:00Z",
    }),
    again = proposeCommunityValueRefresh(base, raw, changed, {
      now: "2026-10-26T00:00:00Z",
      previous: first.review,
    });
  assert.deepEqual(first, again);
  assert.equal(
    first.database.history[0].sourceValues[0].before.stats[0].value + 1,
    first.database.history[0].sourceValues[0].after.stats[0].value,
  );
  assert.equal(base.weapons.find((w) => w.id === "m4").base.rpm.value, 810);
});
test("a failed public source aborts the collection instead of returning an incomplete replacement", async () => {
  await assert.rejects(
    collectCommunityValues(
      {
        pages: [{ weaponId: "m4", url: "https://metka.gg/en/weapons/mw4/m4/" }],
      },
      async () => {
        throw Error("HTTP 503");
      },
    ),
    /503/,
  );
});
