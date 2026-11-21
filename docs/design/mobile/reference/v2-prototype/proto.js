// Round 2's clickable prototype of the phone shell (pass 3). Capture from the floating button; open an
// item; route it by a template in one tap (or one question), or by hand in steps ending on
// "Routed"; discard or mark it manual and move straight on with an undo. Plain JS, no network.
// Every level, step and sheet is a history entry, so the browser's back goes back one thing.
// Sideways swipes that start more than 24px inside the screen's edges walk items, walk steps, or
// (on a queue row) discard and mark manual; edge starts are left to the browser.
// ?accent=ink (the default) or ?accent=blue picks what the primary action is filled with; the
// menu carries the same switch.

const EDGE = 24, SWIPE = 60, ROW_COMMIT = 100;

const DESTS = {
  Vault: { icon: "folder", kind: "A folder on the server", folders: ["seeded/"], files: ["todo.md"] },
  Cloud: { icon: "cloud", kind: "A WebDAV folder", folders: ["seeded/"], files: [] },
  Board: { icon: "layout-grid", kind: "An are.na channel", channels: ["seeded", "hallway", "reading"] },
};
const TPLS = [
  { name: "Todo", icon: "file-text", dest: "Vault", place: "todo.md", ask: { q: "Which list?", options: ["Inbox", "Next", "Waiting on", "Someday"] }, out: (w) => "- [ ] " + w },
  { name: "To the vault", icon: "folder", dest: "Vault", place: "seeded/", file: true },
  { name: "To the cloud", icon: "cloud", dest: "Cloud", place: "seeded/", file: true },
  { name: "To the board", icon: "layout-grid", dest: "Board", place: "seeded" },
];
const tpl = (n) => TPLS.find((t) => t.name === n);
const trig = (t) => "route/" + t.name.toLowerCase().replace(/^to the /, "");

let n = 0;
const mk = (date, t, text, extra = {}) => ({ id: "0198f0c2-0000-7000-8000-" + String(++n).padStart(12, "0"), date, t, text, tags: [], records: [], state: "unprocessed", ...extra });
const LINK = "pages:8080 · A placeholder page";
const items = [
  mk("2026-08-01", "11:01", "the reading list is a graveyard, not a plan", { link: LINK }),
  mk("2026-08-01", "11:02", "check whether the sweeper races a capture that names the asset", { link: LINK }),
  mk("2026-08-01", "11:07", "the whiteboard, before anyone rubbed it out", { pic: true }),
  mk("2026-10-30", "13:58", "call the plumber about the kitchen tap before friday"),
  mk("2026-10-30", "13:58", "pasta from Lena's: anchovies, lemon zest, chili flakes, lots of parsley. Toast the breadcrumbs in the anchovy oil first."),
  mk("2026-10-30", "13:58", "idea: a bike rack that folds flat into the hallway wall", { tags: ["home"] }),
  mk("2026-10-30", "13:58", "the map is not the territory — Korzybski, via the talk on Thursday"),
  mk("2026-10-30", "13:58", "renew the library card", { link: LINK }),
  mk("2026-10-30", "13:58", "a sentence overheard on the tram: 'it is not a shortcut if you have to remember it'"),
];
const DAYS = { "2026-08-01": "Saturday", "2026-10-30": "Friday", "2026-10-31": "Saturday" };
const TODAY = "2026-10-31";
const byId = (id) => items.find((i) => i.id === id);
const queue = () => items.filter((i) => i.state === "unprocessed");
const events = [];          // what the log shows
const dec = {};             // the decision being made, per item
let snack = null;           // { html, sub, act: { label, icon, a, x }, secs }
let snackTimer = 0;
let firing = null;          // a template chosen at capture, counting down its window
let capDraft = { text: "", tpl: null, list: null };
let askPick = null;         // the answer chosen in a template's question, before it routes
let otwShut = false;        // the "on its way" section folded
const DELIVERY_MS = 3000;
let after = null;           // what to do once a history.go has landed

const app = document.getElementById("app");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const now = () => new Date().toTimeString().slice(0, 5);
// What the daemon proposes today (packages/output-markdown): the first line, cut at 60, anything
// that is not a letter, digit, space, dot, underscore or dash made a dash, the ends trimmed.
const fileName = (text, fallback = "capture") => {
  const flat = text.trim().split("\n")[0].slice(0, 60).split(/[/\\]/).join(" ").replace(/[^\p{L}\p{N} ._-]/gu, "-");
  return (flat.replace(/^[-.\s]+/, "").replace(/[-.\s]+$/, "") || fallback) + ".md";
};
// A long path keeps its head and its file name, and gives up the middle.
const midpath = (path) => {
  let tail = path.split("/").pop();
  if (tail.length > 24) tail = tail.slice(-15);
  return `<span class="midpath"><span class="h">${esc(path.slice(0, path.length - tail.length))}</span><span class="t">${esc(tail)}</span></span>`;
};
const ic = (name, cls = "") => `<svg class="i${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const log = (icon, cls, k, it) => events.unshift({ t: now(), icon, cls, k, d: it.text });

// ---------------------------------------------------------------- history

const hashOf = (s) => {
  const base = s.v === "queue" ? "#/" : s.v === "feed" ? "#/feed" : s.v === "log" ? "#/log" : s.v === "settings" ? "#/settings"
    : s.v === "capture" ? "#/capture" : s.v === "item" ? `#/items/${s.id}` : s.v === "step" ? `#/items/${s.id}/route/${s.s}` : `#/items/${s.id}/routed`;
  return s.o ? `${base}?${s.o}` : base;
};
const state = () => history.state || { v: "queue" };
function push(s) { history.pushState(s, "", hashOf(s)); render(); }
function replace(s) { history.replaceState(s, "", hashOf(s)); render(); }
function back(k = 1, then = null) { after = then; history.go(-k); }
const overlay = (o, extra = {}) => push({ ...state(), o, ...extra });
addEventListener("popstate", () => { render(); if (after) { const f = after; after = null; f(); } });

