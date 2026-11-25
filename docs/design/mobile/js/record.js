// A routing record's own view: where the item went and how, whether it got there, the words as
// they were written, and what can still be done about it. `?state=` shows the other states.

import { ask } from "./dialog.js";
import { glyph } from "./glyphs.js";

const $ = (s, root = document) => root.querySelector(s);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const icon = (name) => `<svg class="i"><use href="#i-${name}"></use></svg>`;

const sample = {
  about: "idea: a bike rack that folds flat into the hallway wall",
  state: "delivered",
  facts: [["destination", "Vault"], ["action", "new note"], ["shape", "raw"], ["file", "seeded/idea-a-bike-rack-that-folds-flat-into.md"], ["if missing", "Make it"]],
  decided: "2026-10-30 14:02",
  delivered: "14:02",
  output: "---\ncaptured_at: 2026-10-30T13:58\ntags: [home, idea]\n---\n\nidea: a bike rack that folds flat into the hallway wall",
};
const record = JSON.parse(sessionStorage.getItem("nm-record") ?? "null") ?? sample;
const asked = new URLSearchParams(location.search).get("state");
if (asked) record.state = asked;
if (record.state === "abandoned" && !record.why) {
  record.why = "Vault has no folder named projects/street/, and the route said it must exist";
  record.facts = [["destination", "Vault"], ["action", "new note"], ["shape", "raw"], ["file", "projects/street/idea-a-bike-rack-that-folds-flat-into.md"], ["if missing", "Must exist"]];
}
// Only a record whose destination gives an address can be opened there; a file is copied as a path.
const url = record.url ?? (record.facts[0][1] === "Board" ? "https://are.na/" : null);
// A delivery that was given up on or cancelled left no record: the page is the log's account of
// the attempt.
const attempt = ["abandoned", "cancelled"].includes(record.state);

const now = () => new Date().toTimeString().slice(0, 5);

const STATES = {
  pending: () => [`<span class="spinner"></span><span>Waiting for <b>${esc(record.facts[0][1])}</b>: it has not answered since 09:40, and is tried again when it does.</span>`, ""],
  delivered: () => [`${icon("check")}Delivered at ${esc(record.delivered ?? record.decided.slice(-5))}`, "delivered"],
  abandoned: () => [`${icon("route")}<span><b>Rejected by ${esc(record.facts[0][1])}:</b> ${esc(record.why)}.</span>`, "abandoned"],
  withdrawn: () => [`${glyph.unlink}Withdrawn at ${esc(record.withdrawn ?? now())}. The item is back in the queue.`, "withdrawn"],
  cancelled: () => [`${icon("close")}Cancelled. Nothing reached ${esc(record.facts[0][1])}.`, "withdrawn"],
};

const byHand = !record.facts.some(([name]) => name === "template");
const WAYS = {
  pending: [["item", "file", "Item"], ["cancel", "close", "Cancel"]],
  delivered: [["item", "file", "Item"], ...(byHand ? [["template", glyph.template, "Save as template"]] : []),
    url ? ["open", "next", `Open in ${record.facts[0][1]}`, "primary"] : ["copy", "copy", "Copy path", "primary"]],
  abandoned: [["item", "file", "Item"], ["again", "route", "Route again", "primary"]],
  withdrawn: [["item", "file", "Item"], ["reinstate", glyph.link, "Reinstate", "primary"]],
  cancelled: [["item", "file", "Item", "primary"]],
};
const glyphOf = (ic) => (ic.startsWith("<svg") ? ic : icon(ic));

// Withdrawing is not one of the bar's everyday ways: it has a band of its own, under the words,
// and says what it does before it is pressed.
const apart = () => record.state !== "delivered" ? "" : `<h3 class="label">withdraw</h3>
  <button class="way danger" data-act="withdraw">${glyph.unlink}<span>Withdraw this record<small>For a note deleted or moved in ${esc(record.facts[0][1])}. Nothing there is touched; the item goes back to the queue.</small></span></button>`;

function render() {
  const [said, cls] = STATES[record.state]();
  $(".route-bar h1").textContent = attempt ? "tried" : "record";
  $(".excerpt").textContent = record.about;
  $(".step").innerHTML = `<p class="record-state ${cls}">${said}</p>
    <dl class="facts">${[...record.facts, ["decided", record.decided]].filter(([, value]) => value).map(([name, value]) =>
      `<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>
    <h3 class="written">as written</h3>
    <div class="preview"><pre>${esc(record.output)}</pre></div>
    ${apart()}`;
  const ways = WAYS[record.state];
  $(".route-foot").innerHTML = ways.length
    ? `<div class="toolbar">${ways.map(([act, ic, label, kind]) =>
      `<button class="pill ${kind ?? ""}" data-act="${act}">${glyphOf(ic)}${esc(label)}</button>`).join("")}</div>`
    : "";
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "back") return history.length > 1 ? history.back() : (location.href = "queue.html");
  if (act === "again") return (location.href = "route.html");
  if (act === "open") return;
  if (act === "copy") {
    const path = record.facts.find(([name]) => name === "file")?.[1] ?? "";
    await navigator.clipboard?.writeText(path).catch(() => {});
    b.lastChild.textContent = "Copied";
    return setTimeout(render, 1500);
  }
  if (act === "item") return (location.href = "queue.html");
  if (act === "template") return (location.href = "settings.html#templates/new");
  if (act === "cancel") {
    record.state = "cancelled";
    return render();
  }
  if (act === "reinstate") {
    record.state = "delivered";
    return render();
  }
  if (act === "withdraw") {
    const sure = await ask({
      title: "withdraw this record?",
      text: `${record.facts[0][1]} says the note is no longer there. Nothing there is touched. The record stays, marked withdrawn, and the item goes back to the queue.`,
      ways: [{ label: "Keep", value: false }, { label: "Withdraw", value: true, kind: "danger" }],
    });
    if (!sure) return;
    record.state = "withdrawn";
    record.withdrawn = now();
    render();
  }
});

render();
