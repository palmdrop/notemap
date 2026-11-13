// The design panel: which icon set draws the `#i-<role>` icons, and whether a wide window shows
// the screen at a phone's size. Choices are kept in localStorage; `?icons=<set>` overrides once.

const sets = await (await fetch(new URL("../icons/sets.json", import.meta.url))).json();
const params = new URLSearchParams(location.search);
const stored = (key, fallback) => localStorage.getItem(key) ?? fallback;

let iconSet = params.get("icons") ?? stored("nm-icons", "notemap");
if (!(iconSet in sets)) iconSet = "notemap";
let frame = params.get("frame") ?? stored("nm-frame", "phone");
let keyboard = params.has("keyboard") ? "on" : stored("nm-keyboard", "off");

const sprite = document.createElement("div");
sprite.hidden = true;
document.body.prepend(sprite);

async function useIcons(id) {
  iconSet = id;
  localStorage.setItem("nm-icons", id);
  sprite.innerHTML = await (await fetch(new URL(`../icons/${id}.svg`, import.meta.url))).text();
  document.documentElement.dataset.icons = id;
  panel.querySelector(".licence").textContent =
    `${sets[id].licence}, ${sets[id].author}` + (sets[id].missing.length ? `; lacks ${sets[id].missing.join(", ")}` : "");
}

function useFrame(value) {
  frame = value;
  localStorage.setItem("nm-frame", value);
  document.documentElement.dataset.frame = value;
}

const panel = document.createElement("aside");
panel.className = "design-panel";
panel.innerHTML = `
  <h2>design</h2>
  <label>icons
    <select name="icons">${Object.entries(sets)
      .map(([id, s]) => `<option value="${id}">${s.label}</option>`)
      .join("")}</select>
  </label>
  <p class="licence"></p>
  <label><input type="checkbox" name="frame"> phone frame</label>
  <label><input type="checkbox" name="keyboard"> keyboard, in the frame</label>
`;
document.body.append(panel);

const select = panel.querySelector("select[name=icons]");
select.value = iconSet;
select.addEventListener("change", () => useIcons(select.value));
const frameBox = panel.querySelector("[name=frame]");
frameBox.checked = frame === "phone";
frameBox.addEventListener("change", () => useFrame(frameBox.checked ? "phone" : "full"));
const keyboardBox = panel.querySelector("[name=keyboard]");
keyboardBox.checked = keyboard === "on";
keyboardBox.addEventListener("change", () => useKeyboard(keyboardBox.checked ? "on" : "off"));

// A phone keyboard drawn to scale, 390 by 300, with the suggestion bar. The screen above it shrinks
// as a phone's does when the page asks to be resized for the keyboard.
function drawKeyboard() {
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const keys = [];
  const key = (x, y, w, label, dark = false) =>
    keys.push(`<rect x="${x}" y="${y}" width="${w}" height="42" rx="5" fill="${dark ? "#abb0ba" : "#fff"}"/>` +
      `<text x="${x + w / 2}" y="${y + 27}" font-size="${label.length > 1 ? 14 : 20}" text-anchor="middle" font-family="Arial">${label}</text>`);
  const w = 33, gap = 6;
  rows.forEach((row, r) => {
    const width = row.length * w + (row.length - 1) * gap;
    const x0 = (390 - width) / 2;
    [...row].forEach((c, i) => key(x0 + i * (w + gap), 52 + r * 54, w, c));
  });
  key(3, 160, 42, "⇧", true);
  key(345, 160, 42, "⌫", true);
  key(3, 214, 88, "123", true);
  key(97, 214, 196, "space");
  key(299, 214, 88, "return", true);
  const words = ["the", "I", "it"].map((t, i) => `<text x="${65 + i * 130}" y="28" font-size="16" text-anchor="middle" font-family="Arial">${t}</text>`);
  return `<svg viewBox="0 0 390 300" xmlns="http://www.w3.org/2000/svg"><rect width="390" height="300" fill="#d3d5db"/>
    <line x1="130" y1="10" x2="130" y2="36" stroke="#abb0ba"/><line x1="260" y1="10" x2="260" y2="36" stroke="#abb0ba"/>
    ${words.join("")}${keys.join("")}</svg>`;
}
const board = document.createElement("div");
board.className = "mock-keyboard";
board.setAttribute("aria-hidden", "true");
board.innerHTML = drawKeyboard();
document.querySelector(".device")?.append(board);


function useKeyboard(value) {
  keyboard = value;
  localStorage.setItem("nm-keyboard", value);
  document.documentElement.dataset.keyboard = value;
}

const style = document.createElement("style");
style.textContent = `
  .design-panel { position: fixed; left: 1rem; top: 1rem; z-index: 10; width: 13rem; padding: .75rem;
    font: 12px/1.4 ui-monospace, monospace; background: #fff; border: 1px solid #bbb; }
  .design-panel h2 { margin: 0 0 .5rem; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
  .design-panel label { display: block; margin: .25rem 0; }
  .design-panel select { width: 100%; font: inherit; }
  .design-panel .licence { margin: .25rem 0 .75rem; color: #666; }
  @media (max-width: 719px) { .design-panel { display: none; } html.dev .design-panel { display: block; } }
`;
document.head.append(style);
if (params.has("dev")) document.documentElement.classList.add("dev");

useFrame(frame);
useKeyboard(keyboard);
localStorage.removeItem("nm-face");
localStorage.removeItem("nm-bar");
localStorage.removeItem("nm-morph");
await useIcons(iconSet);
