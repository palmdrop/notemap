# Phone UI fixes from the first days on a device

**Date**: 2026-11-25
**Status**: Done
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`
**Closed**: 2026-11-26

---

## Goal

On a phone at 390px the filter panel opens without a keyboard. The tag offer in the capture page and
an edit keeps its line in view and fits above the keyboard. The capture page never scrolls its bar
away. A queue row swiped either way shows what it uncovers, and a swipe right offers Manual and
Discard. When wide, a hovered queue row offers Manual and Discard beside Route, and Route shows on
every hovered row it should. The row last opened reads as a place, not a selection. A left-hand
setting moves the + to the lower left. Each of these has a test or a headless Chromium check.

---

## Decisions

- **Swipe right reveals buttons** (the developer, 2026-11-25), Manual and Discard, held open until
  one is tapped, the row is tapped, or another row is swiped. Distances were weighed and rejected:
  two actions told apart by how far the finger went are easy to take by mistake.
- **Swipes right only on the queue.** Every queue row is unrouted, so both actions always apply. A
  feed row may already be routed or discarded; the feed keeps its swipe left.
- **Manual and Discard act at once**, through `$lib/quick`'s `manual` and `discard`, with `undo` on
  the status line, as they do from the item. No confirmation.
- **The left-hand setting moves only the +** (the developer, 2026-11-25). Swipes, bars and sheets
  stay as they are. It is kept on this device, like the theme.
- **The last-opened row is marked by an edge on its rail, not the box grey.** The grey stays the
  key cursor's and selection's alone.

## Unknowns

- **Why the hovered Route is sometimes missing.** Candidates: it is drawn on the queue only and the
  developer was on the feed; the row is the selected one; or `pointed` is stale because the row was
  redrawn under a still pointer. Phase 4 starts by finding out in headless Chromium. If it is the
  feed, it is the spec working as written, and that goes back to the developer rather than being
  changed here.
- **Why the capture page grows past the view.** The suspected cause is the field's `min-h-[40dvh]`,
  which keeps the form taller than the view once tags are added. Phase 2 reproduces it at 390×844
  first. If something else is the cause, fix that instead and say so in the commit.

---

## Tasks

### Phase 0: branch

- [x] Branch `agent/phone-ui-fixes` from `main`, in its own worktree _(2026-11-25)_

### Phase 1: the filter panel leaves the keyboard down

- [x] `show()` focuses the Find a tag line only when the panel is opened from the keys. A tap
      focuses the sheet, as the sheet already does on open.
- [x] Test: opened by a pointer, the line is not focused. Opened by `f`, it is.
- [x] Commit

### Phase 2: tags on the capture page and in an edit (depends on nothing)

- [x] Reproduce at 390×844 with the visual viewport cut to keyboard height: the line pushed out
      of view, the offer taller than the room, the page growing after a tag.
- [x] The tag offer on a phone opens on whichever side of its line has more room, held to that
      room. When wide it stays below. _(It was the non-field offer, `.offer`, that both pages use;
      the line's scroll to the top of the view is gone.)_
- [x] The capture page fills the view exactly, and the field gives up height to the tags rather
      than the page scrolling.
- [x] Spec: amend "Capture is the head of the queue" and "Tagging" with where the offer opens
      on a phone.
- [x] Headless Chromium check: with the keyboard simulated, the line and the bar stay in view, and
      the offer sits whole between them.
- [x] Commit

### Phase 3: swipes show what they uncover, and swipe right (depends on nothing)

- [x] Behind a row swiped left, the route mark on the uncovered side, strengthening once the swipe
      has gone far enough to count.
- [x] A queue row swiped right past the threshold settles open with Manual and Discard behind it.
      A tap on either acts and closes it. A tap on the row, a swipe of another row, or a scroll
      closes it without acting.
- [x] Spec: "The row" and "Actions" say both swipes and what each uncovers.
- [x] Tests: a swipe right past the threshold opens the buttons, and a short one does not. Manual
      and Discard call `$lib/quick`. Opening one row's buttons closes another's.
- [x] Commit

### Phase 4: the hovered queue row, when wide (depends on nothing)

- [x] Find out why Route is sometimes missing (see Unknowns), and fix it if it is a bug. _(A
      selected row hid it, against the spec's "its actions are the keys and the hovered Route". Open
      and back did not reproduce. The feed still draws none, as written.)_
- [x] Manual and Discard beside the hovered Route, under the same conditions.
- [x] The last-opened row is marked by an edge on its rail, and no longer by the box grey.
- [x] Spec: amend "The row" (tints, the last-opened mark) and "Actions" (what a hovered row offers).
- [x] Tests: the hovered row offers Route, Manual and Discard. The last-opened row is not drawn
      as selected.
- [x] Commit

### Phase 5: the + for a left hand (depends on nothing)

- [x] A `hand` setting, right or left, kept on this device. It is shown in Appearance at
      every width, a tablet being either.
- [x] The queue's + sits at the lower left when the setting is left. Nothing else moves.
- [x] Spec: "Settings" and "Capture is the head of the queue" say so.
- [x] Tests: the setting is kept and read back, and the + follows it.
- [x] Commit

### Phase 6: finish

- [x] Typecheck, lint, `pnpm -r --no-sort --silent test`
- [x] `Shipped:` entry in `docs/specs/shell.md`, plan ticked
- [x] Commit

### Phase 7: the review, and a second round on the device _(added 2026-11-25)_

Asked for after the PR's review (`docs/reviews/phone-ui-fixes-pr-132-2026-11-25.md`) and a second
look on the phone. Decided with the developer: a tag sheet on a phone rather than an offer anchored
to the line; Manual stays refused while the pool is out of reach.

- [x] The review's findings, as its Resolution says.
- [x] The width is read once a resize, not once a row: `innerWidth` laid the page out again on every
  read, and a hold took a second to select at a phone's speed (measured at 6× CPU: 1464ms from the
  press to the selection, 534ms after).
- [x] On a phone a tap in the composer — a folder, a level, the × — leaves the caret where it was.
- [x] A move to another surface draws a line along the top while under way, and every surface's code
  is fetched once the first is drawn.
- [x] On a phone `+ tag` opens a sheet: the set as a field, Done at its foot. The anchored phone
  offer and the scroll that stood in for it are gone.
- [x] Spec: Tagging, the place line, the drawer, the Shipped entry.
- [x] Tests for each; typecheck, lint, `pnpm -r --no-sort --silent test`; headless Chromium at phone
  width for the sheet, the line and the timings.
- [x] Commit

### Phase 8: lists that arrive at once, and a click that selects _(added 2026-11-26)_

Asked for after a third look on the phone: Feed took seconds to arrive. Measured at 6× CPU, every
row ever walked was drawn on arrival — 199 rows, 935ms after a reload — and the cache drew every
item it held before the first page landed. Decided with the developer: cut a list to its first page
on any arrival but back and forward, rather than virtualise it now.

- [x] The client: `enter` takes `fromStart`; a cache-drawn surface draws a page until a read
  answers or fails; a feed come back to reads nothing.
- [x] The shell: back and forward keep a list and its place; anything else starts at the top; a
  list holding more than a page is drawn after the view is on screen, under the skeleton and the
  line. The queue, the feed and the log.
- [x] When wide a click selects and a second click opens.
- [x] The row last opened in the hover grey, let go of once another row is selected.
- [x] Settings drop the sheet's foot room, so the settings column stays put at a form's foot.
- [x] On a phone back steps back through the route, through a close watcher.
- [x] With the keyboard up: a sheet's main action in its head, a page's bar one short row. Being
  tried; the developer reports from the device.
- [x] Spec: shell.md and client.md, their Shipped entries; virtualisation in `docs/todo.md`.
- [x] Tests for each; typecheck, lint, `pnpm -r --no-sort --silent test`; headless Chromium timings
  at phone width.
- [x] Commit

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Keyboard and viewport behaviour in phases 2 and 3 is checked in headless Chromium at phone width,
since jsdom has no layout. The on-device check is the developer's.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer. *(Stated 2026-11-25: implement after the
plan.)*

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
