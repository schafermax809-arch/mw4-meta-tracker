import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  validateAttachmentCatalog,
  hydrateAttachmentCatalog,
} from "../public/engine/attachment-catalog.js";
import { hydrateCommunityValues } from "../public/engine/community-values.js";
import { configurationIssues } from "../public/engine/database.js";
import {
  parseAttachmentIndex,
  parseWeaponInventory,
  collectAttachmentCatalog,
  proposeCatalogRefresh,
} from "../scripts/lib/attachment-catalog.mjs";
import { hash } from "../scripts/lib/model.mjs";
const read = (n) =>
  JSON.parse(
    fs.readFileSync(new URL("../public/data/" + n + ".json", import.meta.url)),
  );
const raw = read("gunsmith"),
  meta = read("meta"),
  data = read("attachment-catalog"),
  community = read("community-values");
const runtime = () =>
  hydrateAttachmentCatalog(
    hydrateCommunityValues(raw, community, raw.patchRevision),
    data,
    raw.patchRevision,
  );
test("complete published attachment catalog has every declared weapon inventory and a stable content hash", () => {
  validateAttachmentCatalog(data, meta);
  const { hash: actual, ...content } = data;
  assert.equal(actual, hash(content));
  assert.equal(data.profiles.length, meta.weapons.length);
  assert.equal(
    new Set(data.catalog.map((a) => a.id)).size,
    data.catalog.length,
  );
  assert.ok(data.profiles.find((p) => p.weaponId === "m4").declared > 0);
  for (const p of data.profiles) assert.equal(p.declared, p.attachments.length);
});
test("the full catalog is selectable per weapon while old IDs, official values and input data survive unchanged", () => {
  const before = hash(raw),
    d = runtime(),
    w = d.weapons.find((w) => w.id === "m4");
  assert.ok(
    w.catalogAttachmentIds.length >=
      data.profiles.find((p) => p.weaponId === "m4").declared,
  );
  assert.equal(
    w.base.rpm.value,
    raw.weapons.find((w) => w.id === "m4").base.rpm.value,
  );
  assert.ok(w.catalogAttachmentIds.includes("m4-fss-is300"));
  assert.equal(hash(raw), before);
  for (const w of d.weapons)
    for (const id of w.catalogAttachmentIds) {
      const a = d.attachments.find((a) => a.id === id);
      assert.deepEqual(
        configurationIssues(
          d,
          w.id,
          [{ slot: a.slot, attachmentId: id }],
          raw.patchRevision,
        ),
        [],
      );
    }
});
test("all published MP builds keep slot and Apex compatibility; a blocked barrel cannot be equipped with Hurricane", () => {
  const d = runtime(),
    builds = d.community.filter((c) => c.id.startsWith("catalog-build-"));
  assert.equal(
    builds.length,
    data.profiles.reduce((n, p) => n + p.builds.length, 0),
  );
  for (const b of builds)
    assert.deepEqual(
      configurationIssues(d, b.weaponId, b.attachments, raw.patchRevision),
      [],
    );
  const muzzle = d.attachments.find((a) => a.id === "m4-hurricane"),
    barrel = d.attachments.find(
      (a) => a.weaponIds.includes("m4") && a.slot === "Barrel",
    );
  assert.ok(
    configurationIssues(
      d,
      "m4",
      [
        { slot: "Apex", attachmentId: muzzle.id },
        { slot: "Barrel", attachmentId: barrel.id },
      ],
      raw.patchRevision,
    ).length,
  );
});
test("foreign patches cannot relabel old inventories as current", () => {
  const changed = structuredClone(data);
  changed.patchRevision = "b".repeat(64);
  const d = hydrateAttachmentCatalog(raw, changed, raw.patchRevision);
  assert.equal(d.attachments.length, raw.attachments.length);
  assert.equal(
    d.weapons.find((w) => w.id === "m4").catalogAttachmentIds,
    undefined,
  );
});
test("schema rejects progress data, duplicate weapons, malformed slots and dropped inventory rows", () => {
  for (const change of [
    (d) => (d.progress = {}),
    (d) => (d.catalog[0].slot = "Fake"),
    (d) => d.profiles[0].attachments.pop(),
    (d) => (d.profiles[0].weaponId = d.profiles[1].weaponId),
    (d) => (d.catalog[0].url = "javascript:alert(1)"),
  ]) {
    const copy = structuredClone(data);
    change(copy);
    assert.throws(() => validateAttachmentCatalog(copy, meta));
  }
});
test("index parser requires all announced rows and keeps absent unlock levels unknown", () => {
  const html =
    '<main><h1>Modern Warfare 4 Attachments List</h1><p>Complete list of 1 attachments</p><table><tbody><tr><td><a href="/mw4/attachments/test-optic">Test Optic</a></td><td>Optic</td><td>M4</td><td>—</td></tr></tbody></table></main>';
  assert.equal(
    parseAttachmentIndex(html, "https://warzoneloadout.games")[0].unlockLevel,
    null,
  );
  assert.throws(() =>
    parseAttachmentIndex(
      html.replace("of 1", "of 2"),
      "https://warzoneloadout.games",
    ),
  );
  assert.throws(() =>
    parseAttachmentIndex("<h1>Warzone</h1>", "https://warzoneloadout.games"),
  );
});
test("weapon parser rejects wrong identities and incomplete slot lists without inventing levels", () => {
  const html =
    '<main><header><h1>Best M4 Modern Warfare 4 Loadout &amp; Builds</h1><span>1 Attachments</span></header><section><h2 id="attachments-h">M4 Attachments</h2><details><summary><span>▸Optic</span><span>1</span></summary><ul><li><span></span><span><span>Test Optic</span><span>Reflex</span></span></li></ul></details></section></main>';
  const w = meta.weapons.find((w) => w.id === "m4");
  assert.equal(
    parseWeaponInventory(html, "https://warzoneloadout.games/mw4/m4", w)
      .attachments[0].level,
    null,
  );
  assert.throws(() =>
    parseWeaponInventory(
      html.replace("▸Optic</span><span>1", "▸Optic</span><span>2"),
      "https://warzoneloadout.games/mw4/m4",
      w,
    ),
  );
  assert.throws(() =>
    parseWeaponInventory(
      html,
      "https://warzoneloadout.games/mw4/m4",
      meta.weapons[0],
    ),
  );
});
test("unchanged catalogs are no-ops; changed unlocks retain before/after and stable review timing", () => {
  assert.equal(proposeCatalogRefresh(raw, data, data), null);
  const changed = structuredClone(data);
  changed.catalog[0].unlockLevel++;
  const { hash: _, ...content } = changed;
  changed.hash = hash(content);
  const a = proposeCatalogRefresh(raw, data, changed, {
      now: "2026-10-25T00:00:00Z",
    }),
    b = proposeCatalogRefresh(raw, data, changed, {
      now: "2026-10-26T00:00:00Z",
      previous: a.review,
    });
  assert.deepEqual(a, b);
  assert.ok(a.review.changedWeaponIds.includes("axion"));
  assert.equal(
    a.database.history[0].sourceValues[0].after.changed[0].before.unlockLevel +
      1,
    a.database.history[0].sourceValues[0].after.changed[0].after.unlockLevel,
  );
});
test("catalog collection requires configured permission and aborts on a failed source", async () => {
  await assert.rejects(
    collectAttachmentCatalog(
      { permission: { status: "pending" } },
      meta,
      async () => "",
    ),
    /permission/,
  );
  await assert.rejects(
    collectAttachmentCatalog(
      { permission: { status: "user-confirmed" } },
      meta,
      async () => {
        throw Error("HTTP 503");
      },
    ),
    /503/,
  );
});
