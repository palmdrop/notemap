# The durable offline client

**Date**: 2026-08-24
**Status**: In progress
**Spec**: `docs/specs/client.md`, `docs/specs/sync.md`
**Closed**:

---

## Goal

A person opens notemap with the daemon down and finds their pool: the queue and the feed drawn from
what the client holds, marked as what the client holds; captures, tags, edits and archives made in a
previous session still waiting in the outbox and draining the moment the daemon answers; a picture
taken offline showing its own bytes until they land. The client's store stops being write-only —
`readOutbox()` and `readItems()` acquire a caller, a durable adapter backs them, and the client
reads them back on start.

Depends on [editable-until-processed](editable-until-processed.md) and
[client-minted-assets-and-health](client-minted-assets-and-health.md), both merged. The first
rewrites the very functions this plan derives surfaces from; the second is what makes an offline
capture with an attachment possible at all, and is what the reachability probe asks.

---

## Tasks

### Phase 1 — the port and a durable adapter

Depends on nothing beyond the two plans above.

- [x] Branch `agent/durable-client-store`, which is the pull request this phase lands in
      ([rollout](offline-capture-rollout.md))
- [x] `ClientStore` grows a typed method per collection: items and the outbox as today, plus blobs
      and the local URL for one, the tags in use, the destinations, and the pool identity. One port,
      one store for a shell to wire; the file groups the methods by concern
- [x] `createMemoryStore` implements all of it, blobs included, so every existing test keeps running
      against a store that answers everything
- [x] An IndexedDB adapter over `idb`, exported from a subpath so `idb` reaches only a shell that
      asks for it. It opens the database lazily rather than at import
- [x] The adapter owns the local URL for a blob it holds, and its revocation. A shell that is not a
      browser answers that question differently, which is why it sits on the port and not in the
      client
- [x] `fake-indexeddb` imported by the adapter's own test rather than a package-wide setup file:
      it is the only test that wants a database, and a global nothing else asks for is a trap
- [x] Tests: every method round-trips; a database reopened answers what the last one wrote; a blob
      survives the reopen; removing an item removes it. The round-trips are one contract both
      adapters are run against, so the pair cannot drift
- [x] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [x] `git commit`

### Phase 2 — hydration, the boot drain, and a refusal with nothing to reverse

Depends on phase 1.

- [x] ADR 0024: a refusal after a restart is reported and settled by re-reading the item, not rolled
      back. Reversals are closures (`outbox/outbox.ts:27`) and a rehydrated operation has none;
      record the rejected alternatives — a persisted before-snapshot per operation, and an inverse
      declared per kind, which collapses into snapshots for `edit` anyway — and the reason this is
      safe: a refusal means the pool answered, so it is reachable exactly when the re-read is needed
- [x] `createClient` starts hydration at once and returns; every path that touches state — a
      mutation, a surface read, a drain — waits on it first, the way `drain` already chains. The
      shell's wiring does not change and no caller can observe a half-hydrated cache
- [x] Hydration reads back the tags in use and the destinations alongside the items and the outbox,
      so a client opened cold against an unreachable pool completes tags from the last list it read
      and can still name its destinations — the gap [client.md](../specs/client.md) says this work
      closes
- [x] Hydration does not re-apply pending operations: the cache was persisted with their effects in
      it. A crash between the two writes leaves one effect missing until that operation drains
- [x] A rehydrated `refused` operation stays refused, is not re-sent, and waits for a person, which
      is what `CONTEXT.md` says a refusal is
- [x] The drain runs as soon as hydration lands, so work made in a previous session reaches the pool
      without the person doing anything
- [x] `apps/ui/src/lib/client.ts` wires the durable store
- [x] Tests: a client built over a store holding an outbox and items comes up with both; a capture
      made against a dead transport is there after a fresh client is built over the same store, and
      drains once when the transport answers; a rehydrated operation the pool refuses reports the
      refusal and settles the item from the pool; a rehydrated refused operation drains nothing; a
      cold client with no transport completes a tag it saw last session; an item whose rehydrated
      capture the pool refuses is forgotten
- [x] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [x] `git commit`

### Phase 3 — surfaces derived from the cache

Depends on phase 2.

- [ ] The queue is derived from the cache rather than restored as a page: the items the client can
      see are unprocessed, mirroring the store's own three anti-joins — no routing records, not
      archived, `revisedInto` empty — ranked by capture time. The feed is the same cache,
      newest first
- [ ] A derived page reports that it holds what the client holds rather than what the pool holds,
      and a surface says so. It is not exhausted and it is not loading: it is the client's own
- [ ] The first successful pool read **replaces** a derived page rather than extending it. A derived
      page has no position, and stitching one to a page the pool positioned is two orders in one list
- [ ] `loaded()` answers for a derived page. As it stands it requires a position or exhaustion, so a
      capture made offline would be refused placement into the very surface it was made on
- [ ] Tests: a cold client over a store holding items draws both surfaces without a transport; a
      routed, an archived and a revised-from item are all absent from the derived queue; an offline
      capture appears in the derived queue at its own capture time; a pool read replaces the derived
      page rather than appending to it
- [ ] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [ ] `git commit`

### Phase 4 — reachability, and a pool that is not the one we cached

Depends on phase 2; independent of phase 3.