// ---------------------------------------------------------------- fragments

const B = (act, inner, x = "", cls = "", label = "") => `<button class="${cls}" data-a="${act}" data-x="${esc(x)}"${label ? ` aria-label="${esc(label)}"` : ""}>${inner}</button>`;
const appbar = (title, count, right = "") => `<header class="appbar">${B("menu", ic("menu"), "", "ibtn", "Open the menu")}<div class="title">${title}${count != null ? `<span class="count">${count}</span>` : ""}</div>${right}</header>`;
const VIEWBTN = B("later", ic("sliders-horizontal"), "The view sheet", "ibtn", "View: order and filters");
const BELLBTN = B("later", ic("bell"), "Notices", "ibtn", "Notices");
const fab = () => B("capture", ic("plus") + "Capture", "", "fab");

function opt({ a, x = "", name, sub = "", icon = null, end = "chev", on = false, tile = "" }) {
  const t = icon ? `<span class="tile ${tile}">${ic(icon)}</span>` : "";
  const e = end === "chev" ? `<span class="end"><span class="chev">${ic("chevron-right")}</span></span>`
    : end === "go" ? `<span class="end"><span class="chev">${ic("arrow-right")}</span></span>`
    : end === "radio" ? `<span class="end"><span class="radio"></span></span>`
    : end ? `<span class="end">${end}</span>` : "<span></span>";
  return `<button class="opt${icon ? "" : " no-tile"}${on ? " on" : ""}" data-a="${a}" data-x="${esc(x)}">${t}<span><span class="name">${name}</span>${sub ? `<span class="sub">${sub}</span>` : ""}</span>${e}</button>`;
}
const glabel = (t, nn = "") => `<div class="glabel"><span>${t}</span><span class="n">${nn}</span></div>`;
const sheet = (title, sub, body, foot = "") => `<div class="veil" data-a="close"></div><div class="sheet" role="dialog"><div class="grip"><span></span></div>
  <div class="sh"><div class="t"><b>${title}</b>${sub ? `<span>${sub}</span>` : ""}</div>${B("close", ic("x"), "", "ibtn", "Close")}</div><div class="body">${body}</div>${foot ? `<div class="foot">${foot}</div>` : ""}</div>`;

function snackHtml(where = "") {
  if (!snack) return "";
  const a = snack.act ? B(snack.act.a, (snack.act.icon ? ic(snack.act.icon, "sm") : "") + snack.act.label, snack.act.x || "", "act") : "";
  return `<div class="snack ${where}" id="snack" role="status"><div class="say">${snack.html}${snack.sub ? `<span class="sub">${esc(snack.sub)}</span>` : ""}</div>${a}</div>`;
}
const floor = () => `<div class="floor" id="floor">${fab()}${snackHtml()}</div>`;

// On its way: a template counting down its window, and deliveries not yet landed. Shown at the
// head of the queue while there is any, folded or open, and gone when there is none.
function onItsWay() {
  const rows = [];
  if (firing) rows.push(`<div class="or">${ic("route", "sm")}<span class="x"><b>${esc(byId(firing.id).text)}</b><span>${esc(firing.tpl)}${firing.list ? " · " + esc(firing.list) : ""} · in <span class="secs" id="secs">${firing.secs}s</span></span></span>${B("cancelfire", "Cancel", "", "tbtn")}</div>`);
  for (const it of items) for (const r of it.records) if (r.state === "delivering")
    rows.push(`<div class="or">${ic("loader-circle", "sm")}<span class="x"><b>${esc(it.text)}</b><span>${esc(r.dest)} · delivering</span></span>${B("canceldelivery", "Cancel", it.id, "tbtn")}</div>`);
  if (!rows.length) return "";
  return `<section class="otw${otwShut ? " shut" : ""}" id="otw">${B("otw", `${ic("loader-circle", "sm")}On its way<span class="n">${rows.length}</span>${ic("chevron-down", "sm")}`, "", "oh")}${rows.join("")}</section>`;
}
function say(html, sub, act) {
  snack = { html, sub, act };
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { snack = null; const el = document.getElementById("snack"); if (el) el.remove(); }, 8000);
}

function placeOf(it, d) {
  if (d.via === "tpl") { const t = tpl(d.tpl); return `${t.dest} · ${t.file ? t.place + it.id + ".md" : t.place}${d.list ? " · under " + d.list : ""}`; }
  if (d.dest === "Board") return `Board · ${d.channel || ""}`;
  if (d.append) return `${d.dest} · ${d.folder === "/" ? "" : d.folder}${d.append}`;
  return `${d.dest} · ${d.folder === "/" ? "" : d.folder}${d.name}`;
}
const output = (it, d) => { const w = d.words ?? it.text; return d.via === "tpl" && tpl(d.tpl).out ? tpl(d.tpl).out(w) : w; };

// ---------------------------------------------------------------- lists

