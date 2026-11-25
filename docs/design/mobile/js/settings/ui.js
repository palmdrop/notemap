// The pieces settings pages are drawn from.

export const $ = (s, root = document) => root.querySelector(s);
export const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const icon = (name, cls = "") => `<svg class="i ${cls}"><use href="#i-${name}"></use></svg>`;
export const offline = new URLSearchParams(location.search).has("offline");

export const go = icon("chevron", "go");
export const row = ({ href, lead = "", name, small = "", end = "" }) =>
  `<li><a class="row${lead ? "" : " plain"}" href="${href}">${lead}<span><b>${name}</b>${small ? `<small>${small}</small>` : ""}</span>${end}</a></li>`;
export const facts = (list) => `<dl class="facts">${list.map(([name, value]) => `<div><dt>${esc(name)}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
export const box = (cls, html) => `<p class="record-state ${cls}">${html}</p>`;
export const label = (text) => `<h3 class="label">${esc(text)}</h3>`;
export const toolbar = (ways) =>
  `<div class="toolbar">${ways.map(([act, ic, text, kind = "", locked = offline]) =>
    `<button class="pill ${kind}" data-act="${act}"${locked ? " disabled" : ""}>${ic.startsWith("<svg") ? ic : icon(ic)}<span>${esc(text)}</span></button>`).join("")}</div>`;
