# 73. The register is read by day, and the rail goes

**Date**: 2026-11-13
**Status**: Accepted. Supersedes [ADR 52](0052-reading-by-day-is-a-readers-choice.md).
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

ADR 52 gave the register two layouts: the rail, and by day. Which one you see is a setting in
Appearance, `auto` by default. It accepted the cost that every change to a row is built and checked
twice. The phone-first redesign ([ADR 71](0071-the-shell-is-drawn-for-a-phone-first-in-blocks-on-three-surfaces.md))
draws only by day. It uses a weekday heading in Syne with the date and a count beside it, and a
time column the width of a time. The tags, the record lines and the state follow the capture in
the row's body. The rail was never redrawn in the new register.

Does the choice stay, now that only one layout is drawn?

---

## Decision drivers

- **ADR 52's own revisit trigger**: if a layout goes unused, the choice does not pay for its second
  layout.
- **Every change to a row is built twice** while both exist. The redesign changes every row.
- **The rail was right on a wide screen.** A wide layout has not been decided, and it may want the
  rail's columns back.

---

## Considered options

1. **Keep the choice** and redraw the rail in the new register.
2. **By day only**, and the Appearance setting goes. A wide layout decides its own row later.
3. **By day on a phone, the rail above `narrow`**, fixed, with no setting.

---

## Decision outcome

Chosen: **Option 2**. The rail and the `rows` setting go. Appearance keeps only the theme. Each day
has a heading: the weekday in the display face, then the date and the day's count. The heading
stays at the top while its rows scroll. A row keeps its time in a narrow column. Everything else
follows the capture in the body: link preview, record lines, tags and state.

### Consequences

- **Good**: one row to build and check.
- **Good**: Appearance shrinks to the theme.
- **Bad**: a reader who chose the rail on a desk loses it. Until there is a wide layout, the
  wide screen reads by day too.
- **Neutral**: if the wide layout brings back columns beside the text, that is a new decision
  about the wide layout. This record does not reopen ADR 52's setting.

---

## Pros and cons of the options

### Option 1: keep the choice

- **Good**: nobody loses a layout they chose.
- **Bad**: it draws and maintains a second row for a reading nobody has asked for in the new
  register.

### Option 2: by day only

- **Good**: one layout, as ADR 46 first wanted, and it's the one that works on a phone.
- **Bad**: the desk loses the rail for now.

### Option 3: fixed by width

- **Good**: the desk keeps the rail.
- **Bad**: two layouts and their cost, decided before a wide layout exists to put the rail in.

---

## More information

- Design: `queue.html`, `feed.html` and `log.html` in [`docs/design/mobile/`](../design/mobile/).

Revisit when the wide layout is drawn.
