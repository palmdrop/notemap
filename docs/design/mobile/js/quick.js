// Swiping a row left opens the quick route sheet: a template in one tap, its question answered in
// place, or more options in the route page. A routed row keeps its place while its window is open,
// counting, with Cancel, and leaves when the window closes.

import { TEMPLATES } from "./templates.js";
import { addNotice, alarm, apply, cancelRouting, close, decorate, describe, fly, land, open, pass, routingBy } from "./queue.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const THRESHOLD = 90;
const UNDO_SECONDS = 5;

const sheet = $("#quick");
const icon = (name, cls = "") => `<svg class="i ${cls}"><use href="#i-${name}"></use></svg>`;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// The feed has no sheet: nothing there is routed from a row.
for (const item of sheet ? $$("main .item") : []) {
  item.insertAdjacentHTML("afterbegin", `<span class="row-under" aria-hidden="true">${icon("route")}route</span>`);
  $(".row-face", item)?.insertAdjacentHTML("beforeend", `<button class="pill row-route" data-row-route>${icon("route")}Route</button>`);
}
// With a pointer and no swipe, a row offers Route on hover instead.
$("main").addEventListener("click", (e) => {
  const b = e.target.closest("[data-row-route]");
  if (b) quick(b.closest(".item"));
});

let drag = null;
let swiped = false;
let target = null;

// A swipe that starts at the screen's edge is the system's back gesture, not the row's.
const EDGE = 24;
$("main").addEventListener("pointerdown", (e) => {
  const item = e.target.closest(".item");
  if (!sheet || !item || e.button > 0) return;
  if (e.clientX < EDGE || e.clientX > innerWidth - EDGE) return;
  drag = { item, x: e.clientX, y: e.clientY, dx: 0, on: false };
});
addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (!drag.on) {
    if (Math.abs(dy) > 10) return (drag = null);
    if (dx > -10) return;
    drag.on = true;
    drag.item.classList.add("swiping");
  }
  drag.dx = Math.min(0, dx);
  drag.item.style.setProperty("--dx", drag.dx + "px");
  drag.item.classList.toggle("armed", drag.dx < -THRESHOLD);
});
addEventListener("pointerup", () => {
  if (!drag) return;
  const { item, dx, on } = drag;
  drag = null;
  if (!on) return;
  swiped = true;
  item.classList.remove("swiping", "armed");
  item.style.removeProperty("--dx");
  if (dx < -THRESHOLD) quick(item);
});
addEventListener("pointercancel", () => {
  if (!drag) return;
  drag.item.classList.remove("swiping", "armed");
  drag.item.style.removeProperty("--dx");
  drag = null;
});
$("main").addEventListener(
  "click",
  (e) => {
    if (swiped) {
      e.stopImmediatePropagation();
      swiped = false;
    }
  },
  true,
);

export function quick(item) {
  target = item;
  asking = null;
  only = null;
  $(".quick-what", sheet).textContent = describe(item);
  $(".sheet-foot", sheet).hidden = false;
  $(".sheet-head h2", sheet).textContent = "route";
  renderTemplates(null);
  sessionStorage.setItem("nm-routing", JSON.stringify({
    text: $(".text", item).textContent,
    pictures: $$(".picture img, .thumb img", item).map((img) => img.getAttribute("src")),
    tags: (item.dataset.tags ?? "").split(" ").filter(Boolean),
  }));
  open("quick");
}

let only = null;
function renderTemplates(asking) {
  $(".quick-templates", sheet).innerHTML = TEMPLATES.filter((t) => !only || t.name === only).map((t) => `
    <li>
      <button class="row" data-template="${esc(t.name)}">${icon(t.icon)}<span><b>${esc(t.name)}</b><small>${esc(t.place)} in ${esc(t.dest)}</small></span>
        ${t.ask ? icon(asking === t.name ? "up" : "down", "end") : t.page ? icon("chevron", "end") : `<span class="go">Route</span>`}</button>
      ${asking === t.name ? `<ul class="answers">${t.ask.map((a) => `<li><button data-answer="${esc(a)}">${esc(a)}<span class="go">Route</span></button></li>`).join("")}</ul>` : ""}
    </li>`).join("");
}

