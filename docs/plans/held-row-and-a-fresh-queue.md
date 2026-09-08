# The held row, and a queue that stays true

**Date**: 2026-09-08
**Status**: Todo
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`
**Closed**:

---

## Goal

> Processing an item leaves its row open where it stood, wearing what became of it and still
> offering `process`, so a second destination is one more gesture rather than a hunt through the
> feed. It goes when you look away. And the queue no longer holds items the pool has already
> processed — neither on arriving at the surface, nor while sitting on it.

---

## What it costs today

Verified 2026-09-08.

`lingering.svelte.ts` holds a processed row for `HOLDS = 1_200` milliseconds, drawn by
`Lingering.svelte`, which takes no handler on purpose — "a row being watched out, not one to use".
One beat is enough to see a departure and not enough to act in, and routing an item to a second
place therefore means finding it again on the feed. `Actions.svelte:62` already offers `process`
unconditionally on every row, feed included, so the gesture exists and only the reach is missing.

`loadMore` (`packages/client/src/surfaces/reads.ts:102`) extends a surface's tail and never re-reads
what it holds. The client survives SPA navigation, so leaving the queue and returning appends the
next page rather than refreshing the first. Nothing invalidates a walked page except `readAfterReturn`
on a reconnect, or a reload. An item routed by a trigger tag, or processed on another device, sits
in the queue indefinitely.

`state.ts:355` already does the hard half of the held row: `processed()` folds the record into the
cached item's routing summary and drops the id from the queue page. The item stays in the cache,
carrying what it needs for `became()` and `Routing` to draw where it went.

---

## Tasks

### Phase 1 — the row is held while it is open

Depends on nothing. Shell only; the client already answers everything this needs.

- [x] Create branch `agent/held-row-and-a-fresh-queue`
- [x] Processing leaves the row **open**, drawn by `Row` rather than swapped for another component:
      the state word, the routing summary, the records it reads on open, and the full action line
- [x] A held row is released by collapsing it, opening another row, or `esc` — so there is at most
      one on screen, and a drain session evicts each as the next is reached for
- [x] The held item is read from the client's cache, which `processed()` has already updated, so the
      row says `routed` or `retrying` from the summary rather than from the gesture that made it
- [x] `Lingering.svelte`, `lingering.svelte.ts` and the `HOLDS` timer are deleted, with the
      reduced-motion branch that existed for the beat
- [x] `Queue.svelte`'s `rows` derivation, the `before` tracking and the orphan handling go with them;
      `routing` state keeps the item and drops where the row stood
- [x] `shell.md`: the "row is watched out rather than vanishing" paragraph is replaced by what a held
      row is, what releases it, and that routing a second time is reaching for `process` again
- [x] `became()` tells `routed`, `retrying`, `manual` and `discarded` apart, on the feed as well —
      the held row made the row's own word have to be honest, and `archived` was off-glossary
- [x] `pnpm -r --silent test`
- [x] `git commit`

### Phase 2 — the notice is a way back

Depends on nothing, but reads as the other half of phase 1.

- [ ] A notice about a decision carries `href` to the item's own surface, which `Notice` already
      draws and `noticeOf` already sets for log-borne ones — `saidOf` is the gap
- [ ] It stays a statement: no offer, nothing that puts a row back in the queue
- [ ] `shell.md`: the corner's section says a notice about an item is a way to it
- [ ] `pnpm -r --silent test`
- [ ] `git commit`

### Phase 3 — arriving at the queue reads it again

Depends on nothing. Client change.

- [ ] Entering the queue re-reads it from the first page, discarding the walked tail; the feed keeps
      extending, as it does now
- [ ] The asymmetry is stated where it lives: the feed accumulates and nothing leaves it, the queue
      drains and its membership changes under the reader
- [ ] `restorePlace` still restores the scroll mark, clamped to what the fresh read holds
- [ ] `client.md`: the queue section says a surface entered is a surface read again, and why only
      this one
- [ ] `pnpm -r --silent test`
- [ ] `git commit`

### Phase 4 — the watcher drops what the pool processed

Depends on phase 3 only in that both are about the same lie; either lands alone.

- [ ] The action watcher's report is applied to the held surfaces before it is emitted, so one poll
      serves both the corner and the queue and the watcher stays lazy — a client nobody watches still
      asks the pool nothing
- [ ] An action naming an item the queue holds and meaning it is processed — `routed`, `archived`,
      `revised`, `purged` — drops it from the queue page
- [ ] Nothing is added back: `work-abandoned` returns an item to the queue, but an action carries no
      item body, and `withdrawn()` is the path that already places a returned one. Left as it is
- [ ] `client.md`: the action log section says the watcher maintains the surfaces as well as
      reporting, and the queue section says what removes a row without a read
- [ ] `pnpm -r --silent test`
- [ ] `git commit`

---

## Unknowns

- **Whether a held row updates as its delivery resolves.** It draws from the cached item, which
  `processed()` writes once; `state.ts:348` already names this — "a record that answered pending and
  landed later still reads as pending until some surface reads the item again". Phase 4 makes the
  watcher touch the queue, not the item. If a `retrying` held row is still saying `retrying` after
  the delivery lands, the fallback is for phase 4's application to re-read the item a `routed` action
  names when the cache holds it, which is one request on an event that is already rare.
- **Whether the scroll mark survives a shorter queue.** `restorePlace` sets an offset that a
  re-read may have made unreachable. If clamping reads badly — landing at the foot of a queue you
  were in the middle of — the fallback is to drop the mark when the fresh read is shorter than the
  offset, which puts you at the top of a queue that got smaller.
- **Whether `revised` is the right kind to drop on.** Verified that `edit.ts:134` records the
  *source* item as the subject, which is the one that leaves the queue. If some other path records a
  revision's own id there, dropping on `revised` would take the wrong row, and the fallback is to
  narrow phase 4 to `routed`, `archived` and `purged`.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Three that are easy to leave out. **A held row still offers `process`** is the whole point of phase
1 and needs a test that processes a row and then finds the control still there, not one that checks
the row is drawn. **Opening another row releases the held one** is the release rule that a test of
`esc` alone would miss. And **the queue re-read drops a row the pool no longer names**, which wants
a second page answered differently from the first — a test of the client rather than of the shell.

`pnpm test:stack` is not needed: nothing here crosses the HTTP surface, the host's wiring or the
config file. Phases 3 and 4 change how the client reads a route it already reads.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
