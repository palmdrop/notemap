# Review: The held row, and a queue that stays true

**Date**: 2026-09-08
**Status**: Resolved <!-- 1–7, 10, 11 fixed 2026-09-09; 9 withdrawn; 8 accepted -->
**Scope**: PR #51 — `apps/ui/src/components/queue/`, `apps/ui/src/lib/{lineage,routing}.ts`,
`packages/client/src/{surfaces/reads,state/state,actions}.ts`
**Plan**: `docs/plans/held-row-and-a-fresh-queue.md`
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`

---

## Overall

The four ideas are right and the specs say them well. The held row is a better answer than the
linger, `enter` earns its asymmetry, and the watcher maintaining the surfaces is the change that
makes arriving a catch-up rather than the only defence.

But **the branch does not build, does not typecheck, does not lint and fails two tests**, against a
PR body that claims all four green. The plan is marked **Status: Done**. `$lib/lingering.svelte` was
deleted with `+layout.svelte` still importing it, so `apps/ui` will not compile at all — that is
finding 1, and it means nothing on this branch was actually run after the last commit.

Underneath that there are two real defects in `walk` (5, 6), both introduced by the otherwise-good
"a failed read leaves the reader no worse off" change, which now conflates *what a surface draws*
with *the page it is reading*.

---

## Bugs

### 1. `apps/ui` does not compile — the deleted module is still imported

`apps/ui/src/routes/+layout.svelte:18` imports `$lib/lingering.svelte`, and line 58 calls
`lingering.clear()` in the sign-out effect. The module was deleted in `9a6a5ee`.

```
svelte-check: src/routes/+layout.svelte 18:29
  "Cannot find module '$lib/lingering.svelte' or its corresponding type declarations."
```

Fix: drop the import and the `lingering.clear()` line. Nothing replaces it — a held row is
component state on a route the sign-out unmounts, so it goes with the register.

*Fixed 2026-09-09.*

### 2. `rows` is typed mutable and assigned a readonly array

`apps/ui/src/components/queue/Queue.svelte:81` — `$derived.by<Item[]>` returns `$queue.items`
unchanged on the common path, and that is `readonly Item[]`.

```
svelte-check: src/components/queue/Queue.svelte 81:36
  "The type 'readonly Item[]' is 'readonly' and cannot be assigned to the mutable type 'Item[]'."
```

Fix: `$derived.by<readonly Item[]>`.

*Fixed 2026-09-09.*

### 3. Four tests fail — two stale, and two that were right

Two in `apps/ui` assert that returning to the queue does **not** ask the pool, which is exactly what
`enter` now does on purpose and what `client.md` now says it does:

- `apps/ui/src/components/queue/Queue.test.ts:80` — *"puts the view back where the person left it,
  without asking the pool"*: `expect(asked()).toEqual(["GET /v1/queue"])`, got two.
- `apps/ui/src/components/item/Item.test.ts:169` — *"costs the queue neither its order nor its
  place"*: one `order=newest-first` expected, two sent.

Two more in `packages/client` are not stale at all — they are the existing coverage for finding 6,
and the branch broke them:

- `cache.test.ts:118` — *"stays on the pool's page through a turn, rather than flashing the cache"*.
- `cache.test.ts:150` — *"gives the pool's claim up when a turn cannot be read, and draws the cache"*.

Fix: rewrite the first two — the place and the order are still the point and still hold, and the
pool being asked again is now correct. The second two want the code fixed, not the test.

*Fixed 2026-09-09.* The two `apps/ui` assertions now say the queue is read again; the two
`cache.test.ts` ones pass under finding 6's fix, untouched.

### 4. Lint fails on an unused import

`packages/client/src/surfaces/enter.test.ts:1` — `vi` is imported and never used. Prettier also
fails on `apps/ui/src/lib/routing.test.ts`.

*Fixed 2026-09-09.*

### 5. A read in flight restores rows that left the surface while it was in flight

`packages/client/src/surfaces/reads.ts:85` — `extended(current[surface], slice)` became
`extended(page, slice)`, where `page` is the snapshot taken *before* the await. `after()` is
`ready.then(work)` (`client.ts:194`) and serialises nothing, and the action watcher's `applied`
callback is on its own timer and outside it entirely. So:

```
loadQueue → page = { ids: [a, b], after: X }, read in flight
  watcher ticks → caughtUp drops `a` → queue.ids = [b]
