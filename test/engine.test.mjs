import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateDatabase,
  configurationIssues,
  coverageReport,
} from "../public/engine/database.js";
import { calculateStats, timeToKill } from "../public/engine/calculator.js";
import { optimize, objectiveWeights } from "../public/engine/optimizer.js";
import { analyzeCommunity } from "../public/engine/community.js";
import { proposeGunsmith, recompute } from "../scripts/lib/gunsmith-update.mjs";
import {
  parseResearchFeed,
  collectResearch,
} from "../scripts/lib/research.mjs";
import { extractWeaponFacts } from "../scripts/lib/weapon-source.mjs";
import { applyGunsmithReview } from "../scripts/apply-gunsmith-review.mjs";
import { hash } from "../scripts/lib/model.mjs";
const published = JSON.parse(
  await readFile(
    new URL("../public/data/gunsmith.json", import.meta.url),
    "utf8",
  ),
);
const baseline = JSON.parse(
  await readFile(
    new URL("../public/data/research.json", import.meta.url),
    "utf8",
  ),
);
const patch = "a".repeat(64),
  other = "b".repeat(64);
// Deliberately synthetic algorithm fixtures, never shipped as production game data.
function fixture() {
  const db = structuredClone(published);
  db.patchRevision = patch;
  const w = structuredClone(db.weapons.find((w) => w.id === "m4"));
  db.weapons = [w];
  db.attachments = [];
  db.community = [];
  w.base = {};
  w.rules.patchRevision = patch;
  w.rules.maxAttachments = 2;
  w.rules.slots = ["Muzzle", "Barrel", "Stock"];
  w.coverage = {
    ...w.coverage,
    catalogComplete: true,
    compatibilityComplete: true,
    modifiersComplete: true,
    stackingVerified: true,
  };
  w.snapshots = [];
  const value = (value, unit) => ({
    value,
    unit,
    status: "verified",
    patchRevision: patch,
    sourceIds: ["official-weapons"],
  });
  w.base.ads = value(200, "ms");
  w.base.movement = value(5, "m/s");
  w.base.magazine = value(30, "Schuss");
  w.base.rpm = value(600, "RPM");
  const attachment = (id, slot, modifiers, blocks = []) => ({
    id,
    name: id,
    names: { en: id, de: null },
    slot,
    weaponIds: ["m4"],
    unlock: { level: null, condition: "test", sourceIds: ["official-weapons"] },
    pros: [],
    cons: [],
    special: [],
    modifiers: modifiers.map(([stat, operation, value, order]) => ({
      stat,
      operation,
      value,
      order,
      unit: operation === "multiply" ? "factor" : stat === "ads" ? "ms" : "m/s",
      sourceIds: ["official-weapons"],
      patchRevision: patch,
    })),
    effectsComplete: true,
    blocks,
    conflicts: [],
    sourceIds: ["official-weapons"],
    checkedAt: "2026-10-24T00:00:00Z",
    patchRevision: patch,
    status: "verified",
    availability: true,
  });
  db.attachments = [
    attachment("fast", "Muzzle", [["ads", "multiply", 0.8, 1]]),
    attachment("slower", "Muzzle", [["ads", "multiply", 1.1, 1]]),
    attachment("short", "Barrel", [
      ["ads", "add", -20, 2],
      ["movement", "add", 1, 2],
    ]),
    attachment("heavy", "Stock", [["ads", "add", 30, 3]]),
    attachment("apex", "Apex", [["ads", "multiply", 0.5, 4]], ["Barrel"]),
  ];
  return db;
}
const refs = (db, ...ids) =>
  ids.map((id) => ({
    slot: db.attachments.find((a) => a.id === id).slot,
    attachmentId: id,
  }));
