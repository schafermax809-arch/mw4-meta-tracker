export const $ = (selector) => document.querySelector(selector);
export function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined && text !== null) el.textContent = text;
  if (className) el.className = className;
  return el;
}
const paths = {
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  target:
    '<circle cx="12" cy="12" r="7"/><path d="M12 1v6m0 10v6M1 12h6m10 0h6"/>',
  camo: '<path d="m12 2 8 4v7c0 4-4 7-8 9-4-2-8-5-8-9V6z"/><path d="m8 8 8 8m-8 0 8-8"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  copy: '<rect x="8" y="8" width="12" height="13"/><path d="M15 8V3H3v13h5"/>',
  optic: '<path d="M3 17h18v3H3zM7 16V9a5 5 0 0 1 10 0v7M9 9h6m-3-3v7"/>',
  muzzle:
    '<rect x="3" y="8" width="18" height="8"/><path d="M6 10v4m4-4v4m4-4v4m4-4v4"/>',
  barrel: '<path d="M2 11h20v3H2zm5 0V8m12 3V9"/>',
  grip: '<path d="M4 7h16l-1 5h-5l1 8h-5l-1-8H4z"/>',
  magazine: '<path d="M8 3h9l-1 10-4 8H5l3-9zM10 6h4m-5 5h5m-6 5h5"/>',
  stock: '<path d="M3 10h11l5-5h3v15h-3l-5-5H3zm14 1h3"/>',
  ammo: '<path d="M6 21V8l2-5 2 5v13zm8 0V8l2-5 2 5v13z"/>',
  laser: '<path d="M3 9h10v7H3zm10 3h8m-5-4 4-3m-4 11 4 3"/>',
  build:
    '<path d="m4 4 5 1 1 5-6-6m6 6 10 10M18 3l-4 4 3 3 4-4a5 5 0 0 1-6 7L7 21l-4-4 8-8a5 5 0 0 1 7-6z"/>',
};
export function icon(name) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = paths[name] || paths.target;
  return el;
}
export function button(text, handler, className = "button", iconName = null) {
  const el = node("button", null, className);
  if (iconName) el.append(icon(iconName));
  el.append(node("span", text));
  el.addEventListener("click", handler);
  return el;
}
export function external(text, url, className = "") {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("Unsichere Quelle");
  const a = node("a", text, className);
  a.href = u.href;
  a.target = "_blank";
  a.rel = "noreferrer";
  return a;
}
export function date(
  value,
  options = { day: "2-digit", month: "2-digit", year: "numeric" },
) {
  return value
    ? new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin",
        ...options,
      }).format(new Date(value))
    : "Unbekannt";
}
export function empty(title, description, action = null) {
  const el = node("div", null, "grid-empty");
  el.append(icon("target"), node("h3", title), node("p", description));
  if (action) el.append(action);
  return el;
}
export function notice(text, error = false) {
  const el = node("div", null, `inline-notice${error ? " error" : ""}`);
  el.append(icon("info"), node("p", text));
  return el;
}
let toastTimeout;
export function toast(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ($("#toast").hidden = true), 4500);
}
export function download(name, data) {
  const a = node("a");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
