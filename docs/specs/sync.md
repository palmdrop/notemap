# Spec: Sync and the client contract

**Status**: Stub — to be written properly in a dedicated grilling session
**Last updated**: 2026-08-11
**Shipped**:

---

## Outcome

A client that cannot reach core keeps capturing and processing, and replays its outbox on
reconnect: nothing duplicates, nothing silently resurrects, and a purge reaches every cached
copy.

---

## Scope

### In scope

- Delta reads: what a client asks for and what it gets back, including purges.
- Outbox replay: the operation vocabulary, idempotency, conflict resolution.
- Tombstone propagation and retention.
- The interaction between sync and a pool rebuilt from its mirror.

### Out of scope

- Any client implementation. The outbox belongs to the client host, not to core
  ([ADR 3](../adr/0003-clients-hold-an-outbox-pools-do-not-replicate.md)).
- Pool-to-pool replication — does not exist; one pool, satellite clients (ADR 3).

---

## Behavior

What is already settled, extracted from [core.md](core.md) and the ADRs. Everything else in
this spec is unwritten.

- **One pool; clients are satellites** holding an outbox of pending operations plus a cache of
  recent items, replayed on reconnect (ADR 3).
- Captures replay safely because they are immutable and id-addressed; submitting the same
  capture twice has no additional effect.
- Classification and archiving replay idempotently and order-independently; where two clients
  disagree, the later decision wins.
- **Routing is never replayed from a client queue.** It requires a reachable destination and is
  performed against the pool directly.
- A client can ask for everything that has changed since a point it names, including purges.
- **Delta reads are keyed on `modified_at`** (decided 2026-08-02): a server-assigned timestamp
  bumped by every change to an item — content and state alike, including classification,
  routing, archiving and deciding on a suggestion. It is distinct from `created_at` and
  `content_updated_at`, which order the feed and queue and record content time only
  ([core.md](core.md)). The store assigns it monotonically per pool
  ([ADR 1](../adr/0001-pool-is-a-database.md)), or a client can miss writes that commit out
  of order.
- Purge propagates as a minimal tombstone — `(id, purged_at)` and nothing else — which is
  itself removed after a retention window
  ([ADR 4](../adr/0004-purge-leaves-a-minimal-tombstone.md)).
- An in-place amendment of the head arriving from a client that could not know whether it
  still held the head is re-evaluated on arrival and demoted to a revision if it no longer
  does ([ADR 11](../adr/0011-in-place-amendment-of-the-head.md)).
- **A rebuilt pool carries a new identity, and that identity is readable** (decided 2026-08-11,
  [mirror.md](mirror.md)). A rebuild restarts the `modified_at` sequence from zero, and a delta
  cursor names that store-internal sequence, so an old cursor is not merely stale — it points
  somewhere entirely different and would be answered confidently and wrongly. Comparing the pool
  identity it cached is how a client detects this at all. What it does next is unwritten below.

---

## Constraints

- Core's only obligations are idempotent operations and client-generated ids; everything
  stateful about being offline lives in the client (ADR 3).

---

## Open questions

- [ ] 2026-08-02 — The clock behind last-write-wins: arrival time or client-supplied
      operation time, and what happens when a stale offline decision replays after a newer
      one made elsewhere.
- [ ] 2026-08-02 — "Idempotent and order-independent" versus last-write-wins: LWW requires an
      order, so the precise claim needs pinning down.
- [ ] 2026-08-11 — Rebuild interaction: what a client *does* once it detects a rebuild. Detection
      is settled — the pool identity changes and is readable — but not the response: a full
      resync of the cached window, a resync from scratch, or a prompt. A rebuilt pool has also
      lost its tombstones, so a client holding a copy of something purged before the rebuild will
      never be told it is gone, which is the case that needs an answer rather than a default.
- [ ] 2026-08-02 — Tombstone retention window, and what a client does when it has been offline
      longer than one. (Moved from core.md.)
- [ ] 2026-08-02 — The exact outbox operation vocabulary: which operations exist and replay.
- [ ] 2026-08-02 — Asset caching for the offline queue window — without it, voice memos are
      unprocessable offline (flagged in ADR 3).

---

## Acceptance criteria

To be written with the mechanism. Already implied by core.md: a client that had cached a
purged item learns it is gone on its next sync.
