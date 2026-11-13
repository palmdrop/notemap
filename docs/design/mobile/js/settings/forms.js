// Making and changing a destination, a template or an account: a page each, a grey band for each
// part of it, and Cancel and Save floating at the foot. Nothing is kept until Save, and leaving
// with changes asks first.

import { ask } from "../dialog.js";
import {
  ACCOUNT_KINDS, DESTINATION_KINDS, FOLDER_MODES, KNOWN_ROOTS, OFFERED, PATTERNS,
  accounts, actionsFor, destinationOf, destinations, kindOf, slug, templates,
} from "./data.js";
import { glyph } from "../glyphs.js";
import { $, esc, icon, label, toolbar } from "./ui.js";

const LISTS = { destinations, templates, accounts };
const NOUN = { destinations: "destination", templates: "template", accounts: "account" };

let draft = null;

const copy = (x) => JSON.parse(JSON.stringify(x));

function start(section, id) {
  const key = `${section}/${id}`;
  if (draft?.key === key) return;
  const held = id === "new" ? null : LISTS[section].find((one) => one.id === id);
  const blank = {
    destinations: { name: "", kind: null, values: {} },
    templates: { name: "", tag: "", to: null, action: null, folder: "create", output: "everything", values: {}, asked: {} },
    accounts: { name: "", kind: null, values: {}, secret: "" },
  }[section];
  draft = { key, section, held, data: held ? { ...copy(held), secret: "" } : blank, dirty: false };
}

let browsing = null;
export const editing = () => draft !== null;
export const forget = () => (draft = null);

const field = (text, input, hint = "") =>
  `<div class="part"><label class="field"><span>${esc(text)}</span>${input}</label>${hint ? `<p class="hint">${esc(hint)}</p>` : ""}</div>`;
const input = (attrs, value = "", extra = "") =>
  `<input ${attrs} value="${esc(value ?? "")}" autocomplete="off" ${extra} />`;
const picks = (path, options, chosen, locked = () => false) =>
  `<div class="toggles one" data-pick="${path}">${options.map(([value, text]) =>
    `<button type="button" class="pill" data-value="${esc(value)}" aria-pressed="${chosen === value}"${locked(value) ? " disabled" : ""}>${esc(text)}</button>`).join("")}</div>`;
const choice = (text, path, options, chosen, hint = "") =>
  `<div class="part"><span class="field-name">${esc(text)}</span>${picks(path, options, chosen)}${hint ? `<p class="hint">${esc(hint)}</p>` : ""}</div>`;
// A choice left unset shows the kind's own default as picked, and stays unset until another is.
const defaulted = (f, values) =>
  choice(f.label, `values.${f.key}`, f.options.map((o) => [o, o]), values[f.key] ?? f.implied, f.hint);
const fixed = (text, value, hint) =>
  `<div class="part"><span class="field-name">${esc(text)}</span><p class="fixed">${esc(value)}</p><p class="hint">${esc(hint)}</p></div>`;

function kindFields(fields, values) {
  return fields.map((f) => {
    if (f.type === "choice") return defaulted(f, values);
    if (f.type === "account") {
      const held = accounts.filter((a) => a.kind === draft.data.kind);
      return `<div class="part"><span class="field-name">${esc(f.label)}</span>
        ${held.length ? picks(`values.${f.key}`, held.map((a) => [a.name, a.name]), values[f.key]) : `<p class="hint">No ${esc(DESTINATION_KINDS[draft.data.kind].label)} account yet.</p>`}
        <p class="hint">The address and the ${draft.data.kind === "arena" ? "token" : "password"} are the account's. <a href="#accounts/new">New account</a></p></div>`;
    }
    return field(`${f.label}${f.required ? "" : " (optional)"}`, input(`data-value-of="${f.key}"`, values[f.key]), f.hint);
  }).join("");
}

function destinationForm() {
  const d = draft.data;
  const kind = d.kind && DESTINATION_KINDS[d.kind];
  return label("destination") +
    field("name", input(`data-set="name" placeholder="what it is called when routing"`, d.name)) +
    (draft.held
      ? fixed("kind", kind.label, "A kind can't change once made: a record couldn't tell which destination it meant.")
      : choice("kind", "kind", Object.entries(DESTINATION_KINDS).map(([k, v]) => [k, v.label]), d.kind)) +
    (kind
      ? label(kind.label) + kindFields(kind.fields, d.values) +
        `<p class="record-state abandoned unfamiliar" hidden>${icon("folder")}Notemap has not used this folder before. Check it names the right place.</p>`
      : "");
}

