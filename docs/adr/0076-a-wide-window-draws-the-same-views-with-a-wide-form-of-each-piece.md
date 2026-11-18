# 76. A wide window draws the same views, with a wide form of each piece

**Date**: 2026-11-13
**Status**: Proposed. Amends [ADR 71](0071-the-shell-is-drawn-for-a-phone-first-in-blocks-on-three-surfaces.md)
("a wide window's layout is not decided here") and
[ADR 72](0072-processing-is-a-quick-sheet-and-a-route-in-steps.md) (the route page on a wide
window).
Amended 2026-11-18: the item opens across the window beside the menu, not beside its list
(see [Amendment](#amendment-2026-11-18)).
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

ADRs 71 to 75 draw the shell for a phone and leave a wide window to later. The shell is one
SvelteKit build for the browser at a desk, the browser on a phone, and an app that wraps the same
build. The phone and the desk differ in how the screen is laid out and in where actions go: a thumb
at the foot of the screen against a pointer and a keyboard, one column against room for three.
They do not differ in what a row, an item, a record or a settings form says.

How does a wide window lay out the phone's views, and how much is drawn twice?

---

## Decision drivers

- **One build, and as much of it shared as can be.** A second set of views is a second shell to
  keep in step.
- **The desk is where long sessions of processing happen**, with a keyboard. The shell already
  has keys for every command (`bindings.ts`).
- **The item must stay in sight while it is routed.** On a phone the steps take the screen in
  turn. A desk has room to show the note and every step at once, which is how the process surface
  worked and why it was liked.
- **No feature lost.** Hold to select and swipe to route have no pointer equivalent of their own.

---

## Considered options

1. **The phone's layout, centred**, at every width.
2. **A wide form of each piece.** The views stay the same. Each piece that is about the screen
   rather than the content (the menu, capture, the item, bars, sheets, selecting, the route page)
   has a phone form and a wide form, chosen by width.
3. **A separate desktop design**, its own views and layouts.

---

## Decision outcome

Chosen: **Option 2**, from 900px wide. The design is in
[`docs/design/mobile/`](../design/mobile/), shots `w*` in its `shots/`, and the table of pieces
in its [DECISIONS.md](../design/mobile/DECISIONS.md#a-wide-window).

- **The menu** is a column, always there, and a rail of icons with counts between 900 and 1199.
- **Capture** is a box at the top of the queue, in place of the + and the capture page. A capture
  from it says where it landed, as on the phone.
- **The item** opens beside the list, at every wide width. Its actions are a toolbar at the head
  of its pane, near the words, not at the window's foot.
- **Sheets** become panels at the right (filter, notices), and the quick route a dialog.
- **Selecting** is ctrl/cmd-click and shift-click as well as the circle, which shows on hover with
  Route. The batch's actions move into the head, beside the count.
- **Keys** are the shell's existing bindings. A button that has a key shows it in its tooltip.
- **The route page** is one surface: the item, whole, on the left, with Discard and Done; every
  step at once on the right, a step that waits on an earlier one saying so in a line, and Route at
  the foot of the steps. A template's answers are picked, not moved on from. After routing, the
  right side is the routed state.

Pages that are the same at every width (settings, a record, the log, sign in) take the menu column
and keep the phone's page in a readable column; they are not drawn twice.

### Consequences

- **Good**: one set of views. A piece is built once with both forms, so the wide form is not a
  rework later.
- **Good**: the desk keeps what worked in the old process surface, the note beside every step.
- **Bad**: the route page has two arrangements of the same steps, and each change to a step is
  checked in both.
- **Bad**: the item's actions sit at the foot on a phone and at the head on a wide window. That
  is deliberate, since each is where the hand is, but a component has to know which form it is in.
- **Neutral**: the breakpoint is the width, not the device. A tablet held wide gets the wide form.

---

## Pros and cons of the options

### Option 1: the phone's layout, centred

- **Good**: nothing to build.
- **Bad**: a pointer and a keyboard get a thumb's layout, one item at a time, with a list hidden
  behind each opened item, and the route's steps one by one on a screen with room for all of
  them.

### Option 2: a wide form of each piece

- **Good**: the screen's room is used where it pays (the list beside the item, the note beside the
  steps) and nowhere else.
- **Bad**: about eight pieces with two forms, and the route page arranged twice.

### Option 3: a separate desktop design

- **Good**: each layout free to be what its screen wants.
- **Bad**: two shells, which is what one build was chosen to avoid.

---

## More information

- Design: `queue.html?frame=full`, `route.html?frame=full`, `feed.html?frame=full` in
  [`docs/design/mobile/`](../design/mobile/).
- Review: the second design review's wide findings
  ([2026-11-13](../reviews/mobile-design-review-2026-11-13.md)), each answered here.

Revisit if the route page's two arrangements drift apart, or if a phone held wide (900px and over)
turns out to want the phone's forms: then the choice goes by pointer rather than by width.

---

## Amendment, 2026-11-18

Built, the item beside its list was too much at once: the menu, the list and the item side by side,
three columns for one thing being read. The developer chose to let **the item take the window
beside the menu** when wide, as it takes the screen on a phone, with its toolbar at its head as
before. The list keeps the reader's place: coming back to it, the row last opened is marked. The
route page already took the whole window and is unchanged.

So the third row of the table reads: *The item, full screen → the item across the window beside the
menu, its actions at its head.* What the option traded is otherwise unchanged; the cost is that
walking the list item by item from a desk is Previous and Next on the item, or `[` `]`, rather than
the list beside it.

## Amendment, 2026-11-18, after the review

Settings at full width were the same three columns the item was moved off. Nesting the sections
in the menu at full width was tried and reversed the same day: settings were drawn two ways at
two widths. Settings now read as a phone's do, one list of sections under quiet group labels;
when wide that list is a column of its own beside the section at every width. Three columns
here are the menu, a short list and a page, which reads as one place, where the item beside its
list read as two. A form's Save, at the foot of a long form, was below the fold when wide; a form now
has its bar at its head when wide, as a destination's page does. The batch's actions sit in the
header beside the count, as the table already said.

