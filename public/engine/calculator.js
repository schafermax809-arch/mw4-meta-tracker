import { METRICS, signature, configurationIssues } from "./database.js";
// Composition is explicitly ordered, per weapon and patch. A published percent
// is NOT enough evidence to infer how the game stacks two attachments.
export function calculateStats(
  db,
  weaponId,
  refs = [],
  patch = db.patchRevision,
) {
  const w = db.weapons.find((w) => w.id === weaponId);
  if (!w) throw new Error("Unknown weapon");
  const issues = configurationIssues(db, weaponId, refs, patch);
  const base = Object.fromEntries(
    Object.entries(w.base)
      .filter(
        ([, v]) =>
          v.patchRevision === patch &&
          (v.status === "verified" ||
            (db.communityValues && v.status === "reported")),
      )
      .map(([k, v]) => [k, { ...v }]),
  );
  const localBaseProblems = {}, localBaseResolved = new Set();
  for (const [key, rows] of Object.entries(w.localBaselines ?? {})) {
    const current = rows.filter(r => r.patchRevision === patch);
    if (!current.length) continue;
    if (new Set(current.map(r => r.value)).size !== 1) {
      delete base[key]; localBaseProblems[key] = 'Widersprüchliche lokale Basis-Messungen'; continue;
    }
    const local = current[0];
    if (base[key] && base[key].value !== local.value && !current.every(r => r.replacePublished)) {
      delete base[key]; localBaseProblems[key] = 'Lokaler Basiswert widerspricht der Quelle; Übernahme nicht bestätigt'; continue;
    }
    base[key] = { ...local, local: true };
    if (current.every(r => r.replacePublished)) localBaseResolved.add(key);
  }
  const snapshot = w.snapshots.find(
    (s) =>
      s.patchRevision === patch && signature(s.attachments) === signature(refs) && !refs.some(r => db.attachments.find(a => a.id === r.attachmentId)?.localEffects?.some(m => m.weaponId === weaponId)),
  );
  let values = structuredClone(base);
  const missing = {};
  if (issues.length) {
    values = {};
    for (const k of Object.keys(METRICS)) missing[k] = issues.join("; ");
  } else if (snapshot)
    values = Object.fromEntries(
      Object.entries(snapshot.values).filter(
        ([, v]) => v.patchRevision === patch && v.status === "verified",
      ),
    );
  else if (refs.length) {
    const selected = refs.map((r) =>
      db.attachments.find((a) => a.id === r.attachmentId),
    );
    if (
      !w.coverage.stackingVerified ||
      selected.some((a) => !a.effectsComplete || a.localEffects?.some(m => m.weaponId === weaponId))
    ) {
      values = {};
      for (const k of Object.keys(METRICS))
        missing[k] = "Vollständige Effekte oder Kombinationsregeln fehlen";
    } else {
      const modifiers = selected.flatMap((a) => a.modifiers);
      for (const i of w.interactions)
        if (i.attachmentIds.every((id) => selected.some((a) => a.id === id))) {
          if (i.patchRevision !== patch) {
            issues.push("Interaktion nicht patchaktuell");
            values = {};
            break;
          }
          modifiers.push(...i.modifiers);
        }
      modifiers.sort((a, b) => a.order - b.order);
      for (const m of modifiers) {
        if (m.patchRevision !== patch) {
          delete values[m.stat];
          missing[m.stat] = "Modifikator veraltet";
          continue;
        }
        if (missing[m.stat]) continue;
        if (m.operation !== "set" && !values[m.stat]) {
          missing[m.stat] = "Basiswert fehlt";
          continue;
        }
        // Same-stat operations at the same order require an explicit ordering.
        if (
          modifiers.filter((x) => x.stat === m.stat && x.order === m.order)
            .length > 1
        ) {
          delete values[m.stat];
          missing[m.stat] = "Reihenfolge mehrdeutig";
          continue;
        }
        const before = values[m.stat]?.value;
        const value =
          m.operation === "set"
            ? m.value
            : m.operation === "add"
              ? before + m.value
              : before * m.value;
        if (!Number.isFinite(value) || value < 0) {
          delete values[m.stat];
          missing[m.stat] = "Ungültiges Rechenergebnis";
          continue;
        }
        values[m.stat] = {
          value,
          unit: METRICS[m.stat][1],
          sourceIds: [
            ...new Set([...(values[m.stat]?.sourceIds ?? []), ...m.sourceIds]),
          ],
          patchRevision: patch,
          status:
            values[m.stat]?.status === "reported" ||
            selected.some((a) => a.status === "reported")
              ? "reported"
              : "verified",
        };
      }
    }
  }
  const deltas = Object.fromEntries(
    Object.entries(values)
      .filter(([k]) => base[k])
      .map(([k, v]) => [
        k,
        {
          absolute: v.value - base[k].value,
          percent:
            base[k].value === 0 ? null : (v.value / base[k].value - 1) * 100,
          improved: (v.value - base[k].value) * METRICS[k][2] > 0,
        },
      ]),
  );
  const preview = {},
    previewMissing = {};
  if (!issues.length && refs.length && !snapshot) {
    const selected = refs.map((r) =>
      db.attachments.find((a) => a.id === r.attachmentId),
    );
    const mods = selected.flatMap((a) => {
      const local = (a.localEffects ?? []).filter(m => m.weaponId === weaponId && m.patchRevision === patch);
      const replaced = new Set(local.filter(m => m.replacePublished).map(m => m.stat));
      const original = [
      ...a.modifiers.map((m) => ({ ...m, status: a.status })),
      ...(a.evidence?.patchRevision === patch
        ? (a.evidenceModifiers ?? [])
        : []
      ).filter(
        (m) =>
          !a.modifiers.some(
            (old) =>
              old.stat === m.stat &&
              old.operation === m.operation &&
              old.value === m.value,
          ),
      ),
      ].filter(m => !replaced.has(m.stat));
      return [...original, ...local.filter(m => !m.conflict || m.replacePublished).filter(m => m.replacePublished || !original.some(x => x.stat === m.stat && x.operation === m.operation && x.value === m.value))];
    });
    for (const key of new Set(mods.map((m) => m.stat))) {
      if (values[key]) continue;
      if (localBaseProblems[key]) { previewMissing[key] = localBaseProblems[key]; continue; }
      if (selected.some(a => a.localEffects?.some(m => m.weaponId === weaponId && m.stat === key && m.conflict && !m.replacePublished))) {
        previewMissing[key] = 'Lokaler Effekt widerspricht veröffentlichten Werten; Übernahme nicht bestätigt'; continue;
      }
      const list = mods.filter((m) => m.stat === key);
      if (list.some((m) => m.patchRevision !== patch)) {
        previewMissing[key] = "Quellenstand veraltet";
        continue;
      }
      if (
        selected.some((a) => a.modifierConflicts?.some((c) => c.stat === key) && !a.localEffects?.some(m => m.weaponId === weaponId && m.stat === key && m.replacePublished))
      ) {
        previewMissing[key] = "Widersprüchliche Aufsatzeffekte";
        continue;
      }
      if (list.length > 1 && !w.coverage.stackingVerified) {
        previewMissing[key] =
          "Mehrere Effekte auf denselben Wert: Stapelregel nicht belegt";
        continue;
      }
      if (
        list.some((m) => list.filter((n) => n.order === m.order).length > 1)
      ) {
        previewMissing[key] = "Reihenfolge der Operationen nicht belegt";
        continue;
      }
      if (
        list.some((m) => m.operation !== "set") &&
        w.evidenceConflicts?.some((c) => c.stat === key) && !localBaseResolved.has(key)
      ) {
        previewMissing[key] =
          "Widersprüchliche Basiswerte; keine eindeutige Rechenbasis";
        continue;
      }
      let value = base[key]?.value,
        sourceIds = base[key]?.sourceIds ?? [];
      for (const m of [...list].sort((a, b) => a.order - b.order)) {
        value =
          m.operation === "set"
            ? m.value
            : m.operation === "add"
              ? value + m.value
              : value * m.value;
        sourceIds = [...new Set([...sourceIds, ...m.sourceIds])];
      }
      if (!Number.isFinite(value) || value < 0) {
        previewMissing[key] =
          "Passender Basiswert fehlt oder Ergebnis ungültig";
        continue;
      }
      preview[key] = {
        value,
        unit: METRICS[key][1],
        sourceIds,
        patchRevision: patch,
        status: "reported",
        complete: false,
        reason:
          db.localResearch?.active ? "Lokale Teilrechnung aus Quellen und eigenen Eingaben; nicht veröffentlicht oder unabhängig verifiziert. Stapelregeln können fehlen." : "Teilrechnung aus veröffentlichten Einzelwirkungen. Weitere Wirkungen und Wechselwirkungen sind nicht vollständig belegt.",
      };
    }
  }
  const previewDeltas = Object.fromEntries(
    Object.entries(preview)
      .filter(([k]) => base[k])
      .map(([k, v]) => [
        k,
        {
          absolute: v.value - base[k].value,
          percent:
            base[k].value === 0 ? null : (v.value / base[k].value - 1) * 100,
          improved: (v.value - base[k].value) * METRICS[k][2] > 0,
        },
      ]),
  );
  return {
    base,
    values,
    deltas,
    missing,
    preview,
    previewDeltas,
    previewMissing,
    issues,
    exactSnapshot: Boolean(snapshot),
    patchRevision: patch,
  };
}
export function timeToKill(
  db,
  weaponId,
  refs,
  { distance, zone, health, healthVerified = false } = {},
  patch = db.patchRevision,
) {
  const w = db.weapons.find((w) => w.id === weaponId),
    calc = calculateStats(db, weaponId, refs, patch);
  const fail = (reason) => ({ available: false, reason });
  if (calc.issues.length) return fail(calc.issues.join("; "));
  if (
    !healthVerified ||
    !Number.isFinite(health) ||
    health <= 0 ||
    !Number.isFinite(distance) ||
    distance < 0
  )
    return fail("Verifizierte Zielgesundheit/Entfernung fehlt");
  if (!w.damageProfile || w.damageProfile.patchRevision !== patch)
    return fail("Patchaktuelles Schadensprofil fehlt");
  const selected = refs.map((r) =>
    db.attachments.find((a) => a.id === r.attachmentId),
  );
  if (
    refs.length &&
    (!w.coverage.stackingVerified || selected.some((a) => !a.effectsComplete))
  )
    return fail(
      "Für modifizierte Schadensprofile ist eine eigene verifizierte Modellierung erforderlich",
    );
  if (
    !w.fireModel ||
    w.fireModel.patchRevision !== patch ||
    !["continuous", "semi-auto"].includes(w.fireModel.type)
  )
    return fail("Schussfolge/Burst/Pellet-Regeln nicht modelliert");
  const modified = selected.flatMap((a) => a.modifiers);
  if (modified.some((m) => ["damage", "headMultiplier"].includes(m.stat)))
    return fail("Geänderte Schadens-/Körperzonen-Regel nicht modelliert");
  let rangeScale = 1;
  if (modified.some((m) => m.stat === "range")) {
    if (
      w.damageProfile.rangeScaling !== "all-boundaries" ||
      !calc.base.range?.value ||
      !calc.values.range?.value ||
      calc.base.range.status !== "verified" ||
      calc.values.range.status !== "verified"
    )
      return fail("Skalierung der Schadensgrenzen nicht belegt");
    rangeScale = calc.values.range.value / calc.base.range.value;
  }
  const band = w.damageProfile.bands.find(
      (b) =>
        distance >= b.from * rangeScale &&
        (b.to === null || distance < b.to * rangeScale),
    ),
    damage = band?.zones[zone],
    rpm = calc.values.rpm?.value;
  if (calc.values.rpm?.status !== "verified")
    return fail("Verifizierte Feuerrate fehlt");
  const delayModified = modified.some((m) => m.stat === "preFire");
  if (delayModified && calc.values.preFire?.status !== "verified")
    return fail("Verifizierte Vorlaufzeit fehlt");
  if (!damage || !rpm) return fail("Körperzonen-Schaden oder Feuerrate fehlt");
  const shots = Math.ceil(health / damage),
    ms =
      (delayModified ? calc.values.preFire.value : w.fireModel.preFireMs) +
      ((shots - 1) * 60000) / rpm;
  return {
    available: true,
    shots,
    ms,
    damage,
    distance,
    zone,
    health,
    model:
      "Erster Schuss nach Vorlaufzeit; Folgeschüsse im konstanten Intervall. Semiauto: theoretisches Maximum. Ohne Flugzeit, Fehlschüsse, Panzerung oder Regeneration.",
  };
}
