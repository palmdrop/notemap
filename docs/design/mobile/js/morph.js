// Buttons that belong together, a toggle's options or a floating bar's actions, are one shape that
// pinches in between them. Any `.morph` on the page, now or later, is drawn. A pressed button
// flickers.
//
// How a pressed or primary button shows is the variant: `cut` fills its whole part of the shape,
// cut straight at the pinch; the others draw one unbroken outline and set a button inside it.
// `?morph=<variant>` picks one for the page; `data-morph` on an ancestor picks one for a part of it.

const VARIANTS = {
  cut: null,
  inset: { depth: 0.2, reach: 0.34 },
  soft: { depth: 0.1, reach: 0.62 },
  neck: { depth: 0.36, reach: 0.5 },
  well: { depth: 0.16, reach: 0.5, wells: true },
  ring: { depth: 0.14, reach: 0.5, ring: true },
  slide: { depth: 0.1, reach: 0.62, slide: true },
};
export const MORPHS = Object.keys(VARIANTS);

const asked = new URLSearchParams(location.search).get("morph");
if (asked && asked in VARIANTS) document.documentElement.dataset.morph = asked;

const curve = (x0, y0, x1, y1) => `C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}`;

function part(w, h, from, to) {
  const r = h / 2;
  const reach = h * 0.34;
  let d = from ? `M${from.x},${from.depth}` + curve(from.x, from.depth, from.x + reach, 0) : `M${r},0`;
  d += to ? `L${to.x - reach},0` + curve(to.x - reach, 0, to.x, to.depth) + `L${to.x},${h - to.depth}` + curve(to.x, h - to.depth, to.x - reach, h)
    : `L${w - r},0A${r},${r} 0 0 1 ${w - r},${h}`;
  d += from ? `L${from.x + reach},${h}` + curve(from.x + reach, h, from.x, h - from.depth) + "Z" : `L${r},${h}A${r},${r} 0 0 1 ${r},0Z`;
  return d;
}

// The whole shape as one path: no seam at a pinch, only the dip.
function outline(w, h, xs, { depth, reach }) {
  const r = h / 2;
  const dip = h * depth;
  const run = Math.min(h * reach, ...xs.map((x, i) => (i ? x - xs[i - 1] : x - r) / 2));
  let d = `M${r},0`;
  for (const x of xs) d += `L${x - run},0` + curve(x - run, 0, x, dip) + curve(x, dip, x + run, 0);
  d += `L${w - r},0A${r},${r} 0 0 1 ${w - r},${h}`;
  for (const x of [...xs].reverse()) d += `L${x + run},${h}` + curve(x + run, h, x, h - dip) + curve(x, h - dip, x - run, h);
  return d + `L${r},${h}A${r},${r} 0 0 1 ${r},0Z`;
}

const stateOf = (pill) => {
  const primary = pill.classList.contains("primary");
  return primary && pill.disabled ? "off"
    : primary || pill.getAttribute("aria-pressed") === "true" ? "on"
    : pill.hasAttribute("aria-current") ? "current" : "";
};

const bars = new WeakMap();
const resized = new ResizeObserver((entries) => entries.forEach((entry) => bars.get(entry.target)?.draw()));

