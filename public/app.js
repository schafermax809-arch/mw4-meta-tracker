import { loadProgress, saveProgress, validateProgress, progressPercent } from './progress.js';
const $ = selector => document.querySelector(selector);
const labels = { 'assault-rifle': 'Sturmgewehre', smg: 'Maschinenpistolen', shotgun: 'Schrotflinten', lmg: 'Leichte MGs', marksman: 'Präzisionsgewehre', sniper: 'Scharfschützengewehre', pistol: 'Pistolen', launcher: 'Werfer', melee: 'Nahkampf' };
const fmt = (value, options) => value ? new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...options }).format(new Date(value)) : 'Noch kein Update';
const el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
let state;
let progress;
let storageAvailable = true;
try { progress = loadProgress(localStorage); } catch { storageAvailable = false; progress = { schemaVersion: 1, entries: {} }; }
function link(title, href) { const a = el('a', title); const url = new URL(href, location.href); if (url.protocol !== 'https:') throw new Error('Unsichere Quelle'); a.href = url.href; a.target = '_blank'; a.rel = 'noreferrer'; return a; }
function notify(text) { $('#toast').textContent = text; $('#toast').hidden = false; setTimeout(() => $('#toast').hidden = true, 3500); }
function download(name, value) { const a = el('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

function renderWeapons() {
  const query = $('#search').value.toLocaleLowerCase('de');
  const kind = $('#class-filter').value;
  const tier = $('#tier-filter').value;
  const changed = $('#changed-only').checked;
  const weapons = state.weapons.filter(w => { const currentTier = w.tierRevision === state.patchRevision ? w.tier : null; return w.name.toLocaleLowerCase('de').includes(query) && (!kind || w.weaponClass === kind) && (!tier || (tier === 'unknown' ? currentTier === null : currentTier === tier)) && (!changed || state.lastChangedWeaponIds.includes(w.id)); });
  $('#result-count').textContent = weapons.length;
  $('#weapons-grid').replaceChildren();
  for (const w of weapons) {
    const button = el('button', undefined, 'weapon-card');
    button.append(el('div', labels[w.weaponClass], 'weapon-class'), el('span', '↗', 'arrow'), el('h3', w.name));
    const bottom = el('div', undefined, 'weapon-card-bottom');
    const currentTier = w.tierRevision === state.patchRevision ? w.tier : null;
    bottom.append(el('span', currentTier ? `TIER ${currentTier}` : w.tier ? 'META ERNEUT PRÜFEN' : 'META NOCH UNBEKANNT', currentTier ? 'tier known' : 'tier'));
    if (state.lastChangedWeaponIds.includes(w.id)) bottom.append(el('span', '● AKTUALISIERT', 'changed-dot'));
    button.append(bottom); button.addEventListener('click', () => showWeapon(w)); $('#weapons-grid').append(button);
  }
  if (!weapons.length) $('#weapons-grid').append(el('div', 'Keine Waffen für diese Auswahl gefunden.', 'empty-state'));
}

function showWeapon(w) {
  $('#detail-class').textContent = labels[w.weaponClass]; $('#detail-name').textContent = w.name;
  const content = $('#detail-content'); content.replaceChildren();
  const builds = el('section', undefined, 'detail-section'); builds.append(el('h3', 'Meta & empfohlene Aufsätze'));
  builds.append(el('p', w.tier ? `Zuletzt verifizierte Einstufung: Tier ${w.tier}${w.tierRevision === state.patchRevision ? '' : ' (älterer Patch, erneute Prüfung erforderlich)'}` : 'Meta-Tier unbekannt. Noch keine belastbare Einstufung für diesen Patch.'));
  if (!w.builds.length) builds.append(el('p', 'Keine verifizierten Builds verfügbar. Empfehlungen werden nach Quellenprüfung ergänzt.'));
  for (const b of w.builds) {
    builds.append(el('h3', `${b.kind === 'meta' ? 'Meta' : 'Camo'} · ${b.mode}`), el('p', b.notes));
    if (b.patchRevision !== state.patchRevision) builds.append(el('p', 'Älterer Patch: Dieser Build muss erneut verifiziert werden.', 'review-note'));
    const list = el('ul', undefined, 'build-attachments');
    for (const a of b.attachments) list.append(el('li', `${a.slot}: ${state.attachments.find(item => item.id === a.attachmentId)?.name ?? a.attachmentId}`));
    builds.append(list);
  }
  content.append(builds);
  const camos = el('section', undefined, 'detail-section'); camos.append(el('h3', 'Dein Camo-Fortschritt'));
  if (!storageAvailable) camos.append(el('p', 'Browserspeicher nicht verfügbar oder gespeicherte Datei ungültig. Bestehende Daten werden nicht überschrieben.', 'review-note'));
  if (!w.camos.length) camos.append(el('p', 'Die genauen Herausforderungen dieser Waffe sind noch nicht vollständig verifiziert. Es werden keine Anforderungen geschätzt.'));
  for (const c of w.camos) {
    const key = `${w.id}:${c.id}`;
    const row = el('div', undefined, 'camo-row');
    const desc = el('div'); desc.append(el('strong', c.name), el('p', `${c.requirement} · ${c.mode === 'shared' ? 'alle Modi' : c.mode}`));
    const bar = el('progress'); bar.max = 100; bar.value = progressPercent(progress.entries[key] || 0, c.target); bar.setAttribute('aria-label', `${c.name} Fortschritt`); desc.append(bar);
    const label = el('label', ` / ${c.target} ${c.unit}`);
    const input = el('input'); input.type = 'number'; input.min = '0'; input.max = String(c.target); input.step = '1'; input.value = progress.entries[key] || 0; input.setAttribute('aria-label', `${c.name}: Fortschritt`); input.disabled = !storageAvailable;
    const updateProgress = () => {
      const count = Number(input.value);
      if (!Number.isSafeInteger(count) || count < 0 || count > c.target) { input.value = progress.entries[key] || 0; return; }
      const next = structuredClone(progress); next.entries[key] = count;
      const wasComplete = (progress.entries[key] || 0) >= c.target;
      try { saveProgress(localStorage, next); progress = next; bar.value = progressPercent(count, c.target); if (count === c.target && !wasComplete) notify(`${c.name} abgeschlossen!`); }
      catch { input.value = progress.entries[key] || 0; notify('Fortschritt konnte nicht gespeichert werden.'); }
    };
    input.addEventListener('input', updateProgress);
    input.addEventListener('change', updateProgress);
    row.append(desc, input, label); camos.append(row);
  }
  camos.append(el('p', 'Meta-Updates ändern diese gespeicherten Werte niemals. Bei korrigierten Anforderungen bleibt dein eingetragener Fortschritt erhalten.', 'progress-note'));
  const actions = el('div', undefined, 'detail-actions');
  const exportButton = el('button', 'Fortschritt exportieren ↓', 'button'); exportButton.addEventListener('click', () => download('mw4-camo-fortschritt.json', progress));
  const importButton = el('button', 'Fortschritt importieren ↑', 'button');
  const file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
  importButton.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    if (!file.files?.length) return;
    try {
      if (file.files[0].size > 2000000) throw new Error('Datei zu groß');
      const imported = validateProgress(JSON.parse(await file.files[0].text()));
      if (!confirm('Den gespeicherten Fortschritt durch diese Importdatei ersetzen?')) return;
      saveProgress(localStorage, imported); progress = imported; storageAvailable = true; showWeapon(w); notify('Fortschritt importiert.');
    } catch { notify('Import fehlgeschlagen. Bisheriger Fortschritt bleibt erhalten.'); }
  });
  actions.append(exportButton, importButton, file); camos.append(actions); content.append(camos);
  const sources = el('section', undefined, 'detail-section'); sources.append(el('h3', 'Quellen')); w.sourceUrls.forEach(url => sources.append(link('Offizielle Waffeninformationen ↗', url))); content.append(sources);
  if (!$('#weapon-dialog').open) $('#weapon-dialog').showModal();
}

