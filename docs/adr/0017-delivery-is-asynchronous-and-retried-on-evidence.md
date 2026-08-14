# 17. Delivery is asynchronous, and retried only on evidence

**Date**: 2026-08-13
**Status**: Accepted — amends the routing section of [core.md](../specs/core.md) and the routing
clause of [sync.md](../specs/sync.md)

---

## Context and problem statement

Routing was never written down as synchronous, but everything assumed it. `core.md` said "routing
requires the destination to be reachable and may fail" and "a failed delivery leaves no routing
record"; `sync.md` said routing "requires a reachable destination and is performed against the pool
directly". Under that model `route()` calls the adapter inline and answers either a routing record
or a refusal.

That works for the destination we were about to build first — a local filesystem — and fails for
almost every one after it. A WebDAV or Nextcloud vault is unreachable for ordinary reasons: the
laptop is on a train, the server is restarting, the VPN is down. Under a synchronous model the
person is told no and has to remember to come back.

So: what becomes of a person's decision to route when the destination is not there to receive it?

---

## Decision drivers

- **The filesystem destination is the first one, not the representative one.** Designing the
  routing model around the one destination that is never unreachable would be designing around the
  exception.
- **A rule never delivers on its own** ([core.md](../specs/core.md)). Whatever changes, the
  decision to route has to stay a person's.
- **The queue's job is to drain to zero** ([CONTEXT.md](../../CONTEXT.md)). An item that cannot
  leave the queue until a server comes back makes the queue a report on server uptime rather than
  on decisions.
- **Delivery is not idempotent, and the model cannot make it so.** A retry and a genuine second
  delivery are the same thing to the domain — both are one more routing record — so nothing
  downstream can tell them apart, and a duplicate lands silently in somebody's vault.
- **Core performs no I/O inside a transaction** ([core.md](../specs/core.md)), so the adapter call
  cannot be folded into the write that records it whatever else changes.

---

## Considered options

1. **Synchronous** — `route()` delivers inline; a failure leaves nothing behind.
2. **Always asynchronous** — `route()` records the decision and a job carries it out.
3. **One inline attempt, then queue** — deliver immediately, and fall back to a job only on
   evidence that nothing was delivered.

---

## Decision outcome

Chosen: **one inline attempt, then queue**.

`route()` mints a routing record as a **reservation** — a pending record — and attempts delivery
once, inline. What happens next is decided by what the adapter reported:

| Outcome | Reservation | Job |
|---|---|---|
| delivered | resolved, with the pointer | none |
| `rejected` | removed | none; abandoned at once |
| `unreachable` | left pending | enqueued, retried with backoff |

A local vault that is mounted therefore behaves exactly as it would have under the synchronous
model — delivered before `route()` returns, pointer and all — and only a destination that was
genuinely not reached becomes a job.

### Retry is keyed on evidence, not on failure

`DeliveryOutcome` already distinguished `unreachable` from `rejected`, and the distinction turns
out to be about evidence rather than severity:

- **`unreachable` is proof that nothing was delivered.** The destination was never reached, so a
  retry cannot duplicate. Retried with backoff.
- **`rejected` is proof that it was reached and refused.** It will refuse identically next time, so
  it is abandoned on the first attempt — the same call enrichment already makes for a failure a
  worker reports as not worth retrying.
- **An expired lease is no evidence at all.** A host that died mid-delivery reported nothing, and
  the bytes may or may not have landed. This is abandoned rather than retried, because the cost of
  guessing wrong is a duplicate nobody can detect, and the cost of not guessing is one manual
  check.

The three are distinguishable without a schema addition: a delivery job claimed with `attempt > 0`
and no recorded failure had a previous attempt that vanished.

Retries are **bounded**, unlike mirror work. `core.md`'s reason for retrying a mirror write forever
is that giving up does not change the fact that material is unmirrored. Giving up on a delivery
*does* change something — it hands the decision back, so the person can repair the configuration or
route somewhere else.

### An abandoned reservation is removed, and the item resurfaces

