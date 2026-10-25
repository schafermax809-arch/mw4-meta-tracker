import { readJson } from "./lib/io.mjs";
import { validateState, hash } from "./lib/model.mjs";
const path = process.argv[2] || "public/data/meta.json";
validateState(await readJson(path));
console.log(`Validated ${path}`);

import { validateDatabase } from "../public/engine/database.js";
validateDatabase(
  await readJson(process.argv[3] || "public/data/gunsmith.json"),
);

const db = await readJson(process.argv[3] || "public/data/gunsmith.json");
const calculated = await readJson(
  process.argv[4] || "public/data/calculated.json",
);
const meta = await readJson(path);
const community = await readJson(
  process.argv[5] || "public/data/community-values.json",
);
const { validateCommunityValues } = await import(
  "../public/engine/community-values.js"
);
validateCommunityValues(community, meta);
const { validateAttachmentCatalog } = await import(
  "../public/engine/attachment-catalog.js"
);
const attachmentCatalog = validateAttachmentCatalog(
  await readJson(process.argv[6] || "public/data/attachment-catalog.json"),
  meta,
);
const { hash: catalogHash, ...catalogContent } = attachmentCatalog;
const { validateEffectEvidence } = await import(
  "../public/engine/effect-evidence.js"
);
const effects = validateEffectEvidence(
  await readJson(process.argv[7] || "public/data/effect-evidence.json"),
  meta,
);
const {
  hash: effectsHash,
  checkedAt: effectsCheckedAt,
  ...effectsContent
} = effects;
if (
  calculated.databaseHash !== hash(db) ||
  calculated.patchRevision !== meta.patchRevision ||
  calculated.communityValuesHash !== community.hash ||
  calculated.attachmentCatalogHash !== catalogHash ||
  calculated.effectEvidenceHash !== effectsHash ||
  effectsHash !== hash(effectsContent) ||
  catalogHash !== hash(catalogContent) ||
  community.hash !== hash(community.pages)
)
  throw Error("Calculated results stale: run npm run recompute");
console.log("Validated Gunsmith database and computed database fingerprint");
const { validateResearch } = await import('../public/engine/local-research.js');
validateResearch(await readJson('public/data/manual-research.json'));
console.log('Validated manual research schema (no personal Camo data)');