function mount(bar) {
  bar.insertAdjacentHTML("afterbegin", `<svg class="morph-shape" aria-hidden="true"></svg>`);
  const svg = bar.querySelector(".morph-shape");
  const pills = () => [...bar.querySelectorAll(":scope > .pill")];
  let drawn = "";

  function draw() {
    const list = pills();
    const w = bar.offsetWidth;
    const h = bar.offsetHeight;
    if (!w) return;
    const name = bar.closest("[data-morph]")?.dataset.morph ?? "cut";
    const v = VARIANTS[name];
    bar.dataset.drawn = name;
    const xs = list.slice(1).map((pill, i) => (list[i].offsetLeft + list[i].offsetWidth + pill.offsetLeft) / 2);
    if (!v) {
      const gaps = xs.map((x) => ({ x, depth: h * 0.2 }));
      svg.innerHTML =
        list.map((pill, i) => `<path class="${stateOf(pill)}${pill.classList.contains("flicker") ? " flicker" : ""}" d="${part(w, h, gaps[i - 1], gaps[i])}" />`).join("") +
        `<path class="edge" d="${list.map((_, i) => part(w, h, gaps[i - 1], gaps[i])).join("")}" />`;
      drawn = "";
      return;
    }

    // A button inside its part: its own box, kept clear of the dip on either side.
    const inner = (pill, i) => {
      const run = h * v.reach * 0.35;
      const x0 = i ? Math.max(pill.offsetLeft, xs[i - 1] + run) : pill.offsetLeft;
      const x1 = i < xs.length ? Math.min(pill.offsetLeft + pill.offsetWidth, xs[i] - run) : pill.offsetLeft + pill.offsetWidth;
      const y = pill.offsetTop;
      const ph = pill.offsetHeight;
      return { x: x0, y, w: x1 - x0, h: ph, r: Math.min(ph / 2, (x1 - x0) / 2) };
    };
    const boxes = list.map(inner);
    const rect = ({ x, y, w: bw, h: bh, r }, cls, style = "") =>
      `<rect class="${cls}" x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${r}"${style} />`;

    const body = () => outline(w - 1, h - 1, xs.map((x) => x - 0.5), v);
    const shape = `<path class="body" transform="translate(0.5 0.5)" d="${body()}" />`;
    const wells = v.wells ? boxes.map((box) => rect(box, "well")).join("") : "";
    const flicks = list.map((pill, i) => (pill.classList.contains("flicker") ? rect(boxes[i], "flick") : "")).join("");

    if (v.slide) {
      const at = list.findIndex((pill) => stateOf(pill));
      const box = boxes[at];
      const cls = at < 0 ? "thumb gone" : `thumb ${stateOf(list[at])}`;
      if (!drawn || drawn !== `${name}${list.length}${w}`) {
        svg.innerHTML = `${shape}${rect(box ?? boxes[0], cls)}<g class="flicks"></g>`;
        drawn = `${name}${list.length}${w}`;
      } else {
        svg.querySelector(".body").setAttribute("d", body());
        const thumb = svg.querySelector(".thumb");
        if (thumb.getAttribute("class") !== cls) thumb.setAttribute("class", cls);
        if (box) Object.assign(thumb.style, { x: `${box.x}px`, width: `${box.w}px`, rx: `${box.r}px` });
      }
      svg.querySelector(".flicks").innerHTML = flicks;
      return;
    }

    drawn = "";
    const pressed = list.map((pill, i) => {
      const state = stateOf(pill);
      if (!state) return "";
      return rect(boxes[i], v.ring && state === "on" && !pill.classList.contains("primary") ? "ring" : state);
    }).join("");
    svg.innerHTML = shape + wells + pressed + flicks;
  }

  bar.addEventListener("pointerdown", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill || pill.parentElement !== bar || pill.disabled) return;
    pill.classList.add("flicker");
    setTimeout(() => pill.classList.remove("flicker"), 240);
  });

  new MutationObserver(draw).observe(bar, { subtree: true, attributes: true, attributeFilter: ["class", "aria-pressed", "aria-current", "disabled"] });
  bars.set(bar, { draw });
  resized.observe(bar);
  draw();
}

export function redraw() {
  for (const bar of document.querySelectorAll(".morph")) bars.get(bar)?.draw();
}

function mountWithin(root) {
  if (root.matches?.(".morph") && !bars.has(root)) mount(root);
  for (const bar of root.querySelectorAll?.(".morph") ?? []) if (!bars.has(bar)) mount(bar);
}

mountWithin(document);
new MutationObserver((changes) => changes.forEach((change) => change.addedNodes.forEach(mountWithin))).observe(document.body, {
  childList: true,
  subtree: true,
});
