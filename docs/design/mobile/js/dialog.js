// A popup for what needs an answer before anything else: a refusal, a delete that loses something.
// Resolves with the chosen way's value, or null when dismissed.

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function ask({ title, text, ways }) {
  const veil = document.createElement("div");
  veil.className = "dialog-veil";
  veil.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
    <h2>${esc(title)}</h2><p>${esc(text)}</p>
    <div class="dialog-ways">${ways.map((w, i) => `<button class="pill ${w.kind ?? ""}" data-way="${i}">${esc(w.label)}</button>`).join("")}</div></div>`;
  (document.querySelector(".screen") ?? document.body).append(veil);
  veil.querySelector(".dialog-ways .primary, .dialog-ways .pill")?.focus();
  return new Promise((resolve) => {
    const done = (value) => {
      veil.remove();
      removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      done(null);
    };
    addEventListener("keydown", onKey, true);
    veil.addEventListener("click", (e) => {
      const way = e.target.closest("[data-way]");
      if (way) done(ways[way.dataset.way].value);
      else if (e.target === veil) done(null);
    });
  });
}
