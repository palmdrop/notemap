# The design reference

What the shell is supposed to look like, as static files that need no build, no
network and no account. This is the ground truth [the port
plan](../plans/shell-design-port.md) is written against; the prose account of
*why* is [the spec](../specs/shell.md).

| | |
|---|---|
| `shell.css` | Every token and every component style. What becomes `@theme` plus the primitives. |
| `queue.html` | The queue, with capture as its first row, one item open, and the drained queue beneath it. |
| `feed.html` | The feed, including an opened row, a routed item, an archived one, and a clamped long note. |
| `composer.html`, `composer.css` | Every state the routing composer has, as [typed-routing-composer](../plans/typed-routing-composer.md) built it and [shell-second-pass](../plans/shell-second-pass.md) split it in two. The composer is a modal with its own stylesheet, so it is drawn here and nowhere else. |
| `log.html`, `log.css` | The action log as it should be drawn. Built as [log-in-the-shell](../plans/log-in-the-shell.md), which made it a route of the app; it was drawn against the daemon's own page, which is why it carries both sides of every `light-dark()` where the others name a token. |
| `shots/` | Each surface rendered at 1440 and at 390, so a change can be compared without opening a browser. |

**These agree with the code as of 2026-09-04**, redrawn for
[shell-second-pass](../plans/shell-second-pass.md).

`shell.css` carries the register the code actually draws, which the pages had drifted from: a
**17rem rail** with a 2.2rem gutter under a 72rem measure, rather than the 7.5rem gutter and 44rem
column they were first drawn at. What it gained with them:

- **An open row is one band.** The rail's fill runs across the gutter to meet the body's and the
  accent edge sits at the head of the row, rather than two lit panels either side of the seam the
  design spent an amendment removing.
- **A row's actions on a grid**, two lines by what they do — `route done archive` above a muted
  `copy edit open` — every cell taking the same inline padding, so the words align down the columns
  and a line with fewer of them closes up rather than gapping.
- **The drained queue**, which is one quiet line in the rail and no longer a paragraph beside a
  `zero`.
- **The corner**, which the pages did not draw at all: a confirmation in the ink, a failure in the
  accent, refusals at the bottom.
- **One row for both surfaces.** `feed.html` opens a row in place with the facts the queue's has
  and the one it does not — where it went, and `undo` on a decision made by hand.

`composer.html` is the two-column composer. Untaken there is one column; taking a destination
splits it, and the modal grows to `--composer` in the one moment it may change size. The
`remembered` case moved into that second column with the count beneath the path, the `gone` case is
gone — the word is drawn nowhere now, and the flag survives only to keep a vanished place out of
the ghost — and a `still` case draws the same composer one segment shallower, to show that nothing
above the tree moves while it is typed. `create` has no field beside the line and `append` does,
which is the rule about what the forecast knows.

`composer.html` was drawn before the code and has since been corrected against it, on 2026-09-02
and again on 2026-09-03 after a review read the two side by side:

- `under` is a typed field rather than a chooser over a note's own headings, which is I/O neither
  adapter does.
- The counts beside a state word are gone, `CandidateEntry` having no field for them. The counts in
  the remembered list stayed — the pool does answer how often and when last.
- The folders that are not there are drawn **in the tree**, where they will be, rather than named
  beside the state word. The page always drew them both ways; the code now draws the tree.
- **No key hints.** The commit row carried `⏎ route · ⇥ complete · ⌫ up · esc`; nothing draws it,
  and a row of keys is a sentence in a surface whose copy is a word or a mark.
- **No count under a single match.** The `where` case drew `1 match` beneath the one destination
  that matched; the count is only said where a prefix is ambiguous, which is the only time it
  answers anything.

The line itself carries no label. `where` is the destination's step, and the place is the thing the
modal is for.

**`log.html` is untouched** and still agrees with the code: nothing in this pass reached the log.

Open any page directly — `file://` works, there is nothing to serve.

## Re-rendering the shots

```sh
chromium --headless --disable-gpu --hide-scrollbars --virtual-time-budget=2000 \
  --screenshot=shots/queue-1440.png --window-size=1440,1750 "file://$PWD/queue.html"
```

The same command drives a screenshot of the real app: run `pnpm dev`, point it
at `http://localhost:5173/`, and read the two images side by side. Check 390 as
well as 1440 — the register's columns tighten below 44rem.

The window has to be tall enough for the whole page: a headless screenshot is
the viewport and nothing more, so `queue.html` wants about 1750 at 1440 and
`composer.html` about 4500. **`shots/` was re-rendered for every page on
2026-09-04.**

These are mockups, not components. They carry no state, no interaction and no
data; a class here is a suggestion about structure, not a class to copy into a
Svelte file. What must survive the port is the *system* — two columns, one line
weight, one size per face, ink structure, red for action and alarm.

The design was drawn in a Claude Design project, which holds every iteration it
went through. Its current pages carry the same stylesheet and the same markup as
this directory. **If they ever disagree, this directory wins** — it is the one
the port is verified against.
