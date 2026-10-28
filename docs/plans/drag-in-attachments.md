# Drop and paste attachments

**Date**: 2026-10-28
**Status**: In progress
**Spec**: `docs/specs/shell.md`, `CONTEXT.md`
**Closed**:

---

## Goal

A file or folder dropped anywhere on the page, or an image pasted, is attached to the open edit if
there is one, otherwise to the capture box on the queue. A full-viewport overlay says where the
files will go before they land. A drop that is large or holds many files asks first. Taking an
attachment off with `×` is called **remove** throughout.

---

## Decisions taken

- **Drop means bringing a file in by dragging; remove means taking an attachment off.** The `×`,
  `Editing.drop` and `HeldAttachment`'s `ondrop` prop become remove / `remove` / `onremove`.
  CONTEXT.md's **Asset** entry gains both words. Dated spec entries keep their wording as written.
  Only the current text changes.
- **Who receives.** The open edit, on any surface. Failing that, the capture box, which only the
  queue draws. Failing both, nothing. This lives in a small `$lib` registry, separate from
  `leaving.svelte.ts`: knowing what is open and knowing what takes files are different jobs.
- **Drops are taken by the whole window, on every surface.** A drop onto a surface with no receiver
  is swallowed so the browser never navigates to the file. That navigation would lose the box's
  attachments, which are held only in memory, or interrupt an edit. No overlay is drawn there.
- **The overlay appears only for drags carrying `Files`.** Dragged text, links and in-page elements
  never raise it. It names the receiver: `attach to the capture`, or `attach to <about>` for an
  edit.
- **A URL dragged from another tab is not taken.** It carries no bytes the page may fetch.
- **Paste attaches only when the clipboard has files and no `text/plain`.** Office and spreadsheet
  copies carry a PNG rendering beside their text and must paste as text. Paste attaches when the
  focus is in the receiver's own field or not in any field. Paste into any other field is left
  alone.
- **The capture box is brought into view after a drop or paste lands in it.** An edit already does
  this when its attachments change.
- **Folders are walked, subfolders included.** Each file becomes its own attachment, named by its
  filename alone. Two files with the same name from different subfolders arrive as two attachments
  with the same name. Hidden files and folders (leading `.`) are skipped, and the confirmation says
  how many were skipped.
- **Large drops ask first.** One to three files totalling under 25 MB attach at once. Anything more
  opens a confirmation in the same system as the leaving dialog. It shows the file count, the total
  size, the first few names and how many more there are, with `attach` or `cancel`. The same rule
  covers paste.
- **A walk stops at 500 files.** Past that, the drop is refused with one line rather than offered
  for confirmation, so an accidental drop of a home folder never gets as far as reading it all.
- **Per-file size refusals keep their place.** Every file passes through `sorted`, so an oversized
  file is refused in the box's failure line or on the status line, as `attach` refuses it today.

---

## Tasks

### Phase 0

- [x] Create branch `agent/drag-in-attachments` _(2026-10-28)_

### Phase 1 — rename drop to remove

Depends on nothing.

- [x] `CONTEXT.md`: under **Asset**, *to remove* is the opposite of *to attach*, and *drop* is
  bringing a file in by dragging. _(2026-10-28)_
- [x] `shell.md`: wherever *drop* means taking an attachment off a capture or edit in the current
  text, write *remove* instead. Leave dated entries as written. _(2026-10-28)_
- [x] Code: `Editing.drop` → `remove`, `HeldAttachment`'s `ondrop` → `onremove`, the `×`'s
  accessible name, `Capture.svelte`'s local `drop`, and the tests that name them. Check each
  of the roughly 60 `drop` words in `apps/ui/src` by hand. Most are not this meaning. _(2026-10-28)_
- [x] Verify: typecheck, lint, `pnpm -r --no-sort --silent test`. _(2026-10-28)_
- [x] Commit `refactor(ui): remove, not drop, takes an attachment off` _(2026-10-28)_

### Phase 2 — drop and paste files

Depends on phase 1, for the word.

- [x] `shell.md`: a section on dropping and pasting, covering the receiver, the overlay, swallowed
  drops, the paste rule and the box coming into view. Cross-reference it from the capture box and
  edit sections. _(2026-10-28)_
- [x] `$lib` receiver registry. The capture box registers while mounted, and an `Editing` registers
  while open and outranks the box. It exposes the current receiver's name for the overlay and a
  way to hand it files. _(2026-10-28)_
- [x] Window listeners in the root layout: `dragenter`, `dragover`, `dragleave`, `drop` and
  `paste`. _(2026-10-28)_
- [x] Full-viewport overlay component, with the slide/fade motion the shell already uses. _(2026-10-28)_
- [x] The capture box takes files through the same path as `pick`, then brings itself into view.
  An edit takes them through `Editing.pick`. _(2026-10-28)_
- [x] Tests:
  - which receiver wins
  - a drag without `Files` raises nothing
  - a drop on a surface with no receiver is swallowed
  - paste with and without `text/plain`
  - paste in an unrelated field is ignored
  - files dropped on the box and on an edit are held _(2026-10-28)_
- [ ] Verify: typecheck, lint, tests. Then try it by hand on staging (`agent stage`) in Firefox and
  a Chromium. Automated checks green; by hand is left to staging.
- [x] Commit `feat(ui): drop or paste files onto the page to attach them` _(2026-10-28)_

### Phase 3 — folders and confirmation

Depends on phase 2.

- [x] `shell.md`: folders, hidden files skipped, the confirmation thresholds, the 500-file stop,
  and the overlay saying `reading <folder>…` while a walk runs. _(2026-10-28)_
- [x] `$lib` walker. It turns the entries of a drop into files, recursing into folders and skipping
  hidden ones. It counts what it skipped and stops at the ceiling. Entries are taken synchronously
  inside the `drop` handler, and the walk runs after it. _(2026-10-28)_
- [x] Pure rule deciding whether a set of files attaches at once or asks first. _(2026-10-28)_
- [x] Confirmation dialog: count, total size, first names, `+N more`, skipped hidden files, and
  `attach` / `cancel`. _(2026-10-28)_
- [x] A drop that arrives while a walk or a confirmation is pending waits its turn. _(2026-10-28)_
- [x] Tests:
  - the walker against fake entries: nesting, readers returning in batches, hidden files, the
    ceiling
  - the threshold rule at its edges
  - the dialog attaches or attaches nothing _(2026-10-28)_
- [ ] Verify: typecheck, lint, tests, then by hand on staging with a nested folder and with a large
  one. Automated checks green; by hand is left to staging.
- [x] Commit `feat(ui): a dropped folder attaches what it holds, and a large drop asks first` _(2026-10-28)_

---

## Unknowns

- **`dragleave` flicker.** It fires on every child element crossed. Fallback: count enters and
  leaves, or hide on a `dragleave` whose `relatedTarget` is null.
- **Chrome returns directory entries in batches of 100.** It is unclear whether Firefox ever
  returns a partial batch. Fallback: loop until an empty batch in every browser, which is correct
  either way.
- **jsdom has no `webkitGetAsEntry` or `FileSystemEntry`.** The walker takes a narrow
  structural type so tests can hand it plain fakes.
- **Paste of a file copied in a file manager** depends on the browser and platform. It is not
  promised, and the spec should not imply it is.
- **25 MB and 500 files are guesses.** They are named constants, adjusted after use.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
