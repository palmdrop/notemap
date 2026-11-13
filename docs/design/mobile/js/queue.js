// The queue's interactions: the menu, the filter sheet (order and tags), the search line, the
// notices, the status line, selecting rows, and the picture viewer, which the item view opens.
// The markup is static; this shows, hides, marks and reorders it.

import { ask } from "./dialog.js";
import { OFFLINE, glyph } from "./glyphs.js";
import { KNOWN } from "./tags.js";
import { TEMPLATES } from "./templates.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const icon = (name) => `<svg class="i"><use href="#i-${name}"></use></svg>`;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function describe(item) {
  const line = $(".text", item).textContent.trim().split("\n")[0];
  if (line) return line;
  const pictures = $$(".picture, .thumb", item).length;
  if (pictures) return pictures === 1 ? "1 picture" : `${pictures} pictures`;
  return $(".files .name", item)?.textContent ?? "";
}

// What a row is going through, in words, under its text.
const STATES = {
  routing: (item) => `<p class="state-line routing"><span class="spinner"></span><span>${routingBy(item.dataset.firing, item.dataset.answer)}<span class="secs"></span></span>${OFFLINE ? "" : `<button class="quiet" data-cancel-row>Cancel</button>`}</p>`,
  refused: (item) => `<p class="state-line refused">${glyph.cloudOff}<span>Refused by the pool: ${esc(item.dataset.why)}</span></p>`,
  abandoned: (item) => `<p class="state-line abandoned">${icon("route")}<span>Rejected by <b>${esc(item.dataset.dest ?? "Vault")}</b> in ${esc(item.dataset.place ?? "projects/street/")}</span></p>`,
};

// "Routing by Todo list Next": the answer is a label and a value, never a second name.
export const routingBy = (name, answer = "") =>
  `Routing by <b>${esc(name)}</b>${answer ? ` <small>list</small> <b>${esc(answer)}</b>` : ""}`;

