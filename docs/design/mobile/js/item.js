// The item view: an item opened from the queue, full screen. It is filled from the row that
// was tapped, steps through the rows the queue is showing, opens the picture viewer, and hands
// the item to the route page.

import { ask } from "./dialog.js";
import { OFFLINE, glyph } from "./glyphs.js";
import { apply, cancelRow, decorate, describe, openViewer, routingBy } from "./queue.js";
import { askFor, quick, routeBy } from "./quick.js";
import { templateOf } from "./templates.js";
import { mountTags } from "./tags.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const view = $(".item-view");
let current = null;
// In the feed every item is sealed: what was decided about it stays, and an edit is a revision.
const sealed = !document.getElementById("quick");


const tagsOf = (item) => $$(".tags li", item).map((li) => li.dataset.tag ?? li.textContent.replace(/^#/, ""));
const editor = mountTags($(".iv-tags", view), {
  locked: (t) => current?.dataset.state === "routing" && t.startsWith("route/"),
  onChange: async (tags) => {
    const added = tags.find((t) => !tagsOf(current).includes(t));
    const template = added && templateOf(added);
    if (template) {
      const item = current;
      const answer = await askFor(template, describe(item));
      if (answer === null) return editor.set(tagsOf(item));
      write(item, tags);
      return routeBy(item, template.name, answer);
    }
    write(current, tags);
  },
});

// A trigger tag starts its template's window as it lands, so the tag is locked while it counts.
function write(item, tags) {
  item.dataset.tags = tags.join(" ");
  let list = $(".tags", item);
  if (!list) {
    list = document.createElement("ul");
    list.className = "tags";
    $(".body", item).append(list);
  }
  list.innerHTML = tags.map((t) => (t.startsWith("route/") ? `<li class="trigger">#${t}</li>` : `<li>#${t}</li>`)).join("");
  decorate(item);
}

// Whatever happens to the item while it is open, from here or from the sheet, redraws its line.
const watch = new MutationObserver(() => {
  if (!current) return;
  status(current);
  editor.set(tagsOf(current));
});

// The queue's newest day stands in for today, so the design reads the same on any day it is opened.
const today = new Date($$("main .day-head time").map((t) => t.getAttribute("datetime")).sort().at(-1));

function when(day) {
  const date = new Date($(".day-head time", day).getAttribute("datetime"));
  const days = Math.round((today - date) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return $(".weekday", day).textContent;
  const year = date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" };
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...year }).toLowerCase();
}

const shown = () => $$("main .item").filter((item) => !item.hidden && !item.closest("section").hidden);

function fill(item) {
  current = item;
  watch.disconnect();
  watch.observe(item, { attributes: true, attributeFilter: ["data-state"] });
  for (const row of $$("main .item.open")) row.classList.remove("open");
  item.classList.add("open");
  const day = item.closest("section");
  $(".weekday", view).textContent = when(day);
  $(".iv-time", view).textContent = $("time", item).textContent;
  $(".iv-text", view).innerHTML = $(".text", item).innerHTML;
  $(".iv-files", view).innerHTML = $(".files", item)?.outerHTML ?? "";
  const unfurl = $(".unfurl", item);
  $(".iv-extra", view).innerHTML = unfurl ? `<a class="unfurl" href="${unfurl.dataset.href ?? "#"}">${unfurl.innerHTML}</a>` : "";
  status(item);
  routes(item);
  // A capture the pool refused is only on this device: it can be changed or deleted, not decided.
  const refused = item.dataset.state === "refused";
  for (const b of $$(".iv-actions [data-iv=done], .iv-actions [data-iv=route]", view)) b.disabled = refused || OFFLINE;
  const discard = $(".iv-actions [data-iv=discard] span", view);
  if (discard) discard.textContent = refused ? "Delete" : "Discard";

  const sources = $$(".picture img, .thumb img", item).map((img) => img.getAttribute("src"));
  $(".iv-pictures", view).replaceChildren(
    ...sources.map((src, i) => {
      const button = document.createElement("button");
      button.setAttribute("aria-label", `Picture ${i + 1} of ${sources.length}`);
      button.innerHTML = `<img src="${src}" alt="" />`;
      button.addEventListener("click", () => openViewer(sources, i));
      return button;
    }),
  );

  editor.set(tagsOf(item));
  if (sealed) $(".iv-actions .primary span", view).textContent = item.dataset.records ? "Route again" : "Route";

  const list = shown();
  const at = list.indexOf(item);
  $(".iv-pos", view).textContent = `${at + 1}/${list.length}`;
  $("[data-iv=prev]", view).disabled = at === 0;
  $("[data-iv=next]", view).disabled = at === list.length - 1;
  $(".iv-page", view).scrollTop = 0;
  sessionStorage.setItem("nm-routing", JSON.stringify({ text: $(".text", item).textContent, about: describe(item), pictures: sources, tags: tagsOf(item) }));
}

const icon = (name) => `<svg class="i"><use href="#i-${name}"></use></svg>`;

// Out of reach, what needs the pool waits: Route and Done are off, and the page says what still works.
if (OFFLINE) {
  for (const b of $$(".iv-actions [data-iv=done]", view)) b.disabled = true;
  for (const b of $$(".iv-actions .primary", view)) b.disabled = true;
  $(".iv-page", view).insertAdjacentHTML("afterbegin", `<p class="iv-offline">${glyph.cloudOff}<span>Offline. Route and Done wait for the pool; editing, tags and Discard are sent when it answers.</span></p>`);
}

// One line above the words for whatever is happening to the item: waiting to be sent, routing by
// a trigger tag while its window is open, discarded, or manual. A rejected delivery says so in its
// record's line instead.
function status(item) {
  const line = $(".iv-status", view);
  const state = item.dataset.state === "abandoned" ? "" : (item.dataset.state ?? (item.hasAttribute("data-pending") ? "pending" : ""));
  line.hidden = !state;
  line.className = `iv-status ${state}`;
  line.innerHTML = {
    pending: `<span class="pending-dot"></span><span>Waiting to send</span>`,
    routing: `<span class="spinner"></span><span>${routingBy(item.dataset.firing, item.dataset.answer)}</span>${OFFLINE ? "" : `<button class="quiet" data-iv="cancel-firing">Cancel</button>`}`,
    discarded: `${icon("trash")}<span>Discarded</span><button class="quiet" data-iv="undiscard">Undiscard</button>`,
    done: `${icon("check")}<span>Manual: processed by hand</span><button class="quiet" data-iv="unmanual">Undo</button>`,
    refused: `${glyph.cloudOff}<span><b>Refused by the pool:</b> ${item.dataset.why}. Kept on this device only, until it is changed or deleted.</span>`,
  }[state] ?? "";
}
// The routing records an item holds, a line each at the top, the way the feed's rows show them,
// each opening the record's own view. In the queue that is only ever one a delivery was given up
// on, which is why the item is back.
const LEAD = {
  pending: () => `<span class="spinner"></span>`,
};

function routes(item) {
  const records = JSON.parse(item.dataset.records ?? "[]");
  if (item.dataset.state === "abandoned" && records.length === 0)
    records.push({
      about: describe(item),
      state: "abandoned",
      why: item.dataset.why,
      facts: [["destination", "Vault"], ["action", "new note"], ["shape", "raw"], ["file", "projects/street/still-here-on-the-wall-by.md"], ["if missing", "Must exist"]],
      decided: "2026-10-30 11:20",
      output: $(".text", item).textContent,
    });
  const list = $(".iv-routes", view);
  list.hidden = records.length === 0;
  list.innerHTML = records.map((record) => {
    const where = record.facts[0][1];
    const place = record.facts.find(([name]) => ["file", "channel"].includes(name))?.[1] ?? "";
    if (record.state === "abandoned")
      return `<li><a class="route-row abandoned" href="record.html" data-record='${JSON.stringify({ about: describe(item), ...record }).replace(/'/g, "&#39;")}'>
        ${icon("route")}<span class="what"><b>Rejected by ${where}</b><small>${record.why ?? ""}.</small></span>${icon("chevron").replace('class="i"', 'class="i go"')}</a></li>`;
    return `<li><a class="route-row ${record.state}" href="record.html" data-record='${JSON.stringify({ about: describe(item), ...record }).replace(/'/g, "&#39;")}'>
      ${(LEAD[record.state] ?? (() => icon("route")))()}<b>${where}</b><span class="place">${place}</span>${icon("chevron").replace('class="i"', 'class="i go"')}</a></li>`;
  }).join("");
}

view.addEventListener("click", (e) => {
  if (e.target.closest("[data-iv=discard]") && current?.dataset.state === "refused") {
    e.stopImmediatePropagation();
    return ask({
      title: "delete it?",
      text: "The pool never accepted it, so this device holds the only copy. Deleting it loses it.",
      ways: [{ label: "Keep", value: false }, { label: "Delete", value: true, kind: "danger" }],
    }).then((sure) => {
      if (!sure) return;
      current.dataset.routed = "deleted";
      apply();
      history.back();
    });
  }
  const b = e.target.closest("[data-iv=undiscard], [data-iv=unmanual]");
  if (!b) return;
  delete current.dataset.state;
  status(current);
  notice(`Back in the queue: <b>${describe(current)}</b>`);
});
view.addEventListener("click", (e) => {
  if (e.target.closest("[data-iv=route]")) quick(current);
});
view.addEventListener("click", (e) => {
  const link = e.target.closest("[data-record]");
  if (link) sessionStorage.setItem("nm-record", link.dataset.record);
});

view.addEventListener("click", (e) => {
  if (!e.target.closest("[data-iv=cancel-firing]")) return;
  cancelRow(current);
  status(current);
  editor.set(tagsOf(current));
});

function open(item) {
  fill(item);
  view.hidden = false;
  history.pushState({ capture: true }, "");
}

function step(by) {
  const list = shown();
  const next = list[list.indexOf(current) + by];
  if (next) fill(next);
}

$("main").addEventListener("click", (e) => {
  if (e.target.closest("a, button")) return;
  const item = e.target.closest(".item");
  if (item) open(item);
});
$("[data-iv=close]", view).addEventListener("click", async () => {
  if (!editing.hidden && !(await dropChanges())) return;
  history.back();
});
$("[data-iv=prev]", view).addEventListener("click", () => step(-1));
$("[data-iv=next]", view).addEventListener("click", () => step(1));
// Back is the commonest way out on a phone, so it asks about changed words as Close does.
addEventListener("popstate", async () => {
  if (!view.hidden && !editing.hidden && changed()) {
    history.pushState({ capture: true }, "");
    if (!(await dropChanges())) return;
    edit(false);
    return history.back();
  }
  view.hidden = true;
  for (const row of $$("main .item.open")) row.classList.remove("open");
  showMenu(false);
  edit(false);
});

let start = null;
const page = $(".iv-page", view);
page.addEventListener("pointerdown", (e) => (start = { x: e.clientX, y: e.clientY }));
page.addEventListener("pointerup", (e) => {
  if (!start || !editing.hidden) return;
  const dx = e.clientX - start.x;
  const dy = e.clientY - start.y;
  start = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
});

const strip = $(".iv-strip", view);
let undo = null;
let stripTimer = 0;
function notice(html, then = null) {
  $(".say", strip).innerHTML = html;
  $("[data-iv=undo]", strip).hidden = !then;
  strip.classList.toggle("timed", !!then);
  undo = then;
  strip.hidden = true;
  void strip.offsetWidth;
  strip.hidden = false;
  clearTimeout(stripTimer);
  stripTimer = setTimeout(() => (strip.hidden = true), 5000);
}
const firstLine = describe;

// Discard and done take the item out of the queue and move on; the notice offers it back for a
// few seconds. Neither delivers anything, so undo is always a true reversal.
function decide(kind) {
  const item = current;
  const list = shown();
  const at = list.indexOf(item);
  const next = list[at + 1] ?? list[at - 1];
  item.dataset.routed = kind;
  apply();
  notice(`${kind === "discard" ? "Discarded" : "Done"}: <b>${firstLine(item)}</b>`, () => {
    delete item.dataset.routed;
    apply();
    fill(item);
  });
  if (next) fill(next);
  else history.back();
}
$("[data-iv=discard]", view)?.addEventListener("click", () => current?.dataset.state !== "refused" && decide("discard"));
$("[data-iv=done]", view)?.addEventListener("click", () => decide("done"));
$("[data-iv=undo]", view).addEventListener("click", () => {
  clearTimeout(stripTimer);
  strip.hidden = true;
  undo?.();
});

const menu = $(".menu", view);
const more = $("[data-iv=more]", view);
function showMenu(on) {
  menu.hidden = !on;
  more.setAttribute("aria-expanded", on);
}
more.addEventListener("click", (e) => {
  e.stopPropagation();
  showMenu(menu.hidden);
});
document.addEventListener("click", (e) => !menu.hidden && !menu.contains(e.target) && showMenu(false));

const editing = $(".iv-edit", view);
const held = $(".iv-held", view);
let removed = new Set();
let attached = [];

// While the words are edited the attachments stay where they were, above them, small and each
// with a way to take it off. Nothing is taken off until the edit is saved.
function holdAttachments() {
  const parts = $$(".picture, .thumb, .files li", current);
  held.hidden = parts.length === 0;
  held.innerHTML = parts.map((part, i) => {
    const img = $("img", part);
    const face = img ? `<img src="${img.getAttribute("src")}" alt="" />` : `<span class="file">${$(".name", part).textContent}</span>`;
    return `<figure data-part="${i}"${removed.has(i) ? " hidden" : ""}>${face}<button class="remove" data-take-off="${i}" aria-label="Take it off">${icon("close")}</button></figure>`;
  }).join("") + attached.map((file, i) => `<figure>${file.src ? `<img src="${file.src}" alt="" />` : `<span class="file">${file.name}</span>`}<button class="remove" data-unattach="${i}" aria-label="Take it off">${icon("close")}</button></figure>`).join("");
  held.hidden = parts.length + attached.length === 0;
}
held.addEventListener("click", (e) => {
  const un = e.target.closest("[data-unattach]");
  if (un) {
    attached.splice(Number(un.dataset.unattach), 1);
    return holdAttachments();
  }
  const off = e.target.closest("[data-take-off]");
  if (!off) return;
  removed.add(Number(off.dataset.takeOff));
  holdAttachments();
});

function edit(on) {
  if (on === !editing.hidden) return;
  $(".iv-text", view).hidden = on;
  $(".iv-pictures", view).hidden = on;
  $(".iv-files", view).hidden = on;
  removed = new Set();
  attached = [];
  if (on) holdAttachments();
  else held.hidden = true;
  editing.hidden = !on;
  $(".iv-actions", view).hidden = on;
  $(".iv-edit-foot", view).hidden = !on;
  $(".iv-steps", view).inert = on;
  $(".iv-revision", view)?.remove();
  if (on && sealed) editing.insertAdjacentHTML("beforebegin", `<p class="iv-revision hint">Saving makes a revision. What was routed stays as it went.</p>`);
  if (on) {
    editing.value = $(".text", current).textContent;
    editing.focus();
  }
}
$("[data-iv=edit]", view)?.addEventListener("click", () => {
  showMenu(false);
  edit(true);
});
// A double tap on the words edits them. Touch browsers do not all send dblclick, so a second tap
// close in time and place counts too.
const editable = (e) => !e.target.closest("button, a") && editing.hidden && !!$("[data-iv=edit]", view);
page.addEventListener("dblclick", (e) => {
  if (!editable(e)) return;
  getSelection().removeAllRanges();
  edit(true);
});
let lastTap = null;
page.addEventListener("pointerup", (e) => {
  if (e.pointerType !== "touch" || !editable(e)) return;
  const near = lastTap && e.timeStamp - lastTap.at < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
  lastTap = near ? null : { at: e.timeStamp, x: e.clientX, y: e.clientY };
  if (near) edit(true);
});

// Leaving an edit with changed words asks first: the words are not kept anywhere else.
const changed = () => editing.value.trim() !== $(".text", current).textContent.trim() || removed.size > 0 || attached.length > 0;
async function dropChanges() {
  if (!changed()) return true;
  const drop = await ask({
    title: "lose your changes?",
    text: "What you changed is not kept anywhere else.",
    ways: [{ label: "Keep editing", value: false }, { label: "Lose changes", value: true, kind: "danger" }],
  });
  if (!drop) editing.focus();
  return drop;
}
$("[data-iv=cancel]", view).addEventListener("click", async () => {
  if (await dropChanges()) edit(false);
});
$("[data-iv=attach]", view)?.addEventListener("change", (e) => {
  for (const file of e.target.files) attached.push({ name: file.name, src: file.type.startsWith("image/") ? URL.createObjectURL(file) : "" });
  e.target.value = "";
  holdAttachments();
});
$("[data-iv=save]", view).addEventListener("click", () => {
  if (editing.value.trim() !== $(".text", current).textContent.trim()) $(".text", current).textContent = editing.value.trim();
  const parts = $$(".picture, .thumb, .files li", current);
  for (const i of removed) parts[i].remove();
  for (const file of attached.filter((f) => f.src)) {
    let pictures = $(".pictures", current);
    if (!pictures) {
      pictures = Object.assign(document.createElement("div"), { className: "pictures" });
      $(".text", current).after(pictures);
    }
    pictures.insertAdjacentHTML("beforeend", `<span class="thumb"><img src="${file.src}" alt="" /></span>`);
  }
  $$(".pictures, .files", current).forEach((list) => list.children.length || list.remove());
  edit(false);
  fill(current);
});
if (!navigator.clipboard) $("[data-iv=copy]", view).closest("li").hidden = true;
$("[data-iv=copy]", view).addEventListener("click", async () => {
  showMenu(false);
  try {
    await navigator.clipboard.writeText($(".text", current).textContent);
    notice(`Copied: <b>${firstLine(current)}</b>`);
  } catch {
    notice("Nothing copied: this browser keeps the clipboard to itself");
  }
});
$("[data-iv=history]", view).addEventListener("click", () => {
  location.href = `log.html?item=${encodeURIComponent(describe(current))}`;
});

document.addEventListener("keydown", (e) => {
  if (view.hidden || !$(".viewer").hidden) return;
  if (e.key === "Escape") {
    if (!menu.hidden) return showMenu(false);
    if (!editing.hidden) return dropChanges().then((drop) => drop && edit(false));
    return history.back();
  }
  if (!editing.hidden) return;
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
});
