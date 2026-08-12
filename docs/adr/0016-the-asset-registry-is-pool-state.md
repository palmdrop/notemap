# 16. The asset registry is pool state; the port carries bytes

**Date**: 2026-08-11
**Status**: Accepted — moves the port boundary of
[ADR 13](0013-assets-are-named-references-to-content-addressed-blobs.md); ADR 13's model stands.

---

## Context and problem statement

[ADR 13](0013-assets-are-named-references-to-content-addressed-blobs.md) settled the model — a
named asset, a content-addressed blob, a reference count at each level — and left the boundary
where it happened to be. `AssetStore` owned storing, resolving, verifying and releasing an asset;
the pool store owned `item_assets`, which is the count of what references one.

Between them no table held **which assets exist**. Each side knew a subset: the pool store knew
every asset some item had named, the asset store knew every asset it had ever minted, and neither
could be asked for the difference. That difference is the sweep's real target — an asset no item
*ever* referenced, because the capture that was going to name it never arrived, which is the
leak ADR 13 accepts in exchange for taking the reference at commit rather than at upload.

So: which side holds the registry of assets, and what is left for the port?

---

## Decision drivers

- **The sweep's subject has to be nameable.** "Every asset with no referencing item" is a join,
  and a join needs both sides in one place.
- **Two stores cannot be written atomically.** Both refcounts move together when an asset is
  released, and [asset-uploads.md](../research/asset-uploads.md#5-orphangarbage-collection) names
  double-decrement as the failure mode that *loses* bytes rather than merely wasting them — the
  one direction of this that is not recoverable.
- **A driver's index is a second database.** It can disagree with the first, and nothing detects
  the disagreement, because the two are never compared.
- **Core performs no outside I/O inside a transaction** ([core.md](../specs/core.md#constraints)).
  Capture resolving an asset reference through a port therefore has to happen *before* the
  transaction opens — which is exactly the shape the 2026-08-06 amendment moved every other
  precondition away from.
- A port is easier to substitute the less it knows. Filenames and media types are not facts about
  bytes.

---

## Considered options

1. **Grow `AssetStore` an enumeration** — `unreferenced(olderThan)` on the port, answered by the
   driver from its own index.
2. **Keep the split and reconcile** — both sides keep what they have, and a maintenance pass
   compares them.
3. **The `assets` table is pool state; the port narrows to a blob store keyed by hash.**

---

## Decision outcome

Chosen: **option 3.**

- An **asset** is a row in the pool: its id, the filename exactly as uploaded, its media type, the
  blob hash, the size, and when it was stored. `item_assets` gains a foreign key to it, so an
  asset an item still references cannot be deleted — the count is enforced by the schema rather
  than by the code that decrements it.
- The port becomes a **`BlobStore`**, keyed by hash and knowing nothing about names:
  `put`, `open`, `verify`, `delete`, `pathFor`.

Both refcounts are now SQL in one transaction, so the dangerous half of a release cannot half
happen. Two consequences fall out of the move rather than being chosen alongside it:

- **Capture resolves its asset references as a read inside the transaction**, like every other
  precondition, rather than as an `await` on a port before one opens.
- **`mirror.recordFor` can no longer fail.** It resolved each reference through the asset store
  and threw a non-retryable `asset-missing` when one was absent; it now reads rows in the same
  pool as the references, where a foreign key makes that absence impossible. The mirror writes no
  blobs at all — `assets/` is shared, written once by the blob store, and named by the record.

ADR 13's model is untouched: a named asset, a content-addressed blob, two levels of refcount,
filenames that round-trip. Only the boundary between what the pool holds and what the port does
moves, which is why this is a new ADR rather than an edit to 13.

### Consequences

- **Good** — the sweep has a subject it can name: assets no item references, stored before an
  instant. `unreferencedAssets` stops being a method nobody could implement.
- **Good** — one transaction covers both refcounts, and the foreign key refuses the double
  decrement outright instead of trusting the caller not to.
- **Good** — the port shrinks to bytes and a hash, which is what a substitute has to reimplement.
  Object storage, a different shard layout or a remote store is now a small thing to write.
- **Good** — one write path fewer can fail: a mirror record is projected from rows the same
  transaction could have read.
- **Bad** — the pool store grows a table and four queries, and the driver's schema knows about
  blob hashes it does not itself store. Accepted: it already knew about them, in `item_assets`.
- **Bad** — deleting a blob is outside the transaction that deleted its last asset, so a crash
  between the two leaks a file. That is space, and the reverse order loses bytes an asset still
  names; the sweep is idempotent and takes the leak next time round.
- **Neutral** — `storedAt` lives in the store rather than on `Asset`, the way `modified_at` does.
  It is operational, and [mirror.md](../specs/mirror.md) enumerates what a record carries.

---

## Pros and cons of the options

### Grow `AssetStore` an enumeration

- **Good** — no schema change, and the port keeps one coherent job.
- **Bad** — the driver has to maintain a name-to-hash index to answer it, which is the second
  database this ADR exists to avoid. Release still spans two stores, so double-decrement stays
  possible.
- **Bad** — capture's resolution stays outside the transaction, alone among preconditions.

### Keep the split and reconcile

- **Good** — nothing moves; the disagreement becomes visible instead of impossible.
- **Bad** — buys a periodic pass, an anomaly report and a decision about which side wins, to
  restore a property one foreign key gives for free.

---

## More information

Model and the naming problem it solves:
[ADR 13](0013-assets-are-named-references-to-content-addressed-blobs.md). Prior art on orphan
collection and the direction of the dangerous failure:
[asset-uploads.md](../research/asset-uploads.md). Spec:
[core.md](../specs/core.md); on-disk consequences: [mirror.md](../specs/mirror.md); the wire:
[http-v1.md](../specs/http-v1.md).

Revisit if a pool ever wants blobs somewhere the pool store cannot see transactionally — a remote
object store with its own lifecycle rules — where the sweep would have to become a reconciliation
against that store rather than a query. Nothing in scope wants that.
