// The log: what happened, a row an action, read by day. A routing row carries its record's line,
// which opens the record. A batch is one row, which opens in place to what it did. `?item=` is an
// item's history and `?batch=` a batch's entries: the log narrowed, with a way back to all of it.

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const params = new URLSearchParams(location.search);
const item = params.get("item");
const batch = params.get("batch");

function narrow(keep, title, about) {
  for (const row of $$("main .item")) if (!keep(row)) row.remove();
  for (const section of $$("main > section")) if (!$(".item", section)) section.remove();
  $("h1").textContent = title;
  const menu = $(".bar-title [data-open=drawer]");
  menu.outerHTML = `<button class="icon-button" data-history-back aria-label="Back"><svg class="i"><use href="#i-back"></use></svg></button>`;
  $("[data-history-back]").addEventListener("click", () => (history.length > 1 ? history.back() : (location.href = "queue.html")));
  $("main").insertAdjacentHTML("afterbegin",
    `<p class="history-of"><span>${esc(about)}</span><a class="pill lone" href="log.html">All of the log</a></p>`);
}

if (item) narrow((row) => $(".text", row).textContent.trim() === item, "history", item);
else if (batch) {
  const head = $(`[data-batch="${batch}"]`);
  const about = `${$(".kind span", head).textContent} ${$(".text", head).textContent}`;
  narrow((row) => row.dataset.inBatch === batch, "this batch", about);
} else for (const row of $$("[data-in-batch]")) row.dataset.routed = "in-batch";

document.addEventListener("click", (e) => {
  const head = e.target.closest(".log-row.batch");
  if (!head || e.target.closest("a")) return;
  const entries = $(".batch-entries", head);
  entries.hidden = !entries.hidden;
  head.classList.toggle("opened", !entries.hidden);
});

document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-record]");
  if (link) sessionStorage.setItem("nm-record", link.dataset.record);
});