export function decorate(item) {
  const time = $("time", item);
  let when = time.parentElement;
  if (!when.classList.contains("when")) {
    when = document.createElement("div");
    when.className = "when";
    time.replaceWith(when);
    when.append(time);
  }
  if (!$(".tick", when)) when.insertAdjacentHTML("beforeend", `<span class="tick" aria-hidden="true">${glyph.circle}${glyph.circleCheck}</span>`);
  $(".state-line", item)?.remove();
  $(".body", item)?.insertAdjacentHTML("beforeend", STATES[item.dataset.state]?.(item) ?? "");
  for (const t of $$(".tags .trigger", item)) {
    t.dataset.tag ??= t.textContent.trim().replace(/^#/, "");
    t.title = `#${t.dataset.tag}`;
    t.innerHTML = `${icon("route")}${esc(t.dataset.tag.replace(/^route\//, ""))}`;
  }
  $(".pending-dot", item)?.remove();
  if (item.hasAttribute("data-pending")) ($(".row-face", item) ?? item).insertAdjacentHTML("afterbegin", `<span class="pending-dot" title="Waiting to send"></span>`);
  countPending();
}

export function countPending() {
  const waiting = $$("main .item[data-pending]:not([data-routed])");
  $(".drawer-pending").hidden = waiting.length === 0;
  $(".drawer-pending .n").textContent = waiting.length;
  const list = $("[data-waiting]");
  if (list) {
    list.innerHTML = waiting.map((item) => `<li class="notice"><time>${$("time", item).textContent}</time><div class="body">
      <p class="about"><span class="pending-dot"></span>${esc(describe(item))}</p></div></li>`).join("");
    list.hidden = $(".waiting-part").hidden = waiting.length === 0;
  }
  drawLine();
}

// The status line: on the left, the newest thing happening or just said; on the right, what is
// true, counted in words. It is there only while something is. The + floats clear above it, and
// stays there when it is gone. Cancelling needs the pool, so offline nothing offers it.
const flights = new Map();
let passing = null;
let passTimer = 0;

export function fly(id, flight) {
  flight.at ??= Date.now();
  flights.set(id, flight);
  drawFlights();
}
export function land(id) {
  flights.delete(id);
  drawFlights();
}
export function pass(html, { label = "", then = null, seconds = 4 } = {}) {
  passing = { html, label, then, at: Date.now() };
  clearTimeout(passTimer);
  passTimer = setTimeout(() => {
    passing = null;
    drawLine();
  }, seconds * 1000);
  drawLine();
}

function drawFlights() {
  const list = $("[data-flying]");
  if (!list) return;
  $$("[data-flight]", list).forEach((n) => n.remove());
  list.insertAdjacentHTML("afterbegin", [...flights].reverse().map(([id, f]) => `<li class="notice" data-flight="${id}"><time>${f.time}</time><div class="body">
    <p class="what"><span class="spinner"></span><span>${f.say()}${f.left?.() ? `, ${f.left()}s left` : ""}</span></p><p class="about">${esc(f.about)}</p>
    ${OFFLINE ? "" : `<div class="ways"><button class="pill" data-cancel-flight="${id}">Cancel</button></div>`}</div></li>`).join(""));
  for (const [, f] of flights) if (f.item) {
    const secs = $(".state-line .secs", f.item);
    if (secs) secs.textContent = f.left?.() ? `${f.left()}s` : "";
  }
  drawLine();
}

let marking = false;
function drawLine() {
  const line = $(".status-line");
  if (!line) return;
  const waiting = $$("main .item[data-pending]:not([data-routed])").length;
  const newest = [...flights].at(-1);
  const flying = newest && (!passing || newest[1].at > passing.at) ? newest : null;
  const left = flying?.[1].left?.();
  $(".sl-say", line).innerHTML = flying
    ? `<span class="flying"><span class="spinner"></span><span class="what">${flying[1].say()}</span>${left ? `<span class="secs">${left}s</span>` : ""}</span>`
    : passing ? `<span class="passing">${passing.html}</span>` : "";
  const counts = [];
  if (waiting) counts.push(`<span class="waiting"><span class="pending-dot"></span>${waiting} waiting</span>`);
  if (OFFLINE) counts.push(`<span class="off">${glyph.cloudOff}Offline</span>`);
  $(".sl-counts", line).innerHTML = counts.join("");
  const act = $(".sl-cancel", line);
  const offer = flying ? !OFFLINE : !!passing?.then;
  act.hidden = !offer;
  act.textContent = flying ? "Cancel" : passing?.label ?? "";
  act.dataset.flight = flying?.[0] ?? "";
  line.hidden = (!flying && !passing && counts.length === 0) || marking;
  line.classList.toggle("busy", !!(flying || passing));
}

export function cancelFlight(id) {
  const flight = flights.get(id);
  if (!flight) return;
  land(id);
  flight.cancel();
}

document.addEventListener("click", (e) => {
  const flight = e.target.closest("[data-cancel-flight]");
  if (flight) return cancelFlight(flight.dataset.cancelFlight);
  const act = e.target.closest(".sl-cancel");
  if (!act) return;
  if (act.dataset.flight) return cancelFlight(act.dataset.flight);
  const then = passing?.then;
  passing = null;
  drawLine();
  then?.();
});

// A route's window, given its own row: the row says it, the status line counts it, and the
// notices hold it with a way to cancel, all three the same flight.
export function cancelRouting(item) {
  delete item.dataset.state;
  delete item.dataset.answer;
  decorate(item);
}
for (const item of new URLSearchParams(location.search).has("empty") ? [] : $$("main .item[data-state=routing]:not([data-fresh])")) {
  fly(`row-${$("time", item).textContent}`, {
    time: $("time", item).textContent,
    about: describe(item),
    item,
    say: () => routingBy(item.dataset.firing, item.dataset.answer),
    cancel: () => cancelRouting(item),
  });
}
export function cancelRow(item) {
  const id = [...flights].find(([, f]) => f.about === describe(item))?.[0];
  if (id) cancelFlight(id);
  else cancelRouting(item);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-cancel-row]");
  if (!b) return;
  e.stopPropagation();
  cancelRow(b.closest(".item"));
}, true);

// The one popup: something that went wrong after its window closed, said at the top, once.
export function alarm(html, then = null) {
  const strip = $(".alarm-strip");
  if (!strip) return;
  $(".say", strip).innerHTML = html;
  $("[data-alarm-open]", strip).hidden = !then;
  $("[data-alarm-open]", strip).onclick = () => {
    strip.hidden = true;
    then?.();
  };
  strip.hidden = true;
  void strip.offsetWidth;
  strip.hidden = false;
  clearTimeout(alarm.timer);
  alarm.timer = setTimeout(() => (strip.hidden = true), 8000);
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-alarm-close]")) $(".alarm-strip").hidden = true;
});

