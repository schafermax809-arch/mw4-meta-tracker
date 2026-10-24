import {
  loadProgress,
  saveProgress,
  validateProgress,
  progressPercent,
} from "./progress.js";
import {
  CLASSES,
  SLOT_NAMES,
  currentTier,
  camoKey,
  weaponProgress,
  camoCategory,
  prerequisitesMet,
  filterWeapons,
  planGrind,
  loadPreferences,
  savePreferences,
} from "./library.js";
import {
  loadBuilds,
  saveBuild,
  deleteBuild,
  buildIssues,
  setAttachment,
  verifiedStats,
  shareBuild,
  parseSharedBuild,
  validateSavedBuild,
} from "./gunsmith.js";
import {
  $,
  node,
  icon,
  button,
  external,
  date,
  empty,
  notice,
  toast,
  download,
} from "./ui.js";

const TABS = [
  ["attachments", "Aufsätze"],
  ["meta", "Meta-Build"],
  ["camo-build", "Camo-Build"],
  ["camos", "Tarnungen"],
  ["challenges", "Herausforderungen"],
  ["tracker", "Tracker"],
];
const CATEGORIES = {
  all: "Alle Camos",
  military: "Militär",
  special: "Spezial",
  completionist: "Completionist",
  mastery: "Mastery",
};
const slotIcon = (slot) =>
  ({
    Optic: "optic",
    Muzzle: "muzzle",
    Barrel: "barrel",
    Underbarrel: "grip",
    Magazine: "magazine",
    "Rear Grip": "grip",
    Stock: "stock",
    Ammunition: "ammo",
    Laser: "laser",
  })[slot] || "build";
const screen = $("#screen");
let state,
  presentation = { weapons: {}, camoAssets: {} };
let progress = { schemaVersion: 1, entries: {} },
  preferences = { schemaVersion: 1, favorites: [] },
  customBuilds = { schemaVersion: 1, builds: [] };
const storageStatus = { progress: true, preferences: true, builds: true };
try {
  progress = loadProgress(localStorage);
} catch {
  storageStatus.progress = false;
}
try {
  preferences = loadPreferences(localStorage);
} catch {
  storageStatus.preferences = false;
}
try {
  customBuilds = loadBuilds(localStorage);
} catch {
  storageStatus.builds = false;
}
let selectedId = "m4",
  selectedClass = "assault-rifle",
  selectedCamoId = null,
  camoFilter = "all";
let filters = {
  query: "",
  tier: "",
  favoritesOnly: false,
  changedOnly: false,
  progressFilter: "",
};
const drafts = new Map(),
  editingIds = new Map(),
  draftNames = new Map();