function placeField(f) {
  const t = draft.data;
  const asked = Object.hasOwn(t.asked, f.key);
  if (f.type === "choice") return defaulted(f, t.values);
  if (f.type === "listed") {
    const d = destinationOf(t.to);
    return `<div class="part">
      <div class="field-head"><span class="field-name">${esc(f.label)}${f.required || asked ? "" : " (optional)"}</span>
        <button type="button" class="pill ask" data-ask="${f.key}" aria-pressed="${asked}">Ask each time</button></div>
      ${asked ? `<label class="field"><span>asked as</span>${input(`data-question-of="${f.key}"`, t.asked[f.key])}</label>` : ""}
      <span class="field-name">${asked ? "default (optional)" : "value"}</span>
      <button type="button" class="pick-row" data-browse="${f.key}" aria-expanded="${browsing === f.key}">${icon(f.from === "files" || f.from === "headings" ? "file" : f.from === "channels" ? "grid" : "folder")}<span>${esc(t.values[f.key] || "none picked")}</span><small>Browse ${esc(d.name)}</small>${icon(browsing === f.key ? "down" : "chevron")}</button>
      ${browsing === f.key ? `<ul class="radio-rows browse">${OFFERED[f.from].map((o) =>
        `<li><button type="button" data-browse-value="${esc(o)}" data-key="${f.key}" aria-pressed="${t.values[f.key] === o}"><span>${esc(o)}</span>${t.values[f.key] === o ? glyph.circleCheck : glyph.circle}</button></li>`).join("")}</ul>
        ${f.offeredOnly ? "" : `<label class="field"><span>or a new one</span>${input(`data-value-of="${f.key}"`, OFFERED[f.from].includes(t.values[f.key]) ? "" : t.values[f.key])}</label>`}` : ""}
      <p class="hint">${f.offeredOnly ? `Only what ${esc(d.name)} has.` : `From ${esc(d.name)}, or a new one typed in the picker.`}</p>
    </div>`;
  }
  const offered = f.type === "listed" ? OFFERED[f.from] : PATTERNS;
  return `<div class="part">
    <div class="field-head"><span class="field-name">${esc(f.label)}${f.required || asked ? "" : " (optional)"}</span>
      <button type="button" class="pill ask" data-ask="${f.key}" aria-pressed="${asked}">Ask each time</button></div>
    ${asked ? `<label class="field"><span>asked as</span>${input(`data-question-of="${f.key}"`, t.asked[f.key])}</label>` : ""}
    <label class="field"><span>${asked ? "default (optional)" : f.type === "pattern" ? "pattern" : "value"}</span>${input(`data-value-of="${f.key}"`, t.values[f.key], f.offeredOnly && !asked ? "readonly" : "")}</label>
    <div class="offered">${offered.map((o) => `<button type="button" class="tag" data-offer="${f.key}" data-value="${esc(o)}">${esc(o)}</button>`).join("")}</div>
    <p class="hint">${f.type === "listed" ? `From ${esc(destinationOf(t.to).name)}.${f.offeredOnly ? " Only these." : " Or type one."}` : esc(f.hint ?? "")}</p>
  </div>`;
}