// A capture saved a moment ago on the capture page: waiting to send for a few seconds, and
// routing by its template while its trigger tag's window is open.
const saved = JSON.parse(sessionStorage.getItem("nm-saved") ?? "null");
sessionStorage.removeItem("nm-saved");
if (saved) {
  const item = document.createElement("li");
  item.className = "item";
  item.dataset.tags = saved.tags.join(" ");
  item.toggleAttribute("data-pending", true);
  item.toggleAttribute("data-fresh", true);
  if (saved.firing) Object.assign(item.dataset, { state: "routing", firing: saved.firing, answer: saved.answer ?? "" });
  item.innerHTML = `<time>${saved.time}</time><div class="body"><p class="text">${esc(saved.text)}</p>
    ${saved.tags.length ? `<ul class="tags">${saved.tags.map((t) => `<li${t.startsWith("route/") ? ' class="trigger"' : ""}>#${esc(t)}</li>`).join("")}</ul>` : ""}</div>`;
  $("main .items").prepend(item);
  setTimeout(() => {
    item.removeAttribute("data-pending");
    decorate(item);
  }, 2500);
  setTimeout(() => pass(landed(item), { label: "Show", then: () => item.scrollIntoView({ block: "center" }) }));
}

// Where a new capture went, which is out of sight when the oldest come first.
export function landed(item) {
  const last = $$("main .item:not([hidden])").at(-1) === item;
  return `<span>Captured, ${last ? "at the end of the queue" : "at the top of the queue"}</span>`;
}

// Done or Discard chosen on the route page: the queue says it, with Undo, as the item view does.
const decided = JSON.parse(sessionStorage.getItem("nm-decided") ?? "null");
sessionStorage.removeItem("nm-decided");
if (decided) {
  const item = $$("main .item").find((i) => describe(i) === decided.about);
  if (item) item.dataset.routed = decided.kind;
  setTimeout(() => pass(`<span>${decided.kind === "discard" ? "Discarded" : "Done"}: <b>${esc(decided.about)}</b></span>`, {
    label: "Undo",
    seconds: 5,
    then: () => {
      if (item) delete item.dataset.routed;
      apply();
    },
  }));
}

for (const item of $$("main .item")) {
  decorate(item);
  const face = document.createElement("div");
  face.className = "row-face";
  face.append(...item.childNodes);
  item.append(face);
}
if (new URLSearchParams(location.search).has("empty")) for (const item of $$("main .item")) item.dataset.routed = "1";
// A list read a page at a time says how much is shown; out of reach, the rest waits with the pool.
const foot = $(".list-foot");
if (foot && OFFLINE) $("[data-more]", foot).replaceWith(Object.assign(document.createElement("small"), { textContent: "The rest is with the pool, out of reach." }));
foot?.addEventListener("click", (e) => {
  if (!e.target.closest("[data-more]")) return;
  $(".n", foot).textContent = "32 of 61";
  pass("<span>20 more, older</span>");
});

if (OFFLINE) {
  for (const b of $$("[data-online]")) b.remove();
  $(".drawer-foot .online")?.replaceWith(Object.assign(document.createElement("span"), { className: "offline", textContent: "offline, last answered 12:31" }));
}

// Selecting rows, for a batch: holding a row selects it, and then a tap selects more.

