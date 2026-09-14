# Review: The shell redrawn — PR #61

**Date**: 2026-09-14
**Status**: Resolved
**Scope**: `apps/ui/src/` (phases 2–4 of the redesign), `docs/specs/shell.md`, `docs/design/`
**Plan**: `docs/plans/shell-redesign.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

The system, the row-as-box, the capture box, the index view and the process surface all match
`docs/design/redrawn/` closely; the token gate is extended and holds; the spec is rewritten
section by section with dated `Shipped:` entries for each phase. Typecheck, lint and
`pnpm -r --silent test` are green at `d9449f0`.

The one thing that is wrong is the surface's headline behaviour: **"advances to the next
unprocessed item" advances to the top of the queue** whenever the item being processed is not
the first row (finding 1). The keyboard flow on the queue has a matching hole after `d`/`m`
(finding 2), and the capture box's caret defeats the `esc`-returns-selected round trip
(finding 3). Everything else is polish.

---

## Bugs

### 1. After a decision the surface goes to the first row, not the next one

`components/process/Process.svelte:626-643` — `around.next` is read inside `advance()`, *after*
the decision has landed. `client.routing.route` and `markProcessed` await `processed()`, which
removes the item from `queue.ids` before they resolve (`packages/client/src/routing/routing.ts:37-45`,
`state/state.ts:397-413`); `discard` applies `archive` optimistically with the same effect. So by
the time `advance()` runs, `rows.findIndex(one => one.id === item.id)` is `-1` and the fallback
`rows.find(one => one.id !== item.id)` hands back the **first** row.

```
route/manual/discard → store drops item → advance() → at === -1 → next = rows[0]
```

Verified with a three-item queue, processing the middle one: went to `/items/zero/process`, not
`/items/two/process`. The existing test (`Process.test.ts:1828`) has two items and processes the
first, where the two answers coincide. The same path is taken from a template tag (`onfired`),
from the `otherwise` band, and from an item opened off the feed.

Fix: capture `around.next` at the top of `send()`, `choose()` and the tag handler — before the
await — and pass it to `advance(next)`. Extend the test to three items, processing the middle.

### 2. On the queue, `d` or `m` leaves a stale selection; the next `j` jumps to the top

`components/queue/Queue.svelte:120-143`, `176-181` — `discard(current)` / `manual(current)` drop
the row from `rows`, but `selected` keeps the gone id. `current` becomes `undefined`, so `p`,
`Enter`, `+` do nothing, and `walk()` treats `at === -1` as "start from the end": `j` selects
row 0. From the middle of the list, `d j d` discards the wrong item. The plan's quick tier is
"one press each" on the row; with the keyboard it is one press and then a hunt.

Fix: when the selected row leaves `rows`, move the selection to the row that took its index (or
the last row), in an effect over `rows` — the same rule the process surface uses for `next`.

### 3. Returning with `?selected=` puts the caret in the capture box, so the keyboard map is dead

`components/capture/Capture.svelte:37` focuses the field on every mount; `Queue.svelte:59-66`
selects the row named on the URL. Result: after `esc` on the process surface the row is boxed
and the next `d`/`p`/`j` is typed into the capture field (`writing()` swallows it). The
round-trip the plan specified — "`esc` returns to the queue with the item still selected" — ends
with the selection visible and unusable. The spec paragraph *The field takes the caret when the
queue is drawn* is what the code does; the spec did not consider the return trip. On a phone the
same focus raises the keyboard on every arrival at the queue, including the return.

Fix: do not take the caret when arriving with a selection (or when the pointer is coarse); say so
in the spec's capture section in the same change. Alternative worth weighing: never autofocus,
and let the first keystroke outside a field go to the map — a `/` or `c` to enter the box.

---

## Design

### 4. Grey is used for placeholder sentences, which the spec and ADR reserve for an inert control

`components/process/Process.svelte:939`, `:961-963` — `after a destination`, `once the place is
settled`, `asking…` are drawn `text-inert`. `shell.md` (Tokens and themes, Visual direction) and
ADR 46 admit the one grey "for a control that is genuinely inert and for nothing else"; these are
sentences, and grey-for-secondary is the hierarchy-by-tint the redesign left. The PR body says
`--inert` is used twice; it is used in four places. `styles/tokens.css:24` still says `Unused.`

Either draw them in ink (regular weight, as a collapsed section's content) or drop the sentences
and let the section stay collapsed — the label alone already says what is not there yet — and
fix the tokens comment.

### 5. `ondecided` is threaded through `Row` → `Actions` and nobody passes it

`components/item/Row.svelte:30-40`, `components/item/Actions.svelte:24-32`. It was the hook for
the queue's `keep`, which phase 4 removed. Two files carry a prop and a comment ("the surface
may want to hold the row") for a caller that no longer exists. Delete it and its two test
assertions.

### 6. `esc` and `advance` on the surface assume the queue, whichever surface it was reached from

`components/process/Process.svelte:645-647` — `back()` always goes to `/?selected=`, and
`advance()` always walks the queue, though the surface is reached from the feed's rows and from
the item page too (plan, phase 4). From the feed, `esc` lands on the queue with a selection for a
row that is not there, and a decision "advances" to the queue's first item (finding 1's fallback,
even once fixed). Not wrong enough to block, but say which it is: either the surface is the
queue's and the feed/item doors carry `?from=`, or `back()` uses history when there is any.

---

## Minor

### 7. Stale comments left by the modal's removal

- `components/primitives/controls/TagSet.svelte:180` — "the composer scrolls inside a modal".
- `components/item/Row.svelte:48-50` — "The queue holds a row it has just processed until the
  reader looks away" — the `keep` is gone; `finished` on the queue is reachable only through an
  undo edge.
- `styles/tokens.css:24` — `Unused.` (see 4).

### 8. The index view and the keys

`components/queue/Queue.svelte:153`, `:181` — `drawn` is bound only by timeline `Row`s, so in the
index `j`/`k` walk without `reveal()` and `+` does nothing. Fine that `+` is inert (no chooser
there); the walk should still scroll.

### 9. `route` wears the `inverted` utility, which bleeds

`components/process/Process.svelte:1004` with `styles/utilities.css:6-11` — `inverted` sets
`padding-inline: .375rem; margin-inline: -.375rem` to sit on a column; the drawing's `.route`
has `padding: 0 20px` and no bleed. With `px-5` beside it, either the padding is 6px or the
button overhangs the foot's right rule by 6px, depending on which utility wins. Worth one look at
1440; if it overhangs, give `route` its own class rather than the settings buttons' one.

### 10. A preview the pool could not answer is drawn in alarm

`components/process/Process.svelte:960` — a thrown `preview` (pool out of reach, 5xx) lands in
`previewFailed` and is `text-alarm`. The plan wanted `out of reach` in plain ink for a destination
that cannot be reached; a pool that cannot be reached is the same fact one layer up, and the
status glyph already says it. Consider drawing `PREVIEW_UNREACHABLE` for a transport failure.

### 11. Plan bookkeeping

`docs/plans/shell-redesign.md:73` — phase 1's "Open a PR for the docs alone" is unticked and the
plan says "one PR per phase"; this PR is phases 1–4. Tick it with a note or strike it, so the
plan does not describe a PR that never happened.

---

## Non-issues

- **`--text-glyph: 11px`** — a second size, but the drawing's own (`tokens.css` `.glyph`), for
  one glyph that is not a word. Named in the PR.
- **`@font-face` in `tokens.css`** — the gate forbids a literal `font-family:` outside it; the
  plan said `base.css`. Right call.
- **`disabled:text-inert` on `Action`, `Entry`, `route`** — the inert control the exception was
  admitted for.
- **`Modal`/`Commit`/`Option` survive** — `settings/Doomed.svelte` and the capability options
  still use them.
- **Nav has no bold surface on `/items/…`** — an item is not a surface; the drawing has no
  answer either.
- **`--inert` on the place line's greyed completion** — a ghost of text to be taken, not
  hierarchy; the spec names it.
- **`Math.abs` on the index's gap** — the gap is read in either order.
- **No keyboard map on the feed** — the plan scopes the map to the queue.

---

## Resolution

Reconciled with the developer's design notes (numbered 12–18 below, theirs) on 2026-09-14.

1. **Fixed.** `Process.svelte` keeps the neighbours as they stood while the item was on the queue;
   an item never on it has none and a decision returns to the queue. Tests: three-item queue
   processing the middle; an item off the queue.
2. **Fixed.** `Queue.svelte` moves the selection to the row that took a departed one's place.
   Test: `d` on the middle row, then `d` again acts on the next.
3. **Fixed** on the queue: `Capture` takes no caret when the queue is arrived at with
   `?selected=`. **Won't fix** on the process surface: the destination line keeps the caret,
   typing being the surface's main path; `e` needs an `esc` first there, and `edit` and a double
   click work at once.
4. **Fixed.** The sentences are gone; a section with nothing in it draws its label alone.
   `tokens.css` says what `inert` is for.
5. **Fixed.** `ondecided` removed from `Row`, `Actions` and their tests.
6. **Deferred** to phase 5, with the record block: the surface still assumes the queue.
7. **Fixed.**
8. **Fixed.** `Index` exposes `reveal(id)`; the queue's walk calls it in either view.
9. **Won't fix.** Checked at 1440: `route` sits inside the foot's rule with 20px padding.
10. **Deferred** to phase 5.
11. **Fixed.** Struck in the plan with a note.
12. **Fixed** (theirs; the drawing agrees). `p + p` is a blank line, not an indent.
13. **Fixed** (theirs). No `unrouted` line and no `routed`/`manual`/`retrying` word; the `→` line
    is the mark, `· N pending` from the summary stays, `discarded` stays. Spec and ADR 46 amended.
14. **Fixed** (theirs; the drawing agrees). The foot is ruled on four sides.
15. **Fixed** (theirs). `Edit` is the capture box's shape, `cancel` and bold `save` in its foot,
    no focus ring.
16. **Fixed** (theirs). The bar is 48px with 8px above the words.
17. **Fixed** (theirs). Goes with 13; `pending` on the line stays, failure is the log's and the
    corner's.
18. **Fixed** (theirs). `measure` is 56rem for the page and the bar; `measure-wide` 72rem for the
    process surface from `wide`. Settings keeps its own 44rem inside.
19. **Fixed** (theirs, added). The log: no lede, no source in the rail, views in the list head,
    the kind inverted (ground on ink; ground on the alarm for the three failures).
