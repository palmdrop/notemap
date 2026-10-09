# 58. A reclaim walks the blob store, and a transaction that names a blob checks it is there

**Date**: 2026-10-09
**Status**: Accepted. Supersedes in part [ADR 22](0022-the-uploader-mints-the-asset-id.md): the
blob a refused `PUT` leaves behind is the reclaim's to take, not deep verify's.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

The sweep releases assets no item ever referenced and deletes each blob that loses its last asset,
after the transaction that released them commits. A blob is written before the transaction that
names it, so an upload of the same bytes landing between the sweep's commit and its delete names a
file the sweep then removes, and an attachment that was stored reads `blob-missing`.

Separately, nothing ever takes a blob no asset named: a crash between the write and the insert, a
refused `asset-id-conflict`, an output whose route was refused as `item-purged` or whose lease was
lost. [core.md](../specs/core.md) and ADR 22 left these to deep verify, which does not exist.

How are unnamed bytes taken without ever taking bytes something is about to name?

---

## Decision drivers

- **Loss outranks space.** A leaked blob costs disk; a deleted one costs a person's file, for good.
- **Bytes are written outside every transaction**, because the store holds a write lock throughout
  one and a stream may take as long as an upload does.
- **Content addressing makes the race reachable.** A second upload of the same bytes reuses the
  first one's file rather than writing its own.
- **One path for all debris** is one path to get right. A sweep that takes some blobs and a walk
  that takes the rest would each have to ask what names a blob.

---

## Considered options

1. **The sweep re-checks under the lock** before deleting each blob it released.
2. **A grace window on the blob**, kept by its modification time, which every `put` refreshes.
3. **A reclaim over the blob store**, which checks and deletes under the lock, while every
   transaction that names a blob checks under the same lock that it is still there.
4. **Leave it to deep verify.**

---

## Decision outcome

Chosen: **option 3**, because it is the only one that closes the race and reaches the blobs no
asset ever named.

The sweep releases assets and no longer deletes blobs. A **reclaim** lists the blob store — the port
answers each hash with when it was last put — and for each one older than the sweep's grace window
asks, in one store transaction, whether an asset or a routing record's output names it, and
deletes it there if nothing does. It appends no action. It runs on an interval of its own, longer
than the sweep's, and once when the daemon starts.

The transactions that name a blob — an asset's insert and a landing that keeps an output — check
that it is still there. The bytes have been consumed by then and cannot be put again from inside,
so each answers with what it already has for a lost write:

- **An upload** fails as a 5xx rather than a refusal, which a client reads as unanswered and sends
  again, bytes and all.
- **A landing** is recorded without its output, saying why. The delivery landed.

`put` refreshes when bytes were last put when they are already held, so a re-upload of old
orphaned bytes reads as fresh and the reclaim passes it over. That makes both fallbacks rare; the
check under the lock is what makes them unnecessary to trust.

### Consequences

- **Good** — no blob anything names is deleted, by any interleaving of a write, a reclaim and an
  insert.
- **Good** — every kind of unnamed blob is eventually taken, outputs included, by one walk asking
  one question.
- **Bad** — a `stat` and an `unlink` now run under the write lock, which `assets.store` was written
  to avoid. Accepted: both are metadata calls, and the write that lock was kept free of is a
  stream.
- **Bad** — `BlobStore` grows `list`, and listing scales with how many blobs the pool holds rather
  than with how much is debris.
- **Neutral** — a driver's temporary files are still not reclaimed; they are not blobs, and `list`
  does not answer them.
- **Neutral** — `assets-released` no longer carries the blobs, since the sweep no longer takes any.

---

## Pros and cons of the options

### Option 1 — the sweep re-checks

- **Good** — the smallest change.
- **Bad** — the re-check closes nothing alone: the upload's write already happened outside the lock,
  and its insert can still follow the delete.
- **Bad** — the sweep enumerates assets, so a blob no asset ever named stays out of its reach.

### Option 2 — a grace window on the blob

- **Good** — nothing new under the lock.
- **Bad** — a `put` that refreshes the time just after the walk read it still loses its bytes. It
  narrows the window and does not close it.

### Option 3 — a reclaim, and a check on naming

- **Good** — airtight, and one path for every kind of debris.
- **Bad** — disk calls under the lock, and a port method that walks everything.

### Option 4 — deep verify

- **Bad** — it does not exist, and the race is loss rather than space, so it cannot wait for it.

---

## More information

[Plan](../plans/reclaim-unnamed-blobs.md), [core.md](../specs/core.md).

Revisit if the reclaim's walk is seen to hold the write lock long enough to delay captures, or if a
blob store that is not a local filesystem makes `list` or a `stat` under the lock expensive.