export function select(on, first = null) {
  marking = on;
  document.documentElement.toggleAttribute("data-marking", on);
  $(".app-bar").dataset.mode = on ? "marking" : "title";
  $(".batch-bar").hidden = !on;
  for (const item of $$("main .item.marked")) item.classList.remove("marked");
  first?.classList.add("marked");
  countMarked();
  drawLine();
}
export function countMarked() {
  const n = $$("main .item.marked:not([hidden])").length;
  $(".marked-n").textContent = `${n} selected`;
  for (const b of $$(".batch-bar .pill")) b.disabled = n === 0;
}
$("[data-mark-stop]")?.addEventListener("click", () => select(false));
$("[data-mark-all]")?.addEventListener("click", () => {
  for (const item of $$("main .item:not([hidden])")) if (!item.closest("section").hidden) item.classList.add("marked");
  countMarked();
});
$("main").addEventListener("click", (e) => {
  const tick = !marking && e.target.closest(".tick");
  if (tick) {
    e.stopImmediatePropagation();
    return select(true, tick.closest(".item"));
  }
  if (!marking || e.target.closest("a")) return;
  const item = e.target.closest(".item");
  if (!item) return;
  e.stopImmediatePropagation();
  item.classList.toggle("marked");
  countMarked();
}, true);
let hold = null;
$("main").addEventListener("pointerdown", (e) => {
  const item = e.target.closest(".item");
  if (!item || marking || e.button > 0) return;
  const at = { x: e.clientX, y: e.clientY };
  item.classList.add("holding");
  hold = { at, item, timer: setTimeout(() => {
    hold = null;
    item.classList.remove("holding");
    select(true, item);
    const swallow = (c) => {
      c.stopImmediatePropagation();
      c.preventDefault();
    };
    addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener("click", swallow, { capture: true }), 600);
  }, 550) };
});
const letGo = () => {
  if (!hold) return;
  clearTimeout(hold.timer);
  hold.item.classList.remove("holding");
  hold = null;
};
addEventListener("pointermove", (e) => hold && Math.hypot(e.clientX - hold.at.x, e.clientY - hold.at.y) > 10 && letGo());
addEventListener("pointerup", letGo);
addEventListener("pointercancel", letGo);

// Holding has nothing to show for itself, so it is said once, the first time there is a list to
// select from.
if (!localStorage.getItem("nm-held") && $$("main .item").length >= 3 && !new URLSearchParams(location.search).has("empty")) {
  localStorage.setItem("nm-held", "1");
  setTimeout(() => pass("<span>Hold a row to select several</span>", { seconds: 6 }), 1200);
}
$(".batch-bar")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-batch]");
  if (!b || b.disabled) return;
  const items = $$("main .item.marked:not([hidden])");
  if (b.dataset.batch === "route") return batchRoute(items);
  if (b.dataset.batch === "tag") return batchTags(items);
  select(false);
  if (b.dataset.batch === "undiscard") {
    for (const item of items) delete item.dataset.state;
    for (const item of items) decorate(item);
    return pass(`<b>${items.length}</b> back in the queue`);
  }
  for (const item of items) item.dataset.routed = "discard";
  apply();
  pass(`<b>${items.length}</b> discarded`, {
    label: "Undo",
    seconds: 5,
    then: () => {
      for (const item of items) delete item.dataset.routed;
      apply();
    },
  });
});

// A batch is routed by a template's trigger tag: the tag goes on every row, its question is asked
// once for all of them, and one line counts the batch's window down, with one Cancel.
const rowTags = (item) => (item.dataset.tags ?? "").split(" ").filter(Boolean);
function setRowTags(item, tags) {
  item.dataset.tags = tags.join(" ");
  $(".tags", item)?.remove();
  if (tags.length) $(".body", item).insertAdjacentHTML("beforeend",
    `<ul class="tags">${tags.map((t) => `<li${t.startsWith("route/") ? ' class="trigger"' : ""}>#${esc(t)}</li>`).join("")}</ul>`);
  decorate(item);
}

let batchItems = [];
let batchAsking = null;
function batchRoute(items) {
  batchItems = items;
  batchAsking = null;
  drawBatchRoute();
  open("batch-route");
}
function drawBatchRoute() {
  const sheet = $("#batch-route");
  $(".quick-what", sheet).textContent = `${batchItems.length} selected`;
  $(".quick-templates", sheet).innerHTML = TEMPLATES.filter((t) => t.tag).map((t) => `<li>
    <button class="row" data-batch-template="${esc(t.name)}">${icon(t.icon)}<span><b>${esc(t.name)}</b><small>${esc(t.place)} in ${esc(t.dest)}</small></span>
      ${t.ask ? `<svg class="i end"><use href="#i-${batchAsking === t.name ? "up" : "down"}"></use></svg>` : `<span class="go">Route ${batchItems.length}</span>`}</button>
    ${batchAsking === t.name ? `<ul class="answers">${t.ask.map((a) => `<li><button data-batch-answer="${esc(a)}">${esc(a)}<span class="go">Route ${batchItems.length}</span></button></li>`).join("")}</ul>` : ""}
  </li>`).join("");
}
$("#batch-route")?.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-batch-template]");
  const a = e.target.closest("[data-batch-answer]");
  if (!t && !a) return;
  const template = TEMPLATES.find((x) => x.name === (t?.dataset.batchTemplate ?? batchAsking));
  if (t && template.ask) {
    batchAsking = batchAsking === template.name ? null : template.name;
    return drawBatchRoute();
  }
  const answer = a?.dataset.batchAnswer ?? "";
  close();
  const items = batchItems;
  const already = items.filter((item) => rowTags(item).includes(template.tag)).length;
  const sure = await ask({
    title: `route ${items.length} with ${template.name.toLowerCase()}${answer ? `, list ${answer}` : ""}?`,
    text: `Each gets the ${template.tag.slice(6)} trigger tag and is routed to ${template.place} in ${template.dest}.${already ? ` ${already} already ${already === 1 ? "has" : "have"} it and ${already === 1 ? "is" : "are"} left as ${already === 1 ? "it is" : "they are"}.` : ""}`,
    ways: [{ label: "Back", value: false }, { label: `Route ${items.length}`, value: true, kind: "primary" }],
  });
  if (!sure) return;
  select(false);
  for (const item of items) {
    if (!rowTags(item).includes(template.tag)) setRowTags(item, [...rowTags(item), template.tag]);
    Object.assign(item.dataset, { state: "routing", firing: template.name, answer });
    decorate(item);
  }
  let left = 10;
  const id = `batch-${Date.now()}`;
  const flight = {
    time: new Date().toTimeString().slice(0, 5),
    about: `${items.length} items`,
    say: () => `${routingBy(template.name, answer).replace("Routing by", `Routing <b>${items.length}</b> by`)}`,
    left: () => left,
    cancel: () => {
      clearInterval(tick);
      for (const item of items) {
        delete item.dataset.state;
        setRowTags(item, rowTags(item).filter((t) => t !== template.tag));
      }
    },
  };
  fly(id, flight);
  const tick = setInterval(() => {
    left--;
    if (left > 0) return fly(id, flight);
    clearInterval(tick);
    land(id);
    for (const item of items) item.dataset.routed = "1";
    apply();
    pass(`<span>Routed <b>${items.length}</b> by <b>${esc(template.name)}</b></span>`, { label: "Log", then: () => (location.href = "log.html?batch=b1") });
  }, 1000);
});

