# Delivery machinery

**Date**: 2026-08-13
**Status**: Done
**Spec**: `docs/specs/core.md`, `docs/specs/mirror.md`
**Closed**: 2026-08-14

---

## Goal

A person routes an item to a destination and the right thing happens to it: a reachable destination
delivers immediately and answers a pointer, a refusing one is abandoned on the first attempt, an
unreachable one is retried until it works or is given up on, and a delivery that is abandoned or
cancelled returns the item to the queue. Built and proved against a destination that fails on
command; no real adapter is wired.

**Out of this slice, deliberately**: `packages/adapters/destination-fs`, daemon configuration and
the `/v1` routing routes — all [destination-fs.md](destination-fs.md). This plan ends with core and
the store correct and the behaviour provable, reachable from no host.

---

## Decisions

Taken 2026-08-13 in the grilling session and recorded as
[ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md). What that ADR settles,
in the order the code needs it:

1. A routing record is minted as a **reservation** when the decision is made, and one delivery is
   attempted **inline**. Delivered resolves it; `rejected` removes it and refuses; `unreachable`
   leaves it pending and enqueues a job.
2. Retry is keyed on **evidence**. `unreachable` proves nothing was delivered, so retry.
   `rejected` proves refusal, so abandon at once. An expired lease with no reported outcome is no
   evidence, so abandon rather than guess — a delivery is not idempotent and a duplicate is
   undetectable.
3. Retries are **bounded**, unlike mirror work, because giving up hands the decision back.
4. An abandoned or cancelled reservation is **removed** and the item resurfaces. The routing log is
   append-only; a reservation is not in it yet.
5. A delivery carries **everything durable about the item**, in a type of its own rather than the
   mirror record, with assets resolved and openable lazily.

### Why a fake destination rather than the real one

The three outcomes this plan exists to get right are `unreachable`, `rejected` and a host dying
mid-delivery. A local filesystem is never unreachable and rarely refuses, so the real adapter would
exercise one path of three. A destination that fails on command exercises all of them, and keeps
this plan honest about being core work.

---

## Tasks

### Phase 0 — Branch

- [x] `git checkout -b agent/delivery-machinery` — 2026-08-14

### Phase 1 — Types *(no behaviour)*

- [x] `JobSubject` gains its `routing-record` variant, and `JobKind` gains `delivery`. This is the
      second variant [job-subject-union.md](job-subject-union.md) deliberately left unbuilt —
      2026-08-14
- [x] `RoutingRecord` gains its state — pending or delivered — beside the pointer it already has.
      The mirror record carries the delivered ones only, which the projection now enforces —
      2026-08-14
- [x] `Delivery` becomes the rich type: payload, tags with attribution, capture and content times,
      source, artifacts, and `DeliveredAsset[]` — each `{ slot, asset, open(signal?) }`, sorted by
      slot. It is **not** `MirrorRecord`, for the reason `core.md` now gives — 2026-08-14
- [x] `RoutingApi` gains `cancelDelivery`; `DeliveryRefusal` gains whatever cancelling and a
      not-pending record need — 2026-08-14
- [x] Verify: `pnpm typecheck` — 2026-08-14

### Phase 2 — The store *(depends on phase 1)*

- [x] Migration: the `jobs` kind CHECK admits `delivery` and its subject kind admits
      `routing-record`; `routing_records.state` already admitted `pending` — 2026-08-14
- [x] A delivery job's subject is a routing record. The **coalescing index must not reach it** —
      `jobs_one_pending_mirror` is about mirror kinds and stays that way, and two pending deliveries
      of one item are two legitimate jobs — 2026-08-14
- [x] Resolve a reservation to delivered with its pointer; remove one — 2026-08-14
- [x] `abandonedWork` names the item for a delivery job — **resolved when the job is enqueued
      rather than joined at read time**, because abandoning a delivery removes the record a join
      would need. See the report; ADR 18 says "join" — 2026-08-14
- [x] Tests: a pending record keeps its item out of the queue; removing one puts it back; two
      pending deliveries of one item coexist; the abandoned surface names the item for a delivery
      job whose subject is a record — 2026-08-14
- [x] Verify: `pnpm typecheck && pnpm test && pnpm lint` — 2026-08-14
- [x] `git commit` — 2026-08-14

### Phase 3 — A destination that fails on command *(depends on phase 1)*

- [x] A test double implementing `DestinationAdapter`: declares capabilities, records what it was
      handed, and is told what to answer — delivered, `unreachable`, `rejected`, or to hang so a
      lease can expire under it. It lives in core's `testing/`, reached as `@notemap/core/testing`
      — the fallback — 2026-08-14
- [x] It asserts what `core.md` promises about a delivery: that every referenced asset arrives with
      its filename, that opening one yields the bytes, and that a capability wanting no assets
      causes no stream to be opened. The double reads or does not read on command; the assertions
      are in `tests/integration/src/routing.test.ts` — 2026-08-14
- [x] Verify: `pnpm typecheck && pnpm lint` — 2026-08-14

### Phase 4 — `route` *(depends on phases 2 and 3)*

- [x] `routing.destinations`, mapping `describe()` over the wired adapters. **Duplicate
      `DestinationId` throws at pool construction** — two destinations answering one name is a
      wiring mistake with no sensible resolution — 2026-08-14
- [x] Validation before anything is written: unknown destination, undeclared capability, unaccepted
      payload type, and a target failing its `targetSchema` through the `schemas` port —
      2026-08-14
- [x] Project the `Delivery`: read the item, its artifacts and its tags, resolve every asset
      reference to an `Asset`, and close each opener over `ports.blobs.open`. Outside any
      transaction — this is I/O, and the store holds a write lock for a transaction's duration —
      2026-08-14
