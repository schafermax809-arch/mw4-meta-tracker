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
const fmt = (v) => Number(v.toFixed(3)).toLocaleString("de-DE");
export function statTable(db, weaponId, refs, patch) {
  const c = calculateStats(db, weaponId, refs, patch),
    wrap = node("div", null, "stat-table-wrap"),
    table = node("table", null, "comparison-table");
  const h = node("tr");
  for (const s of ["WAFFENWERT", "BASIS", "BUILD", "Δ ABS.", "Δ %"])
    h.append(node("th", s));
  table.append(h);
  for (const [key, [label, unit]] of Object.entries(METRICS)) {
    if (key === "ttk" || (!c.base[key] && !c.values[key])) continue;
    const base = c.base[key],
      v = c.values[key],
      d = c.deltas[key],
      r = node("tr");
    r.append(
      node("th", label),
      node(
        "td",
        base
          ? `${fmt(base.value)} ${unit}${base.status === "reported" ? " C" : ""}`
          : "—",
      ),
      node(
        "td",
        v
          ? `${fmt(v.value)} ${unit}${v.status === "reported" ? " C" : ""}`
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
      "C = Community-Quelle. — = Aufsatzwirkung unbekannt. Zeitwerte in ms: kleiner ist schneller. Unvollständige Aufsatzeffekte machen betroffene Konfigurationen unberechenbar.",
      "stats-note",
    ),
  );
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
  for (const s of db.sources.filter((s) => s.kind !== "official")) {
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
            r.status === "source-based"
              ? "QUELLEN-BUILD GEFUNDEN"
              : r.status === "optimal"
                ? "CALCULATED · VOLLSTÄNDIG DURCHSUCHT"
                : r.status === "partial"
                  ? "BEGRENZTES SUCHERGEBNIS"
                  : "BERECHNUNG NICHT VERFÜGBAR",
          ),
        );
        for (const reason of r.reasons) result.append(notice(reason));
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
  const details = node("details", null, "data-coverage");
  details.append(
    node(
      "summary",
      `DATENABDECKUNG · ${Object.keys(w.base).length} Basiswerte · ${db.attachments.filter((a) => a.weaponIds.includes(w.id)).length} recherchierte Aufsätze`,
    ),
  );
  for (const n of w.notes) details.append(node("p", n));
  for (const n of w.coverage.missing) details.append(node("p", `Offen: ${n}`));
  details.append(
    node(
      "p",
      `Geprüft: ${date(w.coverage.checkedAt)} · Patch ${w.rules.patchRevision === patch ? "aktuell geprüft" : "erneut prüfen"}`,
    ),
  );
  sourceLinks(db, w.sourceIds, details);
  details.append(statTable(db, weapon.id, [], patch));
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
      node("td", c.catalogComplete ? "vollständig / N/A" : "unvollständig"),
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
