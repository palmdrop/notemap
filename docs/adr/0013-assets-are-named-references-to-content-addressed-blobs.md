# 13. An asset is a named reference to a content-addressed blob

**Date**: 2026-08-04
**Status**: Accepted — supersedes the asset-addressing decision in
[ADR 1](0001-pool-is-a-database.md); the rest of ADR 1 stands.

---

## Context and problem statement

[ADR 1](0001-pool-is-a-database.md) decided assets are addressed by path and named for a human,
on the argument that a hash filename is unusable and "becomes a lie the moment the file
changes". Deduplicating identical content was then added on top, which forced the question ADR 1
never faced: when the same bytes arrive twice under two different filenames, which name wins?
A user who uploads a file expects to get that filename back on download. How can content be
stored once while every upload keeps the name it came with?

---

## Decision drivers

- **A filename is user data.** It carries intent — `interview-with-mum.opus` is not
  `audio.opus` — and a download that returns the wrong one has lost something the user gave us.
- Deduplication is worth keeping: a revision that does not touch its audio references the same
  bytes, and the same image genuinely does arrive twice.
- Research into prior art ([asset-uploads.md](../research/asset-uploads.md)) found **no
  surveyed system names content-addressed data for a human** — git, restic, Perkeep, IPFS and
  Nix all keep names one layer above the content key. The "which name wins" problem is
  self-inflicted by combining the two.
- Dedup by hardlink would keep both properties, but `pool-mirror/` is explicitly allowed to
  live inside a synced folder ([ADR 1](0001-pool-is-a-database.md)) and sync clients routinely
  break hardlinks.
- The mirror's promise is that the data is *there and findable* without notemap, not that it is
  arranged the way it arrived.

---

## Considered options

1. **Human-named files, dedup on hash, first name wins** — ADR 1 as amended 2026-08-03.
2. **Human-named files, dedup by hardlink** — two names, one inode.
3. **Two entities: a named asset referencing a content-addressed blob.**

---

## Decision outcome

Chosen: **option 3.**

- An **asset** is a named reference: an id, the filename exactly as uploaded, its media type,
  and the blob it points at. Storing bytes always produces a new asset carrying the caller's
  filename, whether or not those bytes already exist.
- A **blob** is the content itself, addressed by its SHA-256 and stored once. On disk it is
  named for a machine and sharded by hash prefix.

Two uploads of identical bytes under different names therefore produce **two assets and one
blob**, and each download returns the filename it was given. The "which name wins" question
stops existing rather than being answered.

ADR 1's objection — that a hash filename becomes a lie the moment the file changes — was correct
about *assets*, and the split is precisely what makes it not apply to blobs. A blob is immutable
by definition: if the bytes change it is a different blob, so its name can never become a lie.
What ADR 1 called drift is now detected as a blob whose content no longer hashes to its own
name.

Reference counting runs at two levels: **a blob is freed when its last asset goes, an asset when
its last item goes.** The second level is load-bearing, not theoretical, because a revision that
leaves its media untouched references the same asset as the item it revises.

A reference is taken **when the referencing capture commits, not when bytes are stored**. Storing
mints an asset with no references; the reference is part of the same atomic command that appends
the capture ([ADR 1](0001-pool-is-a-database.md)). A crash between the two therefore leaks an
unreferenced asset — wasted space — rather than a phantom reference that keeps content alive
forever. Unreferenced assets are swept after a grace window, long enough that "stored a moment
ago" is never mistaken for "abandoned", following `git gc`'s reasoning for `gc.pruneExpire`.

### Consequences

- **Good** — filenames survive exactly as uploaded; content is stored once; the naming collision
  the previous design created disappears; drift detection gets stronger, since a blob's own name
  is its expected hash.
- **Bad** — `assets/` stops being a browsable folder of named files. After notemap is gone, a
  human finds `assets/ab/cd12…` and must read the mirror's text to learn what it was called.
  **Accepted 2026-08-04**: the mirror's job is that the data is there and findable, not that it
  keeps its original shape. The mirror records each asset's filename beside its blob reference,
  so nothing is lost — only convenience.
- **Bad** — ADR 1's `assets/YYYY/MM/DD/` layout does not survive. The same bytes have no single
  date, so blobs shard by hash prefix instead.
- **Neutral** — two reference counts instead of one. Both are simple; neither can cycle, since
  items reference assets and assets reference blobs, and nothing points back.

---

## Pros and cons of the options

### Human-named files, first name wins

- **Good** — `assets/` stays browsable; no second entity.
- **Bad** — silently discards a filename the user supplied, which is the thing this ADR exists
  to stop. No prior art to lean on, because no surveyed system has the problem.

### Dedup by hardlink

- **Good** — keeps human names *and* single storage, with no model change at all.
- **Bad** — hardlinks do not survive most file sync clients, and `pool-mirror/` is explicitly
  allowed inside a synced folder. Also filesystem-specific, which the asset-store port exists to
  avoid.

---

## More information

Prior art and the failure modes surveyed: [asset-uploads.md](../research/asset-uploads.md).
Spec: [core.md](../specs/core.md); on-disk consequences: [mirror.md](../specs/mirror.md).

Revisit if the mirror's assets directory being unreadable turns out to matter in practice — the
escape hatch is a generated index, or human-named symlinks alongside the blobs, neither of which
changes the model above.
