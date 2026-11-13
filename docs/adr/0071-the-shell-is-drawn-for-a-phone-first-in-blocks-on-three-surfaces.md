# 71. The shell is drawn for a phone first, in blocks on three surfaces

**Date**: 2026-11-13
**Status**: Accepted. Supersedes [ADR 46](0046-the-shell-is-one-face-one-size-ink-on-white-and-processing-is-a-surface.md)
on type, colour, grid and chrome. Its processing tiers are superseded by
[ADR 72](0072-processing-is-a-quick-sheet-and-a-route-in-steps.md).
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

ADR 46 drew the shell for a desk and narrowed it for a phone. It used one face at one size, ink on
white, no grey, and structure carried by rules and columns. Used on a phone, it reads as a document
rather than a place to act. Every control is a word in the same size and face as the text around
it. Actions sit at the top of the page, out of the thumb's reach. The process surface puts every
argument on one long page. And nothing tells something you can press from something you read.
The audit of 2026-10-30 found this on every route. Two rounds of mockups and two reviews followed,
on 2026-11-09 and 2026-11-13.

What is the shell's visual system once a phone is the first screen it is drawn for?

---

## Decision drivers

- **The phone is where capture and triage happen.** A person picks it up, writes a line, sends it
  somewhere and puts it down. One hand, thumb at the foot.
- **Pressable and readable must look different** without a legend. On a phone a hover cannot say
  which is which.
- **Conventional controls.** A segmented row, a docked bar and a bottom sheet need no
  explaining. A word that turns out to be a button does.
- **No feature lost.** Every control the shell has today has a place.
- **Tokens by role**, as ADR 46 asked. Whatever is decided reduces to one file of named values.
- **Offline-friendly.** Faces and icons are served with the app.

---

## Considered options

1. **Keep ADR 46's register** and change only the layout: actions moved to the foot, still as
   words.
2. **Blocks on three surfaces.** Beige for what can be pressed, grey bands for headings, white
   with a rule for what is read. Two faces, a small scale of sizes, icons with words, and docked
   bars, sheets, a drawer and a full-screen item.
3. **Floating bars in the morph shape** throughout. Rounded, layered bars that change shape
   between states, as round 3 drew them.
4. **Outlined controls on white.** Conventional, with the pressable told apart by an edge alone.

---

## Decision outcome

Chosen: **Option 2**. The design is in [`docs/design/mobile/`](../design/mobile/), and what was
settled with it is in [its DECISIONS.md](../design/mobile/DECISIONS.md).

**Three surfaces.** Beige (`--off`, `#e9e6df`) is what can be pressed: every button, toggle and
choice. Grey bands (`--band`) are headings for groups of rows. White with a rule is what is read:
rows, records, the words of an item. A lighter box grey (`--tag`) is kept for what is under way and
for state boxes: a route in its window, a pending record, "On its way". A plain label is enough
for a single field. A band is for a group of rows.

**Blocks.** An action bar is beige and docked at the foot of a page under a rule. The main action
is a wide filled block in ink. The others are an icon over a word, with no box. A main action
that cannot be taken yet stays in its place, dashed, and a line above the bar says why. A choice
of one among a few is a segmented row, with the chosen part filled. Choices that can all be on are
boxes of their own, filled and ticked when on. A long choice is a list of rows, not toggles. An
action standing alone in a page is a beige box in the page, not alone in a bar.

**Type.** Syne, upright, for headings, bands and titles. Arimo, which has Arial's metrics, for
everything else. Five sizes, by role: title, weekday, body, time and small. Both faces are served
by the daemon, which is what ADR 46 already allowed for its one face.

**Colour.** Ink on white stays the ground. Green (`--signal`) means delivered or available and
nothing else. Red means failed, rejected or destructive. Anything under way is grey, with a
spinner. The pending mark is a dot.

**Icons with words.** Every state and every action has words, and an icon only supports them.
The icon in the header carries its own label. The set is Carbon, with Tabler's route icon, kept as
one sprite and named by role.

**Shape of the shell.** The queue, the feed and the log are lists under a header. The header holds
the title and icons for search, filter and notices. Navigation is a drawer, which also holds the
waiting count and who is signed in. A capture is written on a page of its own, reached by a
floating +. An item opens full screen, with Previous and Next, and its actions dock at its foot.
Filters, the quick route and questions open as bottom sheets. Settings are a menu of sections,
each a page.

**The morph shape** stays only on the item's Previous and Next, where it reads as a way to step
through the queue. The other variants are kept in `morph.html` as drawings.

**No dots as separators.** Words or space do the job: "Rejected by Vault in projects/", "todo.md
in Vault".

A wide window's layout is not decided here. Until it is, the phone's layout is what every width
draws.

### Consequences

- **Good**: you can tell what can be pressed at a glance, on any surface, without hover.
- **Good**: the main action on every page is in the same place, under the thumb.
- **Good**: the register reduces to a handful of tokens by role, as before. There are more of
  them, and each is named for what it means.
- **Bad**: two faces and an icon sprite ship with the app, where ADR 46 had one face.
- **Bad**: `shell.md`'s Visual direction, Tokens and Shape of the shell sections are rewritten,
  and `docs/design/redrawn/` is replaced. The old drawings are wrong once this is accepted.
- **Bad**: on a wide screen the phone's layout wastes the width until a wide layout is decided.
- **Neutral**: ADR 46's grey exception becomes two greys, each with one job, plus beige.

---

## Pros and cons of the options

### Option 1: ADR 46's register, relaid

- **Good**: cheapest. Tokens and faces stay as they are.
- **Bad**: it never answers the finding that matters. A word in the body's face and size is not
  a control on a phone, wherever it is placed.

### Option 2: blocks on three surfaces

- **Good**: a reader can tell what is pressable from what is read, with no hover and no legend.
- **Good**: every control is one that phones already have: docked bars, sheets, segmented rows.
- **Bad**: more tokens, a second face, and a spec rewrite.

### Option 3: floating bars in the morph shape

- **Good**: distinctive. It reads well as Previous and Next on an item.
- **Bad**: drawn on the bars for editing and capture, it looked odd, and the developer dropped it
  there on 2026-11-13. A shape that changes between states makes a reader look twice at the
  one bar they should not have to read.

### Option 4: outlined controls on white

- **Good**: conventional, and the least colour.
- **Bad**: tried, with white for inactive and then two greys. With white, an inactive toggle
  looked the same as a row being read. With grey, it looked the same as a band or a state box.
  Beige had no other meaning yet, so it was given this one.

---

## More information

- Design: [`docs/design/mobile/`](../design/mobile/), shots in
  [`docs/design/mobile/shots/`](../design/mobile/shots/).
- Reviews: [2026-11-09](../reviews/mobile-design-review-2026-11-09.md),
  [2026-11-13](../reviews/mobile-design-review-2026-11-13.md). Audit of the shell as it was:
  [2026-10-30](../reviews/mobile-rethink-audit-2026-10-30.md).
- Plan: [mobile-first-rethink](../plans/mobile-first-rethink.md).

Revisit when a wide layout is drawn. If the beige stops reading as pressable once it shares a
screen with the wide layout's panels, the three surfaces need another look. Revisit Dark too, which
is offered and not yet drawn.
