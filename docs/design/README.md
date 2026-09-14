# The design reference

What the shell is supposed to look like. Since 2026-09-14 that is being redrawn
([ADR 46](../adr/0046-the-shell-is-one-face-one-size-ink-on-white-and-processing-is-a-surface.md),
[plan](../plans/shell-redesign.md)), and this directory is in between.

| | |
|---|---|
| `brief.md` | **Current.** The statement of the new system, and the whole of what the Claude Design project is told. Until `shell.md` catches up, section by section, this is what the shell is meant to be. |
| `redrawn/` | **Current, and what is built against.** The settled drawings as plain HTML and CSS — `queue.html` (with `#index`), `process.html` (with `#editing`), `tokens.css` — and `shots/` of each at 1440, 1000 and 390. Open them in a browser; resize; read the CSS. The face is loaded from Google Fonts here only because a mockup has no daemon to serve it. |
| `issues-2026-09-11.md` | The findings the redesign answers. |
| `shots/` | **The app as it is**, every surface at 1440 and 390, taken 2026-09-14 from a scratch daemon seeded for the purpose. This is what is being moved away from. |
| `shell.css`, `queue.html`, `feed.html`, `composer.*`, `log.*` | **The old direction.** Wrong from 2026-09-14; each is deleted in the PR that lands its replacement. Kept until then so a page still being worked in the old register has its reference. |

Design is drawn in a Claude Design project and lands here — as static HTML and CSS that need no
build, no network and no account, with shots — in the PR that implements the page. **If this
directory and the Design project ever disagree, this directory wins**: it is the one the code is
verified against.

## Re-taking the drawings' shots

A Playwright script opens each `redrawn/*.html` as `file://` at the three widths and writes
`redrawn/shots/`; twenty lines of Playwright, not kept in the repo — rewrite it when needed.

## Re-taking the shots of the app

The shots are of the real app, not of mockups. The running daemon is behind a password, so they
are taken against a scratch one: a temporary config on another port with no password, `pnpm seed`
plus a few tagged captures, two filesystem destinations and two templates, and a Playwright
script walking every route at both widths and clicking a row's stamp and its `process`. The
script is not kept in the repo — it is forty lines to rewrite.

Check 390 as well as 1440. The register's columns tighten below 44rem.
