# Reclaim unnamed blobs

**Date**: 2026-10-09
**Status**: In progress
**Spec**: `docs/specs/core.md`
**Closed**:

---

## Goal

> No blob an asset or a routing record names is ever deleted, and every blob nothing names is
> deleted once it is older than the grace window, whether a sweep, a crash, a refused upload or a
> lost output left it there.

---

## Decisions

Settled with the developer on 2026-10-09:

1. **The insert check and the delete both happen under the write lock.** The walk checks that
   nothing names a blob and unlinks it inside one store transaction. The transactions that name a
   blob (an asset's insert, a landing's output) check, inside their own transaction, that the
   blob is still there.
2. **`BlobStore` gains `list()`**, yielding `{ hash, at }`, where `at` is when the bytes were last
   put. The walk lives in core; the driver only enumerates.
3. **The walk runs on its own interval**, longer than the sweep's, configured in `config.toml`,
   and once at daemon startup, in the background and off the request path.
4. **A reclaimed blob appends no action.**
5. **The walk is called a reclaim**, and its interval is `reclaim` under `[sweep]` in
   `config.toml`. `assets-released` loses its `blobs`.

The sweep stops deleting blobs. It releases assets and nothing else, and the walk takes the blobs
those assets leave behind, along with every other unnamed blob. It reuses the sweep's grace
window, because the reasoning is the same: "unnamed" and "about to be named" look identical at
the wrong instant.

Correction to decision 1 as pitched: the insert side **cannot re-put**. By the time the check
runs, the bytes have been consumed: from the request body for an upload, and from the
destination's output stream for a landing. So a blob found missing under the lock is handled as
follows:

- **Upload:** fails as a 5xx, not as a refusal. The client's transport already reads a 5xx as
  "not answered" and keeps the operation in the outbox (`packages/client/src/api/http.ts:80`).
  The retry brings the bytes again and `put` writes them fresh.
- **Landing:** recorded without its output, with `outputLost` saying why. The delivery landed,
  and losing the evidence must not fail it; this is the same reading `landingFor` already gives
  a failed output write (`packages/core/src/pool/routing/output.ts:15`).

`put` also refreshes `at` when the bytes are already held. That makes both fallbacks close to
unreachable: a re-upload of old orphaned bytes reads as fresh, and the walk passes it over. The
under-lock check stays the guarantee; the refresh only narrows how often it is needed.

---

## Tasks

- [x] Create branch `agent/reclaim-unnamed-blobs` _(2026-10-09)_

### Phase 1 — Docs

Depends on nothing.

- [x] ADR 0058 (via `core:adr`): reclaiming walks the blob store, under the write lock, and a
  naming transaction checks its blob. Record the rejected options: an mtime grace alone (narrows
  the race, does not close it), and leaving the reclaim to deep verify (which does not exist).
- [x] ADR 22: add a superseded-in-part note to the **Bad** bullet that leaves a refused `PUT`'s
  blob to deep verify, pointing at 0058. Leave the original text as it is.
- [x] `core.md`: rewrite "The sweep reaches assets, and blobs only through them" (≈ line 729) to
  say what is now true. The sweep releases assets; the walk reclaims unnamed blobs past grace; a
  driver's temporary files are still unreclaimed. Keep "The sweep never takes an output"
  (≈ line 1157), restated for the walk. Remove `blobs` from what `assets-released` carries.
- [x] `CONTEXT.md`: amend **Sweep** (line 160) and add the term for the walk. The working name is
  **reclaim**.
- [x] Amend the other specs that describe blobs being freed (`http-v1.md`, `security.md`,
  `mirror.md`). The `config.toml` key is documented with the daemon in phase 5.
- [x] Commit

**Verify:** `grep -rn "deep verify" docs/specs docs/adr/0022*` finds no sentence that still
parks blob reclaiming there without the superseding note.

### Phase 2 — The blob store can list what it holds

Depends on nothing; can run beside phase 1.

- [x] `BlobStore.list()` in `packages/core/src/types/api/ports.ts:126`, yielding `{ hash, at }`.
- [x] `blob-fs`: walk the shard directories, skip anything that is not a hash (temporary files
  included), and take `at` from the file's mtime.
- [x] `blob-fs` `put`: when the target already exists, refresh its mtime. If the refresh fails
  with `ENOENT` (deleted between the existence check and the refresh), rename the temporary file
  into place instead.
