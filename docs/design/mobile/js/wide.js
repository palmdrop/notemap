// The queue on a wide window: writing from the box at the top, and the keyboard. j and k (or the
// arrows) move between rows and, with an item open, open the next one; enter opens; r routes;
// / searches; c writes.

import { apply, decorate, pass } from "./queue.js";

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
  const item = document.createElement("li");
  item.className = "item";
  item.toggleAttribute("data-pending", true);
  item.innerHTML = `<div class="row-face"><time>${new Date().toTimeString().slice(0, 5)}</time><div class="body"><p class="text">${esc(text)}</p></div></div>`;
  $(".items", day).prepend(item);
  decorate(item);
  apply();
  words.value = "";
  item.scrollIntoView({ block: "nearest" });
  pass("Captured");
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
  if (e.key === "Escape") words.blur();
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

document.addEventListener("keydown", (e) => {
  if (!wide() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest("input, textarea, [contenteditable]") || document.querySelector(".dialog-veil")) return;
  const current = $("main .item.current");
  if (e.key === "j" || e.key === "ArrowDown") return e.preventDefault(), move(1);
  if (e.key === "k" || e.key === "ArrowUp") return e.preventDefault(), move(-1);
  if (e.key === "Enter" && current) return $(".row-face", current).click();
  if (e.key === "r" && current) return $("[data-row-route]", current)?.click();
  if (e.key === "/") return e.preventDefault(), $(".bar-search input")?.focus();
  if (e.key === "c" && words) return e.preventDefault(), words.focus();
});
