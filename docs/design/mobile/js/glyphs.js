// Glyphs no icon set has a role for yet, drawn inline. `?offline` is read here too, since every
// page that shows reach needs both.

const stroke = (body, extra = "") =>
  `<svg class="i"${extra} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const glyph = {
  cloudOff: stroke(`<path d="M3 3l18 18M18 18H7a4 4 0 0 1-.9-7.9A6 6 0 0 1 8 6.4M11 5.1A6 6 0 0 1 17.9 10 3.5 3.5 0 0 1 20 16.6"/>`),
  lock: stroke(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`),
  link: stroke(`<path d="M9 15l6-6M11 6l.46-.54a5 5 0 0 1 7.07 7.07L18 13M13 18l-.4.53a5 5 0 0 1-7.07-7.07L6 11"/>`),
  unlock: stroke(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>`),
  unlink: stroke(`<path d="M17 22v-2M9 15l6-6M11 6l.46-.54a5 5 0 0 1 7.07 7.07L18 13M13 18l-.4.53a5 5 0 0 1-7.07-7.07L6 11M20 17h2M2 7h2M7 2v2"/>`),
  refresh: stroke(`<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>`),
  pause: stroke(`<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>`),
  template: stroke(`<path d="M6 3h12v18l-6-4-6 4z"/>`),
  circle: stroke(`<circle cx="12" cy="12" r="9"/>`, ` data-tick`),
  circleCheck: `<svg class="i" data-tick viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

export const OFFLINE = new URLSearchParams(location.search).has("offline");
if (OFFLINE) document.documentElement.dataset.offline = "";
