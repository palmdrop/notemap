# Review: Queue polish (held row, offer order, motion, sticky head)

**Date**: 2026-10-01
**Status**: Resolved
**Scope**: `git diff main...agent/queue-polish` (PR #89)
**Plan**: `docs/plans/queue-polish.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

The branch does what the plan says, and typecheck, lint and `pnpm -r --silent test` are green. The
`{@render}` fix is right: in Svelte 5.56.9 `snippet()` is a block flagged `EFFECT_TRANSPARENT`,
and both the intro check in `transition()` and `pause_children` skip transparent blocks, so the
nearest non-transparent block is now the `{#each}`. I checked that the new tests fail without the
fixes, in a scratch copy with `pick.ts` reverted and with the `{#if}` put back into `Queue.svelte`.
The most important finding has the same cause and was not fixed: the queue's `{#if drained}` still
swallows the slide when the first row enters a drained queue and when the last row leaves (1).

---

## Bugs

### 1. The first row into a drained queue and the last row out of it still do not move

`apps/ui/src/components/queue/Queue.svelte:348` — `{#if drained} <Drained/> {:else if …} {:else}
<Register>…{#each}…{/if}`. This is the same lost-transition bug the branch fixes, one level up.
It predates the branch, but it is the case phase 3 sets out to restore, and `moving()` was built
to make it move: its `answered` argument exists so that "the first capture into [a drained queue]
is a change".

```
queue empty, answered → drained = true → capture lands → drained = false
→ the {#if} swaps to a fresh {#each}, which has not run yet → the intro is skipped → the row is just there

last row discarded, released by esc → items = [] → drained = true
→ the {#if} branch is paused with local = false → the row's local outro is dropped → the row vanishes
```

I confirmed both in a scratch copy with two throwaway tests built like the new `slides in` test.
Each failed on `moved(...) === true`. The plan's own check ("capture into the queue and the row
slides in") fails on an empty queue, and the new test misses it because it starts with one row.

Fix: keep the register mounted and draw `Drained` beside it, or render the branches through
snippets so the `{#if}` is not the block the rows' transitions belong to. Then add the two cases
to the slide test.

---

## Design

### 2. A mouse take still depends on the offer's outro to keep the row selected

`apps/ui/src/lib/pick.ts:2`, `components/primitives/controls/TagSet.svelte:180,378`. A take runs
on `mousedown` and calls `close()`. The option survives until `click` only because
`out:pinned|global` keeps the offer in the DOM for `--duration-short` (150 ms). Under
`prefers-reduced-motion` that is 0 ms, and on any press longer than 150 ms the offer is gone
before `mouseup`. The browser then sends the `click` to the nearest common ancestor of the removed
option and whatever was under the pointer. If that ancestor is the row's own body cell, `inside()`
finds no control and the row toggles off, and on a trigger tag the held row goes, which is the bug
phase 1 fixes. The new `Queue.test.ts` test fires `click` before `mousedown` so the option is still
there. Its comment admits this, so the test covers only the motion-on path.

Check in a browser with reduced motion on and a slow press. If the row drops, stop relying on DOM
survival: for example, the take swallows the `click` that follows it.

### 3. The feed's half of the change is untested

`apps/ui/src/components/feed/Feed.svelte`. The feed got the same `{@render}` change, the `view`
command, `v` and the `Chooser`, and `Feed.test.ts` has no tests for any of them. The slide test
covers only the queue's timeline; nothing covers `Index.svelte`'s render. In Feed and Index the
three-line comment is the only thing stopping someone from tidying the `{@render}` back into an
`{#if}`, and putting the `{#if}` back would pass every test. One feed slide test and one index
slide test, built like the queue's, would close this.

---

## Minor

### 4. A row's open tag offer paints over the sticky head

`TagSet.svelte:376` (`z-30`) against `register/Head.svelte:26` (`sticky z-20`). Neither the rows nor
the `Register` grid create a stacking context, so the offer competes with the head in the root
context and wins. If a row's offer is open and the page scrolls it up, it draws over the head and
its controls. Day headings (z-10) are under it by design. The head is a new case the plan's
z-order item did not cover. Head's own panels are fine: they sit inside the head's z-20 context,
above day headings and rows.

### 5. "View toggle" survives in the spec and the component name

`docs/specs/shell.md:2081` still says the order control sits "beside the view toggle".
`components/view/ViewToggle.svelte` is now a `Chooser` wrapper under a toggle's name. The spec line
needs one word changed. The rename is optional.

### 6. Ragged wrap in the amended spec paragraphs

`docs/specs/shell.md:849` runs to 138 columns ("…under the controls. Nothing at the head moves as
a heading comes and goes: the controls stand at"), and `:819–820` breaks after "The selected"
with the old line kept below. Prettier passes because prose wrap is preserved. This is cosmetic
only.

### 7. Phase 4 has not been checked in a browser, though the Shipped entry is written

`docs/plans/queue-polish.md` says so itself ("not yet done in a browser"), and **Status** is
correctly `In progress`. Several claims rest only on code reading or jsdom: the 375 px fit
(Unknowns), the head's transparent left as the first day heading rises into the band, and `j`/`k`
clearance at the top. Do that check before flipping the plan to Done.

---

## Non-issues

- **`{@render (kind ? heading : entry)(one as never)}`**: calling a union of two snippet types
  needs the intersection of their parameters, which is `never`, and `{@render}` accepts only a call
  expression, so a ternary of two calls is rejected. The runtime narrowing matches `Drawn`'s two
  kinds. The cost is that the argument goes unchecked: a third kind would silently render as
  `entry`.
- **The snippet block re-reading `one.kind`**: keys are per kind (`day:…` vs item id), so a keyed
  entry never switches snippet. A switch would not misbehave anyway, since the snippet's own branch
  swap pauses the old branch as a local outro.
- **View switch, arrival, reads**: still under the new structure. The `{#if view === "index"}` swap
  pauses the old view with `local = false` and mounts a fresh `{#each}` that has not run, so
  neither view moves. Arrival is still because `{#each}` has not run, and `moving()`'s `onMount`
  settles it too. Pages and turned orders are still through `moving()`'s `still`.
- **`|global` rejected**: correct. It would play row outros on a view switch and on navigation.
- **Toggling by day**: chosen on the settings page, where no register is mounted, so day headings
  sliding in on a mounted list cannot happen.
- **`components/item/Item.svelte`** keeps `{#if one.kind === "day"}` inside `{#each}`, but its
  `Day` gets no `motion` (always still) and its record rows have no transition, so it loses
  nothing. **The log** renders `LogRow` straight from its `{#each}` with the transition on the root
  element, so it is unaffected.
- **The three-line comment above each `{@render}`**: a reader would ask why, the code cannot
  answer, and the comment protects the shape from a natural cleanup. It is justified under
  AGENTS.md.
- **`Rail` `headed={byDay || surface !== "item"}`** and the index stamp's unconditional
  `scroll-mt-day-head`: `Row`'s `surface` is only `queue | feed | item`, and `Index` is drawn only
  on the queue and the feed, both of which now have the sticky head.
- **`band` as module state shared by `Head` and `Day`**: a heading leaves it on teardown or on
  leaving the band, and `SvelteSet.add` of a present node does not notify, so the per-frame `hold`
  is cheap. `Day` on the item page writes to it harmlessly, since that page has no head.
- **Panels of `view ▾`, `tags ▾` and the order** (z-30) sit inside the head's z-20 stacking
  context, so they paint above day headings (z-10) and rows, as the plan asks.
- **`[data-covers]` only while stuck and not dated**: matches the spec. By day, the stuck heading
  shows through, and the controls keep `bg-ground` only behind themselves, with `items-center`
  leaving the heading's rule visible.
- **The rule in the offer**: `aria-hidden`, outside the `Walked` index space, and ARIA allows
  nothing but options and groups in a listbox. The walk test covers it.
- **The weekday hidden below `narrow` everywhere**, item page included: the spec sentence is
  general, and the code matches it.
- **The spec amendments and the Shipped entry** match the code for control order, chooser words,
  `v`, the head's height and rule, the transparent left, `j`/`k` clearance, and the offer's
  eight-then-triggers order with no rule once typed into.

---

## Resolution

All findings fixed on the branch, 2026-10-01.

1. The queue keeps its list mounted while drained, with `Drained` drawn after it. A slide test for
   both views covers the first row in and the last row out, and fails with the old `{#if}`.
2. `Walked` calls `spendPress()` (`lib/pick.ts`) on a take: the `click` the press ends in is
   swallowed, and a press released outside the page is forgotten by the next press. The queue test
   now removes the option on `mousedown` and clicks the row beneath it, which is the reduced-motion
   path. It fails without the fix.
3. `Feed.test.ts` covers the slide in both views, the view chooser and `v`. The slide tests fail
   with the `{#if}` put back in `Feed.svelte` and `Index.svelte`.
4. The head is `z-40`, above the panels rows open (`z-30`), which still draw over the status line
   as before. The capture box lifts above the head only while its own offer is open
   (`has-[.offer]`). Isolating the register was tried and dropped: it would have put row offers
   under the status line.
5. Renamed to `ViewChooser`, and the spec says "view chooser".
6. Rewrapped.
7. Checked in a browser by the developer, and the plan is Done.
