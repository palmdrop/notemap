# 52. Reading by day is a reader's choice, and the register has two layouts

**Date**: 2026-09-29
**Status**: Accepted. Amends [ADR 46](0046-the-shell-is-one-face-one-size-ink-on-white-and-processing-is-a-surface.md)
on one driver, "one layout, 375px first, both columns". Everything else in ADR 46 stands.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

On a phone, the rail takes 5.75rem of a 375px screen, about a quarter of it, on every row. It
holds the date over the time and the tags one to a line, so a capture is read at about thirty
characters a line beside a column that is mostly repeated dates. Moving the date out of the row
does not free the width on its own, because the tags are what make the rail wide.

How should the register draw its rows on a narrow screen, and who decides?

---

## Decision drivers

- **The phone is where capture and triage happen away from a desk**, and there the rail costs
  the text most of its measure.
- **ADR 46's one layout.** A second way to draw a row is a second thing to build, and every change
  to a row has to be checked against it.
- **The rail is right on a wide screen.** There it holds the stamp and tags on one line each
  without crowding the text, and it is what the register was designed around.
- **A reading preference is the reader's**, held on the device, the way the palette is. A phone
  and a laptop may want different answers.

---

## Considered options

1. **Keep one layout**: the rail on every width, tightened.
2. **By day everywhere**: headings replace the dated rail on every width. Still one layout.
3. **By day below `narrow`, the rail above it, fixed**: two layouts, and nobody chooses.
4. **A choice in Appearance**, `rows: auto · by day · rail`. `auto` is by day below `narrow` and
   the rail above it.

---

## Decision outcome

Chosen: **Option 4**. The developer weighed the cost of maintaining two layouts, having seen
both drawn, and accepted it.

**By day**, a register draws a heading before the first row of each local day: the date bold,
the weekday beside it, ruled under, sticky at the top while its rows scroll. There is no month
heading. The row keeps only its time. Below `narrow` the rail is slim, as wide as a time and
holding nothing else, and everything else it held follows the capture in the body: state word, `pending`, the
tags and their `+`, the routing line. Above `narrow` the rail keeps its width and holds the time
and the tags. The first row under a heading lays its top edge on the heading's rule, so a
selected first row draws one line rather than two, whichever row is selected. The index reads by
day too, each line keeping its time, and drops the half-day gap because the heading already says
a day passed.

The choice is held in the browser, per device, and `auto` is the default.

### Consequences

- **Good**: the text on a phone gets the width back, and the date is read once per day, where
  it is a heading, rather than on every row.
- **Good**: a reader who prefers the rail on a phone, or days on a laptop, has it.
- **Bad**: two register layouts. Every change to a row, the box, the foot, motion or the keyboard
  has to be built and checked in both. This is the cost the developer accepted.
- **Neutral**: in the slim layout the facts follow the capture rather than precede it, so the time
  stands beside the capture's first line and nothing above the text reads as a title. The tag
  line is still held on an untagged row, so selecting it moves nothing, as empty space under the
  text. _Settled in review, 2026-09-29: the first build put the facts above the capture, where an
  untagged row's held line read as a blank title._
- **Neutral**: the place kept for a reload is a scroll offset, so it lands elsewhere after the
  choice changes. The choice changes rarely.

---

## Pros and cons of the options

### Option 1: one layout, tightened

- **Good**: nothing new to maintain.
- **Bad**: the rail's width comes from the tags, and no tightening makes the stamp and the tags
  fit in less than a quarter of a phone screen without wrapping further.

### Option 2: by day everywhere

- **Good**: one layout, and the date said once per day everywhere.
- **Bad**: it removes the rail's reading on a wide screen, where it costs nothing, to fix a
  problem only a narrow screen has. It also imposes the change on every reader.

### Option 3: by day below `narrow`, fixed

- **Good**: it fixes the phone and leaves the desk as it was.
- **Bad**: it has all of option 4's maintenance cost and none of the reader's say. Once both
  layouts exist, withholding the choice saves nothing.

### Option 4: a choice

- **Good**: the phone is fixed by default, and either layout is available at any width.
- **Bad**: the same two layouts as option 3, plus one setting.

---

## More information

- Plan: [rows-by-day](../plans/rows-by-day.md).
- Design: turn 4 of `Days.dc.html` in the Claude Design project *notemap shell — redrawn*. 4c is
  by day below `narrow`, 4d is by day above it, and 4e is the setting.
- Spec: [shell.md](../specs/shell.md#the-shape-of-the-shell).

Revisit if one layout goes unused, whichever it is. If nobody chooses the rail on a phone, or
days on a wide screen, the choice is not paying for its second layout, and fixing the answer
(option 3) or dropping a layout is the way back to one.
