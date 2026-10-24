import { readJson, atomicJson } from "./lib/io.mjs";
import { validateDatabase } from "../public/engine/database.js";
import { recompute } from "./lib/gunsmith-update.mjs";
const db = validateDatabase(await readJson("public/data/gunsmith.json")),
  meta = await readJson("public/data/meta.json");
await atomicJson(
  "public/data/calculated.json",
  recompute(db, meta.patchRevision),
);
console.log(
  "Recomputed every objective from the validated database. No personal state accessed.",
);
