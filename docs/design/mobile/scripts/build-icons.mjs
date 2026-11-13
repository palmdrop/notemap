// Builds one SVG sprite per icon set into icons/, and icons/sets.json, from the
// `@iconify-json/<prefix>` packages. The sprites are committed, so the prototype never needs them.
//
//   npm install --prefix /tmp/iconify-json @iconify-json/{mdi-light,ph,lucide,tabler,iconoir,pixelarticons,pixel,pepicons-print,pepicons-pencil,carbon}
//   node scripts/build-icons.mjs [/tmp/iconify-json/node_modules/@iconify-json]
//
// A role (the name the markup uses, `#i-<role>`) maps to candidate names per set; the first
// the set has is taken. Roles a set lacks are listed in sets.json under `missing`.

import { readFile, writeFile } from "node:fs/promises";

const source = process.argv[2] ?? "/tmp/iconify-json/node_modules/@iconify-json";
const load = async (prefix, file) => JSON.parse(await readFile(`${source}/${prefix}/${file}`, "utf8"));

const sets = {
  "mdi-light": { label: "Material Design Light" },
  "ph-light": { label: "Phosphor Light", prefix: "ph", suffix: "-light" },
  "ph-thin": { label: "Phosphor Thin", prefix: "ph", suffix: "-thin" },
  lucide: { label: "Lucide" },
  tabler: { label: "Tabler" },
  iconoir: { label: "Iconoir" },
  pixelarticons: { label: "Pixelarticons" },
  pixel: { label: "Pixel Icon Library" },
  "pepicons-print": { label: "Pepicons Print" },
  "pepicons-pencil": { label: "Pepicons Pencil" },
  carbon: { label: "Carbon" },
};

const roles = {
  menu: ["menu", "list", "hamburger", "navigation-menu", "bars"],
  plus: ["plus", "add", "add-large"],
  close: ["close", "x", "xmark", "close-large", "times"],
  back: ["arrow-left", "chevron-left", "nav-arrow-left"],
  next: ["arrow-right", "chevron-right", "nav-arrow-right", "angle-right"],
  more: ["dots-vertical", "dots-three-vertical", "more-vertical", "ellipsis-vertical", "overflow-menu-vertical", "more-vert", "ellipses-vertical", "dots-y"],
  settings: ["settings", "cog", "gear", "gear-six"],
  bell: ["bell", "notification"],
  tag: ["tag", "label"],
  link: ["link", "link-variant", "link-simple", "chain"],
  image: ["image", "photo", "media-image"],
  attach: ["paperclip", "attachment", "attach"],
  search: ["magnify", "search", "magnifying-glass", "loop"],
  filter: ["filter", "funnel", "filter-list", "adjustments-horizontal", "sliders-horizontal", "sliders", "sort", "sort-ascending"],
  trash: ["trash", "trash-2", "trash-can", "delete", "bin"],
  hand: ["hand", "hand-stop", "hand-palm", "hand-grab", "hand-finger", "hand-open"],
  route: ["route", "arrow-right-circle", "send", "path", "arrow-bend-up-right", "paper-plane"],
  up: ["chevron-up", "angle-up", "nav-arrow-up", "caret-up"],
  down: ["chevron-down", "angle-down", "nav-arrow-down", "caret-down"],
  chevron: ["chevron-right", "angle-right", "nav-arrow-right", "caret-right"],
  "chevron-left": ["chevron-left", "angle-left", "nav-arrow-left", "caret-left"],
  camera: ["camera", "photo-camera"],
  check: ["check", "checkmark"],
  undo: ["undo", "arrow-counter-clockwise", "undo-2", "arrow-u-up-left", "undo-variant", "arrow-back-up"],
  folder: ["folder"],
  file: ["file", "file-document", "document", "file-text", "page", "empty-page"],
  cloud: ["cloud"],
  grid: ["view-grid", "grid", "layout-grid", "squares-four", "grid-3x3", "view-module", "dashboard"],
  calendar: ["calendar", "calendar-alt"],
  clock: ["clock", "time"],
  edit: ["pencil", "edit", "edit-pencil", "pen"],
  capture: ["tray-arrow-down", "inbox-arrow-down", "inbox-in", "inbox", "arrow-bar-to-down", "download"],
  copy: ["copy", "content-copy", "copy-simple", "documents", "duplicate", "clipboard"],
  queue: ["playlist", "queue-list", "list-numbered", "format-list-numbered", "list-ordered", "list-numbers", "bullet-list", "list"],
  feed: ["newspaper", "news", "view-agenda", "rss"],
  log: ["history", "scroll", "list-details", "receipt", "script", "clock"],
};

// Drawn here, in the weight of the set that lacks them, so a missing role is not a blank.
const drawn = {
  "mdi-light": {
    close: '<path fill="currentColor" d="m5.7 5 6.3 6.3L18.3 5l.7.7-6.3 6.3 6.3 6.3-.7.7-6.3-6.3L5.7 19l-.7-.7 6.3-6.3L5 5.7z"/>',
    filter: '<path fill="currentColor" d="M4 7h16v1H4zm3 4.5h10v1H7zm3 4.5h4v1h-4z"/>',
  },
};

const out = {};
for (const [id, set] of Object.entries(sets)) {
  const prefix = set.prefix ?? id;
  const suffix = set.suffix ?? "";
  const data = await load(prefix, "icons.json");
  const all = new Set([...Object.keys(data.icons), ...Object.keys(data.aliases ?? {})]);
  const chosen = {};
  const missing = [];
  for (const [role, names] of Object.entries(roles)) {
    const hit = names.map((n) => n + suffix).find((n) => all.has(n));
    if (hit) chosen[role] = hit;
    else if (!drawn[id]?.[role]) missing.push(role);
  }
  const resolve = (name) => data.icons[name] ?? data.icons[data.aliases?.[name]?.parent];
  const symbols = Object.entries(chosen).map(([role, name]) => {
    const icon = resolve(name);
    const w = icon.width ?? data.width ?? 16;
    const h = icon.height ?? data.height ?? 16;
    return `<symbol id="i-${role}" viewBox="${icon.left ?? 0} ${icon.top ?? 0} ${w} ${h}">${icon.body}</symbol>`;
  });
  for (const [role, body] of Object.entries(drawn[id] ?? {}))
    if (!chosen[role]) symbols.push(`<symbol id="i-${role}" viewBox="0 0 24 24">${body}</symbol>`);
  await writeFile(`icons/${id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join("\n")}\n</svg>\n`);
  const meta = await load(prefix, "info.json");
  out[id] = { label: set.label, licence: meta.license.title, author: meta.author.name, url: meta.author.url, missing };
  console.log(id.padEnd(14), meta.license.title.padEnd(24), missing.length ? "missing: " + missing.join(", ") : "");
}
await writeFile("icons/sets.json", JSON.stringify(out, null, 2) + "\n");
