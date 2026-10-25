import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { hydrateCommunityValues } from "../public/engine/community-values.js";
import { hydrateAttachmentCatalog } from "../public/engine/attachment-catalog.js";
import {
  hydrateEffectEvidence,
  effectCoverage,
  validateEffectEvidence,
} from "../public/engine/effect-evidence.js";
import { METRICS } from "../public/engine/database.js";
const read = async (name) =>
  JSON.parse(await readFile("public/data/" + name + ".json", "utf8"));
const [raw, meta, community, catalog, evidence] = await Promise.all(
  [
    "gunsmith",
    "meta",
    "community-values",
    "attachment-catalog",
    "effect-evidence",
  ].map(read),
);
validateEffectEvidence(evidence, meta);
const old = hydrateAttachmentCatalog(
  hydrateCommunityValues(raw, community, meta.patchRevision),
  catalog,
  meta.patchRevision,
);
const db = hydrateEffectEvidence(old, evidence, meta.patchRevision),
  quality = effectCoverage(db, meta.patchRevision);
const target = resolve(process.argv[2] || "work/mw4-datenpruefung.md");
await mkdir(dirname(target), { recursive: true });
const table = (headers, rows) =>
  [headers, headers.map(() => "---"), ...rows]
    .map(
      (row) =>
        "| " +
        row
          .map((v) =>
            String(v ?? "FEHLT")
              .replaceAll("|", "\\|")
              .replaceAll("\n", " "),
          )
          .join(" | ") +
        " |",
    )
    .join("\n");