// Tagging a batch: every tag the rows have, or could have, marked as on all, on some, or on none.
let tagState = new Map();
function batchTags(items) {
  batchItems = items;
  const names = [...new Set([...KNOWN.filter((k) => !k.template).map((k) => k.name), ...items.flatMap(rowTags).filter((t) => !t.startsWith("route/"))])];
  tagState = new Map(names.map((n) => {
    const on = items.filter((item) => rowTags(item).includes(n)).length;
    return [n, on === 0 ? "none" : on === items.length ? "all" : "some"];
  }));
  drawBatchTags();
  open("batch-tags");
}
function drawBatchTags() {
  const sheet = $("#batch-tags");
  $(".quick-what", sheet).textContent = `${batchItems.length} selected`;
  $(".batch-tag-list", sheet).innerHTML = [...tagState].map(([n, st]) =>
    `<button class="tag" data-batch-tag="${esc(n)}" aria-pressed="${st === "all"}"${st === "some" ? " data-some" : ""}>#${esc(n)}</button>`).join("");
}
$("#batch-tags")?.addEventListener("click", (e) => {
  const t = e.target.closest("[data-batch-tag]");
  if (t) {
    const n = t.dataset.batchTag;
    tagState.set(n, tagState.get(n) === "all" ? "none" : "all");
    return drawBatchTags();
  }
  if (!e.target.closest("[data-batch-tags-apply]")) return;
  close();
  const items = batchItems;
  const before = new Map(items.map((item) => [item, rowTags(item)]));
  for (const item of items) {
    let tags = rowTags(item);
    for (const [n, st] of tagState) {
      if (st === "all" && !tags.includes(n)) tags = [...tags, n];
      if (st === "none") tags = tags.filter((x) => x !== n);
    }
    setRowTags(item, tags);
  }
  select(false);
  apply();
  pass(`<span>Tagged <b>${items.length}</b></span>`, {
    label: "Undo",
    seconds: 6,
    then: () => {
      for (const [item, tags] of before) setRowTags(item, tags);
      apply();
    },
  });
});

const bar = $(".app-bar");
const veil = $(".veil");
const main = $("main");
const view = $("#view");
const search = $(".bar-search input");

const syncBarHeight = () => document.documentElement.style.setProperty("--bar-height", bar.offsetHeight + "px");
new ResizeObserver(syncBarHeight).observe(bar);

