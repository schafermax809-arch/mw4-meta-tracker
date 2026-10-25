import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseEffect,
  normalName,
  validateEffectEvidence,
  hydrateEffectEvidence,
  effectCoverage,
} from "../public/engine/effect-evidence.js";
import { hydrateCommunityValues } from "../public/engine/community-values.js";
import { hydrateAttachmentCatalog } from "../public/engine/attachment-catalog.js";
import { calculateStats, timeToKill } from "../public/engine/calculator.js";
import { configurationIssues } from "../public/engine/database.js";
import { optimize } from "../public/engine/optimizer.js";
import {
  parseEffectProfile,
  collectEffectEvidence,
  proposeEffectRefresh,
} from "../scripts/lib/effect-evidence.mjs";
import { hash } from "../scripts/lib/model.mjs";
import { recompute } from "../scripts/lib/gunsmith-update.mjs";
const json = async (n) =>
  JSON.parse(
    await readFile(
      new URL("../public/data/" + n + ".json", import.meta.url),
      "utf8",
    ),
  );
const [raw, meta, community, catalog, effects] = await Promise.all(
  [
    "gunsmith",
    "meta",
    "community-values",
    "attachment-catalog",
    "effect-evidence",
  ].map(json),
);
const old = hydrateAttachmentCatalog(
  hydrateCommunityValues(raw, community, raw.patchRevision),
  catalog,
  raw.patchRevision,
);
const db = hydrateEffectEvidence(old, effects, raw.patchRevision);
const ref = (id) => ({
  attachmentId: id,
  slot: db.attachments.find((a) => a.id === id).slot,
});
test("all 33 weapons and all previous attachment IDs are audited without modifying input or personal data", () => {
  const before = hash(old);
  validateEffectEvidence(effects, meta);
  const { hash: stored, checkedAt, ...content } = effects;
  assert.equal(stored, hash(content));
  assert.equal(effectCoverage(db).length, raw.weapons.length);
  assert.ok(effects.profiles.filter((p) => p.state === "available").length > 0);
  assert.ok(
    effects.profiles
      .filter((p) => p.state === "available")
      .every((p) => p.attachments.length >= 10),
  );
  for (const a of old.attachments)
    assert.ok(db.attachments.some((b) => b.id === a.id));
  assert.equal(hash(old), before);
  assert.equal(db.weapons.find((w) => w.id === "m4").base.rpm.value, 810);
  assert.equal(
    db.weapons.find((w) => w.id === "m4").base.horizontalRecoil.unit,
    "°/s",
  );
  assert.ok(db.weapons.some((w) => w.evidenceConflicts?.length));
  for (const c of effectCoverage(db)) {
    assert.equal(c.incomplete, c.attachments);
    assert.equal(c.optimizerReliable, false);
  }
});
test("absolute, additive, percentage and factor claims retain their distinct units and unknowns", () => {
  assert.equal(parseEffect("Magazine = 53").operation, "set");
  assert.equal(parseEffect("ADS In Speed +20 ms").value, 20);
  assert.equal(parseEffect("Move Speed -2%").kind, "percent");
  assert.equal(parseEffect("Muzzle Velocity x1.16").operation, "multiply");
  assert.equal(parseEffect("Sound Suppression").value, null);
  assert.equal(parseEffect("ADS In Speed +7.3%").operation, null);
  assert.equal(parseEffect("Recoil x0.94").metric, null);
  assert.equal(parseEffect("ADS In Speed -6% +120 ms").operation, null);
  assert.equal(parseEffect("Magazine = 0").value, 0); // Explicit zero stays distinct from unknown.
});
test("source percentages are stored without false official verification, invented no-effect metrics or formula upgrades", () => {
  const a = db.attachments.find((a) => a.id === "m4-fss-fireline-grip");
  assert.equal(a.evidence.status, "reported");
  assert.equal(a.effectsComplete, false);
  assert.ok(a.evidence.effects.some((e) => e.raw === "ADS In Speed +20 ms"));
  assert.ok(
    a.evidence.effects.some(
      (e) => e.raw === "Recoil x0.91" && e.operation === null,
    ),
  );
  assert.equal(a.modifiers.length, 0);
  assert.equal(a.evidenceModifiers.find((m) => m.stat === "ads").value, 20);
});
test("known effects produce explicitly partial previews while strict values and TTK remain unavailable", () => {
  const c = calculateStats(db, "m4", [ref("m4-fss-fireline-grip")]);
  assert.equal(c.preview.ads.value, 260);
  assert.equal(c.preview.sprintToFire.value, 225);
  assert.equal(c.preview.ads.complete, false);
  assert.equal(c.previewDeltas.ads.absolute, 20);
  assert.equal(c.values.ads, undefined);
  assert.equal(c.preview.horizontalRecoil, undefined);
  assert.equal(
    timeToKill(db, "m4", [ref("m4-fss-fireline-grip")], {
      distance: 10,
      zone: "upperTorso",
      health: 100,
      healthVerified: true,
    }).available,
    false,
  );
  assert.equal(calculateStats(db, "m4", []).values.ads.value, 240);
});
test("explicit magazine set values work without interpreting a magazine name as evidence", () => {
  const a = db.attachments.find(
    (a) => a.weaponIds.includes("ppsh-41") && a.name === "53 Round Mag",
  );
  const c = calculateStats(db, "ppsh-41", [ref(a.id)]);
  assert.equal(c.preview.magazine.value, 53);
  assert.equal(c.preview.reload.value, 3567);
  const without = structuredClone(db);
  without.attachments.find((x) => x.id === a.id).evidenceModifiers = [];
  assert.equal(
    calculateStats(without, "ppsh-41", [ref(a.id)]).preview.magazine,
    undefined,
  );
});
test("two unknown stacking operations cannot become a fabricated combined ADS result", () => {
  const a = db.attachments.find(
    (a) =>
      a.weaponIds.includes("m4") &&
      a.slot === "Muzzle" &&
      a.evidenceModifiers?.some((m) => m.stat === "ads"),
  );
  const c = calculateStats(db, "m4", [ref("m4-fss-fireline-grip"), ref(a.id)]);
  assert.equal(c.preview.ads, undefined);
  assert.match(c.previewMissing.ads, /Stapelregel/);
});
test("conflicting effects or conflicting baselines never silently average or overwrite evidence", () => {
  const copy = structuredClone(db),
    a = copy.attachments.find((a) => a.id === "m4-fss-fireline-grip");
  a.modifierConflicts = [{ stat: "ads" }];
  assert.equal(calculateStats(copy, "m4", [ref(a.id)]).preview.ads, undefined);
  a.modifierConflicts = [];
  copy.weapons
    .find((w) => w.id === "m4")
    .evidenceConflicts.push({ stat: "ads" });
  assert.match(
    calculateStats(copy, "m4", [ref(a.id)]).previewMissing.ads,
    /Basiswerte/,
  );
});
test("all imported slot choices obey weapon, slot and Apex checks; conflicts remain inspectable but cannot equip", () => {
  for (const a of db.attachments.filter((a) => a.evidence))
    for (const weaponId of a.weaponIds) {
      const issues = configurationIssues(db, weaponId, [
        { slot: a.slot, attachmentId: a.id },
      ]);
      if (a.compatibilityConflict || a.availability !== true)
        assert.ok(issues.length);
      else assert.deepEqual(issues, [], a.name + " " + weaponId);
    }
  const barrel = db.attachments.find(
    (a) =>
      a.weaponIds.includes("m4") &&
      a.slot === "Barrel" &&
      a.availability === true,
  );
  assert.match(
    configurationIssues(db, "m4", [ref("m4-hurricane"), ref(barrel.id)]).join(),
    /blockiert/,
  );
});
test("different patch evidence neither adds current stats nor relabels earlier effects", () => {
  const other = "b".repeat(64),
    x = hydrateEffectEvidence(old, effects, other);
  assert.equal(x.attachments.length, old.attachments.length);
  assert.equal(
    x.attachments.some((a) => a.evidence),
    false,
  );
  assert.equal(
    calculateStats(db, "m4", [ref("m4-fss-fireline-grip")], other).preview.ads,
    undefined,
  );
});
test("all weapon profiles and custom optimizer weights refuse to certify incomplete community evidence", () => {
  for (const w of db.weapons)
    for (const goal of [
      "meta",
      "longshot",
      "headshot",
      "hipfire",
      "multikill",
      "custom",
    ]) {
      const r = optimize(db, w.id, {
        goal,
        ...(goal === "custom" ? { weights: { ads: 100 } } : {}),
      });
      assert.ok(
        ["source-based", "unavailable"].includes(r.status),
        w.name + " " + goal,
      );
      assert.equal(r.results.length, 0);
      assert.equal(r.evaluated, 0);
    }
  const c = recompute(raw, meta.patchRevision, community, catalog, effects);
  assert.equal(c.effectEvidenceHash, effects.hash);
});
test("only punctuation/case variants become aliases; disputed length and Apex names keep all saved IDs", () => {
  assert.notEqual(normalName("16.5 Barrel"), normalName("165 Barrel"));
  assert.notEqual(normalName("1/2x28"), normalName("12x28"));
  for (const a of effects.aliasReviews) {
    assert.equal(a.decision, "keep-separate");
    for (const name of a.names)
      assert.ok(
        db.attachments.some(
          (x) => x.weaponIds.includes(a.weaponId) && x.name === name,
        ),
      );
  }
  assert.ok(db.attachments.some((a) => a.aliases?.length));
});
test("schemas reject progress payloads, foreign pages, wrong weapons and altered numeric interpretations", () => {
  for (const change of [
    (d) => (d.progress = {}),
    (d) => (d.profiles[0].weaponId = "wrong"),
    (d) => (d.profiles[0].url = "https://codmunity.gg/weapon/mw4/m4"),
    (d) => (d.profiles[0].attachments[0].effects[0].value = 987654),
    (d) => d.profiles.push(d.profiles[0]),
  ]) {
    const d = structuredClone(effects);
    change(d);
    assert.throws(() => validateEffectEvidence(d, meta));
  }
});
function html() {
  return `<main><h1>Best M4 Loadout</h1><p>Call of Duty: Modern Warfare 4 · Launch 2026 · Last updated: 24 October 2026</p><a href="https://ggranked.com/games/call-of-duty-modern-warfare-4/meta/weapons/m4">Multiplayer</a><section><h2>M4 Stats</h2><section><h3>Handling</h3><ul>${Array.from({ length: 15 }, (_, i) => `<li><span>${i ? "Unknown " + i : "ADS In Speed"}</span><span>240 ms</span></li>`).join("")}</ul></section></section><section><h2>M4 Attachments</h2><section><h3>Muzzle</h3><ul>${Array.from({ length: 10 }, (_, i) => `<li><div><div><h4>Test ${i}</h4><span>Weapon Unlocks 1</span></div><ul><li>ADS In Speed +20 ms</li></ul></div></li>`).join("")}</ul></section></section></main>`;
}
const url =
  "https://ggranked.com/games/call-of-duty-modern-warfare-4/meta/weapons/m4";
