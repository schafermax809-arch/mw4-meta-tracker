import { readJson, atomicJson } from "./lib/io.mjs";
import { validateDatabase } from "../public/engine/database.js";
import { recompute } from "./lib/gunsmith-update.mjs";
import { validateCommunityValues } from "../public/engine/community-values.js";
import { validateAttachmentCatalog } from "../public/engine/attachment-catalog.js";
import { validateEffectEvidence } from "../public/engine/effect-evidence.js";
const db = validateDatabase(await readJson("public/data/gunsmith.json")),
  meta = await readJson("public/data/meta.json");
await atomicJson(
  "public/data/calculated.json",
  recompute(
    db,
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
  ),
);
console.log(
  "Recomputed every objective from the validated database. No personal state accessed.",
);
