# Phone UI fixes from the first days on a device

**Date**: 2026-11-25
**Status**: In progress
**Spec**: `docs/specs/shell.md`
**Closed**:

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

- [ ] A `hand` setting, right or left, kept on this device. It is shown in Appearance on a phone.
- [ ] The queue's + sits at the lower left when the setting is left. Nothing else moves.
- [ ] Spec: "Settings" and "Capture is the head of the queue" say so.
- [ ] Tests: the setting is kept and read back, and the + follows it.
- [ ] Commit

### Phase 6: finish

- [ ] Typecheck, lint, `pnpm -r --no-sort --silent test`
- [ ] `Shipped:` entry in `docs/specs/shell.md`, plan ticked
- [ ] Commit

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
