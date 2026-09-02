# The design reference

What the shell is supposed to look like, as static files that need no build, no
network and no account. This is the ground truth [the port
plan](../plans/shell-design-port.md) is written against; the prose account of
*why* is [the spec](../specs/shell.md).

| | |
|---|---|
| `shell.css` | Every token and every component style. What becomes `@theme` plus the primitives. |
| `queue.html` | The queue, with capture as its first row and a routing composer open beside one item. |
| `feed.html` | The feed, including a routed item, an archived one, and a clamped long note. |
| `composer.html`, `composer.css` | Every state the routing composer has, for [typed-routing-composer](../plans/typed-routing-composer.md). Standalone, and it supersedes what `queue.html` and `shell.css` show. |
| `log.html`, `log.css` | The action log as it should be drawn — corrections to `apps/daemon/public/log.html`, which exists and is already a register. Carries both sides of every `light-dark()`, since that page restates its roles inline. |
| `shots/` | Each surface rendered at 1440 and at 390, so a change can be compared without opening a browser. |

**`shell.css` and `queue.html` are behind the code on one point**: they draw the composer as a
panel beside the row, which a modal superseded on 2026-08-24, and `shell.css`'s `.tree` block
predates the candidates browser entirely. `composer.html` is the current account and stands alone
until [typed-routing-composer](../plans/typed-routing-composer.md) phase 8 re-renders the rest.

Open either page directly — `file://` works, there is nothing to serve.

## Re-rendering the shots

```sh
chromium --headless --disable-gpu --hide-scrollbars --virtual-time-budget=2000 \
  --screenshot=shots/queue-1440.png --window-size=1440,1400 "file://$PWD/queue.html"
```

The same command drives a screenshot of the real app during the port: run
`pnpm dev`, point it at `http://localhost:5173/`, and read the two images side
by side. Check 390 as well as 1440 — the composer changes shape below 56rem and
the register's columns tighten below 34rem.

These are mockups, not components. They carry no state, no interaction and no
data; a class here is a suggestion about structure, not a class to copy into a
Svelte file. What must survive the port is the *system* — two columns, one line
weight, one size per face, ink structure, red for action and alarm.

The design was drawn in a Claude Design project, which holds every iteration it
went through. Its current pages carry the same stylesheet and the same markup as
this directory. **If they ever disagree, this directory wins** — it is the one
the port is verified against.
