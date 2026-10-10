# Review: Reclaim unnamed blobs (PR #100)

**Date**: 2026-10-10
**Status**: Resolved
**Scope**: `git diff main...HEAD` on `agent/reclaim-unnamed-blobs`: `packages/core/src/pool/{maintenance,assets}.ts`, `packages/core/src/pool/routing/{output,route}.ts`, `packages/core/src/pool/work.ts`, `packages/adapters/blob-fs`, `packages/adapters/store-sqlite/src/pool-store.ts`, `apps/daemon/src/assets/reclaiming.ts`, docs
**Plan**: `docs/plans/reclaim-unnamed-blobs.md`
**Spec**: `docs/specs/core.md`

---

## Overall

The race closure holds. The reclaim deletes a blob only inside a store transaction, after `blobNamed` has said nothing names it. Every transaction that writes a blob reference (an asset insert, a `route` landing, a `complete` landing) confirms under the same lock that the blob is still there. I could not build an interleaving of put, reclaim and insert, or of sweep and reclaim, that leaves a row naming missing bytes. No bugs. The findings are about cost and signalling. The expected race goes out through the daemon's "unexpected throw is a bug" path. The walk takes the write lock once for every old blob, named or not. The `put` mtime refresh is described as doing more than it does. The tests prove the parts work alone but not that the race is closed end to end.

---

## Bugs

None.

---

## Design

### 1. The upload race goes out as an unexpected bug

`packages/core/src/pool/assets.ts:68-72` → `apps/daemon/src/app.ts:327-334` → `packages/client/src/client.ts:99`. The throw reaches `onError`, whose own comment says "An unexpected throw is a bug". It is logged at `error` with a stack as "a request threw", and the client calls `answered(false)` on any status ≥ 500. A race that ADR 58 expects and the client recovers from therefore shows up as a bug in the logs and as a moment of "daemon unreachable" in the shell. This also contradicts http-v1.md's logging rule, which says `error` is "a throw nobody expected". The retry works, but the signal is wrong.

```
reclaim takes X between put and insert → insert throws → onError logs error + 500 → shell marks the daemon unanswered
```

Fix: decide with the developer. Options are a typed error the route maps to a retryable `503`, logged at `warn`, or accepting the log level and saying so in http-v1.md.

### 2. One write transaction per old blob, named or not

`packages/core/src/pool/maintenance.ts:64-72`. Every listed blob past grace gets its own `BEGIN IMMEDIATE`, including the large majority that an asset names. Once a pool is a day old, that is almost the whole store. Each run, including the one at every startup, therefore takes the write lock about N times for N blobs, and those acquisitions interleave with captures. The ADR's "Bad" bullets count the `stat` and `unlink` under the lock and the cost of listing. They do not count this. Asking `blobNamed` on the read connection first, and taking the lock only for blobs that answer unnamed, would leave the safety unchanged, because the question is asked again under the lock.

### 3. The mtime refresh does not reach a reclaim already walking

`packages/core/src/pool/maintenance.ts:66` uses the `at` that `list()` read when it ran `stat`, outside the lock. A `put` that refreshes the file's time after that `stat` but before the reclaim's transaction is not seen, so the blob is deleted and the upload gets the 500 from #1. Three places claim more than this: `packages/adapters/blob-fs/src/store.ts:74` ("that is what tells a reclaim it was just put"), `docs/specs/core.md:753-755` and ADR 58 line 66-67 ("the reclaim passes it over"). ADR 58's own Option 2 analysis describes this exact window. Fix: either `stat` again under the lock (it already does one `stat` there via `open`), or say in the docs that the refresh narrows the window rather than closing it.

### 4. The tests cover each part alone, not the race

- `packages/core/src/pool/assets.test.ts` (the `between` hook) and `maintenance.test.ts` ("asks again under the lock") run on fakes. No test puts a real blob-fs together with sqlite and puts a reclaim between `put` and the insert.
- `routing/output.test.ts` tests `stillHeld` on its own. Nothing checks that `route.ts:85` and `work.ts:146-151` call it *inside* the transaction. Moving the call out, or dropping it, fails no test.
- http-v1.md now promises `500` for an upload whose bytes were reclaimed, and no daemon route test covers it.
- Known gap: in blob-fs, a `put` racing a `delete` (`touched` succeeds, the reclaim unlinks the file, `put` unlinks its temporary file) returns a hash whose bytes are already gone. The insert check catches this. However, the `put` doc in `packages/core/src/types/api/ports.ts:128-131` does not say it can happen, and that possibility is the whole reason the check exists.

---

