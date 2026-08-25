# Review: The durable client store, hydration and the boot drain (PR #26)

**Date**: 2026-08-25
**Status**: Resolved
**Scope**: `packages/client/src/{ports,adapters,state,outbox}`, `packages/client/src/client.ts`, `apps/ui/src/lib/client.ts`
**Plan**: `docs/plans/durable-offline-client.md` (phases 1–2)
**Spec**: `docs/specs/client.md`

---

## Overall

Phases 1 and 2 are here and they do what the plan says: one typed store method per collection, an
IndexedDB adapter behind a subpath, one contract both adapters are run against, hydration gating
every path that touches state, a boot drain, and a refusal settled from the pool rather than rolled
back. Tests, typecheck, lint, formatting and `pnpm test:stack` are all green. The docs and the code
move together, and ADR 24 argues its case honestly.

One real defect, and it lands on the exact promise the plan exists to keep. An operation is
persisted as `sending` before its request leaves, and `drain` only picks up `pending` and
`unreachable` — so an operation interrupted by the tab closing mid-request comes back `sending` on
the next boot and is never sent, never settled and never retried. The durable outbox loses work in
the one window it was built to cover. Everything else is smaller.

---

## Bugs

### 1. An operation interrupted mid-send is stranded `sending` forever

`packages/client/src/state/hydrate.ts:30`, `packages/client/src/outbox/outbox.ts:151`

`record({ ...entry, state: "sending" })` writes `sending` to the store and awaits it _before_
`deps.send` is called (`outbox.ts:97`). Close the tab, lose the process, or have the browser reap
the page while that request is in flight, and the store holds a `sending` operation. Hydration reads
the outbox back verbatim, and `drain` skips anything that is not `pending` or `unreachable`.

```
persisted "sending" → process dies mid-request → hydrate restores "sending"
  → drain skips it → never sent, never settled, no retry, no report
```

Confirmed against the code: a client built over a store holding one `sending` `archive` sends
nothing at all, and `client.outbox` still shows it `sending` after everything has settled.

This contradicts the spec this PR wrote. `docs/specs/client.md` now claims an edit's minted identity
"survives a reload with the operation (2026-08-25), so a retry after a restart claims the identity
the first attempt did and the pool answers one revision" — the restart that makes that sentence
worth writing is a restart _during_ the send, which is the case that never retries.

Fix: `sending` is a claim about this process, and a fresh process holds no request. Hydration should
demote it — to `pending`, or to `unreachable` if the outbox wants to say it may already have landed.
Every operation is idempotent under a client-minted id, which is what makes the re-send safe, and is
the same argument phase 5 leans on for the two-step attachment. Wants a test beside the phase 2
ones: a `sending` operation read back is re-sent exactly once.

---

## Design

### 2. A hydration failure is swallowed with no signal, and the outbox is not a cache

`packages/client/src/client.ts:70`

`hydrate(state, store).catch(() => undefined)` treats every read failure alike, and the spec's own
justification for swallowing write failures does not stretch to cover it: "the store is a mirror of
the cache, and losing it costs a re-read" is true of items, tags and destinations, and explicitly
false of the outbox, which the same paragraph calls "the person's un-landed work".

A blocked or failing `readOutbox()` therefore gives a client that comes up looking empty and normal
while holding none of the work it was carrying. It is non-destructive — the store still has the
operations, `persistItems` diffs against an empty map so it removes nothing, and `whole()`'s
`skip(1)` writes nothing — so the next successful boot recovers. But nothing tells the person, or
the shell, that this boot is not the one they think it is.

Consequence: the one failure mode the durable store exists to survive is also the one it reports
least. Worth distinguishing the outbox read from the cache reads, and giving the client a way to say
a boot came up cold.

### 3. `undo === undefined` is a proxy for "read back from the store", and is not exactly that

`packages/client/src/outbox/outbox.ts:117`

