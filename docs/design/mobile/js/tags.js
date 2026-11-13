// One tag editor for every view: the tags as tags, each removable, and `+ tag`, which becomes a
// tag you type into, offering the pool's tags as you go. A trigger tag says which template it fires.

export const KNOWN = [
  { name: "home" },
  { name: "work" },
  { name: "reading" },
  { name: "recipe" },
  { name: "idea" },
  { name: "garden" },
  { name: "route/todo", template: "Todo" },
  { name: "route/vault", template: "To the vault" },
  { name: "route/cloud", template: "To the cloud" },
  { name: "route/board", template: "To the board" },
];

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const icon = (name) => `<svg class="i"><use href="#i-${name}"></use></svg>`;
const known = (name) => KNOWN.find((k) => k.name === name);

const lockGlyph = `<svg class="i lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;

// A trigger tag is drawn as the route it fires, without its `route/`. While its route is in the
// window it is locked: cancelling the route is how it comes off.
export function mountTags(list, { tags = [], onChange = () => {}, locked = () => false } = {}) {
  list.classList.add("tag-list");
  let entering = false;

  function render() {
    list.innerHTML =
      tags
        .map((t, i) => {
          const trigger = known(t)?.template ?? (t.startsWith("route/") ? t.slice(6) : null);
          if (trigger) {
            const shut = locked(t);
            return `<li><span class="tag trigger${shut ? " locked" : ""}" title="#${esc(t)}: routed by ${esc(trigger)}${shut ? ". Cancel the route to take it off" : ""}">${icon("route")}${esc(t.replace(/^route\//, ""))}${shut ? lockGlyph : `<button data-untag="${i}" aria-label="Remove #${esc(t)}">${icon("close")}</button>`}</span></li>`;
          }
          return `<li><span class="tag">#${esc(t)}<button data-untag="${i}" aria-label="Remove #${esc(t)}">${icon("close")}</button></span></li>`;
        })
        .join("") +
      (entering
        ? `<li class="tag-entry"><span class="tag editing">#<input aria-label="New tag" autocomplete="off" /></span><ul class="tag-offer"></ul></li>`
        : `<li><button class="tag add">${icon("plus")}tag</button></li>`);
    if (entering) {
      const input = list.querySelector("input");
      input.focus();
      offer(input.value);
      input.addEventListener("input", () => {
        if (/[\s,]$/.test(input.value)) return add(input.value);
        offer(input.value);
        input.style.width = Math.max(4, input.value.length + 1) + "ch";
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const first = list.querySelector(".tag-offer button");
          add(first?.dataset.offer ?? input.value);
        }
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      });
      input.addEventListener("blur", () => setTimeout(() => entering && !list.contains(document.activeElement) && close(), 150));
    }
  }

  function offer(typed) {
    const q = typed.trim().replace(/^#/, "").toLowerCase();
    const options = KNOWN.filter((k) => !tags.includes(k.name) && k.name.includes(q))
      .sort((a, b) => Number(b.name.startsWith(q)) - Number(a.name.startsWith(q)))
      .slice(0, 6);
    const fresh = q && !KNOWN.some((k) => k.name === q) && !tags.includes(q);
    list.querySelector(".tag-offer").innerHTML =
      options
        .map((k) => `<li><button data-offer="${esc(k.name)}"><span>#${esc(k.name)}</span>${k.template ? `<small>${icon("route")}${esc(k.template)}</small>` : ""}</button></li>`)
        .join("") + (fresh ? `<li><button data-offer="${esc(q)}"><span>#${esc(q)}</span><small>new</small></button></li>` : "");
  }

  function add(raw) {
    const name = raw.trim().replace(/^#/, "").replace(/[\s,]+$/, "").toLowerCase();
    if (name && !tags.includes(name)) tags.push(name);
    entering = false;
    render();
    onChange(tags);
  }

  function close() {
    entering = false;
    render();
  }

  list.addEventListener("pointerdown", (e) => {
    if (e.target.closest("[data-offer]")) e.preventDefault();
  });
  list.addEventListener("click", (e) => {
    e.stopPropagation();
    const untag = e.target.closest("[data-untag]");
    if (untag) {
      tags.splice(Number(untag.dataset.untag), 1);
      render();
      return onChange(tags);
    }
    const offered = e.target.closest("[data-offer]");
    if (offered) return add(offered.dataset.offer);
    if (e.target.closest(".add")) {
      entering = true;
      render();
    }
  });

  render();
  return {
    set(next) {
      tags = next;
      entering = false;
      render();
    },
  };
}