function rowHtml(it, swipe) {
  const meta = [];
  if (it.link) meta.push(`<span style="min-width:0;flex:1 1 100%">${ic("link", "sm")}<span class="ell">${it.link}</span></span>`);
  if (it.pic) meta.push(`<span>${ic("image", "sm")}picture</span>`);
  for (const t of it.tags) meta.push(`<span class="tagword${t.startsWith("route/") ? " trig" : ""}">${esc(t)}</span>`);
  if (it.went) meta.push(it.went);
  const r = `<a class="row" data-a="open" data-x="${it.id}"><span class="time">${it.t}</span><span class="text">${esc(it.text)}</span>${it.pic ? '<div class="thumb hatch"></div>' : ""}${meta.length ? `<div class="meta">${meta.join("")}</div>` : ""}</a>`;
  if (!swipe) return r;
  return `<div class="swipe-wrap" data-row="${it.id}"><div class="under right">${ic("hand")}Manual</div><div class="under left">Discard${ic("trash-2")}</div>${r}</div>`;
}
function grouped(list, swipe, went = false) {
  const groups = {};
  for (const it of list) (groups[it.date] ||= []).push(it);
  return Object.entries(groups).map(([date, rows]) =>
    `<div class="day"><span>${DAYS[date] || ""} · <span class="num">${date}</span></span><span class="n">${rows.length}</span></div>` +
    rows.map((it) => rowHtml(went ? { ...it, went: wentLine(it) } : it, swipe)).join("")).join("");
}
function wentLine(it) {
  if (it.state === "discarded") return `<span class="st mute">${ic("trash-2", "sm")}Discarded</span>`;
  if (it.state === "manual") return `<span class="st mute">${ic("hand", "sm")}Manual</span>`;
  const r = it.records[it.records.length - 1];
  if (!r) return "";
  return r.state === "delivered" ? `<span class="st ok">${ic("circle-check", "sm")}${midpath(r.where)}</span>` : `<span class="st wait">${ic("loader-circle", "sm")}${esc(r.dest)} · delivering</span>`;
}

function vQueue() {
  const q = queue();
  const body = q.length ? grouped(q, true)
    : `<div class="empty"><span class="mark">${ic("circle-check")}</span><h1>The queue is empty</h1><p>Everything has gone where it lives. New captures land here.</p></div>`;
  return appbar("Queue", q.length, VIEWBTN + BELLBTN) + `<div class="scroll under-fab" id="list">${onItsWay()}${body}</div>` + floor();
}
function vFeed() {
  const all = [...items].reverse();
  return appbar("Feed", all.length, VIEWBTN + BELLBTN) + `<div class="scroll under-fab">${grouped(all, false, true)}</div>` + floor();
}
function vLog() {
  const rows = events.length ? `<div class="trail">${events.map((e) => `<div class="ev"><span class="ico ${e.cls}">${ic(e.icon)}</span><span><span class="k">${esc(e.k)}</span><span class="d" style="display:block">${esc(e.d)}</span></span><span class="t">${e.t}</span></div>`).join("")}</div>`
    : `<div class="empty"><span class="mark">${ic("scroll-text")}</span><h1>Nothing yet</h1><p>Capture, route or discard something and it is written here.</p></div>`;
  return appbar("Log", null, BELLBTN) + `<nav class="tabs"><a class="on">Everything</a><a>Routing</a><a>Captures</a>${B("later", "More" + ic("chevron-down", "sm"), "Classification and Pool", "more")}</nav><div class="scroll">${rows}</div>`;
}
function vSettings() {
  const r = (name, sub, icon) => opt({ a: "later", x: name, name, sub, icon, tile: "mute" });
  return appbar("Settings", null, BELLBTN) + `<div class="scroll">${glabel("Routing")}${r("Destinations", "Vault, Cloud, Board", "hard-drive")}${r("Templates", "4 saved routes", "route")}
    ${glabel("This server")}${r("Accounts", "", "users")}${r("Access", "Tokens", "key-round")}${r("Server", "v0.15.0 · online", "server")}${r("Pool settings", "Unfurl links", "sliders-vertical")}
    ${glabel("This device")}${r("Appearance", "Light", "palette")}${r("Sign out", "Signed in as admin", "log-out")}</div>`;
}
function drawer(on) {
  const a = (k, icon, label, nn = "") => `<button class="${k === on ? "on" : ""}" data-a="go" data-x="${k}">${ic(icon)}${label}<span class="n">${nn}</span></button>`;
  return `<div class="veil" data-a="close"></div><aside class="drawer" aria-label="Menu"><div class="dh"><div class="mark">notemap</div><div class="st ok" style="margin-top:6px">${ic("circle-dot", "sm")}Online</div></div>
    <nav>${a("queue", "inbox", "Queue", queue().length)}${a("feed", "newspaper", "Feed", items.length)}${a("log", "scroll-text", "Log")}${a("settings", "settings", "Settings")}</nav>
    <div class="df"><div style="margin-bottom:6px">Accent, for this prototype</div><div class="seg">${["ink", "blue"].map((k) => `<button class="${accent() === k ? "on" : ""}" data-a="accent" data-x="${k}">${k === "ink" ? "Ink" : "Blue"}</button>`).join("")}</div><div style="margin-top:12px">Signed in as admin</div></div></aside>`;
}

// ---------------------------------------------------------------- capture

function vCapture(s) {
  const chosen = capDraft.tpl ? `<div class="chosen"><span class="token">${ic("route", "sm")}${esc(capDraft.tpl)}${capDraft.list ? " · " + esc(capDraft.list) : ""}${B("capuntpl", ic("x", "sm"), "", "", "Remove the template")}</span></div>` : "";
  let sh = "";
  if (s.o === "tpl") sh = sheet("Route on capture", "It routes by itself once captured, after a few seconds to cancel in",
    TPLS.map((t) => opt({ a: "captpl", x: t.name, name: t.name, sub: `${t.dest} · ${t.place}${t.ask ? " · asks which list" : ""}`, icon: t.icon, end: t.ask ? "chev" : "", on: capDraft.tpl === t.name })).join(""));
  if (s.o === "ask") { const t = tpl(s.t); sh = sheet(`${t.name} · ${t.ask.q}`, `Adds a task to ${t.dest} · ${t.place}`, t.ask.options.map((o) => opt({ a: "capask", x: o, name: o, end: "radio", on: capDraft.list === o })).join("")); }
  return `<header class="appbar">${B("back", ic("x"), "", "ibtn", "Close, keeping the draft")}<div class="title md">Capture</div></header>
    <div class="capbox"><textarea class="text" id="captext" aria-label="What to capture" placeholder="Anything worth keeping">${esc(capDraft.text)}</textarea></div>${chosen}
    <div class="captools">${B("captplsheet", ic("route", "sm") + "Template", "", "tool")}${B("later", ic("tag", "sm") + "Tag", "Tagging at capture", "tool")}${B("later", ic("paperclip", "sm") + "Attach", "The file picker", "tool")}
    ${B("docapture", "Capture" + ic("arrow-right"), "", "btn primary go")}</div>${sh}`;
}

