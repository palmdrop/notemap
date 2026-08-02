# 10. The feed and the queue sort differently

**Date**: 2026-08-02
**Status**: Accepted

---

## Context and problem statement

[pool-and-routing.md](../exploration/vision/pool-and-routing.md) says of the feed that "the sort key is
capture time... and never rewritten", and of revisions that "ordering uses `updated` when
present, `created` otherwise". Those are only compatible if they describe different surfaces.
Which sorts how?

---

## Decision outcome

**The feed sorts by `created`. The queue sorts by `updated ?? created`.** Both ascending.

The feed is immutable true chronology: a note written offline on a plane and synced three days
later sits where it was written, and editing something never moves it. That guarantee is the
feed's entire job.

The queue sorts by last touch so that an edited item resurfaces where the user will actually
encounter it, rather than back in material already scrolled past. This holds whether or not a
cursor exists.

**Core owns no cursor.** Whether processing position is a persisted cursor or simply scroll
position in a continuous document is a frontend question, deferred (2026-08-02). Core provides
ordered, paginated reads of both surfaces and nothing more.

The phrase "resurfaces at the *front* of the queue" in pool-and-routing.md is misleading and
should be reworded: in an oldest-first queue a freshly edited item sorts at the **newest end**,
which is what puts it ahead of any forward-moving position.

### Consequences

- **Good** — each surface gets the order its job requires; neither compromises for the other.
- **Bad** — two indexes instead of one, and a reader has to be told the orders differ, which is
  why this is written down.
