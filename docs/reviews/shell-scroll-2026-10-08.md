# Review: shell scroll and wording; the pool measures a picture

**Date**: 2026-10-08
**Status**: Addressed
**Scope**: `git diff main...agent/shell-scroll` — ac44bf0b (fix(ui)), 4e2de16e (feat(core))
**Spec**: `docs/specs/shell.md`, `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/mirror.md`, ADR 56

---

## Overall

Both commits do what they set out to do. Typecheck, lint and `pnpm -r test` are green. The scroll fix
targets the right element, `scroll-padding-bottom` on `:root` is the right lever, and the
measuring path is careful about streams. The most important finding is #1: measured dimensions
get written into the mirror, which mirror.md and ADR 56 both say must not happen. The edit-reveal
timing (#2, #3) and `nearest` on rows taller than the screen (#4) need a check in a real browser
before merge, because jsdom can't show any of them and nothing tests them. No plan file covers the
branch, and it bundles an unrelated core feature with a UI fix (#9).

---

## Bugs

### 1. Dimensions are written to the mirror

`packages/core/src/mirror/record.ts:33` puts each `Asset` into the record whole, so a measured
picture's `dimensions` is serialised. I confirmed this by running `projectMirrorRecord` and then
`serialiseMirrorRecord`. `codec.ts:214` `readAsset` then drops the field on read.

```
upload measured → item mirrored → record file carries "dimensions"
rebuild → assets inserted unmeasured → re-projected record has none → same state, two serialisations
```

This contradicts mirror.md ("Not a picture's dimensions") and ADR 56. `parse(serialise(r)) ≠ r`.
Whether a record carries the field depends on whether the picture was measured at upload or by the
backfill, since backfill doesn't bump `modifiedAt` and so doesn't rewrite the record. Once
`verifyMirror` exists, it will report drift for every such item.

Fix: project assets without `dimensions` (a `canonicalAsset` beside `canonicalItem`), and add a
record test that uses a measured asset.

### 2. `settled()` resolves before the row starts to grow

`apps/ui/src/lib/motion.ts:177`. The comment says waiting one frame covers "what that change
started". In the frame's update-the-rendering steps, though, rAF callbacks and their microtasks run
before layout and ResizeObserver delivery. `following`'s `grow` animation is started from the
ResizeObserver, so `getAnimations()` is called before it exists. The edit's Svelte transitions only
wrap the *first* picture or file (`Edit.svelte:60,90`), so a second attachment has nothing else to
wait on.

```
attach → $effect → rAF → getAnimations() = [] → reveal → (same frame) RO → grow starts from old height
```

`row` is the inner element, so its geometry is already final, and mid-page this does no harm. On
the last rows of a page, though, the document hasn't grown yet, so the scroll is clamped and stops
short. That is the case the change exists for. Check this in a browser.

Fix: wait for the grow itself, e.g. a second frame, or have `grow` expose its animation (it has an
`id`, `GROWING`) and await that.

### 3. `settled()` waits on infinite animations

`motion.ts:177` awaits `finished` on every animation in the subtree. `Pending` (`animate-turn`,
infinite) is drawn in the row's facts for an item with undrained work (`Row.svelte:151`), and
`Asking` (`animate-step`) is drawn in `save` while `editing.busy`. Their `finished` never resolves.
It only rejects (and so "settles") when the element goes. So editing a pending item offline and
attaching a file reveals the row whenever the item next drains, which yanks the scroll at an
arbitrary moment. Reduced motion hides this (`motion-reduce:animate-none`).

Fix: skip animations whose `effect.getComputedTiming().endTime` is `Infinity`, or wait only on the
row's own grow (see #2).

### 4. `block: "nearest"` on a row taller than the screen hides its head when walking up

`Row.svelte:124` → `bringIntoView` (`motion.ts:166`). The reveal used to target the rail cell,
which is short, so the stamp always came into view. It now targets the whole row. Per CSSOM
"nearest", an element larger than the snapport whose top is above it gets its **bottom** edge
aligned. So `k` onto a tall row shows its foot, and its stamp and head stay above the view, while
`j` shows the top. Rows this tall are ordinary on a phone: two pictures at `max-h-96`, plus the
words and foot, is more than a 375×700 viewport. An opened row or an edit can be taller still.
shell.md says "comes into view whole", which can't happen for these rows, and the spec is silent on
what should happen instead.

Fix: when the row is taller than the viewport less the status line and head, use `block: "start"`
(respecting `scroll-margin-top`). Otherwise keep `nearest`. Say so in shell.md.

### 5. Shutting down mid-read logs an error

`maintenance.ts:80-82`: the signal goes to `blobs.open`, and blob-fs's `chunks()` calls
`signal.throwIfAborted()` on each pull. An abort while `headOf` is reading throws `AbortError` out
of `measurePictures`, and `measuring.ts:28` logs it at `error` as "measuring pictures threw". A
normal SIGTERM during a backfill then shows up as an error in the logs.

Fix: in `measurePictures`, catch and return `measured` when `signal.aborted`, or have
`startMeasuring` ignore an `AbortError` it caused itself. Add a test that aborts mid-read.

---

## Design

### 6. ADR 56 overstates orientation: only JPEG EXIF is applied

`image-size@2.0.4` reads an orientation only in `jpg.js`. HEIF and AVIF `irot`/`imir` are ignored
(`heif.js` reads `ispe` only), and so is EXIF in WebP, PNG and TIFF. A portrait iPhone HEIC is stored
rotated with `irot`, so it gets swapped dimensions. Since `h-auto` takes the natural ratio once the
picture loads, the box corrects itself, with the same shift as before. That makes it no worse, but
it's no fix either. The ADR's "orientation and the formats a phone writes (HEIC, AVIF) come with
it" and core.md/http-v1.md's "upright" are untrue for those formats. Either narrow the claim
(orientation from JPEG EXIF) or don't serve dimensions for HEIF/AVIF.

### 7. The backfill re-reads unmeasurable pictures every start, and one bad read ends the run

Not marking failures is a decision ADR 56 makes. The cost is 512 KiB read per unmeasurable picture
on every start, indefinitely, which is fine at this scale and worth a line in the ADR. Separately,
any read error other than a missing blob (EIO, EACCES, a blob deleted between `stat` and `open`)
throws out of `measurePictures` and abandons the rest of the run until the next start. Catch per
asset and pass over it, as an unmeasurable one is.

### 8. Measuring in core rather than behind a port

Keeping it in core is defensible. `measure` is a pure function over bytes, `image-size` has no
dependencies, and a port would be a seam with one adapter. I'd keep it. Two things in the ADR do
lean the other way, though: its own revisit trigger ("a better reader may manage it") and #6. If
either fires, the seam is a `PictureReader` port that owns both the parse and the 512 KiB head
policy. Recorded here so the choice is visible, not as a requested change.

### 9. One branch, two unrelated changes, no plan

`agent/shell-scroll` has no `docs/plans/shell-scroll.md` (AGENTS.md: branch per plan). The branch
carries a UI scroll and wording fix together with a core feature that has an ADR, a schema
migration and an HTTP surface change. Reviewing, reverting or bisecting either one means dealing
with both. I'd split it into two PRs. Separately: `docs/todo.md` lines 5, 7 and 10–14 are addressed
here and still unticked. That file is the developer's, so this is a suggestion only.

---

## Minor

### 10. A re-upload doesn't fill in dimensions an older asset lacks

`assets.ts` `insert`: on `already-stored` the bytes were just measured, but `held` is returned
unmeasured. A `tx.measureAsset` in the same transaction would cost nothing.

### 11. The subject in a notice is bold too

`Entry.svelte:49`: `font-semibold` moved to the outer span, so `subject` inherits it and the inner
`<span>` does nothing. If the place should be plain, it needs `font-normal`. If it should be bold,
drop the inner span.

### 12. Record rows on the item page lost their scroll margin

`Item.svelte:153`: `<Rail headed={layout.byDay}>` became `<Rail>` with no replacement. In the by-day
layout, focus moving to a record's link now scrolls it under the sticky day heading.

### 13. An empty list is always in the notices panel

`Panel.svelte:100`: `<ol aria-label="said">` is drawn with no entries, so a screen reader announces
an empty "said" list next to "No notices.". Hiding it with `aria-hidden` while empty keeps the
slide-out.

### 14. `isPicture` and the backfill query disagree on case

`pictures.ts` `startsWith("image/")` is case-sensitive. `pool-store.ts:494` `LIKE 'image/%'` is not.
An `Image/PNG` upload isn't measured at store time but is picked up by the backfill.

### 15. `measure` accepts non-integer and non-finite sizes

`pictures.ts:22`: `width > 0` lets `Infinity` through (an SVG `viewBox="0 0 1e999 1"`). The HTTP
schema says `int().positive()`. `Number.isSafeInteger` on both would match the contract.

### 16. A measured picture that fails to load leaves a blank box

`AttachedPictures.svelte`: `opacity-0` until `load`. With `width` and `height` set, a 404, a missing
blob or an unreachable pool reserves the picture's full room and shows nothing in it. Before, an
`alt=""` image collapsed. This may be acceptable, but it should be a decision.

### 17. `nothing to capture` is drawn in `text-alarm`

`Capture.svelte:296`: it isn't a failure, and the comment now has to say "a failure or an empty
box". Consider drawing it plain.

### 18. Test gaps

- Chunks of 4096 divide `HEAD_BYTES`, so the partial-chunk `slice` in `keepingHead` and `headOf` is
  never exercised. Use an odd chunk size.
- `measurePictures` is tested on one short page only. There's no cursor across a full page and no
  abort.
- Nothing tests the `Row.svelte` attachment `$effect`, or that `reveal` targets the row rather than
  the rail. `scrollIntoView` is already a `vi.fn`, so asserting its `this` is cheap.
- The migration's paired `CHECK` is untested. I checked by hand with `sqlite3` that it refuses one
  without the other.
- `Process.test.ts`: the title "keeping the capture's words…" still uses the old label.

### 19. Comment explains a rejected alternative

`maintenance.ts:64`: "a picture is never marked as unmeasurable, since a better reader might manage
it" is the ADR's reasoning. AGENTS.md keeps that out of code.

### 20. "Picture" isn't in CONTEXT.md

It's now a core API word (`measurePictures`, `unmeasuredPictures`, `isPicture`) with a precise
meaning: an asset whose media type is `image/*`. Add it to the glossary.

---

## Non-issues

- **`headOf` breaking early**: `break` calls `return()` on blob-fs's generator, whose `finally` closes the handle.
- **`keepingHead` holding `slice` views of Node `Buffer` chunks rather than copies**: nothing mutates them after they pass; the docstring's "copying" is loose, not wrong in effect.
- **`ALTER TABLE ADD COLUMN` with a `CHECK` naming another column**: SQLite allows it, existing rows pass (NULL), and the pairing is enforced (checked by hand).
- **Backfill termination**: the cursor is the last id of each page, unmeasurable ones included, so it strictly advances.
- **One transaction per measured asset**: matches core.md, and the write lock is held only for an `UPDATE`.
- **`<img width height>` + `h-auto max-w-full max-h-*` + `object-contain`**: width is definite (attribute clamped by `max-w-full`), height follows the attribute ratio and is clamped by `max-h`, so the reserved height is right before load. For a tall picture the box is full-width × `max-h` with the picture drawn left inside it. The box is wider than what's visible, but nothing draws it.
- **`scroll-padding-bottom` on `:root`**: propagates to the viewport. The process surface scrolls internally and already ends above the status line.
- **Measuring without bumping `modifiedAt`**: the client doesn't gate on `modifiedAt`, so the next read carries them.
- **`Entry` `transition:slide`**: local, so closing the panel doesn't play every entry's outro.
- **`pnpm-lock.yaml`**: one dependency added, not a regeneration.

---

## Resolution

Addressed on the same branch. The developer chose to keep it as one PR.

1. The mirror record leaves `dimensions` out (`canonicalAsset`), with a record test using a measured asset.
2. `settled()` waits two frames before collecting animations, so it catches the grow that the resize observer starts.
3. `settled()` ignores animations whose end time is infinite, which is tested.
4. `bringIntoView(row, { headFirst: true })` aligns a row taller than the view to its head (respecting `scroll-margin-top`). A row brought back after an attach keeps `nearest`, so the foot being worked in stays in view. shell.md says so.
5. `measurePictures` catches a failed read per picture and returns what it had measured once stopped, which is tested.
6. HEIC and AVIF (any ISO-BMFF head) are not measured. ADR 56, core.md and http-v1.md now claim JPEG EXIF orientation only.
7. A read error passes over that one picture. ADR 56 states the cost of re-reading at every start.
8. Kept in core, as recommended.
9. Kept as one PR, by the developer's decision.
10. A repeated upload measures an asset held without dimensions, which is tested.
11. The dead inner span is gone. Action and subject are both bold, as intended.
12. Not a regression: `scroll-margin` applies to the element scrolled to, which is the focused stamp link rather than the rail cell, and the item surface never called `reveal()`. No change.
13. The empty list is `aria-hidden`.
14. `isPicture` is case-insensitive (SQLite `LIKE` already was). Tests cover both sides.
15. `measure` accepts only safe positive integers. `image-size` already rounds a fractional SVG size, so the infinite case is the one tested.
16. A picture that fails to load is marked `data-failed` and hidden, giving its room back. Decided, and stated in shell.md.
17. `nothing to capture` is drawn plain.
18. Odd chunk sizes, a backfill past a full page and an abort, the reveal target, and the paired CHECK are now tested, and the Process test title is renamed. The `Row` attachment `$effect` is still untested in jsdom.
19. The comment now states only what the code does.
20. **Picture** is in CONTEXT.md.
