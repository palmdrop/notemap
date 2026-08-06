# 12. Core keeps an append-only action log, and never derives state from it

**Date**: 2026-08-04
**Status**: Accepted

---

## Context and problem statement

The pool records what an item *is* — its tags, its routing records, its archive state — but not
what happened to it. "Why does this item carry a tag I don't remember adding?" and "when did
this actually arrive, as opposed to when it claims to have been captured?" are both
unanswerable. Should core record every state-mutating action, and if so, is that log a
convenience or the source of truth?

---

## Decision drivers

- Provenance is a first-class principle ([standards.md](../standards.md)), but it currently
  stops at attribution on the item. Attribution says *who*; it does not say *when* or *in what
  order*.
- A separate delivery-attempt log had already been decided
  ([core.md](../specs/core.md)) so that a destination failing silently and repeatedly stays
  visible. That is one instance of a general want, and shipping it alone would leave an
  entity that a general log immediately subsumes.
- Capture time comes from the source, so nothing records arrival. A capture that claims to be
  three days old is indistinguishable from one that is.
- The pool is private, single-user and local-first, so a detailed trace is the user's own
  material rather than surveillance of them.
- Every mutation already applies all-or-nothing ([ADR 1](0001-pool-is-a-database.md)), so a log
  entry can be written in the same atomic unit as the change it describes and cannot drift from
  it. *Amended 2026-08-06*: that unit is a transaction core opens rather than a command it
  submits. Appending the entry is now its own call inside that transaction, so **core can
  forget to make it** where the old shape made it structurally unforgettable. Atomicity is
  unchanged; what was a type-level guarantee is now one that tests and review keep.

---

## Considered options

1. **No log** — keep attribution on the item and add an arrival timestamp for the one case
   that motivated it.
2. **A log for tracing only** — record every mutation; state stays authoritative and nothing is
   ever rebuilt from the log.
3. **Event sourcing** — the log is the source of truth and pool state is a projection of it.

---

## Decision outcome

Chosen: **option 2.** Core appends an entry for every state-mutating action — what happened,
when core applied it, which agent did it, and to what — and the log exists to be *read by a
human tracing something*. State remains authoritative. Nothing is ever derived, replayed or
rebuilt from the log.

This is stated as a decision rather than left implicit because "we already record every
mutation, why not derive state from it?" is an argument someone makes six months in, and the
answer is that it would turn every schema change into a migration of history and every
correctness question into a replay question. The log is a record, not a mechanism.

The log absorbs the delivery-attempt log: a failed delivery is one kind of entry, not a
separate entity. It also answers arrival time without adding a field to the item — arrival is
the timestamp of the capture entry — so `created_at` can stay purely source time.

The log is **operational state, not the user's material**: it is not mirrored, per
[mirror.md](../specs/mirror.md). A pool rebuilt from its mirror has no history, and that loss
is accepted for the same reason the rejection signal is.

**Purge does not clear the log.** The pool is private and the log is the user's own record, so
erasing the trace of what happened is a separate wish from erasing the material, and it is
offered as its own operation — for one purged item's entries, or for the log entire. This is a
deliberate narrowing of [ADR 4](0004-purge-leaves-a-minimal-tombstone.md)'s "and nothing else",
which was written about what *leaves* the pool and reaches other clients. Log entries do not
leave; they are local, and they are not carried by the mirror.

### Consequences

- **Good** — provenance becomes complete rather than partial; a silently failing destination is
  visible; arrival time falls out for free; the delivery-attempt entity disappears before it is
  built.
- **Bad** — a write amplification of one row per mutation, and a table that grows without an
  obvious retention story. Retention is left open below.
- **Bad** — purge no longer removes every trace of an item by default. Someone who purges
  expecting total erasure gets less than they assumed unless they also clear the log. The
  operation exists; discovering that it is needed is on the interface.
- **Neutral** — the log looks like an event store and is deliberately not one. That has to be
  defended in review, the same way the core seam does.

---

## Pros and cons of the options

### No log

- **Good** — nothing to build, nothing to retain, nothing to purge.
- **Bad** — every "why is this like this?" stays unanswerable, and the delivery-attempt log
  gets built anyway as a one-off, followed by the next one-off.

### Event sourcing

- **Good** — one representation; history and state cannot disagree.
- **Bad** — schema evolution becomes history migration, and reads become replays or require a
  projection cache that reintroduces the same drift the log was meant to remove. Far past what
  a single-user pool needs.

---

## More information

Spec: [core.md](../specs/core.md) — intake, archive and purge.
Related: [ADR 4](0004-purge-leaves-a-minimal-tombstone.md) for what purge owes other clients,
[mirror.md](../specs/mirror.md) for why the log is not mirrored.

Revisit when the log's size becomes noticeable in practice, which is when a retention policy
has to be decided — the open question is whether entries expire at all, and whether expiry is
per kind.
