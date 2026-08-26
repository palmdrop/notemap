# Spec: Sync and the client contract

**Status**: Stub — to be written properly in a dedicated grilling session
**Last updated**: 2026-08-26
**Shipped**:

- 2026-08-26 — **Half the rebuild question is answered: what a client drops.** A client caches the
  pool identity `/v1/health` reports, compares it on start, and on finding another pool drops the
  items it cached and the surfaces drawn from them while keeping the outbox, which replays
  idempotently into whichever pool receives it. What it should *resync* is untouched and still needs
  a delta wire. ([plan](../plans/durable-offline-client.md),
  [ADR 23](../adr/0023-a-changed-pool-identity-drops-the-cache-and-keeps-the-outbox.md))

- 2026-08-24 — **Being revised is a change a delta reports.** The item a revision was made from is
  touched when the revision is written, so a client reading deltas learns that it left the queue
  rather than going on showing it as work. ([plan](../plans/editable-until-processed.md),
  [ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md))

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
- **Routing is never replayed from a client queue.** It is performed against the pool directly.
  *Amended 2026-08-13*: it no longer requires a reachable destination — a decision made against an
  unreachable one is recorded and delivered later
  ([ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)). What has not changed
  is that the decision must reach the pool, so a client that cannot reach core cannot route; the
  outbox carries captures and classification, never deliveries.
- A client can ask for everything that has changed since a point it names, including purges.
- **Delta reads are keyed on `modified_at`** (decided 2026-08-02): a server-assigned timestamp
  bumped by every change to an item — content and state alike, including classification,
  routing, archiving and deciding on a suggestion. It is distinct from `created_at` and
  `content_updated_at` — the first orders the feed and the queue, and the second records content
  time only and orders nothing ([core.md](core.md)). The store assigns it monotonically per pool
  ([ADR 1](../adr/0001-pool-is-a-database.md)), or a client can miss writes that commit out
  of order.
- Purge propagates as a minimal tombstone — `(id, purged_at)` and nothing else — which is
  itself removed after a retention window
  ([ADR 4](../adr/0004-purge-leaves-a-minimal-tombstone.md)).
- An in-place amendment arriving from a client that could not know whether the item had been
  processed since is re-evaluated on arrival and recorded as a revision if it has been
  ([ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md)). Being revised moves the
  `modified_at` of the item it was made from as well, which is what keeps a delta reader from
  showing work that has left the queue.
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

- [x] 2026-08-02 — The clock behind last-write-wins: arrival time or client-supplied
      operation time, and what happens when a stale offline decision replays after a newer
      one made elsewhere. **The clock is decided (2026-08-17): client operation-time**, stamped
      when the person acted, so an offline decision is not clobbered merely for syncing late
      ([client.md](client.md#the-outbox)). What stays open here is the **wire** that carries the
      stamp and how the pool applies it — a stale offline decision loses to a newer one by its
      own earlier stamp, but the delta/replay surface that expresses this is unbuilt.
- [ ] 2026-08-02 — "Idempotent and order-independent" versus last-write-wins: LWW requires an
      order, so the precise claim needs pinning down.
- [ ] 2026-08-11 — Rebuild interaction: what a client *does* once it detects a rebuild. **Half
      answered 2026-08-26** ([ADR 23](../adr/0023-a-changed-pool-identity-drops-the-cache-and-keeps-the-outbox.md)):
      what it **drops** is settled — the cached items and the surfaces drawn from them go, the
      outbox stays, and the change is reported. That is the half that answers the tombstone case,
      since an item purged before the rebuild can no longer be shown by a client that is no longer
      holding it. What it **resyncs** is still open — a resync of the cached window, a resync from
      scratch, or nothing until a surface reads — and stays open, because there is no delta wire to
      ask and no cursor that would survive the rebuild anyway.
- [ ] 2026-08-02 — Tombstone retention window, and what a client does when it has been offline
      longer than one. (Moved from core.md.)
- [ ] 2026-08-02 — The exact outbox operation vocabulary: which operations exist and replay.
- [ ] 2026-08-02 — Asset caching for the offline queue window — without it, voice memos are
      unprocessable offline (flagged in ADR 3).

---

## Acceptance criteria

To be written with the mechanism. Already implied by core.md: a client that had cached a
purged item learns it is gone on its next sync.