let openPanel = null;
export function open(id) {
  openPanel = document.getElementById(id);
  openPanel.hidden = false;
  veil.hidden = false;
}
export function close() {
  if (openPanel) openPanel.hidden = true;
  openPanel = null;
  veil.hidden = true;
}
$$("[data-open]").forEach((b) => b.addEventListener("click", () => (openPanel?.id === b.dataset.open ? close() : open(b.dataset.open))));
$$("[data-close]").forEach((b) => b.addEventListener("click", close));

$("[data-search=open]")?.addEventListener("click", () => {
  bar.dataset.mode = "search";
  search.focus();
});
$("[data-search=close]").addEventListener("click", () => {
  bar.dataset.mode = "title";
  search.value = "";
  apply();
});
$("[data-search=clear]").addEventListener("click", () => {
  search.value = "";
  search.focus();
  apply();
});
$(".bar-search").addEventListener("submit", (e) => e.preventDefault());
search.addEventListener("input", apply);

// Search marks the words it found in each row it shows.
function mark(words) {
  for (const text of $$("main .item .text")) {
    text.dataset.plain ??= text.innerHTML;
    text.innerHTML = text.dataset.plain;
    if (!words.length) continue;
    const walk = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    const safe = words.map((w) => w.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&"));
    const find = new RegExp("(" + safe.join("|") + ")", "gi");
    for (const node of nodes) {
      find.lastIndex = 0;
      if (!find.test(node.data)) continue;
      const span = document.createElement("span");
      span.innerHTML = esc(node.data).replace(find, "<mark>$1</mark>");
      node.replaceWith(...span.childNodes);
    }
  }
}

// The markup is newest first; oldest first turns every day and every day's rows around.
let flipped = false;
const defaultOrder = $("[data-group=order] [data-default]")?.dataset.value ?? "newest";
function setOrder(next) {
  if ((next === "oldest") === flipped) return;
  flipped = !flipped;
  const sections = $$("main > section");
  sections.reverse().forEach((s) => main.insertBefore(s, $(".nothing")));
  sections.forEach((s) => {
    const ol = $(".items", s);
    [...ol.children].reverse().forEach((li) => ol.append(li));
  });
}

const chosen = (group) => $$(`[data-group=${group}] [aria-pressed=true]`, view).map((b) => b.dataset.value);

export function apply() {
  const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tags = chosen("tag");
  const views = chosen("view");
  // The feed's bands: an item is shown if it matches any chosen value within a band.
  const bands = [...new Set($$("[data-group]", view).map((g) => g.dataset.group))].filter((g) => !["order", "tag", "view"].includes(g))
    .map((g) => [g, chosen(g)]).filter(([, values]) => values.length);
  setOrder(chosen("order")[0] ?? defaultOrder);
  mark(words);

  let shown = 0;
  for (const section of $$("main > section")) {
    let inDay = 0;
    for (const item of $$(".item", section)) {
      const itemTags = (item.dataset.tags ?? "").split(" ");
      const text = item.textContent.toLowerCase();
      const ok = !item.dataset.routed && words.every((w) => text.includes(w)) && tags.every((t) => itemTags.includes(t)) && (views.length === 0 || views.includes(item.dataset.view))
        && bands.every(([g, values]) => (item.dataset[g] ?? "").split(" ").some((v) => values.includes(v)));
      item.hidden = !ok;
      if (ok) inDay++;
    }
    $(".count", section).textContent = inDay;
    section.hidden = inDay === 0;
    shown += inDay;
  }
  $(".shown", view).textContent = shown;
  const total = $$("main .item:not([data-routed])").length;
  const queueCount = $(".drawer nav a[href='queue.html'] .n");
  if (queueCount && $(".bar-title h1").textContent === "queue") queueCount.textContent = total;
  const filtered = words.length > 0 || tags.length > 0 || views.length > 0;
  $(".nothing:not(.drained)").hidden = shown > 0 || !filtered;
  $(".nothing:not(.drained) p").textContent = words.length && !tags.length && !views.length ? `Nothing matches “${search.value.trim()}”.` : "Nothing matches the filter.";
  $(".drained").hidden = shown > 0 || filtered;
  countPending();

  const active = tags.length + views.length + bands.reduce((n, [, values]) => n + values.length, 0) + ((chosen("order")[0] ?? defaultOrder) !== defaultOrder ? 1 : 0);
  $(".filter-pill .badge").textContent = active || "";
  $(".filter-pill").setAttribute("aria-label", active ? `Filter and order, ${active} set` : "Filter and order");
}

view.addEventListener("click", (e) => {
  const b = e.target.closest("[data-value]");
  if (!b) return;
  const group = b.closest("[data-group]").dataset.group;
  if (group === "order") $$(`[data-group=order] [data-value]`, view).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  else b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
  apply();
});
$("[data-clear-filter]").addEventListener("click", () => {
  search.value = "";
  bar.dataset.mode = "title";
  $("[data-reset]", view).click();
});
$("[data-reset]", view).addEventListener("click", () => {
  $$("[data-group]:not([data-group=order]) [data-value]", view).forEach((x) => x.setAttribute("aria-pressed", "false"));
  $$("[data-group=order] [data-value]", view).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.value === defaultOrder)));
  apply();
});

