import { load } from 'cheerio';
import robotsParser from 'robots-parser';
import { hash, slug, CLASSES } from './model.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const clean = value => value.replace(/\s+/g, ' ').trim();
const classNames = new Map([
  ['ASSAULT RIFLES', CLASSES[0]], ['SUBMACHINE GUNS', CLASSES[1]], ['SHOTGUNS', CLASSES[2]],
  ['LIGHT MACHINE GUNS', CLASSES[3]], ['MARKSMAN RIFLES', CLASSES[4]], ['SNIPER RIFLES', CLASSES[5]],
  ['PISTOLS', CLASSES[6]], ['LAUNCHERS', CLASSES[7]], ['MELEE', CLASSES[8]]
]);
export const isGameArticle = url => /\/(?:patchnotes|blog)\//.test(new URL(url).pathname) && /(?:modern-warfare-4|modern_warfare_4)/i.test(new URL(url).pathname);
export function extractLinks(html, base, origins) {
  const $ = load(html);
  return [...new Set($('a[href]').map((_, el) => {
    try { const u = new URL($(el).attr('href'), base); u.hash = ''; u.search = ''; return origins.includes(u.origin) && isGameArticle(u.href) ? u.href : null; }
    catch { return null; }
  }).get())].sort();
}

export function parseArticle(html, url) {
  const $ = load(html);
  const title = clean($('main h1').first().text() || $('h1').first().text());
  const taggedMw4 = clean($('.article-header-container .game-tile.mw4').first().text()) === 'MW4';
  if (!title || (!/Modern Warfare\s*(?:®\s*)?4/i.test(title) && !taggedMw4)) throw new Error(`Wrong game or missing title: ${url}`);
  const body = $('.article-body-container').first();
  if (!body.length) throw new Error(`Article layout changed: ${url}`);
  body.find('script, style, nav, iframe, video, .social-share').remove();
  const blocks = body.find('h2,h3,h4,h5,p,li').toArray().filter(el => !$(el).parents('li').length).map(el => ({ tag: el.tagName, text: clean($(el).text()), el })).filter(b => b.text);
  const text = blocks.map(b => `${b.tag}:${b.text}`).join('\n');
  if (text.length < 150) throw new Error(`Empty or blocked article: ${url}`);
  const dateText = clean($('.dateline').first().text());
  const parsedDate = Date.parse(`${dateText} 12:00:00 GMT`);
  const publishedAt = Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString().slice(0, 10) : null;
  const catalog = [];
  // Only exact class labels immediately followed by a simple bullet list are machine-readable facts.
  body.find('p,h2,h3,h4,h5').each((_, el) => {
    const weaponClass = classNames.get(clean($(el).text()).toUpperCase());
    if (!weaponClass) return;
    const list = $(el).next();
    if (!list.is('ul')) return;
    for (const li of list.children('li').toArray()) {
      const name = clean($(li).text());
      if (name.length > 0 && name.length < 90 && !/[.!?]\s|:/.test(name) && !$(li).find('ul,ol').length) catalog.push({ id: slug(name), name, weaponClass });
    }
  });
  const headings = [...new Set(body.find('h2,h3,h4,h5').map((_, el) => clean($(el).text())).get())];
  // These are review signals, never invented requirements or automatic tier changes.
  const signals = {
    weapons: /weapon|attachment|balance|recoil|damage|tuning/i.test(text),
    camos: /camo|camouflage|challenge/i.test(text),
    builds: /loadout|gunsmith|build|attachment/i.test(text)
  };
  return { url, hash: hash(`${title}\n${dateText}\n${text}`), title, publishedAt, kind: new URL(url).pathname.includes('/patchnotes/') ? 'patch' : 'guide', catalog, headings: headings.filter(h => /weapon|camo|challenge|attachment|tuning/i.test(h)).slice(0, 30), signals };
}

export function createFetcher(config, fetchImpl = fetch) {
  const robots = new Map(); let requests = 0;
  async function raw(url) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !config.allowedOrigins.includes(u.origin) || u.username || u.password) throw new Error(`Source outside allowlist: ${url}`);
    if (requests++) await delay(config.requestDelayMs);
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Use Node's honest default User-Agent. No browser impersonation or anti-bot bypass.
        const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(config.timeoutMs) });
        if (response.status === 429 || response.status >= 500) {
          if (attempt < 2) { const retry = Number(response.headers.get('retry-after')); await response.body?.cancel(); await delay(Math.min(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 1500 * (attempt + 1), 10000)); continue; }
        }
        // Redirects are rejected; never follow a redirect to an unreviewed host or login page.
        if (!response.ok) throw new Error(`Source HTTP ${response.status}: ${url}`);
        const length = Number(response.headers.get('content-length'));
        if (length > config.maxBytes) throw new Error('Source too large');
        const chunks = []; let size = 0;
        for await (const chunk of response.body) { size += chunk.length; if (size > config.maxBytes) throw new Error('Source exceeds size limit'); chunks.push(chunk); }
        return Buffer.concat(chunks).toString('utf8');
      } catch (error) { lastError = error; if (attempt < 2 && (error.name === 'TimeoutError' || error instanceof TypeError)) { await delay(1000); continue; } break; }
    }
    throw new Error(`Failed source ${url}: ${lastError?.message}`, { cause: lastError });
  }
  return async url => {
    const u = new URL(url);
    if (!robots.has(u.origin)) {
      const robotsUrl = `${u.origin}/robots.txt`;
      robots.set(u.origin, robotsParser(robotsUrl, await raw(robotsUrl)));
    }
    if (robots.get(u.origin).isAllowed(url, 'node') !== true) throw new Error(`robots.txt does not allow this source: ${url}`);
    return raw(url);
  };
}

export async function collect(config, fetchPage = createFetcher(config)) {
  const urls = new Set(config.articles);
  for (const index of config.indexes) {
    const links = extractLinks(await fetchPage(index), index, config.allowedOrigins);
    // An unexpectedly empty index signals layout drift; do not silently report success.
    if (links.length === 0) throw new Error(`No MW4 links discovered; check source layout: ${index}`);
    links.filter(url => {
      const path = new URL(url).pathname;
      const parts = path.match(/\/(\d{4})\/(\d{2})\//);
      return parts && `${parts[1]}-${parts[2]}` >= config.discoveryFrom && !/call-of-duty-mobile-|-beta-/.test(path);
    }).forEach(url => urls.add(url));
  }
  if (urls.size > config.maxArticles) throw new Error('Article limit exceeded; review discovery configuration');
  const docs = [];
  for (const url of [...urls].sort()) docs.push(parseArticle(await fetchPage(url), url));
  return docs;
}
