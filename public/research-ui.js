import { node, button, external, notice, download, date, toast } from './ui.js';
import { METRICS } from './engine/database.js';
import { RESEARCH_FIELDS, RESEARCH_STATUSES, MODELS, researchRows, publishedEffects, comparison, recordKey, upsertResearch, validateResearch, mergeResearch, fieldConflict } from './engine/local-research.js';
import { readScreenshot, saveScreenshot, deleteScreenshot, recognizeScreenshot, parseOCRText } from './research-media.js';

const STATUS = { missing: 'Keine Rechenwerte', partial: 'Teilweise dokumentiert', local: 'Lokal ergänzt', complete: 'Messfelder dokumentiert', conflict: 'Widerspruch / Kompatibilität', stale: 'Lokaler Patchstand veraltet' };
let filters = { weapon: '', slot: '', status: '', query: '' }, selected = null, dirty = false, lastInitial = null;
export const researchDirty = () => dirty;
export const discardResearchChanges = () => { dirty = false; };
const fmt = n => Number(n.toFixed(5)).toLocaleString('de-DE');
const input = (label, type = 'text', value = '') => {
  const el = node('input'); el.type = type; el.value = value; el.setAttribute('aria-label', label);
  if (type === 'number') el.step = 'any';
  return el;
};
function select(label, options, value = '') {
  const el = node('select'); el.setAttribute('aria-label', label);
  for (const [v, text] of options) { const o = node('option', text); o.value = v; el.append(o); }
  el.value = value;
  return el;
}
function labeled(label, control, parent) {
  const l = node('label', null, 'research-label'); l.append(node('span', label), control); parent.append(l); return control;
}
function check(label, checked, parent) {
  const el = input(label, 'checkbox'); el.checked = checked;
  const l = node('label', null, 'check-control'); l.append(el, node('span', label)); parent.append(l); return el;
}
const parseNumber = el => el.value.trim() === '' ? null : Number(el.value);
const safe = fn => async () => { try { await fn(); } catch (e) { toast(e.message); } };

