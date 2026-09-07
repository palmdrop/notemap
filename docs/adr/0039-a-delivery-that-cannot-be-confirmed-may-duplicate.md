# 39. A delivery that cannot be confirmed may duplicate, and the kind says so

**Date**: 2026-09-07
**Status**: Accepted — narrows [ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

[ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md) made delivery asynchronous and
keyed retry on evidence rather than on failure, and [core.md](../specs/core.md) states the
consequence flatly: *"`unreachable` is proof that nothing was delivered, so a retry cannot duplicate
and the job is retried with backoff."*

Both kinds that exist **earn** that sentence. An asset's filename carries its content's digest, so a
retry lands on the copy the last attempt wrote; a create is `EEXIST` on the filesystem and
`PUT If-None-Match: *` over WebDAV, so a name that is taken is refused rather than written twice.

Are.na has none of it. `POST /v3/blocks` takes no idempotency key and offers no conditional create,
and the only way to look for a block by its content is `/v3/search`, which is Premium-only. A POST
whose response never arrives — the ordinary case being the attempt deadline, since the runner allows
`leaseFor` minus a margin — is indistinguishable from a POST that never left.

So: what does an adapter report when it cannot tell whether the bytes landed?

---

## Decision drivers

- **Both available answers are lies.** `unreachable` asserts that nothing was delivered.
  `rejected` asserts that the destination was reached and refused, and is abandoned on the first
  attempt — throwing away a decision that probably landed.
- **Abandoning is worse than duplicating, here.** This is ADR 17's own reasoning: a decision that
  evaporates because a server was briefly out of reach is the failure retry exists to prevent. And
  the two failures are not symmetrical in what they leave behind — a duplicate block sits visibly in
  a channel and can be deleted, while a lost route is silent and the item is simply back in the
  queue with an abandoned record.
- **The guarantee was never the port's to make.** It reads as a property of `unreachable` because
  it happened to be true of every kind that existed when it was written. What enforces it is a
  digest in a filename and a conditional header — both of them a kind's own machinery.
- **Nothing can detect the duplicate afterwards.** Search is Premium-only and connection metadata
  is not queryable, so a look-before-you-write retry cannot be built against this API at all. This
  is not a shortcut being taken.

---

## Considered options

1. **Report an unconfirmed write as `unreachable`**, and weaken the guarantee to a promise each
   kind makes for itself.
2. **Report it as `rejected`** — never duplicate, and sometimes lose the decision.
3. **Add a third outcome, `uncertain`** — retried on `unreachable`'s terms, but recorded, so a
   person can be told a delivery may have landed twice.
4. **Look before writing** — read the channel and refuse a block already there.

---

## Decision outcome

Chosen: **option 1**.

- **`unreachable` means the adapter could not confirm that anything was delivered.** That is what
  it has always meant operationally; what changes is that the spec stops claiming more.
- **A kind that can make its write repeatable keeps the strong promise** and says so in its README,
  naming the mechanism. `destination-fs` and `destination-webdav` both do, and both already
  describe how.
- **A kind that cannot says that instead**, and names the window in which it can happen.
- **`core.md`'s retry-is-keyed-on-evidence clause changes accordingly**, from a property of the
  outcome to a property each kind states.
- **Nothing else moves.** Retry with backoff, bounded attempts, `rejected` abandoned on the first
  attempt, and a lease that expired with no outcome reported abandoned rather than retried are all
  still ADR 17's, unchanged.

### Consequences

- **Good** — the guarantee lives where it is enforced, so reading it tells you whether it holds for
  the kind in front of you rather than for kinds in general.
- **Good** — a destination whose protocol offers no conditional write becomes expressible at all.
  Under the old wording every such kind would have had to either lie or abandon decisions.
- **Bad** — a person may occasionally find two identical blocks in a channel, and nothing in
  notemap will say which delivery made the second one. Accepted: rare, visible, and reversible by
  hand, against a decision thrown away silently.
- **Bad** — a reader of `unreachable` now has to check which kind produced it. Accepted: that is
  the honest amount of work, and the alternative is a sentence that is false for one kind and does
  not admit it.
- **Neutral** — option 3 stays available and this decision is what would justify it. If duplicates
  turn out to be common rather than rare, `uncertain` is the shape to build, and the evidence for
  building it comes from having lived with this.

---

## Pros and cons of the options

### Report it as `rejected`

- **Good** — no duplicate is ever created, and the strong sentence in `core.md` stands untouched.
- **Bad** — `rejected` means *reached and refused*, which is not what happened, and it is abandoned
  on the first attempt. A single slow response would throw away a route the person had decided on.
- **Bad** — it makes the common failure the destructive one. Most unconfirmed writes did in fact
  land, so this abandons a decision precisely when the material arrived.

### A third outcome, `uncertain`

- **Good** — the only option that tells the truth to a person, rather than to a spec. "This may
  have landed twice, go and look" is genuinely actionable, and it is the actual state of the world.
- **Bad** — a new domain concept through `DeliveryOutcome`, core's routing, the store, `/v1`, the
  client and the UI, and a new state on a routing record that every surface has to know how to
  draw.
- **Bad** — premature. Nobody has yet seen how often this happens, and building the reporting
  before the evidence is the wrong order.

### Look before writing

- **Good** — would make the strong promise real for every kind, uniformly.
- **Bad** — not possible against this API. Search is Premium-only, connection metadata is not
  queryable, and paging a channel to compare content is both the enumeration are.na's own guidance
  forbids and racy besides.
- **Bad** — even where it worked it would sound absolute while being best-effort, which is worse
  than a weaker promise honestly stated.

---

## More information

Written for the are.na destination ([plan](../plans/arena-destination.md)), the first kind whose
protocol offers no way to make a write repeatable.

Revisit if are.na gains an idempotency key or a conditional create — at which point that kind can
keep the strong promise and the per-kind wording costs nothing. Revisit also if duplicates prove
common rather than rare, which is the condition under which option 3 becomes worth its cost.
