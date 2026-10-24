import { collectResearch } from "./lib/research.mjs";
import { proposeGunsmith } from "./lib/gunsmith-update.mjs";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { collect } from "./lib/sources.mjs";
import { propose } from "./lib/update.mjs";
import { readJson, atomicJson } from "./lib/io.mjs";

await mkdir("work", { recursive: true });
try {
  const current = await readJson("public/data/meta.json");
  const config = await readJson("config/sources.json");
  let previous = null;
  try {
    previous = await readJson("work/previous-review.json");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const docs = await collect(config);
  const result = propose(current, docs, { previous });
  const db = await readJson("public/data/gunsmith.json"),
    baseline = await readJson("public/data/research.json");
  let previousGunsmith = null;
  try {
    previousGunsmith = await readJson("work/previous-gunsmith-review.json");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const research = await collectResearch(
    await readJson("config/research-sources.json"),
  );
  const engineResult = proposeGunsmith(db, baseline, docs, research, {
    previous: previousGunsmith,
    catalog: (result?.state ?? current).weapons,
  });
  const changed = Boolean(result || engineResult);
  if (engineResult) {
    await atomicJson(
      "work/candidate/data/gunsmith.json",
      engineResult.database,
    );
    await atomicJson(
      "work/candidate/data/research.json",
      engineResult.baseline,
    );
    await atomicJson(
      "work/candidate/data/calculated.json",
      engineResult.computed,
    );
    await atomicJson(
      "work/candidate/reviews/gunsmith-pending.json",
      engineResult.review,
    );
  }
  if (!result && engineResult) {
    await atomicJson("work/candidate/data/meta.json", current);
    await atomicJson(
      "work/candidate/reviews/pending.json",
      previous ?? {
        schemaVersion: 1,
        policy: "REVIEW_REQUIRED",
        note: "Gunsmith-/Quellenprüfung; Kernkatalog unverändert.",
      },
    );
  }
  if (!engineResult && result) {
    for (const name of ["gunsmith", "research", "calculated"])
      await atomicJson(
        "work/candidate/data/" + name + ".json",
        await readJson("public/data/" + name + ".json"),
      );
    await atomicJson("work/candidate/reviews/gunsmith-pending.json", {
      schemaVersion: 1,
      policy: "REVIEW_REQUIRED",
      note: "Offizielle Quelle geändert; bisherige Gunsmith-Werte bleiben am alten Patch.",
      recomputeRequired: true,
    });
  }
  if (result)
    await atomicJson(
      "work/candidate/data/calculated.json",
      (await import("./lib/gunsmith-update.mjs")).recompute(
        engineResult?.database ?? db,
        result.state.patchRevision,
      ),
    );
  const report = {
    checkedAt: new Date().toISOString(),
    status: changed ? "review-required" : "unchanged",
    researchSources: research.map((d) => ({ url: d.url, hash: d.hash })),
    manualSources: db.sources
      .filter((s) => s.automation !== "allowed")
      .map((s) => ({ url: s.url, status: s.automation })),
    sources: docs.map((d) => ({ url: d.url, hash: d.hash })),
  };
  await atomicJson("work/run-report.json", report);
  if (result) {
    // Write to staging only. The workflow promotes validated staging to a proposal branch.
    await atomicJson("work/candidate/data/meta.json", result.state);
    await atomicJson("work/candidate/reviews/pending.json", result.review);
    await writeFile(
      "work/pr-body.md",
      `## Neue MW4-Quellen zur Prüfung\n\n${result.review.documents.length} Quellenrevision(en), ${result.review.changedWeaponIds.length} geänderte Waffen.\n\nDie vorgeschlagene Datendatei wird erst durch das Mergen dieses PRs veröffentlicht. Tier-Einstufungen und Builds werden niemals aus Patchtexten geraten.\n\n### Quellen\n\n${result.review.documents.map((d) => `- [${d.title.replace(/[\[\]]/g, "")}](${d.url}) — ${d.publishedAt ?? "Datum unbekannt"}; SHA-256: \`${d.hash}\`; Waffen: ${d.signals.weapons}, Camos: ${d.signals.camos}, Builds: ${d.signals.builds}`).join("\n")}\n\n### Freigabe\n\n- \`reviews/pending.json\` und den Diff von \`public/data/meta.json\` prüfen.\n- Neue Waffen/Camos sowie Änderungen an Tiers und Builds mit Quellen belegen.\n- Bei Bedarf über \`npm run apply-review -- --input reviews/approved.json\` ergänzen (README).\n- Tests in diesem Workflow wurden vor dem Commit ausgeführt. Gegebenenfalls weitere PR-Workflows in GitHub freigeben.\n- Persönlicher Camo-Fortschritt bleibt ausschließlich im Browser.\n`,
      "utf8",
    );
  }
  if (engineResult)
    await writeFile(
      "work/pr-body.md",
      (result
        ? await (
            await import("node:fs/promises")
          ).readFile("work/pr-body.md", "utf8")
        : "## MW4 Gunsmith- und Quellenprüfung\n\n") +
        "\n### Gunsmith\n\n" +
        engineResult.review.weaponFacts.length +
        " geänderte offizielle Datensätze; " +
        engineResult.review.research.length +
        " neue/geänderte redaktionelle Quellen. Prüfe reviews/gunsmith-pending.json. Die vollständige Datenbasis bleibt bei Fehlern erhalten. Keine automatische Reddit-Analyse ohne autorisierten Zugang.\n",
    );
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  console.log(
    changed
      ? "Validated proposal staged; human review required."
      : "No source changes. Published data untouched.",
  );
} catch (error) {
  await atomicJson("work/run-report.json", {
    checkedAt: new Date().toISOString(),
    status: "failed",
    error: error.message,
  });
  console.error(`Update aborted; previous data retained: ${error.message}`);
  process.exitCode = 1;
}