test("production database validates and every catalog weapon has a coverage record", async () => {
  const catalog = JSON.parse(
    await readFile(
      new URL("../public/data/meta.json", import.meta.url),
      "utf8",
    ),
  );
  validateDatabase(published, catalog);
  assert.deepEqual(
    new Set(coverageReport(published).map((r) => r.weaponId)),
    new Set(catalog.weapons.map((w) => w.id)),
  );
});
test("schema rejects progress payloads, wrong units, missing provenance and dangling conflicts", () => {
  for (const mutate of [
    (d) => (d.progress = {}),
    (d) => (d.weapons[0].base.rpm.unit = "percent"),
    (d) => (d.weapons[0].base.rpm.sourceIds = []),
    (d) => (d.attachments[0].conflicts = ["missing"]),
  ]) {
    const db = structuredClone(published);
    mutate(db);
    assert.throws(() => validateDatabase(db));
  }
});
test("Apex uses a separate slot but blocks standard slots and respects availability and patches", () => {
  const db = fixture();
  assert.deepEqual(
    configurationIssues(db, "m4", refs(db, "apex", "fast", "heavy")),
    [],
  );
  assert.match(
    configurationIssues(db, "m4", refs(db, "apex", "short")).join(),
    /blockiert/,
  );
  db.attachments[4].availability = null;
  assert.match(
    configurationIssues(db, "m4", refs(db, "apex")).join(),
    /Verfügbarkeit/,
  );
  assert.match(
    configurationIssues(db, "m4", refs(db, "fast"), other).join(),
    /Patch/,
  );
});
test("composition applies source-defined absolute and multiplicative operations in order", () => {
  const db = fixture();
  validateDatabase(db);
  const c = calculateStats(db, "m4", refs(db, "fast", "short"));
  assert.equal(c.values.ads.value, 140);
  assert.equal(c.values.movement.value, 6);
  assert.equal(c.deltas.ads.absolute, -60);
  assert.ok(Math.abs(c.deltas.ads.percent + 30) < 1e-9);
  assert.equal(c.deltas.ads.improved, true);
});
test("incomplete modifiers or missing composition rules never return guessed stats", () => {
  const db = fixture();
  db.attachments[0].effectsComplete = false;
  assert.deepEqual(calculateStats(db, "m4", refs(db, "fast")).values, {});
  db.attachments[0].effectsComplete = true;
  db.weapons[0].coverage.stackingVerified = false;
  assert.deepEqual(calculateStats(db, "m4", refs(db, "fast")).values, {});
});
test("ambiguous operation order, invalid values and stale modifiers fail closed per metric", () => {
  const db = fixture();
  db.attachments[2].modifiers[0].order = 1;
  assert.equal(
    calculateStats(db, "m4", refs(db, "fast", "short")).values.ads,
    undefined,
  );
  db.attachments[2].modifiers[0].order = 2;
  db.attachments[0].modifiers[0].patchRevision = other;
  assert.equal(
    calculateStats(db, "m4", refs(db, "fast")).values.ads,
    undefined,
  );
});
test("verified interactions are applied only when all required parts are selected", () => {
  const db = fixture();
  db.weapons[0].interactions = [
    {
      attachmentIds: ["fast", "short"],
      modifiers: [
        {
          stat: "ads",
          operation: "add",
          value: 10,
          unit: "ms",
          order: 5,
          sourceIds: ["official-weapons"],
          patchRevision: patch,
        },
      ],
      sourceIds: ["official-weapons"],
      patchRevision: patch,
    },
  ];
  assert.equal(
    calculateStats(db, "m4", refs(db, "fast", "short")).values.ads.value,
    150,
  );
  assert.equal(
    calculateStats(db, "m4", refs(db, "fast")).values.ads.value,
    160,
  );
});
test("exact snapshots override missing combination rules only for that exact patch/build", () => {
  const db = fixture(),
    w = db.weapons[0];
  w.coverage.stackingVerified = false;
  w.snapshots = [
    {
      attachments: refs(db, "fast"),
      values: { ads: { ...w.base.ads, value: 151 } },
      patchRevision: patch,
      sourceIds: ["official-weapons"],
    },
  ];
  assert.equal(
    calculateStats(db, "m4", refs(db, "fast")).values.ads.value,
    151,
  );
  assert.equal(
    calculateStats(db, "m4", refs(db, "short")).values.ads,
    undefined,
  );
  assert.equal(
    calculateStats(db, "m4", refs(db, "fast"), other).values.ads,
    undefined,
  );
});
test("TTK uses body-zone distance bands and timing, rejects unmodelled effects and permits complete unchanged damage profiles", () => {
  const db = fixture(),
    w = db.weapons[0];
  w.damageProfile = {
    patchRevision: patch,
    sourceIds: ["official-weapons"],
    bands: [
      { from: 0, to: 20, zones: { head: 50, upperTorso: 34 } },
      { from: 20, to: null, zones: { head: 30, upperTorso: 25 } },
    ],
  };
  w.fireModel = {
    type: "continuous",
    preFireMs: 10,
    patchRevision: patch,
    sourceIds: ["official-weapons"],
  };
  validateDatabase(db);
  const c = {
    distance: 19,
    zone: "upperTorso",
    health: 100,
    healthVerified: true,
  };
  assert.equal(timeToKill(db, "m4", [], c).ms, 210);
  assert.equal(timeToKill(db, "m4", [], { ...c, distance: 20 }).shots, 4);
  assert.equal(
    timeToKill(db, "m4", [], { ...c, healthVerified: false }).available,
    false,
  );
  w.fireModel.type = "burst";
  assert.equal(timeToKill(db, "m4", [], c).available, false);
  w.fireModel.type = "continuous";
  assert.equal(timeToKill(db, "m4", refs(db, "fast"), c).ms, 210);
  db.attachments[0].effectsComplete = false;
  assert.equal(timeToKill(db, "m4", refs(db, "fast"), c).available, false);
});
test("verified fire-rate and explicitly sourced range scaling alter TTK; unmodelled damage changes fail closed", () => {
  const db = fixture(),
    w = db.weapons[0];
  w.damageProfile = {
    patchRevision: patch,
    sourceIds: ["official-weapons"],
    bands: [
      { from: 0, to: 20, zones: { upperTorso: 50 } },
      { from: 20, to: null, zones: { upperTorso: 25 } },
    ],
  };
  w.fireModel = {
    type: "continuous",
    preFireMs: 10,
    patchRevision: patch,
    sourceIds: ["official-weapons"],
  };
  const context = {
    distance: 25,
    zone: "upperTorso",
    health: 100,
    healthVerified: true,
  };
  db.attachments[0].modifiers = [
    {
      stat: "rpm",
      operation: "multiply",
      value: 2,
      unit: "factor",
      order: 1,
      sourceIds: ["official-weapons"],
      patchRevision: patch,
    },
  ];
  assert.equal(timeToKill(db, "m4", refs(db, "fast"), context).ms, 160);
  w.base.range = {
    value: 20,
    unit: "m",
    sourceIds: ["official-weapons"],
    patchRevision: patch,
    status: "verified",
  };
  db.attachments[0].modifiers = [
    {
      stat: "range",
      operation: "multiply",
      value: 2,
      unit: "factor",
      order: 1,
      sourceIds: ["official-weapons"],
      patchRevision: patch,
    },
  ];
  assert.equal(
    timeToKill(db, "m4", refs(db, "fast"), context).available,
    false,
  );
  w.damageProfile.rangeScaling = "all-boundaries";
  assert.equal(timeToKill(db, "m4", refs(db, "fast"), context).ms, 110);
  db.attachments[0].modifiers = [
    {
      stat: "damage",
      operation: "set",
      value: 100,
      unit: "HP",
      order: 1,
      sourceIds: ["official-weapons"],
      patchRevision: patch,
    },
  ];
  assert.equal(
    timeToKill(db, "m4", refs(db, "fast"), context).available,
    false,
  );
});
test("exhaustive optimizer finds the global valid optimum, including separate Apex rules", () => {
  const db = fixture();
  const r = optimize(db, "m4", { goal: "custom", weights: { ads: 100 } });
  assert.equal(r.status, "optimal");
  assert.equal(r.algorithm, "exhaustive");
  assert.deepEqual(
    new Set(r.results[0].attachments.map((a) => a.attachmentId)),
    new Set(["apex", "fast"]),
  );
  assert.equal(r.results[0].values.ads, 80);
  assert.equal(r.unknown, 0);
});
test("optimizer includes empty slots and does not fill a harmful slot", () => {
  const db = fixture();
  const r = optimize(db, "m4", { weights: { ads: 100 }, allowApex: false });
  assert.deepEqual(r.results[0].attachments.map((a) => a.attachmentId).sort(), [
    "fast",
    "short",
  ]);
  assert.ok(!r.results[0].attachments.some((a) => a.attachmentId === "heavy"));
});
test("limited catalog or uncomputed combinations cannot claim certified global optimality", () => {
  const db = fixture();
  db.weapons[0].coverage.catalogComplete = false;
  assert.equal(optimize(db, "m4", { weights: { ads: 100 } }).status, "partial");
  db.weapons[0].coverage.catalogComplete = true;
  db.attachments[1].effectsComplete = false;
  assert.equal(optimize(db, "m4", { weights: { ads: 100 } }).status, "partial");
});
test("large search uses bounded deterministic beam and reports no optimality guarantee", () => {
  const db = fixture(),
    options = {
      weights: { ads: 100 },
      exhaustiveLimit: 1,
      beamWidth: 2,
      maxEvaluations: 100,
    };
  const a = optimize(db, "m4", options),
    b = optimize(db, "m4", options);
  assert.equal(a.algorithm, "beam");
  assert.equal(a.status, "partial");
  assert.deepEqual(a, b);
  assert.ok(a.evaluated <= 100);
  const c = optimize(db, "m4", { ...options, maxEvaluations: 1 });
  assert.equal(c.truncated, true);
});
test("missing weighted stats, unknown longshot distances, invalid weights and stale patches block optimization", () => {
  const db = fixture();
  assert.equal(
    optimize(db, "m4", { weights: { range: 100 } }).status,
    "unavailable",
  );
  assert.equal(
    optimize(db, "m4", { goal: "longshot", weights: { ads: 100 } }).status,
    "unavailable",
  );
  assert.equal(
    optimize(db, "m4", { weights: { ads: 100 }, patch: other }).status,
    "unavailable",
  );
  assert.throws(() => optimize(db, "m4", { weights: { ads: -1 } }));
  assert.throws(() => optimize(db, "m4", { weights: { ads: 0 } }));
  assert.notDeepEqual(
    objectiveWeights("meta", "smg"),
    objectiveWeights("meta", "lmg"),
  );
});
test("community deduplicates syndication, ignores votes, excludes wrong patch/mode and exposes disagreement", () => {
  const db = fixture();
  const record = (id, attachment, sourceIds = ["esports-m4"]) => ({
    id,
    weaponId: "m4",
    attachments: refs(db, attachment),
    sourceIds,
    publishedAt: "2026-10-23",
    checkedAt: "2026-10-24T00:00:00Z",
    patchRevision: patch,
    mode: "multiplayer",
    reviewed: true,
    testSupported: false,
    note: "",
  });
  db.community = [
    record("a", "fast"),
    record("b", "fast"),
    record("c", "fast", ["insider-m4"]),
    record("d", "short"),
    { ...record("old", "fast"), patchRevision: other },
    { ...record("dmz", "fast"), mode: "dmz" },
  ];
  const r = analyzeCommunity(db, "m4");
  assert.equal(r.builds[0].independentSources, 2);
  assert.equal(r.builds[0].confidence, "medium");
  assert.equal(r.excluded.length, 2);
  assert.equal(r.disagreement, true);
  assert.equal(
    r.recurring.find((a) => a.attachmentId === "fast").independentSources,
    2,
  );
});
test("official parser captures facts and Apex blocks but never interprets ambiguous BPM as RPM", () => {
  const html =
    '<div class="article-body-container"><h4>M4</h4><p>Levels: 72</p><p>Rounds: 30</p><p>Reserve: 90</p><p>Fire Rate: 260 BPM</p><p>Attachment Types: Muzzle, Barrel</p><p>Apex Attachment: Hurricane</p><p>Blocks Barrel and Magazine Attachments.</p></div>';
  const [w] = extractWeaponFacts(html);
  assert.equal(w.rpm, null);
  assert.equal(w.magazine, 30);
  assert.deepEqual(w.apex.blocks, ["Barrel", "Magazine"]);
  assert.throws(() => extractWeaponFacts("<p>blocked</p>"));
});
test("RSS discovery filters wrong game, validates origin and does not mistake empty MW4 results for errors", async () => {
  const xml =
    "<rss><channel><item><title>Best M4 Modern Warfare 4 loadout</title><link>https://esports.gg/a</link><pubDate>24 Oct 2026 00:00:00 GMT</pubDate></item><item><title>BO7</title><link>https://esports.gg/b</link></item></channel></rss>";
  assert.equal(parseResearchFeed(xml, "https://esports.gg/feed/").length, 1);
  assert.throws(() =>
    parseResearchFeed(
      xml.replace("https://esports.gg/a", "https://evil.test/a"),
      "https://esports.gg/feed/",
    ),
  );
  assert.equal(
    parseResearchFeed(
      xml.replace("Modern Warfare 4", "BO7"),
      "https://esports.gg/feed/",
    ).length,
    0,
  );
  await assert.rejects(
    collectResearch(
      { feeds: ["https://esports.gg/feed/"], watch: [] },
      async () => {
        throw Error("offline");
      },
    ),
  );
});
test("unchanged daily research creates no proposal and never mutates live data", () => {
  const before = JSON.stringify(published),
    docs = Object.entries(baseline.officialDocuments).map(([url, hash]) => ({
      url,
      hash,
      weaponFacts: baseline.officialWeapons,
    }));
  assert.equal(
    proposeGunsmith(published, baseline, docs, baseline.documents),
    null,
  );
  assert.equal(JSON.stringify(published), before);
});
test("new explicit facts are staged, historic values retained and identical pending reviews remain stable", () => {
  const db = structuredClone(published),
    facts = structuredClone(baseline.officialWeapons);
  facts.find((w) => w.id === "m4").magazine = 31;
  const docs = Object.entries(baseline.officialDocuments).map(
    ([url, hash]) => ({ url, hash, weaponFacts: facts, signals: {} }),
  );
  const a = proposeGunsmith(db, baseline, docs, baseline.documents, {
      now: "2026-10-25T00:00:00Z",
    }),
    b = proposeGunsmith(db, baseline, docs, baseline.documents, {
      now: "2026-10-26T00:00:00Z",
      previous: a.review,
    });
  assert.equal(
    a.database.weapons.find((w) => w.id === "m4").base.magazine.value,
    31,
  );
  assert.equal(db.weapons.find((w) => w.id === "m4").base.magazine.value, 30);
  assert.deepEqual(a, b);
  assert.equal(a.review.policy, "REVIEW_REQUIRED");
});
test("new patch recomputation never relabels old measurements as current", () => {
  const r = recompute(fixture(), other);
  assert.equal(r.weapons[0].objectives.meta.status, "unavailable");
  assert.equal(r.patchRevision, other);
});
test("review requires the current base hash, rejects deletions/progress, records before/after and recomputes", () => {
  const db = fixture(),
    w = structuredClone(db.weapons[0]);
  w.base.ads.value = 210;
  const approval = {
    baseHash: hash(db),
    patchRevision: patch,
    weapons: [w],
    attachments: [],
    community: [],
    sources: [],
  };
  const r = applyGunsmithReview(db, approval, patch, "2026-10-24T01:00:00Z");
  assert.equal(
    r.database.history[0].changes.weapons[0].before.base.ads.value,
    200,
  );
  assert.equal(
    r.database.history[0].changes.weapons[0].after.base.ads.value,
    210,
  );
  assert.equal(r.computed.databaseHash, hash(r.database));
  assert.equal(db.weapons[0].base.ads.value, 200);
  assert.throws(() =>
    applyGunsmithReview(db, { ...approval, baseHash: "wrong" }, patch),
  );
  assert.throws(() =>
    applyGunsmithReview(db, { ...approval, progress: {} }, patch),
  );
  assert.throws(() =>
    applyGunsmithReview(db, { ...approval, deleteWeapon: "m4" }, patch),
  );
  assert.throws(() => applyGunsmithReview(db, approval, other));
});
test("a no-op review does not touch dates, history or source data", () => {
  const db = fixture();
  assert.equal(
    applyGunsmithReview(
      db,
      {
        baseHash: hash(db),
        patchRevision: patch,
        weapons: [structuredClone(db.weapons[0])],
        attachments: [],
        community: [],
        sources: [],
      },
      patch,
    ),
    null,
  );
});
test("new catalog weapons get explicit missing-data records before detailed weapon guides exist", () => {
  const docs = Object.entries(baseline.officialDocuments).map(
    ([url, hash]) => ({ url, hash, weaponFacts: baseline.officialWeapons }),
  );
  const result = proposeGunsmith(
    published,
    baseline,
    docs,
    baseline.documents,
    {
      catalog: [
        ...published.weapons,
        {
          id: "future-test-weapon",
          name: "Future test weapon",
          weaponClass: "smg",
        },
      ],
      now: "2026-10-25T00:00:00Z",
    },
  );
  const w = result.database.weapons.find((w) => w.id === "future-test-weapon");
  assert.deepEqual(w.base, {});
  assert.equal(w.rules.maxAttachments, null);
  assert.equal(w.coverage.catalogComplete, false);
  assert.ok(result.review.changedWeaponIds.includes(w.id));
  assert.equal(result.database.history[0].changes.weapons.at(-1).before, null);
});
test("Hybrid requires actual overlap between computable candidates and current community builds", () => {
  const db = fixture();
  db.community = [
    {
      id: "source-build",
      weaponId: "m4",
      attachments: refs(db, "short"),
      sourceIds: ["esports-m4"],
      publishedAt: "2026-10-23",
      checkedAt: "2026-10-24T00:00:00Z",
      patchRevision: patch,
      mode: "multiplayer",
      reviewed: true,
      testSupported: false,
      note: "",
    },
  ];
  let r = optimize(db, "m4", { weights: { ads: 100 } });
  assert.ok(r.hybrid.attachments.some((a) => a.attachmentId === "short"));
  db.attachments.find((a) => a.id === "short").effectsComplete = false;
  r = optimize(db, "m4", { weights: { ads: 100 } });
  assert.equal(r.hybrid, null);
});
