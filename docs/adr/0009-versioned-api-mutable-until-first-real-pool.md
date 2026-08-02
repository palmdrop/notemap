# 9. The API is versioned from day one, and v1 is mutable until the first real pool

**Date**: 2026-08-02
**Status**: Accepted

---

## Context and problem statement

[ADR 1](0001-pool-is-a-database.md) makes the pool private, so the HTTP API is the only way in
and therefore the interop surface other software depends on. But
[AGENTS.md](../../AGENTS.md) states this is greenfield with no live users and that APIs may
change without migrations. What stability is promised?

---

## Decision outcome

**Everything is versioned under `/v1` from the first commit — and `/v1` may take breaking
changes until the freeze point.** The version prefix exists during exploration to establish
the shape, not to promise anything yet.

**The freeze trigger is concrete: the day a pool exists that would be upsetting to lose.**
Not "when it feels stable". From that point on, breaking changes mean a new version, with a
changelog and a migration note.

Micropub remains an intake *adapter* over the native envelope rather than the primary API, per
[standards.md](../standards.md#the-ingestion-contract-the-inbox).

### Consequences

- **Good** — full freedom to reshape the API during exactly the phase where the model is still
  moving, without the habit of unversioned URLs to unpick later.
- **Bad** — a `/v1` that breaks is mildly dishonest to anything built against it early. Only
  the author's own clients exist in that window.
- **Neutral** — pre-freeze schema migrations can be *drop and rebuild from the mirror*, and the
  mirror format is itself cheap to change because it is regenerable from the database. Pre-freeze
  churn is unusually cheap here, which is a direct payoff of ADR 1.