The re-read fires on a missing reversal, which stands in for "this operation was rehydrated". It is
right for every case the tests cover, but the two are not the same predicate: `dismiss` is `drop`,
which deletes the undo, so dismissing an operation while it is `sending` and then having the pool
refuse it takes the rehydrated branch and spends a round trip on an operation nobody is waiting for.
That same path then re-adds the dismissed operation to the outbox and the store through
`record({ ..., state: "refused" })` — pre-existing and out of this PR's scope, but the new branch
sits directly on top of it.

Saying it directly — a flag on the entry, or a set of ids hydration knows it did not enqueue — costs
one field and makes the intent legible.

### 4. `whole()`'s `skip(1)` is correct only because of where `persist` is called

`packages/client/src/state/persist.ts:50`

The skip depends on `state.changes` being a `BehaviorSubject`, _and_ on `persist` being subscribed in
the same microtask that hydration's `state.set` completed, with nothing gated behind `ready` having
run yet. All three hold today and the comment states the second. But the invariant lives in
`client.ts`'s promise chain and is enforced nowhere: move the `persist` call one `await` later and
the first genuine write is silently dropped, with green tests, because the drop is invisible.
Passing the hydrated value in and comparing against it, rather than counting emissions, would make it
self-enforcing.

### 5. Six port methods ship with no caller

`packages/client/src/ports/store.ts:32-44`

`readPoolIdentity`, `writePoolIdentity`, `readBlob`, `writeBlob`, `removeBlob` and `blobUrl` are
implemented twice and covered by the contract, and nothing in `packages/client` or `apps/ui` calls
any of them — the blobs wait for PR 6, the pool identity for PR 5. That is the plan's phase 1 as
written, so it is a deliberate call rather than an oversight; it is worth naming because
`offline-capture-rollout.md`'s own PR 4 entry gives "what keeps the port from shipping with methods
no caller reaches" as the reason for folding tags and destinations in, and these six are exactly
that. Either they move to the PRs that use them, or the rollout note stops claiming otherwise.

### 6. `idb` is a hard dependency of the whole client package

`packages/client/package.json:22`

The subpath export keeps `idb` out of any bundle that does not import `@notemap/client/indexeddb`,
which is the plan's stated goal and holds. The dependency entry does not: a native shell taking
`@notemap/client` installs `idb` whether or not it will ever have a database. An optional peer, or a
separate `@notemap/client-indexeddb`, matches the seam the code already draws.

---

## Minor

### 7. The adapter never handles an upgrade blocked by another tab

`packages/client/src/adapters/indexeddb-store.ts:51`

`openDB` is called with no `blocked` or `blocking` handler. At `VERSION = 1` with no migration
history this cannot fire. The first schema change makes it a tab open in the background that hangs
the new one indefinitely, with nothing logged. `blocking() { database.close() }` is a line and buys
the problem off before it exists.

### 8. `localUrls.of` keeps the first URL after the bytes are replaced

`packages/client/src/adapters/local-urls.ts:13`

`of()` returns the memoised URL without looking at the blob it was handed, so a `writeBlob` under an
asset id that already has a URL leaves the old bytes being drawn. No caller writes blobs yet and
asset ids are minted per attachment, so it will not fire — but `writeBlob` is where the release
belongs, symmetrically with `removeBlob`.

### 9. The database-name comment claims more than the wiring does

`packages/client/src/adapters/indexeddb-store.ts:31`

"Named so that two pools open in one browser do not share a cache" — `apps/ui/src/lib/client.ts`
calls `createIndexedDbStore()` with no name, so today two pools _do_ share `notemap`. The option is
an affordance nobody uses, and the comment reads as a guarantee. Phase 4's identity check is what
will actually answer this.

### 10. `store-contract.ts` imports `vitest` from outside a test file

`packages/client/src/adapters/store-contract.ts:1`

The only non-`.test.ts` file in `src/` that does. `src/testing/` is the package's established home
for shared test material and is exported as `@notemap/client/testing`; neither `pool.ts` nor
`transport.ts` reaches for a framework. Sharing a contract genuinely needs `it`, so the file has to
live somewhere — but it should live where the convention says, or the convention should be widened
deliberately.

