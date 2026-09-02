# The design reference

What the shell is supposed to look like, as static files that need no build, no
network and no account. This is the ground truth [the port
plan](../plans/shell-design-port.md) is written against; the prose account of
*why* is [the spec](../specs/shell.md).

| | |
|---|---|
| `shell.css` | Every token and every component style. What becomes `@theme` plus the primitives. |
| `queue.html` | The queue, with capture as its first row and one item open. |
| `feed.html` | The feed, including a routed item, an archived one, and a clamped long note. |
| `composer.html`, `composer.css` | Every state the routing composer has, as [typed-routing-composer](../plans/typed-routing-composer.md) built it. The composer is a modal with its own stylesheet, so it is drawn here and nowhere else. |
| `log.html`, `log.css` | The action log as it should be drawn. Built as [log-in-the-shell](../plans/log-in-the-shell.md), which made it a route of the app; it was drawn against the daemon's own page, which is why it carries both sides of every `light-dark()` where the others name a token. |
| `shots/` | Each surface rendered at 1440 and at 390, so a change can be compared without opening a browser. |

**These agree with the code as of 2026-09-02.** `queue.html` and `shell.css` no longer draw the
composer at all: it was a panel beside the row, which a modal superseded on 2026-08-24, and
`shell.css` carried a `.tree` block that predated the candidates browser and never described the
one that shipped. Nothing in the register reserves width for a modal, so the stage is one column
and `composer.html` is the whole account. `.opt` stays in `shell.css` because the register's own
choosers are drawn with it.

`composer.html` was drawn before the code and has since been corrected against it on two points:
`under` is a typed field rather than a chooser over a note's own headings, which is I/O neither
adapter does, and the counts beside a state word are gone, `CandidateEntry` having no field for
them. The counts in the remembered list stayed — the pool does answer how often and when last.

Open any page directly — `file://` works, there is nothing to serve.

## Re-rendering the shots

```sh
chromium --headless --disable-gpu --hide-scrollbars --virtual-time-budget=2000 \
  --screenshot=shots/queue-1440.png --window-size=1440,1400 "file://$PWD/queue.html"
```

The same command drives a screenshot of the real app: run `pnpm dev`, point it
at `http://localhost:5173/`, and read the two images side by side. Check 390 as
well as 1440 — the register's columns tighten below 34rem.

**`shots/` is stale for `queue.html` and `composer.html`** as of 2026-09-02:
both pages changed and no browser was available to re-render them. Re-run the
command above for each surface at both widths.

These are mockups, not components. They carry no state, no interaction and no
data; a class here is a suggestion about structure, not a class to copy into a
Svelte file. What must survive the port is the *system* — two columns, one line
weight, one size per face, ink structure, red for action and alarm.

The design was drawn in a Claude Design project, which holds every iteration it
went through. Its current pages carry the same stylesheet and the same markup as
this directory. **If they ever disagree, this directory wins** — it is the one
the port is verified against.