- [x] Mint the reservation, attempt once inline, and resolve per ADR 17's table. The write that
      records the outcome re-reads the item inside its transaction: an item purged mid-delivery
      appends the `routed` action, writes no record, and refuses as purged — 2026-08-14
- [x] A delivered record enqueues a mirror job; a reservation does not, per `mirror.md` —
      2026-08-14
- [x] `cancelDelivery`: remove a pending reservation and its job, resurfacing the item. A record
      that already delivered is refused, and so is one whose job somebody holds — the fallback —
      2026-08-14
- [x] Tests: each of the four outcomes end to end; the purge race; a capability accepting a payload
      type the item does not have; a target the schema rejects; cancelling a delivered record —
      2026-08-14
- [x] Verify: `pnpm typecheck && pnpm test && pnpm lint` — 2026-08-14
- [x] `git commit` — 2026-08-14

### Phase 5 — Retry and abandonment *(depends on phase 4)*

- [x] `work.complete` resolves a delivery job: succeeded resolves the reservation and enqueues the
      mirror job; `failed` with `retryable` backs off; `failed` without abandons. `WorkOutcome`
      gained a `delivered` variant so the pointer a deferred delivery answers has somewhere to go
      — 2026-08-14
- [x] The evidence rule at claim time — **keyed on the expired lease still on the row** rather than
      on `attempt > 0` with no recorded failure, which cannot see a crash on the first attempt and
      cannot tell a crashed retry from a reported one. See the report; ADR 17 says the other thing
      — 2026-08-14
- [x] Abandonment removes the reservation, resurfaces the item, and appends `work-abandoned`
      subject to the **item**, resolved from the record — 2026-08-14
- [x] Bounded by `RetryPolicy.maxAttempts`, unlike mirror work. The comment on `RetryPolicy` says
      the bound is enrichment's alone and must stop saying that — 2026-08-14
- [x] Tests: a destination unreachable twice and then up delivers, with one record and one item out
      of the queue; one unreachable forever is abandoned at the limit and the item comes back; a
      lease expiring with nothing reported abandons on the next claim rather than retrying, hands
      the destination nothing a second time, and is distinguishable on the surface from a refusal
      — 2026-08-14
- [x] Verify: `pnpm typecheck && pnpm test && pnpm lint` — 2026-08-14
- [x] `git commit` — 2026-08-14

### Phase 6 — End to end *(depends on phase 5)*

- [x] Integration tests: route to a destination that is down, watch the item stay out of the queue,
      bring it up, drain, and find the record delivered and the mirror carrying it. Then the same
      with a destination that never comes up, and find the item back in the queue and a row on the
      abandoned surface — 2026-08-14
- [x] A pool rebuilt while a delivery was pending holds no record of it and rebuilds the item
      unprocessed — the consequence `mirror.md` now states. Rebuild is not built, so this is proved
      where it is decided: the record on disk carries no pending delivery — 2026-08-14
- [x] Verify: `pnpm typecheck && pnpm test && pnpm lint` from a clean checkout — 2026-08-14
- [x] `git commit` — 2026-08-14

---

## Unknowns

- **Where the fake destination lives.** Adapter fixtures have lived beside their package, and this
  one belongs to no package. *Fallback*: core's test scope, exported for `tests/integration` the way
  `mirror/arbitraries.ts` already is.
- **Whether an inline attempt wants a timeout core imposes.** The host bounds it with an
  `AbortSignal`, but a host that passes none blocks forever on a hanging adapter. *Fallback*: leave
  it the host's and say so; a default timeout is interface policy and core is a primitive API.
- **Whether `route` answers a refusal or an outcome for `rejected`.** It is a refusal by the
  signature, but the delivery genuinely was attempted, which a refusal reads as not having been.
  *Fallback*: refuse, carrying the destination's detail — `AttemptFailure` is already part of
  `DeliveryRefusal`.
- **Whether cancelling races its own job.** A cancel arriving while the job is leased and mid-write
  is the same unknown-outcome problem in miniature. *Fallback*: refuse the cancel while a lease is
  held; the person waits out one attempt.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The properties worth testing hardest, because each fails silently:

- **No duplicate is ever produced by machinery.** Every automatic retry must be backed by a
  reported `unreachable`. The test that matters simulates a crash — lease expiry with no
  outcome — and asserts nothing is retried.
- **An abandoned delivery returns the item.** The queue is the thing a person works; material that
  silently stops being in it and never arrives anywhere is the worst outcome in this plan.
- **A reservation is never mirrored.** A rebuild that restored a pending delivery would restore a
  promise nothing will keep.
- **Assets reach the adapter whole.** Filename and bytes, over content that is not valid UTF-8, for
  a capture with more than one asset.

---

## Notes

Implemented 2026-08-14. Three things landed differently from what is written above, each noted on
the task and argued in full where the decision lives:

- **The abandoned surface's item is resolved when a job is enqueued, not joined when it is read**
  ([ADR 18](../adr/0018-a-jobs-subject-names-what-it-is-about.md), amended). A join cannot survive
  the removal of the reservation it would join to.
- **The evidence for a vanished attempt is the expired lease on the row**, not `attempt > 0` with no
  recorded failure ([ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md),
  amended). The stated discriminator cannot see a crash on the first attempt.
- **A routing record remembers what the delivery targeted.** Nothing else could carry out a delivery
  that was deferred; `CONTEXT.md` and `core.md`'s routing section say so now.

Original notes:

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`.
**Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what
landed and linking back to this plan. No implementation details, no granular tasks. A plan marked
Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
