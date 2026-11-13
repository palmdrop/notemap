// The queue on a wide window: writing from the box at the top, selecting with a pointer, and the
// keyboard. The keys are the shell's own: j and k (or the arrows) walk the rows, and with an item
// open they open the next; enter opens; p routes; m is done, D discards, e edits, t tags; [ and ]
// step the opened item; space selects, and J and K select as they walk; / searches, f filters,
// n opens the notices; k on the first row goes up into the box to write in.

import { apply, countMarked, decorate, landed, pass, select } from "./queue.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const wide = () => document.documentElement.dataset.frame === "full" && matchMedia("(min-width: 900px)").matches;

const composer = $(".composer");
const words = composer && $("textarea", composer);

function capture() {
  const text = words.value.trim();
  if (!text) return words.focus();
  const day = $$("main > section").map((s) => [s, $(".day-head time", s).getAttribute("datetime")]).sort((a, b) => (a[1] < b[1] ? 1 : -1))[0][0];
  // A new capture is the newest: at the end of the queue when the oldest come first.
  const item = document.createElement("li");
  item.className = "item";
  item.toggleAttribute("data-pending", true);
  item.innerHTML = `<time>${new Date().toTimeString().slice(0, 5)}</time><div class="body"><p class="text">${esc(text)}</p></div>`;
  $(".items", day).append(item);
  decorate(item);
  const face = document.createElement("div");
  face.className = "row-face";
  face.append(...item.childNodes);
  item.append(face);
  apply();
  words.value = "";
  pass(landed(item), { label: "Show", then: () => item.scrollIntoView({ block: "center" }) });
  setTimeout(() => {
    item.removeAttribute("data-pending");
    decorate(item);
  }, 2500);
}
composer?.addEventListener("submit", (e) => {
  e.preventDefault();
  capture();
});
words?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    capture();
  }
});

// Beside the list the item is closed, not gone back from.
const closer = $("[data-iv=close]");
const markClose = () => {
  if (!closer) return;
  $("use", closer).setAttribute("href", wide() ? "#i-close" : "#i-back");
  closer.setAttribute("aria-label", wide() ? "Close" : "Back to the queue");
};
markClose();
matchMedia("(min-width: 900px)").addEventListener("change", markClose);
new MutationObserver(markClose).observe(document.documentElement, { attributes: true, attributeFilter: ["data-frame"] });

const rows = () => $$("main .item").filter((item) => !item.hidden && !item.closest("section").hidden);
const pane = $(".item-view");
const paneOpen = () => !!pane && !pane.hidden;

function move(by) {
  const list = rows();
  if (!list.length) return;
  const at = list.findIndex((item) => item.classList.contains(paneOpen() ? "open" : "current"));
  const next = list[Math.max(0, Math.min(list.length - 1, at < 0 ? 0 : at + by))];
  for (const item of $$("main .item.current")) item.classList.remove("current");
  next.classList.add("current");
  next.scrollIntoView({ block: "nearest" });
  if (paneOpen()) $(".row-face", next).click();
}

// Selecting with a pointer: ctrl or cmd and a click selects a row, shift and a click every row
// from the last one to it.
let anchor = null;
document.addEventListener("click", (e) => {
  if (!wide()) return;
  const item = e.target.closest("main .item");
  if (!item || !(e.ctrlKey || e.metaKey || e.shiftKey)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  getSelection()?.removeAllRanges();
  const marking = document.documentElement.hasAttribute("data-marking");
  if (e.shiftKey && (anchor || $("main .item.current"))) {
    const list = rows();
    const [a, b] = [list.indexOf(anchor ?? $("main .item.current")), list.indexOf(item)].sort((x, y) => x - y);
    if (!marking) select(true);
    for (const row of list.slice(a, b + 1)) row.classList.add("marked");
  } else if (!marking) select(true, item);
  else item.classList.toggle("marked");
  anchor = item;
  countMarked();
}, true);

// The batch's actions sit in the head on a wide window, beside the count, where the list's head
// was.
const batch = $(".batch-bar");
const head = $(".bar-marking");
const placeBatch = () => {
  if (!batch || !head) return;
  if (wide()) head.append(batch);
  else $(".screen").append(batch);
  batch.classList.toggle("in-head", wide());
};
placeBatch();
matchMedia("(min-width: 900px)").addEventListener("change", placeBatch);

// Every button that has a key says it, where a pointer can hover.
const KEYS = { "[data-iv=route]": "p", "[data-iv=done]": "m", "[data-iv=discard]": "D", "[data-iv=prev]": "[", "[data-iv=next]": "]",
  "[data-iv=close]": "esc", "[data-open=view]": "f", "[data-open=notices]": "n", "[data-search=open]": "/", "[data-iv=save]": "ctrl+enter" };
for (const [sel, key] of Object.entries(KEYS))
  for (const b of $$(sel)) b.title = `${b.getAttribute("aria-label") ?? b.textContent.trim()} (${key})`;

const current = () => $("main .item.current");
// A key for one item reaches the opened item, or opens the current row first.
function onItem(sel) {
  if (!paneOpen()) {
    const row = current();
    if (!row) return;
    $(".row-face", row).click();
  }
  $(sel)?.click();
}

function walk(by, marking) {
  const list = rows();
  if (marking && current()) current().classList.add("marked");
  if (by < 0 && !paneOpen() && list[0]?.classList.contains("current") && words) {
    list[0].classList.remove("current");
    return words.focus();
  }
  move(by);
  if (marking) {
    if (!document.documentElement.hasAttribute("data-marking")) select(true);
    current()?.classList.add("marked");
    countMarked();
  }
}

document.addEventListener("keydown", (e) => {
  if (!wide() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest("input, textarea, [contenteditable]") || document.querySelector(".dialog-veil")) return;
  if (!$("#quick")?.hidden) return;
  const marking = document.documentElement.hasAttribute("data-marking");
  const k = e.key;
  if (k === "j" || k === "ArrowDown") return e.preventDefault(), walk(1);
  if (k === "k" || k === "ArrowUp") return e.preventDefault(), walk(-1);
  if (k === "J") return e.preventDefault(), walk(1, true);
  if (k === "K") return e.preventDefault(), walk(-1, true);
  if (k === " " && current()) {
    e.preventDefault();
    if (!marking) return select(true, current());
    current().classList.toggle("marked");
    return countMarked();
  }
  if (marking) return;
  if (k === "Enter" && current()) return $(".row-face", current()).click();
  if (k === "p") return paneOpen() ? $("[data-iv=route]").click() : $("[data-row-route]", current() ?? document.body)?.click();
  if (k === "m") return onItem("[data-iv=done]");
  if (k === "D") return onItem("[data-iv=discard]");
  if (k === "e") return onItem("[data-iv=edit]");
  if (k === "t") return onItem(".iv-tags .tag.add");
  if (k === "[" && paneOpen()) return $("[data-iv=prev]").click();
  if (k === "]" && paneOpen()) return $("[data-iv=next]").click();
  if (k === "/") return e.preventDefault(), $(".bar-search input")?.focus();
  if (k === "f") return $("[data-open=view]")?.click();
  if (k === "n") return $(".notices-pill")?.click();
});

// From the box, esc leaves the field and j goes down to the first row.
words?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return words.blur();
});
