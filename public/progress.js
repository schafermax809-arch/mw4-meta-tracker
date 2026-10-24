// This module is only imported by the browser. Updater scripts cannot import or write personal state.
export const PROGRESS_KEY = 'mw4-intel:camo-progress:v1';
export function validateProgress(value) {
  if (!value || value.schemaVersion !== 1 || typeof value.entries !== 'object' || !value.entries || Array.isArray(value.entries) || Object.keys(value).some(k => !['schemaVersion', 'entries'].includes(k))) throw new Error('Ungültige Fortschrittsdatei');
  for (const [key, count] of Object.entries(value.entries)) {
    if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(key) || !Number.isSafeInteger(count) || count < 0 || count > 10000000) throw new Error('Ungültiger Fortschrittswert');
  }
  return value;
}
export function loadProgress(storage) {
  const raw = storage.getItem(PROGRESS_KEY);
  return raw ? validateProgress(JSON.parse(raw)) : { schemaVersion: 1, entries: {} };
}
export function saveProgress(storage, progress) { storage.setItem(PROGRESS_KEY, JSON.stringify(validateProgress(progress))); }
export const progressPercent = (count, target) => Math.min(100, Math.max(0, count / target * 100));
