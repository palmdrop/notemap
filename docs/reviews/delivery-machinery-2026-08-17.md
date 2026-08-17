# Review: Delivery machinery

**Date**: 2026-08-17
**Status**: Open
**Scope**: `agent/delivery-machinery` — `packages/core/src/pool/routing/`, `packages/core/src/pool/work.ts`, `packages/core/src/testing/`, `packages/adapters/store-sqlite/`, `tests/integration/src/{routing,delivery}.test.ts`
**Plan**: `docs/plans/delivery-machinery.md`
**Spec**: `docs/specs/core.md`, `docs/specs/mirror.md`

---

## Overall

The plan is delivered as written. All six phases are real, the four outcomes are each proved end to
end, and the two properties that fail silently — no duplicate from machinery, an abandoned delivery
returns the item — are tested where they are decided rather than where they are convenient. Both
listed specs carry a dated `Shipped:` entry, and the three divergences from ADR 17 and ADR 18 are
amended in place rather than retrofitted. `pnpm typecheck && pnpm test && pnpm lint` are clean:
128 integration tests, 169 daemon tests, no lint findings.

The one real hole is the mirror image of the property the plan exists for. The deferred path
handles an attempt whose outcome nobody knows — expired lease, unknown-outcome code, abandoned row,
a person warned. The **inline** path has no equivalent: if the adapter throws, or the caller's
`AbortSignal` fires, `route` propagates the exception with nothing written anywhere. `core.md` tells
hosts to bound the attempt with exactly that signal, so this is the ordinary path against a slow
destination, not an exotic one. Finding 1.

The rest is contract tidying: an outcome field nothing reads, two names and two counters for one
sequence of attempts, and a timestamp whose meaning stopped being obvious the moment a delivery
could land later than it was decided.

---

## Bugs

### 1. An inline attempt that throws leaves no trace at all

`packages/core/src/pool/routing/route.ts:89` — the adapter call is unguarded:

```ts
const outcome = await wired.adapter.deliver(delivery, signal);

return ports.store.transaction(async (tx) => { ... });
```

A `deliver` that rejects — an adapter bug, a network stack throwing rather than answering
`unreachable`, or the `AbortSignal` the caller was told to pass firing on a slow-but-reachable
destination — skips the transaction entirely.

```
adapter throws → no routing record → no action-log entry → item still in the queue
              → person re-routes → the destination may now hold it twice
```

This is the same unknown-outcome case the whole plan is built around, and it is the one place where
nothing records it. The deferred path answers it properly (`work.ts:229` `abandonUnknown`, code
`delivery-outcome-unknown`, a row on the abandoned surface); the inline path answers it not at all.
It is also worse than the deferred one, because the item never left the queue, so re-routing is the
natural next thing a person does.

`core.md:433` — "the caller bounds it with the `AbortSignal` that reaches the adapter" — makes
aborting the documented way to bound the call, which makes this the documented way to lose a
delivery.

The fake destination already has the `hang` answer built for this (`testing/destination.ts:27`,
`:120`) and no test uses it — `grep` finds `"hang"` nowhere outside its own definition. Phase 3
lists "or to hang so a lease can expire under it" as done; what was built is the capability, not a
test that exercises it.

Fix: wrap the attempt, and treat a throw as evidence of nothing — which it is not. It has to land
where an expired lease lands: a reservation held or removed with `DELIVERY_FAILURE.unknown` against
it, so the person is told the bytes may have arrived, rather than an exception with no state behind
it. Then use `hang` to prove it.

---

## Design

### 2. One sequence of failed attempts has two names and two counters

`route.ts:150` appends `delivery-failed` with `attempt: 1` for the inline attempt. `work.ts:204`
appends `work-failed` with `attempt: held.job.attempt + 1` — and the job is enqueued at `attempt: 0`
(`route.ts:204`), so the job's first failure is **also** attempt 1. An item routed to a destination
that stays down reads:

```
captured, delivery-failed(1), work-failed(1), work-failed(2), work-failed(3), work-failed(4), work-abandoned(5)
```

Two entries claim attempt 1, and the same event — this destination did not answer — is spelled two
ways depending on which side of the queue it happened on. `delivery.test.ts:134` asserts the kind
sequence only for the case where the job succeeds first time, so nothing catches it.

ADR 17:112 states the intended shape plainly — "Every failed attempt appends `delivery-failed` and
the end of the road appends `work-abandoned`" — and this is a divergence from it that the plan's
Notes section does not list among the three it does.

Relatedly, `AbandonedWork.attempts` is 5 after six attempts were made
(`delivery.test.ts:147` acknowledges this in a comment). Defensible — the surface reports the job —
but it means the number a person reads is not the number of times a destination was handed their
material, which for a non-idempotent operation is the number that matters.

Either the deferred failures should append `delivery-failed` and count from the inline attempt, or
ADR 17 should be amended to say the inline attempt is a different kind of event with its own
counter. The former matches what a person reading an item's history wants.

### 3. `DeliveryOutcome.delivered.at` is required of every adapter and read by nothing

`packages/core/src/types/domain/routing.ts:69` — an adapter must supply `at: Timestamp`, and no
code path consumes it. `route.ts:176` builds the delivered record from `record.at`; `work.ts:158`
uses `ports.clock.now()`; `asDeliveryWorkOutcome` (`delivery.ts:27`) drops it, and
`WorkOutcome.delivered` has no field for it. The type predates this branch, but this branch is the
first thing to consume `DeliveryOutcome`, so it is the first chance to find out the field means
nothing.

A required field an adapter author must invent and nothing reads is a contract that teaches the
wrong thing. Either the record's time becomes the destination's reported one, or the field goes.

### 4. `RoutingRecord.at` no longer has one obvious meaning

`route.ts:87` sets `at` when the decision is made, and `land` (`work.ts:147`) never revises it. So a
record whose delivery landed three days after it was reserved reports the reservation's time, is
mirrored with it, and is ordered by it (`pool-store.ts` `ORDER BY at, id`). `CONTEXT.md:229` says
only "time", which was unambiguous while the two could not differ.

Whichever it is, say so — this is the field a host renders as "routed on". Decision time is the
defensible answer (it is the person's act being recorded, and `pointer` carries what happened
after), but it needs to be written down now that a record can be days older than its arrival.

### 5. `deliveryFor` answers a delivery for a record that already delivered

`packages/core/src/pool/routing/delivery.ts:57` — the doc says "Absent where there is nothing left to
carry out: the record was cancelled, or its item was purged", and the code checks exactly those two.
A `delivered` record is equally nothing-left-to-carry-out and gets a full `Delivery` back, assets
opened and all. Nothing reaches it today, because a job stops existing when its delivery lands, but
the method is public API and its stated contract is the safety rail. Add `record.state !== "pending"`
to the guard.

### 6. Purge must now find delivery jobs by `subject_item`, and nothing says so

`items.purge` is still `notImplemented`, so there is no wrong code — but this branch has changed
what purge will have to do. A delivery job's `subject_id` is a `RoutingRecordId`, not an `ItemId`, so
the obvious `DELETE FROM jobs WHERE subject_id = ?` now silently leaves a purged item's pending
delivery jobs behind, pointing at records that cascade away underneath them. `subject_item` exists
and is the right column; whoever writes purge has to know that. It belongs in `docs/specs/core.md`'s
purge section or as a comment on the column, and it wants a test the day purge lands.

### 7. `DeliveryRefusal` is now three unions wide

`packages/core/src/types/api/refusal.ts:105` — `PreparationRefusal | AttemptFailure | CancelRefusal`.
`route` can never answer `not-pending` or `delivery-in-flight`; `cancelDelivery` can never answer
`unknown-destination`, `payload-type-unsupported` or `target-invalid`. Every caller and every host
mapping refusals to status codes now handles both halves for both operations.