let viewer = null;
const context = () => ({
  progress,
  favorites: preferences.favorites,
  patchRevision: state.patchRevision,
  changedWeaponIds: state.lastChangedWeaponIds,
});
const draft = (weapon) => drafts.get(weapon.id) || [];
const rules = (weapon) => presentation.weapons[weapon.id]?.rules;
const asset = (weapon) => {
  const a = presentation.weapons[weapon.id]?.asset;
  return a?.license && a.sourceUrl && (a.image || a.model) ? a : null;
};
function route() {
  try {
    const parts = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split(
      "/",
    );
    if (["overview", "weapons", ""].includes(parts[0]))
      return { page: "arsenal" };
    if (parts[0] === "changelog") return { page: "intel", tab: "changelog" };
    if (parts[0] === "sources") return { page: "intel", tab: "sources" };
    if (parts[0] === "weapon")
      return {
        page: "weapon",
        id: parts[1],
        tab: TABS.some((t) => t[0] === parts[2]) ? parts[2] : "attachments",
      };
    return { page: parts[0], tab: parts[1] || "status", shared: parts[1] };
  } catch {
    return { page: "arsenal" };
  }
}
function go(path) {
  if (location.hash === `#/${path}`) render();
  else location.hash = `/${path}`;
}
function weaponLink(weapon, tab = "attachments") {
  selectedId = weapon.id;
  selectedClass = weapon.weaponClass;
  go(`weapon/${weapon.id}/${tab}`);
}
function back() {
  if (document.querySelector("dialog[open]")) {
    document.querySelector("dialog[open]").close();
    return;
  }
  go("arsenal");
}
function heading(kicker, title, description = "") {
  const wrapper = node("div", null, "screen-heading");
  const text = node("div");
  text.append(node("div", kicker, "eyebrow"), node("h1", title));
  if (description) text.append(node("p", description));
  wrapper.append(text);
  return wrapper;
}
function favorited(weapon) {
  return preferences.favorites.includes(weapon.id);
}
function toggleFavorite(weapon) {
  if (!storageStatus.preferences)
    return toast(
      "Favoritenspeicher nicht verfügbar. Vorhandene Daten bleiben erhalten.",
    );
  const next = {
    schemaVersion: 1,
    favorites: favorited(weapon)
      ? preferences.favorites.filter((id) => id !== weapon.id)
      : [...preferences.favorites, weapon.id],
  };
  try {
    savePreferences(localStorage, next);
    preferences = next;
    toast(
      favorited(weapon)
        ? `${weapon.name} als Favorit gespeichert.`
        : `${weapon.name} aus Favoriten entfernt.`,
    );
    render();
  } catch {
    toast("Favorit konnte nicht gespeichert werden.");
  }
}
function missingPreview() {
  const box = node("div", null, "missing-preview");
  box.append(icon("target"), node("span", "LIZENZIERTE VORSCHAU FEHLT"));
  return box;
}
function weaponImage(weapon, className = "", lazy = false) {
  const a = asset(weapon);
  if (!a?.image) return missingPreview();
  const img = node("img", null, className);
  img.src = a.image;
  img.alt = a.caption;
  img.loading = lazy ? "lazy" : "eager";
  img.decoding = "async";
  img.addEventListener("error", () => img.replaceWith(missingPreview()), {
    once: true,
  });
  return img;
}
function favoriteButton(weapon) {
  const b = button(
    favorited(weapon) ? "Favorit gespeichert" : "Als Favorit markieren",
    () => toggleFavorite(weapon),
    "button subtle",
    "star",
  );
  b.setAttribute("aria-pressed", String(favorited(weapon)));
  return b;
}
function renderArsenal() {
  const h = heading(
    "MULTIPLAYER / DEIN ARSENAL",
    "WAFFEN",
    "Waffe auswählen. Loadout anpassen. Deinen Grind im Blick behalten.",
  );
  const actions = node("div", null, "heading-actions");
  actions.append(
    button(
      filters.favoritesOnly ? "Alle Waffen" : "Favoriten",
      () => {
        filters.favoritesOnly = !filters.favoritesOnly;
        render();
      },
      "button subtle",
      "star",
    ),
  );
  h.append(actions);
  screen.append(h);
  const layout = node("div", null, "arsenal-layout");
  const sidebar = node("aside", null, "class-sidebar");
  sidebar.setAttribute("aria-label", "Waffenklassen");
  sidebar.append(node("div", "WAFFENKLASSE", "eyebrow"));
  for (const [id, label] of [["", "Alle Waffen"], ...Object.entries(CLASSES)]) {
    const b = node(
      "button",
      null,
      `class-item${selectedClass === id ? " active" : ""}`,
    );
    b.append(
      node("span", label),
      node(
        "small",
        String(state.weapons.filter((w) => !id || w.weaponClass === id).length),
      ),
    );
    b.setAttribute("aria-pressed", String(selectedClass === id));
    b.addEventListener("click", () => {
      selectedClass = id;
      render();
    });
    sidebar.append(b);
  }
  const known = state.weapons.reduce((sum, w) => sum + w.camos.length, 0);
  const note = node("div", null, "class-note");
  note.append(
    node("span", `${state.weapons.length} WAFFEN`),
    node(
      "p",
      `${known} verifizierte Camo-Ziele im Datensatz. Unbekannte Ziele zählen nicht als erledigt.`,
    ),
  );
  sidebar.append(
    note,
    node(
      "div",
      "PFEILTASTEN  AUSWAHL\nENTER  GUNSMITH\nF  FAVORIT",
      "keyboard-tip",
    ),
  );
  const body = node("div", null, "arsenal-content");
  const mobile = node("select", null, "mobile-class");
  mobile.setAttribute("aria-label", "Waffenklasse");
  for (const [value, text] of [
    ["", "Alle Waffen"],
    ...Object.entries(CLASSES),
  ]) {
    const o = node("option", text);
    o.value = value;
    mobile.append(o);
  }
  mobile.value = selectedClass;
  mobile.addEventListener("change", () => {
    selectedClass = mobile.value;
    render();
  });
  body.append(mobile);
  const feature = node("div", null, "arsenal-feature");
  feature.id = "arsenal-feature";
  body.append(feature);
  const form = node("div", null, "filters");
  const searchLabel = node("label", null, "search");
  const input = node("input");
  input.id = "weapon-search";
  input.type = "search";
  input.placeholder = "WAFFE SUCHEN …";
  input.setAttribute("aria-label", "Waffe suchen");
  input.value = filters.query;
  searchLabel.append(icon("search"), input);
  form.append(searchLabel);
  const makeSelect = (label, values, value, update) => {
    const s = node("select", null, "filter-select");
    s.setAttribute("aria-label", label);
    for (const [v, text] of values) {
      const o = node("option", text);
      o.value = v;
      s.append(o);
    }
    s.value = value;
    s.addEventListener("change", () => {
      update(s.value);
      renderArsenalGrid();
    });
    form.append(s);
  };
  makeSelect(
    "Meta-Tier",
    [
      ["", "ALLE META-TIERS"],
      ...["S", "A", "B", "C"].map((t) => [t, `TIER ${t}`]),
      ["unknown", "NICHT VERIFIZIERT"],
    ],
    filters.tier,
    (v) => (filters.tier = v),
  );
  makeSelect(
    "Camo-Fortschritt",
    [
      ["", "JEDER FORTSCHRITT"],
      ["started", "IN ARBEIT"],
      ["complete", "BEKANNTE ZIELE ERLEDIGT"],
      ["new", "NICHT BEGONNEN"],
      ["unknown", "ZIELE UNBEKANNT"],
    ],
    filters.progressFilter,
    (v) => (filters.progressFilter = v),
  );
  const changedLabel = node("label", null, "toggle-filter");
  const changed = node("input");
  changed.type = "checkbox";
  changed.checked = filters.changedOnly;
  changed.addEventListener("change", () => {
    filters.changedOnly = changed.checked;
    renderArsenalGrid();
  });
  changedLabel.append(changed, node("span", "ZULETZT GEÄNDERT"));
  form.append(changedLabel);
  input.addEventListener("input", () => {
    filters.query = input.value;
    renderArsenalGrid();
  });
  body.append(form);
  const grid = node("div", null, "weapons-grid");
  grid.id = "weapons-grid";
  grid.setAttribute("aria-label", "Waffenauswahl");
  body.append(grid);
  const meta = node("div", null, "section-meta");
  meta.append(node("span", null));
  meta.firstChild.id = "result-count";
  meta.append(node("span", "REFERENZFOTOS SIND KEINE MW4-SPIELRENDER."));
  body.append(meta);
  layout.append(sidebar, body);
  screen.append(layout);
  renderArsenalGrid();
}
function selectTile(weapon, focus = false) {
  selectedId = weapon.id;
  document.querySelectorAll(".weapon-tile").forEach((b) => {
    const selected = b.dataset.weapon === weapon.id;
    b.classList.toggle("selected", selected);
    b.tabIndex = selected ? 0 : -1;
    b.setAttribute("aria-pressed", String(selected));
    if (selected && focus) b.focus();
  });
  renderFeature(weapon);
}
function renderFeature(weapon) {
  const feature = $("#arsenal-feature");
  if (!feature) return;
  feature.replaceChildren();
  const info = node("div", null, "feature-copy");
  const p = weaponProgress(weapon, progress);
  info.append(
    node("div", "AKTUELLE AUSWAHL", "eyebrow"),
    node("h2", weapon.name),
    node(
      "p",
      `${CLASSES[weapon.weaponClass]} · ${p.known ? `${p.completed}/${p.total} bekannte Ziele` : "Camo-Ziele unbekannt"}`,
    ),
    button(
      "Gunsmith öffnen",
      () => weaponLink(weapon),
      "button primary",
      "arrow",
    ),
  );
  feature.append(
    info,
    weaponImage(weapon, "feature-image"),
    node("span", `MW4 / ${weapon.weaponClass.toUpperCase()}`, "feature-index"),
  );
  feature.append(
    node(
      "span",
      asset(weapon)?.caption || "KEIN GEPRÜFTES WAFFENBILD VERFÜGBAR",
      "feature-caption",
    ),
  );
}
function renderArsenalGrid() {
  const grid = $("#weapons-grid");
  if (!grid) return;
  const weapons = filterWeapons(
    state.weapons,
    { ...filters, weaponClass: selectedClass },
    context(),
  );
  grid.replaceChildren();
  $("#result-count").textContent =
    `${weapons.length} / ${state.weapons.length} WAFFEN · ${selectedClass ? CLASSES[selectedClass].toUpperCase() : "ALLE KLASSEN"}`;
  if (!weapons.length) {
    grid.append(
      empty(
        "Keine Waffen gefunden",
        "Passe die Suche oder Filter an.",
        button(
          "Filter zurücksetzen",
          () => {
            filters = {
              query: "",
              tier: "",
              favoritesOnly: false,
              changedOnly: false,
              progressFilter: "",
            };
            render();
          },
          "button subtle",
        ),
      ),
    );
    renderFeature(
      state.weapons.find((w) => w.id === selectedId) || state.weapons[0],
    );
    return;
  }
  if (!weapons.some((w) => w.id === selectedId)) selectedId = weapons[0].id;
  for (const w of weapons) {
    const p = weaponProgress(w, progress),
      tier = currentTier(w, state.patchRevision);
    const b = node(
      "button",
      null,
      `weapon-tile${w.id === selectedId ? " selected" : ""}`,
    );
    b.dataset.weapon = w.id;
    b.tabIndex = w.id === selectedId ? 0 : -1;
    b.setAttribute("aria-pressed", String(w.id === selectedId));
    b.setAttribute(
      "aria-label",
      `${w.name} · ${CLASSES[w.weaponClass]} · Gunsmith öffnen`,
    );
    const image = node("div", null, "tile-media");
    image.append(weaponImage(w, "", true));
    if (asset(w)?.image)
      image.append(node("span", "REFERENZFOTO", "tile-photo-tag"));
    b.append(image);
    const footer = node("div", null, "tile-info");
    const title = node("div");
    title.append(
      node("h3", w.name),
      node(
        "p",
        p.known
          ? `${p.completed} / ${p.total} BEKANNTE CAMO-ZIELE`
          : "CAMO-ZIELE NICHT VERIFIZIERT",
      ),
    );
    const badge = node("span", tier ? `TIER ${tier}` : "META —", "tile-badge");
    if (state.lastChangedWeaponIds.includes(w.id)) badge.append(icon("check"));
    footer.append(title, badge);
    b.append(footer);
    if (favorited(w)) b.append(node("span", "★", "tile-favorite"));
    const bar = node("div", null, "tile-progress"),
      fill = node("i");
    fill.style.width = `${p.percent || 0}%`;
    bar.append(fill);
    b.append(bar);
    b.addEventListener("click", () => weaponLink(w));
    b.addEventListener("focus", () => selectTile(w));
    b.addEventListener("keydown", (e) => {
      const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
      const i = weapons.findIndex((x) => x.id === w.id);
      const delta = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: cols,
        ArrowUp: -cols,
      }[e.key];
      if (delta !== undefined) {
        e.preventDefault();
        selectTile(
          weapons[Math.max(0, Math.min(weapons.length - 1, i + delta))],
          true,
        );
      }
    });
    grid.append(b);
  }
  renderFeature(weapons.find((w) => w.id === selectedId));
}
function renderStats(weapon) {
  const panel = node("aside", null, "stats-panel");
  panel.id = "weapon-statistics";
  panel.append(node("div", "WAFFENWERTE", "eyebrow"));
  const stats = verifiedStats(
    weapon.id,
    draft(weapon),
    presentation,
    state.patchRevision,
  );
  for (const [key, label] of [
    ["damage", "Schaden"],
    ["range", "Reichweite"],
    ["accuracy", "Präzision"],
    ["mobility", "Mobilität"],
    ["handling", "Handling"],
  ]) {
    const value = stats?.[key];
    const row = node("div", null, "stat-line");
    const meter = node("div", null, `stat-meter${value ? "" : " unknown"}`);
    if (value?.scaleMax > 0) {
      const fill = node("i");
      fill.style.width = `${Math.min(100, (value.value / value.scaleMax) * 100)}%`;
      meter.append(fill);
    }
    row.append(
      node("span", label),
      meter,
      node(
        "span",
        value ? `${value.value} ${value.unit}` : "NICHT VERIFIZIERT",
        "stat-value",
      ),
    );
    panel.append(row);
  }
  panel.append(
    node(
      "p",
      stats
        ? "Geprüfte Werte dieser exakten Konfiguration."
        : "Keine geschätzten Balken. Aktuelle Messwerte und Aufsatzmodifikatoren sind noch nicht hinterlegt.",
      "stats-note",
    ),
  );
  return panel;
}
function renderWeapon(weapon, tab) {
  selectedId = weapon.id;
  selectedClass = weapon.weaponClass;
  const toolbar = node("div", null, "detail-toolbar");
  const crumbs = button(
    `Waffen / ${CLASSES[weapon.weaponClass]}`,
    () => go("arsenal"),
    "text-button breadcrumb",
    "arrow",
  );
  const sameClass = state.weapons.filter(
      (w) => w.weaponClass === weapon.weaponClass,
    ),
    index = sameClass.findIndex((w) => w.id === weapon.id);
  const switcher = node("div", null, "weapon-switcher");
  switcher.append(
    button(
      "‹",
      () =>
        weaponLink(
          sameClass[(index - 1 + sameClass.length) % sameClass.length],
          tab,
        ),
      "icon-button",
    ),
    node(
      "span",
      `${String(index + 1).padStart(2, "0")} / ${String(sameClass.length).padStart(2, "0")}`,
    ),
    button(
      "›",
      () => weaponLink(sameClass[(index + 1) % sameClass.length], tab),
      "icon-button",
    ),
  );
  switcher.children[0].setAttribute("aria-label", "Vorherige Waffe");
  switcher.children[2].setAttribute("aria-label", "Nächste Waffe");
  toolbar.append(crumbs, switcher);
  screen.append(toolbar);
  const stage = node("section", null, "detail-stage");
  const title = node("div", null, "weapon-title");
  title.append(
    node("div", `MULTIPLAYER / ${CLASSES[weapon.weaponClass]}`, "eyebrow"),
    node("h1", weapon.name),
  );
  const p = weaponProgress(weapon, progress);
  title.append(
    node(
      "p",
      p.known
        ? `${p.total} bestätigte Camo-Ziele. Dein Fortschritt wird ausschließlich lokal gespeichert.`
        : "Wähle dein Loadout. Unbekannte Spieldaten bleiben bis zur Quellenprüfung offen.",
    ),
  );
  const tier = currentTier(weapon, state.patchRevision);
  title.append(
    node(
      "span",
      tier
        ? `VERIFIZIERT · TIER ${tier}`
        : weapon.tier
          ? "META VERALTET · ERNEUT PRÜFEN"
          : "META · NICHT VERIFIZIERT",
      `tier-tag${tier ? "" : " unknown"}`,
    ),
  );
  const visual = node("div", null, "weapon-visual");
  visual.id = "weapon-visual";
  visual.append(weaponImage(weapon));
  const caption = node("div", null, "image-caption");
  const a = asset(weapon);
  caption.append(
    node(
      "span",
      a?.caption || "Kein lizenziertes Spielrender oder 3D-Modell hinterlegt.",
    ),
  );
  if (a) {
    caption.append(
      node("span", " · "),
      button("Bildnachweis", () => go("intel/credits"), "text-button"),
    );
  }
  if (tab === "camos")
    caption.append(
      node("div", "Originalansicht · keine erfundene Tarnungsvisualisierung"),
    );
  visual.append(caption);
  stage.append(title, visual, renderStats(weapon));
  screen.append(stage);
  if (a?.model) {
    const inspect = button(
      "3D-Inspektion",
      async () => {
        if (viewer) {
          viewer.reset();
          return;
        }
        try {
          const { createModelViewer } = await import("./viewer.js");
          const target = node("div");
          target.style.cssText = "position:absolute;inset:0;";
          visual.append(target);
          const loaded = await createModelViewer(target, a);
          if (!target.isConnected) loaded?.dispose();
          else if (loaded) {
            viewer = loaded;
            visual.querySelector("img")?.remove();
            target.style.touchAction = "none";
            inspect.textContent = "Kamera zurücksetzen";
          }
        } catch {
          toast("3D-Ansicht nicht verfügbar. Die 2D-Vorschau bleibt erhalten.");
        }
      },
      "button subtle",
    );
    screen.append(inspect);
  }
  const tabs = node("div", null, "detail-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Gunsmith-Untermenüs");
  TABS.forEach(([id, label], i) => {
    const b = button(
      label,
      () => weaponLink(weapon, id),
      `detail-tab${tab === id ? " active" : ""}`,
    );
    b.id = `tab-${id}`;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(tab === id));
    b.setAttribute("aria-controls", "submenu-panel");
    b.tabIndex = tab === id ? 0 : -1;
    b.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const target =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? TABS.length - 1
              : (i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) %
                TABS.length;
        weaponLink(weapon, TABS[target][0]);
        requestAnimationFrame(() => $(`#tab-${TABS[target][0]}`)?.focus());
      }
    });
    tabs.append(b);
  });
  screen.append(tabs);
  const content = node("section", null, "submenu-content");
  content.id = "submenu-panel";
  content.setAttribute("role", "tabpanel");
  content.setAttribute("aria-labelledby", `tab-${tab}`);
  if (tab === "attachments") renderAttachments(weapon, content);
  else if (tab === "meta" || tab === "camo-build")
    renderRecommendedBuilds(weapon, content, tab === "meta" ? "meta" : "camo");
  else if (tab === "camos") renderCamos(weapon, content);
  else if (tab === "challenges") renderChallenges(weapon, content);
  else renderTracker(weapon, content);
  screen.append(content);
}

