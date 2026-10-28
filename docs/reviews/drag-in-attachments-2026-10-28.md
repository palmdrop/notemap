# Review: Drop and paste attachments

**Date**: 2026-10-28
**Status**: Resolved
**Scope**: `apps/ui/src/components/dropping/`, `apps/ui/src/lib/{receiving.svelte,dropped,walking}.ts`, registrations in `Capture.svelte` and `Edit.svelte`, the remove rename, `CONTEXT.md`, `docs/specs/shell.md` (PR #119)
**Plan**: `docs/plans/drag-in-attachments.md`
**Spec**: `docs/specs/shell.md` — Dropping and pasting files

---

## Overall

Matches the plan and the spec closely. The thresholds (3 files, under 25 MB, 500), hidden-file
counting, notice wording and the receiver ranking all agree with `shell.md`. The rename is
complete in the current text. Targeted tests pass (74). The real risks are browser behaviour that
jsdom can't show: the enter/leave counter can stick, and Chromium marks in-page image drags as
`Files`. Neither shows up in tests. Staging should check both before the plan's by-hand boxes are
ticked.

---

## Bugs

### 1. The overlay can stick when the element under the pointer is removed mid-drag

`apps/ui/src/components/dropping/Dropping.svelte:120-126`. The counter sits at 1 while a file
is over the page: each element crossed fires one enter on the new element and one leave on the
old. If the element under the pointer is removed during the drag, its `dragleave` goes to a
detached node and never bubbles to `window`. That can happen when a row arrives or leaves
through a live update, a notice expires on the status line, or a transition finishes.

```
node under pointer removed → dragenter on new node (+1), dragleave on detached node (lost)
→ pointer leaves window → entered stays 1 → overlay (bg-ground/85, full viewport) stays up
```

Only a later drop that carries files clears it.

Fix: don't rely on the counter alone. Clear it a short time after the last `dragover`, since
`dragover` fires continuously while over the page, or on the next `pointermove`/`mousemove`,
which never fire during a drag.

### 2. In-page and cross-tab image drags carry `Files` in Chromium (verify on staging)

`apps/ui/src/lib/dropped.ts:4-6`, `Dropping.svelte:116-147`. Chromium adds `Files` to `types`
when an `<img>` is dragged, so a drag-out to the desktop works. Firefox does something similar.
The app's own thumbnails are draggable `<img>`s, so dragging one would raise `attach to the
capture`. The drop would then attach a copy, or, if `files` is empty, be swallowed silently.
`shell.md` says "anything on the page raises nothing" and "a picture dragged out of another tab
is not taken", but nothing in the code enforces either.

Fix: set a flag on a window `dragstart`, which fires only for drags that begin in this document,
and ignore those drags. Confirm the cross-tab case on staging and soften the spec if the browser
hands over bytes.

### 3. A failed read with no folders says "0 folders: could not be read"

`Dropping.svelte:58-70`. When no folders were dropped, `what` is `` `${0} folders` ``. A dropped
file entry whose `file()` fails (moved, permission denied) raises `0 folders: could not be read`.

Fix: give the no-folder case its own word, as the ceiling notice already does (`what was
dropped`).

---

## Design

### 4. A paste into the box's own field is ignored while an edit is open

`Dropping.svelte:149-153`. On the queue with an edit open, the box's textarea can still be
focused, because the edit is inline and not modal. The receiver is the edit, and the box's field
is not the edit's (`owns` is false), so the paste is left to the textarea, which drops the image
silently. This matches the spec's letter. But a paste is aimed at the field it lands in, unlike
a drop onto the whole viewport. Consider letting the focused receiver's field win for paste.

### 5. A drop or paste while a dialog is open still arrives

`Dropping.svelte:138-158`. While the leaving dialog is open, a drop adds files to the edit being
asked about. A "revert" then discards them unseen, and a "save" saves them unseen. A drop or
paste while `Asking` is open queues behind it. In both cases the overlay is drawn at `z-100`, so
it sits under the top layer (dialog and `::backdrop`) and is barely visible. Consider refusing
arrivals while `dialog[open]` exists, the way `dispatch.ts:21` does for keys.

---

## Minor

### 6. The ceiling bounds files, not listing

`apps/ui/src/lib/walking.ts:53-55, 81-91`. `listed` reads a folder's whole listing before any
entry is counted. A single folder with tens of thousands of entries is listed in full (in
batches of 100 in Chromium) before the walk refuses it. That falls short of "never read whole"
in spirit.

### 7. Tests that assert less than their names claim

- `receiving.svelte.test.ts` "an edit outranks the box, whichever was drawn first" registers the
  edit first only.
- `Dropping.test.ts:123` "takes nothing while busy … and says so" passes with or without the
  drop-time guard (`Dropping.svelte:144`), because `settle` re-checks `busy()`. It does not
  assert any notice.
- Nothing asserts that the box is brought into view after a drop (`Capture.svelte:173-177`), or
  `dropEffect`.

### 8. `isField` treats every `<input>` as a field

`apps/ui/src/lib/dropped.ts:20-23`. With focus on a checkbox or radio, a paste won't attach. This
is unlikely to fire.

---

## Non-issues

- **Spreading `DataTransferItemList`.** It is iterable through its indexed getter, and
  `webkitGetAsEntry` is only called on `kind === "file"` items, synchronously inside `drop`.
- **Holding entries across `await` and the turn queue.** `FileSystemEntry` and `File` stay
  valid after the event. Only the `DataTransfer` is neutered.
- **`readEntries` looping until an empty batch.** This is correct in Chromium (batches of 100)
  and Firefox alike.
- **`dropEffect = "none"` on surfaces with no receiver.** Real browsers then fire no `drop`, only
  `dragleave`, and do not navigate. The `drop`-time guard only matters in jsdom.
- **`to.busy()` in the template.** It reads `$state` (`busy` in Capture, `Editing.busy`) through
  a closure, so it is tracked.
- **Outgoing and incoming pages both mounted.** `findLast` prefers the later registration, and
  `isReceiving` catches a receiver that went away while its files were being asked about.
- **Edit is not a modal.** Only the leaving question is, so the overlay is not hidden behind an
  open edit.
- **`Tags.svelte` `drop(name)`.** It takes a tag off, not an attachment, so it is outside the
  rename.
- **Dated spec entries that still say "drop"** (shell.md:80, 110, 294). They are kept as written,
  per the plan.
- **Plan Status `In progress` with a `Shipped:` entry already written.** The plan's notes allow
  this for partial delivery. Only the by-hand checks are open.

---

## Resolution

Every finding was fixed on the same branch, with the spec amended where it applied:

1. The overlay goes once the drag has gone quiet for a second, as well as on the last leave.
2. A drag that started on the page is ignored. A pointer moving clears the flag, in case its
   `dragend` was lost. The spec now says a picture from another tab is taken only where the
   browser hands over its bytes. That case still needs checking on staging.
3. A failed read names the file, or `what was dropped`.
4. A paste goes to whatever owns the field it lands in, ahead of the drop-ranked receiver.
5. Nothing arrives while any `dialog[open]` exists, and no overlay is raised. A drop still waits
   its turn behind a folder being read.
6. The walk reads each folder batch by batch, so reaching the ceiling stops the listing too.
7. Tests cover both registration orders, the busy guard (no notice), `dropEffect` and the box
   being brought into view.
8. `isField` reuses `writing` and leaves out inputs that take no text.