function render() {
  $('#weapon-count').textContent = state.weapons.length; $('#nav-count').textContent = state.weapons.length;
  $('#build-count').textContent = state.weapons.reduce((sum, w) => sum + w.builds.filter(b => b.kind === 'meta' && b.patchRevision === state.patchRevision).length, 0);
  $('#last-update').textContent = fmt(state.lastSuccessfulUpdate, { day: '2-digit', month: '2-digit', year: 'numeric' });
  $('#last-update-note').textContent = `Übernommen um ${fmt(state.lastSuccessfulUpdate, { hour: '2-digit', minute: '2-digit' })} Uhr`;
  $('#changed-count').textContent = state.lastChangedWeaponIds.length;
  $('#changed-date').textContent = state.lastChangedAt ? `Waffenstand vom ${fmt(state.lastChangedAt, { day: '2-digit', month: '2-digit' })}` : 'Noch keine Waffenänderung';
  $('#patch-name').textContent = state.patchVersion || 'Noch kein Patch verifiziert';
  $('#patch-revision').textContent = state.patchRevision ? `Quellrevision ${state.patchRevision.slice(0, 12)} · keine offizielle Buildnummer` : 'Patch-Version unbekannt';
  const patch = Object.entries(state.documents).find(([, d]) => d.hash === state.patchRevision); if (patch) $('#patch-link').href = patch[0];
  const recent = $('#recent-weapons');
  if (!state.lastChangedWeaponIds.length) recent.append(el('div', 'Noch keine verifizierten Waffenänderungen.', 'empty-state'));
  for (const id of state.lastChangedWeaponIds.slice(0, 4)) {
    const w = state.weapons.find(x => x.id === id); const row = el('div', undefined, 'recent-row'); const text = el('div'); text.append(el('b', w.name), el('small', labels[w.weaponClass])); row.append(text, el('span', 'DATEN GEPRÜFT', 'tag')); recent.append(row);
  }
  if (state.lastChangedWeaponIds.length > 4) { const a = el('a', `+ ${state.lastChangedWeaponIds.length - 4} weitere Waffen ansehen →`, 'small muted'); a.href = '#weapons'; a.addEventListener('click', () => { $('#changed-only').checked = true; renderWeapons(); }); recent.append(a); }
  Object.entries(labels).forEach(([value, text]) => { const o = el('option', text); o.value = value; $('#class-filter').append(o); });
  for (const entry of state.changelog) {
    const details = el('details', undefined, 'changelog-entry'); const summary = el('summary'); const time = el('time', fmt(entry.at, { day: '2-digit', month: '2-digit', year: 'numeric' })); time.dateTime = entry.at; summary.append(time, el('strong', entry.summary));
    const body = el('div', undefined, 'changelog-body'); body.append(el('p', entry.patchVersion || 'Patch unbekannt'));
    const list = el('ul'); for (const c of entry.weaponChanges) { const w = state.weapons.find(w => w.id === c.weaponId); list.append(el('li', `${w?.name ?? c.weaponId}: ${c.before === null ? 'Neu im Katalog' : c.fields.join(', ')}`)); } body.append(list);
    for (const url of entry.sourceUrls) body.append(link(`Quelle: ${new URL(url).pathname.split('/').pop()} ↗`, url));
    details.append(summary, body); $('#changelog-list').append(details);
  }
  for (const [url, doc] of Object.entries(state.documents)) if (doc.kind === 'patch' || /weapons|progression/.test(url)) $('#source-links').append(link(`${doc.title} ↗`, url));
  renderWeapons();
}

$('#close-dialog').addEventListener('click', () => $('#weapon-dialog').close());
$('#weapon-dialog').addEventListener('click', e => { if (e.target === $('#weapon-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
for (const selector of ['#search', '#class-filter', '#tier-filter', '#changed-only']) $(selector).addEventListener(selector === '#search' ? 'input' : 'change', () => state && renderWeapons());
document.querySelectorAll('.nav-link').forEach(a => a.addEventListener('click', () => { document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active')); a.classList.add('active'); }));
try {
  const response = await fetch(new URL('./data/meta.json', import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error('Datendatei nicht erreichbar');
  state = await response.json();
  if (state.schemaVersion !== 1 || state.gameId !== 'cod-mw4-2026' || !Array.isArray(state.weapons)) throw new Error('Ungültiges Datenformat');
  render();
} catch (error) { $('#load-error').textContent = `Daten konnten nicht geladen werden: ${error.message}. Dein lokaler Camo-Fortschritt bleibt erhalten.`; $('#load-error').hidden = false; }
