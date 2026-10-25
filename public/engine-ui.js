import { node, button, external, notice, empty, date, download } from "./ui.js";
import {
  METRICS,
  configurationIssues,
  coverageReport,
} from "./engine/database.js";
import { calculateStats, timeToKill } from "./engine/calculator.js";
import { objectiveWeights } from "./engine/optimizer.js";
import { analyzeCommunity } from "./engine/community.js";
import { communityTTK } from "./engine/community-values.js";
import { effectCoverage } from "./engine/effect-evidence.js";
const fmt = (v) => Number(v.toFixed(3)).toLocaleString("de-DE");
export function statTable(db, weaponId, refs, patch) {
  const c = calculateStats(db, weaponId, refs, patch),
    wrap = node("div", null, "stat-table-wrap"),
    table = node("table", null, "comparison-table");
  const h = node("tr");
  for (const s of [
    "WAFFENWERT",
    "BASIS",
    "BUILD / TEILRECHNUNG*",
    "Δ ABS.",
    "Δ %",
  ])
    h.append(node("th", s));
  table.append(h);
  for (const [key, [label, unit]] of Object.entries(METRICS)) {
    if (key === "ttk" || (!c.base[key] && !c.values[key] && !c.preview[key]))
      continue;
    const base = c.base[key],
      partial = !c.values[key] && c.preview[key],
      v = c.values[key] ?? partial,
      d = c.deltas[key] ?? c.previewDeltas[key],
      r = node("tr");
    r.append(
      node("th", label),
      node(
        "td",
        base
          ? `${fmt(base.value)} ${unit}${base.local ? ' L' : base.status === "reported" ? " C" : ""}`
          : "—",
      ),
      node(
        "td",
        v
          ? `${fmt(v.value)} ${unit}${partial ? " *" : v.local ? ' L' : v.status === "reported" ? " C" : ""}`
          : "—",
      ),
      node(
        "td",
        d ? `${d.absolute > 0 ? "+" : ""}${fmt(d.absolute)} ${unit}` : "—",
      ),
      node(
        "td",
        d?.percent !== null && d
          ? `${d.percent > 0 ? "+" : ""}${fmt(d.percent)} %`
          : "—",
      ),
    );
    if (d?.absolute) r.className = d.improved ? "stat-improved" : "stat-worse";
    table.append(r);
  }
  wrap.append(
    table,
    node(
      "p",
      "Weitere Werte ohne belastbare Messdaten: " +
        Object.entries(METRICS)
          .filter(([k]) => k !== "ttk" && !c.base[k] && !c.values[k])
          .map(([, v]) => v[0])
          .join(", "),
      "stats-note",
    ),
    node(
      "p",
      "L = lokale Messung. C = Community-Angabe, nicht unabhängig vermessen. * = Teilrechnung ausschließlich aus bekannten Einzelwirkungen; kein bestätigter Gesamtwert des Builds und keine Grundlage für den verifizierten Optimizer. Lokaler Aufsatzvergleich separat verfügbar. — = unbekannt. Zeitwerte in ms: kleiner ist schneller. Mehrere Effekte auf denselben Wert bleiben ohne belegte Stapelregel offen.",
      "stats-note",
    ),
  );
  if (db.localResearch?.active) wrap.prepend(notice('LOKALE ERGÄNZUNGEN AKTIV · Eigene Messungen können diese Teilrechnung verändern. Keine automatisch veröffentlichten oder unabhängig verifizierten Werte.'));
  const research = node('a', 'Fehlende Aufsatzwerte recherchieren und ergänzen ↗', 'button');
  research.href = `#/complete/${weaponId}${refs.length === 1 ? '/' + refs[0].attachmentId : ''}`; wrap.append(research);
  if (refs.length) {
    const selected = refs.map(r => db.attachments.find(a => a.id === r.attachmentId));
    for (const a of selected.filter(Boolean)) {
      const known = new Set([...a.modifiers, ...(a.evidence?.patchRevision === patch ? a.evidenceModifiers ?? [] : []), ...(a.localEffects ?? []).filter(m => m.weaponId === weaponId && (!m.conflict || m.replacePublished))].map(m => m.stat));
      const fields = ['ads', 'sprintToFire', 'horizontalRecoil', 'verticalRecoil', 'gunKick', 'range', 'velocity', 'movement', 'hipSpread', 'magazine', 'reload'];
      wrap.append(node('p', `${a.name} · Noch fehlende Einzelwirkungen: ${fields.filter(k => !known.has(k)).map(k => METRICS[k][0]).join(', ') || 'elf Messfelder vorhanden; weitere Effekte und Stapelregeln separat prüfen'}`, 'stats-note'));
    }
  }
  for (const [key, reason] of Object.entries(c.previewMissing))
    wrap.append(node("p", `${METRICS[key][0]}: ${reason}.`, "stats-note"));
  if (c.issues.length) wrap.append(notice(c.issues.join("; "), true));
  return wrap;
}
export function compareStats(db, weaponId, left, right, patch) {
  const a = calculateStats(db, weaponId, left, patch),
    b = calculateStats(db, weaponId, right, patch),
    box = node("div", null, "numeric-comparison");
  let count = 0;
  for (const [k, [label, unit, direction]] of Object.entries(METRICS)) {
    const x = a.values[k],
      y = b.values[k];
    if (!x || !y) continue;
    count++;
    const r = node("div", null, "comparison-metric"),
      delta = y.value - x.value,
      max = Math.max(x.value, y.value, 1);
    r.append(
      node("strong", label),
      node(
        "span",
        `${fmt(x.value)} → ${fmt(y.value)} ${unit} · Δ ${delta > 0 ? "+" : ""}${fmt(delta)} ${unit}${x.value ? ` (${fmt((delta / x.value) * 100)} %)` : ""}`,
      ),
    );
    for (const [v, name] of [
      [x, "A"],
      [y, "B"],
    ]) {
      const track = node("div", null, "comparison-track"),
        fill = node("i");
      fill.style.width = `${(v.value / max) * 100}%`;
      track.append(fill);
      track.setAttribute("role", "img");
      track.setAttribute("aria-label", `${name}: ${fmt(v.value)} ${unit}`);
      r.append(track);
    }
    if (delta)
      r.append(
        node(
          "p",
          `${label} ${delta * direction > 0 ? "verbessert" : "verschlechtert"} sich.`,
          delta * direction > 0 ? "positive" : "negative",
        ),
      );
    box.append(r);
  }
  if (!count)
    box.append(
      notice(
        "Für diese beiden Konfigurationen fehlen vergleichbare Messwerte. Keine geschätzten Leistungsbalken.",
      ),
    );
  return box;
}
function sourceLinks(db, ids, box) {
  for (const id of [...new Set(ids)]) {
    const s = db.sources.find((s) => s.id === id);
    if (s?.kind === 'local' && !s.url) { box.append(node('p', `${s.title} · ${date(s.publishedAt)}`, 'source-proof')); continue; }
    if (s)
      box.append(
        external(
          `${s.title}${s.publishedAt ? " · " + date(s.publishedAt) : ""} ↗`,
          s.url,
          "source-proof",
        ),
      );
  }
}
function buildCard(db, weapon, build, actions, title) {
  const box = node("article", null, "verified-build");
  box.append(node("div", title, "eyebrow"));
  for (const r of build.attachments) {
    const a = db.attachments.find((a) => a.id === r.attachmentId);
    box.append(node("p", `${r.slot} · ${a?.name ?? r.attachmentId}`));
  }
  if (build.sourceIds) sourceLinks(db, build.sourceIds, box);
  const row = node("div", null, "action-row");
  row.append(
    button(
      "Build übernehmen",
      () => actions.apply(build.attachments),
      "button primary",
    ),
    button(
      "Build speichern",
      () => actions.save(build.attachments, title),
      "button subtle",
    ),
  );
  box.append(row);
  return box;
}
export function renderCommunity(db, weapon, box, actions) {
  const analysis = analyzeCommunity(db, weapon.id, actions.patch);
  box.append(
    node("h3", "COMMUNITY · QUELLENVERGLEICH"),
    notice(analysis.policy),
  );
  if (analysis.disagreement)
    box.append(
      notice(
        "Die aktuellen Quellen empfehlen unterschiedliche Builds. Es besteht kein einheitlicher Build-Konsens.",
      ),
    );
  if (!analysis.builds.length)
    box.append(
      empty(
        "Kein aktueller Community-Build verifiziert",
        "Für diese Waffe liegen keine ausreichend geprüften, patchaktuellen Empfehlungen im Datensatz vor.",
      ),
    );
  for (const [i, b] of analysis.builds.entries()) {
    const card = buildCard(
      db,
      weapon,
      b,
      actions,
      `Community ${i + 1} · ${b.label ?? "Build"} · ${b.confidence === "high" ? "hohe" : b.confidence === "medium" ? "mittlere" : "geringe"} Evidenz`,
    );
    card.append(
      node(
        "p",
        `${b.independentSources} unabhängige Quelle(n) · ${b.testSources} Quellen mit reproduzierbarem Test · geprüft ${date(b.checkedAt)}`,
      ),
    );
    if (db.effectEvidence) {
      const evidence = node("details");
      evidence.append(
        node("summary", "Bekannte Aufsatzwirkungen und Rechengrenzen"),
      );
      for (const r of b.attachments) {
        const a = db.attachments.find((a) => a.id === r.attachmentId);
        evidence.append(node("h4", a.name));
        for (const e of a.evidence?.effects ?? [])
          evidence.append(
            node(
              "p",
              e.raw + (e.operation ? "" : " · numerisch nicht verrechnet"),
              "effect-line",
            ),
          );
        if (!a.evidence?.effects.length)
          evidence.append(
            node("p", "Keine zusätzliche Effekttabelle zugeordnet."),
          );
      }
      evidence.append(
        node(
          "p",
          "Einzelwirkungen zeigen mögliche Vor- und Nachteile. Ohne vollständige Stapelregeln ist kein belastbarer Gesamtvergleich mit einem Calculated Build möglich.",
          "stats-note",
        ),
      );
      card.append(evidence);
    }
    box.append(card);
  }
  if (analysis.recurring.length) {
    const list = node("div", null, "recurring-list");
    list.append(node("h4", "Wiederkehrende Aufsätze"));
    for (const r of analysis.recurring)
      list.append(
        node(
          "p",
          `${db.attachments.find((a) => a.id === r.attachmentId)?.name} · ${r.independentSources} unabhängige Quelle(n)`,
        ),
      );
    box.append(list);
  }
  for (const r of analysis.excluded) {
    const item = node("details");
    item.append(
      node("summary", `Ausgeschlossene Empfehlung: ${r.id}`),
      node("p", r.reasons.join("; ")),
    );
    sourceLinks(db, r.sourceIds, item);
    box.append(item);
  }
  const refs = node("details");
  refs.append(node("summary", "Quellenzugang und Recherchegrenzen"));
  for (const s of db.sources.filter((s) => s.kind !== "official" && s.kind !== 'local')) {
    const p = node("p");
    p.append(
      external(s.title, s.url),
      node("span", ` · ${s.automation} · ${s.note}`),
    );
    refs.append(p);
  }
  box.append(refs);
}
export function renderSourceValues(db, weapon, box) {
  const data = db.communityValues;
  if (!data) return;
  const pages = data.pages.filter((p) => p.weaponId === weapon.id),
    refs = data.references.filter((r) => r.weaponId === weapon.id);
  if (!pages.length && !refs.length) return;
  const section = node("section", null, "source-values");
  section.append(
    node("h3", "ALLE GEFUNDENEN QUELLENWERTE"),
    node(
      "p",
      "Offizielle Angaben und Community-Werte bleiben unterscheidbar. Unterschiede zwischen Quellen werden nicht gemittelt. Menübewertungen /100 sind keine physikalischen Messwerte.",
      "stats-note",
    ),
  );
  for (const p of pages) {
    const details = node("details", null, "data-coverage");
    details.open = true;
    details.append(
      node(
        "summary",
        `${p.title} · Community · ${p.mode} · ${p.stage} · ${date(p.asOf)}`,
      ),
      external("Metka · Originalquelle ↗", p.url, "source-proof"),
    );
    const table = node("table", null, "comparison-table"),
      head = node("tr");
    head.append(
      node("th", "WERT"),
      node("th", "QUELLE"),
      node("th", "BEVORZUGTER BASISWERT"),
    );
    table.append(head);
    for (const s of [
      ...p.stats,
      ...p.ratings.map((r) => ({
        ...r,
        label: METRICS[r.metric][0],
        raw: r.value + " /100",
      })),
    ]) {
      const chosen = db.weapons.find((w) => w.id === weapon.id)?.base[s.metric],
        row = node("tr");
      row.append(
        node("td", s.label),
        node(
          "td",
          typeof s.value === "number" ? `${fmt(s.value)} ${s.unit}` : s.value,
        ),
        node(
          "td",
          chosen
            ? `${fmt(chosen.value)} ${chosen.unit}${chosen.status === "verified" ? " · offiziell" : " · Community"}`
            : "—",
        ),
      );
      if (chosen && typeof s.value === "number" && chosen.value !== s.value)
        row.className = "source-conflict";
      table.append(row);
    }
    const scroll = node("div", null, "stat-table-wrap");
    scroll.append(table);
    details.append(scroll);
    for (const z of p.zones) {
      details.append(node("h4", z.zone + " · Schadensprofil laut Quelle"));
      for (const b of z.bands)
        details.append(
          node(
            "p",
            `${b.from}–${b.to} m: ${b.damage} HP · ${b.shots} Treffer bei ${p.health ?? "unbekannt"} HP laut Quelle`,
          ),
        );
    }
    const ttk = node("div", null, "ttk-tool"),
      out = node("p"),
      distance = node("input"),
      health = node("input"),
      zone = node("select");
    distance.type = "number";
    distance.min = 0;
    distance.max = 10000;
    distance.value = 10;
    distance.setAttribute("aria-label", "TTK Entfernung");
    health.type = "number";
    health.min = 1;
    health.max = 100000;
    health.value = p.health ?? 100;
    health.setAttribute("aria-label", "TTK Zielgesundheit");
    zone.setAttribute("aria-label", "TTK Trefferzone");
    for (const z of p.zones) {
      const o = node("option", z.zone);
      o.value = z.zone;
      zone.append(o);
    }
    if (p.zones.some((z) => z.zone === "Body")) zone.value = "Body";
    const update = () => {
      const r = communityTTK(data, weapon.id, {
        distance: Number(distance.value),
        zone: zone.value,
        health: Number(health.value),
      });
      out.textContent = r
        ? `${fmt(r.ms)} ms · ${r.shots} Treffer · ${r.damage} HP pro Treffer · Quellenmodell ohne Aufsätze`
        : "Für diese Entfernung/Schussfolge fehlt ein auswertbares Quellenprofil.";
    };
    if (p.zones.length) {
      ttk.append(node("h4", "TTK / STK · COMMUNITY-SZENARIO"));
      for (const [label, input] of [
        ["Entfernung in m", distance],
        ["Zielgesundheit in HP", health],
        ["Trefferzone", zone],
      ]) {
        const l = node("label");
        l.append(node("span", label), input);
        ttk.append(l);
        input.addEventListener("input", update);
      }
      ttk.append(
        out,
        node(
          "p",
          "Ab dem ersten Treffer, konstante Schussintervalle; ohne Flugzeit, Fehlschüsse und Aufsatzwirkung. Kein unabhängig bestätigter Spielwert.",
          "stats-note",
        ),
      );
      update();
      details.append(ttk);
    }
    for (const b of p.builds) {
      const build = node("details");
      build.append(node("summary", "QUELLEN-KONFIGURATION · " + b.title));
      for (const part of b.parts)
        build.append(
          node(
            "p",
            `${part.slot}: ${part.name}${part.level !== null ? " · Level " + part.level : ""}`,
          ),
        );
      if (b.apex) build.append(node("p", "Apex: " + b.apex.name));
      build.append(
        node(
          "p",
          "Originalangabe der Quelle. Gültige Kombinationen lassen sich im Community-Menü übernehmen.",
        ),
      );
      details.append(build);
    }
    section.append(details);
  }
  for (const ref of refs) {
    const details = node("details", null, "data-coverage");
    details.open = true;
    details.append(
      node("summary", "WEITERE QUELLE · " + new URL(ref.url).hostname),
      external("Originalquelle ↗", ref.url),
      node("p", ref.note),
    );
    for (const s of ref.observations ?? [])
      details.append(node("p", `${s.label}: ${s.value} ${s.unit}`));
    section.append(details);
  }
  box.append(section);
}
export function renderOptimizer(db, weapon, box, actions) {
  const row = node("div", null, "optimizer-heading");
  row.append(
    node("div", "GUNSMITH / CALCULATED", "eyebrow"),
    node("h3", "BAUE FÜR DEIN ZIEL"),
  );
  box.append(row);
  const config = node("div", null, "optimizer-config"),
    goal = node("select");
  goal.setAttribute("aria-label", "Optimierungsziel");
  for (const [id, label] of [
    ["meta", "Meta · Waffenklasse"],
    ["longshot", "Longshot"],
    ["headshot", "Headshot"],
    ["hipfire", "Hipfire"],
    ["multikill", "Multikill"],
    ["custom", "Eigene Gewichtung"],
  ]) {
    const o = node("option", label);
    o.value = id;
    goal.append(o);
  }
  config.append(goal);
  const includeApex = node("input");
  includeApex.type = "checkbox";
  includeApex.checked = true;
  const apexLabel = node("label", null, "check-control");
  apexLabel.append(
    includeApex,
    node("span", "Verfügbare Apex berücksichtigen"),
  );
  config.append(apexLabel);
  const useLocal = node('input'); useLocal.type = 'checkbox';
  const localLabel = node('label', null, 'check-control'); localLabel.append(useLocal, node('span', 'Eigene Messwerte vergleichen (lokal, einzelne Aufsätze)')); config.append(localLabel);
  const researchLink = node('a', 'Fehlende Werte ergänzen ↗', 'button'); researchLink.href = `#/complete/${weapon.id}`; config.append(researchLink);
  box.append(config);
  const sliders = node("div", null, "weight-sliders"),
    weights = {};
  box.append(sliders);
  function updateWeights() {
    sliders.replaceChildren();
    Object.keys(weights).forEach((k) => delete weights[k]);
    const defaults =
      goal.value === "custom"
        ? { horizontalRecoil: 40, range: 30, ads: 20, movement: 10 }
        : objectiveWeights(goal.value, weapon.weaponClass);
    for (const [key, [label]] of Object.entries(METRICS)) {
      if (
        ["reserve", "rpm", "damage", "weaponLevels", "unlockLevel"].includes(
          key,
        ) ||
        key.startsWith("rating")
      )
        continue;
      weights[key] = defaults[key] ?? 0;
      const r = node("label", null, "weight-row"),
        s = node("input"),
        out = node("output", `${weights[key]}`);
      s.type = "range";
      s.min = 0;
      s.max = 100;
      s.step = 1;
      s.value = weights[key];
      s.setAttribute("aria-label", `Priorität ${label}`);
      s.addEventListener("input", () => {
        weights[key] = Number(s.value);
        out.textContent = s.value;
      });
      r.append(node("span", label), s, out);
      sliders.append(r);
    }
  }
  goal.addEventListener("change", updateWeights);
  updateWeights();
  box.append(
    node(
      "p",
      "Gewichte sind deine Prioritäten; sie werden relativ normalisiert. Standardprofile unterscheiden sich je Waffenklasse. Null deaktiviert einen Wert. Fehlende Werte werden nicht stillschweigend umgewichtet.",
      "stats-note",
    ),
  );
  const scenario = node("details", null, "ttk-scenario");
  scenario.append(
    node("summary", "TTK-Szenario festlegen (für TTK als Ziel erforderlich)"),
  );
  const inputs = {};
  for (const [key, label, unit] of [
    ["distance", "Entfernung", "m"],
    ["health", "Zielgesundheit", "HP"],
  ]) {
    const line = node("label", null, "scenario-line"),
      input = node("input");
    input.type = "number";
    input.min = key === "health" ? "1" : "0";
    input.max = key === "health" ? "100000" : "10000";
    input.step = "any";
    input.setAttribute("aria-label", label);
    inputs[key] = input;
    line.append(node("span", label + " (" + unit + ")"), input);
    scenario.append(line);
  }
  const zone = node("select");
  zone.setAttribute("aria-label", "Körperzone");
  for (const [id, label] of [
    ["upperTorso", "Oberkörper"],
    ["lowerTorso", "Unterkörper"],
    ["head", "Kopf"],
    ["arm", "Arm"],
    ["leg", "Bein"],
  ]) {
    const o = node("option", label);
    o.value = id;
    zone.append(o);
  }
  scenario.append(zone);
  const confirmed = node("input");
  confirmed.type = "checkbox";
  const confirmLabel = node("label", null, "check-control");
  confirmLabel.append(
    confirmed,
    node("span", "Diese Werte als eigenes Vergleichsszenario bestätigen"),
  );
  scenario.append(
    confirmLabel,
    node(
      "p",
      "Keine voreingestellte Spielergesundheit. Das Ergebnis gilt ausschließlich für das bestätigte Szenario. Ein verifiziertes Schadensprofil und Schussfolgemodell bleiben erforderlich.",
      "stats-note",
    ),
  );
  box.append(scenario);
  const result = node("div", null, "optimizer-result"),
    buttons = node("div", null, "action-row");
  let worker;
  const cancel = button(
    "Suche abbrechen",
    () => {
      worker?.terminate();
      worker = null;
      run.disabled = false;
      cancel.hidden = true;
      result.replaceChildren(
        notice("Suche abgebrochen. Dein Entwurf bleibt erhalten."),
      );
    },
    "button subtle",
  );
  cancel.hidden = true;
  const run = button(
    "Build optimieren",
    () => {
      worker?.terminate();
      worker = new Worker(
        new URL("./engine/optimizer-worker.js", import.meta.url),
        { type: "module" },
      );
      run.disabled = true;
      cancel.hidden = false;
      result.replaceChildren(
        node("p", "Gültige Kombinationen werden untersucht …", "eyebrow"),
      );
      worker.onmessage = ({ data }) => {
        worker?.terminate();
        worker = null;
        run.disabled = false;
        cancel.hidden = true;
        result.replaceChildren();
        if (data.error) {
          result.append(notice(data.error, true));
          return;
        }
        const r = data.result;
        result.append(
          node(
            "h3",
            r.status === 'local-partial' ? 'LOKALER AUFSATZVERGLEICH' : r.status === "source-based"
              ? "QUELLEN-BUILD GEFUNDEN"
              : r.status === "optimal"
                ? "CALCULATED · VOLLSTÄNDIG DURCHSUCHT"
                : r.status === "partial"
                  ? "BEGRENZTES SUCHERGEBNIS"
                  : "BERECHNUNG NICHT VERFÜGBAR",
          ),
        );
        for (const reason of r.reasons) result.append(notice(reason));
        for (const candidate of r.localCandidates ?? []) {
          const card = buildCard(db, weapon, candidate, actions, 'Lokale Messung · einzelner Aufsatz');
          card.append(node('p', candidate.score === null ? 'Kein Score: gewichtete Zielwerte fehlen.' : `Lokaler Zielwert-Score ${fmt(candidate.score)} · keine Gesamtbuild-Optimalität`));
          card.append(node('p', 'Fehlende Zielwerte: ' + (candidate.missing.map(k => METRICS[k][0]).join(', ') || 'keine für diese Gewichtung')));
          card.append(statTable(db, weapon.id, candidate.attachments, actions.patch));
          result.append(card);
        }
        if (r.sourceBuild) {
          const b = r.sourceBuild;
          result.append(
            buildCard(
              db,
              weapon,
              b,
              actions,
              b.goalMatch
                ? "Passende Quellenempfehlung"
                : "Allgemeine Quellenempfehlung",
            ),
            node(
              "p",
              `${b.independentSources} unabhängige Quelle(n) · ${b.confidence} · ${b.goalMatch ? "Einsatzzweck passt zur Quelle" : "Kein spezieller Build für dieses Ziel belegt"}`,
            ),
          );
        }
        if (r.algorithm)
          result.append(
            node(
              "p",
              `${r.algorithm === "exhaustive" ? "Vollständige Suche" : "Beam-Suche"} · ${r.evaluated.toLocaleString("de-DE")} bewertet · ${r.unknown ?? 0} ohne vollständige Werte · ${r.invalid ?? 0} ungültig`,
            ),
          );
        if (r.results.length) {
          const b = r.results[0],
            card = buildCard(
              db,
              weapon,
              b,
              actions,
              r.status === "optimal"
                ? "Calculated Build"
                : "Bester berechenbarer Kandidat im bekannten Katalog",
            );
          card.append(
            node(
              "p",
              `Zielfunktionswert ${fmt(b.score)} · ${b.attachments.length} Aufsätze`,
            ),
          );
          if (!b.attachments.length)
            card.append(
              node(
                "p",
                "Basiswaffe ohne Aufsätze. Das ist keine Empfehlung für unbekannte Kombinationen.",
              ),
            );
          result.append(
            card,
            compareStats(db, weapon.id, [], b.attachments, actions.patch),
          );
        }
        if (r.hybrid)
          result.append(
            buildCard(
              db,
              weapon,
              r.hybrid,
              actions,
              "Hybrid · Messwerte plus begrenzter Quellenbonus",
            ),
          );
        else
          result.append(
            node(
              "p",
              "Hybrid Build: kein gemeinsamer, berechenbarer Kandidat mit aktueller Community-Evidenz.",
              "stats-note",
            ),
          );
        result.append(
          button(
            "Suchbericht exportieren",
            () => download(`${weapon.id}-optimizer.json`, r),
            "button subtle",
          ),
        );
        if (r.policy) result.append(node("p", r.policy, "stats-note"));
      };
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
        run.disabled = false;
        cancel.hidden = true;
        result.replaceChildren(
          notice(
            "Berechnung fehlgeschlagen. Gespeicherte Builds bleiben erhalten.",
            true,
          ),
        );
      };
      worker.postMessage({
        db,
        weaponId: weapon.id,
        options: {
          goal: goal.value === "custom" ? "custom" : goal.value,
          weights: { ...weights },
          patch: actions.patch,
          allowApex: includeApex.checked,
          useLocalResearch: useLocal.checked,
          context: {
            distance:
              inputs.distance.value === ""
                ? null
                : Number(inputs.distance.value),
            health:
              inputs.health.value === "" ? null : Number(inputs.health.value),
            zone: zone.value,
            healthVerified: confirmed.checked,
          },
        },
      });
    },
    "button primary",
    "build",
  );
  buttons.append(run, cancel);
  box.append(buttons, result);
  actions.onCleanup?.(() => worker?.terminate());
}
export function renderDataCoverage(db, weapon, box, patch) {
  const w = db.weapons.find((w) => w.id === weapon.id);
  if (!w) return;
  if (!box.querySelector(".evidence-quality"))
    box.append(evidenceQuality(db, weapon.id, patch));
  const details = node("details", null, "data-coverage");
  details.append(
    node(
      "summary",
      `DATENABDECKUNG · ${Object.keys(w.base).length} Basiswerte · ${db.attachments.filter((a) => a.weaponIds.includes(w.id)).length} recherchierte Aufsätze`,
    ),
  );
  for (const n of w.notes) details.append(node("p", n));
  for (const n of w.coverage.missing)
    if (!(w.coverage.reportedCatalogComplete && /Aufsatzkatalog/i.test(n)))
      details.append(node("p", `Offen: ${n}`));
  details.append(
    node(
      "p",
      `Geprüft: ${date(w.coverage.checkedAt)} · Patch ${w.rules.patchRevision === patch ? "aktuell geprüft" : "erneut prüfen"}`,
    ),
  );
  sourceLinks(db, w.sourceIds, details);
  details.append(statTable(db, weapon.id, [], patch));
  if (db.effectEvidence) {
    const rows = effectCoverage(db, patch),
      t = node("table", null, "comparison-table"),
      head = node("tr");
    for (const label of [
      "WAFFE",
      "AUFSÄTZE",
      "QUELLEN-ZAHLEN",
      "VERIF. ZAHLEN",
      "UNVOLLST.",
      "KONFLIKTE AUFSATZ / BASIS",
      "VOLLST. %",
    ])
      head.append(node("th", label));
    t.append(head);
    for (const c of rows) {
      const r = node("tr");
      for (const value of [
        c.name,
        c.attachments,
        c.numeric,
        c.verifiedNumeric,
        c.incomplete,
        `${c.conflicting} / ${c.baseConflicts}`,
        c.completeness === null ? "N/A" : c.completeness + " %",
      ])
        r.append(node("td", String(value)));
      t.append(r);
    }
    const scroll = node("div", null, "stat-table-wrap");
    scroll.append(t);
    details.append(
      scroll,
      node(
        "p",
        "Verif. Zahlen = mindestens ein offizieller oder reproduzierbar getesteter numerischer Effekt. Quellen-Zahlen bleiben Community-Angaben. Vollständigkeit verlangt vollständige Effektlisten; N/A = keine Aufsatzslots.",
        "stats-note",
      ),
    );
    const conflicts = node("details");
    conflicts.append(
      node(
        "summary",
        `Basiswert-Konflikte: ${w.evidenceConflicts?.length ?? 0}`,
      ),
    );
    for (const c of w.evidenceConflicts ?? [])
      conflicts.append(
        node(
          "p",
          `${METRICS[c.stat][0]}: bevorzugt ${fmt(c.before.value)} ${c.before.unit}; zusätzliche Quelle ${fmt(c.reported.value)} ${c.reported.unit}. Nicht gemittelt.`,
        ),
      );
    sourceLinks(db, ["ggranked-" + weapon.id], conflicts);
    details.append(conflicts);
    const restrictions = node("details");
    restrictions.append(
      node("summary", "Recherchegrenzen und nicht zusammengeführte Namen"),
    );
    for (const r of db.effectEvidence.restrictions) {
      const p = node("p", `${r.source}: ${r.reason} `);
      p.append(external("Beleg ↗", r.url));
      restrictions.append(p);
    }
    for (const a of db.effectEvidence.aliasReviews.filter(
      (a) => a.weaponId === weapon.id,
    ))
      restrictions.append(node("p", a.names.join(" / ") + ": " + a.reason));
    details.append(restrictions);
  }
  const table = node("table", null, "comparison-table"),
    h = node("tr");
  for (const v of ["WAFFE", "BASISWERTE", "AUFSÄTZE", "KATALOG"])
    h.append(node("th", v));
  table.append(h);
  for (const c of coverageReport(db, patch)) {
    const r = node("tr");
    r.append(
      node("td", c.name),
      node("td", `${c.currentValues}/${c.baseValues}`),
      node("td", String(c.attachments)),
      node(
        "td",
        c.catalogComplete
          ? "vollständig / N/A"
          : db.weapons.find((w) => w.id === c.weaponId)?.coverage
                .reportedCatalogComplete
            ? "Veröffentlichte Liste erfasst · Effekte offen"
            : "unvollständig",
      ),
    );
    table.append(r);
  }
  const scroll = node("div", null, "stat-table-wrap");
  scroll.append(table);
  details.append(
    scroll,
    button(
      "Gesamte Datenbasis exportieren",
      () => download("mw4-gunsmith-database.json", db),
      "button subtle",
    ),
  );
  box.append(details);
}
export function evidenceQuality(db, weaponId, patch = db.patchRevision) {
  const c = effectCoverage(db, patch).find((w) => w.weaponId === weaponId),
    box = node("div", null, "evidence-quality");
  if (!c) return box;
  box.append(
    node(
      "strong",
      `DATENQUALITÄT · ${c.numeric}/${c.attachments} Aufsätze mit Zahlen`,
    ),
    node(
      "span",
      `${c.verifiedNumeric} mit offiziellen/Test-Zahlen · ${c.incomplete} unvollständig · ${c.conflicting} Aufsatzkonflikte · ${c.baseConflicts} Basiswert-Konflikte`,
    ),
    node(
      "span",
      c.attachments
        ? `Numerische Abdeckung ${c.numericCoverage} % · vollständige Effektdatensätze ${c.completeness} %`
        : "Keine Gunsmith-Aufsatzslots laut offizieller Übersicht.",
    ),
  );
  if (db.effectEvidence?.patchRevision !== patch)
    box.append(
      node(
        "span",
        "Effekt-Recherche gehört zu einem älteren Patch. Neuprüfung erforderlich.",
      ),
    );
  return box;
}
export function appendAttachmentEvidence(db, a, box) {
  for (const m of a.localEffects ?? []) {
    box.append(node('p', `LOKAL · ${METRICS[m.stat][0]}: ${m.operation} ${m.value} ${m.unit}${m.conflict ? m.replacePublished ? ' · Quellenabweichung nur lokal bestätigt' : ' · Widerspruch, inaktiv' : ''}`, 'effect-line'));
    sourceLinks(db, m.sourceIds, box);
  }
  const edit = node('a', 'Daten dieses Aufsatzes vervollständigen ↗', 'button'); edit.href = `#/complete/${a.weaponIds[0]}/${a.id}`; box.append(edit);
  const data = a.evidence,
    current = data?.patchRevision === db.patchRevision;
  box.append(
    node(
      "p",
      data
        ? `MW4 · Multiplayer · geprüft ${date(data.checkedAt)} · Quellenstand ${date(data.asOf)} · ${current ? "gespeicherter Patchstand" : "Patch veraltet"} · Community-Angabe, nicht unabhängig vermessen.`
        : `Geprüft ${date(a.checkedAt)} · keine zusätzliche numerische Quelle zugeordnet.`,
      "stats-note",
    ),
  );
  if (a.aliases?.length)
    box.append(
      node("p", "Schreibvarianten: " + a.aliases.join(", "), "stats-note"),
    );
  if (a.compatibilityConflict)
    box.append(notice(a.compatibilityConflict, true));
  if (data?.unlockLabel)
    box.append(
      node(
        "p",
        "Quellen-Freischaltung: " +
          data.unlockLabel +
          ". „Weapon Unlocks“ wird nicht ungeprüft als Waffenlevel interpretiert.",
        "stats-note",
      ),
    );
  for (const e of data?.effects ?? []) {
    const kind = {
      absolute: "absoluter Zielwert",
      additive: "absolute Änderung",
      percent: "Prozentangabe",
      factor: "Faktor",
      qualitative: "qualitativ",
    }[e.kind];
    box.append(
      node(
        "p",
        `${e.raw} · ${kind}${e.reason && e.kind !== "qualitative" ? " · " + e.reason : ""}`,
        "effect-line",
      ),
    );
  }
  if (
    !data?.effects.some((e) => e.kind !== "qualitative") &&
    !a.modifiers.length
  )
    box.append(
      node(
        "p",
        "Numerische Werte: FEHLEN. Unbekannt bedeutet nicht 0.",
        "stats-note",
      ),
    );
  box.append(
    node(
      "p",
      "Vollständige Effekte und Stapelregeln: nicht verifiziert.",
      "stats-note",
    ),
  );
  sourceLinks(db, a.sourceIds, box);
}