- [-] Bring the in-memory fakes up to the port _(dropped — the core fakes are partial casts and
  the daemon fixture uses the real driver; nothing to change)_
- [x] Commit

**Verify:** `pnpm --filter @notemap/blob-fs test`. New tests: `list` yields every put blob and no
temporary file; a second `put` of the same bytes moves `at` forward; a `put` racing a `delete`
of the same hash ends with the file present.

### Phase 3 — A naming transaction checks its blob

Depends on phase 2 (fakes).

- [x] `assets.store` (`packages/core/src/pool/assets.ts:44`): inside the insert transaction,
  confirm the blob exists (`ports.blobs.open` answers `undefined` without opening a descriptor).
  If it is gone, throw rather than refuse. Fix the comment at `assets.ts:19`.
- [x] The two transactions that record a landing (`packages/core/src/pool/routing/route.ts:81`
  and `packages/core/src/pool/work.ts:129`): if the output's blob is gone, record the landing
  without its output and with `outputLost`.
- [x] Confirm the daemon answers that throw with a 5xx and not a refusal status.
- [x] Commit

**Verify:** `pnpm --filter @notemap/core test`. New tests, using a fake whose blob disappears
between `put` and the transaction: the upload throws and no asset row exists; a re-upload then
stores. A landing whose output vanished records `outputLost` and the record still lands.

### Phase 4 — The walk, and a sweep that leaves blobs to it

Depends on phases 2 and 3.

- [x] Store: a transaction read for whether any asset or routing record names a hash, reusing
  `stillNamed` and `namedAsOutput` (`packages/adapters/store-sqlite/src/pool-store.ts:342`).
- [x] `deleteAssets` (`pool-store.ts:1230`) stops answering blobs. `sweepUnreferencedAssets`
  (`packages/core/src/pool/maintenance.ts:24`) stops deleting them, and drops `blobs` from the
  `assets-released` detail.
- [x] `maintenance.reclaimUnnamedBlobs()`: list the blobs; for each one older than
  `config.sweep.grace`, check whether it is named and unlink it in one transaction. Answer how
  many it took. Append no action.
- [x] Expose it on `pool.maintenance` beside the sweep.
- [x] Commit

**Verify:** `pnpm --filter @notemap/core test` and the store-sqlite tests. Cases: an unnamed blob
past grace is taken; one within grace is kept; one named only by an asset is kept; one named only
by a routing record's output is kept; a swept asset's blob is taken by the next walk and not by
the sweep; an upload that commits between the walk's listing and its transaction keeps its blob.

### Phase 5 — The daemon drives it

Depends on phase 4.

- [ ] `config.toml`: `[sweep] reclaim`, the reclaim's interval, with a default in `apps/daemon/src/constants.ts` (a day,
  unless decided otherwise), parsed in `apps/daemon/src/config/load.ts`.
- [ ] A timer beside the sweeper (`apps/daemon/src/assets/sweeper.ts`), with the same
  skip-if-in-flight and stop-before-close behaviour. It runs once at startup without blocking
  `listen`. Log what it took, at the levels `http-v1.md` gives a sweep.
- [ ] Stop it in `apps/daemon/src/main.ts` before the pool closes, as the sweeper is stopped.
- [ ] Commit

**Verify:** daemon tests (startup run fires and does not delay readiness; stop waits for an
in-flight run). Then `pnpm test:stack`, since this touches the config file and the host's wiring.

### Phase 6 — Close out

- [ ] `docs/todo.md`: tick the two *Pool, store and correctness* items (the sweep race and blobs
  nothing reclaims) and the stale "trying to capture an empty capture gives no error" item
  (shipped in #96, `shell.md:26`).
- [ ] `Shipped:` entry in `core.md`.
- [ ] Typecheck, `pnpm -r --silent test`, lint.
- [ ] Commit

---

## Unknowns

- [x] **Uploaders that are not the client.** _(2026-10-09)_ Raycast attaches through the client, so
  its outbox retries. The relays read a 5xx as `notThisItem` (`packages/relay/src/pool/pool.ts:74`)
  and stop the scan without marking the item done, so the next scan sends it again.
- **Size of the walk.** It is one transaction per candidate blob, and listing scales with the
  blob count. That is fine for a personal pool. If a test with tens of thousands of blobs shows
  the write lock starving captures, batch the transaction per shard directory.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The race tests matter most. Each one interleaves a `put`, a walk and an insert in the order that
used to lose bytes, and asserts that the bytes are readable or that the operation failed in a way
that gets retried.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
