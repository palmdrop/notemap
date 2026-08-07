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

*Amended 2026-08-06 — the feed's direction is the caller's, and defaults to newest first.*
"Both ascending" fixed a direction the feed has no business fixing. What a client shows first is
interface policy, and [core.md](../specs/core.md) says core imposes none; a reader opening the
feed expects the most recent thing, the way every timeline does. So the feed takes an **order**
on the read — `newest-first` by default, `oldest-first` on request — and a cursor belongs to the
order it was issued for, refused under the other.

What does not change is the **key**: the feed still sorts by `created`, which is what this ADR
is actually about. Direction was never the decision; it was an unexamined default riding along
with one. **The queue stays ascending** and takes no order, because oldest-first is what makes
it a queue.

*Amended 2026-08-02*: `updated` means **content time only** — a revision or an amendment — and
is named `content_updated_at` to say so. A separate `modified_at`, bumped by every change
including classification, routing, archiving and deciding on a suggestion, exists for sync delta reads
([specs/sync.md](../specs/sync.md)) and never affects ordering.

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