function templateForm() {
  const t = draft.data;
  const d = t.to && destinationOf(t.to);
  const actions = d ? actionsFor(d) : [];
  const action = actions.find((a) => a.id === t.action);
  return label("template") +
    field("name", input(`data-set="name" placeholder="what it is called when routing"`, t.name)) +
    `<div class="part"><label class="field"><span>trigger tag (optional)</span>
      <span class="prefixed"><span>#route/</span>${input(`data-set="tag"`, t.tag)}</span></label>
      <p class="hint">An item tagged with it is routed by this template. Left blank, the template is only picked when routing.</p></div>` +
    label("where") + `<ul class="radio-rows" data-pick="to">${destinations.map((one) => {
      const off = one.reach === "disabled" || one.reach === "unusable";
      return `<li><button type="button" data-value="${one.id}" aria-pressed="${t.to === one.id}"${off ? " disabled" : ""}>${icon(kindOf(one).icon)}<span>${esc(one.name)}<small>${esc(kindOf(one).label)}${off ? `, ${one.reach}` : one.reach === "unavailable" ? ", unavailable" : ""}</small></span>${t.to === one.id ? glyph.circleCheck : glyph.circle}</button></li>`;
    }).join("")}</ul>` +
    (actions.some((a) => a.output)
      ? choice("output", "output", [["everything", "everything"], ["attachments", "attachments only"]], t.output)
      : "") +
    (d ? `<div class="part"><span class="field-name">action</span>${picks("action", actions.map((a) => [a.id, a.label]), t.action)}</div>` : "") +
    (action ? label("place") + action.fields.map(placeField).join("") : "") +
    (action?.folders
      ? label("if the folder is missing") + `<ul class="radio-rows" data-pick="folder">${FOLDER_MODES.map(([value, text]) =>
        `<li><button type="button" data-value="${value}" aria-pressed="${t.folder === value}"><span>${esc(text)}<small>${{
          create: "Made when it isn't there.",
          require: "The delivery is rejected when it isn't there.",
          establish: "Made the first time it is needed; after that it must exist.",
        }[value]}</small></span>${t.folder === value ? glyph.circleCheck : glyph.circle}</button></li>`).join("")}</ul>`
      : "");
}

function accountForm() {
  const a = draft.data;
  const kind = a.kind && ACCOUNT_KINDS[a.kind];
  return label("account") +
    (draft.held
      ? fixed("name", a.name, "Destinations name an account by this, so a new name is a new account.") + fixed("kind", kind.label, "")
      : field("name", input(`data-set="name" placeholder="what destinations call it"`, a.name)) +
        choice("kind", "kind", Object.entries(ACCOUNT_KINDS).map(([k, v]) => [k, v.label]), a.kind)) +
    (kind
      ? label(kind.label) + kindFields(kind.fields, a.values) +
        field(kind.secret, input(`type="password" data-set="secret" autocomplete="new-password"`, a.secret,
          draft.held ? `placeholder="set, leave blank to keep it"` : ""))
      : "");
}

// What still stands between the form and Save, in words, or nothing.
function missing() {
  const x = draft.data;
  const taken = (list) => list.some((one) => one !== draft.held && one.name.toLowerCase() === x.name.trim().toLowerCase());
  const unfilled = (fields) => fields.find((f) => f.required && !(x.values[f.key] ?? "").trim() && !Object.hasOwn(x.asked ?? {}, f.key));
  const list = { destinations, templates, accounts }[draft.section];
  if (!x.name.trim()) return "Name it to save.";
  if (taken(list)) return `There is already one named ${x.name.trim()}.`;
  if (draft.section === "destinations") {
    if (!x.kind) return "Pick a kind to save.";
    const f = unfilled(DESTINATION_KINDS[x.kind].fields);
    return f ? `Fill in the ${f.label} to save.` : "";
  }
  if (draft.section === "templates") {
    if (!x.to) return "Pick a destination to save.";
    const action = actionsFor(destinationOf(x.to)).find((a) => a.id === x.action);
    if (!action) return "Pick an action to save.";
    const f = unfilled(action.fields);
    return f ? `Pick the ${f.label}, or ask it each time, to save.` : "";
  }
  if (!x.kind) return "Pick a kind to save.";
  const f = unfilled(ACCOUNT_KINDS[x.kind].fields);
  if (f) return `Fill in the ${f.label} to save.`;
  return draft.held || x.secret ? "" : `Give the ${ACCOUNT_KINDS[x.kind].secret} to save.`;
}
const valid = () => !missing();

const unfamiliar = () =>
  draft.section === "destinations" && draft.data.kind === "filesystem" && !!draft.data.values.root?.trim() && !KNOWN_ROOTS.includes(draft.data.values.root.trim());

function check() {
  const save = $("[data-act=save]");
  if (!save) return;
  save.disabled = !valid();
  const why = $(".bar-say");
  if (why) {
    why.textContent = missing();
    why.hidden = valid();
  }
  const odd = unfamiliar();
  const warn = $(".unfamiliar");
  if (warn) warn.hidden = !odd;
  $("span", save).textContent = odd ? "Use it anyway" : "Save";
}