function renderAttachments(weapon, content) {
  const r = rules(weapon),
    refs = draft(weapon);
  const slots = r?.slots || [
    ...new Set(
      state.attachments
        .filter((a) => a.weaponIds.includes(weapon.id))
        .map((a) => a.slot),
    ),
  ];
  if (slots.length) {
    const grid = node("div", null, "attachment-grid");
    slots.forEach((slot, i) => {
      const ref = refs.find((a) => a.slot === slot),
        a = state.attachments.find((a) => a.id === ref?.attachmentId);
      const b = node("button", null, `attachment-slot${ref ? " filled" : ""}`);
      b.append(
        icon(slotIcon(slot)),
        node("span", SLOT_NAMES[slot] || slot, "slot-label"),
        node(
          "strong",
          a?.name || (ref ? "Aufsatz nicht mehr verfügbar" : "Kein Aufsatz"),
        ),
        node("span", String(i + 1).padStart(2, "0"), "slot-index"),
      );
      b.setAttribute(
        "aria-label",
        `${SLOT_NAMES[slot] || slot}: ${a?.name || "Aufsatz auswählen"}`,
      );
      b.addEventListener("click", () => openAttachmentEditor(weapon, slot));
      grid.append(b);
    });
    content.append(grid);
  } else
    content.append(
      empty(
        "Keine Aufsatzslots bestätigt",
        "Für diese Waffe liegen noch keine verifizierten Slot-Informationen vor.",
      ),
    );
  const issues = buildIssues(
    weapon,
    refs,
    state.attachments,
    r,
    state.patchRevision,
  );
  if (issues.length) content.append(notice(issues.join(" "), true));
  if (!state.attachments.some((a) => a.weaponIds.includes(weapon.id)))
    content.append(
      notice(
        "Die Slot-Kategorien stammen aus der offiziellen Waffenübersicht. Konkrete kompatible Aufsätze, Sonderregeln und das Aufsatzlimit sind noch nicht verifiziert. Die Auswahl wird nach Quellenprüfung ergänzt.",
      ),
    );
  if (r?.sourceUrl)
    content.append(
      external("Offizielle Slot-Quelle ↗", r.sourceUrl, "source-proof"),
    );
  renderBuildWorkspace(weapon, content);
}
function openAttachmentEditor(weapon, slot) {
  $("#attachment-title").textContent = SLOT_NAMES[slot] || slot;
  const box = $("#attachment-content");
  box.replaceChildren();
  box.append(node("div", weapon.name.toUpperCase(), "eyebrow"));
  const current = draft(weapon).find((a) => a.slot === slot);
  if (current)
    box.append(
      button(
        "Aufsatz entfernen",
        () => {
          drafts.set(
            weapon.id,
            setAttachment(
              weapon,
              draft(weapon),
              slot,
              null,
              state.attachments,
              rules(weapon),
              state.patchRevision,
            ),
          );
          $("#attachment-dialog").close();
          render();
        },
        "button subtle",
        "trash",
      ),
    );
  const compatible = state.attachments.filter(
    (a) => a.slot === slot && a.weaponIds.includes(weapon.id),
  );
  if (!compatible.length)
    box.append(
      empty(
        "Noch keine geprüften Aufsätze",
        "Hier erscheinen ausschließlich bestätigte, mit dieser Waffe kompatible Aufsätze. Es werden keine Aufsatznamen oder Vorteile erfunden.",
      ),
    );
  for (const a of compatible) {
    const b = node("button", null, "attachment-choice");
    b.append(
      node("h3", a.name),
      node("p", `${SLOT_NAMES[a.slot] || a.slot} · Kompatibilität laut Quelle`),
      node("p", "Vorteile, Nachteile und Modifikatoren: nicht verifiziert."),
    );
    b.addEventListener("click", () => {
      try {
        drafts.set(
          weapon.id,
          setAttachment(
            weapon,
            draft(weapon),
            slot,
            a.id,
            state.attachments,
            rules(weapon),
            state.patchRevision,
          ),
        );
        $("#attachment-dialog").close();
        render();
      } catch (e) {
        toast(e.message);
      }
    });
    box.append(b);
  }
  if (!Number.isInteger(rules(weapon)?.maxAttachments))
    box.append(
      notice(
        "Neue Aufsätze können erst hinzugefügt werden, wenn das tatsächliche Aufsatzlimit belegt ist. Entfernen bleibt möglich.",
      ),
    );
  $("#attachment-dialog").showModal();
}
function buildFromDraft(weapon, name = "Mein Loadout") {
  return {
    id: crypto.randomUUID(),
    weaponId: weapon.id,
    name,
    attachments: structuredClone(draft(weapon)),
    patchRevision: state.patchRevision,
    savedAt: new Date().toISOString(),
  };
}
function renderBuildWorkspace(weapon, content) {
  const workspace = node("section", null, "build-workspace");
  const h = node("div", null, "subheading");
  h.append(
    node("h3", "Eigene Builds"),
    node("p", "LOKAL · KEINE CLOUD-SYNCHRONISIERUNG"),
  );
  workspace.append(h);
  if (!storageStatus.builds)
    workspace.append(
      notice(
        "Der Buildspeicher ist nicht verfügbar oder beschädigt. Vorhandene Einträge werden nicht überschrieben.",
        true,
      ),
    );
  const current = customBuilds.builds.find(
    (b) => b.id === editingIds.get(weapon.id),
  );
  const form = node("form", null, "build-form");
  const input = node("input", null, "text-input");
  input.type = "text";
  input.name = "buildName";
  input.placeholder = "BUILD BENENNEN …";
  input.maxLength = 80;
  input.required = true;
  input.setAttribute("aria-label", "Buildname");
  input.value = current?.name || "";
  input.value = draftNames.get(weapon.id) ?? current?.name ?? "";
  input.addEventListener("input", () => draftNames.set(weapon.id, input.value));
  const save = node(
    "button",
    current ? "Änderungen speichern" : "Build speichern",
    "button primary",
  );
  save.type = "submit";
  save.disabled = !storageStatus.builds;
  form.append(input, save);
  if (current) {
    const copy = button(
      "Als neuen Build",
      () => {
        editingIds.delete(weapon.id);
        render();
      },
      "button subtle",
    );
    copy.type = "button";
    form.append(copy);
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const issues = buildIssues(
        weapon,
        draft(weapon),
        state.attachments,
        rules(weapon),
        state.patchRevision,
      );
      if (issues.length) {
        toast("Build zuerst prüfen: " + issues.join(" "));
        return;
      }
      const b = buildFromDraft(weapon, input.value.trim());
      if (current) b.id = current.id;
      customBuilds = saveBuild(localStorage, customBuilds, b);
      editingIds.set(weapon.id, b.id);
      toast("Build lokal gespeichert.");
      render();
    } catch (err) {
      toast(err.message);
    }
  });
  workspace.append(form);
  const tools = node("div", null, "build-tools");
  tools.append(
    button(
      "Build importieren",
      () => $("#import-build").click(),
      "text-button",
    ),
    button(
      "Konfiguration exportieren",
      () =>
        download(`${weapon.id}-build.json`, {
          schemaVersion: 1,
          build: buildFromDraft(weapon, input.value.trim() || "Mein Loadout"),
        }),
      "text-button",
    ),
    button(
      "Buildlink kopieren",
      () =>
        copyBuildLink(
          buildFromDraft(weapon, input.value.trim() || "Mein Loadout"),
        ),
      "text-button",
    ),
    button("Builds vergleichen", () => openComparison(weapon), "text-button"),
  );
  workspace.append(tools);
  const list = node("div", null, "saved-builds");
  for (const build of customBuilds.builds.filter(
    (b) => b.weaponId === weapon.id,
  )) {
    const item = node("article", null, "saved-build");
    item.append(
      node("h4", build.name),
      node(
        "p",
        `${build.attachments.length} AUFSÄTZE · GESPEICHERT ${date(build.savedAt)}`,
      ),
    );
    const issues = buildIssues(
      weapon,
      build.attachments,
      state.attachments,
      rules(weapon),
      state.patchRevision,
      build.patchRevision,
    );
    if (issues.length) item.append(node("p", issues.join(" "), "orange"));
    const actions = node("div", null, "saved-build-actions");
    actions.append(
      button(
        "Laden / bearbeiten",
        () => {
          drafts.set(weapon.id, structuredClone(build.attachments));
          editingIds.set(weapon.id, build.id);
          draftNames.set(weapon.id, build.name);
          weaponLink(weapon, "attachments");
          toast("Build geladen. Vorhandene Camo-Zähler bleiben unverändert.");
        },
        "button subtle",
      ),
      button(
        "Export",
        () =>
          download(`${weapon.id}-${build.id}.json`, {
            schemaVersion: 1,
            build,
          }),
        "button subtle",
      ),
      button("Link", () => copyBuildLink(build), "button subtle"),
      button(
        "Löschen",
        () => {
          if (!confirm(`Eigenen Build „${build.name}“ löschen?`)) return;
          try {
            customBuilds = deleteBuild(localStorage, customBuilds, build.id);
            if (editingIds.get(weapon.id) === build.id)
              editingIds.delete(weapon.id);
            render();
            toast("Build gelöscht.");
          } catch {
            toast("Build konnte nicht gelöscht werden.");
          }
        },
        "button danger",
      ),
    );
    item.append(actions);
    list.append(item);
  }
  workspace.append(list);
  content.append(workspace);
}
async function copyBuildLink(build) {
  const url = new URL(location.href);
  url.hash = `/shared/${shareBuild(build)}`;
  try {
    await navigator.clipboard.writeText(url.href);
    toast("Buildlink kopiert. Der Link enthält keine Camo-Fortschritte.");
  } catch {
    openTextDialog("BUILD TEILEN", url.href);
  }
}
function openTextDialog(title, text) {
  $("#build-dialog-title").textContent = title;
  const box = $("#build-dialog-content");
  box.replaceChildren(node("p", "Zum Kopieren auswählen:"));
  const area = node("textarea", text, "text-input");
  area.rows = 5;
  area.style.width = "100%";
  area.readOnly = true;
  area.setAttribute("aria-label", title);
  box.append(area);
  $("#build-dialog").showModal();
  area.select();
}
function openComparison(weapon) {
  $("#build-dialog-title").textContent = `${weapon.name} · BUILDS VERGLEICHEN`;
  const box = $("#build-dialog-content");
  box.replaceChildren();
  const builds = [
    { ...buildFromDraft(weapon, "Aktueller Entwurf") },
    ...customBuilds.builds.filter((b) => b.weaponId === weapon.id),
  ];
  if (builds.length < 2) {
    box.append(
      empty(
        "Zweiter Build benötigt",
        "Speichere mindestens einen eigenen Build, um ihn mit dem aktuellen Entwurf zu vergleichen.",
      ),
    );
    $("#build-dialog").showModal();
    return;
  }
  const selectors = node("div", null, "comparison-selectors");
  const choices = [node("select"), node("select")];
  choices.forEach((s, i) => {
    s.setAttribute("aria-label", `Vergleichsbuild ${i + 1}`);
    builds.forEach((b, j) => {
      const o = node("option", b.name);
      o.value = j;
      s.append(o);
    });
    s.value = i;
    selectors.append(s);
  });
  const target = node("div");
  box.append(selectors, target);
  function compare() {
    target.replaceChildren();
    const left = builds[Number(choices[0].value)],
      right = builds[Number(choices[1].value)];
    const table = node("table", null, "comparison-table"),
      head = node("tr");
    head.append(
      node("th", "SLOT"),
      node("th", left.name),
      node("th", right.name),
    );
    table.append(head);
    const slots = [
      ...new Set(
        [...left.attachments, ...right.attachments].map((a) => a.slot),
      ),
    ];
    if (!slots.length) {
      const row = node("tr");
      row.append(
        node("td", "Basiswaffe"),
        node("td", "Ohne Aufsätze"),
        node("td", "Ohne Aufsätze"),
      );
      table.append(row);
    }
    for (const slot of slots) {
      const row = node("tr");
      row.append(node("td", SLOT_NAMES[slot] || slot));
      for (const build of [left, right]) {
        const ref = build.attachments.find((a) => a.slot === slot);
        row.append(
          node(
            "td",
            ref
              ? state.attachments.find((a) => a.id === ref.attachmentId)
                  ?.name || `${ref.attachmentId} · unbekannt`
              : "—",
          ),
        );
      }
      table.append(row);
    }
    target.append(table);
    const a = verifiedStats(
        weapon.id,
        left.attachments,
        presentation,
        state.patchRevision,
      ),
      b = verifiedStats(
        weapon.id,
        right.attachments,
        presentation,
        state.patchRevision,
      );
    if (!a || !b)
      target.append(
        notice(
          "Statistikvergleich nicht verifiziert. Es werden keine Leistungsunterschiede geschätzt.",
        ),
      );
    else
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        target.append(
          node(
            "p",
            `${key}: ${a[key]?.value ?? "—"} ${a[key]?.unit ?? ""} → ${b[key]?.value ?? "—"} ${b[key]?.unit ?? ""}`,
          ),
        );
  }
  choices.forEach((s) => s.addEventListener("change", compare));
  compare();
  $("#build-dialog").showModal();
}
function renderRecommendedBuilds(weapon, content, kind) {
  const builds = weapon.builds.filter((b) => b.kind === kind);
  if (!builds.length) {
    const box = node("div", null, "empty-build");
    const text = node("div");
    text.append(
      node(
        "h3",
        kind === "meta"
          ? "Noch kein verifizierter Meta-Build"
          : "Noch kein verifizierter Camo-Build",
      ),
      node(
        "p",
        kind === "meta"
          ? "Für diesen Patch liegen noch keine belastbaren Aufsatzempfehlungen vor. Neue Quellenstände werden täglich geprüft und als Pull Request zur Freigabe vorgeschlagen."
          : "Es werden nur Builds für tatsächlich bestätigte Herausforderungen angezeigt. Eine allgemeine Headshot- oder Longshot-Empfehlung wird nicht als verifizierter Build ausgegeben.",
      ),
      button(
        "Eigene Konfiguration öffnen",
        () => weaponLink(weapon, "attachments"),
        "button subtle",
        "build",
      ),
    );
    box.append(icon("build"), text);
    content.append(box);
    return;
  }
  const list = node("div", null, "build-list");
  for (const b of builds) {
    const item = node("article", null, "verified-build");
    item.append(
      node(
        "div",
        `${b.mode.toUpperCase()} / ${b.patchRevision === state.patchRevision ? "AKTUELL GEPRÜFT" : "ÄLTERER PATCH"}`,
        "eyebrow",
      ),
      node("h3", b.id.replace(/-/g, " ")),
      node("p", b.notes),
    );
    if (b.patchRevision !== state.patchRevision)
      item.append(
        notice(
          "Dieser Build muss für den aktuellen Patch erneut verifiziert werden.",
          true,
        ),
      );
    const ul = node("ul");
    b.attachments.forEach((ref) =>
      ul.append(
        node(
          "li",
          `${SLOT_NAMES[ref.slot] || ref.slot}: ${state.attachments.find((a) => a.id === ref.attachmentId)?.name || ref.attachmentId}`,
        ),
      ),
    );
    item.append(
      ul,
      button(
        "Im Gunsmith laden",
        () => {
          drafts.set(weapon.id, structuredClone(b.attachments));
          editingIds.delete(weapon.id);
          weaponLink(weapon, "attachments");
        },
        "button primary",
      ),
      button(
        "Build kopieren",
        async () => {
          const text = [
            weapon.name,
            b.mode,
            ...b.attachments.map(
              (ref) =>
                `${ref.slot}: ${state.attachments.find((a) => a.id === ref.attachmentId)?.name || ref.attachmentId}`,
            ),
          ].join("\n");
          try {
            await navigator.clipboard.writeText(text);
            toast("Build kopiert.");
          } catch {
            openTextDialog("BUILD KOPIEREN", text);
          }
        },
        "button subtle",
      ),
    );
    b.sourceUrls.forEach((url) =>
      item.append(external("Build-Quelle ↗", url, "source-proof")),
    );
    list.append(item);
  }
  content.append(list);
}

