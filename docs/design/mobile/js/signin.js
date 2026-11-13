// Signing in: the pool's password, once per browser. `?wrong` shows a password not accepted, and
// `?offline` a pool out of reach, where nothing can be signed in to.

import { OFFLINE, glyph } from "./glyphs.js";

const $ = (s, root = document) => root.querySelector(s);
const params = new URLSearchParams(location.search);
const field = $("input[name=password]");
const go = $("[data-act=sign-in]");
const said = $(".record-state");
const why = $(".bar-say");

function say(html, cls = "abandoned") {
  said.className = `record-state ${cls}`;
  said.innerHTML = html;
  said.hidden = false;
}
if (params.has("wrong")) say(`${glyph.lock}<span><b>Not accepted.</b> That password is not the pool's.</span>`);
if (OFFLINE) say(`${glyph.cloudOff}<span>The pool is out of reach, so nothing can be signed in to now. The page tries again when it answers.</span>`, "");

const ready = () => !!field.value && !OFFLINE;
field.addEventListener("input", () => {
  go.setAttribute("aria-disabled", String(!ready()));
  why.hidden = true;
});
go.addEventListener("click", (e) => {
  e.preventDefault();
  if (!ready()) {
    why.textContent = OFFLINE ? "The pool is out of reach." : "Give the password to sign in.";
    why.hidden = false;
    return field.focus();
  }
  location.href = "queue.html";
});
$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  go.click();
});