## Minor

### 5. `isBlobName` took over `pathFor`'s doc comment

`packages/adapters/blob-fs/src/paths.ts:10-21`. The new function was inserted between the layout docstring (`<root>/<first two characters>/…`) and `pathFor`, so that docstring now documents `isBlobName`.

### 6. The docs give the grace window the wrong job for the reclaim

`apps/daemon/README.md:72` and `apps/daemon/config.example.toml:89-92` say the window exists because, to *either* the sweep or the reclaim, referenced and about-to-be-referenced look identical. For the reclaim that is not true: the check under the lock is what makes it safe, and the window only makes the 500 fallback rare. ADR 58 states this correctly. The README is hand-written, so this is a suggested edit only.

### 7. The "within the grace window" integration test passes because of clock skew

`tests/integration/src/asset-pipeline.test.ts:130`. The pool's clock is frozen at 2026-08-06 and the file's mtime is the current wall time, so the blob is kept whatever the grace is. The test's own comment says so. The genuine case is covered in `apps/daemon/src/routes/assets.test.ts` (system clock) and at the boundary in `maintenance.test.ts`. Rename this test to say what it proves, or drop it.

### 8. Two clocks, undocumented

`packages/core/src/pool/maintenance.ts:61` compares `ListedBlob.at`, which is filesystem wall time, with the pool's injected clock. In production both are `systemClock` and safety does not depend on the comparison (see Non-issues). Still, `ListedBlob` in `packages/core/src/types/domain/asset.ts` does not say whose clock `at` is on. Integration fixtures have to backdate files to 2020 to work around this.

### 9. Stray and stale edits

- `docs/todo.md:9` ticks an unrelated item ("empty capture gives no error").
- `apps/ui/src/lib/actions.test.ts:147` still passes `blobs: []` in `assets-released` detail, which the action no longer carries.
- `docs/specs/core.md:4` still reads **Last updated** 2026-10-08.

---

## Non-issues

- **The asset-insert check comes after the `already-stored` early return.** The held row already names the blob under the lock, so the reclaim cannot have taken it. On `asset-id-conflict`, nothing gets named.
- **`blobs.open` used as an existence check.** blob-fs runs `stat` eagerly and opens the file lazily, so the check holds no file descriptor.
- **`blobNamed` inside the transaction.** It runs on the write connection, so it sees uncommitted rows from the same transaction.
- **Other writers of references.** `routing/records.ts:29` and `templates/fire.ts:83` insert records with no output. Captures and revisions name assets by id, under the foreign key. The only transactions that name a blob are `assets.ts:74`, `route.ts:220` (via `kept`) and `work.ts:204`, and all three check.
- **Sweep → reclaim.** The sweep only deletes rows, under the lock. The reclaim then sees the blob unnamed and takes it. A re-upload under the same id writes the bytes again before its insert check.
- **Cross-process.** The check and the `unlink` both sit inside `BEGIN IMMEDIATE`, so a second process on the same pool is serialized too, not only this process's JS lock.
- **Wall clock compared with the pool clock.** A wrong comparison can delete an unnamed blob early or late. It can never delete a named one, because the grace is about efficiency, not safety.
- **Shipped trail.** The plan is Done and lists only `core.md`, which has a 2026-10-09 `Shipped:` entry.

---

## Resolution

Fixed on the branch, 2026-10-10:

- **1**: the race is a refusal, `blob-reclaimed`, which the daemon answers `503` with
  `Retry-After: 1`, so nothing reaches `onError`. The client counts a `503` in the daemon's own
  error body as reaching the daemon and words it from the refusal table; a bare `503` from a proxy
  still reads as unreachable.
- **2**: the reclaim passes over a young or committed-named blob without the lock; only an old,
  unnamed one gets a transaction. `blobNamed` is a read on both sides.
- **3**: `BlobStore.lastPut` reads the age again under the lock. The docs now name the one window
  left, between that read and the delete, which the naming transaction covers.
- **4**: the integration harness can race a `put` (`racing`), and three tests run a real reclaim
  between the write and the transaction: an upload, a route and a deferred delivery. Each fails
  with the check removed. The daemon's `503` has a route test. The put-racing-delete case is the
  same path as a first write, since `touched` is the only existence check; the doc on `put` now
  says the bytes may be gone when it answers.
- **5–8**: fixed. The grace test runs on the wall clock and sweeps first, so it asserts the window
  rather than the skew.
- **9**: `actions.test.ts` and `core.md`'s date fixed. The `docs/todo.md:9` tick stands: that item
  shipped in #96, and the plan said to tick it.