export function renderResearch({ db, data, container, onSave, storageAvailable, audit, initialWeapon, initialAttachment, go }) {
  let disposed = false, ocrWorker = null, ocrGeneration = 0;
  const objectURLs = new Set();
  const abortNavigation = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', abortNavigation);
  const rows = researchRows(db, data), activeRows = rows.filter(r => r.attachment.availability !== false);
  const initialRoute = `${initialWeapon ?? ''}/${initialAttachment ?? ''}`;
  if (lastInitial !== initialRoute) {
    if (initialWeapon) filters.weapon = initialWeapon;
    if (initialWeapon && initialAttachment) selected = `${initialWeapon}/${initialAttachment}`;
    lastInitial = initialRoute;
  }
  const intro = node('div', null, 'screen-heading');
  const title = node('div'); title.append(node('div', 'INTEL / LOKALES RECHERCHEBUCH', 'eyebrow'), node('h1', 'DATEN VERVOLLSTÄNDIGEN'), node('p', 'Fehlende Aufsatzwerte systematisch recherchieren, belegen und lokal testen.'));
  intro.append(title); container.append(intro);
  container.append(notice('Nur in diesem Browser gespeichert. Neue Eingaben sind keine automatisch veröffentlichten oder unabhängig verifizierten Spieldaten. JSON exportieren und im Repository prüfen lassen.'));
  if (!storageAvailable) container.append(notice('Der lokale Recherchespeicher ist beschädigt oder nicht verfügbar. Bisherige Daten bleiben erhalten. Export und geprüfter Wiederherstellungsimport bleiben möglich.', true));
  const missing = rows.reduce((n, r) => n + r.missing.length, 0), total = rows.length * RESEARCH_FIELDS.length;
  const stats = node('div', null, 'research-summary');
  for (const [n, label] of [[rows.length, 'Aufsatzeinträge'], [missing, 'Messfelder offen'], [total - missing, 'Messfelder dokumentiert'], [`${total ? fmt(100 * (total - missing) / total) : 0} %`, 'Feldabdeckung'], [`${rows.length ? fmt(100 * rows.filter(r => r.complete).length / rows.length) : 0} %`, 'Aufsätze mit dokumentierter Checkliste']]) {
    const s = node('div'); s.append(node('strong', String(n)), node('span', label)); stats.append(s);
  }
  container.append(stats, node('p', 'Abdeckung zählt elf explizite Messfelder je Aufsatz, einschließlich belegtem „keine Änderung“. Nicht erwähnte Effekte bleiben unbekannt. „Sonstige Effekte geprüft“ ist zusätzlich nötig; die Checkliste bestätigt keine vollständige Verifizierung oder Stapelregeln. Gesperrte Slot-Zuordnungen bleiben zur Prüfung enthalten.', 'stats-note'));
  if (audit) container.append(node('p', `CSV-Ausgangsbericht: ${audit.rows.length} Einträge · ${audit.sourceFile} · SHA-256 ${audit.csvHash.slice(0, 12)}. Die aktuelle Liste wird aus Datenbank und lokalen Eingaben neu berechnet; mehrdeutige Zahlenangaben zählen nicht als nutzbare Rechenwerte.`, 'stats-note'));
  const toolbar = node('div', null, 'action-row');
  toolbar.append(button('Recherche-JSON exportieren', () => download('mw4-recherche.json', data)), button('JSON importieren', () => file.click()), button('Nächster unvollständiger Aufsatz', () => openNext(selected), 'button primary'));
  const file = input('Recherche-JSON importieren', 'file'); file.accept = 'application/json,.json'; file.hidden = true;
  file.addEventListener('change', safe(async () => {
    const f = file.files[0]; if (!f) return;
    if (f.size > 15000000) throw Error('JSON-Datei ist größer als 15 MB');
    const incoming = validateResearch(JSON.parse(await f.text()));
    const dialog = node('dialog', null, 'research-import');
    dialog.append(node('h2', 'IMPORT PRÜFEN'), node('p', `${incoming.records.length} Einträge. Vorhandene lokale Einträge werden standardmäßig behalten. Waffen, IDs und Patchstände bleiben erhalten; fremde IDs werden inaktiv. Keine Camo-Daten werden importiert.`));
    const choices = {};
    for (const r of incoming.records) {
      const old = data.records.find(x => recordKey(x) === recordKey(r));
      const w = db.weapons.find(w => w.id === r.weaponId), a = db.attachments.find(a => a.id === r.attachmentId && a.weaponIds.includes(r.weaponId));
      const line = node('div', null, 'research-import-row');
      line.append(node('p', `${w?.name ?? r.weaponId} / ${a?.name ?? r.attachmentId}: ${r.fields.length} Werte${!w || !a ? ' · unbekannte ID, bleibt inaktiv' : ''}${r.patchRevision !== db.patchRevision ? ' · alter Patch, bleibt inaktiv' : ''}`));
      if (old) { const c = check('Bestehenden lokalen Eintrag ausdrücklich ersetzen', false, line); c.addEventListener('change', () => { choices[recordKey(r)] = c.checked ? 'replace' : 'keep'; }); }
      dialog.append(line);
    }
    dialog.append(button('Import übernehmen', safe(async () => { onSave(mergeResearch(data, incoming, choices)); dirty = false; dialog.close(); dialog.remove(); toast('Recherche importiert. Nicht veröffentlichte lokale Ergänzungen.'); })), button('Abbrechen', () => { dialog.close(); dialog.remove(); }));
    document.body.append(dialog); dialog.showModal(); file.value = '';
  }));
  container.append(toolbar, file);
  const weaponOverview = node('details', null, 'data-coverage'); weaponOverview.append(node('summary', 'Fortschritt aller Waffen'));
  const wt = node('div', null, 'research-weapons');
  for (const w of db.weapons) {
    const wr = rows.filter(r => r.weapon.id === w.id), count = wr.reduce((n, r) => n + r.missing.length, 0);
    wt.append(button(`${w.name} · ${wr.length ? `${count} Felder offen · ${wr.filter(r => r.complete).length}/${wr.length} Checklisten` : 'keine Aufsätze'}`, () => { filters.weapon = w.id; weaponFilter.value = w.id; redrawList(); }));
  }
  weaponOverview.append(wt); container.append(weaponOverview);
  const controls = node('div', null, 'research-filters');
  const weaponFilter = select('Waffe filtern', [['', 'Alle Waffen'], ...db.weapons.map(w => [w.id, w.name])], filters.weapon);
  const slotFilter = select('Aufsatz-Slot filtern', [['', 'Alle Slots'], ...[...new Set(rows.map(r => r.attachment.slot))].sort().map(s => [s, s])], filters.slot);
  const statusFilter = select('Datenstatus filtern', [['', 'Alle Datenstatus'], ...Object.entries(STATUS)], filters.status);
  const query = input('Aufsatz suchen', 'search', filters.query); query.placeholder = 'Aufsatz suchen …';
  controls.append(weaponFilter, slotFilter, statusFilter, query); container.append(controls);
  for (const [el, key] of [[weaponFilter, 'weapon'], [slotFilter, 'slot'], [statusFilter, 'status'], [query, 'query']]) el.addEventListener(el === query ? 'input' : 'change', () => { filters[key] = el.value; page = 0; redrawList(); });
  const layout = node('div', null, 'research-layout'), list = node('section', null, 'research-list'), detail = node('section', null, 'research-detail');
  list.setAttribute('aria-label', 'Aufsatz-Arbeitsliste'); detail.setAttribute('aria-label', 'Recherche-Editor');
  layout.append(list, detail); container.append(layout);
  let page = 0, currentEditor = null;
  const filtered = () => rows.filter(r => (!filters.weapon || r.weapon.id === filters.weapon) && (!filters.slot || r.attachment.slot === filters.slot) && (!filters.status || r.status === filters.status) && (!filters.query || `${r.weapon.name} ${r.attachment.name}`.toLowerCase().includes(filters.query.toLowerCase())));
  function openNext(from) {
    const source = filtered().filter(r => r.attachment.availability !== false && !r.complete);
    const i = source.findIndex(r => `${r.weapon.id}/${r.attachment.id}` === from);
    const differs = r => `${r.weapon.id}/${r.attachment.id}` !== from;
    const next = source[i + 1] ?? source.find(differs) ?? activeRows.find(r => !r.complete && differs(r));
    if (next) open(next); else toast('Alle Checklisten im aktuellen Datensatz dokumentiert. Verifizierung bleibt separat.');
  }
  function open(row) {
    if (dirty && !confirm('Nicht gespeicherte Formularänderungen verwerfen?')) return;
    dirty = false; selected = `${row.weapon.id}/${row.attachment.id}`;
    currentEditor?.(); currentEditor = renderDetail(row);
    redrawList();
  }
  function redrawList() {
    list.replaceChildren();
    const found = filtered();
    page = Math.min(page, Math.max(0, Math.ceil(found.length / 35) - 1));
    list.append(node('p', `${found.length} Treffer · Seite ${page + 1}/${Math.max(1, Math.ceil(found.length / 35))}`, 'stats-note'));
    for (const r of found.slice(page * 35, page * 35 + 35)) {
      const b = button('', () => open(r), 'research-row' + (selected === `${r.weapon.id}/${r.attachment.id}` ? ' selected' : ''));
      b.replaceChildren(node('span', `${r.weapon.name} / ${r.attachment.slot}`, 'eyebrow'), node('strong', r.attachment.name), node('span', `${r.missing.length} offen · ${STATUS[r.status]}`), node('small', r.missing.map(k => METRICS[k][0]).join(' · ') || 'Elf Messfelder dokumentiert; sonstige Effekte prüfen'));
      list.append(b);
    }
    if (!found.length) list.append(notice('Keine Aufsätze für diese Filter.'));
    const pager = node('div', null, 'action-row');
    const prev = button('Vorherige', () => { page--; redrawList(); }); prev.disabled = page === 0;
    const next = button('Weitere', () => { page++; redrawList(); }); next.disabled = (page + 1) * 35 >= found.length;
    pager.append(prev, next); list.append(pager);
  }
  function renderDetail(row) {
    detail.replaceChildren();
    const { weapon: w, attachment: a } = row, key = `${w.id}/${a.id}`;
    let record = structuredClone(row.record ?? { weaponId: w.id, attachmentId: a.id, patchRevision: db.patchRevision, updatedAt: new Date().toISOString(), fields: [], otherEffects: '', otherReviewed: false, checklist: [] });
    let localDisposed = false, pendingMedia = 0;
    detail.append(node('div', `${w.name} / ${a.slot}`, 'eyebrow'), node('h2', a.name), node('p', `ID ${a.id} · Multiplayer · Patch ${db.patchRevision.slice(0, 12)}`, 'stats-note'));
    if (a.compatibilityConflict || a.availability === false) detail.append(notice(a.compatibilityConflict ?? 'Aufsatz für diese Waffe nicht als verfügbar bestätigt. Eingaben ändern die Kompatibilität nicht.', true));
    if (record.patchRevision !== db.patchRevision) detail.append(notice('Diese lokalen Messungen stammen aus einem anderen Patch. Prüfe sie erneut und bestätige den aktuellen Patch ausdrücklich vor dem Speichern.', true));
    const links = node('div', null, 'action-row'), search = encodeURIComponent(`MW4 ${w.name} ${a.name} attachment stats`);
    for (const [label, url] of [['Google', `https://www.google.com/search?q=${search}`], ['Reddit', `https://www.reddit.com/search/?q=${search}`], ['Waffen-Datenbanken', `https://www.google.com/search?q=${search}%20(site%3Aggranked.com%20OR%20site%3Awarzoneloadout.games%20OR%20site%3Atruegamedata.com)`]]) links.append(external(label + ' ↗', url, 'button'));
    for (const id of a.evidence?.sourceIds ?? a.sourceIds) {
      const s = db.sources.find(s => s.id === id); if (s?.url?.startsWith('https://')) links.append(external('Vorhandene Quelle ↗', s.url, 'button'));
    }
    detail.append(links);
    const existing = node('details', null, 'data-coverage'); existing.open = true; existing.append(node('summary', 'Vorhandene Angaben und Bearbeitung'));
    const existingRows = node('div');
    for (const e of a.evidence?.effects ?? []) existingRows.append(node('p', `${e.raw}${e.reason ? ' · ' + e.reason : ''}`, 'effect-line'));
    if (!(a.evidence?.effects?.length || a.modifiers.length)) existingRows.append(node('p', 'Keine veröffentlichten numerischen Effekte.'));
    for (const m of [...a.modifiers, ...(a.evidence?.patchRevision === db.patchRevision ? a.evidenceModifiers ?? [] : [])]) {
      const p = node('div', null, 'research-existing');
      p.append(node('span', `${METRICS[m.stat][0]}: ${m.operation} ${m.value} ${m.unit} · ${m.patchRevision === db.patchRevision ? 'Quellenstand aktuell' : 'veraltet'}`), button('Als lokale Bearbeitung übernehmen', () => {
        if (editors.has(m.stat)) { toast('Dieses Feld ist bereits im Editor. Dort ändern.'); editors.get(m.stat).box.open = true; return; }
        const source = db.sources.find(s => s.id === m.sourceIds[0]);
        addField({ ...blank(m.stat), model: m.operation === 'multiply' ? 'factor' : m.operation, value: m.value, unit: m.unit, source: source?.url ?? source?.title ?? '', status: 'reported' }); dirty = true;
      })); existingRows.append(p);
    }
    existing.append(existingRows); detail.append(existing);
    const form = node('form', null, 'research-form'); form.addEventListener('submit', e => { e.preventDefault(); });
    const checklist = node('details', null, 'data-coverage'); checklist.open = true; checklist.append(node('summary', 'Recherche-Checkliste'));
    const checklistBoxes = {};
    for (const k of RESEARCH_FIELDS) {
      checklistBoxes[k] = check(`${METRICS[k][0]} · ${row.missing.includes(k) ? 'FEHLT / mehrdeutig' : 'Angabe vorhanden'}`, record.checklist.includes(k), checklist);
    }
    checklist.append(node('p', 'Häkchen merken nur deinen Arbeitsstand. Ohne belegten Messwert schließen sie keine Datenlücke.', 'stats-note')); form.append(checklist);
    const fieldList = node('div', null, 'research-fields'), editors = new Map();
    const fieldChoices = Object.entries(METRICS).filter(([k]) => !['ttk', 'weaponLevels', 'unlockLevel'].includes(k) && !k.startsWith('rating')).map(([k, [label, unit]]) => [k, `${label} (${unit})`]);
    const addSelect = select('Weiteren Messwert wählen', fieldChoices, row.missing[0] ?? 'ads');
    const addBar = node('div', null, 'action-row'); addBar.append(addSelect, button('Messwert ergänzen', () => { if (editors.has(addSelect.value)) return toast('Dieses Feld ist schon im Editor.'); addField(blank(addSelect.value)); dirty = true; }));
    form.append(addBar, fieldList);
    function blank(metric) { return { metric, model: 'unknown', value: null, unit: METRICS[metric][1], before: null, after: null, status: 'draft', source: '', secondSource: '', date: new Date().toISOString().slice(0, 10), note: '', replacePublished: false, useBaseline: false }; }
    function addField(field) {
      const k = field.metric, box = node('details', null, 'research-field'); box.open = true;
      box.append(node('summary', `${METRICS[k][0]} · ${METRICS[k][1]}`));
      const grid = node('div', null, 'research-field-grid');
      const before = labeled('Basis / ohne Aufsatz (' + METRICS[k][1] + ')', input(`${METRICS[k][0]} vorher`, 'number', field.before ?? ''), grid);
      const after = labeled('Mit Aufsatz (' + METRICS[k][1] + ')', input(`${METRICS[k][0]} nachher`, 'number', field.after ?? ''), grid);
      before.min = after.min = '0';
      const diff = node('p', 'Eine Messung legt kein Stapelmodell fest.', 'stats-note'); box.append(grid, diff);
      const model = labeled('Rechenmodell', select(`${METRICS[k][0]} Modell`, Object.entries(MODELS), field.model), grid);
      const value = labeled('Effektwert', input(`${METRICS[k][0]} Effektwert`, 'number', field.value ?? ''), grid);
      const unit = node('p', '', 'stats-note'); grid.append(unit);
      const status = labeled('Datenstatus (bleibt lokal)', select(`${METRICS[k][0]} Datenstatus`, Object.entries(RESEARCH_STATUSES), field.status), grid);
      const source = labeled('Quelle / eigene Messmethode', input(`${METRICS[k][0]} Quelle`, 'text', field.source), grid); source.maxLength = 2000; source.placeholder = 'HTTPS-Link oder „MW4-Gunsmith, Screenshot …“';
      const secondSource = labeled('Zweite Quelle für Abgleich', input(`${METRICS[k][0]} zweite Quelle`, 'text', field.secondSource), grid);
      const measuredDate = labeled('Messdatum / Quellenstand', input(`${METRICS[k][0]} Datum`, 'date', field.date), grid);
      const note = node('textarea'); note.value = field.note; note.maxLength = 2000; note.setAttribute('aria-label', `${METRICS[k][0]} Notiz`); labeled('Notiz / Testbedingungen', note, box);
      const replacement = check('Abweichenden Quellenwert nur für lokale Rechnung ausdrücklich ersetzen', field.replacePublished, box);
      const baseline = check('Vorher-Messung als lokale Rechenbasis verwenden', field.useBaseline, box);
      const warning = node('p', '', 'research-conflict'); box.append(warning);
      const currentBase = w.base[k]; if (currentBase) box.append(node('p', `Veröffentlichte Basis: ${currentBase.value} ${currentBase.unit} · ${currentBase.status}. Lokale Abweichungen benötigen ausdrückliche Übernahme.`, 'stats-note'));
      const update = () => {
        const b = parseNumber(before), a = parseNumber(after);
        const u = model.value === 'percent' ? '%' : model.value === 'factor' ? 'factor' : METRICS[k][1];
        unit.textContent = 'Einheit Effektwert: ' + u;
        if (b !== null && a !== null && b >= 0 && a >= 0) {
          const c = comparison(b, a); diff.textContent = `${fmt(c.absolute)} ${METRICS[k][1]} · ${c.percent === null ? 'Prozent / Faktor bei Basis 0 nicht definiert' : `${fmt(c.percent)} % · Faktor ${fmt(c.factor)}`} · Rechenmodell weiterhin ausdrücklich wählen.`;
          const derived = model.value === 'add' ? c.absolute : model.value === 'percent' ? c.percent : model.value === 'factor' ? c.factor : model.value === 'set' ? a : null;
          if (derived !== null) value.value = Number(derived.toFixed(8));
        } else diff.textContent = 'Beide Messwerte in derselben Einheit eintragen. Aus einer Messung lässt sich das Stapelmodell nicht bestimmen.';
        const f = get();
        warning.textContent = fieldConflict(aRow(), f, db.patchRevision) ? `Widerspruch zur Quelle${replacement.checked ? ' · ausdrücklich nur lokal ersetzt' : ' · ohne Bestätigung nicht für Berechnung aktiv'}.` : '';
        if (baseline.checked && b !== null && currentBase && currentBase.value !== b) warning.textContent += ' Lokaler Basiswert weicht ab.';
      };
      function aRow() { return row.attachment; }
      function get() { return { metric: k, model: model.value, value: parseNumber(value), unit: model.value === 'percent' ? '%' : model.value === 'factor' ? 'factor' : METRICS[k][1], before: parseNumber(before), after: parseNumber(after), status: status.value, source: source.value.trim(), secondSource: secondSource.value.trim(), date: measuredDate.value, note: note.value.trim(), replacePublished: replacement.checked, useBaseline: baseline.checked }; }
      for (const el of [before, after, model, value, status, replacement, baseline]) el.addEventListener('change', update);
      box.append(button('Lokales Messfeld entfernen', () => { box.remove(); editors.delete(k); dirty = true; }, 'button subtle'));
      fieldList.append(box); editors.set(k, { box, before, after, get, update }); update();
    }
    for (const f of record.fields) addField(f);
    if (!record.fields.length && row.missing.length) addField(blank(row.missing[0]));
    const other = node('textarea'); other.value = record.otherEffects; other.maxLength = 10000; other.setAttribute('aria-label', 'Sonstige Effekte');
    labeled('Sonstige Effekte, Quelle und Messbedingungen', other, form);
    const otherReviewed = check('Sonstige Effekte geprüft und oben dokumentiert (einschließlich „keine“ mit Beleg)', record.otherReviewed, form);
    const patchConfirmed = check('Alle hier gespeicherten Messwerte für den aktuellen Patch erneut geprüft', record.patchRevision === db.patchRevision, form);
    form.addEventListener('input', () => { dirty = true; saveState.textContent = 'UNGESPEICHERTE ÄNDERUNGEN'; });
    form.addEventListener('change', () => { dirty = true; saveState.textContent = 'UNGESPEICHERTE ÄNDERUNGEN'; });
    const saveState = node('p', 'Lokal speichern aktiviert die bestätigten Einzeleffekte im Gunsmith.', 'stats-note'); saveState.setAttribute('role', 'status');
    function collectRecord() {
      const fields = [...editors.values()].map(e => e.get());
      const meaningful = fields.filter(f => f.value !== null || f.before !== null || f.after !== null || f.source.trim());
      return { ...record, fields: meaningful, otherEffects: other.value.trim(), otherReviewed: otherReviewed.checked, checklist: Object.entries(checklistBoxes).filter(([, e]) => e.checked).map(([k]) => k), patchRevision: patchConfirmed.checked ? db.patchRevision : record.patchRevision, updatedAt: new Date().toISOString() };
    }
    const persist = next => safe(async () => {
      if (!patchConfirmed.checked) throw Error('Aktuellen Patchstand ausdrücklich prüfen und bestätigen.');
      const candidate = collectRecord();
      const updated = upsertResearch(data, candidate);
      const remaining = researchRows(db, updated).filter(r => !r.complete && r.attachment.availability !== false && (!filters.weapon || r.weapon.id === filters.weapon) && (!filters.slot || r.attachment.slot === filters.slot));
      const i = remaining.findIndex(r => `${r.weapon.id}/${r.attachment.id}` === key);
      if (next) { const differs = r => `${r.weapon.id}/${r.attachment.id}` !== key; const nr = remaining[i + 1] ?? remaining.find(differs) ?? researchRows(db, updated).find(r => !r.complete && r.attachment.availability !== false && differs(r)); if (nr) selected = `${nr.weapon.id}/${nr.attachment.id}`; }
      onSave(updated); dirty = false; toast('Lokal gespeichert. Im Gunsmith als Teilrechnung verfügbar; noch nicht veröffentlicht.');
    });
    const saveBar = node('div', null, 'research-save');
    const save = button('Lokal speichern', persist(false), 'button primary'); save.disabled = !storageAvailable;
    const next = button('Speichern & nächster Aufsatz', persist(true)); next.disabled = !storageAvailable;
    saveBar.append(save, next, button('Formulareingaben als JSON exportieren', safe(() => download('mw4-recherche-formular.json', upsertResearch(data, collectRecord())))), button('Im Gunsmith öffnen', () => {
      if (dirty && !confirm('Ungespeicherte Änderungen verwerfen und Gunsmith öffnen?')) return;
      dirty = false; go(`weapon/${w.id}/attachments`);
    }));
    form.append(saveState, saveBar); detail.append(form);
    const media = node('details', null, 'research-media'); media.open = true; media.append(node('summary', 'Gunsmith-Screenshots & lokale Texterkennung'), node('p', 'PNG/JPEG/WebP bis 10 MB. Vorher und Nachher mit identischer Konfiguration messen. Bilder bleiben lokal in IndexedDB; JSON exportiert nur Werte und Quellen. Originalbilder separat herunterladen. OCR-Software und Sprachmodelle werden von dieser Website geladen; Erkennung erfolgt auf deinem Gerät.', 'stats-note'));
    detail.append(media);
    for (const [kind, label] of [['before', 'Vorher'], ['after', 'Nachher']]) {
      const part = node('div', null, 'research-media-part'), upload = input(`${label}-Screenshot hochladen`, 'file'); upload.accept = 'image/png,image/jpeg,image/webp';
      labeled(label + '-Screenshot', upload, part);
      const imageBox = node('div'); part.append(imageBox); media.append(part);
      let selectedMedia = null;
      const show = async () => {
        selectedMedia = await readScreenshot(`${key}:${kind}`);
        if (localDisposed || disposed) return;
        imageBox.replaceChildren(); if (!selectedMedia) return;
        const u = URL.createObjectURL(selectedMedia.blob); objectURLs.add(u);
        const img = node('img'); img.src = u; img.alt = `${a.name}: ${label}-Screenshot`; imageBox.append(img, node('p', `${selectedMedia.name} · lokal gespeichert`, 'stats-note'));
        const original = node('a', 'Originalbild herunterladen', 'button'); original.href = u; original.download = selectedMedia.name; imageBox.append(original);
        imageBox.append(button('Screenshot entfernen', safe(async () => { await deleteScreenshot(`${key}:${kind}`); await show(); })), button(`${label}: OCR starten`, safe(async () => {
          if (ocrWorker || pendingMedia) throw Error('Die laufende OCR zuerst abschließen oder abbrechen.');
          pendingMedia++; const generation = ++ocrGeneration;
          const output = node('div', null, 'research-ocr-output'), progress = node('p', 'OCR wird geladen …'); output.append(progress); part.append(output);
          output.append(button('OCR abbrechen', () => { ocrGeneration++; ocrWorker?.terminate(); ocrWorker = null; pendingMedia = 0; progress.textContent = 'Erkennung abgebrochen. Zahlen können manuell eingetragen werden.'; }));
          try {
            const r = await recognizeScreenshot(selectedMedia.blob, m => { if (!localDisposed && !disposed && generation === ocrGeneration) progress.textContent = `OCR: ${m.status} ${Math.round((m.progress ?? 0) * 100)} %`; }, worker => { if (generation === ocrGeneration) ocrWorker = worker; if (localDisposed || disposed || generation !== ocrGeneration) worker?.terminate(); });
            if (localDisposed || disposed || generation !== ocrGeneration) return;
            progress.textContent = `OCR abgeschlossen · Erkennungssicherheit ${Math.round(r.confidence)} %. Kein Qualitätsnachweis für Spielwerte.`;
            ocrResults(r.text, kind, output);
          } catch (e) { if (!localDisposed && !disposed) progress.textContent = `OCR nicht verfügbar: ${e.message}. Werte unten manuell eintragen.`; }
          finally { if (generation === ocrGeneration) pendingMedia = 0; }
        })));
      };
      upload.addEventListener('change', safe(async () => {
        const f = upload.files[0]; if (!f) return;
        await saveScreenshot(key, kind, f); await show(); upload.value = ''; toast('Screenshot ausschließlich lokal gespeichert.');
      }));
      show().catch(e => { if (!localDisposed) imageBox.append(notice(e.message)); });
    }
    const manualText = node('details'); manualText.append(node('summary', 'OCR-Text manuell einfügen oder korrigieren'));
    const text = node('textarea'); text.setAttribute('aria-label', 'OCR-Text'); text.placeholder = 'ADS Time 300 ms\nMagazine 30 rounds';
    const kindChoice = select('OCR-Zuordnung', [['before', 'Vorher'], ['after', 'Nachher']]);
    manualText.append(text, kindChoice, button('Text als Vorschläge prüfen', () => ocrResults(text.value, kindChoice.value, manualText)));
    media.append(manualText);
    function ocrResults(text, kind, parent) {
      const section = node('div', null, 'research-ocr-candidates');
      const raw = node('textarea'); raw.value = text; raw.setAttribute('aria-label', 'Erkannten OCR-Text korrigieren');
      section.append(node('h3', 'VORSCHLÄGE EINZELN BESTÄTIGEN'), raw);
      const candidates = node('div'); section.append(candidates, button('Korrigierten Text erneut auswerten', () => draw()));
      function draw() {
        candidates.replaceChildren();
        const found = parseOCRText(raw.value);
        if (!found.length) candidates.append(notice('Keine eindeutig zugeordneten Messwerte erkannt. Einheit und Feldnamen korrigieren oder Werte manuell im Formular eintragen.'));
        for (const c of found) {
          const line = node('div', null, 'research-ocr-line'), value = input('OCR-Wert ' + METRICS[c.metric][0], 'number', c.value), unit = input('OCR-Einheit ' + METRICS[c.metric][0], 'text', c.unit);
          line.append(node('p', c.raw), node('strong', METRICS[c.metric][0]), value, unit);
          line.append(button('Wert bestätigt übernehmen', () => {
            if (unit.value.trim() !== METRICS[c.metric][1] || parseNumber(value) === null || parseNumber(value) < 0) return toast('Zahl und Einheit prüfen: ' + METRICS[c.metric][1] + ' erwartet.');
            if (!editors.has(c.metric)) addField(blank(c.metric));
            const editor = editors.get(c.metric); editor[kind].value = value.value; editor.update(); dirty = true; saveState.textContent = 'OCR-Vorschlag im Formular · Quelle/Status ergänzen und lokal speichern.';
            line.remove();
          }));
          candidates.append(line);
        }
      }
      draw(); parent.append(section);
    }
    return () => { localDisposed = true; ocrGeneration++; ocrWorker?.terminate(); ocrWorker = null; };
  }
  redrawList();
  const initial = rows.find(r => `${r.weapon.id}/${r.attachment.id}` === selected) ?? filtered().find(r => !r.complete && r.attachment.availability !== false) ?? filtered()[0];
  if (initial) { selected = `${initial.weapon.id}/${initial.attachment.id}`; currentEditor = renderDetail(initial); redrawList(); }
  else detail.append(notice('Keine Aufsätze verfügbar.'));
  return () => { disposed = true; currentEditor?.(); for (const url of objectURLs) URL.revokeObjectURL(url); window.removeEventListener('beforeunload', abortNavigation); };
}
