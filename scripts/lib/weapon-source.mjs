import { load } from "cheerio";
import { slug, hash } from "./model.mjs";
const clean = (t) => t.replace(/\s+/g, " ").trim();
// Only explicitly labelled facts from the official launch guide. No inferred effects.
export function extractWeaponFacts(html) {
  const $ = load(html),
    body = $(".article-body-container");
  if (!body.length) throw new Error("Weapon guide layout missing");
  const blocks = body.find("h2,h3,h4,p").toArray();
  const weapons = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].tagName !== "h4") continue;
    const name = clean($(blocks[i]).text());
    const texts = [];
    for (
      let j = i + 1;
      j < blocks.length && !/^h[234]$/.test(blocks[j].tagName);
      j++
    )
      texts.push(clean($(blocks[j]).text()));
    if (!texts.some((t) => /^Levels:/.test(t))) continue;
    const fact = (label) =>
      texts
        .find((t) => t.startsWith(label + ":"))
        ?.slice(label.length + 1)
        .trim() ?? null;
    const number = (label) => {
      const t = fact(label);
      return t && /^\d+$/.test(t) ? Number(t) : null;
    };
    const rate = fact("Fire Rate"),
      apexIndex = texts.findIndex((t) => /^Apex Attachment:/.test(t));
    const apexName =
      apexIndex < 0
        ? null
        : texts[apexIndex].replace(/^Apex Attachment:\s*/, "");
    const apexText =
      apexIndex < 0 ? "" : (texts.slice(apexIndex + 1).find(Boolean) ?? "");
    const blocked = apexText.match(/Blocks (.*?) Attachments?\./i)?.[1];
    const slots = fact("Attachment Types");
    const record = {
      id: slug(name),
      name,
      levels: number("Levels"),
      magazine: number("Rounds"),
      reserve: number("Reserve"),
      rpm: rate && /^\d+ RPM$/.test(rate) ? Number(rate.split(" ")[0]) : null,
      rateLabel: rate,
      slots:
        slots === "N/A" ? [] : (slots?.split(",").map((s) => s.trim()) ?? []),
      unlock: fact("Available Criteria"),
      apex:
        apexName && apexName !== "N/A"
          ? {
              id: slug(apexName),
              name: apexName,
              blocks: blocked
                ? blocked
                    .replace(/,? and /g, ", ")
                    .split(",")
                    .map((s) => s.trim())
                : [],
              descriptionHash: hash(apexText),
            }
          : null,
    };
    weapons.push(record);
  }
  if (
    !weapons.length ||
    new Set(weapons.map((w) => w.id)).size !== weapons.length
  )
    throw new Error("Official weapon facts unavailable/duplicate");
  return weapons;
}
