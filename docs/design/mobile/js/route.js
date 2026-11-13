// The route page: one decision, in steps. A template is offered first and fills every later step
// but its questions; otherwise where, how, place, check. Each step is a history entry, so back
// steps back. The check lists every choice, and each of them opens its step again.

import { glyph } from "./glyphs.js";
import { mountTags } from "./tags.js";

const $ = (s, root = document) => root.querySelector(s);
// On a wide window the route is one surface: the item on the left, every step at once on the right.
const wide = () => document.documentElement.dataset.frame === "full" && matchMedia("(min-width: 900px)").matches;

const handed = JSON.parse(sessionStorage.getItem("nm-routing") ?? "null");
const item = handed ?? { text: "idea: a bike rack that folds flat into the hallway wall", pictures: [], tags: ["home", "idea"] };
item.tags ??= ["home"];
const captured = { date: "2026-11-03", time: "11:40" };

const DESTINATIONS = [
  { id: "vault", name: "Vault", icon: "folder", files: true },
  { id: "cloud", name: "Cloud", icon: "cloud", files: true },
  { id: "board", name: "Board", icon: "grid", files: false },
];
const TEMPLATES = [
  { name: "Todo", icon: "file", dest: "vault", makes: "append", shape: "task", where: "todo.md", file: () => "todo.md",
    under: "list", folderMode: "create",
    ask: [{ key: "list", question: "Which list?", options: ["Inbox", "Next", "Waiting on", "Someday"] }] },
  { name: "Project note", icon: "file", dest: "vault", makes: "append", shape: "list", where: "projects/",
    file: (a) => `projects/${a.project}.md`, under: "section", folderMode: "establish",
    ask: [
      { key: "project", question: "Which project?", options: ["notemap", "garden", "street"], typed: "Or a new one" },
      { key: "section", question: "Under which heading?", options: ["Ideas", "Questions", "Done"] },
    ] },
  { name: "To the vault", icon: "folder", dest: "vault", makes: "create", shape: "raw", where: "seeded/", folder: "seeded/", folderMode: "create" },
  { name: "To the cloud", icon: "cloud", dest: "cloud", makes: "create", shape: "raw", where: "seeded/", folder: "seeded/", folderMode: "create" },
  { name: "To the board", icon: "grid", dest: "board", makes: "block", where: "seeded", channel: "seeded" },
];
const FOLDER_MODES = { create: "Make it", require: "Must exist", establish: "Make it once, then must exist" };
const FOLDER_LINES = { create: "Made when it isn't there.", require: "The delivery is rejected when it isn't there." };
const TREES = {
  vault: ["journal/2026-10.md", "journal/2026-11.md", "projects/notemap/ideas.md", "projects/notemap/design.md",
    "projects/garden.md", "seeded/reading-list.md", "seeded/the-map-is-not-the-territory.md", "reading.md", "todo.md"],
  cloud: ["notes/2026-11-01.md", "seeded/the-whiteboard.md", "shared/recipes.md"],
};
const HEADINGS = { "todo.md": ["Inbox", "Next", "Waiting on", "Someday"], "reading.md": ["To read", "Read"] };
const CHANNELS = ["seeded", "reading", "ideas", "references"];
const MAKES = { create: "new note", append: "append", block: "new block" };
const SHAPES = { raw: "Raw", list: "List", task: "Task" };

