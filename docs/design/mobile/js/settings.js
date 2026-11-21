// Settings: a list of sections, each section a page, and a destination, template or account a
// page of its own under it, the way a routing record is. The hash says which: `#templates/todo`.
// `?offline` shows them with the pool out of reach, readable but not changeable.

import { ask } from "./dialog.js";
import { glyph } from "./glyphs.js";
import {
  ACCOUNT_KINDS, FOLDER_MODES, accounts, actionOf, actionsFor, destinationOf, destinations, kindOf, placeOf, pointing, templates,
} from "./settings/data.js";
import { bindForms, editing, forget, formPage, leave } from "./settings/forms.js";
import { $, box, esc, facts, go, icon, label, offline, row, toolbar } from "./settings/ui.js";

let tokens = [
  { id: "shortcut", name: "phone shortcut", made: "2026-09-14", used: "today" },
  { id: "backup", name: "backup script", made: "2026-08-02", used: "never" },
];

const FOLDER = Object.fromEntries(FOLDER_MODES);
const accountOf = (name) => accounts.find((a) => a.name === name);
const accountLead = (a) => [a.values.username, a.values.address && `at ${new URL(a.values.address).host}`].filter(Boolean).join(" ") || "no username";

const SECTIONS = [
  ["routing", [
    ["destinations", "Destinations", () => {
      const down = destinations.find((d) => d.reach === "unavailable");
      return down ? `<span class="alarm">${esc(down.name)} unavailable</span>` : `${destinations.length}`;
    }],
    ["templates", "Templates", () => `${templates.length}`],
    ["accounts", "Accounts", () => `${accounts.length}`],
  ]],
  ["the pool", [
    ["pool", "Pool settings", () => (choices.unfurl === "yes" ? "link previews" : "no link previews")],
    ["access", "Access", () => (open ? `<span class="alarm">no password</span>` : signedIn ? `signed in, ${tokens.length} tokens` : "signed out")],
    ["server", "Server", () => (offline ? "out of reach" : "online, 0.16.0")],
    ["storage", "Storage", () => "102 MB"],
  ]],
  ["this phone", [
    ["appearance", "Appearance", () => `theme ${choices.theme}`],
  ]],
];
const titleOf = (slug) => SECTIONS.flatMap(([, list]) => list).find(([s]) => s === slug)?.[1].toLowerCase() ?? "settings";

const choices = {
  theme: localStorage.getItem("nm-theme") ?? "auto",
  unfurl: "yes",
};
let signedIn = true;
// `?open` is a pool that asks for no password at all.
const open = new URLSearchParams(location.search).has("open");
let adding = false;
let minted = null;

const readOnly = (what) => (offline ? `<p class="said">The pool is out of reach. ${what} can be read but not changed.</p>` : "");
const toggles = (key, options, locked = false) =>
  `<div class="toggles one" data-choice="${key}">${options.map((o) =>
    `<button class="pill" data-value="${o}" aria-pressed="${choices[key] === o}"${locked ? " disabled" : ""}>${o}</button>`).join("")}</div>`;

// What is rarely done and hard to take back sits apart, under the page, each way saying what it does.
const apart = (heading, ways) => label(heading) + ways.map(([act, glyphHtml, text, said, kind = ""]) =>
  `<button class="way ${kind}" data-act="${act}"${offline ? " disabled" : ""}>${glyphHtml}<span>${esc(text)}<small>${esc(said)}</small></span></button>`).join("");

function reachSaid(d) {
  // Out of reach, the last answer is still shown, saying when it was true.
  const asOf = offline ? `As of 12:31, before the pool went out of reach.` : `Checked ${d.checked}.`;
  if (d.reach === "available") return [`${icon("check")}Available. ${asOf}`, offline ? "" : "delivered"];
  if (d.reach === "unusable") return [`${icon("close")}<span><b>Unusable:</b> this pool has no ${esc(d.kind)} kind any more. It can be read and deleted; nothing is routed to it, and it is not checked.</span>`, "abandoned"];
  if (d.reach === "unavailable") return [`${icon("close")}<span><b>Unavailable:</b> ${esc(d.why)}. ${asOf}</span>`, "abandoned"];
  return [`Disabled. Offered to nothing new; what went there stays as it is.`, ""];
}