### 11. Import ordering in `outbox.ts`

`packages/client/src/outbox/outbox.ts:7`

`import type { ItemId } from "../api/types"` sits between `./handler` and `./operations`, breaking
the file's own parent-then-sibling grouping. No lint rule catches it.

---

## Non-issues

- **`persistItems` has no `skip(1)`** — `pairwise()` needs two emissions, so the replayed hydrated
  state produces no write on its own. Correct as it stands.
- **A hydration failure re-writes nothing over a store it could not read** — the items diff is
  against an empty `before`, so `gone` is empty and nothing is removed, and `whole()` skips the empty
  first emission. Non-destructive by construction.
- **`edit`'s `targetOf` is the item, not a revision** — `edit.apply` amends the item in place and only
  the pool's settlement creates a revision, so the re-read settles everything the optimistic apply
  touched. No orphan.
- **`item()` does not forget a 404 while `reread` does** — a read that misses is not a refusal; only
  the refusal proves nothing will ever claim the item.
- **The surfaces stay empty after hydration** — a page is a position the pool handed back, and
  deriving one from the cache is phase 3's. The spec says so in the same words.
- **`blobUrl` on the memory store mints a real object URL under Node** — `URL.createObjectURL` is
  available there, which is why the shared contract can assert it for both adapters.
- **`persist` subscriptions are never torn down** — pre-existing; the client has no disposal seam, and
  one client exists per shell.

---

## Resolution

Reconciled with the author's own review of PR #26 on 2026-08-25. Findings 2 and 10 were reached
independently by both; 12–15 below are the author's alone, kept here so the round is one list.

1. **Fixed.** `hydrate` reads a `sending` operation back as `pending`, since the process that
   claimed it is gone. `hydration.test.ts` pins it — the test fails when the demotion is removed.
2. **Fixed.** `ClientConfig.onError` is the seam; the web shell wires it to `console.error`. Each
   collection is now read on its own, so a failed cache read no longer costs the outbox, and what
   failed is reported as an `Unreadable` naming the collection. Cache write failures go the same
   way rather than vanishing into `catchError`.
3. **Fixed.** The outbox holds the ids hydration restored (`Outbox.restored`) and branches on that
   rather than on a missing reversal.
4. **Fixed.** `whole()` takes the hydrated state and filters that value out by identity instead of
   counting emissions, so it no longer depends on when `persist` is subscribed.
5. **Won't fix**, recorded instead. The six methods stay: they are the plan's phase 1, both adapters
   implement them, and the contract covers them. `offline-capture-rollout.md`'s PR 4 entry now says
   so rather than claiming the opposite.
6. **Fixed.** `idb` is an optional peer of `@notemap/client` and a direct dependency of `apps/ui`.
7. **Fixed.** `blocking()` closes the held connection and clears the cached handle, so the next call
   opens again.
8. **Fixed.** `writeBlob` releases the asset's URL before replacing the bytes, in both adapters.
9. **Fixed.** The comment is gone.
10. **Fixed.** Renamed `store-contract.test.ts`. Vitest runs it as a file with no tests of its own,
    which `--passWithNoTests` allows.
11. **Fixed.**
12. **Fixed** (author). The whole memory store uses `async` rather than `Promise.resolve()`, not
    only the methods this branch added.
13. **Fixed** (author). Same change.
14. **Fixed** (author). Removed: `reopen()`'s doc, `localUrls.of`'s doc, the database-name comment.
    Trimmed: `createIndexedDbStore`'s block, the shell's wiring comment, `OutboxDeps.reread`, and
    `storeContract`. Kept the ones answering a question the code raises — the `filter` on the
    hydrated value, `void drain()`, the lazy open, the one-transaction write, the `blocking`
    handler, and the two test assertions.
15. **Won't fix**, argued and conceded by the author. `Notemap` is `idb`'s `DBSchema`, so hoisting it
    would pull `idb`'s types into the port layer that the subpath export exists to keep them out of.