// A new note's derived name: the first line as a slug, lower-case, a dash between words,
// apostrophes dropped, cut at a word near 40. A taken one is never appended to; it takes the
// first free sibling.
const derivedName = (text) => {
  const words = text.trim().split("\n")[0].normalize("NFC").toLowerCase().replace(/['’"“”]/g, "")
    .split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
  let slug = "";
  for (const w of words) {
    if (slug && slug.length + w.length + 1 > 40) break;
    slug += (slug ? "-" : "") + w;
  }
  return (slug || "capture") + ".md";
};

const fresh = () => ({
  template: null, answers: {}, dest: null, makes: null, shape: "raw", output: "everything", folderMode: "create",
  folder: "seeded/", name: derivedName(item.text), file: null, heading: null, channel: null,
  words: null, editing: false, query: "", open: new Set(["seeded/"]),
});
let s = fresh();
let at = "where";

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const icon = (name, cls = "") => `<svg class="i ${cls}"><use href="#i-${name}"></use></svg>`;
const dest = () => DESTINATIONS.find((d) => d.id === (tpl()?.dest ?? s.dest));
const tpl = () => TEMPLATES.find((t) => t.name === s.template);
const makes = () => tpl()?.makes ?? s.makes;
const shape = () => tpl()?.shape ?? s.shape;

const path = () => (s.template ? ["where", ...(tpl().ask ?? []).map((a) => a.key), "check"] : ["where", "how", "place", "check"]);
const askOf = (step) => tpl()?.ask?.find((a) => a.key === step);
const fileName = () => (s.name.endsWith(".md") ? s.name : s.name + ".md");

// A name already in the folder is never appended to: a derived one takes the first free sibling
// by itself, and a typed one is offered it.
function takenBy() {
  const folder = s.folder === "/" ? "" : s.folder;
  const files = TREES[dest().id] ?? [];
  if (s.makes !== "create" || !files.includes(folder + fileName())) return null;
  let n = 1;
  let free;
  do free = fileName().replace(/\.md$/, `-${n++}.md`);
  while (files.includes(folder + free));
  return { path: folder + fileName(), folder: folder || "/", free, derived: fileName() === derivedName(item.text) };
}
const finalName = () => (takenBy()?.derived ? takenBy().free : fileName());

function ready(step) {
  if (step === "where") return !!(s.dest || s.template);
  if (askOf(step)) return !!s.answers[step]?.trim();
  if (step === "how") return !!s.makes;
  if (step === "place") {
    if (s.makes === "create") return !!s.name.trim() && (!takenBy() || takenBy().derived);
    if (s.makes === "append") return !!s.file;
    return !!s.channel;
  }
  return true;
}

function go(step, push = true) {
  at = step;
  if (push && !wide()) history.pushState({ at }, "");
  render();
}
addEventListener("popstate", (e) => {
  if (routed) return location.replace("queue.html");
  at = e.state?.at ?? "where";
  if (at === "where" && s.template) s.template = null;
  render();
});
history.replaceState({ at }, "");

const row = ({ act, x = "", name, sub = "", ic, end = "", pressed = null, cls = "" }) =>
  `<li><button class="row ${ic ? "" : "plain"} ${cls}" data-act="${act}" data-x="${esc(x)}"${pressed === null ? "" : ` aria-pressed="${pressed}"`}>
    ${ic ? icon(ic) : ""}<span><b>${name}</b>${sub ? `<small>${sub}</small>` : ""}</span>${end}</button></li>`;
const pills = (act, options, current) =>
  `<div class="toggles one">${options.map(([value, label]) =>
    `<button class="pill" data-act="${act}" data-x="${esc(value)}" aria-pressed="${current === value}">${esc(label)}</button>`).join("")}</div>`;

function tree(files, { pick }) {
  if (s.query.trim()) {
    const q = s.query.trim().toLowerCase();
    const folders = [...new Set(files.flatMap((f) => f.split("/").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("/") + "/")))];
    const hits = [...(pick === "folder" ? ["/", ...folders] : files)].filter((p) => p.toLowerCase().includes(q));
    return `<ul class="tree">${hits.map((p) => treeRow(p, 0, pick, false, true)).join("") || `<li class="none">Nothing matches</li>`}</ul>`;
  }
  const rows = [];
  if (pick === "folder") rows.push(treeRow("/", 0, pick, false));
  const walk = (prefix, depth) => {
    const here = files.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length));
    const folders = [...new Set(here.filter((f) => f.includes("/")).map((f) => f.split("/")[0] + "/"))].sort();
    const leaves = here.filter((f) => !f.includes("/")).sort();
    for (const folder of folders) {
      const full = prefix + folder;
      const open = s.open.has(full);
      rows.push(treeRow(full, depth, pick, open));
      if (open) walk(full, depth + 1);
    }
    for (const leaf of leaves) rows.push(treeRow(prefix + leaf, depth, pick, false));
  };
  walk("", pick === "folder" ? 1 : 0);
  return `<ul class="tree">${rows.join("")}</ul>`;
}