When a delivery is abandoned — or cancelled by hand — its routing record is deleted and the item
returns to the queue at its unchanged content time.

This looks like a second exception to the append-only rule that purge is supposed to be the only
one. It is not, and the framing matters: **the routing log is append-only; a reservation is not yet
in it.** A record joins the log when its delivery lands. Removing one that never delivered erases
no fact about the world, and it preserves the property `CONTEXT.md` actually claims for a routing
record — that it says where an item went.

The trace survives where traces live. Every failed attempt appends `delivery-failed` and the end of
the road appends `work-abandoned`, both to a log that carries no foreign key to items precisely so
that it outlives what it describes.

It also means "retry by hand" needs no operation. The record is gone, the item is back in the
queue, and routing it again *is* the retry.

### Failure surfaces on the list that already exists

`core.md` promised, when the abandoned surface was widened from enrichment to work, that "a third
job kind later adds no third list". Delivery is that third kind, and it lands on `work.abandoned`
beside failed mirror writes.

An unknown outcome is distinguished there by its `FailureDetail.code`, so a host can warn "this may
already be in your vault — check before routing again" before a re-route. Core does not enforce
that warning, on the same terms as the warning before purging a routed item: core exposes the
facts, and the confirmation ritual is the host's.

### Consequences

- **Good** — a destination that is briefly unreachable costs nothing. The decision is recorded, the
  queue drains, and delivery happens when it can.
- **Good** — the common case keeps synchronous feedback. A bad path, an undeclared capability or an
  unwritable directory is refused while the person is still looking at the item, rather than
  thirty seconds later on a surface they have to go and read.
- **Good** — no duplicate can be produced by machinery. Every automatic retry is backed by proof
  that nothing was delivered.
- **Bad** — `route()` blocks for one attempt against a slow-but-reachable destination. The host
  bounds it with the `AbortSignal` that `deliver` already takes.
- **Bad** — a host that crashes mid-delivery leaves an item needing a human check. Rare, and the
  honest answer to a question nobody can answer from the data.
- **Bad** — a routing record now has a lifecycle where it had none, and `route()` may answer a
  record that has not delivered yet. Clients must read the state rather than assuming a record
  means arrival.
- **Neutral** — routing still is not replayed from a client outbox. What changed is that delivery
  no longer requires reachability *at the moment of the decision*; it still happens against the
  pool and never from a client queue.

---

## Pros and cons of the options

### Synchronous

- **Good** — the simplest thing. A record means arrival, with no state to read.
- **Good** — the person learns the outcome immediately, always.
- **Bad** — a briefly unreachable destination turns a decision into a chore, and the item sits in
  the queue until the person repeats themselves.
- **Bad** — makes the queue reflect destination uptime rather than what has been decided.

### Always asynchronous

- **Good** — one code path, and `route()` never blocks.
- **Bad** — every mistake is found late. A typo'd path, an undeclared capability or a traversal
  attempt is discovered by a background job and reported on a surface, for an operation that is by
  definition interactive.
- **Bad** — would want a second port method to validate a target without delivering, which is two
  methods an adapter has to keep in agreement.

### One inline attempt, then queue

- **Good** — interactive feedback where it is possible, deferred retry where it is needed, and no
  new port method.
- **Bad** — two paths through `route()` rather than one, and the inline attempt makes the call's
  duration depend on a destination.

---

## More information

Decided in the grilling session of 2026-08-13, together with
[ADR 18](0018-a-jobs-subject-names-what-it-is-about.md), which the delivery job kind forced. The
model is written up in [core.md](../specs/core.md); the terms **delivery** and **routing record**
are in [CONTEXT.md](../../CONTEXT.md). Implemented by
[delivery-machinery.md](../plans/delivery-machinery.md).

Revisit if a destination appears whose delivery is genuinely idempotent and expensive to abandon —
a content-addressed store, or an API with an idempotency key. The evidence rule is deliberately
conservative for adapters that cannot promise anything; a capability able to promise more could
opt into retrying an unknown outcome without disturbing the rest of this.
