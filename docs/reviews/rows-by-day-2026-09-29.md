# Review: Rows by day

**Date**: 2026-09-29
**Status**: Resolved
**Scope**: `main..agent/rows-by-day`, `apps/ui/src/` (register, item, queue, feed, settings, lib), ADR 52, ADR 46 amendment
**Plan**: `docs/plans/rows-by-day.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

The implementation matches the plan, ADR 52 and the spec: the three-way choice, `byDay` grouping with stable keys, a time-only stamp, the slim rail with the facts after the capture, the `-mt-px` overlap, `scroll-mt-day-head`, the index without the gap, and the item surface drawn as a selected row. The plan is Done and `shell.md` has a matching Shipped entry. The main gap is accessibility: the stamp gives its full date and time to assistive technology only when it is a button. So by day, a record's link on the item surface is named only by its time. The rest is small: an orphaned comment, a missing test for the feed's held-row fix, and some prop and store shape questions.

---

## Bugs

### 1. The time-only stamp names the whole instant only when it is a button

`apps/ui/src/components/primitives/marks/Stamp.svelte:22,58`: `whole` is applied only as the `<button>`'s `aria-label`. Without `onopen`, the stamp is a bare `<time>` that says `08:05`. The spec (Rows by day: "The stamp still names the whole instant to assistive technology") and the plan make no exception for this case. Where it shows:

```
Item.svelte, by day → record row → <a href={recordHref…}><Stamp dated={false} /></a>
→ the link's accessible name is "08:05", and every record link on the page is named by a time alone
```

The capture's own stamp on the item surface is also a bare `<time>` by day (Row gets no `onselect`). A heading above it gives the date, so it matters less there. The record links are navigation targets, so their names do matter.

Fix: when `dated` is false, give the `<time>` a visually hidden date, or an `aria-label` on a wrapping element. That way the full name comes from the stamp itself, whatever encloses it.

---

## Design

### 2. `slim` without `byDay` is representable

`apps/ui/src/components/item/Row.svelte:36-38`: Row takes `byDay` and `slim` as independent booleans, and every caller (Queue, Feed, Item) passes `layout.byDay` and `layout.slim` in the same way. `slim && !byDay` has no meaning, but nothing stops it: it would draw a dated stamp in a 3.25rem rail. A single prop, `layout: "rail" | "by day" | "slim"`, would make that state impossible to express. So would Row reading `rows` itself, though explicit props are easier to test. `Register` has the same split (`slim` only).

### 3. The item surface calls itself the feed

`apps/ui/src/components/item/Item.svelte:135`: `surface="feed"` is passed so that `finished` holds and the state word is drawn. It works, but it overloads `surface` with a meaning Row never documents. If a later change branches on `surface === "feed"` for feed-only behaviour (paging, filter), it will leak into the item page. Either name a third surface, or pass the word/finished decision in directly.

### 4. The rows choice is re-read from storage on every access, by every row, on every resize

`apps/ui/src/lib/rows.svelte.ts:33-52`: `choice` calls `localStorage.getItem` each time. `isNarrow()` subscribes to every `resize` event, not only to crossings of `narrow`. Every Row's `byDay`/`slim` prop expressions re-run on each resize event (while a window is dragged), and each run reads storage 2–3 times. The values rarely change, so nothing downstream updates, but the work grows with the length of the list. `theme.svelte.ts` keeps its choice in a `$state` read once. The `chosen` counter looks like it exists to keep test isolation working through `localStorage.clear()`. If that is the reason, a reset hook for tests would do the same job with less machinery. At minimum, derive `byDay`/`slim` once per surface rather than once per row.

---

## Minor

### 5. `rule-right` split the `steady-weight` comment from its utility

`apps/ui/src/styles/utilities.css:13-32`: the new block was inserted between `steady-weight`'s doc comment and `@utility steady-weight`. So `steady-weight`'s comment now sits directly above `rule-right`'s comment and neither describes what follows it. Move `rule-right` above the `steady-weight` comment.

### 6. The feed's held-row placement fix has no test

`apps/ui/src/components/feed/Feed.svelte:121-136`: the review follow-up changed how the feed latches `stood` and falls back to `placeOf`. `held.test.ts` covers `placeOf` itself, but no Feed test covers a surface reached with the selected row already gone, or a latched place that outlives a read. The queue has the equivalent test from #84.

### 7. Appearance's `auto` line doesn't say it is about `auto`

`apps/ui/src/components/settings/Appearance.svelte:45`: "by day on a narrow screen, the rail on a wide one" is always drawn, including when `rail` or `by day` is chosen, and then it reads as a description of the current behaviour. The spec calls it "a line saying what `auto` is". Prefix it `auto:` or show it only when `auto` is chosen.

### 8. The tag offer can now be clipped at the right edge

`apps/ui/src/components/primitives/frame/Sheet.svelte:14` adds `overflow-x-clip`. `TagSet.svelte:309` anchors its offer `left-0`. On a slim row the tag line is in the body, so on a 390px screen a `+` near the right edge opens a `w-max` list that is now cut off instead of overflowing. `Chooser` and `TagFilter` anchor `right-0` and are unaffected. Check in a browser.

### 9. Tests assert on Tailwind classes

`Item.test.ts` (`closest(".h-9")`, `.border-t.col-span-full`), `Queue.test.ts` (`-mt-px`, `.scroll-mt-day-head`, `.col-start-2`). jsdom draws no layout, so the plan accepts structural assertions. But these tests break when a class is renamed or the spacing changes, and nothing about the behaviour needs to change for that to happen. `data-opens` / `data-foot` hooks would be steadier. `data-day` and `data-stuck` already follow that pattern.

---

## Non-issues

- **`overflow-x-clip` on Sheet**: `clip` does not create a scroll container, so `position: sticky` headings still stick to the viewport. It also clips the `100vw` `::before` so it cannot cause horizontal scroll under a classic scrollbar.
- **`left: calc(50% - 50vw)` on the stuck heading**: the register sits in `Column`'s centred `max-w-measure`, so the heading is centred and the band reaches both edges. With a classic scrollbar the half-scrollbar offset falls outside the clip.
- **`inset-block: 0 -1px` on `::before`**: the absolute box is laid out against the heading's padding box, and `-1px` puts its rule on exactly the pixel of the heading's own `border-b`.
- **Every earlier heading is `data-stuck`**: the grid is one sticky container, so passed headings stack at `top: 0`, and the later one in DOM order paints on top. The plan's Unknowns name and accept this.
- **The capture's heading and the records' heading repeat the date on the item surface**: intentional. The records' heading stands in for the rule between the two regions, and the test says so.
- **ADR 52's "Settled in review" note edits an accepted ADR**: same-day, pre-merge, within the PR that introduced it. It is not a reversal.
- **`byDay` keys a repeated day `day:X:1`**: only reached when a list is read out of order, and the key stays stable for the life of that order.

---

## Resolution

1. **Fixed.** A time-only stamp carries the day as visually hidden text, so the stamp names the
   whole instant as a button, a link's content or on its own. The button's `aria-label` is gone.
2. **Fixed.** `Row` takes one `layout: "rail" | "by day" | "slim"`, which `rows.drawn` settles.
3. **Fixed.** `surface` gains `"item"`, which also replaces the `routed` prop: the item surface
   draws its records beneath the row rather than in it.
4. **Fixed.** The choice is held in `$state`, as `theme`'s is. The width subscription updates only
   when `narrow` is crossed. `forgetRows()` resets it between tests.
5. **Fixed.** `rule-right` moved above `steady-weight`'s comment.
6. **Fixed.** `tags.test.ts` holds a selected row where it stood while the filtered feed shrinks and
   regrows around it. The test fails without the fix.
7. **Fixed.** The line reads "auto is by day on a narrow screen, the rail on a wide one".
8. **Fixed.** The offer is drawn back to end where its line does when it would run past it.
   `shell.md` says so. Not checked in a browser.
9. **Fixed.** This branch's tests query `data-row`, `data-opens`, `data-foot`, `data-rail`,
   `data-body`, `data-headed`, `data-rule` and `data-chosen` instead of Tailwind classes.
