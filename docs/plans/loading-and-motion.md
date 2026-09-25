# Loading and motion in the shell

**Date**: 2026-09-25
**Status**: Done <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/shell.md`
**Closed**: 2026-09-25

---

## Goal

> Every request the shell is **asking** the pool shows a loading mark in the place its answer or
> its control already occupies, never moving the page to say so, and the structural motion the
> visual direction names — rows entering and leaving, the corner, disclosure, the process advance —
> moves, and holds still under `prefers-reduced-motion`.

Out of scope: a view of everything in flight (the outbox), which stays its own item in
`docs/todo.md`.

## Decisions taken

Settled in a grilling session on 2026-09-25. Two turned out otherwise in the building: an index
line never opens, so there was no index row to slide; and the rule that keeps a read still watches
`loading` changing either way, since a turned order starts by emptying the list.

- **Asking** is the glossary's word for a request the shell holds no answer to yet — a read, a
  description, a preview, a route — and is never **pending**, which is the outbox's. Already in
  `CONTEXT.md`, uncommitted on `main`; it goes in with phase 1. It is never a word on screen.
- **The mark is three stepping squares**: one filled at a time, hard steps, ink on ground, no fade
  and so no grey. Under reduced motion, three hollow squares, still.
- **It appears after 250ms** and goes the moment the answer lands. No minimum hold: an answer that
  has arrived is never held back to finish an animation.
- **A word only when it says something the screen does not.** `loading` is never one. Today that
  is one case: a wait on a **destination** — describe, preview, the place's candidates — that
  passes ~3s adds `<name> is slow to answer`. The mark takes an optional subject and threshold so
  the word can be used elsewhere; `waiting` is not available, being the bar's word for the outbox.
- **A button** draws the mark in place of its label at the label's width, the way `load more`
  already keeps its width. `loading…`, `signing in`, `reading…` and `…` all become the mark.
- **A region** draws the mark on the first line its answer will take. Nothing appears only to
  vanish: the process surface's `routing…` status line goes, the button carrying the mark, and the
  line is failure's alone. The preview block reserves its five lines, as the unfurl reserves four.
  No skeletons: the answers have no predictable shape, most are never seen past 250ms, and they
  would need a grey ADR 46 removed.
- **Motion is Svelte's own** `svelte/transition`, no library, no `animate:flip` — nothing on
  screen reorders; a row's height sliding carries its neighbours by layout.
  - **Lists** (queue, feed, log): a row slides and fades in or out over `long`. **What a read
    brought never moves** — a page, a re-read, a turn of order, the pool's first answer over the
    cache. The shell infers it: the update in which a list's `loading` changes is a read's
    start or landing, and every other change is a change. A decided row leaves when the selection lets it
    go, as the spec already holds it.
  - **The corner**: a notice fades in rising from below, fades out, and the rest close over
    `long`.
  - **Disclosure** — a process section, a settings row, `more` on a clamp or a preview: height slides over `short`, no fade. The selected row's box and foot **fade only**,
    since selecting shifts nothing and a slide would bring the shift back.
  - **The process advance**: the next item fades up over `long`; the one decided goes at once.
  - **Overlays** — the order chooser, the tag chooser, the path and candidate lists — do not move.
- **A row is one element**: a `col-span-full` subgrid wrapper per item in the register, so a row
  has a height to slide and the columns stay in register.
- **Durations are tokens named by magnitude**: `--duration-short` (~150ms), `--duration-long`
  (~220ms), `--duration-step` (~300ms, the mark's loop), one `--ease-motion`, Tailwind's easings
  cleared. All zeroed under `prefers-reduced-motion` in `tokens.css`. This is the one exception to
  naming by role, and *Tokens and themes* says so.
- **No ADR.** Nothing here is hard to reverse, and the one reversal weighed — a grey — was declined.

---

## Tasks

### Phase 1 — tokens and the motion module

Depends on nothing.

- [x] Branch `agent/loading-and-motion`; commit `CONTEXT.md`'s **Asking** first, on its own. _(2026-09-25)_
- [x] `tokens.css`: the three durations and the easing; `--ease-*: initial` in the clearing block;
      the reduced-motion override zeroing all three. _(2026-09-25)_
- [x] `tokens.test.ts`: the gate learns the new names, and still fails on a duration or easing
      named outside `tokens.css`. _(2026-09-25)_
- [x] `lib/motion.ts`: the transitions the shell uses — slide, fade, the rise — reading duration
      and easing off the tokens at the moment they run, so reduced motion and a test's missing
      stylesheet both come out as zero. _(2026-09-25)_
- [x] shell.md: *Motion* no longer "not yet built" — what moves, what does not, the two magnitudes;
      *Tokens and themes* names the durations and the exception. _(2026-09-25)_
- [x] Typecheck, tests, lint; `git commit`. _(2026-09-25)_

**Verify**: `pnpm -r --silent test` green; a unit test shows the transitions resolving to zero
duration when the tokens are absent and when reduced motion is on.

### Phase 2 — the mark, and buttons

Depends on phase 1 (`--duration-step`).

- [x] `primitives/marks/Asking.svelte`: the squares, the 250ms delay, an optional subject and
      threshold for the slow word; one line tall; a label for a reader that cannot see it. _(2026-09-25)_
- [x] `Action` draws the mark in place of its label at the label's width, generalised from the
      stacked cell `More` uses; `More` moves onto it. _(2026-09-25)_
- [x] Every busy button onto it: capture, edit's `save` and `attach`, sign in, the settings forms,
      `check again` on a destination, a template and the server, the pool settings' options. _(2026-09-25)_
- [x] shell.md: *Reachable, pending, refused* gains asking — how it is drawn, and that it is never
      pending's mark; *Draining*'s `loading…` becomes the mark. _(2026-09-25)_
- [x] Typecheck, tests, lint; `git commit`. _(2026-09-25)_

**Verify**: tests with fake timers — nothing before 250ms, the mark after, gone on the answer; a
subject and threshold add the word after the threshold; a button's width is the same both ways.

### Phase 3 — regions

Depends on phase 2.

- [x] Process surface: the mark on the place section's first line while the destination is being
      described, with the slow word naming it; the preview block reserves five lines and asks
      with the mark and the slow word; `route` carries the mark and the status line is failure's
      alone. _(2026-09-25)_
- [x] The candidate browser and the path line: the mark where the list will be, with the slow word;
      the `loading…` paragraph goes. _(2026-09-25)_
- [x] A cold first read — queue, feed, log, an item, the process surface's item — draws the mark
      where the first row or the item will stand, not a blank page. _(2026-09-25)_
- [x] The unfurl's asking state draws the mark inside its fixed frame, with no word: the wait is the
      daemon's. _(2026-09-25)_
- [x] shell.md: where each region draws its mark; *Prior decisions* records skeletons and a grey as
      declined. _(2026-09-25)_
- [x] Typecheck, tests, lint; `git commit`. _(2026-09-25)_

**Verify**: tests per region asserting the mark and the slow word under a held answer, and that
the process surface's status line is absent while routing. By hand in a browser, with a
destination made slow: nothing below a region moves until its answer lands.

### Phase 4 — a row is one element

Depends on nothing; lands before phase 5 so a structural change is looked at without motion on top.

- [x] `Register`: each item one `col-span-full` subgrid wrapper. `Row`, the queue's `Index` and
      `LogRow` drop their cells into it. _(2026-09-25)_
- [x] shell.md *Visual direction*, *Grid*: an item is one element on the shared tracks. _(2026-09-25)_
- [x] Typecheck, tests, lint; `git commit`. _(2026-09-25)_

**Verify**: the existing register and row tests unchanged and green. By hand, at desk and phone
widths: columns in register, the rail's rule unbroken, the selected row's box where it was.

### Phase 5 — list motion

Depends on phases 1 and 4.

- [x] Client: a test pinning that a read's rows and the end of its `loading` arrive in one
      emission, since the shell relies on it. _(2026-09-25)_
- [x] The shell's rule, as a function of the previous and next list: which rows arriving or leaving
      move, and none when `loading` just went false. The log follows the same rule on its own
      `loading`. _(2026-09-25)_
- [x] Queue, feed and log rows slide in and out by it; the held row slides when the selection
      releases it, and the selection and keys never land on a row on its way out. _(2026-09-25)_
- [x] shell.md: *Draining* and the queue's held row say what moves and what a read brings in still. _(2026-09-25)_
- [x] Typecheck, tests, lint; `git commit`. _(2026-09-25)_

**Verify**: unit tests on the rule — a page, a turn and the pool's first answer over the cache
move nothing; a decision released, a capture and a live arrival move one row. By hand: decide on
the queue, `j` off, the row slides out; scroll the feed deep, pages appear still.

### Phase 6 — the corner, disclosure, the advance

Depends on phase 1.

- [x] The corner: a notice rises in, fades out, the rest close; the hold under the pointer and focus
      is unchanged. _(2026-09-25)_
- [x] Disclosure: process sections, a settings row opening, `more` on a clamp and on the preview
      slide; the selected row's box and foot fade. _(2026-09-25)_
- [-] An index row opening. _(dropped — selecting an index line only bolds it; nothing opens)_
- [x] The process advance: the next item fades up. _(2026-09-25)_
- [x] shell.md: *The corner says what happened*, *The process surface* and the index say what moves. _(2026-09-25)_
- [x] `docs/todo.md`: the loading item ticked. _(2026-09-25)_
- [x] Typecheck, tests, lint; `git commit`. _(2026-09-25)_

**Verify**: the existing corner, process and settings tests green with motion present. By hand,
with reduced motion on and off: each moves when on, none when off, and the index row's height
settles where it did before.

### Phase 7 — the jumps found in use

Reported after phases 1–6, each measured in a browser before it was changed.

- [x] A new capture slid toward a height it never kept: the `pending` mark was drawn for the few
      milliseconds before the capture drained. The mark now waits 250ms, as the asking mark does. _(2026-09-25)_
- [x] Selecting a row, and opening the tag line, grew it: the `+` took a line of its own and the
      line was taller than a line and fixed in width. Every row now keeps its tag line (settled
      with the developer); the line opens where the `+` stood, one line tall. _(2026-09-25)_
- [x] A tag that wraps onto a new line grows the row rather than jumping; a tag's inverted box no
      longer adds to its line. _(2026-09-25)_
- [x] Turning the order moved everything sideways: the list emptied, the scrollbar went. The
      scrollbar's gutter is kept. _(2026-09-25)_
- [x] Every reload slid its rows in: the cache fills the list after the first draw. A list going from
      nothing to something now stands still. The face is preloaded and never swapped. _(2026-09-25)_
- [x] The log's records grew as their outputs landed, on every visit. Outputs, and their absence,
      are read once a page; a record known to hold one holds its line meanwhile; a decision made by
      hand is not asked. `read it` carries the asking mark rather than `reading…`. _(2026-09-25)_
- [x] An unfurl's picture pushed its words aside: its room is kept, and it fades in. _(2026-09-25)_
- [x] shell.md, and typecheck, tests, lint; `git commit`. _(2026-09-25)_
- [x] A selected row's routing records still snapped it to its new height. Any change of a row's
      height in place — on the queue, the feed or the log — now grows or shrinks into it, which
      replaces the tag-only case above. _(2026-09-25)_

### Phase 8 — added in use

Asked for after phase 7, as the developer finds them.

- [x] The capture box: `attach` stands behind a rule of its own, as `capture` does; the attached
      picture sits in a section ruled off above the text, which slides open and fades in; `drop`
      becomes `×`. _(2026-09-25)_
- [x] Tags: a selected tag is ruled round rather than inverted, one line tall, and its `×` slides
      in inside the rule; a tag slides in and out as it is added and taken off; the chooser's line
      widens out from where the `+` stood and its panel unrolls, both short and never holding a key
      back, the panel's height following the narrowing. Overlays no longer all stand still. _(2026-09-25)_
- [x] The process surface: an open section's height follows what it holds — a destination
      chosen, a place described, `route` clearing the decision — turned from where it stands at
      each change. _(2026-09-25)_
- [x] One measure, 72rem, for every surface and the bar, so the navigation keeps its width on
      the way into the process surface; a paragraph keeps its 38rem. The process surface at 56rem
      was tried first and was too narrow. ADR 46 amended. _(2026-09-25)_
- [-] An item carried between its row and its own surfaces by view transitions. _(built and taken
      out 2026-09-25 — the developer preferred the cut)_
- [x] The bar's surfaces and the view toggle ease into bold and out, holding their bold width so
      their neighbours stay put. _(2026-09-25)_
- [x] Settings: add and edit forms, the minted token and the server's sources slide open and shut;
      a form follows its height as a kind changes its fields. _(2026-09-25)_
- [x] The selected index line eases into bold without widening the stamp column; `settings` is
      current in the bar at a section's address. _(2026-09-25)_
- [x] `ease-fade` for what changes in place, measured in a browser: the selected row's box faded
      in on `ease-motion` at 73% by its third frame, and its foot left at once. It now fades both
      ways, in step. _(2026-09-25)_

---

## Unknowns

- **Whether a keyed row's intro plays when a surface first mounts.** Svelte's transitions are
  local, which should keep the first draw still; if it does not, the rule in phase 5 gains "nothing
  moves before the surface's first draw" as an explicit case.
- **Whether `slide` measures a subgrid wrapper right.** It animates height with overflow hidden,
  which a grid item should take. If it does not, phase 5 writes its own height transition in
  `lib/motion.ts` rather than reaching for a library.
- **Revealing the next row while the last one slides out.** Keeping the selection in view reads a
  position that is still moving; if the view jumps, the reveal waits for the slide.
- **The mark's squares in the shell's face.** Drawn by CSS rather than as glyphs, since
  `■ □` may not be in Bricolage Grotesque; a fallback face would break the one-face rule.
- **No screenshots.** `notemap-shoot-app` still walks the removed modal composer, so every "by
  hand" above is a person in a browser.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

jsdom computes no stylesheet, so every duration reads as zero under test and Svelte runs no
animation at all: the suite needs no stub for `element.animate`, and a leaving row is gone at once
as it is today. Tests assert the decisions — when the mark shows, when a word joins it, which list
change moves, that reduced motion zeroes the scale — never the frames. No layer boundary is
crossed, so `pnpm test:stack` is not part of this plan.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
