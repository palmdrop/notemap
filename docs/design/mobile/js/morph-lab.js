// Every morph variant drawn over the same buttons, side by side.

const icon = (name) => `<svg class="i"><use href="#i-${name}"></use></svg>`;

const ABOUT = {
  cut: "Now. Each button fills its whole part, cut straight at the pinch.",
  inset: "One unbroken outline, the same pinch. A pressed button is a pill set inside its part.",
  soft: "A shallower, longer pinch: the shape reads as one pebble with dents, not links.",
  neck: "A deep pinch: beads on a string. Each part is plainly its own button.",
  well: "Every button is a pale pill inside the shape, so each reads as pressable; pressed turns ink.",
  ring: "Pressed toggles get an ink ring inside their part; only a primary is filled.",
  slide: "Soft outline, and one pill that slides to what is chosen. A bar's primary sits still.",
};

const samples = `
  <div class="sample"><h3>toggle</h3>
    <div class="toggles morph" data-pick><button class="pill" aria-pressed="true">Newest first</button><button class="pill" aria-pressed="false">Oldest first</button></div></div>
  <div class="sample"><h3>toggle, three</h3>
    <div class="toggles morph" data-pick><button class="pill" aria-pressed="false">Auto</button><button class="pill" aria-pressed="true">Light</button><button class="pill" aria-pressed="false">Dark</button></div></div>
  <div class="sample"><h3>answers</h3>
    <div class="toggles morph" data-pick><button class="pill" aria-pressed="false">notemap</button><button class="pill" aria-pressed="false">garden</button><button class="pill" aria-pressed="false">street</button></div></div>
  <div class="sample row"><h3>item nav</h3>
    <span class="pos">3 of 12</span><div class="morph mini"><button class="pill" aria-label="Newer">${icon("chevron-left")}</button><button class="pill" aria-label="Older">${icon("chevron")}</button></div></div>
  <div class="sample"><h3>item bar</h3>
    <div class="morph toolbar"><button class="pill danger">${icon("trash")}Discard</button><button class="pill">${icon("check")}Done</button><button class="pill primary">${icon("route")}Route</button></div></div>
  <div class="sample"><h3>edit bar, and with nothing to save</h3>
    <div class="pair"><div class="morph toolbar"><button class="pill">${icon("close")}Cancel</button><button class="pill primary">${icon("check")}Save</button></div>
    <div class="morph toolbar"><button class="pill">${icon("close")}Cancel</button><button class="pill primary" disabled>${icon("check")}Save</button></div></div></div>
  <div class="sample"><h3>steps, the current one</h3>
    <div class="morph"><button class="pill">Where</button><button class="pill" aria-current="step">How</button><button class="pill">Place</button><button class="pill" disabled>Check</button></div></div>`;

const { MORPHS } = await import("./morph.js");
document.querySelector(".lab-grid").innerHTML = MORPHS.map((name) => `
  <section class="variant" data-morph="${name}">
    <h2>${name}</h2><p>${ABOUT[name]}</p>
    <div class="screenish">${samples}</div>
  </section>`).join("");

document.addEventListener("click", (e) => {
  const pill = e.target.closest("[data-pick] > .pill");
  if (!pill) return;
  for (const other of pill.parentElement.querySelectorAll(":scope > .pill")) other.setAttribute("aria-pressed", String(other === pill));
});
