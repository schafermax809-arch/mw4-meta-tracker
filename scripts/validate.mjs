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
if (
  calculated.databaseHash !== hash(db) ||
  calculated.patchRevision !== meta.patchRevision
)
  throw Error("Calculated results stale: run npm run recompute");
console.log("Validated Gunsmith database and computed database fingerprint");