function treeRow(full, depth, pick, open, flat = false) {
  const folder = full.endsWith("/");
  const name = flat ? full : full === "/" ? "/" : full.replace(/\/$/, "").split("/").pop() + (folder ? "/" : "");
  const selectable = pick === "folder" ? folder : !folder;
  const selected = pick === "folder" ? s.folder === full : s.file === full;
  return `<li><button class="node" style="--depth:${depth}" data-act="${selectable ? "pick" : "toggle"}" data-x="${esc(full)}" aria-pressed="${selected}"${selectable ? "" : ` aria-expanded="${open}"`}>
    ${folder && full !== "/" && !flat ? `<span class="twist" data-act="toggle" data-x="${esc(full)}">${icon(open ? "down" : "chevron")}</span>` : `<span class="twist"></span>`}
    ${icon(folder ? "folder" : "file")}<span class="name">${esc(name)}</span></button></li>`;
}

const STEPS = {
  where: () => `
    <h3 class="label">Templates</h3>
    <ul class="rows">${TEMPLATES.map((t) =>
      row({ act: "template", x: t.name, name: t.name + (t.ask ? `<span class="tag">asks</span>` : ""), ic: t.icon,
        sub: `${t.where} in ${DESTINATIONS.find((d) => d.id === t.dest).name}`,
        end: icon("chevron", "end") })).join("")}</ul>
    <h3 class="label">Destinations</h3>
    <ul class="rows">${DESTINATIONS.map((d) =>
      row({ act: "dest", x: d.id, name: d.name, ic: d.icon, end: icon("chevron", "end"), pressed: s.dest === d.id && !s.template })).join("")}</ul>
    <h3 class="label">Other</h3>
    <ul class="rows">
      ${row({ act: "done", name: "Done", ic: "check" })}
      ${row({ act: "discard", name: "Discard", ic: "trash", cls: "danger" })}
    </ul>`,


  how: () => {
    const d = dest();
    return `<div class="part"><h3>Action</h3>${pills("makes", d.files ? [["create", "New note"], ["append", "Append"]] : [["block", "New block"]], s.makes)}</div>
      ${d.files ? `<div class="part"><h3>Shape</h3>${pills("shape", Object.entries(SHAPES), s.shape)}</div>` : ""}
      ${item.pictures.length ? `<div class="part"><h3>Send</h3>${pills("output", [["everything", "Everything"], ["pictures", "Attachments only"]], s.output)}</div>` : ""}`;
  },

  place: () => {
    const d = dest();
    const search = (placeholder) => `<label class="find">${icon("search")}<input name="query" placeholder="${placeholder}" value="${esc(s.query)}" autocomplete="off" /></label>`;
    if (s.makes === "block")
      return `${search("Find a channel")}<ul class="tree">${CHANNELS.filter((c) => c.includes(s.query.trim().toLowerCase())).map((c) =>
        `<li><button class="node" style="--depth:0" data-act="channel" data-x="${esc(c)}" aria-pressed="${s.channel === c}"><span class="twist"></span>${icon("grid")}<span class="name">${esc(c)}</span></button></li>`).join("")}</ul>`;
    if (s.makes === "append")
      return `${search(`Find a note in ${d.name}`)}${tree(TREES[d.id], { pick: "file" })}
        ${s.file && HEADINGS[s.file] ? `<h3 class="label">under</h3>${radioRows("heading", [...HEADINGS[s.file].map((h) => [h, `## ${h}`]), ["", "At the end of the note"]], s.heading ?? "")}` : ""}`;
    return `${search(`Find a folder in ${d.name}`)}${tree(TREES[d.id], { pick: "folder" })}
      <label class="field"><span>File name</span><input name="name" value="${esc(s.name)}" autocomplete="off" /></label>
      <div class="taken-slot">${taken()}</div>${tpl() ? "" : folderPart()}`;
  },

  check: () => {
    const steps = path();
    const rows = facts().map(([name, value]) => {
      const step = stepOf(name);
      return step && steps.includes(step)
        ? `<div class="change"><dt>${name}</dt><dd><button data-act="goto" data-x="${step}" aria-label="Change the ${name}">${value}</button>${icon("chevron")}</dd></div>`
        : fixedByTemplate(name)
        ? `<div class="change"><dt>${name}</dt><dd><button data-act="unpin" data-x="${name}" aria-label="Change the ${name} for this route">${value}<small>set by ${esc(tpl().name)}; change it for this route</small></button>${icon("chevron")}</dd></div>`
        : `<div><dt>${name}</dt><dd>${value}</dd></div>`;
    }).join("");
    return `<dl class="facts">${rows}</dl>
      <h3 class="label">tags</h3>
      <ul class="check-tags tag-line"></ul>
      <p class="hint tags-hint">The item's own tags: a change here is a change to the item.</p>
      <h3 class="written">as it will be written</h3>
      <div class="preview">${s.editing
        ? `<textarea name="words" aria-label="The words, for this route only">${esc(s.words ?? item.text)}</textarea>`
        : `<pre>${esc(output(shape(), makes()))}</pre>`}</div>
      ${s.editing ? `<p class="hint">These words go to ${esc(dest().name)} only. The item keeps its own.</p>` : `<div class="under-preview"><button class="pill lone" data-act="edit">${icon("edit")}Edit</button></div>`}`;
  },
};

