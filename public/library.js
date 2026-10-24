export const CLASSES = {
  "assault-rifle": "Sturmgewehre",
  smg: "Maschinenpistolen",
  shotgun: "Schrotflinten",
  lmg: "Leichte MGs",
  marksman: "Präzisionsgewehre",
  sniper: "Scharfschützengewehre",
  pistol: "Handfeuerwaffen",
  launcher: "Werfer",
  melee: "Nahkampf",
};
export const SLOT_NAMES = {
  Optic: "Visier",
  Muzzle: "Mündung",
  Barrel: "Lauf",
  Underbarrel: "Unterlauf",
  Magazine: "Magazin",
  "Rear Grip": "Griff",
  Stock: "Schaft",
  Laser: "Laser",
  Ammunition: "Munition",
  Comb: "Wangenauflage",
  Bolt: "Verschluss",
  Guard: "Handschutz",
  "Fire Mods": "Feuermodifikation",
  Trigger: "Abzug",
};
export const currentTier = (weapon, patch) =>
  weapon.tierRevision === patch ? weapon.tier : null;
export const camoKey = (weaponId, camoId) => `${weaponId}:${camoId}`;
export function weaponProgress(weapon, progress) {
  if (!weapon.camos.length)
    return { known: false, total: 0, completed: 0, percent: null, started: 0 };
  const counts = weapon.camos.map(
    (c) => progress.entries[camoKey(weapon.id, c.id)] || 0,
  );
  return {
    known: true,
    total: counts.length,
    completed: counts.filter((v, i) => v >= weapon.camos[i].target).length,
    started: counts.filter((v, i) => v > 0 && v < weapon.camos[i].target)
      .length,
    percent:
      (counts.reduce(
        (sum, v, i) => sum + Math.min(1, v / weapon.camos[i].target),
        0,
      ) /
        counts.length) *
      100,
  };
}
export function camoCategory(camo) {
  if (/military/.test(camo.id)) return "military";
  if (/mastery|pyroclast/.test(camo.id)) return "mastery";
  if (/gold|platinum|harmonic|divergence|completionist/.test(camo.id))
    return "completionist";
  return "special";
}
export function prerequisitesMet(weapon, camo, progress) {
  return camo.dependsOn.every((id) => {
    const prerequisite = weapon.camos.find((c) => c.id === id);
    return (
      prerequisite &&
      (progress.entries[camoKey(weapon.id, id)] || 0) >= prerequisite.target
    );
  });
}
export function filterWeapons(
  weapons,
  {
    weaponClass = "",
    query = "",
    tier = "",
    favoritesOnly = false,
    changedOnly = false,
    progressFilter = "",
  } = {},
  context,
) {
  return weapons.filter((w) => {
    const p = weaponProgress(w, context.progress);
    return (
      (!weaponClass || w.weaponClass === weaponClass) &&
      w.name
        .toLocaleLowerCase("de")
        .includes(query.trim().toLocaleLowerCase("de")) &&
      (!tier ||
        (tier === "unknown"
          ? !currentTier(w, context.patchRevision)
          : currentTier(w, context.patchRevision) === tier)) &&
      (!favoritesOnly || context.favorites.includes(w.id)) &&
      (!changedOnly || context.changedWeaponIds.includes(w.id)) &&
      (!progressFilter ||
        (progressFilter === "unknown"
          ? !p.known
          : p.known &&
            (progressFilter === "complete"
              ? p.completed === p.total
              : progressFilter === "started"
                ? p.percent > 0 && p.completed < p.total
                : p.percent === 0)))
    );
  });
}
export function planGrind(weapons, progress, favorites = []) {
  return weapons
    .filter((w) => w.camos.length)
    .map((weapon) => {
      const stats = weaponProgress(weapon, progress);
      const next = weapon.camos.find(
        (c) =>
          (progress.entries[camoKey(weapon.id, c.id)] || 0) < c.target &&
          prerequisitesMet(weapon, c, progress),
      );
      return { weapon, stats, next, favorite: favorites.includes(weapon.id) };
    })
    .filter((item) => item.next)
    .sort(
      (a, b) =>
        b.stats.percent - a.stats.percent ||
        Number(b.favorite) - Number(a.favorite) ||
        a.weapon.name.localeCompare(b.weapon.name),
    );
}

export const PREFERENCES_KEY = "mw4-intel:preferences:v1";
export function validatePreferences(data) {
  if (
    !data ||
    data.schemaVersion !== 1 ||
    !Array.isArray(data.favorites) ||
    !data.favorites.every(
      (id) => typeof id === "string" && /^[a-z0-9-]+$/.test(id),
    )
  )
    throw new Error("Ungültige Favoritendaten");
  return { schemaVersion: 1, favorites: [...new Set(data.favorites)] };
}
export const loadPreferences = (storage) => {
  const raw = storage.getItem(PREFERENCES_KEY);
  return raw
    ? validatePreferences(JSON.parse(raw))
    : { schemaVersion: 1, favorites: [] };
};
export function savePreferences(storage, data) {
  storage.setItem(PREFERENCES_KEY, JSON.stringify(validatePreferences(data)));
}
