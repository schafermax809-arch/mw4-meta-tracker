import {
  collectCommunityValues,
  proposeCommunityValueRefresh,
} from "./lib/community-values.mjs";
import { validateCommunityValues } from "../public/engine/community-values.js";
import { hash } from "./lib/model.mjs";
import {
  collectAttachmentCatalog,
  proposeCatalogRefresh,
} from "./lib/attachment-catalog.mjs";
import { validateAttachmentCatalog } from "../public/engine/attachment-catalog.js";
import {
  collectEffectEvidence,
  proposeEffectRefresh,
} from "./lib/effect-evidence.mjs";
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
    previous: previousGunsmith?.sourceFingerprint
      ? { ...previousGunsmith, fingerprint: previousGunsmith.sourceFingerprint }
      : previousGunsmith,
    catalog: (result?.state ?? current).weapons,
  });
  const oldValues = await readJson("public/data/community-values.json");
  const newValues = validateCommunityValues(
    await collectCommunityValues(
      await readJson("config/community-values-sources.json"),
    ),
    result?.state ?? current,
  );
  const valuesChanged = hash(newValues) !== hash(oldValues);
  const oldCatalog = await readJson("public/data/attachment-catalog.json");
  const newCatalog = validateAttachmentCatalog(
    await collectAttachmentCatalog(
      await readJson("config/attachment-catalog-source.json"),
      result?.state ?? current,
    ),
    result?.state ?? current,
  );
  const catalogChanged = newCatalog.hash !== oldCatalog.hash;
  const oldEffects = await readJson("public/data/effect-evidence.json");
  const collectedEffects = await collectEffectEvidence(
    await readJson("config/effect-evidence-sources.json"),
    result?.state ?? current,
  );
  const effectsChanged = oldEffects.hash !== collectedEffects.hash;
  const newEffects = effectsChanged ? collectedEffects : oldEffects;
  const changed = Boolean(
    result || engineResult || valuesChanged || catalogChanged || effectsChanged,
  );
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
  if (changed) {
    await atomicJson("work/candidate/data/effect-evidence.json", newEffects);
    await atomicJson("work/candidate/data/attachment-catalog.json", newCatalog);
    await atomicJson("work/candidate/data/community-values.json", newValues);
    if (!result && !engineResult) {
      for (const [name, value] of [
        ["meta", current],
        ["gunsmith", db],
        ["research", baseline],
      ])
        await atomicJson("work/candidate/data/" + name + ".json", value);
      await atomicJson("work/candidate/reviews/pending.json", {
        schemaVersion: 1,
        policy: "REVIEW_REQUIRED",
        note: "Neue Community-Quellenwerte; offizieller Kernkatalog unverändert.",
      });
      const changedPages = newValues.pages.filter(
        (p) => oldValues.pages.find((o) => o.url === p.url)?.hash !== p.hash,
      );
      await atomicJson("work/candidate/reviews/gunsmith-pending.json", {
        schemaVersion: 1,
        policy: "REVIEW_REQUIRED",
        fingerprint: hash(newValues),
        changedWeaponIds: changedPages.map((p) => p.weaponId),
        communityValueChanges: changedPages.map((p) => ({
          weaponId: p.weaponId,
          url: p.url,
          before: oldValues.pages.find((o) => o.url === p.url) ?? null,
          after: p,
        })),
      });
      await writeFile(
        "work/pr-body.md",
        (valuesChanged
          ? "## Neue MW4-Community-Werte\n\n"
          : "## MW4-Aufsatzkatalog aktualisiert\n\n") +
          changedPages.length +
          " geänderte Waffen-Seiten. Zahlen bleiben als Community-Angaben gekennzeichnet. Offizielle Werte und persönlicher Camo-Fortschritt bleiben erhalten. reviews/gunsmith-pending.json enthält Vorher/Nachher.\n",
      );
    }
    const refresh = proposeCommunityValueRefresh(
      engineResult?.database ?? db,
      oldValues,
      newValues,
      { previous: previousGunsmith },
    );
    let finalDb = refresh?.database ?? engineResult?.database ?? db;
    if (refresh) {
      const changedWeaponIds = [
        ...new Set([
          ...(engineResult?.review.changedWeaponIds ?? []),
          ...refresh.review.changedWeaponIds,
        ]),
      ];
      finalDb.history[0].changedWeaponIds = changedWeaponIds;
      await atomicJson("work/candidate/data/gunsmith.json", finalDb);
      const review = {
        ...(engineResult?.review ?? {}),
        ...refresh.review,
        changedWeaponIds,
        sourceFingerprint: engineResult?.review.fingerprint ?? null,
      };
      await atomicJson("work/candidate/reviews/gunsmith-pending.json", review);
    }
    const catalogRefresh = proposeCatalogRefresh(
      finalDb,
      oldCatalog,
      newCatalog,
      { previous: previousGunsmith },
    );
    if (catalogRefresh) {
      finalDb = catalogRefresh.database;
      const prior = await readJson(
        "work/candidate/reviews/gunsmith-pending.json",
      );
      const ids = [
        ...new Set([
          ...(prior.changedWeaponIds ?? []),
          ...catalogRefresh.review.changedWeaponIds,
        ]),
      ];
      finalDb.history[0].changedWeaponIds = ids;
      await atomicJson("work/candidate/data/gunsmith.json", finalDb);
      await atomicJson("work/candidate/reviews/gunsmith-pending.json", {
        ...prior,
        ...catalogRefresh.review,
        changedWeaponIds: ids,
      });
    }
    const effectRefresh = proposeEffectRefresh(
      finalDb,
      oldEffects,
      newEffects,
      { previous: previousGunsmith },
    );
    if (effectRefresh) {
      finalDb = effectRefresh.database;
      const prior = await readJson(
        "work/candidate/reviews/gunsmith-pending.json",
      );
      const ids = [
        ...new Set([
          ...(prior.changedWeaponIds ?? []),
          ...effectRefresh.review.changedWeaponIds,
        ]),
      ];
      finalDb.history[0].changedWeaponIds = ids;
      await atomicJson("work/candidate/data/gunsmith.json", finalDb);
      await atomicJson("work/candidate/reviews/gunsmith-pending.json", {
        ...prior,
        ...effectRefresh.review,
        changedWeaponIds: ids,
      });
    }
    await atomicJson(
      "work/candidate/data/calculated.json",
      (await import("./lib/gunsmith-update.mjs")).recompute(
        finalDb,
        result?.state.patchRevision ?? current.patchRevision,
        newValues,
        newCatalog,
        newEffects,
      ),
    );
  }
  const report = {
    checkedAt: new Date().toISOString(),
    status: changed ? "review-required" : "unchanged",
    communityValueSources: newValues.pages.map((p) => ({
      url: p.url,
      hash: p.hash,
    })),
    communityValuesChanged: valuesChanged,
    attachmentCatalogChanged: catalogChanged,
    attachmentCatalogEntries: newCatalog.catalog.length,
    attachmentCatalogProfiles: newCatalog.profiles.length,
    effectEvidenceChanged: effectsChanged,
    effectEvidenceHash: newEffects.hash,
    effectEvidenceProfiles: newEffects.profiles.length,
    effectEvidenceAttachments: newEffects.profiles.reduce(
      (n, p) => n + p.attachments.length,
      0,
    ),
    effectEvidenceRestrictions: newEffects.restrictions,
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
  if (changed && valuesChanged && (result || engineResult))
    await appendFile(
      "work/pr-body.md",
      "\n### Community-Werte\n\nÖffentliche Waffenprofile wurden ebenfalls aktualisiert. Prüfe die Vorher-/Nachher-Werte in reviews/gunsmith-pending.json und public/data/community-values.json. Offizielle Basiswerte behalten Vorrang; Community-Werte bleiben gekennzeichnet.\n",
    );
  if (changed && catalogChanged)
    await appendFile(
      "work/pr-body.md",
      `\n### Aufsatzkatalog\n\n${newCatalog.catalog.length} Einträge und ${newCatalog.profiles.length} Waffenprofile. Vollständige Listen und Build-Änderungen in reviews/gunsmith-pending.json prüfen. Persönlicher Fortschritt bleibt unverändert.\n`,
    );
  if (changed && effectsChanged)
    await appendFile(
      "work/pr-body.md",
      "\n### Numerische Aufsatzeffekte\n\nÖffentliche MW4-Multiplayer-Launchprofile geändert. Absolute Zielwerte, additive Änderungen und Faktoren bleiben getrennt. Community-Angaben werden nicht als unabhängige Tests zertifiziert. Vorher/Nachher in reviews/gunsmith-pending.json prüfen. Rechner und Optimizer wurden mit dem neuen Datenfingerabdruck neu berechnet.\n",
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