// A place the template fixes can still be changed for one route: the route stops being the
// template's and carries on by hand from the template's choices.
const fixedByTemplate = (name) => !!tpl() && ["file", "folder", "channel"].includes(name);
function unpin() {
  const t = tpl();
  const answers = s.answers;
  s = { ...fresh(), dest: t.dest, makes: t.makes, shape: t.shape ?? "raw", folderMode: t.folderMode ?? "create", words: s.words };
  if (t.makes === "append") Object.assign(s, { file: t.file(answers), heading: answers[t.under] ?? null });
  if (t.makes === "create") s.folder = t.folder;
  if (t.makes === "block") s.channel = t.channel;
  go("place");
}

// Which step a fact on the check came from, so tapping it goes back there.
function stepOf(name) {
  const t = tpl();
  if (!t) return { destination: "where", action: "how", shape: "how", file: "place", channel: "place", heading: "place", "if missing": "place" }[name];
  if (name === "template") return "where";
  if (name === "heading") return t.ask?.find((a) => a.key === t.under)?.key;
  if (name === "file") return t.ask?.find((a) => a.key === "project")?.key;
  return null;
}

const radioRows = (act, options, current) =>
  `<ul class="radio-rows">${options.map(([value, text, line]) =>
    `<li><button data-act="${act}" data-x="${esc(value)}" aria-pressed="${current === value}"><span>${esc(text)}${line ? `<small>${esc(line)}</small>` : ""}</span>${current === value ? glyph.circleCheck : glyph.circle}</button></li>`).join("")}</ul>`;

function askStep(a) {
  const typed = a.typed && s.answers[a.key] && !a.options.includes(s.answers[a.key]) ? s.answers[a.key] : "";
  // Side by side with every other step, an answer is picked, not moved on from.
  const answers = wide() ? radioRows("answer", a.options.map((o) => [o, o]), s.answers[a.key])
    : `<ul class="rows">${a.options.map((o) =>
      row({ act: "answer", x: o, name: esc(o), end: icon("chevron", "end"), pressed: s.answers[a.key] === o })).join("")}</ul>`;
  return `<h3 class="label">${esc(a.question)}</h3>
    ${answers}
    ${a.typed ? `<label class="field"><span>${esc(a.typed)}</span><input name="answer" value="${esc(typed)}" autocomplete="off" /></label>` : ""}`;
}

function taken() {
  const t = takenBy();
  if (!t) return "";
  if (t.derived) return `<p class="hint taken-note"><b>${esc(fileName())}</b> is already in ${esc(t.folder)}, so this one is <b>${esc(t.free)}</b>.</p>`;
  return `<div class="taken"><p><b>${esc(fileName())}</b> is already in ${esc(t.folder)}</p>
    <div class="taken-ways"><button class="pill lone" data-act="free-name" data-x="${esc(t.free)}">Name it ${esc(t.free)}</button></div></div>`;
}

const folderPart = () => `<h3 class="label">if the folder is missing</h3>${radioRows("folder-mode", ["create", "require"].map((m) => [m, FOLDER_MODES[m], FOLDER_LINES[m]]), s.folderMode)}`;