// A trigger tag is drawn the same everywhere: the route icon and its name.
const trigger = (tag) => `<span class="tag trigger">${icon("route")}${esc(tag)}</span>`;
// An asked place reads as asked, not as a placeholder.
const placeSaid = (t) => placeOf(t).replace(/\{\w+\}/, "asked each time");

const PAGES = {
  "": () => ({
    body: (offline ? box("", "The pool is out of reach. Everything can be read; nothing kept by the pool can be changed.") : "") +
      SECTIONS.map(([group, list]) => label(group) +
        `<ul class="rows">${list.map(([slug, name, sum]) => row({ href: `#${slug}`, name, end: `<span class="sum">${sum()}</span>${go}` })).join("")}</ul>`).join(""),
  }),

  destinations: () => ({
    body: readOnly("Destinations") + `<ul class="rows">${destinations.map((d) => row({
      href: `#destinations/${d.id}`, lead: icon(kindOf(d).icon), name: esc(d.name), small: esc(kindOf(d).label),
      end: `<span class="sum ${["unavailable", "unusable"].includes(d.reach) ? "alarm" : ""}">${d.reach}${offline && d.reach !== "disabled" ? "<small>as of 12:31</small>" : ""}</span>${go}`,
    })).join("")}</ul>`,
    foot: toolbar([["add", "plus", "Add a destination", "primary"]]),
    dim: destinations.filter((d) => d.reach === "disabled").map((d) => d.id),
  }),

  destination: (id) => {
    const d = destinationOf(id);
    const [said, cls] = reachSaid(d);
    return {
      title: d.name.toLowerCase(),
      excerpt: kindOf(d).label,
      body: readOnly("It") + box(cls, said) + facts([
        ["actions", d.reach === "unusable" ? "none" : d.reach === "disabled" ? "not offered, so not asked" : actionsFor(d).map((a) => a.label).join(", ")],
        ...kindOf(d).fields.map((f) => {
          const v = d.values[f.key];
          if (f.type === "account" && accountOf(v)) return [f.label, `<a href="#accounts/${accountOf(v).id}">${esc(v)}</a>`];
          return [f.label, v ? esc(v) : f.implied ? `${esc(f.implied)}<small>left unset</small>` : "—"];
        }),
        ["templates", pointing(d).map((t) => `<a href="#templates/${t.id}">${esc(t.name)}</a>`).join(", ") || "none"]]),
      below: apart(d.reach === "unusable" ? "delete" : "disable or delete", [
        ...(d.reach === "unusable" ? [] : [d.reach === "disabled"
          ? ["enable", glyph.pause, "Enable", "Offer it for routing again."]
          : ["disable", glyph.pause, "Disable", "Not offered for new routes. What went there, and what is on its way, stays as it is."]]),
        ["delete", icon("trash"), "Delete…", "Only while no record names it. Otherwise, disable it.", "danger"],
      ]),
      foot: d.reach === "unusable" ? "" : toolbar([
        ["check", glyph.refresh, "Check again", "", d.reach === "disabled" || offline],
        ["edit", "edit", "Edit", "primary"],
      ]),
    };
  },

  templates: () => ({
    body: readOnly("Templates") + `<ul class="rows">${templates.map((t) => {
      const d = destinationOf(t.to);
      return row({
        href: `#templates/${t.id}`, lead: icon(kindOf(d).icon), name: esc(t.name),
        small: d.reach === "unusable" ? `<span class="alarm">stranded: ${esc(d.name)} cannot be used</span>`
          : d.reach === "unavailable" ? `<span class="alarm">${esc(d.name)} unavailable</span>` : `${esc(placeSaid(t))} in ${esc(d.name)}`,
        end: `<span class="sum">${t.tag ? trigger(t.tag) : ""}</span>${go}`,
      });
    }).join("")}</ul>`,
    foot: toolbar([["add", "plus", "Add a template", "primary"]]),
  }),

  template: (id) => {
    const t = templates.find((one) => one.id === id);
    const d = destinationOf(t.to);
    return {
      title: t.name.toLowerCase(),
      excerpt: `${placeSaid(t)} in ${d.name}`,
      body: readOnly("It") +
        (d.reach === "unusable" ? box("abandoned", `${icon("route")}<span><b>Stranded.</b> ${esc(d.name)} is of a kind this pool no longer has, so nothing is routed by this template. Point it at another destination, or delete it.</span>`) : "") +
        (d.reach === "unavailable" ? box("abandoned", `${icon("route")}<span><b>${esc(d.name)} is unavailable:</b> ${esc(d.why)}. Nothing routed by this template gets there until it is available again.</span>`) : "") +
        facts([
          ["tag", t.tag ? `${trigger(t.tag)}<small>#route/${esc(t.tag)}</small>` : "none, picked when routing"],
          ["destination", `<a href="#destinations/${d.id}">${esc(d.name)}</a>`],
          ["action", esc(actionOf(t).label) + (actionOf(t).output ? `<small>${t.output === "attachments" ? "attachments only" : "everything"}</small>` : "")],
          ...actionOf(t).fields.map((f) => {
            if (Object.hasOwn(t.asked, f.key))
              return [f.label, `asked: “${esc(t.asked[f.key])}”<small>${t.values[f.key] ? `default ${esc(t.values[f.key])}` : "no default"}</small>`];
            return [f.label, t.values[f.key] ? esc(t.values[f.key]) : f.implied ? esc(f.implied) : "—"];
          }),
          ...(actionOf(t).folders && t.folder ? [["if missing", `${FOLDER[t.folder]}${t.established ? `<small>made ${t.established}</small>` : ""}`]] : []),
          ["used", esc(t.used)],
        ]),
      below: apart("delete", [["delete", icon("trash"), "Delete…", "Items already routed by it keep their records.", "danger"]]),
      foot: toolbar([["edit", "edit", "Edit", "primary"]]),
    };
  },

  accounts: () => ({
    body: readOnly("Accounts") + [...new Set(accounts.map((a) => a.kind))].map((kind) => label(ACCOUNT_KINDS[kind].label) +
      `<ul class="rows">${accounts.filter((a) => a.kind === kind).map((a) => row({
        href: `#accounts/${a.id}`, name: esc(a.name), small: esc(accountLead(a)),
        end: `<span class="sum">${a.from === "config" ? "config file" : ""}</span>${go}`,
      })).join("")}</ul>`).join(""),
    foot: toolbar([["add", "plus", "Add an account", "primary"]]),
  }),

  account: (id) => {
    const a = accounts.find((one) => one.id === id);
    const config = a.from === "config";
    return {
      title: a.name,
      excerpt: ACCOUNT_KINDS[a.kind].label,
      body: (config ? box("", "Set in the daemon's config file. Change it there.") : readOnly("It")) +
        facts([["kind", esc(ACCOUNT_KINDS[a.kind].label)], ["name", esc(a.name)],
          ...ACCOUNT_KINDS[a.kind].fields.map((f) => [f.label, esc(a.values[f.key] || "—")]),
          [ACCOUNT_KINDS[a.kind].secret, "set"],
          ["used by", destinations.filter((d) => d.values.account === a.name).map((d) => `<a href="#destinations/${d.id}">${esc(d.name)}</a>`).join(", ") || "nothing"]]),
      below: config ? "" : apart("remove", [["remove", icon("trash"), "Remove…", "Destinations that sign in with it stop reaching their place.", "danger"]]),
      foot: config ? "" : toolbar([["edit", "edit", "Edit", "primary"]]),
    };
  },

  access: () => ({
    body: (open ? box("abandoned", `${glyph.unlock}<span><b>No password.</b> Anyone who reaches notemap.example.org can read and change everything in this pool.</span>`) +
      `<div class="lone-way"><button class="pill lone" data-act="set-password">${glyph.lock}Set a password</button></div>` : "") +
      (open ? "" : signedIn
      ? `<div class="record-state session"><span>Signed in. This browser holds a session.</span><button class="pill lone" data-act="sign-out">Sign out</button></div>`
      : `<div class="record-state session"><span>Signed out.</span><a class="pill lone" href="signin.html">Sign in</a></div>`) +
      label("access tokens") +
      (minted
        ? `<div class="minted"><p>Copy it now. It will not be shown again.</p><code>${minted}</code>
           <div class="ways"><button class="pill" data-act="copy-token">${icon("copy")}Copy</button><button class="pill" data-act="minted-done">Done</button></div></div>`
        : "") +
      (adding
        ? `<form class="mint"><label class="field"><span>name</span><input name="token" autocomplete="off" placeholder="what will use it" /></label>
           <div class="ways"><button type="button" class="pill" data-act="cancel-add">Cancel</button><button class="pill primary">Make it</button></div></form>`
        : "") +
      `<ul class="rows">${tokens.map((t) => `<li class="row plain token"><span><b>${esc(t.name)}</b><small>made ${t.made}, last used ${t.used}</small></span>
        <button class="pill lone danger" data-act="revoke" data-token="${t.id}">Revoke</button></li>`).join("")}</ul>`,
    foot: signedIn && !adding && !minted ? toolbar([["add-token", "plus", "Add a token", "primary", false]]) : "",
  }),

  server: () => ({
    body: (offline ? box("", `${glyph.cloudOff}Out of reach. Last answered at 12:31.`) : "") +
      facts([
        ["address", "https://notemap.example.org"],
        ["version", "0.16.0"],
        ["status", offline ? "out of reach<small>last answered at 12:31</small>" : "online<small>answered just now</small>"],
        ["api", `<a href="#">reference ↗</a>`],
      ]) +
      label("sources") +
      `<ul class="rows">${[["web app", "2026-08-01"], ["cli", "2026-08-03"], ["phone shortcut", "2026-09-14"]].map(([name, since]) =>
        `<li class="row plain"><span><b>${name}</b></span><span class="sum">since ${since}</span></li>`).join("")}</ul>` +
      `<div class="lone-way"><button class="pill lone" data-act="knock"${offline ? " disabled" : ""}>${glyph.refresh}Check again</button></div>`,
  }),

  storage: () => ({
    body: offline ? `<p class="said">Unavailable while the pool is out of reach.</p>` :
      `<dl class="facts sizes">${[["pool", "1.4 MB"], ["assets", "48.2 MB"], ["mirror", "52.0 MB"], ["auth", "24 kB"]].map(([n, v]) =>
        `<div><dt>${n}</dt><dd>${v}</dd></div>`).join("")}
        <div class="sum-row"><dt>total</dt><dd>101.6 MB</dd></div>
        <div><dt>free</dt><dd>212 GB<small>on /var/lib/notemap</small></dd></div>
        <div><dt>reclaimable</dt><dd>3.1 MB<small>4 files left behind</small></dd></div></dl>
        <div class="lone-way"><button class="pill lone" data-act="reclaim">${icon("trash")}Reclaim 3.1 MB</button></div>`,
  }),

  appearance: () => ({
    body: `<p class="said">Kept on this phone only.</p>` +
      `<div class="part"><h3>theme</h3>${toggles("theme", ["auto", "light", "dark"])}<p class="hint">Dark is not drawn yet.</p></div>` +
      "",
  }),

  pool: () => ({
    body: `<p class="said">Kept by the pool, for every device.${offline ? " Out of reach, so not changeable now." : ""}</p>` +
      `<div class="part"><h3>show link previews</h3>${toggles("unfurl", ["yes", "no"], offline)}</div>`,
  }),
};

const DETAIL = { destinations: "destination", templates: "template", accounts: "account" };

const where = () => {
  const [section = "", id, mode] = location.hash.slice(1).split("/");
  return { section, id, form: id === "new" || mode === "edit" };
};

function render() {
  const { section, id, form } = where();
  if (!form) forget();
  const page = form ? formPage(section, id) : id ? PAGES[DETAIL[section]](id) : PAGES[section]();
  $("[data-act=back] use").setAttribute("href", page.closes ? "#i-close" : "#i-back");
  $("[data-act=back]").setAttribute("aria-label", page.closes ? "Cancel" : "Back");
  $("h1").textContent = page.title ?? titleOf(section);
  $(".excerpt").hidden = !page.excerpt;
  $(".excerpt").textContent = page.excerpt ?? "";
  $(".step").innerHTML = page.body + (page.below ?? "");
  for (const dim of page.dim ?? []) $(`.step a[href$="/${dim}"]`)?.classList.add("dim");
  $(".route-foot").innerHTML = page.foot ?? "";
  $(".step").scrollTop = 0;
  page.after?.();
}

const parent = () => {
  const { section, id, form } = where();
  if (form) return id === "new" ? `#${section}` : `#${section}/${id}`;
  return id ? `#${section}` : section ? "#" : null;
};