The plan asked for this shape ("`DeliveryRefusal` gains whatever cancelling and a not-pending record
need"), so it is deliberate — but two named unions cost nothing and would let the daemon's refusal
map stay honest about which route can produce what.

---

## Minor

### 8. A `delivered` outcome on a mirror job is silently swallowed

`work.ts:95` — `succeeded` and `delivered` share a branch, and `land` runs only when the subject is a
`routing-record`. A host reporting `{ kind: "delivered", pointer }` for a mirror job gets a resolved
job and a dropped pointer, with nothing said. A wrong-outcome-for-this-kind refusal would be cheap
here; the mirror runner already does the mirror image of this check for subjects
(`apps/daemon/src/mirror/runner.ts:37`).

### 9. `claim` answers fewer leases than asked for, and does not top up

`work.ts:41` — reclaimed deliveries are abandoned and dropped from the answer, so a request for 16
can come back with 3 while 13 claimable jobs remain. Callers that treat an under-full page as "queue
drained" will stall for one poll interval. `deliverWith` loops until it sees nothing fresh, so the
tests do not see it; a runner using the count as a signal would.

### 10. A throw inside `claim`'s abandonment loop strands the leases already taken

`work.ts:48-54` — leases are collected into `claimed` as the loop goes, and `abandonUnknown` opens
its own transaction. If it throws on lease 3, leases 1 and 2 are leased in the database and returned
to nobody, so they sit until their leases expire. Unlikely, and the recovery is automatic, but the
loop could collect first and abandon after.

### 11. Two commits carry `delivery.ts` as a binary blob

`73f5ebe` wrote a literal NUL into the composite key in `projectDelivery`, so both it and the fix
(`e07ecc7`) show as "Binary files differ" and cannot be reviewed from the history. The file at HEAD
is text and correct (`delivery.ts:96`, `:145`). Nothing to do unless the branch gets rebased, in
which case squashing the pair removes the unreadable pre-image.

### 12. The two record mutators disagree about a missing record

`pool-store.ts:611` `resolveRoutingRecord` throws on a record that is not there;
`pool-store.ts:623` `removeRoutingRecord` returns quietly. Both are defensible alone — resolving
something gone is a bug, removing it is idempotent — but the asymmetry is unstated and a caller
reading one will assume the other.

---

## Non-issues

- **`withdrawWork` treats an expired lease as held** (`jobs.ts:331`) — deliberate, and the plan's
  stated fallback. A cancel arriving over a dead holder waits for the next claim to abandon the job,
  which then removes the record anyway. The person's outcome is the same.
- **`claim` abandoning a delivery whose host is merely slow** — the lease expiring is the whole of
  the evidence available, and guessing the other way is the undetectable duplicate. Working as
  designed.
- **The mirror runner's `wrong-subject` branch** (`runner.ts:37`) — unreachable, since it claims
  mirror kinds only. Defensive narrowing that also satisfies the type, not dead weight.
- **`subject_item` denormalised onto `jobs`** — a join cannot survive the removal of the reservation
  it would join to; argued in the ADR 18 amendment and correct.
- **`jobs_one_pending_mirror` untouched by the delivery kind** — two pending deliveries of one item
  are two legitimate jobs, and `superseded`/`clearAbandoned` were narrowed from `!== "enrichment"`
  to `mirrors(kind)` to match. Verified against the recreated index set in the migration: names and
  definitions match the ones dropped.
- **`arbitraries.ts` generating `pending` records the projection then filters** — the round-trip
  property never exercises `readState("pending")`, but `mirror.test.ts:161` covers it directly and
  the codec is deliberately strict rather than salvaging.
- **ADR 19's "the record names what was delivered" not implemented** — ADR 19 is dated 2026-08-17
  and post-dates this plan's close. Out of scope here.

---

## Resolution

<!-- Add once findings are addressed, and flip **Status** above. -->