// ---------------------------------------------------------------- the item

function vItem(s) {
  const it = byId(s.id), q = queue(), i = q.indexOf(it);
  const pos = i >= 0 ? `${B("walk", ic("chevron-left"), "-1", "ibtn", "Previous item")}<span class="pos">${i + 1} of ${q.length}</span>${B("walk", ic("chevron-right"), "1", "ibtn", "Next item")}` : "";
  const tags = `<div class="tags">${ic("tag", "sm")}${it.tags.map((t) => `<span class="tagword${t.startsWith("route/") ? " trig" : ""}">${esc(t)}</span>`).join("")}${B("later", ic("plus", "sm") + "Add tag", "Tagging", "tbtn")}</div>`;
  const state = it.state === "discarded" ? `<p class="st mute" style="margin-top:12px">${ic("trash-2", "sm")}Discarded. It stays in the feed.</p>` : it.state === "manual" ? `<p class="st mute" style="margin-top:12px">${ic("hand", "sm")}Marked manual.</p>` : "";
  const recs = it.records.length ? glabel("Routed to", it.records.length + (it.records.length > 1 ? " records" : " record")) + it.records.map((r) => opt({ a: "noop", name: esc(r.dest), sub: midpath(r.where.slice(r.dest.length + 3)) + (r.tpl ? `by ${esc(r.tpl)} · ` : "") + (r.state === "delivered" ? `<span class="st ok">${ic("check", "sm")}Delivered ${r.at}</span>` : `<span class="st wait">${ic("loader-circle", "sm")}Delivering…</span>`), icon: DESTS[r.dest].icon, end: "" })).join("") : "";
  const ROUTE_END = `<span class="tbtn">${ic("route", "sm")}Route</span>`;
  const tplRows = glabel("Route with a template") + TPLS.map((t) => opt({ a: "usetpl", x: t.name, name: t.name, sub: `${t.dest} · ${t.place}${t.ask ? " · asks which list" : ""}`, icon: t.icon, end: t.ask ? "chev" : ROUTE_END })).join("");
  let sh = "";
  if (s.o === "ask") {
    const t = tpl(s.t);
    sh = sheet(`${t.name} · ${t.ask.q}`, `Adds a task to ${t.dest} · ${t.place}`,
      t.ask.options.map((o) => opt({ a: "tplanswer", x: o, name: o, end: "radio", on: askPick === o })).join(""),
      B("tplsteps", "Check first", "", "btn") + (askPick ? B("tplroute", ic("route") + "Route to " + esc(askPick), "", "btn primary") : `<span class="btn primary off">${ic("route")}Route</span>`));
  }
  if (s.o === "more") sh = sheet("More", "", ["Edit the capture|pencil", "Copy the words|copy", "History|history", "Copy its address|link"].map((r) => { const [nm, icn] = r.split("|"); return opt({ a: "later", x: nm, name: nm, icon: icn, tile: "mute", end: "" }); }).join(""));
  const primary = it.records.length ? B("route", "Route again", "", "btn primary") : B("route", ic("route") + "Route", "", "btn primary");
  return `<header class="appbar">${B("back", ic("arrow-left"), "", "ibtn", "Back")}<div class="spacer"></div>${pos}${B("more", ic("ellipsis-vertical"), "", "ibtn", "More")}</header>
    <div class="scroll swipe"><div class="slide"><article class="item"><div class="stamp">${ic("clock", "sm")}${DAYS[it.date] || ""} ${it.date} · ${it.t}</div><div class="words"><p>${esc(it.text)}</p></div>
      ${it.link ? `<div class="card"><div class="im hatch"></div><div style="min-width:0"><div class="site">${ic("link", "sm")}pages:8080</div><div class="ttl">A placeholder page</div><div class="desc">Every path on this server answers with the same page.</div></div></div>` : ""}
      ${it.pic ? '<div class="pic hatch"></div>' : ""}${tags}${state}</article>${recs}${tplRows}<div style="height:16px"></div></div></div>
    ${snackHtml("over-bar")}<div class="actionbar">${B("discard", ic("trash-2") + "Discard", "", "btn danger")}${B("manual", ic("hand") + "Manual", "", "btn")}${primary}</div>${sh}`;
}

// ---------------------------------------------------------------- a route in steps

function stepNames(d) {
  if (d.via === "tpl") return tpl(d.tpl).ask ? ["where", "list", "check"] : ["where", "check"];
  return ["where", "place", "check"];
}
const LABEL = { where: "Where", place: "Place", list: "List", check: "Check" };
function stepper(id, cur) {
  const d = dec[id] || {}, names = d.via ? stepNames(d) : ["where", "place", "check"], depth = names.indexOf(cur);
  const val = (nm) => nm === "where" ? (d.tpl || d.dest || "") : nm === "list" ? (d.list || "") : nm === "place" ? (d.dest === "Board" ? d.channel || "" : d.append || d.name || "") : "";
  return `<nav class="stepper" aria-label="Steps">` + names.map((nm, i) => {
    const cls = i === depth ? "now" : i < depth ? "done" : "later";
    const inner = `<span class="bar"></span><span class="lab">${LABEL[nm]}</span><span class="val">${i < depth ? esc(val(nm)) : "&nbsp;"}</span>`;
    return i < depth ? `<button class="done" data-a="jump" data-x="${depth - i}">${inner}</button>` : `<div class="${cls}">${inner}</div>`;
  }).join("") + `</nav>`;
}
const quote = (it) => `<div class="quote"><span>${esc(it.text)}</span></div>`;

