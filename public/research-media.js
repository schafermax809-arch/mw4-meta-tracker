import { METRICS } from './engine/database.js';
const STORE = 'screenshots';
async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('mw4-research-media-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error('Bildspeicher nicht verfügbar. Die Werte können weiterhin ohne Screenshot gespeichert werden.'));
  });
}
async function transaction(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode), req = action(tx.objectStore(STORE));
    let result;
    req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(Error('Screenshot konnte nicht gespeichert werden. Bisherige Bilder bleiben erhalten.')); };
  });
}
export const allScreenshots = () => transaction('readonly', s => s.getAll());
export const readScreenshot = id => transaction('readonly', s => s.get(id));
export const deleteScreenshot = id => transaction('readwrite', s => s.delete(id));
export async function saveScreenshot(recordKey, kind, file) {
  if (!['before', 'after'].includes(kind) || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10000000 || !file.size) throw Error('PNG, JPEG oder WebP bis 10 MB verwenden.');
  const decoded = await createImageBitmap(file);
  const pixels = decoded.width * decoded.height;
  decoded.close();
  if (pixels > 32000000) throw Error('Bild auf höchstens 32 Megapixel verkleinern.');
  const bytes = await file.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
  const media = { id: `${recordKey}:${kind}`, recordKey, kind, hash, name: file.name.slice(0, 200), blob: new Blob([bytes], { type: file.type }), savedAt: new Date().toISOString() };
  await transaction('readwrite', s => s.put(media));
  return media;
}
const labels = [
  ['ads', /\b(ads(?: in)?(?: time| speed)?|aim down sight(?:s)?(?: time)?|ads-zeit|zielerfassungszeit)\b/i],
  ['sprintToFire', /(sprint[- ]to[- ]fire(?: speed| time)?|sprint[- ]feuer(?:zeit)?)/i],
  ['horizontalRecoil', /(?:horizontal(?:er)?(?: ads)? (?:recoil(?: control)?|rückstoß))/i],
  ['verticalRecoil', /(?:verti[ck]al(?:er)?(?: ads)? (?:recoil(?: control)?|rückstoß))/i],
  ['range', /(?:damage range|schadensreichweite)/i],
  ['velocity', /(?:muzzle velocity|bullet velocity|geschossgeschwindigkeit)/i],
  ['movement', /^(?:move(?:ment)? speed|bewegung(?:sgeschwindigkeit)?)/i],
  ['hipSpread', /(?:hip(?:fire| fire)? spread|hüftfeuerstreuung)/i],
  ['magazine', /(?:magazine(?: capacity)?|magazinkapazität|rounds)/i],
  ['reload', /(?:reload(?: time| speed)?|nachladezeit)/i],
];
export function parseOCRText(text) {
  const result = [];
  for (const raw of text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    const pair = labels.find(([, re]) => re.test(raw));
    if (!pair) continue;
    const rest = raw.replace(pair[1], '').trim();
    const numbers = [...rest.matchAll(/[-−+]?\d+(?:[.,]\d+)?/g)];
    // Two columns or +/- effects are ambiguous, never silently choose one.
    if (numbers.length !== 1) continue;
    const metric = pair[0], value = Number(numbers[0][0].replace('−', '-').replace(',', '.'));
    let unit = /°\s*\/\s*s/.test(rest) ? '°/s' : /m\s*\/\s*s/.test(rest) ? 'm/s' : /\bms\b/i.test(rest) ? 'ms' : /%/.test(rest) ? '%' : /°/.test(rest) ? '°' : /\b(?:sec|seconds?|sek|s)\b/i.test(rest) ? 's' : /\bm\b/.test(rest) ? 'm' : /\b(?:rounds?|schuss)\b/i.test(rest) || metric === 'magazine' ? 'Schuss' : '';
    result.push({ metric, value: unit === 's' && METRICS[metric][1] === 'ms' ? value * 1000 : value, unit: unit === 's' && METRICS[metric][1] === 'ms' ? 'ms' : unit, raw, valid: value >= 0 && (unit === METRICS[metric][1] || unit === 's' && METRICS[metric][1] === 'ms') });
  }
  return result;
}
export async function recognizeScreenshot(blob, logger = () => {}, onWorker = () => {}) {
  const { default: Tesseract } = await import('./vendor/ocr/tesseract.esm.min.js');
  const root = new URL('./vendor/ocr/', import.meta.url).href;
  let worker;
  try {
    worker = await Tesseract.createWorker(['eng', 'deu'], 1, { workerPath: root + 'worker.min.js', corePath: root + 'core', langPath: root + 'lang', logger, workerBlobURL: false });
    onWorker(worker);
    const { data } = await worker.recognize(blob);
    return { text: data.text, confidence: data.confidence, candidates: parseOCRText(data.text) };
  } finally { await worker?.terminate(); onWorker(null); }
}