const matched = old.attachments.filter(
  (a) => db.attachments.find((b) => b.id === a.id)?.evidence,
).length;
const numbers = evidence.profiles.flatMap((p) =>
  p.attachments.flatMap((a) =>
    a.effects.filter((e) => e.kind !== "qualitative"),
  ),
);
const explicit = db.attachments.filter(
  (a) => a.evidenceModifiers?.length,
).length;
let md = `# MW4 – Aufsatzdaten und Gunsmith: Prüfbericht\n\nGeprüft am ${evidence.checkedAt}. Datenstand der neuen Quelle: 24.10.2026, MW4 Multiplayer, Launch 2026. Berücksichtigte interne Patchrevision: ${meta.patchRevision}. Ein Quellenabruf ist keine unabhängige Messung im Spiel.\n\n## Ergebnis\n\n- Alle ${meta.weapons.length} Waffen und alle ${old.attachments.length} bisherigen waffenbezogenen Einträge systematisch gegen den öffentlichen Launch-Katalog abgeglichen. ${matched} bestehende IDs exakt zugeordnet; ${old.attachments.length - matched} bleiben ohne eindeutige Zuordnung erhalten.\n- ${evidence.profiles.reduce((n, p) => n + p.attachments.length, 0)} veröffentlichte Aufsatz-Waffenzuordnungen aus 28 Launchprofilen ausgewertet; die fünf übrigen Waffen besitzen laut offizieller Übersicht keine Gunsmith-Slots.\n- ${db.attachments.length - old.attachments.length} zusätzliche explizite Zuordnungen aufgenommen, insgesamt ${db.attachments.length}. Keine alten IDs oder gespeicherten Builds gelöscht.\n- ${numbers.length} numerische Quellenangaben, davon ${numbers.filter((e) => e.operation).length} eindeutig zugeordnete Einzeloperationen. ${quality.reduce((n, c) => n + c.numeric, 0)} Aufsatzeinträge mit mindestens einer Zahl, ${explicit} mit mindestens einer umsetzbaren Einzeloperation.\n- ${quality.reduce((n, c) => n + c.verifiedNumeric, 0)} Aufsätze mit mindestens einem offiziellen/Test-Zahlenbeleg; alle neu recherchierten Angaben bleiben „reported“. Kein neuer unabhängiger Waffentest verifiziert.\n- Keine Waffe besitzt einen vollständigen, unabhängig geprüften Aufsatz- und Stapelregelsatz. Kein mathematisch zuverlässiger Produktions-Optimizer wird behauptet.\n\n## Fortschritt je Waffe\n\n„Zahlen“ bedeutet mindestens eine veröffentlichte numerische Angabe. „Verifiziert“ bedeutet mindestens ein offizieller oder reproduzierbarer Test-Zahlenbeleg, nicht vollständige Verifikation des Aufsatzes. „Vollständig“ verlangt vollständige numerische Effekte; für Waffen ohne Slots gilt N/A, nicht 100 %. Konflikte zählen Aufsatzeinträge mit widersprüchlichen Effekten/Slotangaben; Basiswertkonflikte werden getrennt gezählt.\n\n`;
const priority = ["ppsh-41", "m4", "han-86", "iso-nightshade", "vel-46"];
const ordered = [...quality].sort(
  (a, b) =>
    (priority.includes(a.weaponId) ? priority.indexOf(a.weaponId) : 100) -
    (priority.includes(b.weaponId) ? priority.indexOf(b.weaponId) : 100),
);
md += table(
  [
    "Waffe",
    "Bisher",
    "Jetzt",
    "Quellenabgleich",
    "Zahlen",
    "Verifiziert",
    "Unvollständig",
    "Aufsatzkonflikte",
    "Basis-Konflikte",
    "Numerische Abdeckung",
    "Vollständig",
  ],
  ordered.map((c) => [
    c.name,
    old.attachments.filter((a) => a.weaponIds.includes(c.weaponId)).length,
    c.attachments,
    c.sourceChecked,
    c.numeric,
    c.verifiedNumeric,
    c.incomplete,
    c.conflicting,
    c.baseConflicts,
    c.numericCoverage === null ? "N/A" : c.numericCoverage + " %",
    c.completeness === null ? "N/A" : c.completeness + " %",
  ]),
);
md +=
  "\n\n## Rechner und Optimizer\n\nDer Rechner zeigt bekannte Einzelwirkungen separat als Teilrechnung (*), einschließlich Delta zur Basis. Beispiel M4/FSS Fireline Grip: 240 → 260 ms ADS und 210 → 225 ms Sprint-to-Fire. Solche Werte sind keine bestätigten Gesamtwerte und werden nicht in die mathematische Optimierung eingespeist. Absolute Magazinwerte werden aus expliziten Quellenfeldern gelesen, nicht aus Namen. Gleichzeitige Modifikatoren eines Werts werden ohne belegte Stapelregel nicht kombiniert. Widersprüchliche Basiswerte blockieren davon abhängige Teilrechnungen.\n\nDie bestehende kombinatorische Suche bleibt erhalten: gültige Kombinationen inklusive leerer Slots, Apex-Sperren, Konflikte, Suchbudget und deterministischer Beam-Suche. Meta, Longshot, Headshot, Hipfire, Multikill und eigene Gewichte bleiben vorhanden. Calculated Builds erfordern verifizierte Rechenwerte; Community Builds bleiben separate Empfehlungen. Hybrid setzt einen tatsächlich berechenbaren Kandidaten plus unabhängige Community-Evidenz voraus. Für alle 28 Gunsmith-Waffen fehlen derzeit zuverlässige vollständige Produktionsdaten. Für die übrigen fünf Waffen gibt es keine Aufsatzoptimierung.\n\nTTK unterstützt verifizierte konstante Schussfolgen und Änderungen der Feuerrate. Reichweitenmodifikatoren beeinflussen Schadensgrenzen nur mit ausdrücklich belegter Skalierungsregel. Burst-, Pellet-, Schadenszonen- und Konversionsmodelle bleiben gesperrt, wenn die entsprechende Regel fehlt. Die neuen Produktionsdaten werden nicht automatisch zu einem solchen Modell erklärt.\n\n## Noch unbekannte Regeln\n\n- Prozentwerte mit „Speed“ bei Zeitstatistiken: bedeutet der Wert Geschwindigkeit oder Dauer? Keine ungeprüfte Umkehrung.\n- Generisches „Recoil“: nicht ohne Beleg auf horizontale, vertikale oder Gun-Kick-Achsen verteilen.\n- Stapelung additiver und multiplikativer Änderungen, Reihenfolge von Set-Werten und Wechselwirkungen mehrerer Aufsätze.\n- Vollständigkeit der veröffentlichten Effektlisten: fehlende Felder sind keine bestätigten Null-Effekte.\n- Vollständige patchbezogene Schadenszonen, Burst-/Pellet-Regeln, Apex-Schadensmodelle und tatsächliche Longshot-Klassendistanzen.\n- „Weapon Unlocks“ und Waffenlevel sind unterschiedliche Angaben und werden nicht ungeprüft gleichgesetzt.\n\n## Quellenprüfung und Einschränkungen\n\n";