function progressTrack(weapon, camo) {
  const track = node("div", null, "progress-track"),
    fill = node("i");
  track.dataset.trackFor = camoKey(weapon.id, camo.id);
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", `${camo.name} Fortschritt`);
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", String(camo.target));
  track.setAttribute(
    "aria-valuenow",
    String(
      Math.min(camo.target, progress.entries[camoKey(weapon.id, camo.id)] || 0),
    ),
  );
  fill.style.width = `${progressPercent(progress.entries[camoKey(weapon.id, camo.id)] || 0, camo.target)}%`;
  track.append(fill);
  return track;
}
function changeProgress(weapon, camo, value, input = null) {
  const key = camoKey(weapon.id, camo.id),
    previous = progress.entries[key] || 0;
  if (
    !storageStatus.progress ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > camo.target
  ) {
    if (input) input.value = previous;
    return;
  }
  const next = structuredClone(progress);
  next.entries[key] = value;
  try {
    saveProgress(localStorage, next);
    progress = next;
    refreshProgress(weapon);
    if (value === camo.target && previous < camo.target)
      toast(`${camo.name} abgeschlossen.`);
  } catch {
    if (input) input.value = previous;
    toast(
      "Fortschritt konnte nicht gespeichert werden. Vorherige Werte bleiben erhalten.",
    );
  }
}
function progressInput(weapon, camo) {
  const input = node("input");
  input.type = "number";
  input.min = "0";
  input.max = String(camo.target);
  input.step = "1";
  input.value = progress.entries[camoKey(weapon.id, camo.id)] || 0;
  input.disabled = !storageStatus.progress;
  input.setAttribute("aria-label", `${camo.name}: Fortschritt`);
  input.dataset.inputFor = camoKey(weapon.id, camo.id);
  input.addEventListener("input", () => {
    if (input.value !== "")
      changeProgress(weapon, camo, Number(input.value), input);
  });
  input.addEventListener("change", () => {
    if (input.value === "") changeProgress(weapon, camo, 0, input);
  });
  return input;
}
function refreshProgress(weapon) {
  for (const c of weapon.camos) {
    const key = camoKey(weapon.id, c.id),
      value = progress.entries[key] || 0,
      complete = value >= c.target,
      ready = prerequisitesMet(weapon, c, progress);
    document.querySelectorAll("[data-track-for]").forEach((el) => {
      if (el.dataset.trackFor === key) {
        el.firstElementChild.style.width = `${progressPercent(value, c.target)}%`;
        el.setAttribute("aria-valuenow", String(Math.min(value, c.target)));
      }
    });
    document.querySelectorAll("[data-ratio-for]").forEach((el) => {
      if (el.dataset.ratioFor === key)
        el.textContent = `${value} / ${c.target}`;
    });
    document.querySelectorAll("[data-camo-id]").forEach((el) => {
      if (el.dataset.camoId === c.id) {
        el.classList.toggle("complete", complete);
        el.classList.toggle("locked", !ready && !complete);
        if (el.classList.contains("camo-tile")) {
          el.setAttribute(
            "aria-label",
            `${c.name}${complete ? " · abgeschlossen" : !ready ? " · Voraussetzung offen" : ""}`,
          );
          el.querySelector(".camo-lock")?.remove();
          if (complete || !ready) {
            const mark = node("span", null, "camo-lock");
            mark.append(icon(complete ? "check" : "lock"));
            el.append(mark);
          }
        }
      }
    });
    document.querySelectorAll("[data-mark-for]").forEach((el) => {
      if (el.dataset.markFor === key) {
        el.textContent = complete ? "✓" : "";
        el.setAttribute(
          "aria-label",
          complete ? "Abgeschlossen" : "Noch offen",
        );
      }
    });
    document.querySelectorAll("[data-lock-for]").forEach((el) => {
      if (el.dataset.lockFor === key)
        el.textContent = ready
          ? "VORAUSSETZUNGEN IM TRACKER ERFÜLLT"
          : "VORAUSSETZUNG IM TRACKER NOCH OFFEN";
    });
    document.querySelectorAll("[data-complete-for]").forEach((el) => {
      if (el.dataset.completeFor === key) {
        el.disabled = complete || !ready || !storageStatus.progress;
        el.lastElementChild.textContent = complete
          ? "Abgeschlossen"
          : "Als abgeschlossen markieren";
      }
    });
  }
  document.querySelectorAll("[data-progress-panel]").forEach((el) => {
    if (el.dataset.progressPanel === weapon.id)
      el.replaceWith(progressPanel(weapon));
  });
}
function progressPanel(weapon) {
  const p = weaponProgress(weapon, progress),
    panel = node("section", null, "progress-panel");
  panel.dataset.progressPanel = weapon.id;
  panel.append(node("h3", "Mein Fortschritt"));
  const ring = node("div", null, "progress-ring");
  ring.style.setProperty("--angle", `${(p.percent || 0) * 3.6}deg`);
  const value = node(
    "div",
    p.known ? `${Math.round(p.percent)}%` : "—",
    "ring-value",
  );
  value.append(
    node(
      "small",
      p.known ? `${p.completed}/${p.total} bekannte Ziele` : "Ziele unbekannt",
    ),
  );
  ring.append(value);
  panel.append(ring);
  const legend = node("div", null, "progress-legend");
  for (const [label, count, cls] of [
    ["Abgeschlossen", p.completed, ""],
    ["In Arbeit", p.started, "in-progress"],
    ["Nicht begonnen", p.total - p.completed - p.started, "not-started"],
  ]) {
    const row = node("div");
    row.append(
      node("i", null, cls),
      node("span", label),
      node("b", p.known ? String(count) : "—"),
    );
    legend.append(row);
  }
  panel.append(
    legend,
    node(
      "p",
      "Bezieht sich ausschließlich auf die bestätigten Ziele, nicht auf alle Camos des Spiels.",
      "camo-footnote",
    ),
  );
  return panel;
}
function sidebarActions(weapon) {
  const box = node("div", null, "sidebar-actions");
  box.append(
    favoriteButton(weapon),
    button(
      "Fortschritt exportieren",
      () => download("mw4-camo-fortschritt.json", progress),
      "button subtle",
      "copy",
    ),
    button(
      "Fortschritt importieren",
      () => $("#import-progress").click(),
      "button subtle",
      "arrow",
    ),
    button(
      "Waffenfortschritt zurücksetzen",
      () => resetProgress(weapon),
      "button danger",
      "trash",
    ),
  );
  return box;
}
function unknownCamos(weapon, content) {
  content.append(
    empty(
      "Camo-Anforderungen noch nicht verifiziert",
      `Für ${weapon.name} enthält der aktuelle Datensatz noch keine bestätigten Camo-Ziele. Bestehende lokale Einträge werden trotzdem aufbewahrt und beim Export mit ausgegeben.`,
      button(
        "Verfügbare Grind-Ziele ansehen",
        () => go("planner"),
        "button subtle",
        "arrow",
      ),
    ),
  );
}
function renderCamos(weapon, content) {
  if (!weapon.camos.length) {
    unknownCamos(weapon, content);
    return;
  }
  const workspace = node("div", null, "camo-workspace"),
    bank = node("div", null, "camo-bank"),
    categories = node("div", null, "camo-categories");
  for (const [id, label] of Object.entries(CATEGORIES)) {
    const count =
      id === "all"
        ? weapon.camos.length
        : weapon.camos.filter((c) => camoCategory(c) === id).length;
    const b = button(
      label,
      () => {
        camoFilter = id;
        render();
      },
      `camo-category${camoFilter === id ? " active" : ""}`,
    );
    b.disabled = count === 0;
    b.title = count
      ? `${count} bestätigte Ziele`
      : "Noch keine bestätigten Ziele dieser Kategorie";
    categories.append(b);
  }
  bank.append(categories);
  const camos = weapon.camos.filter(
    (c) => camoFilter === "all" || camoCategory(c) === camoFilter,
  );
  if (!camos.length) {
    camoFilter = "all";
    renderCamos(weapon, content);
    return;
  }
  const selected = camos.find((c) => c.id === selectedCamoId) || camos[0];
  selectedCamoId = selected.id;
  const grid = node("div", null, "camo-grid");
  grid.setAttribute("aria-label", "Camo-Auswahl");
  camos.forEach((c, i) => {
    const count = progress.entries[camoKey(weapon.id, c.id)] || 0,
      complete = count >= c.target,
      locked = !prerequisitesMet(weapon, c, progress) && !complete;
    const b = node(
      "button",
      null,
      `camo-tile${selected.id === c.id ? " active" : ""}${complete ? " complete" : ""}${locked ? " locked" : ""}`,
    );
    b.dataset.camoId = c.id;
    b.setAttribute(
      "aria-label",
      `${c.name}${complete ? " · abgeschlossen" : locked ? " · Voraussetzung offen" : ""}`,
    );
    b.setAttribute("aria-pressed", String(selected.id === c.id));
    const image = presentation.camoAssets?.[`${weapon.id}:${c.id}`];
    if (image?.image && image.license && image.sourceUrl) {
      const img = node("img");
      img.src = image.image;
      img.alt = `${c.name} · ${image.license}`;
      b.append(img);
    } else {
      const placeholder = node("div", null, "camo-placeholder");
      placeholder.append(
        node("span", String(i + 1).padStart(2, "0"), "camo-number"),
        node("small", "ORIGINALVORSCHAU FEHLT"),
      );
      b.append(placeholder);
    }
    if (locked || complete) {
      const mark = node("span", null, "camo-lock");
      mark.append(icon(complete ? "check" : "lock"));
      b.append(mark);
    }
    b.addEventListener("click", () => {
      selectedCamoId = c.id;
      render();
    });
    grid.append(b);
  });
  bank.append(
    grid,
    node(
      "p",
      "Die nummerierten Felder sind neutrale Platzhalter. Sie stellen keine erfundenen Spieltarnungen dar.",
      "camo-footnote",
    ),
  );
  const selection = node("aside", null, "camo-selection");
  selection.append(
    node(
      "div",
      `${CATEGORIES[camoCategory(selected)]} / ${selected.mode === "shared" ? "ALLE MODI" : selected.mode}`,
      "eyebrow",
    ),
    node("h3", selected.name),
    node("p", selected.requirement),
    progressTrack(weapon, selected),
  );
  const ratio = node(
    "b",
    `${progress.entries[camoKey(weapon.id, selected.id)] || 0} / ${selected.target}`,
  );
  ratio.dataset.ratioFor = camoKey(weapon.id, selected.id);
  const label = node("div", null, "progress-label");
  label.append(node("span", "DEIN FORTSCHRITT"), ratio);
  selection.append(label);
  const editor = node("div", null, "camo-editor");
  editor.append(node("label", "Fortschritt bearbeiten"));
  const control = node("div", null, "number-control");
  control.append(progressInput(weapon, selected), node("span", selected.unit));
  editor.append(control);
  selection.append(editor);
  const completed =
    (progress.entries[camoKey(weapon.id, selected.id)] || 0) >= selected.target;
  const complete = button(
    completed ? "Abgeschlossen" : "Als abgeschlossen markieren",
    () => changeProgress(weapon, selected, selected.target),
    "button primary",
    "check",
  );
  complete.dataset.completeFor = camoKey(weapon.id, selected.id);
  complete.disabled =
    !prerequisitesMet(weapon, selected, progress) ||
    completed ||
    !storageStatus.progress;
  selection.append(
    complete,
    button(
      "Passenden Camo-Build öffnen",
      () => weaponLink(weapon, "camo-build"),
      "button subtle",
      "build",
    ),
  );
  if (selected.dependsOn.length) {
    const lock = node(
      "p",
      prerequisitesMet(weapon, selected, progress)
        ? "VORAUSSETZUNGEN IM TRACKER ERFÜLLT"
        : "VORAUSSETZUNG IM TRACKER NOCH OFFEN",
      "camo-footnote",
    );
    lock.dataset.lockFor = camoKey(weapon.id, selected.id);
    selection.append(lock);
  }
  selected.sourceUrls.forEach((url) =>
    selection.append(
      external("Anforderungen: offizielle Quelle ↗", url, "source-proof"),
    ),
  );
  workspace.append(bank, selection);
  content.append(workspace);
}
function renderChallenges(weapon, content) {
  if (!weapon.camos.length) {
    unknownCamos(weapon, content);
    return;
  }
  const layout = node("div", null, "challenge-layout"),
    list = node("div", null, "challenge-list");
  weapon.camos.forEach((c) => {
    const key = camoKey(weapon.id, c.id),
      value = progress.entries[key] || 0,
      complete = value >= c.target;
    const row = node(
      "div",
      null,
      `challenge-row${complete ? " complete" : ""}`,
    );
    row.dataset.camoId = c.id;
    const badge = node("div", null, "challenge-icon");
    badge.append(icon("camo"));
    const text = node("div");
    text.append(
      node("h4", c.name),
      node("p", c.requirement),
      progressTrack(weapon, c),
    );
    const controls = node("div", null, "challenge-controls");
    const mark = node("span", complete ? "✓" : "", "complete-mark");
    mark.dataset.markFor = key;
    mark.setAttribute("aria-label", complete ? "Abgeschlossen" : "Noch offen");
    controls.append(
      progressInput(weapon, c),
      node("label", `/ ${c.target}`),
      mark,
      button(
        "Camo-Build ↗",
        () => weaponLink(weapon, "camo-build"),
        "text-button",
      ),
    );
    row.append(badge, text, controls);
    list.append(row);
  });
  const sidebar = node("aside", null, "progress-sidebar");
  sidebar.append(progressPanel(weapon), sidebarActions(weapon));
  layout.append(list, sidebar);
  content.append(layout);
  content.append(
    node(
      "p",
      "Manuelle Zähler bleiben auch bei korrigierten Anforderungen erhalten. Voraussetzungen steuern die Sperrmarkierung in der Tarnungsauswahl.",
      "camo-footnote",
    ),
  );
}
function renderTracker(weapon, content) {
  const layout = node("div", null, "tracking-layout");
  const left = node("div");
  left.append(progressPanel(weapon), sidebarActions(weapon));
  const right = node("div", null, "compact-panel");
  right.append(
    node("div", "DEIN SPEICHER. DEINE KONTROLLE.", "eyebrow"),
    node("h3", "Camo-Tracking"),
    node(
      "p",
      "Deine Zähler bleiben unter dem bisherigen Browser-Speicherschlüssel erhalten. Automatische Meta-Updates können deinen persönlichen Fortschritt nicht verändern.",
    ),
  );
  if (weapon.camos.length) {
    right.append(
      node(
        "p",
        `${weapon.camos.length} bekannte Ziele dieser Waffe. Weitere Herausforderungen und ein vollständiger Mastery-Gesamtfortschritt sind noch nicht verifiziert.`,
      ),
      button(
        "Herausforderungen bearbeiten",
        () => weaponLink(weapon, "challenges"),
        "button primary",
        "camo",
      ),
    );
  } else
    right.append(
      node(
        "p",
        "Für diese Waffe fehlen noch bestätigte Anforderungen. Bestehende gespeicherte Werte bleiben im Export enthalten.",
      ),
    );
  right.append(
    button(
      "Grind Planner öffnen",
      () => go("planner"),
      "button subtle",
      "arrow",
    ),
  );
  layout.append(left, right);
  content.append(layout);
}
function resetProgress(weapon = null) {
  if (!storageStatus.progress)
    return toast(
      "Fortschrittsspeicher nicht verfügbar. Es werden keine Daten geändert.",
    );
  if (
    !confirm(
      weapon
        ? `Alle persönlichen Camo-Zähler für ${weapon.name} zurücksetzen?`
        : "Den gesamten persönlichen Camo-Fortschritt zurücksetzen? Das kann nicht rückgängig gemacht werden.",
    )
  )
    return;
  const next = {
    schemaVersion: 1,
    entries: weapon
      ? Object.fromEntries(
          Object.entries(progress.entries).filter(
            ([key]) => !key.startsWith(`${weapon.id}:`),
          ),
        )
      : {},
  };
  try {
    saveProgress(localStorage, next);
    progress = next;
    render();
    toast("Fortschritt zurückgesetzt.");
  } catch {
    toast("Zurücksetzen fehlgeschlagen. Vorherige Werte bleiben erhalten.");
  }
}