function vStep(s) {
  const it = byId(s.id), d = dec[s.id] || {};
  const head = `<header class="appbar">${B("closeroute", ic("x"), "", "ibtn", "Close the route, back to the item")}<div class="title md">Route</div></header>` + stepper(s.id, s.s);
  const bar = (label, on, act, icon = "arrow-right") => `<div class="actionbar">${B("back", ic("arrow-left") + "Back", "", "btn")}${on ? B(act, icon === "route" ? ic("route") + label : label + ic(icon), "", "btn primary") : `<span class="btn primary off">${label}${ic(icon)}</span>`}</div>`;
  const wrap = (inner) => `<div class="scroll swipe"><div class="slide">${inner}</div></div>`;
  if (s.s === "where") {
    const sel = d.tpl || d.dest;
    return head + quote(it) + wrap(`<p class="ask">Where should it go?</p>${glabel("Destinations")}` +
      Object.entries(DESTS).map(([k, v]) => opt({ a: "pickdest", x: k, name: k, sub: v.kind, icon: v.icon, on: sel === k })).join("") +
      glabel("Templates", "routes you have saved") + TPLS.map((t) => opt({ a: "picktpl", x: t.name, name: t.name, sub: `${t.dest} · ${t.place}`, icon: t.icon, on: sel === t.name })).join("")) +
      bar(d.via === "tpl" ? (tpl(d.tpl).ask ? "List" : "Check") : "Place", !!sel, "fwd");
  }
  if (s.s === "list") {
    const t = tpl(d.tpl);
    return head + quote(it) + wrap(`<p class="ask">${t.ask.q}</p><p class="ask-sub">${t.name} adds a task to ${t.dest} · ${t.place}.</p>` +
      t.ask.options.map((o) => opt({ a: "picklist", x: o, name: o, end: "radio", on: d.list === o })).join("")) + bar("Check", !!d.list, "fwd");
  }
  if (s.s === "place") {
    if (d.dest === "Board") {
      return head + quote(it) + wrap(`<p class="ask">Which channel on Board?</p>${glabel("Channels")}` +
        DESTS.Board.channels.map((c) => opt({ a: "pickchan", x: c, name: c, sub: c === "seeded" ? "Used 2 times · last today" : "", icon: "layout-grid", on: d.channel === c })).join("")) + bar("Check", !!d.channel, "fwd");
    }
    const D = DESTS[d.dest];
    let body;
    if (d.tree) {
      body = glabel("Folder") + ["/", ...D.folders].map((f) => opt({ a: "pickfolder", x: f, name: f === "/" ? "/ (the top)" : f, sub: f === "seeded/" ? "Used 14 times" : "", icon: f === d.folder && !d.append ? "folder-open" : "folder", tile: "mute", end: "radio", on: !d.append && d.folder === f })).join("") +
        D.files.map((f) => opt({ a: "pickfile", x: f, name: f, sub: "Add to this file instead", icon: "file-text", tile: "mute", on: d.append === f })).join("");
    } else {
      body = glabel(d.folder === "/" && !d.append && !d.renamed ? "Proposed" : "Chosen") +
        opt({ a: "tree", name: d.folder === "/" ? "/ (the top)" : d.folder, sub: "Folder", icon: "folder", tile: "mute", end: `<span class="tbtn">Change</span>` });
      if (d.append) body += opt({ a: "newfile", name: d.append, sub: "Add to this file", icon: "file-text", tile: "mute", end: `<span class="tbtn">New file instead</span>` });
      else if (d.renaming) body += `<label class="flabel" for="rename">New file name</label><div class="pad"><div class="field"><input id="rename" value="${esc(d.name)}" /></div></div>`;
      else body += opt({ a: "rename", name: esc(d.name), sub: "New file", icon: "file-plus", tile: "mute", end: `<span class="tbtn">Rename</span>` });
    }
    return head + quote(it) + wrap(`<p class="ask">Where in ${d.dest}?</p>${d.tree ? "" : `<p class="ask-sub">Notemap proposes a place. Change either.</p>`}${body}`) + bar("Check", true, "fwd");
  }
  if (s.s === "check") {
    const words = d.rewording
      ? `<label class="flabel" for="reword">Words for this route</label><div class="pad"><div class="field"><textarea id="reword" rows="3">${esc(d.words ?? it.text)}</textarea></div></div><div class="pad">${B("unreword", ic("undo-2", "sm") + "Use the captured words", "", "tbtn")}</div>`
      : opt({ a: "reword", name: d.words != null ? "Words reworded" : "Words as captured", sub: "Change them for this route only", icon: "pencil", tile: "mute", end: `<span class="tbtn">Reword</span>` });
    const fixed = d.via === "tpl" ? opt({ a: "later", x: "Changing a template's place", name: `The place, as ${esc(d.tpl)} fixes it`, sub: `${tpl(d.tpl).dest} · ${tpl(d.tpl).place}`, icon: "file-text", tile: "mute", end: `<span class="tbtn">Change</span>` }) : "";
    return head + wrap(`<p class="ask">Check, then route</p><p class="ask-sub">This is what ${esc(d.via === "tpl" ? tpl(d.tpl).dest : d.dest)} will be given.</p>
      <div class="preview"><div class="ph" id="previewhead">${ic(d.append || (d.via === "tpl" && !tpl(d.tpl).file && d.dest !== "Board") ? "file-text" : "file-plus", "sm")}${esc(placeOf(it, d))}</div><div class="pb" id="previewbody">${esc(output(it, d))}</div></div>
      <div style="height:12px"></div>${words}${fixed}`) + bar("Route", true, "doroute", "route");
  }
}