- [ ] ADR 0023: on a changed pool identity the client drops the cached items and the derived
      surfaces, keeps the outbox, and says so. The cache may describe a pool that no longer exists —
      a rebuild loses its tombstones, so anything purged before it would never be reported gone —
      while the outbox is the person's own un-landed work and replays idempotently. Record that this
      settles half of [sync.md](../specs/sync.md)'s rebuild question and leaves the resync half open
- [ ] `Transport` reports reachability as an observable: true when a real request has just answered,
      and kept honest by a probe of `GET /v1/health` on a backoff — quick after a failure, slow when
      quiet. The client drains when it turns true
- [ ] The client caches the pool identity `/v1/health` reports and compares it with what the store
      holds
- [ ] `apps/ui/src/lib/reachable.svelte.ts` reads the transport's signal instead of
      `navigator.onLine`, which says yes whenever a network exists and the daemon is dead
- [ ] Tests: an unreachable transport that starts answering drives a drain with no mutation to prod
      it; the backoff does not spin; a changed identity clears the items and keeps the outbox
- [ ] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [ ] `git commit`

### Phase 5 — a capture with an attachment, offline

Depends on phases 1 and 2, and on client-minted asset ids.

- [ ] The client mints the asset id when the person attaches the file, and holds the bytes in the
      store under it. The envelope is therefore complete when the capture is made
- [ ] The `capture` handler `PUT`s the bytes then `POST`s the capture. Both are idempotent under
      ids minted before either was sent, so a failure between them retries the pair
- [ ] The same two-step in the `edit` handler: ADR 21 makes a revision an ordinary capture, so its
      payload can name an asset the store still holds
- [ ] An asset whose capture has not drained resolves to the store's local URL; everything else
      resolves through the transport. The rule is one line and the shell asks the same question it
      always did
- [ ] Bytes are released when their capture lands, or when a refused capture is dismissed — nothing
      will ever claim them
- [ ] The compose surface no longer waits on an upload before capturing
- [ ] Tests: a picture captured against a dead transport is drawn from local bytes, survives a
      rebuild of the client over the same store, and lands as one asset and one item when the
      transport answers; a retry after a failure between the two requests leaves one of each
- [ ] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [ ] `git commit`

### Phase 6 — retention

Depends on phases 1 and 3.

- [ ] Retention: everything the client can see is unprocessed stays, being the working set; items
      that are only feed history are capped, oldest touched first. An item with a pending operation
      is never evicted
- [ ] Tests: eviction spares unprocessed items and pending ones and takes the rest
- [ ] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [ ] `git commit`

### Phase 7 — across the layers, and the specs

Depends on every phase above.

- [ ] `pnpm test:stack` green, with a case that fills an outbox against a dead daemon, rebuilds the
      client over the same store, starts the daemon, and finds every operation landed exactly once —
      the attachment included
- [ ] `CONTEXT.md`: add **Cache** and **Hydration**
- [ ] `docs/specs/client.md`: the ports in detail, hydration and what it gates, the read caches,
      derived surfaces, retention, reachability, the offline attachment, and Prior decisions for
      each. Three of its
      open questions close — reading the store back on start, the port shapes, and how an `edit`
      coalesces is answered by there being no coalescing
- [ ] `docs/specs/sync.md`: half the rebuild question is answered; say which half and leave the rest
- [ ] `docs/todo.md`: drop the write-only-store item
- [ ] Add the dated `Shipped:` entries (see Notes)
- [ ] `git commit`

---

## Unknowns

- **Whether `images()` can stay synchronous** once an asset may resolve to a local URL the store
  creates. *Fallback*: the client holds resolved local URLs in its state, filled at hydration and on
  enqueue and released on drain, so the call stays synchronous and the port stays asynchronous.
- **When the web adapter revokes an object URL.** Too early and a row blanks; never and the tab
  leaks. *Fallback*: revoke when the bytes are released and on unload, and accept the leak inside a
  session.
- **Whether the browser evicts the database under storage pressure.** IndexedDB is best-effort
  unless storage is persisted, and asking for persistence prompts in some browsers. *Fallback*:
  treat the cache as a cache — the outbox is the only thing whose loss would cost work, and its
  entries are small.
- **How a derived surface says it is derived** without inventing a second vocabulary for the shell.
  *Fallback*: one flag on the list state, drawn by the same chrome that already says the pool is out
  of reach.
- **Whether hydration should gate reads as well as mutations.** Gating everything is simplest and
  costs a tick on a cold start. *Fallback*: gate everything; revisit only if a cold start feels slow.

---

## Out of scope

Delta reads, tombstones, and what a client resyncs after a rebuild. This plan notices a changed
identity and drops what it holds; deciding what to fetch next is [sync.md](../specs/sync.md)'s and
needs a wire that does not exist.

Warming the cache. It fills from what surfaces actually read; nothing pages the queue ahead in the
background, so an offline working set is as large as the person's reading made it.

The shell's marks — the pending mark, the incomplete-surface mark, and drawing local bytes — are
[shell-offline-marks](shell-offline-marks.md)'s, which depends on this.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

`packages/client` tests build a memory store per test and assume a client that starts empty. Most
stay true; the ones that assert a surface is empty until the transport answers are asserting the old
rule and want rewriting rather than deleting.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
