# 18. A job's subject names what kind of thing it is about

**Date**: 2026-08-13
**Status**: Accepted — closes the "must a job be about an item?" open question in
[core.md](../specs/core.md)

---

## Context and problem statement

`Job.subject` is an `ItemId`, and a job that needs to say more carries an optional field beside it:
`enrichment?: EnrichmentName`, paired in the SQLite schema with a constraint asserting that exactly
the enrichment jobs have one.

[ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md) adds a fourth job kind. Two
pending deliveries of one item to two destinations are two jobs with the same item, so a delivery
job has to name *which delivery* it is carrying out.

`core.md` has had the general form of this open since 2026-08-11: "whether a unit of work is ever
about something other than an item… if it becomes one, a job's subject has to say what kind of
thing it names rather than being an id."

So: does the subject grow a fourth optional, or does it say what it names?

---

## Decision drivers

- **A field per kind is a shape that rots.** `enrichment?`, then `delivery?`, then whatever the
  fifth kind needs — each optional, each with a paired CHECK, each meaningless for every other
  kind. Nothing in the type says which combinations are real.
- **The subject is already not always an item in spirit.** A `mirror-remove` job names an item that
  has been purged, which is why the column carries no foreign key.
- **The asset sweep is waiting behind this.** `core.md` records it as work that is pool-wide rather
  than about anything at all, and it cannot be modelled as a job while a subject must be an item.
- **The abandoned surface answers "what needs me" in one read** ([core.md](../specs/core.md)), and
  a person working that list needs to see which capture is stuck.

---

## Considered options

1. **A `delivery?` discriminator** beside `enrichment?`, following the existing pattern.
2. **A tagged union subject** — the subject says what kind of thing it names and which one.
3. **Subject becomes the routing record id** for delivery jobs, with no tag.

---

## Decision outcome

Chosen: **a tagged union subject**. A job says what it is about — an item, or a delivery — rather
than carrying an id whose meaning depends on the kind, plus optional fields whose applicability
does too.

Option 3 is dismissed on its own: the item link is what the action log, the mirror coalescing index
and the abandoned surface all key on, and a subject that dropped it would have every one of them
resolving it back.

### What it costs, and who pays

The discriminator would have given the item link for free. The union has to earn it back in two
places, and both resolve toward keeping the caller's life unchanged:

- **`AbandonedWork` keeps a resolved `item` beside the subject.** The store joins the routing
  record for delivery jobs. Any other answer turns "three things need you" into one read plus a
  lookup per row, which is the thing `core.md` wrote the one-read promise against.
  *Amended 2026-08-14, implementing delivery.* The store resolves the item when the job is
  **enqueued** rather than joining at read time, and keeps it on the row. A join cannot work: an
  abandoned delivery's reservation is removed
  ([ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md)), so by the time anyone reads
  the row reporting that abandonment there is nothing left to join to — and that row is precisely
  the one a person needs the item for. A record's item never changes, so resolving it early is the
  same fact, read earlier.
- **`Action.subject` stays an `ItemId`.** Core resolves the record to its item inside the
  transaction it is already opening. Widening the log's subject to the same union would break the
  `item` filter, the actions table's column and every entry already written, for entries a person
  reads by item.

The SQLite `jobs` table splits `subject` into a kind and an id, which re-keys the mirror coalescing
index — the one asserting at most one pending mirror job per item — onto the pair.

### Consequences

- **Good** — a fourth job kind adds no fourth optional field and no fourth CHECK constraint. What a
  job is about is stated once, in one place.
- **Good** — the asset sweep is unblocked. It becomes a job whose subject names the pool, or none
  at all, without another decision of this size.
- **Good** — the `mirror-remove` case stops being a special note about a column with no foreign
  key, and becomes an ordinary consequence of a subject naming a thing that may be gone.
- **Bad** — it touches working code that has nothing to do with routing: capture's mirror enqueue,
  the mirror runner, `work.claim` and `complete`, purge's mirror removal, and the store's job
  reads. This is why it lands as a plan of its own, with no behaviour change.
- **Bad** — one join on the abandoned surface, and one resolve when appending a delivery action.
- **Neutral** — `AbandonedPosition` gains the subject and stays a total order.

---

## Pros and cons of the options

### A `delivery?` discriminator

- **Good** — smallest possible change; the pattern and its CHECK constraint already exist.
- **Good** — the item link stays free everywhere, so no join and no resolve.
- **Bad** — the fourth kind adds a fourth optional, and the type still cannot say which
  combinations are legal. The constraints multiply where the union's do not.
- **Bad** — leaves `core.md`'s open question open, and the asset sweep still cannot be a job.

### A tagged union subject

- **Good** — honest, scales, and closes a question rather than deferring it again.
- **Bad** — a cross-cutting refactor of already-working code, and two places have to resolve the
  item back.

### Subject becomes the routing record id

- **Good** — trivially precise about what the job carries out.
- **Bad** — loses the item link that the action log, the coalescing index and the abandoned surface
  all need, so every one of them resolves it back. Strictly worse than the union, which at least
  says what it is doing.

---

## More information

Decided in the grilling session of 2026-08-13, forced by
[ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md). Implemented by
[job-subject-union.md](../plans/job-subject-union.md), deliberately ahead of and separate from the
routing work, so that a regression in capture or mirroring is attributable.

Revisit when the asset sweep becomes a job, which is the case that will say whether a pool-wide
unit of work wants a third variant or an absent subject.
