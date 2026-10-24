import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  weaponProgress,
  planGrind,
  prerequisitesMet,
  filterWeapons,
  savePreferences,
  loadPreferences,
} from "../public/library.js";
import {
  saveBuild,
  loadBuilds,
  deleteBuild,
  buildIssues,
  setAttachment,
  verifiedStats,
  shareBuild,
  parseSharedBuild,
  validateSavedBuild,
  BUILDS_KEY,
} from "../public/gunsmith.js";
import { PROGRESS_KEY } from "../public/progress.js";
const patch = "a".repeat(64),
  older = "b".repeat(64);
const weapon = {
  id: "test-rifle",
  name: "Test Rifle",
  weaponClass: "assault-rifle",
  tier: null,
  tierRevision: null,
  camos: [
    { id: "military-1", target: 10, dependsOn: [] },
    { id: "military-2", target: 20, dependsOn: ["military-1"] },
  ],
};
const catalog = [
  {
    id: "test-optic",
    name: "Test Optic",
    slot: "Optic",
    weaponIds: ["test-rifle"],
  },
  {
    id: "test-barrel",
    name: "Test Barrel",
    slot: "Barrel",
    weaponIds: ["test-rifle"],
  },
  {
    id: "other-optic",
    name: "Other",
    slot: "Optic",
    weaponIds: ["other-rifle"],
  },
];
const rules = {
  slots: ["Optic", "Barrel"],
  maxAttachments: 1,
  patchRevision: patch,
};
const build = (id = "test-build") => ({
  id,
  weaponId: "test-rifle",
  name: "Mein Build Ü",
  attachments: [{ slot: "Optic", attachmentId: "test-optic" }],
  patchRevision: patch,
  savedAt: "2026-10-24T12:00:00.000Z",
});
function storage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    map,
  };
}
test("unverified Camo requirements never count as zero-percent known progress", () => {
  assert.equal(
    weaponProgress({ ...weapon, camos: [] }, { entries: {} }).percent,
    null,
  );
});
test("Camo totals clamp display without changing stored counts", () => {
  const p = {
    entries: {
      "test-rifle:military-1": 35,
      "test-rifle:military-2": 10,
      "old-weapon:old-camo": 99,
    },
  };
  const before = JSON.stringify(p);
  const stats = weaponProgress(weapon, p);
  assert.equal(stats.percent, 75);
  assert.equal(stats.completed, 1);
  assert.equal(JSON.stringify(p), before);
});
test("completing a prerequisite unlocks the next Camo without changing its counter", () => {
  const p = {
    entries: { "test-rifle:military-1": 9, "test-rifle:military-2": 0 },
  };
  assert.equal(prerequisitesMet(weapon, weapon.camos[1], p), false);
  p.entries["test-rifle:military-1"] = 10;
  assert.equal(prerequisitesMet(weapon, weapon.camos[1], p), true);
  assert.equal(p.entries["test-rifle:military-2"], 0);
});
test("planner excludes unknown weapons and finished goals and obeys prerequisites", () => {
  const unknown = { ...weapon, id: "unknown", camos: [] };
  const p = { entries: { "test-rifle:military-1": 10 } };
  const plan = planGrind([unknown, weapon], p);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].next.id, "military-2");
  p.entries["test-rifle:military-2"] = 20;
  assert.equal(planGrind([unknown, weapon], p).length, 0);
});
test("search, favorite and unknown-tier filters compose correctly", () => {
  const context = {
    progress: { entries: {} },
    favorites: ["test-rifle"],
    patchRevision: patch,
    changedWeaponIds: [],
  };
  assert.equal(
    filterWeapons(
      [weapon],
      { query: "RIFLE", favoritesOnly: true, tier: "unknown" },
      context,
    ).length,
    1,
  );
  assert.equal(
    filterWeapons([weapon], { query: "missing" }, context).length,
    0,
  );
  assert.equal(
    filterWeapons([weapon], { progressFilter: "unknown" }, context).length,
    0,
  );
});
test("favorite storage never touches the legacy progress key", () => {
  const s = storage();
  s.setItem(PROGRESS_KEY, "original bytes");
  savePreferences(s, {
    schemaVersion: 1,
    favorites: ["test-rifle", "test-rifle"],
  });
  assert.deepEqual(loadPreferences(s).favorites, ["test-rifle"]);
  assert.equal(s.getItem(PROGRESS_KEY), "original bytes");
});
test("verified attachment limits and weapon compatibility are enforced", () => {
  const one = setAttachment(
    weapon,
    [],
    "Optic",
    "test-optic",
    catalog,
    rules,
    patch,
  );
  assert.equal(one.length, 1);
  assert.throws(
    () =>
      setAttachment(
        weapon,
        one,
        "Barrel",
        "test-barrel",
        catalog,
        rules,
        patch,
      ),
    /Maximal/,
  );
  assert.throws(
    () =>
      setAttachment(weapon, [], "Optic", "other-optic", catalog, rules, patch),
    /kompatibel/,
  );
});
test("unknown limits and stale rules prevent guessed attachment configurations", () => {
  assert.throws(
    () =>
      setAttachment(
        weapon,
        [],
        "Optic",
        "test-optic",
        catalog,
        { ...rules, maxAttachments: null },
        patch,
      ),
    /Aufsatzlimit/,
  );
  assert.throws(
    () =>
      setAttachment(
        weapon,
        [],
        "Optic",
        "test-optic",
        catalog,
        { ...rules, patchRevision: older },
        patch,
      ),
    /Slot-Regeln/,
  );
});
test("removing an invalidated attachment remains possible after a patch", () => {
  const invalid = [{ slot: "Optic", attachmentId: "removed" }];
  assert.deepEqual(
    setAttachment(weapon, invalid, "Optic", null, [], null, patch),
    [],
  );
});
test("slot blocking and conflicting attachments are enforced", () => {
  const blocked = [{ ...catalog[0], blocks: ["Barrel"] }, catalog[1]];
  assert.throws(
    () =>
      setAttachment(
        weapon,
        [{ slot: "Barrel", attachmentId: "test-barrel" }],
        "Optic",
        "test-optic",
        blocked,
        { ...rules, maxAttachments: 2 },
        patch,
      ),
    /blockierter Slot/,
  );
});
test("custom builds survive reload and a new patch without being rewritten", () => {
  const s = storage();
  s.setItem(PROGRESS_KEY, "progress bytes");
  const data = saveBuild(s, { schemaVersion: 1, builds: [] }, build());
  const before = s.getItem(BUILDS_KEY);
  assert.deepEqual(loadBuilds(s), data);
  assert(
    buildIssues(
      weapon,
      data.builds[0].attachments,
      [],
      rules,
      older,
      patch,
    ).some((x) => x.includes("älteren Patch")),
  );
  assert.equal(s.getItem(BUILDS_KEY), before);
  assert.equal(s.getItem(PROGRESS_KEY), "progress bytes");
});
test("custom build editing and deletion preserve unrelated builds and progress", () => {
  const s = storage();
  s.setItem(PROGRESS_KEY, "untouched");
  let d = saveBuild(s, { schemaVersion: 1, builds: [] }, build("one"));
  d = saveBuild(s, d, build("two"));
  d = saveBuild(s, d, { ...build("one"), name: "Edited" });
  assert.equal(d.builds.length, 2);
  assert.equal(d.builds[0].name, "Edited");
  d = deleteBuild(s, d, "one");
  assert.equal(d.builds[0].id, "two");
  assert.equal(s.getItem(PROGRESS_KEY), "untouched");
});
test("corrupted saved builds are rejected without silently replacing storage", () => {
  const s = storage();
  s.setItem(BUILDS_KEY, '{"broken":true}');
  assert.throws(() => loadBuilds(s));
  assert.equal(s.getItem(BUILDS_KEY), '{"broken":true}');
  assert.throws(
    () =>
      validateSavedBuild({
        ...build(),
        attachments: [...build().attachments, ...build().attachments],
      }),
    /Doppelt/,
  );
});
test("statistics require an exact reviewed loadout and the current patch", () => {
  const refs = build().attachments;
  const stats = {
    weapons: {
      "test-rifle": {
        statistics: {
          patchRevision: patch,
          sourceUrls: ["https://example.com/verified-test"],
          snapshots: [
            {
              attachments: [],
              values: { damage: { value: 25, unit: "HP", scaleMax: 100 } },
            },
            {
              attachments: refs,
              values: { damage: { value: 28, unit: "HP", scaleMax: 100 } },
            },
          ],
        },
      },
    },
  };
  assert.equal(verifiedStats(weapon.id, refs, stats, patch).damage.value, 28);
  assert.equal(
    verifiedStats(
      weapon.id,
      [{ slot: "Barrel", attachmentId: "test-barrel" }],
      stats,
      patch,
    ),
    null,
  );
  assert.equal(verifiedStats(weapon.id, refs, stats, older), null);
  assert.equal(verifiedStats(weapon.id, [], {}, patch), null);
});
test("shared build links preserve Unicode and reject malformed or oversized payloads", () => {
  assert.deepEqual(parseSharedBuild(shareBuild(build())), build());
  assert.throws(() => parseSharedBuild("!invalid"));
  assert.throws(() => parseSharedBuild("x".repeat(12001)));
  assert.throws(() => validateSavedBuild({ ...build(), progress: {} }));
});
test("presentation keeps source-qualified assets separate from game and personal data", async () => {
  const p = JSON.parse(
    await readFile(
      new URL("../public/data/presentation.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(p.schemaVersion, 1);
  for (const [id, w] of Object.entries(p.weapons)) {
    assert(Array.isArray(w.rules.slots));
    assert.equal(w.rules.maxAttachments, null);
    if (w.asset) {
      assert(w.asset.license && w.asset.sourceUrl && w.asset.licenseUrl);
      assert.match(w.asset.caption, /kein MW4-Spielrender/);
      await readFile(
        new URL(
          "../public/" + w.asset.image.replace(/^\.\//, ""),
          import.meta.url,
        ),
      );
    }
  }
  const meta = JSON.parse(
    await readFile(
      new URL("../public/data/meta.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(meta.weapons.length, 33);
  assert.equal(meta.attachments.length, 0);
});
