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
| `shots/` | Rendered at 1440 and at 390, so a change can be compared without opening a browser. |

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

The design was drawn in a Claude Design project, which holds the iterations and
the discussion. **This directory is canonical**; that project is history and is
not kept in step.
