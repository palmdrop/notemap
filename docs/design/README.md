# The design reference

What the shell is supposed to look like. Since 2026-09-14 that is being redrawn
([ADR 46](../adr/0046-the-shell-is-one-face-one-size-ink-on-white-and-processing-is-a-surface.md),
[plan](../plans/shell-redesign.md)), and this directory is in between.

| | |
|---|---|
| `brief.md` | **Current.** The statement of the new system, and the whole of what the Claude Design project is told. Until `shell.md` catches up, section by section, this is what the shell is meant to be. |
| `redrawn/` | **Current, and what is built against.** The settled drawings as plain HTML and CSS — `queue.html` (with `#index`), `process.html` (with `#editing`), `item.html` (with `#record`), `log.html` (with `#routing` and `#history`), `tokens.css` — and `shots/` of each at 1440 and 390 (the process surface also at 1000). Open them in a browser; resize; read the CSS. The face is loaded from Google Fonts here only because a mockup has no daemon to serve it. |
| `issues-2026-09-11.md` | The findings the redesign answers. |
| `shots/` | **The app as it is**, every surface at 1440 and 390, taken 2026-09-14 from a scratch daemon seeded for the purpose. This is what is being moved away from. |

Design is drawn in a Claude Design project and lands here — as static HTML and CSS that need no
build, no network and no account, with shots — in the PR that implements the page. **If this
directory and the Design project ever disagree, this directory wins**: it is the one the code is
verified against.

## Re-taking the shots

Both scripts are kept with `oneshot` (`oneshot list notemap-shoot` finds them, `oneshot show
<name>` prints one); neither lives in this repo.

- `oneshot run notemap-shoot-drafts [dir]` — opens each `redrawn/*.html` as `file://` at the
  widths the design is judged at and writes `redrawn/shots/`. Run it from the repo root after
  changing a drawing.
- `oneshot run notemap-shoot-app <daemon-url> <out-dir>` — walks every route of a running
  daemon at 1440 and 390, opening a row and the composer on the way, and writes `shots/`. The
  daemon has to be a scratch one with no password, seeded; the recipe is in the script's header.

Both need Playwright's `playwright-core` and a Chromium; the paths default to this machine's and
are overridden with `PLAYWRIGHT_CORE` and `CHROMIUM`.

Check 390 as well as 1440. The register's columns tighten below 44rem.