md += table(
  ["Quelle", "Automatisierung", "Ergebnis / Grenze", "Beleg"],
  evidence.restrictions.map((r) => [r.source, r.automation, r.reason, r.url]),
);
md +=
  "\n\n## Aliase und ältere Einträge\n\nNur Schreibweisen mit identischer normalisierter Zeichenfolge (Groß-/Kleinschreibung und Satzzeichen) werden derselben vorhandenen ID zugeordnet; die alternative Schreibweise bleibt als Alias im Runtime-Export erhalten. Namen mit zusätzlichen Wörtern, abweichenden Längen oder unterschiedlichen Apex-Bezeichnungen werden nicht heuristisch zusammengeführt.\n\n";
md += table(
  ["Waffe", "Namen", "Entscheidung", "Begründung"],
  evidence.aliasReviews.map((a) => [
    meta.weapons.find((w) => w.id === a.weaponId).name,
    a.names.join(" / "),
    a.decision,
    a.reason,
  ]),
);
md +=
  "\n\nNicht eindeutig im neuen Launchprofil gefundene bisherige Datensätze:\n\n";
md += table(
  ["Waffe", "Slot", "Aufsatz", "Grund"],
  old.attachments
    .filter((a) => !db.attachments.find((b) => b.id === a.id)?.evidence)
    .map((a) => [
      meta.weapons.find((w) => a.weaponIds.includes(w.id)).name,
      a.slot,
      a.name,
      "Keine exakte Namens- und Slotzuordnung; keine Übertragung fremder Werte.",
    ]),
);
md +=
  "\n\n## Update und Schutz bestehender Daten\n\nDie tägliche GitHub-Actions-Pipeline prüft zusätzlich alle öffentlichen ggranked-Launchprofile. Robots-Regeln, Begrenzung auf freigegebene HTTPS-Origins, Größenlimit, Timeout und Abrufabstand gelten. Änderungen der geprüften Nutzungsbedingungen stoppen den neuen Import zur manuellen Prüfung. Keine CODMunity-/Reddit-Automatisierung, keine privaten Endpoints, keine kostenpflichtigen KI-APIs. Neue Quellenfakten landen mit Vorher/Nachher und erneuter Berechnung in einem Review-PR. Gleichbleibende Fakten ändern weder veröffentlichte Daten noch das Erfolgsdatum. Fehlerhafte Abrufe lassen den bisherigen Datenbestand bestehen. Persönlicher Camo-Fortschritt wird weder gelesen noch geschrieben.\n\n## Qualitätssicherung\n\nAutomatische Prüfungen decken alle 33 Waffen, alle importierten Slotzuordnungen, Apex-Sperren, unbekannte/alte Patchstände, Schema- und Einheitenfehler, Teilrechnungen, mehrdeutige Stapelung, verifizierte Mehrfachoperationen, TTK-/Reichweitenregeln, Optimizer-Grenzen, gespeicherte Builds, Import und Update-No-ops ab. Konkrete Test- und Browserergebnisse werden im Abschluss ergänzt.\n";