function vDone(s) {
  const it = byId(s.id), r = it.records[it.records.length - 1], left = queue().length, nx = nextAfter(it);
  const st = r.state === "delivered" ? `<span class="pill ok">${ic("check", "sm")}Delivered ${r.at}</span>` : `<span class="pill wait">${ic("loader-circle", "sm")}Delivering…</span>`;
  return `<header class="appbar">${B("toqueue", ic("arrow-left"), "", "ibtn", "Back to the queue")}<div class="spacer"></div></header>
    <div class="scroll swipe"><div class="slide"><div class="outcome"><span class="mark">${ic("check")}</span><h1 id="donetitle">Routed${r.tpl ? " by " + esc(r.tpl) : ""}</h1><div class="where" id="donewhere">${esc(r.where)}</div><div class="state" id="dstate">${st}</div>
      <div class="preview"><div class="ph">${ic("file-plus", "sm")}${esc(r.where)}</div><div class="pb">${esc(r.out)}</div></div></div>
      ${opt({ a: "again", name: "Route it somewhere else too", icon: "route", tile: "mute" })}${r.tpl ? "" : opt({ a: "later", x: "Save as a template", name: "Save as a template", sub: "Do this again in one tap", icon: "bookmark-plus", tile: "mute" })}
      <div class="note">${left ? `${left} left in the queue.` : "That was the last one. The queue is empty."}</div></div></div>
    <div class="actionbar">${B("undo", ic("undo-2") + "Undo", "", "btn")}${nx ? B("next", "Next item" + ic("arrow-right"), "", "btn primary") : B("toqueue", ic("inbox") + "Back to the queue", "", "btn primary")}</div>`;
}

// ---------------------------------------------------------------- render

function render() {
  const s = state();
  const views = { queue: vQueue, feed: vFeed, log: vLog, settings: vSettings, capture: vCapture, item: vItem, step: vStep, done: vDone };
  app.innerHTML = views[s.v](s) + (s.o === "menu" ? drawer(s.v) : "");
  app.dataset.view = s.v === "step" ? "step-" + s.s : s.v;
  app.dataset.overlay = s.o || "";
  const ta = document.getElementById("captext");
  if (ta) { ta.addEventListener("input", () => (capDraft.text = ta.value)); if (!s.o) ta.focus(); }
  const rn = document.getElementById("rename");
  if (rn) { rn.addEventListener("input", () => (dec[s.id].name = rn.value)); rn.focus(); }
  const rw = document.getElementById("reword");
  if (rw) rw.addEventListener("input", () => { dec[s.id].words = rw.value; document.getElementById("previewbody").textContent = output(byId(s.id), dec[s.id]); });
}

// ---------------------------------------------------------------- deeds

function nextAfter(it) { const q = queue(); return q.find((x) => items.indexOf(x) > items.indexOf(it)) || null; }
// One-tap decisions move on: to the next item in the queue, or to the queue when none is left.
function advance(id) {
  const nx = nextAfter(byId(id));
  if (nx) replace({ v: "item", id: nx.id }); else replace({ v: "queue" });
}
function makeRecord(it, d) {
  const via = d.via === "tpl" ? tpl(d.tpl) : null;
  const rec = { dest: via ? via.dest : d.dest, where: placeOf(it, d), out: output(it, d), tpl: via ? via.name : null, state: "delivering", at: null };
  it.records.push(rec); it.state = "routed";
  if (via) it.tags.push(trig(via));
  log("circle-check", "ok", `Routed · ${rec.where}`, it);
  rec.timer = setTimeout(() => {
    rec.state = "delivered"; rec.at = now();
    const el = document.getElementById("dstate"); if (el) el.innerHTML = `<span class="pill ok">${ic("check", "sm")}Delivered ${rec.at}</span>`;
    if (state().v === "queue" && !state().o) refreshOtw();
  }, DELIVERY_MS);
  return rec;
}
function refreshOtw() {
  const list = document.getElementById("list"); if (!list) return;
  const old = document.getElementById("otw"), html = onItsWay();
  if (old) old.outerHTML = html || ""; else if (html) list.insertAdjacentHTML("afterbegin", html);
}
function unroute(it) {
  const r = it.records.pop();
  if (r) clearTimeout(r.timer);
  if (r && r.tpl) it.tags = it.tags.filter((g) => g !== trig(tpl(r.tpl)));
  it.state = it.records.length ? "routed" : "unprocessed";
}
function undoTo(id, fn) {
  return () => {
    fn(byId(id)); snack = null;
    const s = state();
    if (s.v === "item") replace({ v: "item", id }); else render();
  };
}
const undoers = {};
function offerUndo(html, it, fn) {
  undoers[it.id] = undoTo(it.id, fn);
  say(html, it.text, { label: "Undo", icon: "undo-2", a: "undodecision", x: it.id });
}
function commitTemplate(id, name, list) {
  const it = byId(id), rec = makeRecord(it, { via: "tpl", tpl: name, list });
  offerUndo(`Routed by <b>${esc(name)}</b> · ${esc(rec.where)}`, it, unroute);
}
function decide(id, kind) {
  const it = byId(id);
  it.state = kind;
  log(kind === "discarded" ? "trash-2" : "hand", "", kind === "discarded" ? "Discarded" : "Marked manual", it);
  offerUndo(kind === "discarded" ? "<b>Discarded</b> · still in the feed" : "<b>Marked manual</b> · dealt with outside notemap", it, (x) => (x.state = "unprocessed"));
}
function nextStep(id) {
  const d = dec[id], s = state(), names = stepNames(d), i = names.indexOf(s.s);
  if (i < names.length - 1) push({ v: "step", id, s: names[i + 1], d: i + 2 });
}
function canForward(id, s) {
  const d = dec[id] || {};
  if (s === "where") return !!(d.tpl || d.dest);
  if (s === "list") return !!d.list;
  if (s === "place") return d.dest === "Board" ? !!d.channel : true;
  return false; // check never routes by a swipe
}
function walkItem(dir) {
  const s = state(), q = queue(), i = q.findIndex((x) => x.id === s.id);
  if (i < 0) return;
  const j = i + dir;
  if (j >= 0 && j < q.length) replace({ v: "item", id: q[j].id });
}
function doCapture() {
  const text = (capDraft.text || "").trim();
  if (!text) return;
  const it = mk(TODAY, now(), text);
  items.push(it);
  log("inbox", "", "Captured", it);
  if (capDraft.tpl) {
    const t = tpl(capDraft.tpl);
    it.tags.push(trig(t));
    firing = { id: it.id, tpl: t.name, list: capDraft.list, secs: 15 };
    const tick = setInterval(() => {
      if (!firing || firing.id !== it.id) return clearInterval(tick);
      firing.secs--;
      const el = document.getElementById("secs"); if (el) el.textContent = firing.secs + "s";
      if (firing.secs > 0) return;
      clearInterval(tick);
      it.tags = it.tags.filter((g) => g !== trig(t));
      const rec = makeRecord(it, { via: "tpl", tpl: t.name, list: firing.list });
      firing = null;
      say(`Routed by <b>${esc(t.name)}</b> · ${esc(rec.where)}`, it.text, { label: "Open", a: "open", x: it.id });
      if (["queue", "feed"].includes(state().v) && !state().o) render();
    }, 1000);
  } else {
    say("<b>Captured</b>", it.text, { label: "Open", a: "open", x: it.id });
  }
  capDraft = { text: "", tpl: null, list: null };
  back(1);
}
function later(what) {
  say(`<b>${esc(what)}</b>: not in this prototype`);
  const old = document.getElementById("snack"); if (old) old.remove();
  const floorEl = document.getElementById("floor"), bar = app.querySelector(".actionbar");
  if (floorEl) floorEl.insertAdjacentHTML("beforeend", snackHtml());
  else if (bar) bar.insertAdjacentHTML("beforebegin", snackHtml("over-bar"));
  else app.insertAdjacentHTML("beforeend", snackHtml("over-bar"));
}

