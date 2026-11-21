// The capture page: words, attachments and tags. A template is applied by its trigger tag, and a
// template that asks something asks it as the tag is added.

import { mountTags } from "./tags.js";
import { templateOf } from "./templates.js";

const $ = (s, root = document) => root.querySelector(s);

const text = $("textarea[name=text]");
const held = $(".held");
const files = [];

const draft = JSON.parse(sessionStorage.getItem("nm-draft") ?? "null") ?? { text: "", tags: [] };
text.value = draft.text;

const icon = (name) => `<svg class="i"><use href="#i-${name}"></use></svg>`;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const now = () => new Date().toTimeString().slice(0, 5);

// A draft left by closing the page comes back; the page says so, once, with a way to start over.
const kept = $(".kept");
if (draft.text.trim() || draft.tags.length) {
  $("span", kept).textContent = `Draft kept from ${draft.at ?? now()}`;
  kept.hidden = false;
}
$("[data-act=clear]").addEventListener("click", () => {
  text.value = "";
  draft.tags = [];
  draft.answer = "";
  tags.set([]);
  kept.hidden = true;
  delete draft.at;
  save();
  text.focus();
});

const say = $(".capture-say");
const empty = () => !text.value.trim() && files.length === 0;
function save() {
  draft.text = text.value;
  if (!empty() || draft.tags.length) draft.at ??= now();
  sessionStorage.setItem("nm-draft", JSON.stringify(draft));
  $("[data-act=capture]").setAttribute("aria-disabled", String(empty()));
  firing();
  if (!empty()) say.hidden = true;
}

function renderHeld() {
  held.hidden = files.length === 0;
  held.replaceChildren(
    ...files.map((file, i) => {
      const figure = document.createElement("figure");
      figure.innerHTML = file.type.startsWith("image/")
        ? `<img src="${URL.createObjectURL(file)}" alt="" />`
        : `<span class="file">${esc(file.name)}</span>`;
      figure.insertAdjacentHTML("beforeend", `<button class="remove" aria-label="Remove ${esc(file.name)}">${icon("close")}</button>`);
      $(".remove", figure).addEventListener("click", () => {
        files.splice(i, 1);
        renderHeld();
        save();
      });
      return figure;
    }),
  );
}

// What the trigger tag will do once the capture is sent, under the tags.
function firing() {
  const template = draft.tags.map(templateOf).find(Boolean);
  const line = $(".capture-firing");
  line.hidden = !template;
  if (template) line.innerHTML = `${icon("route")}<span>Routes by <b>${esc(template.name)}</b>${draft.answer ? ` <small>list</small> <b>${esc(draft.answer)}</b>` : ""} once it is sent</span>`;
}

const sheet = $("#ask");
const veil = $(".veil");
let answered = null;
function ask(template) {
  $("h2", sheet).textContent = template.name.toLowerCase();
  $(".quick-what", sheet).textContent = `${template.place} in ${template.dest}: which list?`;
  $(".answers", sheet).innerHTML = template.ask.map((a) => `<li><button data-answer="${esc(a)}">${esc(a)}${icon("chevron")}</button></li>`).join("");
  sheet.hidden = veil.hidden = false;
  return new Promise((resolve) => (answered = resolve));
}
function unask(answer) {
  sheet.hidden = veil.hidden = true;
  answered?.(answer);
  answered = null;
}
sheet.addEventListener("click", (e) => {
  const b = e.target.closest("[data-answer]");
  if (b) unask(b.dataset.answer);
  if (e.target.closest("[data-act=unask]")) unask(null);
});
veil.addEventListener("click", () => unask(null));

const tags = mountTags($(".capture-tags"), {
  tags: [...draft.tags],
  onChange: async (next) => {
    const added = next.find((t) => !draft.tags.includes(t));
    const template = added && templateOf(added);
    if (template?.ask) {
      const answer = await ask(template);
      if (answer === null) return tags.set([...draft.tags]);
      draft.answer = answer;
    }
    if (!next.some(templateOf)) draft.answer = "";
    draft.tags = next;
    save();
  },
});

for (const input of document.querySelectorAll("input[type=file]"))
  input.addEventListener("change", () => {
    files.push(...input.files);
    input.value = "";
    renderHeld();
    save();
  });

text.addEventListener("input", save);

// An empty capture is not sent; pressing Save says why rather than doing nothing.
$("[data-act=capture]").addEventListener("click", () => {
  if (empty()) {
    say.textContent = "Nothing to capture yet: write something, or attach a file.";
    say.hidden = false;
    clearTimeout(say.timer);
    say.timer = setTimeout(() => (say.hidden = true), 4000);
    return text.focus();
  }
  const template = draft.tags.map(templateOf).find(Boolean);
  sessionStorage.setItem("nm-saved", JSON.stringify({ text: text.value.trim(), tags: draft.tags, time: now(), firing: template?.name ?? null, answer: draft.answer ?? "" }));
  sessionStorage.removeItem("nm-draft");
  location.href = "queue.html";
});

// iOS Safari does not resize the page for the keyboard; the visual viewport says how much is left.
if (window.visualViewport) {
  const fit = () => document.documentElement.style.setProperty("--viewport-height", `${visualViewport.height}px`);
  visualViewport.addEventListener("resize", fit);
  fit();
}

save();
