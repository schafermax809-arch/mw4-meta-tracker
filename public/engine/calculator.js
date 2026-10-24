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
  const snapshot = w.snapshots.find(
    (s) =>
      s.patchRevision === patch && signature(s.attachments) === signature(refs),
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
      selected.some((a) => !a.effectsComplete)
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
  return {
    base,
    values,
    deltas,
    missing,
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
  if (refs.length)
    return fail(
      "Für modifizierte Schadensprofile ist eine eigene verifizierte Modellierung erforderlich",
    );
  if (
    !w.fireModel ||
    w.fireModel.patchRevision !== patch ||
    !["continuous", "semi-auto"].includes(w.fireModel.type)
  )
    return fail("Schussfolge/Burst/Pellet-Regeln nicht modelliert");
  const band = w.damageProfile.bands.find(
      (b) => distance >= b.from && (b.to === null || distance < b.to),
    ),
    damage = band?.zones[zone],
    rpm = calc.values.rpm?.value;
  if (!damage || !rpm) return fail("Körperzonen-Schaden oder Feuerrate fehlt");
  const shots = Math.ceil(health / damage),
    ms = w.fireModel.preFireMs + ((shots - 1) * 60000) / rpm;
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