// The accent: ink unless the address or the menu says blue.
const accent = () => document.documentElement.dataset.accent || "ink";
function setAccent(k) {
  if (k === "blue") document.documentElement.dataset.accent = "blue"; else delete document.documentElement.dataset.accent;
  const url = new URL(location.href);
  if (k === "blue") url.searchParams.set("accent", "blue"); else url.searchParams.delete("accent");
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
}
setAccent(new URLSearchParams(location.search).get("accent") === "blue" ? "blue" : "ink");

// A touch acts on its own pointerup rather than waiting for the click, which a phone may hold
// back or swallow right after a swipe; the click that follows a touch is then ignored.
let tapped = 0;
app.addEventListener("click", (e) => {
  if (swiped || Date.now() - tapped < 700) return;
  act(e.target.closest("[data-a]"));
});
function act(t) {
  if (!t) return;
  const a = t.dataset.a, x = t.dataset.x, s = state();
  switch (a) {
    case "noop": return;
    case "back": case "close": return back(1);
    case "jump": return back(+x);
    case "menu": return overlay("menu");
    case "more": return overlay("more");
    case "go": return back(1, () => {
      const cur = state().v;
      if (x === cur) return;
      if (x === "queue") return cur === "queue" ? null : back(1);
      if (cur === "queue") push({ v: x }); else replace({ v: x });
    });
    case "capture": return push({ v: "capture" });
    case "open": snack = null; return push({ v: "item", id: x });
    case "walk": return walkItem(+x);
    case "toqueue": return s.v === "done" ? back(2) : back(1);
    case "route": dec[s.id] = {}; return push({ v: "step", id: s.id, s: "where", d: 1 });
    case "closeroute": return back(s.d);
    case "usetpl": {
      const t = tpl(x);
      if (t.ask) { askPick = null; return overlay("ask", { t: x }); }
      commitTemplate(s.id, x, null); return advance(s.id);
    }
    case "tplanswer": askPick = x; return render();
    case "tplroute": { const id = s.id, name = s.t, pick = askPick; askPick = null; return back(1, () => { commitTemplate(id, name, pick); advance(id); }); }
    case "tplsteps": {
      const id = s.id, name = s.t, pick = askPick; askPick = null;
      return back(1, () => {
        dec[id] = { via: "tpl", tpl: name, list: pick };
        history.pushState({ v: "step", id, s: "where", d: 1 }, "", hashOf({ v: "step", id, s: "where" }));
        push({ v: "step", id, s: "list", d: 2 });
      });
    }
    case "discard": decide(s.id, "discarded"); return advance(s.id);
    case "manual": decide(s.id, "manual"); return advance(s.id);
    case "undodecision": { const f = undoers[x]; delete undoers[x]; return f && f(); }
    case "picktpl": dec[s.id] = { via: "tpl", tpl: x }; return nextStep(s.id);
    case "pickdest": dec[s.id] = { via: "hand", dest: x, folder: "/", name: fileName(byId(s.id).text) }; return nextStep(s.id);
    case "picklist": dec[s.id].list = x; return nextStep(s.id);
    case "pickchan": dec[s.id].channel = x; return nextStep(s.id);
    case "tree": dec[s.id].tree = true; return render();
    case "pickfolder": Object.assign(dec[s.id], { folder: x, append: null, tree: false }); return render();
    case "pickfile": Object.assign(dec[s.id], { append: x, tree: false }); return render();
    case "newfile": dec[s.id].append = null; return render();
    case "rename": Object.assign(dec[s.id], { renaming: true, renamed: true }); return render();
    case "fwd": return nextStep(s.id);
    case "reword": dec[s.id].rewording = true; return render();
    case "unreword": Object.assign(dec[s.id], { rewording: false, words: null }); return render();
    case "doroute": { const id = s.id; makeRecord(byId(id), dec[id]); delete dec[id]; return back(s.d, () => push({ v: "done", id })); }
    case "next": { const nx = nextAfter(byId(s.id)); return back(1, () => (nx ? replace({ v: "item", id: nx.id }) : back(1))); }
    case "undo": unroute(byId(s.id)); return back(1);
    case "again": { const id = s.id; return back(1, () => { dec[id] = {}; push({ v: "step", id, s: "where", d: 1 }); }); }
    case "docapture": return doCapture();
    case "captplsheet": return overlay("tpl");
    case "captpl": {
      const t = tpl(x);
      if (t.ask) { capDraft.tpl = x; return replace({ ...s, o: "ask", t: x }); }
      capDraft.tpl = x; capDraft.list = null; return back(1);
    }
    case "capask": capDraft.list = x; return back(1);
    case "capuntpl": capDraft.tpl = null; capDraft.list = null; return render();
    case "cancelfire": { const it = byId(firing.id); it.tags = it.tags.filter((g) => !g.startsWith("route/")); firing = null; say("<b>Cancelled</b> · it stays in the queue", it.text); return render(); }
    case "canceldelivery": { const it = byId(x); unroute(it); log("undo-2", "", "Delivery cancelled", it); say("<b>Cancelled</b> · back in the queue", it.text); return render(); }
    case "otw": otwShut = !otwShut; return render();
    case "accent": setAccent(x); return render();
    case "later": return later(x);
  }
}

