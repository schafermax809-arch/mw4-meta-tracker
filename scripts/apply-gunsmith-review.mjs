import { readJson, atomicJson } from "./lib/io.mjs";
import { hash, canonical } from "./lib/model.mjs";
import { validateDatabase } from "../public/engine/database.js";
import { validateCommunityValues } from "../public/engine/community-values.js";
import { validateAttachmentCatalog } from "../public/engine/attachment-catalog.js";
import { validateEffectEvidence } from "../public/engine/effect-evidence.js";
import { recompute } from "./lib/gunsmith-update.mjs";
export function applyGunsmithReview(
  current,
  approval,
  patch,
  now = new Date().toISOString(),
) {
  if (
    !approval ||
    Object.keys(approval).some(
      (k) =>
        ![
          "baseHash",
          "patchRevision",
          "weapons",
          "attachments",
          "community",
          "sources",
        ].includes(k),
    )
  )
    throw Error("Unexpected review field");
  if (approval.baseHash !== hash(current)) throw Error("Stale review");
  if (approval.patchRevision !== patch)
    throw Error("Review must target the published patch");
  const next = structuredClone(current),
    changes = { weapons: [], attachments: [], community: [] };
  for (const key of ["sources", "weapons", "attachments", "community"]) {
    if (!Array.isArray(approval[key])) throw Error("Review lists required");
    if (new Set(approval[key].map((v) => v.id)).size !== approval[key].length)
      throw Error("Duplicate review IDs");
    for (const value of approval[key]) {
      const i = next[key].findIndex((v) => v.id === value.id),
        before = i < 0 ? null : next[key][i];
      if (canonical(before) === canonical(value)) continue;
      if (key !== "sources")
        changes[key].push({
          id: value.id,
          before: structuredClone(before),
          after: structuredClone(value),
        });
      if (i < 0) next[key].push(structuredClone(value));
      else next[key][i] = structuredClone(value);
    }
  }
  if (canonical(next) === canonical(current)) return null;
  next.patchRevision = patch;
  next.reviewedAt = now;
  const weaponIds = [
    ...new Set([
      ...changes.weapons.map((c) => c.id),
      ...changes.attachments.flatMap((c) => [
        ...(c.before?.weaponIds ?? []),
        ...c.after.weaponIds,
      ]),
      ...changes.community.map((c) => c.after.weaponId),
    ]),
  ];
  next.history.unshift({
    at: now,
    patchRevision: patch,
    summary: `Geprüftes Gunsmith-Update: ${weaponIds.length} betroffene Waffen.`,
    changedWeaponIds: weaponIds,
    changes,
  });
  validateDatabase(next);
  return { database: next, computed: recompute(next, patch) };
}
if (
  process.argv[1]?.replaceAll("\\", "/").endsWith("/apply-gunsmith-review.mjs")
) {
  const input = process.argv[process.argv.indexOf("--input") + 1];
  if (!process.argv.includes("--input") || !input)
    throw Error(
      "Usage: node scripts/apply-gunsmith-review.mjs --input reviews/gunsmith-approved.json",
    );
  const current = await readJson("public/data/gunsmith.json"),
    meta = await readJson("public/data/meta.json");
  const result = applyGunsmithReview(
    current,
    await readJson(input),
    meta.patchRevision,
  );
  if (result) {
    result.computed = recompute(
      result.database,
      meta.patchRevision,
      validateCommunityValues(
        await readJson("public/data/community-values.json"),
        meta,
      ),
      validateAttachmentCatalog(
        await readJson("public/data/attachment-catalog.json"),
        meta,
      ),
      validateEffectEvidence(
        await readJson("public/data/effect-evidence.json"),
        meta,
      ),
    );
    await atomicJson("public/data/calculated.json", result.computed);
    await atomicJson("public/data/gunsmith.json", result.database);
    console.log(
      "Validated review applied locally. Inspect diff and merge through GitHub.",
    );
  } else console.log("No actual changes.");
}