read lands with [c, d] → extended(page).ids = [a, b, c, d]   ← `a` is back on the queue
```

The same shape holds for a `route`/`archive` the reader makes while scrolling: `processed()` drops
the id, the completing read puts it back. This race is *new* — phase 4 is what made a row leave the
queue without going through a read, and the old `current[surface]` base was immune to it.

Fix: base the extension on what the surface still holds, not on the snapshot —
`page.ids.filter((id) => current[surface].ids.includes(id))`. That is empty for `enter`'s
`emptyPage`, so the fresh-first-page case still replaces rather than appends.

*Fixed 2026-09-09* as `stillHeld`, covered by `surfaces/reads.test.ts`.

### 6. A reorder whose read fails leaves the surface claiming an order its cursor is not in

`packages/client/src/surfaces/reads.ts:75-78` — the loading update now keeps `current[surface]`
whole and overwrites only `order`. On the reorder path `loadMore` built `page` as
`{ ...emptyPage(order), answered }`, so the surface adopts the *new* order while keeping the old
order's `ids`, `after` and `exhausted`. The catch branch then spreads `current[surface]`, so a
failure makes that state permanent:

```
queue: order=oldest-first, ids=[a,b], after=X
loadQueue("newest-first") → surface: order=newest-first, ids=[a,b], after=X
read fails → surface keeps all of it
onmore → reads order=newest-first&after=X    ← a cursor from the other order
```

The old code set the loading page to `emptyPage(order)`, so a failed reorder left a clean empty
newest-first page and the retry read page one. `cache.test.ts:118` and `:150` say so and fail on
this branch (finding 3).

*Fixed 2026-09-09* as `whileReading`: a read of the order the surface already holds keeps
everything until it answers, and a turn — the one restart whose drawn rows and position belong to
the other order — does not. `surfaces/reads.test.ts` covers the position the retry is then read
from, which is the half `cache.test.ts` does not ask about.

---

## Design

### 7. Arriving at the queue gives up the walked tail, and tapping into an item is an arrival

`packages/client/src/surfaces/reads.ts:148`, `apps/ui/src/components/queue/Queue.svelte:102` — the
spec argues the queue/feed asymmetry on membership, which is sound. What it does not weigh is that
the shell's only way *into* a capture is a route change that unmounts the register, so opening an
item from page 5 of a drain session and pressing back re-reads page 1 and drops pages 2–5. The
plan's Unknowns answer the scroll mark (`window.scrollTo` clamps) but not the four pages behind it —
landing at the foot of a one-page queue is the symptom, and the clamp is what makes it quiet.

Worth deciding rather than leaving: a fresh first page merged over the walked ids, or re-reading
only when the surface has been left for longer than a tap.

*Fixed 2026-09-09*, merged. `rejoined` (`state/state.ts`) keeps the walked ids that rank past the
fresh page's far edge, and the surface keeps the position it was walked to rather than the fresh
head's — otherwise the reader would tap *more* four times to arrive back where they were.
`client.md` and the plan's phase 3 say so; the plan's scroll-mark unknown is closed by it.

### 8. `caughtUp` corrects the queue's membership but not the item it drops

`packages/client/src/state/state.ts:395` — the id leaves `queue.ids` and `state.items` still holds
the item as unprocessed. Two consequences beyond the one the plan records: a feed drawn from the
same cache goes on saying nothing became of that item, and a queue that falls back to `fromCache`
draws it again, `drawnFrom` filtering on `unprocessed(item)` rather than on the page.

Both self-heal on the next read of either surface, which is why this is design and not a bug. The
plan's own fallback — re-read an item a `routed` action names when the cache holds it — would close
this and the late-`pending` unknown together.

*Accepted 2026-09-09.* Left to self-heal; the fallback stays recorded in the plan's Unknowns.

### 9. ~~`PROCESSING` is a set of strings, not of `ActionKind`~~ — withdrawn

Wrong on my part. The client reads the generated wire types, and `Action.kind` is declared
`string` in the OpenAPI schema (`api/generated.d.ts:4066`) — core's `ActionKind` union never
crosses the HTTP surface. `ReadonlySet<string>` is the only type available here, and it is what
`apps/ui/src/lib/action-log.ts:10` already uses for the same job.

Making the kinds answerable would mean enumerating them in the OpenAPI schema, which is a change to
the HTTP surface and its own piece of work.

---

## Minor

### 10. The shell composes a rank of its own, with a third separator

`apps/ui/src/components/queue/Queue.svelte:94` — `behind()` builds `${createdAt},${id}`. The client
has `rank()` (`state/state.ts:172`) using `|`, and the pool's page position uses `,`. All three sort
identically while `createdAt` is fixed-width, so nothing is wrong today; it is one rule written in
two places across a package boundary. `rank` is the client's to export if the shell needs it.

*Fixed 2026-09-09*: `rank` is exported and `behind` compares two of them.

### 11. Escape collapses the open row from anywhere on the page

`apps/ui/src/components/queue/Queue.svelte:151` — the `svelte:window` handler guards on the composer
being up but not on the event's target, so pressing `esc` while typing in the row's own *Add a tag*
field — or in the capture row above it — closes the row and takes the entry with it. Guarding on
the target not being a field keeps `esc` meaning what the spec says it means.

*Fixed 2026-09-09.*

---

## Non-issues

- **The scroll mark past a shorter queue** — `window.scrollTo` is clamped by the browser, verified
  and recorded in the plan's Unknowns. The tail loss behind it is finding 7, not this.
- **Nothing is put back by the watcher** — an action names an id and carries no item to place;
  `withdrawn` is the path that has one. Stated in `client.md` and in `caughtUp`'s own comment.
- **`revised` drops the row** — `edit.ts:134` records the *source* item as the subject, which is the
  one that leaves the queue. Checked in the plan.
- **A held row does not follow a late `pending` record** — `processed()` writes the summary once and
  the corner says the landing from the same watcher. Recorded as the plan's one open unknown.
- **`findAllByText("manual")`** (`Queue.test.ts:533`) — weakened from `findByText` because the held
  row now draws the word beside a routing line that also carries it, not to paper over a duplicate.
- **The `Shipped:` trail** — both `shell.md` and `client.md` carry dated 2026-09-08 entries linking
  the plan.

---

## Verdict

*Written 2026-09-08: do not merge.* Findings 1–4 were the branch not being green at all; 5 and 6
were defects in `walk`.

**2026-09-09**: 1–7, 10 and 11 are fixed, 9 is withdrawn, 8 is accepted as self-healing.
`pnpm -r --silent test`, `typecheck`, `lint` and `pnpm test:stack` (65 passed) are green.