document.addEventListener("click", async (e) => {
  const choice = e.target.closest("[data-choice] .pill");
  if (choice) {
    const key = choice.parentElement.dataset.choice;
    choices[key] = choice.dataset.value;
    for (const pill of choice.parentElement.children) if (pill.matches(".pill")) pill.setAttribute("aria-pressed", pill === choice);
    if (key !== "unfurl") localStorage.setItem(`nm-${key}`, choices[key]);
    return;
  }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  const [section, id] = location.hash.slice(1).split("/");

  if (act === "back") {
    const up = parent();
    if (up === null) return history.length > 1 ? history.back() : (location.href = "queue.html");
    if (editing()) return (await leave()) && location.replace(up);
    return (location.hash = up);
  }
  if (act === "add") return (location.hash = `#${section}/new`);
  if (act === "edit") return (location.hash = `#${section}/${id}/edit`);

  if (act === "delete" && section === "destinations") {
    const d = destinationOf(id);
    const held = pointing(d);
    if (held.length) {
      const instead = await ask({
        title: `${d.name.toLowerCase()} is in use`,
        text: `${held.map((t) => t.name).join(", ")} route${held.length === 1 ? "s" : ""} to it. Disable it instead: it is offered to nothing new, and what went there stays as it is.`,
        ways: [{ label: "Keep", value: false }, { label: "Disable instead", value: true, kind: "primary" }],
      });
      if (instead) d.reach = "disabled";
      return render();
    }
    const sure = await ask({
      title: `delete ${d.name.toLowerCase()}?`,
      text: "Records of what went there keep their facts. This cannot be undone.",
      ways: [{ label: "Keep", value: false }, { label: "Delete", value: true, kind: "danger" }],
    });
    if (!sure) return;
    destinations.splice(destinations.indexOf(d), 1);
    return (location.hash = "#destinations");
  }
  if (act === "disable") {
    destinationOf(id).reach = "disabled";
    return render();
  }
  if (act === "enable") {
    destinationOf(id).reach = "available";
    destinationOf(id).checked = "just now";
    return render();
  }

  if (act === "delete" && section === "templates") {
    const t = templates.find((one) => one.id === id);
    const sure = await ask({
      title: `delete ${t.name.toLowerCase()}?`,
      text: `Records made from it keep resolving.${t.tag ? ` #${t.tag} stops routing anything.` : ""}`,
      ways: [{ label: "Keep", value: false }, { label: "Delete", value: true, kind: "danger" }],
    });
    if (!sure) return;
    templates.splice(templates.indexOf(t), 1);
    return (location.hash = "#templates");
  }

  if (act === "remove") {
    const a = accounts.find((one) => one.id === id);
    const sure = await ask({
      title: `remove ${a.name}?`,
      text: "Destinations that sign in with it stop reaching their place until given another.",
      ways: [{ label: "Keep", value: false }, { label: "Remove", value: true, kind: "danger" }],
    });
    if (!sure) return;
    accounts.splice(accounts.indexOf(a), 1);
    return (location.hash = "#accounts");
  }

  if (act === "sign-out") {
    const sure = await ask({
      title: "sign out?",
      text: "This browser forgets its session. Anything waiting to send stays here and is sent once you sign in again.",
      ways: [{ label: "Stay", value: false }, { label: "Sign out", value: true, kind: "danger" }],
    });
    if (sure) signedIn = false;
    return render();
  }
  if (act === "revoke") {
    const t = tokens.find((one) => one.id === b.dataset.token);
    const sure = await ask({
      title: `revoke ${t.name}?`,
      text: "Whatever uses it is refused from now on.",
      ways: [{ label: "Keep", value: false }, { label: "Revoke", value: true, kind: "danger" }],
    });
    if (sure) tokens = tokens.filter((one) => one !== t);
    return render();
  }
  if (act === "add-token") {
    adding = true;
    render();
    return $(".mint input").focus();
  }
  if (act === "cancel-add") {
    adding = false;
    return render();
  }
  if (act === "copy-token") return navigator.clipboard?.writeText(minted).catch(() => {});
  if (act === "minted-done") {
    minted = null;
    return render();
  }
});

document.addEventListener("submit", (e) => {
  if (!e.target.closest(".mint")) return;
  e.preventDefault();
  const name = $(".mint input").value.trim();
  if (!name) return;
  tokens = [{ id: name, name, made: "2026-11-06", used: "never" }, ...tokens];
  minted = "nm_7f3c" + Math.random().toString(36).slice(2, 14) + "e91a";
  adding = false;
  render();
});

bindForms(render);
addEventListener("hashchange", render);
render();