export function formPage(section, id) {
  start(section, id);
  const noun = NOUN[section];
  const body = { destinations: destinationForm, templates: templateForm, accounts: accountForm }[section]();
  return {
    title: draft.held ? `edit ${noun}` : `new ${noun}`,
    excerpt: draft.held?.name,
    closes: true,
    body: `<form class="form">${body}</form>`,
    foot: `<p class="bar-say" hidden></p>` + toolbar([["cancel", "close", "Cancel", "", false], ["save", "check", "Save", "primary", false]]),
    after: check,
  };
}

function redraw(render) {
  const at = $(".step").scrollTop;
  render();
  $(".step").scrollTop = at;
}

function setPath(target, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((o, k) => o[k], target)[last] = value;
}

export async function leave() {
  if (draft?.dirty) {
    const sure = await ask({
      title: "lose your changes?",
      text: "What you changed here is not kept anywhere else.",
      ways: [{ label: "Keep editing", value: false }, { label: "Lose changes", value: true, kind: "danger" }],
    });
    if (!sure) return false;
  }
  draft = null;
  return true;
}

function save() {
  const { section, held, data } = draft;
  const list = LISTS[section];
  const { secret, ...kept } = data;
  kept.name = kept.name.trim();
  let one = held;
  if (held) Object.assign(held, kept);
  else {
    let id = slug(kept.name);
    while (list.some((x) => x.id === id)) id += "-2";
    one = { ...kept, id };
    if (section === "destinations") Object.assign(one, { reach: "available", checked: "just now" });
    if (section === "templates") one.used = "nothing yet";
    if (section === "accounts") one.from = "stored";
    list.push(one);
  }
  if (section === "destinations" && held && held.reach !== "disabled") Object.assign(held, { reach: "available", checked: "just now" });
  draft = null;
  location.replace(`#${section}/${one.id}`);
}

export function bindForms(render) {
  document.addEventListener("input", (e) => {
    if (!draft || !e.target.closest(".form")) return;
    const el = e.target;
    if (el.dataset.set) draft.data[el.dataset.set] = el.value;
    if (el.dataset.valueOf) draft.data.values[el.dataset.valueOf] = el.value;
    if (el.dataset.questionOf) draft.data.asked[el.dataset.questionOf] = el.value;
    draft.dirty = true;
    check();
  });

  document.addEventListener("click", async (e) => {
    if (!draft) return;
    const pick = e.target.closest(".form [data-pick] [data-value]");
    if (pick) {
      const path = pick.closest("[data-pick]").dataset.pick;
      setPath(draft.data, path, pick.dataset.value);
      if (path === "kind") draft.data.values = {};
      if (path === "to") {
        const actions = actionsFor(destinationOf(draft.data.to));
        if (!actions.some((a) => a.id === draft.data.action)) draft.data.action = actions.length === 1 ? actions[0].id : null;
        draft.data.values = {};
        draft.data.asked = {};
      }
      draft.dirty = true;
      return redraw(render);
    }
    const browse = e.target.closest(".form [data-browse]");
    if (browse) {
      browsing = browsing === browse.dataset.browse ? null : browse.dataset.browse;
      return redraw(render);
    }
    const picked = e.target.closest(".form [data-browse-value]");
    if (picked) {
      draft.data.values[picked.dataset.key] = picked.dataset.browseValue;
      browsing = null;
      draft.dirty = true;
      return redraw(render);
    }
    const askIt = e.target.closest(".form [data-ask]");
    if (askIt) {
      const key = askIt.dataset.ask;
      if (Object.hasOwn(draft.data.asked, key)) delete draft.data.asked[key];
      else draft.data.asked[key] = `Which ${askIt.closest(".part").querySelector(".field-name").textContent.replace(" (optional)", "")}?`;
      draft.dirty = true;
      return redraw(render);
    }
    const offer = e.target.closest(".form [data-offer]");
    if (offer) {
      const key = offer.dataset.offer;
      const box = $(`[data-value-of="${key}"]`);
      const pattern = offer.dataset.value.startsWith("{{");
      box.value = pattern ? `${box.value}${offer.dataset.value}` : offer.dataset.value;
      draft.data.values[key] = box.value;
      draft.dirty = true;
      return check();
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "save" && valid()) return save();
    if (act === "cancel") {
      const back = draft.held ? `#${draft.section}/${draft.held.id}` : `#${draft.section}`;
      if (await leave()) location.replace(back);
    }
  });

  document.addEventListener("submit", (e) => {
    if (!e.target.closest(".form")) return;
    e.preventDefault();
    if (draft && valid()) save();
  });
}
