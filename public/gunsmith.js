import { calculateStats } from "./engine/calculator.js";
export const BUILDS_KEY = "mw4-intel:custom-builds:v1";
const validId = (value) =>
  typeof value === "string" && /^[a-z0-9-]{1,100}$/.test(value);
export function validateSavedBuild(build) {
  if (
    !build ||
    Object.keys(build).some(
      (k) =>
        ![
          "id",
          "weaponId",
          "name",
          "attachments",
          "patchRevision",
          "savedAt",
        ].includes(k),
    )
  )
    throw new Error("Ungültiger Build");
  if (
    !validId(build.id) ||
    !validId(build.weaponId) ||
    typeof build.name !== "string" ||
    !build.name.trim() ||
    build.name.length > 80
  )
    throw new Error("Ungültiger Buildname oder ID");
  if (
    !Array.isArray(build.attachments) ||
    build.attachments.length > 20 ||
    build.attachments.some(
      (a) =>
        !a ||
        Object.keys(a).some((k) => !["slot", "attachmentId"].includes(k)) ||
        typeof a.slot !== "string" ||
        !/^[A-Za-z][A-Za-z0-9 -]{0,59}$/.test(a.slot) ||
        !validId(a.attachmentId),
    )
  )
    throw new Error("Ungültige Aufsatzliste");
  if (
    new Set(build.attachments.map((a) => a.slot)).size !==
    build.attachments.length
  )
    throw new Error("Doppelt belegter Slot");
  if (
    typeof build.patchRevision !== "string" ||
    !/^[a-f0-9]{64}$/.test(build.patchRevision) ||
    typeof build.savedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(build.savedAt) ||
    !Number.isFinite(Date.parse(build.savedAt))
  )
    throw new Error("Ungültiger Patchstand");
  return structuredClone(build);
}
export function loadBuilds(storage) {
  const raw = storage.getItem(BUILDS_KEY);
  if (!raw) return { schemaVersion: 1, builds: [] };
  const data = JSON.parse(raw);
  if (
    data.schemaVersion !== 1 ||
    !Array.isArray(data.builds) ||
    data.builds.length > 500 ||
    Object.keys(data).some((k) => !["schemaVersion", "builds"].includes(k))
  )
    throw new Error("Ungültiger Buildspeicher");
  data.builds.forEach(validateSavedBuild);
  if (new Set(data.builds.map((b) => b.id)).size !== data.builds.length)
    throw new Error("Doppelte Build-ID");
  return data;
}
export function saveBuild(storage, data, build) {
  const checked = validateSavedBuild(build);
  const next = structuredClone(data);
  const i = next.builds.findIndex((b) => b.id === checked.id);
  if (i === -1) next.builds.push(checked);
  else next.builds[i] = checked;
  if (next.builds.length > 500) throw new Error("Maximal 500 eigene Builds");
  storage.setItem(BUILDS_KEY, JSON.stringify(next));
  return next;
}
export function deleteBuild(storage, data, id) {
  const next = {
    schemaVersion: 1,
    builds: data.builds.filter((b) => b.id !== id),
  };
  storage.setItem(BUILDS_KEY, JSON.stringify(next));
  return next;
}
export function buildIssues(
  weapon,
  refs,
  attachments,
  rules,
  patchRevision,
  savedPatch = patchRevision,
) {
  const issues = [];
  if (savedPatch !== patchRevision)
    issues.push("Für einen älteren Patch gespeichert. Erneut prüfen.");
  if (refs.length && rules?.patchRevision !== patchRevision)
    issues.push(
      "Die Slot-Regeln sind für diesen Patch nicht erneut verifiziert.",
    );
  if (refs.length && !Number.isInteger(rules?.maxAttachments))
    issues.push("Das Aufsatzlimit dieser Waffe ist noch nicht verifiziert.");
  if (
    Number.isInteger(rules?.maxAttachments) &&
    refs.filter((r) => r.slot !== "Apex").length > rules.maxAttachments
  )
    issues.push(`Maximal ${rules.maxAttachments} Aufsätze zulässig.`);
  const slots = new Set();
  for (const ref of refs) {
    const a = attachments.find((a) => a.id === ref.attachmentId);
    if (slots.has(ref.slot))
      issues.push(`Slot ${ref.slot} ist doppelt belegt.`);
    slots.add(ref.slot);
    if (!a || a.slot !== ref.slot || !a.weaponIds.includes(weapon.id))
      issues.push(
        `${ref.attachmentId}: entfernt, unbekannt oder nicht kompatibel.`,
      );
    if (
      rules?.slots &&
      !rules.slots.includes(ref.slot) &&
      !(ref.slot === "Apex" && rules.apexSeparate)
    )
      issues.push(`${ref.slot}: nicht für diese Waffe freigegeben.`);
    if (a && "availability" in a && a.availability !== true)
      issues.push(`${a.name}: aktuelle Verfügbarkeit nicht bestätigt.`);
    if (a && "patchRevision" in a && a.patchRevision !== patchRevision)
      issues.push(`${a.name}: Patchstand nicht aktuell.`);
    if (a?.blocks?.some((slot) => refs.some((other) => other.slot === slot)))
      issues.push(`${a.name}: blockierter Slot ist belegt.`);
    if (
      a?.conflicts?.some((id) =>
        refs.some((other) => other.attachmentId === id),
      )
    )
      issues.push(`${a.name}: unverträgliche Aufsatzkombination.`);
  }
  return [...new Set(issues)];
}
export function setAttachment(
  weapon,
  current,
  slot,
  attachmentId,
  attachments,
  rules,
  patchRevision,
) {
  const next = current.filter((a) => a.slot !== slot);
  if (attachmentId) next.push({ slot, attachmentId });
  // Removing an invalidated attachment must remain possible even if rules are unavailable.
  if (attachmentId) {
    const issues = buildIssues(weapon, next, attachments, rules, patchRevision);
    if (issues.length) throw new Error(issues.join(" "));
  }
  return next;
}

// Values are shown only for an exact, reviewed combination. No guessed multipliers.
export function verifiedStats(weaponId, refs, catalog, patchRevision) {
  if (Array.isArray(catalog?.weapons))
    return calculateStats(catalog, weaponId, refs, patchRevision).values;
  const record = catalog?.weapons?.[weaponId]?.statistics;
  if (
    !record ||
    record.patchRevision !== patchRevision ||
    !Array.isArray(record.sourceUrls) ||
    !record.sourceUrls.length
  )
    return null;
  const combination = refs
    .map((r) => `${r.slot}:${r.attachmentId}`)
    .sort()
    .join("|");
  const snapshot = record.snapshots?.find(
    (s) =>
      s.attachments
        .map((r) => `${r.slot}:${r.attachmentId}`)
        .sort()
        .join("|") === combination,
  );
  if (!snapshot) return null;
  return Object.fromEntries(
    Object.entries(snapshot.values).filter(
      ([, value]) =>
        typeof value?.value === "number" &&
        Number.isFinite(value.value) &&
        value.value >= 0 &&
        typeof value.unit === "string",
    ),
  );
}
export function shareBuild(build) {
  const json = JSON.stringify(validateSavedBuild(build));
  const bytes = new TextEncoder().encode(json);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export function parseSharedBuild(encoded) {
  if (
    typeof encoded !== "string" ||
    encoded.length > 12000 ||
    !/^[a-zA-Z0-9_-]+$/.test(encoded)
  )
    throw new Error("Ungültiger Buildlink");
  const json = new TextDecoder("utf-8", { fatal: true }).decode(
    Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    ),
  );
  return validateSavedBuild(JSON.parse(json));
}
