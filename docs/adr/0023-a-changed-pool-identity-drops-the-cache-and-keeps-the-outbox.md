# 23. A changed pool identity drops the cache and keeps the outbox

**Date**: 2026-08-26
**Status**: Accepted
**Deciders**: palmdrop

---

## Context and problem statement

A client caches items so it can draw its surfaces with the pool out of reach. It now also caches the
**pool identity** those items came from, which `GET /v1/health` answers and which a rebuilt pool
mints afresh ([mirror.md](../specs/mirror.md)).

So a client can find that the pool answering is not the pool it cached. Two things cause it: the
pool was rebuilt from its mirror, or the shell was pointed at a different daemon. Both leave the
client holding a description of somewhere else.

The cache is not merely stale. A rebuild restarts the store-internal sequence a delta read is keyed
on ([sync.md](../specs/sync.md)), and it has **lost its tombstones** — so an item purged before the
rebuild would never be reported gone, and a client holding a copy of it would go on showing it
forever with nothing that could ever contradict it.

The outbox is in the same store and is not the same kind of thing. What does the client do with
each?

---

## Decision drivers

- What the cache holds may be unfalsifiable. There is no read that can tell the client an item it
  holds is gone, because the thing that would have said so was destroyed with the old pool.
- The outbox is the person's own un-landed work. Dropping it destroys something no other copy of
  exists; the cache costs a re-read.
- Every operation is idempotent under an id the client minted, so replaying the outbox into a
  rebuilt pool is safe in the way replaying it into the same pool is safe.
- The client cannot ask what changed. There is no delta surface in `/v1` yet, and there would be
  nothing to ask it from: the cursor it would have named describes a sequence that no longer exists.
- Whatever is chosen has to be automatic. A rebuild is rare, and a prompt about it would arrive
  when the person is doing something else and would mean nothing to them.

---

## Considered options

1. **Drop everything, cache and outbox** — treat the store as belonging to the old pool entirely.
2. **Keep everything and reconcile** — go on drawing from the cache and let ordinary reads correct
   it.
3. **Drop the cache, keep the outbox** — the store's copy of pool state goes; the person's un-landed
   work stays.

---

## Decision outcome

Chosen: **drop the cache, keep the outbox**. On finding that `/v1/health` names a pool other than
the one the store holds, the client empties its cached items and returns both surfaces to being its
own, keeps the outbox exactly as it is, and records the new identity. It reports the change through
`onError`, the same seam a collection it could not read goes through, so a shell may say something
and is not obliged to.

The surfaces come back as soon as anything reads the pool, which is the ordinary path and needs no
special case: a cache-drawn surface is what a client with nothing cached already draws.

Nothing is resynced. What a client should *fetch* after a rebuild is [sync.md](../specs/sync.md)'s
and needs a wire that does not exist. This settles only the half that can be settled without one —
that a client detects the change and stops asserting what it can no longer verify.

### Consequences

- **Good** — no item is ever shown that the pool has no way of contradicting. The unfalsifiable
  case is removed rather than made less likely.
- **Good** — nothing the person did is lost. The outbox replays into the new pool under the ids it
  already minted, which is the same replay it would have made into the old one.
- **Good** — the response is one rule with no configuration and no prompt.
- **Bad** — a client that was reading offline loses what it was reading, at the moment a rebuild
  happens to complete. Accepted: a rebuild is a recovery from having lost the pool, and the
  surfaces refill from the first read.
- **Bad** — the outbox may carry an operation about an item the rebuilt pool does not have, which
  is refused and shown as a refusal. Correct, and better than silence: the person is the only one
  who can decide what to do about it.
- **Neutral** — the tags in use and the destinations are kept. They are re-read whole the next time
  anything asks, and neither can assert the existence of something that was purged.

---

## Pros and cons of the options

### Drop everything, cache and outbox

- **Good** — one rule, no reasoning about which half survives, and no operation ever lands in a
  pool it was not made against.
- **Bad** — destroys work that exists nowhere else, to avoid a problem the outbox does not have.
  An operation is idempotent under a client-minted id whichever pool receives it.

### Keep everything and reconcile

- **Good** — nothing is lost and the surfaces do not blink.
- **Bad** — there is no read that reconciles a purge. The tombstone is gone, so the item is
  cached forever and nothing will ever say otherwise.
- **Bad** — leaves the client asserting things about a pool it has never spoken to.

### Drop the cache, keep the outbox

- **Good** — each half is treated as what it is: a copy, and an original.
- **Bad** — two rules rather than one, and a surface that empties under the reader.

---

## More information

Recorded with the reachability probe that first reads `/v1/health`
([plan](../plans/durable-offline-client.md)), which is what made the comparison possible.

This answers half of [sync.md](../specs/sync.md)'s rebuild question, open since 2026-08-11:
detection was already settled, and what the client *drops* is settled here. What it **resyncs** is
still open and stays open, since it needs a delta wire.

Revisit when that wire exists: a client that can ask for everything since a point could refill the
window it dropped rather than waiting for a read, and could then afford to keep drawing the old
cache until the new one arrives.