const viewer = $(".viewer");
const viewerImg = $("img", viewer);
let pictures = [];
let at = 0;
function show(i) {
  at = (i + pictures.length) % pictures.length;
  viewerImg.src = pictures[at];
  $(".where", viewer).textContent = pictures.length > 1 ? `${at + 1} / ${pictures.length}` : "";
  $$(".step", viewer).forEach((b) => (b.hidden = pictures.length < 2));
}
export function openViewer(sources, index = 0) {
  pictures = sources;
  viewer.hidden = false;
  show(index);
}
$("[data-viewer=close]").addEventListener("click", () => (viewer.hidden = true));
$("[data-viewer=prev]").addEventListener("click", () => show(at - 1));
$("[data-viewer=next]").addEventListener("click", () => show(at + 1));
let startX = null;
viewer.addEventListener("pointerdown", (e) => (startX = e.clientX));
viewer.addEventListener("pointerup", (e) => {
  if (startX === null) return;
  const dx = e.clientX - startX;
  startX = null;
  if (Math.abs(dx) > 50 && pictures.length > 1) show(at + (dx < 0 ? 1 : -1));
});

const notices = $("#notices");
const live = $("[data-live]", notices);

export function addNotice({ what, about, why, alarm = true }) {
  const now = new Date().toTimeString().slice(0, 5);
  live.insertAdjacentHTML("afterbegin", `<li class="notice${alarm ? " alarm" : ""} unseen"><time>${now}</time><div class="body">
    <p class="what">${what}</p><p class="about">${esc(about)}</p>${why ? `<p class="why">${esc(why)}</p>` : ""}</div></li>`);
  countNotices();
}

function countNotices() {
  const n = $$(".notice.alarm.unseen", live).length;
  $(".notices-pill .badge").textContent = n || "";
  $(".notices-pill").setAttribute("aria-label", n ? `Notices, ${n} went wrong` : "Notices");
}
$$(".notice.alarm", live).forEach((n) => n.classList.add("unseen"));
for (const handed of JSON.parse(sessionStorage.getItem("nm-notices") ?? "[]")) addNotice(handed);
sessionStorage.removeItem("nm-notices");
countNotices();
$$("[data-open=notices]").forEach((b) => b.addEventListener("click", () => {
  $$(".notice.unseen", live).forEach((n) => n.classList.remove("unseen"));
  countNotices();
}));

notices.addEventListener("click", async (e) => {
  const opening = e.target.closest("[data-open-item]");
  if (opening) {
    const about = $(".about", opening.closest(".notice")).textContent;
    close();
    return $(".row-face", $$("main .item").find((item) => describe(item) === about))?.click();
  }
  if (e.target.closest("[data-delete-refused]")) {
    const notice = e.target.closest(".notice");
    const sure = await ask({
      title: "delete it?",
      text: "This capture was never accepted by the pool, so this device holds the only copy. Deleting it loses it.",
      ways: [{ label: "Keep", value: false }, { label: "Delete", value: true, kind: "danger" }],
    });
    if (sure) notice.remove();
  }
});

document.addEventListener("keydown", (e) => {
  if (!viewer.hidden) {
    e.stopImmediatePropagation();
    if (e.key === "Escape") viewer.hidden = true;
    if (e.key === "ArrowLeft") show(at - 1);
    if (e.key === "ArrowRight") show(at + 1);
  } else if (e.key === "Escape" && openPanel) close();
  else if (e.key === "Escape" && marking) select(false);
});

apply();
