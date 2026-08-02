# 11. Only the head may be amended in place, and only before it is processed

**Date**: 2026-08-02
**Status**: Accepted

---

## Context and problem statement

Editing a capture appends a revision rather than overwriting it. Fixing a typo seconds after
writing is not a revision of the record, though — it is still finishing the thought.
[pool-and-routing.md](../exploration/vision/pool-and-routing.md#the-one-in-place-exception-the-head-of-the-feed)
leaves the exact window deliberately open. When may an edit be in place?

---

## Decision outcome

**In place is allowed exactly when the item is the head of the feed and is still unprocessed.**
Anything else appends a revision.

No timeout. Capturing something else seals the previous item, and that is the only thing that
does.

**Immutability begins at the pool, not at the client.** A capture core has never accepted has
no history to preserve, so a client may amend or discard it freely while it sits in the outbox.
"Unsent" must mean *not yet handed to the outbox as sent* rather than merely "no response yet"
— an in-flight capture has to become an operation, or a retry races the edit.

Because an offline client cannot know whether it still holds the head, the client decides
locally and **the server re-evaluates on replay**, demoting the edit to a revision if the item
is no longer the head. Worst case is one extra revision, never a silently rewritten record.

Note that "the head" is the **newest** item. It is not "first in the queue" — the queue is
oldest-first ([ADR 10](0010-feed-and-queue-sort-differently.md)), so its first element is the
oldest.

### Consequences

- **Good** — one rule, no timer, no configuration, and it matches the intuition that starting a
  new thought ends the previous one.
- **Bad** — accepted knowingly: if nothing is captured for a week, that week-old item is still
  the head and can be amended with no revision recorded. A timeout was considered and rejected
  as complexity that buys little in practice.
- **Neutral** — an in-place amendment invalidates whatever enrichment already ran, which simply
  re-runs ([ADR 7](0007-enrichment-steps-declare-their-needs.md)).
