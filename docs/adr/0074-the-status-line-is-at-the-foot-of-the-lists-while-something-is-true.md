# 74. The status line is at the foot of the lists, while something is true

**Date**: 2026-11-13
**Status**: Accepted. Supersedes the shape of the line in
[ADR 54](0054-the-shell-speaks-from-a-status-line.md): on every surface, always there, notices
counted at its left, the queue's size on its right. Kept from ADR 54: one place for the shell's
voice, the panel of this session's notices, firings drawn as work in flight, the countdown, and a
refused capture held until someone decides.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

ADR 54 fixed a ruled line to the foot of every surface. It always held `notices (n) ▴` on the left
and the counts on the right. On a phone the redesign docks an action bar at the foot of the item,
the capture page, the route page and settings forms
([ADR 71](0071-the-shell-is-drawn-for-a-phone-first-in-blocks-on-three-surfaces.md)). The status
line would stack on top of each of those bars. On the lists, a line that says nothing most of the
time still costs a row of the screen. Notices now have an icon in the header, with a red count.

Where does the status line go, and when is it drawn?

---

## Decision drivers

- **A phone's height is scarce**, and a docked bar already takes the foot of every page you
  act on.
- **One place for the shell's voice** (ADR 54): stated once, not repeated in a second corner.
- **What is under way must be seen where you are looking.** A route in its window is about a
  row, so the row should say so.
- **Offline is not a failure**, and nothing can be cancelled without the pool.

---

## Considered options

1. **Keep ADR 54's line** on every surface, stacked above each docked bar.
2. **The line on the lists only, and only while something is true.** The notices go to an icon in
   the header.
3. **No line**: everything said on rows and in the notices panel.

---

## Decision outcome

Chosen: **Option 2**.

**Where.** The status line is at the foot of the queue, the feed and the log, the surfaces with no
docked bar. It is drawn only while it has something to say. The + floats clear above where the line
goes and stays there when the line is gone.

**Left.** The newest thing happening or just said. That can be a route in its window ("Routing by
Todo, 4s, Cancel"), one being attempted ("Sending to Vault"), one waiting to retry ("Waiting for
Vault", Cancel), or a passing message ("Routed to todo.md in Vault", "Captured, at the end of the
queue", Show). Cancel and Undo are underlined words, not buttons.

**Right.** What is true, counted in words, in a fixed order: "2 waiting", then "Offline". The queue's
size leaves the line for the drawer.

**Notices.** Tapping the line opens the panel above it, and tapping again closes it. The header's
icon opens the same panel and carries a red count of what went wrong since it was last opened.
`notices (n) ▴` goes.

**Offline, nothing offers Cancel**: not the line, not the row, not the panel. Cancelling needs the
pool. Offline is said in ink, with when the pool last answered.

**One popup.** A delivery turned down after its window has closed gets a red strip at the top,
under the header, said once. The row says it too, and the panel keeps it. Nothing else interrupts.

### Consequences

- **Good**: the line takes no room when there is nothing to say, and never stacks on a docked bar.
- **Good**: a route in its window is shown on its own row and on the line, both counting down.
- **Bad**: a page with a docked bar (the item, capture, a route, settings) shows no line. What
  happens there is said on that page: a ruled line over the item's bar, the routed state on the
  route page.
- **Bad**: the queue's size is one tap away, in the drawer, and no longer on screen.
- **Neutral**: the panel's contents and the countdown's source (`template-fired` with `until`) are
  unchanged from ADR 54.

---

## Pros and cons of the options

### Option 1: ADR 54's line everywhere

- **Good**: one rule for every surface, and the counts are always on screen.
- **Bad**: two bars at the foot of every page where you act, and a line of the screen spent when
  nothing is happening.

### Option 2: the lists, while something is true

- **Good**: the line is there when there is something to tell, and gone otherwise.
- **Bad**: pages with a docked bar need their own way to say what just happened.

### Option 3: no line

- **Good**: the least chrome.
- **Bad**: the waiting count and the state of the pool would have nowhere to go but a panel,
  and a passing message would have to be a toast, which the redesign avoids.

---

## More information

- Design: the status line and notices in `queue.html`, `feed.html` and `log.html` in
  [`docs/design/mobile/`](../design/mobile/).
- Settled detail: [DECISIONS.md](../design/mobile/DECISIONS.md), under Status line, Cancel and
  One popup.

Revisit if the waiting count is missed on pages with a docked bar.
