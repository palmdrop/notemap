# 24. A refusal after a restart is settled from the pool, not rolled back

**Date**: 2026-08-25
**Status**: Accepted
**Deciders**: palmdrop

---

## Context and problem statement

An outbox operation is applied to the client's cache before it is sent, and the client keeps the
reversal for it in case the pool says no. The reversal is a closure: `archive` captures the item as
it was and puts that copy back, `capture` captures the id it drew and forgets it. That works
because the operation and its reversal are made in the same breath and live in the same map.

Now the outbox survives a restart. A client reads back operations it did not enqueue, and there is
no closure for them — a function cannot be written to a database. The cache read back beside them
already holds their effects, because it was persisted after they were applied. So when one of those
operations is refused, the client is holding a change the pool has just said it will not accept,
and nothing to undo it with.

What does the client do with a refusal it cannot reverse?

---

## Decision drivers

- A refusal is terminal without a person, and the cache is left holding something the pool never
  accepted. Leaving it there and saying nothing is the one outcome that is certainly wrong.
- A refusal is proof that the pool answered. Whatever the client does next may assume it is
  reachable, which is not true of the unreachable case and is what makes this tractable at all.
- The pool is authoritative. Every other settlement in the client replaces a guess with what the
  pool returned rather than reconstructing what the guess replaced.
- Whatever is chosen has to hold for every operation kind, including `capture`, whose "reversal" is
  the removal of an item that was never anywhere else.

---

## Considered options

1. **Persist a before-snapshot per operation** — write the affected item as it stood beside the
   operation, and restore it on a refusal.
2. **Declare an inverse per kind** — a data description of the reversal, reconstructed on load.
3. **Re-read the item from the pool** — ask what it is now and settle the cache from the answer.

---

## Decision outcome

Chosen: **re-read the item from the pool**. A refusal of an operation with no reversal to run
settles the item by asking `GET /v1/items/{id}` and folding the answer over whatever was drawn for
it. An item the pool does not have is forgotten, which is what a refused `capture` needs and what
its in-session reversal does anyway.

The refusal itself is reported exactly as it always was: the operation is recorded `refused`, it is
not retried, and it waits for a person to dismiss it.

This is not a worse rollback. It is a better one — it lands on what the pool actually holds rather
than on what this client guessed it held before it started guessing, so an item another device
changed in the meantime comes back correct rather than being reverted to a stale copy.

The re-read is safe precisely because the pool refused: a refusal means it answered. There is no
case where the client needs the re-read and cannot make it. A re-read that fails anyway — the
transport dying in the moment between the two requests — leaves the cache as it stands, which is
what an unreachable pool leaves in every other path, and the refusal is still reported.

### Consequences

- **Good** — one rule for every kind, and no per-kind reversal data to keep in step with the
  handlers.
- **Good** — nothing extra is persisted. The store holds the operation and the cache, and neither
  grows a shadow copy of the other.
- **Good** — the cache converges on the pool rather than on a client's memory of it.
- **Bad** — a refusal costs a round trip that an in-session refusal does not. Accepted: it happens
  only after a restart, only on a refusal, and the pool has just proved it is answering.
- **Bad** — the window between the refusal and the re-read is observable. A surface drawn in it
  shows the refused change. Accepted as a tick.
- **Neutral** — a rehydrated operation that *succeeds* needs no reversal either, and already runs
  the identity function where one is missing.

---

## Pros and cons of the options

### Persist a before-snapshot per operation

- **Good** — restores exactly what the in-session path restores, so the two behave identically.
- **Bad** — the snapshot is a copy of an item that the cache also holds, kept in step by hand and
  wrong the moment another operation settles that item.
- **Bad** — reverts to a copy that may be older than what the pool now holds, so a refusal can
  quietly undo a change made on another device.
- **Bad** — `capture` has no before-state, so the shape needs a hole in it.

### Declare an inverse per kind

- **Good** — data rather than a closure, so it survives a restart on its own terms.
- **Bad** — collapses into snapshots anyway. `edit`'s inverse is the payload it replaced, which is
  a before-state under another name.
- **Bad** — a second implementation of every handler's reversal, checked by nothing, and the failure
  mode is a silently wrong cache rather than a build error.

### Re-read the item from the pool

- **Good** — one rule, no new persisted state, and it converges on the authority.
- **Bad** — a round trip, and a window in which the cache is wrong.

---

## More information

Recorded with the durable store and hydration
([plan](../plans/durable-offline-client.md)), which is what created the situation this answers.

Specified in [client.md](../specs/client.md) under The outbox. It answers the client spec's open
question of 2026-08-17 about how a client reads its store back on start, whose second half — what
to do about reversals — is this.

Revisit if the outbox ever grows an operation that touches more than one item, since re-reading one
item would settle less than the operation changed.
