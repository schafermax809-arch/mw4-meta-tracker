import { load } from "cheerio";
import { createFetcher } from "./sources.mjs";
import { hash } from "./model.mjs";
export function parseResearchFeed(xml, url) {
  const $ = load(xml, { xml: true }),
    items = $("item,entry").toArray();
  if (!items.length) throw new Error(`Research feed layout changed: ${url}`);
  return items.flatMap((el) => {
    const item = $(el),
      title = item.children("title").text().replace(/\s+/g, " ").trim(),
      link =
        item.children("link").attr("href") ||
        item.children("link").text().trim();
    if (!/\bMW4\b|Modern Warfare\s*4/i.test(title)) return [];
    const u = new URL(link);
    if (u.protocol !== "https:" || u.origin !== new URL(url).origin)
      throw new Error("Research link outside feed origin");
    const raw = item.children("pubDate,updated,published").first().text(),
      date = Date.parse(raw);
    if (!Number.isFinite(date)) throw new Error("Research date missing");
    return [
      {
        url: u.href,
        title,
        publishedAt: new Date(date).toISOString().slice(0, 10),
        kind: "discovery",
        hash: hash({ title, link, raw }),
      },
    ];
  });
}
export async function collectResearch(
  config,
  fetchPage = createFetcher(config),
) {
  const records = [];
  for (const feed of config.feeds)
    records.push(...parseResearchFeed(await fetchPage(feed), feed));
  for (const url of config.watch) {
    const $ = load(await fetchPage(url));
    $("script,style,nav,header,footer,aside").remove();
    const body = $("article").first();
    if (!body.length) throw new Error("Research article layout changed");
    const title = $("h1").first().text().replace(/\s+/g, " ").trim();
    if (!/MW4|Modern Warfare\s*4/i.test(title))
      throw new Error("Wrong research game");
    const text = body
      .find("h1,h2,h3,p,li")
      .toArray()
      .map((e) => $(e).text().replace(/\s+/g, " ").trim())
      .join("\n");
    if (text.length < 100) throw new Error("Empty research article");
    records.push({
      url,
      title,
      publishedAt: null,
      kind: "editorial",
      hash: hash(text),
    });
  }
  return [...new Map(records.map((r) => [r.url, r])).values()].sort((a, b) =>
    a.url.localeCompare(b.url),
  );
}