test("HTML parsing reads public attachment facts and rejects wrong games, beta, modes and broken sections", () => {
  const p = parseEffectProfile(html(), url, { id: "m4", name: "M4" });
  assert.equal(p.attachments.length, 10);
  assert.equal(p.attachments[0].effects[0].value, 20);
  for (const change of [
    (s) => s.replace("Call of Duty: Modern Warfare 4", "Black Ops 7"),
    (s) => s.replace("Launch 2026", "Open Beta"),
    (s) => s.replace("Multiplayer", "DMZ"),
    (s) => s.replace("<h2>M4 Attachments</h2>", ""),
    (s) => s.replace("Best M4 Loadout", "Best VEL 46 Loadout"),
  ])
    assert.throws(() =>
      parseEffectProfile(change(html()), url, { id: "m4", name: "M4" }),
    );
});
test("source failure and automation restrictions abort collection without partial published replacement", async () => {
  const config = {
    allowedOrigins: ["https://ggranked.com"],
    index: url,
    restrictions: [{ source: "ggranked / WZ Ranked", automation: "allowed" }],
  };
  await assert.rejects(
    collectEffectEvidence(config, meta, async () => {
      throw Error("offline");
    }),
    /offline/,
  );
  let accessed = false;
  await assert.rejects(
    collectEffectEvidence(
      { ...config, allowedOrigins: ["https://codmunity.gg"] },
      meta,
      async () => {
        accessed = true;
        return html();
      },
    ),
    /not approved/,
  );
  assert.equal(accessed, false);
  await assert.rejects(
    collectEffectEvidence(
      {
        ...config,
        termsUrl: "https://ggranked.com/legal/terms",
        termsFingerprint: "wrong",
      },
      meta,
      async () => "<main>Acceptance of Terms</main>",
    ),
    /terms changed/,
  );
});
test("new catalog weapons keep source discovery working with an explicit unknown effect profile", async () => {
  const config = {
    allowedOrigins: ["https://ggranked.com"],
    index: "https://ggranked.com/games/call-of-duty-modern-warfare-4/meta",
    patchRevision: raw.patchRevision,
    pages: [],
    notApplicable: [],
    restrictions: [
      effects.restrictions.find((r) => r.source === "ggranked / WZ Ranked"),
    ],
    aliasReviews: [],
  };
  const calls = [];
  const result = await collectEffectEvidence(
    config,
    { ...meta, weapons: [{ id: "newly-announced", name: "Newly Announced" }] },
    async (url) => {
      calls.push(url);
      return "<main>Call of Duty: Modern Warfare 4 Launch 2026</main>";
    },
  );
  assert.equal(result.profiles[0].state, "unavailable");
  assert.deepEqual(result.profiles[0].stats, []);
  assert.deepEqual(result.profiles[0].attachments, []);
  assert.deepEqual(calls, [config.index]);
});
test("unchanged facts are no-ops despite a newer check time; changes retain before/after and pending date", () => {
  const copy = structuredClone(effects);
  copy.checkedAt = "2026-10-26T12:00:00Z";
  assert.equal(proposeEffectRefresh(raw, effects, copy), null);
  copy.profiles[0].hash = "a".repeat(64);
  copy.hash = "b".repeat(64);
  const x = proposeEffectRefresh(raw, effects, copy, {
    previous: {
      effectEvidenceHash: copy.hash,
      detectedAt: "2026-10-25T12:00:00Z",
    },
  });
  assert.equal(x.review.detectedAt, "2026-10-25T12:00:00Z");
  assert.equal(x.review.effectChanges[0].before.hash, effects.profiles[0].hash);
  assert.equal(x.review.effectChanges[0].after.hash, copy.profiles[0].hash);
});