// ---------------------------------------------------------------- swipes

let start = null, swiped = false, touch = null, rowDrag = null;
app.addEventListener("pointerdown", (e) => {
  swiped = false;
  if (e.pointerType === "touch") touch = { x: e.clientX, y: e.clientY, id: e.pointerId, at: Date.now() };
  if (e.pointerType === "mouse" && e.button !== 0) return;
  if (e.clientX < EDGE || e.clientX > innerWidth - EDGE) return; // the browser's own back gesture lives there
  const s = state();
  if (s.o) return;
  if (s.v === "queue") {
    const w = e.target.closest(".swipe-wrap");
    if (w) rowDrag = { x: e.clientX, y: e.clientY, id: e.pointerId, wrap: w, on: false };
    return;
  }
  if (!["item", "step", "done"].includes(s.v)) return;
  start = { x: e.clientX, y: e.clientY, id: e.pointerId };
});
app.addEventListener("pointermove", (e) => {
  if (rowDrag && e.pointerId === rowDrag.id) {
    const dx = e.clientX - rowDrag.x, dy = e.clientY - rowDrag.y;
    if (!rowDrag.on && Math.abs(dx) > 10 && Math.abs(dx) > 1.5 * Math.abs(dy)) { rowDrag.on = true; app.classList.add("dragging"); }
    if (rowDrag.on) {
      rowDrag.wrap.querySelector(".row").style.transform = `translateX(${dx}px)`;
      rowDrag.wrap.querySelector(".under.left").style.opacity = dx < 0 ? 1 : 0;
      rowDrag.wrap.querySelector(".under.right").style.opacity = dx > 0 ? 1 : 0;
    }
    return;
  }
  if (!start || e.pointerId !== start.id) return;
  const dx = e.clientX - start.x, dy = e.clientY - start.y;
  if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
    app.classList.add("dragging");
    const el = app.querySelector(".slide"); if (el) el.style.transform = `translateX(${dx * 0.4}px)`;
  }
});
const end = (e) => {
  if (touch && e.pointerId === touch.id) {
    const still = Math.hypot(e.clientX - touch.x, e.clientY - touch.y) < 10 && Date.now() - touch.at < 800;
    touch = null;
    if (still) { const t = e.target.closest("[data-a]"); rowDrag = null; start = null; if (t) { tapped = Date.now(); e.preventDefault(); return act(t); } }
  }
  if (rowDrag && e.pointerId === rowDrag.id) {
    const dx = e.clientX - rowDrag.x, r = rowDrag; rowDrag = null; app.classList.remove("dragging");
    if (!r.on) return;
    swiped = true; setTimeout(() => (swiped = false), 350);
    const row = r.wrap.querySelector(".row");
    if (Math.abs(dx) < ROW_COMMIT) { row.style.transform = ""; r.wrap.querySelectorAll(".under").forEach((u) => (u.style.opacity = 0)); return; }
    decide(r.wrap.dataset.row, dx < 0 ? "discarded" : "manual");
    return render();
  }
  if (!start || e.pointerId !== start.id) return;
  const dx = e.clientX - start.x, dy = e.clientY - start.y;
  start = null; app.classList.remove("dragging");
  const el = app.querySelector(".slide"); if (el) el.style.transform = "";
  if (Math.abs(dx) < SWIPE || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
  swiped = true; setTimeout(() => (swiped = false), 350);
  swipe(dx < 0 ? "forward" : "backward");
};
app.addEventListener("pointerup", end);
app.addEventListener("pointercancel", () => {
  start = null; touch = null; app.classList.remove("dragging");
  if (rowDrag) { const row = rowDrag.wrap.querySelector(".row"); row.style.transform = ""; rowDrag = null; }
  const el = app.querySelector(".slide"); if (el) el.style.transform = "";
});

function swipe(dir) {
  const s = state();
  if (s.v === "item") return walkItem(dir === "forward" ? 1 : -1);
  if (s.v === "step") return dir === "forward" ? (canForward(s.id, s.s) && nextStep(s.id)) : back(1);
  if (s.v === "done") return dir === "forward" ? act({ dataset: { a: nextAfter(byId(s.id)) ? "next" : "toqueue" } }) : back(1);
}

// ---------------------------------------------------------------- the keyboard and the viewport

if (window.visualViewport) {
  const fit = () => document.documentElement.style.setProperty("--vh", visualViewport.height + "px");
  visualViewport.addEventListener("resize", fit); fit();
}
history.replaceState({ v: "queue" }, "", "#/");
render();