let asking = null;
sheet?.addEventListener("click", (e) => {
  const t = e.target.closest("[data-template]");
  if (t) {
    const template = TEMPLATES.find((x) => x.name === t.dataset.template);
    if (template.page) return (location.href = `route.html?template=${encodeURIComponent(template.name)}`);
    if (template.ask) {
      asking = asking === template.name ? null : template.name;
      return renderTemplates(asking);
    }
    return route(template.name);
  }
  const answer = e.target.closest("[data-answer]");
  if (!answer) return;
  if (answering) {
    const done = answering;
    answering = null;
    close();
    return done(answer.dataset.answer);
  }
  route(`${asking}, ${answer.dataset.answer}`);
});

// A trigger tag whose template asks something asks it here, in the sheet's own shape, before the
// tag lands. Closing the sheet unanswered leaves the tag off.
let answering = null;
export function askFor(template, about) {
  if (!template.ask) return Promise.resolve("");
  return new Promise((resolve) => {
    answering = resolve;
    only = asking = template.name;
    $(".quick-what", sheet).textContent = about;
    $(".sheet-head h2", sheet).textContent = template.name.toLowerCase();
    $(".sheet-foot", sheet).hidden = true;
    renderTemplates(asking);
    open("quick");
    const gone = new MutationObserver(() => {
      if (!sheet.hidden) return;
      gone.disconnect();
      if (answering === resolve) {
        answering = null;
        resolve(null);
      }
    });
    gone.observe(sheet, { attributes: true, attributeFilter: ["hidden"] });
  });
}

const now = () => new Date().toTimeString().slice(0, 5);

// A route waits out its window in the status line, counting, with Cancel beside it; then it says
// where it went, or, when the destination turns it down, says so at the top.
function windowed(item, name, answer, { done, cancel }) {
  const id = `route-${Date.now()}`;
  let left = UNDO_SECONDS;
  const flight = {
    time: now(),
    about: describe(item),
    item,
    say: () => routingBy(name, answer),
    left: () => left,
    cancel: () => {
      clearInterval(tick);
      cancel();
    },
  };
  fly(id, flight);
  const tick = setInterval(() => {
    left--;
    if (left > 0) return fly(id, flight);
    clearInterval(tick);
    land(id);
    done();
  }, 1000);
}

function route(what) {
  close();
  asking = null;
  const [name, answer] = what.split(", ");
  routeBy(target, name, answer);
}

export function routeBy(item, name, answer = "") {
  const t = TEMPLATES.find((x) => x.name === name);
  Object.assign(item.dataset, { state: "routing", firing: name, answer: answer ?? "" });
  decorate(item);
  windowed(item, name, answer, {
    cancel: () => cancelRouting(item),
    done: () => {
      if (name === "To the cloud") return rejected(item);
      leave(item);
      pass(`${icon("route")}<span>Routed to ${esc(t.place)} in <b>${esc(t.dest)}</b></span>`);
    },
  });
}

function leave(item) {
  item.classList.add("leaving");
  setTimeout(() => {
    item.classList.remove("leaving");
    delete item.dataset.state;
    item.dataset.routed = "1";
    decorate(item);
    apply();
  }, 240);
}

// The destination said no after the window: the item comes back with the reason on its row, the
// notices keep it, and the strip at the top says it once.
function rejected(item) {
  const why = "Cloud's seeded/ folder is read-only to notemap";
  Object.assign(item.dataset, { state: "abandoned", dest: "Cloud", place: "seeded/" });
  decorate(item);
  apply();
  addNotice({ what: "Rejected by <b>Cloud</b>", about: describe(item), why: why + ". The item is back in the queue." });
  alarm(`${icon("route")}<span><b>Rejected by Cloud:</b> seeded/ is read-only</span>`, () => $(".row-face", item)?.click());
}

for (const item of $$("main .item[data-fresh][data-firing]")) {
  windowed(item, item.dataset.firing, item.dataset.answer, {
    cancel: () => cancelRouting(item),
    done: () => {
      if (item.dataset.state !== "routing") return;
      leave(item);
      pass(`${icon("route")}<span>Routed by <b>${esc(item.dataset.firing)}</b></span>`);
    },
  });
}