function renderTierlist() {
  screen.append(
    heading(
      "MULTIPLAYER / META-ÜBERSICHT",
      "WAFFEN-TIERLIST",
      "Nur für den aktuellen Patch geprüfte Einstufungen werden in S, A, B oder C einsortiert.",
    ),
  );
  const list = node("div", null, "tier-list");
  for (const tier of ["S", "A", "B", "C", null]) {
    const weapons = state.weapons.filter(
      (w) => currentTier(w, state.patchRevision) === tier,
    );
    const row = node("section", null, "tier-row");
    row.append(node("h2", tier || "—", `tier-label${tier ? "" : " unknown"}`));
    const items = node("div", null, "tier-items");
    if (!weapons.length)
      items.append(
        node(
          "p",
          "Noch keine belastbar verifizierten Einstufungen für diesen Rang.",
        ),
      );
    for (const w of weapons) {
      const b = button(
        `${favorited(w) ? "★ " : ""}${w.name}`,
        () => weaponLink(w, "meta"),
        "text-button",
      );
      b.title = tier ? `Tier ${tier}` : "Meta-Tier nicht verifiziert";
      items.append(b);
    }
    row.append(items);
    list.append(row);
  }
  screen.append(
    list,
    notice(
      "„—“ bedeutet unbekannt oder für einen älteren Patch geprüft. Eine fehlende Einstufung ist kein schlechtes Ranking.",
    ),
  );
}
function renderPlanner() {
  screen.append(
    heading(
      "MULTIPLAYER / NÄCHSTER EINSATZ",
      "GRIND PLANNER",
      "Fortgeschrittene, noch offene und bestätigte Ziele zuerst. Favoriten entscheiden bei gleichem Fortschritt.",
    ),
  );
  const layout = node("div", null, "planner-layout"),
    list = node("div");
  const plan = planGrind(state.weapons, progress, preferences.favorites);
  if (!plan.length)
    list.append(
      empty(
        "Alle bekannten Ziele erledigt",
        "Das ist kein Nachweis für vollständige Mastery: Nicht verifizierte Herausforderungen werden bei dieser Planung nicht mitgezählt.",
      ),
    );
  plan.forEach((item, i) => {
    const card = node("article", null, "planner-item"),
      copy = node("div");
    copy.append(
      node(
        "div",
        `${CLASSES[item.weapon.weaponClass]} / ${item.favorite ? "FAVORIT" : "BESTÄTIGTE ZIELE"}`,
        "eyebrow",
      ),
      node("h3", item.weapon.name),
      node("p", `Nächstes Ziel: ${item.next.name} — ${item.next.requirement}`),
      node(
        "div",
        `${item.stats.completed}/${item.stats.total} bekannte Ziele abgeschlossen · ${Math.round(item.stats.percent)} %`,
        "planner-stat",
      ),
    );
    card.append(
      node("div", String(i + 1).padStart(2, "0"), "planner-rank"),
      copy,
      button(
        "Grind fortsetzen",
        () => {
          selectedCamoId = item.next.id;
          weaponLink(item.weapon, "camos");
        },
        "button primary",
        "arrow",
      ),
    );
    list.append(card);
  });
  const notes = node("aside", null, "planner-notes");
  notes.append(
    node("h3", "Planungsgrundlage"),
    node(
      "p",
      `${state.weapons.filter((w) => w.camos.length).length} von ${state.weapons.length} Waffen besitzen derzeit bestätigte Camo-Definitionen. Der Planner verwendet deine vorhandenen lokalen Zähler und die bekannten Voraussetzungen.`,
    ),
    node("h3", "Parallel erledigen"),
    node(
      "p",
      "Bei Waffenlevel-Zielen hilft derselbe Waffen-XP-Fortschritt. Die einzelnen gespeicherten Zähler bleiben manuell; der Planner verändert sie nicht automatisch.",
    ),
    node("h3", "Maps & Spielmodi"),
    node(
      "p",
      "Für die erfassten Ziele ist keine verifizierte Map- oder Modusempfehlung hinterlegt. Es werden keine Grind-Strategien erfunden.",
    ),
    button("Datenqualität prüfen", () => go("intel"), "button subtle"),
  );
  layout.append(list, notes);
  screen.append(layout);
}
function renderIntel(tab = "status") {
  screen.append(
    heading(
      "MULTIPLAYER / INTEL",
      "DATEN & FORTSCHRITT",
      "Patchstand, Quellen und persönlicher Speicher. Alles im selben Waffenmenü.",
    ),
  );
  const nav = node("nav", null, "intel-nav");
  nav.setAttribute("aria-label", "Intel-Untermenüs");
  for (const [id, label] of [
    ["status", "Patch & Quellen"],
    ["changelog", "Änderungsverlauf"],
    ["storage", "Mein Speicher"],
    ["credits", "Bildnachweise"],
  ]) {
    const a = node("a", label, tab === id ? "active" : "");
    a.href = `#/intel/${id}`;
    nav.append(a);
  }
  screen.append(nav);
  if (tab === "changelog") {
    renderChangelog();
    return;
  }
  if (tab === "credits") {
    renderCredits();
    return;
  }
  if (tab === "storage") {
    renderStorage();
    return;
  }
  const layout = node("div", null, "intel-layout"),
    left = node("div"),
    right = node("div");
  const patch = node("article", null, "intel-panel");
  patch.append(
    node("div", "BERÜCKSICHTIGTER PATCH", "eyebrow"),
    node("h3", state.patchVersion || "Patch-Version unbekannt"),
    node(
      "p",
      `Letztes erfolgreich übernommenes Datenupdate: ${date(state.lastSuccessfulUpdate)} · ${date(state.lastSuccessfulUpdate, { hour: "2-digit", minute: "2-digit" })} Uhr.`,
    ),
    node(
      "p",
      `Letzte tatsächliche Waffenänderung: ${date(state.lastChangedAt)}. ${state.lastChangedWeaponIds.length} Waffen wurden dabei geändert.`,
    ),
    node("div", `QUELLREVISION: ${state.patchRevision || "UNBEKANNT"}`, "mono"),
    node(
      "p",
      "Die Quellrevision ist ein Fingerabdruck der offiziellen Patchnotes und keine erfundene Spiel-Buildnummer.",
    ),
  );
  left.append(patch);
  const updated = node("article", null, "intel-panel");
  updated.append(node("h3", "Zuletzt geänderte Waffen"));
  const names = node("div", null, "tier-items");
  state.lastChangedWeaponIds.forEach((id) => {
    const w = state.weapons.find((w) => w.id === id);
    if (w) names.append(button(w.name, () => weaponLink(w), "text-button"));
  });
  updated.append(names);
  left.append(updated);
  const quality = node("article", null, "intel-panel");
  quality.append(
    node("div", "GITHUB ACTIONS / TÄGLICHE PRÜFUNG", "eyebrow"),
    node("h3", "Automatisch gefunden. Von dir freigegeben."),
    node(
      "p",
      "Der Cloud-Workflow prüft offizielle Quellen täglich um 05:17 UTC (06:17 Uhr im Winter, 07:17 Uhr im Sommer). Veränderte Quellenstände erscheinen als Review-PR. Erst dein Merge veröffentlicht Änderungen.",
    ),
  );
  const ul = node("ul");
  [
    "Keine erfundenen Tiers, Aufsätze oder Waffenwerte.",
    "Keine Datenänderung bei unveränderten Quellen.",
    "Vorheriger Datenstand bei fehlgeschlagener Prüfung.",
    "Persönlicher Camo-Fortschritt bleibt im Browser.",
  ].forEach((text) => ul.append(node("li", text)));
  quality.append(
    ul,
    external(
      "Prüfläufe auf GitHub ↗",
      "https://github.com/schafermax809-arch/mw4-meta-tracker/actions",
      "button subtle",
    ),
    external(
      "Update-Vorschläge prüfen ↗",
      "https://github.com/schafermax809-arch/mw4-meta-tracker/pulls",
      "button subtle",
    ),
  );
  right.append(quality);
  const sources = node("article", null, "intel-panel");
  sources.append(node("h3", "Offizielle Quellen"));
  const links = node("div", null, "source-list");
  for (const [url, doc] of Object.entries(state.documents)) {
    if (doc.kind !== "patch" && !/weapons|progression/.test(url)) continue;
    const a = external(doc.title + " ↗", url, "source-item");
    a.append(
      node(
        "small",
        `${doc.publishedAt || "Datum unbekannt"} · SHA-256 ${doc.hash.slice(0, 12)}`,
      ),
    );
    links.append(a);
  }
  sources.append(links);
  right.append(sources);
  layout.append(left, right);
  screen.append(layout);
}
function renderChangelog() {
  for (const entry of state.changelog) {
    const details = node("details", null, "change-entry"),
      summary = node("summary"),
      time = node("time", date(entry.at));
    time.dateTime = entry.at;
    summary.append(time, node("strong", entry.summary));
    const body = node("div", null, "change-content");
    body.append(node("p", entry.patchVersion || "Patch unbekannt"));
    const list = node("ul");
    for (const c of entry.weaponChanges) {
      const w = state.weapons.find((w) => w.id === c.weaponId);
      list.append(
        node(
          "li",
          `${w?.name || c.weaponId}: ${c.before === null ? "Neu im Katalog" : c.fields.join(", ")}`,
        ),
      );
    }
    body.append(list);
    entry.sourceUrls.forEach((url) =>
      body.append(
        external(
          "Quelle: " + new URL(url).pathname.split("/").pop() + " ↗",
          url,
        ),
      ),
    );
    details.append(summary, body);
    screen.append(details);
  }
  const a = node(
    "a",
    "Vollständigen Datensatz herunterladen ↓",
    "button subtle",
  );
  a.href = "./data/meta.json";
  a.download = "mw4-meta.json";
  screen.append(a);
}
function renderStorage() {
  const layout = node("div", null, "intel-layout"),
    personal = node("div", null, "intel-panel");
  personal.append(
    node("h3", "Persönlicher Camo-Fortschritt"),
    node(
      "p",
      "Import und Export verwenden dasselbe Format und denselben Speicherschlüssel wie bisher. Auch Zähler zu noch unbekannten Waffen oder Camos bleiben im Export enthalten.",
    ),
  );
  const controls = node("div", null, "tracker-actions");
  controls.append(
    button(
      "Fortschritt exportieren",
      () => download("mw4-camo-fortschritt.json", progress),
      "button primary",
      "copy",
    ),
    button(
      "Fortschritt importieren",
      () => $("#import-progress").click(),
      "button subtle",
      "arrow",
    ),
    button(
      "Alle Zähler zurücksetzen",
      () => resetProgress(),
      "button danger",
      "trash",
    ),
  );
  personal.append(controls);
  if (!storageStatus.progress)
    personal.append(
      notice(
        "Der bisherige Speicher ist nicht lesbar oder wird vom Browser blockiert. Er wird nicht überschrieben. Export sichert in diesem Fall keinen beschädigten Rohinhalt; nutze gegebenenfalls die Browser-Speicherverwaltung.",
        true,
      ),
    );
  const other = node("div", null, "intel-panel");
  other.append(
    node("h3", "Builds & Favoriten"),
    node(
      "p",
      `${preferences.favorites.length} Favoriten und ${customBuilds.builds.length} eigene Builds sind lokal gespeichert. Sie liegen getrennt von deinen Camo-Zählern. Buildlinks teilen ausschließlich die Konfiguration.`,
    ),
  );
  const actions = node("div", null, "tracker-actions");
  actions.append(
    button(
      "Eigene Builds exportieren",
      () => download("mw4-eigene-builds.json", customBuilds),
      "button subtle",
    ),
    button(
      "Build importieren",
      () => $("#import-build").click(),
      "button subtle",
    ),
  );
  other.append(
    actions,
    node(
      "p",
      "Beim Import werden Quelle, Struktur und Kompatibilität geprüft. Entfernte oder für einen alten Patch gespeicherte Aufsätze bleiben sichtbar als prüfbedürftig markiert.",
    ),
  );
  layout.append(personal, other);
  screen.append(layout);
}
function renderCredits() {
  const grid = node("div", null, "credits-list");
  for (const [id, record] of Object.entries(presentation.weapons)) {
    const a = record.asset;
    if (!a?.image) continue;
    const w = state.weapons.find((w) => w.id === id);
    const item = node("article", null, "credit-item");
    item.append(
      weaponImage(w),
      node("h3", w.name),
      node("p", a.caption),
      node("p", `Urheber: ${a.author}`),
      node("p", `${a.license} · ${a.changes}`),
      external("Originaldatei und Urhebernachweis ↗", a.sourceUrl),
      external("Lizenzbedingungen ↗", a.licenseUrl),
    );
    grid.append(item);
  }
  screen.append(
    grid,
    node(
      "p",
      "Reale Referenzfotos sind kein Beleg für das Aussehen der Spielwaffen. Die Originaldateien werden unverändert weitergegeben. Für übrige Waffen und Camos liegen noch keine freigegebenen Vorschaudateien vor. Es werden keine erfundenen Modelle oder Tarnungen als echte Spielinhalte angezeigt.",
      "credits-note",
    ),
    node(
      "p",
      "MW4 Intel ist ein unabhängiges Community-Projekt und nicht mit Activision oder Infinity Ward verbunden. Three.js steht unter der MIT-Lizenz; die Lizenzdatei wird mit ausgeliefert.",
      "credits-note",
    ),
  );
}
function render() {
  if (!state) return;
  viewer?.dispose();
  viewer = null;
  screen.replaceChildren();
  screen.classList.remove("screen-enter");
  void screen.offsetWidth;
  screen.classList.add("screen-enter");
  const r = route();
  const section =
    r.page === "weapon" || r.page === "shared" ? "arsenal" : r.page;
  document.querySelectorAll(".primary-nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.section === section);
    if (a.dataset.section === section) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  $("#favorite-count").textContent = preferences.favorites.length;
  if (!storageStatus.progress)
    screen.append(
      node(
        "div",
        "Camo-Speicher nicht verfügbar oder beschädigt. Bisherige Daten werden nicht überschrieben. Ein gültiger Import ist unter Intel & Daten möglich.",
        "permission-warning",
      ),
    );
  if (r.page === "weapon") {
    const w = state.weapons.find((w) => w.id === r.id);
    if (w) renderWeapon(w, r.tab);
    else
      screen.append(
        empty(
          "Waffe nicht gefunden",
          "Diese Waffen-ID ist im aktuellen Katalog nicht vorhanden.",
          button("Zur Waffenübersicht", () => go("arsenal"), "button primary"),
        ),
      );
  } else if (r.page === "tierlist") renderTierlist();
  else if (r.page === "planner") renderPlanner();
  else if (r.page === "intel") renderIntel(r.tab);
  else if (r.page === "shared") {
    try {
      const b = parseSharedBuild(r.shared);
      const w = state.weapons.find((w) => w.id === b.weaponId);
      if (!w) throw new Error("Waffe aus dem Buildlink ist nicht im Katalog.");
      drafts.set(w.id, b.attachments);
      editingIds.delete(w.id);
      draftNames.set(w.id, b.name);
      renderWeapon(w, "attachments");
      const note = notice(
        `Geteilter Build: ${b.name}. Noch nicht gespeichert. ${buildIssues(w, b.attachments, state.attachments, rules(w), state.patchRevision, b.patchRevision).join(" ")}`,
      );
      screen.prepend(note);
    } catch (error) {
      screen.append(
        empty(
          "Buildlink nicht lesbar",
          error.message,
          button("Zur Waffenübersicht", () => go("arsenal"), "button primary"),
        ),
      );
    }
  } else renderArsenal();
  $("#data-status").replaceChildren(
    node(
      "span",
      `DATENSTAND ${date(state.lastSuccessfulUpdate)} · PATCH ${state.patchRevision?.slice(0, 8) || "—"}`,
    ),
    node("span", "↗"),
  );
}
async function importProgressFile(file) {
  if (!file) return;
  try {
    if (file.size > 2000000) throw new Error("Datei zu groß");
    const imported = validateProgress(JSON.parse(await file.text()));
    if (
      !confirm(
        "Den gespeicherten Camo-Fortschritt durch diese Importdatei ersetzen?",
      )
    )
      return;
    saveProgress(localStorage, imported);
    progress = imported;
    storageStatus.progress = true;
    render();
    toast("Fortschritt importiert.");
  } catch {
    toast(
      "Ungültiger Import oder Speicherfehler. Bisheriger Fortschritt bleibt erhalten.",
    );
  }
}
async function importBuildFile(file) {
  if (!file) return;
  try {
    if (file.size > 2000000) throw new Error("Datei zu groß");
    if (!storageStatus.builds) throw new Error("Buildspeicher nicht verfügbar");
    const data = JSON.parse(await file.text());
    let imported;
    if (data.schemaVersion === 1 && data.build)
      imported = [validateSavedBuild(data.build)];
    else if (
      data.schemaVersion === 1 &&
      Array.isArray(data.builds) &&
      data.builds.length <= 500
    )
      imported = data.builds.map(validateSavedBuild);
    else throw new Error("Ungültiges Buildformat");
    for (const b of imported)
      if (!state.weapons.some((w) => w.id === b.weaponId))
        throw new Error(`Unbekannte Waffe: ${b.weaponId}`);
    if (
      !confirm(
        `${imported.length} eigene(n) Build(s) importieren? Gleiche Build-IDs werden ersetzt. Camo-Zähler bleiben unverändert.`,
      )
    )
      return;
    const next = structuredClone(customBuilds);
    for (const b of imported) {
      const index = next.builds.findIndex((x) => x.id === b.id);
      if (index < 0) next.builds.push(b);
      else next.builds[index] = b;
    }
    if (next.builds.length > 500) throw new Error("Zu viele Builds");
    // A single storage write makes a multi-build import all-or-nothing.
    const { BUILDS_KEY } = await import("./gunsmith.js");
    localStorage.setItem(BUILDS_KEY, JSON.stringify(next));
    customBuilds = next;
    render();
    toast(
      "Builds importiert. Alte oder inkompatible Aufsätze bleiben zur Prüfung sichtbar.",
    );
  } catch (error) {
    toast(
      `Buildimport fehlgeschlagen: ${error.message}. Bisherige Daten bleiben erhalten.`,
    );
  }
}
$("#global-back").addEventListener("click", back);
$("#footer-back").addEventListener("click", back);
$("#search-shortcut").addEventListener("click", () => {
  if (route().page !== "arsenal") go("arsenal");
  requestAnimationFrame(() => $("#weapon-search")?.focus());
});
$("#quick-favorites").addEventListener("click", () => {
  filters.favoritesOnly = true;
  selectedClass = "";
  if (route().page === "arsenal") render();
  else go("arsenal");
});
document
  .querySelectorAll("[data-close]")
  .forEach((b) =>
    b.addEventListener("click", () => $(`#${b.dataset.close}`).close()),
  );
$("#import-progress").addEventListener("change", async (e) => {
  await importProgressFile(e.target.files?.[0]);
  e.target.value = "";
});
$("#import-build").addEventListener("change", async (e) => {
  await importBuildFile(e.target.files?.[0]);
  e.target.value = "";
});
document.addEventListener("keydown", (e) => {
  const dialog = document.querySelector("dialog[open]");
  if (dialog) return;
  if (e.target.closest("input,textarea,select,[contenteditable=true]")) return;
  if (e.key === "Escape") {
    e.preventDefault();
    back();
    return;
  }
  if (e.key === "/") {
    e.preventDefault();
    if (route().page !== "arsenal") go("arsenal");
    requestAnimationFrame(() => $("#weapon-search")?.focus());
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const r = route(),
    w = state?.weapons.find(
      (w) => w.id === (r.page === "weapon" ? r.id : selectedId),
    );
  if (e.key.toLowerCase() === "f" && w) {
    e.preventDefault();
    toggleFavorite(w);
  }
  if (r.page === "weapon" && /^[1-6]$/.test(e.key)) {
    e.preventDefault();
    weaponLink(w, TABS[Number(e.key) - 1][0]);
  }
  if (r.page === "weapon" && ["q", "e"].includes(e.key.toLowerCase())) {
    const same = state.weapons.filter((x) => x.weaponClass === w.weaponClass),
      i = same.indexOf(w);
    e.preventDefault();
    weaponLink(
      same[
        (i + (e.key.toLowerCase() === "q" ? -1 : 1) + same.length) % same.length
      ],
      r.tab,
    );
  }
});
window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
  screen.focus({ preventScroll: true });
});
try {
  const response = await fetch(new URL("./data/meta.json", import.meta.url), {
    cache: "no-cache",
  });
  if (!response.ok)
    throw new Error("Der Waffendatensatz ist nicht erreichbar.");
  state = await response.json();
  if (
    state.schemaVersion !== 1 ||
    state.gameId !== "cod-mw4-2026" ||
    !Array.isArray(state.weapons) ||
    !state.weapons.length
  )
    throw new Error("Ungültiger Waffendatensatz.");
  try {
    const r = await fetch(
      new URL("./data/presentation.json", import.meta.url),
      { cache: "no-cache" },
    );
    if (r.ok) {
      const p = await r.json();
      if (p.schemaVersion === 1 && p.weapons) presentation = p;
    }
  } catch {
    toast(
      "Vorschaudaten konnten nicht geladen werden. Tracking bleibt verfügbar.",
    );
  }
  if (!state.weapons.some((w) => w.id === selectedId))
    selectedId = state.weapons[0].id;
  render();
} catch (error) {
  screen.replaceChildren(
    empty(
      "Arsenal nicht verfügbar",
      `${error.message} Deine lokalen Camo-Zähler bleiben erhalten.`,
      button("Erneut laden", () => location.reload(), "button primary"),
    ),
  );
}
