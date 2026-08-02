# 4. Purge leaves a minimal tombstone

**Date**: 2026-08-01
**Status**: Accepted

---

## Context and problem statement

[pool-and-routing.md](../exploration/vision/pool-and-routing.md#hard-delete-the-one-exception) states
"No tombstone: that is what the user asked for." That was written before anything outside the
pool held a copy. Clients now cache items ([ADR 3](0003-clients-hold-an-outbox-pools-do-not-replicate.md)),
and delta sync reports *changes since a cursor* — a deleted row produces no change. How does a
purge reach a client that already has the item?

---

## Decision outcome

**Purge retains a minimal tombstone: `(id, purged_at)` and nothing else.** No content, no
title, no metadata. Clients see it on their next sync and drop their cached copy. The
tombstone is itself garbage-collected after a retention window; a client offline longer than
that must resync from scratch.

Everything else about the purge is unchanged: the item, its whole revision chain, its
enrichment, its routing records, its mirror files and its asset are deleted outright, and
material already delivered to a destination is untouched with the user warned at purge time.

This supersedes the "no tombstone" line in
[pool-and-routing.md](../exploration/vision/pool-and-routing.md#hard-delete-the-one-exception).

### Consequences

- **Good** — "delete" actually deletes, everywhere, which is the only acceptable property for
  the feature to have.
- **Bad** — an opaque uuid and a timestamp survive for the retention window. They reveal that
  *something* existed and was destroyed, never what.
- **Neutral** — the retention window becomes a real setting with a real failure mode: a device
  left offline past it needs a full resync.

---

## Considered options

- **No tombstone, reconcile id sets.** Zero residue; each sync compares id-set checksums over
  the client's cached window. Rejected as machinery disproportionate to the residue it avoids,
  but it remains the right answer if the residue ever matters.
- **Purge per device.** No propagation at all. Rejected: "deleted" that silently isn't is the
  worst property a delete can have.