function facts(raw = false) {
  const t = tpl();
  const m = makes();
  const path = m === "block" ? t?.channel ?? s.channel
    : m === "append" ? (t ? t.file(s.answers) : s.file)
    : (t?.folder ?? s.folder).replace(/^\//, "") + finalName();
  const under = t ? s.answers[t.under] : s.heading;
  return [
    ["destination", dest().name],
    ["action", MAKES[m]],
    ...(m === "block" ? [] : [["shape", SHAPES[shape()].toLowerCase()]]),
    [m === "block" ? "channel" : "file", path],
    ...(m === "append" ? [["heading", under ? `## ${under}` : "The end"]] : []),
    ...(m === "create" ? [["if missing", FOLDER_MODES[t?.folderMode ?? s.folderMode]]] : []),
    ...(t ? [["template", t.name]] : []),
  ].map(([name, value]) => [name, raw ? value : esc(value)]);
}

const table = (list) =>
  `<dl class="facts">${list.map(([name, value, cls = ""]) =>
    `<div class="${cls}"><dt>${name}</dt><dd>${value}</dd></div>`).join("")}</dl>`;

function output(sh, m) {
  const words = s.words ?? item.text;
  const tags = item.tags.filter((t) => !t.startsWith("route/")).map((t) => `#${t}`).join(" ");
  if (m === "block") return words;
  if (sh === "task") return `- [ ] ${words.split("\n").join("\n  ")} ${tags}`;
  if (sh === "list") return `- ${words.split("\n").join("\n  ")} ${tags}`;
  return `---\ncaptured_at: ${captured.date}T${captured.time}\ntags: [${item.tags.filter((t) => !t.startsWith("route/")).join(", ")}]\n---\n\n${words}`;
}

// No trail of steps: the header says which step of how many, the bar goes back or on, and the
// check shows every choice at once. Picking a row moves on by itself; the bar is for the rest.
function renderSteps() {
  const steps = path();
  const here = steps.indexOf(at);
  $(".step-of").innerHTML = `<span>${askOf(at) ? "question" : at}</span><span>${here + 1} of ${steps.length}</span>`;
  if (at === "where") return ($(".steps").innerHTML = "");
  // A question's answers move on as they are tapped; Next is there only for one typed instead.
  const typedOnly = askOf(at) && !askOf(at).typed;
  const onward = at === "check"
    ? `<button class="pill primary" data-act="route">${icon("route")}Route</button>`
    : typedOnly ? ""
    : `<button class="pill primary" data-act="goto" data-x="${steps[here + 1]}"${ready(at) ? "" : " disabled"}>${icon("next")}Next</button>`;
  $(".steps").innerHTML = `<div class="toolbar"><button class="pill" data-act="back">${icon("back")}Back</button>${onward}</div>`;
}

// Every step at once: a step that waits on an earlier one says so in a line, and the place a
// template or destination was picked from folds to one row once it is picked.
const section = (name, body, key = "") =>
  `<section class="sec" data-sec="${name}"${key ? ` data-ask="${esc(key)}"` : ""}><h2 class="sec-head">${esc(name)}</h2>${body}</section>`;
const waits = (name, on) => section(name, `<p class="hint waiting">${on}</p>`);

function allReady() {
  return path().filter((step) => step !== "check").every(ready);
}

function why() {
  if (!s.dest && !s.template) return "Pick a template or a destination to route.";
  const step = path().find((st) => st !== "check" && !ready(st));
  if (askOf(step)) return `Answer “${askOf(step).question}” to route.`;
  if (step === "place") return s.makes === "create" ? "Name the note to route." : s.makes === "append" ? "Pick a note to append to." : "Pick a channel to route.";
  return "";
}

function renderWide() {
  $(".step-of").innerHTML = "";
  const t = tpl();
  const picked = t ?? dest();
  const parts = [];
  if (!picked) parts.push(section("where", STEPS.where().replace(/<h3 class="label">Other<\/h3>[\s\S]*$/, "")));
  else parts.push(section("where", `<ul class="rows">${row({ act: "change-where", name: esc(picked.name), ic: picked.icon,
    sub: t ? `template: ${esc(t.where)} in ${esc(DESTINATIONS.find((d) => d.id === t.dest).name)}` : "destination", end: `<span class="end-word">Change</span>` })}</ul>`));
  if (t) {
    for (const a of t.ask ?? []) parts.push(section(a.question, askStep(a).replace(/^\s*<h3 class="label">[\s\S]*?<\/h3>/, ""), a.key));
    parts.push(section("check", STEPS.check()));
  } else if (s.dest) {
    parts.push(section("how", STEPS.how()), section("place", STEPS.place()), section("check", STEPS.check().replace(/^\s*<dl class="facts">[\s\S]*?<\/dl>/, "")));
  } else {
    const first = "Pick a template or a destination first.";
    parts.push(waits("how", first), waits("place", first), waits("check", first));
  }
  $(".step").innerHTML = parts.join("");
  const reason = allReady() ? "" : why();
  $(".steps").innerHTML = `${reason ? `<p class="bar-say">${esc(reason)}</p>` : ""}<div class="toolbar">
    <button class="pill primary" data-act="route"${reason ? ' aria-disabled="true"' : ""}>${icon("route")}Route</button></div>`;
}

function renderWideFoot() {
  const reason = allReady() ? "" : why();
  const say = $(".steps .bar-say");
  if (reason && !say) $(".steps").insertAdjacentHTML("afterbegin", `<p class="bar-say"></p>`);
  if (!reason) say?.remove();
  if (reason) $(".steps .bar-say").textContent = reason;
  $(".steps [data-act=route]")?.setAttribute("aria-disabled", String(!!reason));
}

function renderNote() {
  const note = $(".route-note");
  note.hidden = !wide();
  if (note.hidden) return;
  $(".toolbar", note).hidden = routed;
  $(".rn-when", note).textContent = `${captured.date} ${captured.time}`;
  $(".rn-words", note).textContent = item.text;
  $(".rn-pictures", note).innerHTML = item.pictures.map((src) => `<img src="${esc(src)}" alt="" />`).join("");
}

function render() {
  $(".route-bar h1").textContent = "route";
  renderNote();
  if (wide()) {
    $(".route-done").innerHTML = "";
    renderWide();
    return mountCheckTags();
  }
  $(".excerpt").textContent = item.about ?? item.text.split("\n")[0];
  renderSteps();
  $(".route-done").innerHTML = "";
  $(".step").innerHTML = askOf(at) ? askStep(askOf(at)) : STEPS[at]();
  $(".step").scrollTop = 0;
  mountCheckTags();
}

function mountCheckTags() {
  const list = $(".check-tags");
  if (list) mountTags(list, { tags: [...item.tags], onChange: (tags) => {
    item.tags = tags;
    const pre = $(".preview pre");
    if (pre) pre.textContent = output(shape(), makes());
  } });
}

// Routing replaces the check in history, and back from here leaves for where the route began:
// only Cancel, inside the window, steps back into the steps.
let routed = false;
function done() {
  routed = true;
  $(".route-note .toolbar").hidden = true;
  history.replaceState({ at: "done" }, "");
  $(".steps").innerHTML = "";
  $(".step-of").textContent = "";
  $(".route-bar h1").textContent = "routed";
  $(".step").innerHTML = `${table([
    ...facts(), ["state", `<span class="state"><span class="spinner"></span><span>Routing to <b>${esc(dest().name)}</b>, <span class="secs">5</span>s to cancel</span></span>`, "pending"]])}
    <h3 class="label">and then</h3>
    <ul class="rows after">
      ${row({ act: "again", name: "Route it somewhere else too", ic: "route", end: icon("chevron", "end") })}
      ${s.template ? "" : `<li><a class="row" href="settings.html#templates/new">${glyph.template}<span><b>Save this as a template</b></span>${icon("chevron", "end")}</a></li>`}
      <li><a class="row" href="queue.html">${icon("file")}<span><b>Open the item</b></span>${icon("chevron", "end")}</a></li>
    </ul>`;
  $(".route-done").innerHTML = `<div class="toolbar"><button class="pill" data-act="undo">${icon("close")}Cancel</button><a class="pill primary" href="queue.html">${icon("next")}Next item</a></div>`;
  let secs = 5;
  const timer = setInterval(() => {
    secs--;
    const secsEl = $(".secs");
    if (!secsEl) return clearInterval(timer);
    if (secs > 0) return (secsEl.textContent = secs);
    clearInterval(timer);
    if (dest().id === "cloud") return rejected();
    $(".state").innerHTML = `${icon("check")}Delivered to <b>${esc(dest().name)}</b>`;
    $(".facts .pending").className = "delivered";
    $("[data-act=undo]")?.replaceWith(Object.assign(document.createElement("a"), {
      className: "pill", href: "record.html", innerHTML: `${icon("file")}Record`,
      onclick: () => sessionStorage.setItem("nm-record", JSON.stringify({
        about: item.about ?? item.text, state: "delivered", facts: facts(true), decided: `${captured.date} ${new Date().toTimeString().slice(0, 5)}`,
        delivered: new Date().toTimeString().slice(0, 5), output: output(shape(), makes()),
      })),
    }));
  }, 1000);
}

// The destination turned the delivery down once the window closed: said on the page, in a box
// above what was decided, and kept among the notices. The item is back in the queue.
function rejected() {
  const why = "Cloud's seeded/ folder is read-only to notemap";
  $(".route-bar h1").textContent = "rejected";
  $(".state").innerHTML = `Not delivered`;
  $(".facts .pending").className = "";
  $(".after")?.previousElementSibling?.remove();
  $(".after")?.remove();
  $(".step").insertAdjacentHTML("afterbegin", `<p class="record-state abandoned">${icon("route")}<span><b>Rejected by Cloud:</b> ${why}. Nothing was written; the item is back in the queue.</span></p>`);
  $(".route-done").innerHTML = `<div class="toolbar"><a class="pill" href="queue.html">${icon("back")}Queue</a><button class="pill primary" data-act="again">${icon("route")}Route elsewhere</button></div>`;
  const notices = JSON.parse(sessionStorage.getItem("nm-notices") ?? "[]");
  notices.push({ what: "Rejected by <b>Cloud</b>", about: item.about ?? item.text, why: why + ". The item is back in the queue." });
  sessionStorage.setItem("nm-notices", JSON.stringify(notices));
}

function restart() {
  s = fresh();
  go("where");
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const { act, x } = b.dataset;
  if (act === "template") {
    s = { ...fresh(), template: x };
    return go(path()[1]);
  }
  if (act === "dest") {
    s = { ...fresh(), dest: x };
    s.makes = dest().files ? "create" : "block";
    return go("how");
  }
  if (act === "done" || act === "discard") {
    sessionStorage.setItem("nm-decided", JSON.stringify({ kind: act, about: item.about ?? item.text.split("\n")[0] }));
    return (location.href = "queue.html");
  }
  if (act === "answer" && wide()) { s.answers[b.closest("[data-ask]").dataset.ask] = x; return render(); }
  if (act === "answer") { s.answers[at] = x; return go(path()[path().indexOf(at) + 1]); }
  if (act === "change-where") { s = fresh(); return render(); }
  if (act === "free-name") { s.name = x; return render(); }
  if (act === "folder-mode") { s.folderMode = x; return render(); }
  if (act === "again") return restart();
  if (act === "makes") { s.makes = x; s.shape = x === "append" ? "task" : "raw"; return render(); }
  if (act === "shape") { s.shape = x; return render(); }
  if (act === "output") { s.output = x; return render(); }
  if (act === "toggle") {
    e.stopPropagation();
    s.open.has(x) ? s.open.delete(x) : s.open.add(x);
    return render();
  }
  if (act === "pick") {
    if (x.endsWith("/")) s.folder = x;
    else { s.file = x; s.heading = HEADINGS[x]?.[0] ?? null; }
    s.query = "";
    return render();
  }
  if (act === "heading") { s.heading = x || null; return render(); }
  if (act === "channel") { s.channel = x; return render(); }
  if (act === "edit") { s.editing = true; render(); return $("textarea[name=words]").focus(); }
  if (act === "goto" && wide()) return $(`[data-sec="${x}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  if (act === "goto") return go(x);
  if (act === "unpin") return unpin();
  if (act === "route" && b.getAttribute("aria-disabled") === "true") return;
  if (act === "route") return done();
  if (act === "undo") {
    routed = false;
    history.replaceState({ at: "check" }, "");
    return go("check", false);
  }
  if (act === "back") return history.back();
});

document.addEventListener("input", (e) => {
  if (e.target.name === "name") s.name = e.target.value;
  if (e.target.name === "words") s.words = e.target.value;
  if (e.target.name === "query") {
    s.query = e.target.value;
    const caret = e.target.selectionStart;
    render();
    const input = $("input[name=query]");
    input.focus();
    input.setSelectionRange(caret, caret);
  }
  if (e.target.name === "answer") {
    s.answers[e.target.closest("[data-ask]")?.dataset.ask ?? at] = e.target.value;
    document.querySelectorAll(`[data-act=answer]`).forEach((b) => b.setAttribute("aria-pressed", "false"));
  }
  if (e.target.name === "name") $(".taken-slot").innerHTML = taken();
  if (["name", "answer"].includes(e.target.name)) wide() ? renderWideFoot() : renderSteps();
});

const asked = new URLSearchParams(location.search).get("template");
if (TEMPLATES.some((t) => t.name === asked)) {
  s = { ...fresh(), template: asked };
  at = path()[1];
  history.replaceState({ at: "where" }, "");
  history.pushState({ at }, "");
}
render();
matchMedia("(min-width: 900px)").addEventListener("change", render);