await writeFile(target, md);
const csv = (rows) =>
  "\uFEFF" +
  rows
    .map((row) =>
      row
        .map((v) => '"' + String(v ?? "FEHLT").replaceAll('"', '""') + '"')
        .join(";"),
    )
    .join("\r\n");
const fields = [
  "ads",
  "sprintToFire",
  "horizontalRecoil",
  "verticalRecoil",
  "gunKick",
  "range",
  "velocity",
  "movement",
  "hipSpread",
  "magazine",
  "reload",
];
const rows = [
  [
    "Waffe",
    "ID",
    "Slot",
    "Aufsatz",
    "Aliase",
    "Quellen-Zahlen",
    "Rechenoperationen",
    "Qualitative Effekte",
    "Fehlende explizite Messfelder",
    "Quelle",
    "Geprüft",
    "Quellenstand",
    "Spielversion",
    "Modus",
    "Patchrevision",
    "Status",
    "Konflikt",
    "Vollständig",
  ],
];
for (const w of db.weapons)
  for (const a of db.attachments.filter((a) => a.weaponIds.includes(w.id))) {
    const e = a.evidence?.effects ?? [];
    rows.push([
      w.name,
      a.id,
      a.slot,
      a.name,
      a.aliases?.join(" / ") || "",
      e
        .filter((x) => x.kind !== "qualitative")
        .map(
          (x) =>
            x.raw + " [" + x.kind + (x.reason ? "; " + x.reason : "") + "]",
        )
        .join(" | ") ||
        a.modifiers
          .map((m) => `${m.stat}: ${m.operation} ${m.value} ${m.unit}`)
          .join(" | ") ||
        "FEHLT",
      a.evidenceModifiers
        ?.map((m) => `${m.stat}: ${m.operation} ${m.value} ${m.unit}`)
        .join(" | ") || "FEHLT",
      e
        .filter((x) => x.kind === "qualitative")
        .map((x) => x.raw)
        .join(" | ") ||
        a.special.join(" | ") ||
        "FEHLT",
      fields
        .filter(
          (k) =>
            !e.some((x) => x.metric === k && x.kind !== "qualitative") &&
            !a.modifiers.some((m) => m.stat === k),
        )
        .map((k) => METRICS[k][0])
        .join(" | "),
      a.evidence
        ? db.sources.find((s) => s.id === a.evidence.sourceIds[0]).url
        : a.sourceIds
            .map((id) => db.sources.find((s) => s.id === id)?.url)
            .filter(Boolean)
            .join(" | "),
      a.evidence?.checkedAt ?? a.checkedAt,
      a.evidence?.asOf ?? null,
      meta.gameId,
      "multiplayer",
      a.evidence?.patchRevision ?? a.patchRevision,
      a.evidence ? "reported; nicht unabhängig gemessen" : a.status,
      a.compatibilityConflict ||
        a.modifierConflicts?.map((c) => c.stat).join(" | ") ||
        "",
      a.effectsComplete ? "ja" : "nein",
    ]);
  }
await writeFile(target.replace(/\.md$/, ".csv"), csv(rows));
await writeFile(
  target.replace(/\.md$/, ".json"),
  JSON.stringify(
    {
      checkedAt: evidence.checkedAt,
      patchRevision: meta.patchRevision,
      baselineAttachments: old.attachments.length,
      baselineMatched: matched,
      quality,
      unresolvedAliases: evidence.aliasReviews,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    report: target,
    weapons: quality.length,
    attachments: rows.length - 1,
    sourceEntries: evidence.profiles.reduce(
      (n, p) => n + p.attachments.length,
      0,
    ),
    numeric: quality.reduce((n, c) => n + c.numeric, 0),
    verified: quality.reduce((n, c) => n + c.verifiedNumeric, 0),
    conflicting: quality.reduce((n, c) => n + c.conflicting, 0),
    baseConflicts: quality.reduce((n, c) => n + c.baseConflicts, 0),
  }),
);
