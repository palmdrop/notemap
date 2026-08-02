# 3. Clients hold an outbox; pools do not replicate

**Date**: 2026-08-01
**Status**: Accepted

---

## Context and problem statement

Capture must work on a flight and sync when connectivity returns — whether the client is a
notemap app or Memos. Does every client own a pool that replicates, or is there one pool with
satellite clients?

---

## Decision drivers

- Offline capture is a hard requirement, stated as a product constraint, not a nicety.
- Captures are immutable records with client-generated UUIDv7 ids, so uploading one twice is a
  no-op. Capture sync needs no merge at all.
- Processing (classify, archive) mutates existing items and is where devices could disagree.
- Dead time on a plane is precisely when the processing ritual would happen, so restricting
  offline use to capture alone would cost the most valuable case.

---

## Decision outcome

**One pool. Clients are satellites.** A client that cannot reach core holds an **outbox** of
pending operations plus a cache of recent items, and replays the outbox on reconnect.

Captures replay safely because they are immutable and id-addressed. Classification and
archiving replay safely because they are idempotent and order-independent; conflicting
decisions resolve last-write-wins, which is adequate for a single user. Routing is excluded
from the outbox — it needs the destination to be reachable, so it is inherently an online act.

The real axis is **reachability, not connectivity**, and there are three independent ones:
can the host reach core, can core reach a provider, can core reach a destination. Only the
first produces an outbox; the other two are already absorbed by queued enrichment and
retryable routing.

Consequently **the outbox belongs to the client host, not to core** ([ADR 2](0002-core-is-a-host-agnostic-library.md)).
Core's only obligation is that operations are idempotent and accept client-generated ids.

A host that *embeds* core needs no outbox and works fully offline — but this applies to a
desktop or plugin host that **owns** the pool. A phone is always a client of a remote core,
not because it is mobile, but because it is a satellite of a pool that lives elsewhere.

Every intake path must carry a stable `(source, source_id)` so that re-polling a source cannot
duplicate a capture, and capture time always comes from the source, never from arrival.
The pre-notemap Memos sync script did both by hand, keying on the memo's own id and its
server-side timestamp; here they become properties of the capture envelope instead.

### Consequences

- **Good** — no distributed system, no CRDTs, no merge of revision chains, no "which pool is
  authoritative".
- **Bad** — assets for the queue window must be cached on the client, or voice memos are
  unprocessable offline.
- **Neutral** — an embedded-core phone app is ruled out for as long as one pool is the rule.

---

## More information

Model: [../exploration/vision/pool-and-routing.md](../exploration/vision/pool-and-routing.md).
Revisit if multiple pools per user ever land — the open question in
[pool-and-routing.md](../exploration/vision/pool-and-routing.md#deliberately-open).
