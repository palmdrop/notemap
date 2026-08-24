# 21. An item is editable until it is processed

**Date**: 2026-08-24
**Status**: Accepted
**Deciders**: palmdrop

---

## Context and problem statement

[ADR 11](0011-in-place-amendment-of-the-head.md) let the newest item in the feed be amended in
place and made everything else append a revision. Two years of that rule in the spec, and one
implementation of it, produced a shape whose edges all trace back to the same premise: that a
capture is immutable from the moment the pool accepts it, with the head as a courtesy window.

The premise costs more than it collects. The event that seals an item has nothing to do with that
item, so capturing an unrelated thought seals the typo half-fixed a second ago, while a note nobody
has followed for a week is still freely rewritable with no record that it changed. A revision
carries its original's capture time in order to sit beside it, which ties the feed and forces a
tie-break the driver answered by denormalising `root_id` and `revision_depth` into the sort key. An
offline client cannot know whether it holds the head, so it guesses, and the server demotes the
guess on arrival.

What is immutability actually owed to? And what event actually incurs it?

---

## Decision drivers

- Nothing outside the pool has seen an item until a delivery lands, so nothing outside the pool
  depends on what it said before then.
- "Am I the newest item in the pool?" is a global question, which is why an offline client cannot
  answer it. "Have I been processed?" is a property of the item itself.
- The queue already excludes archived, routed and revised items. Any seal that is not the same
  predicate is a second rule to keep in step with the first by hand.
- Notemap is a conveyor belt, not an archive. Archive-grade guarantees are worth their cost from
  the moment a copy leaves, and not before.

---

## Considered options

1. **Keep ADR 11** — the head is amendable, everything else is revised.
2. **Freeze on delivery** — only bytes actually landing seal a capture; a pending reservation does
   not.
3. **Freeze on processed** — routed, archived or revised seals it; everything else is editable in
   place.

---

## Decision outcome

Chosen: **freeze on processed**, and with it a second decision that the first makes available: a
revision stops being a version of an item and becomes an ordinary capture that carries a trace.

**An item is editable in place while it is unprocessed.** Processed means routed, archived or
revised, which is the queue's own predicate, so editability and queue membership are one thing read
two ways: everything in the queue is a person's to change, and nothing else is.

**The seal is derived, never stored.** A cancelled reservation removes its record and the item
becomes editable again, which is correct, because nothing left. The third clause is what keeps that
honest: an item something was revised from stays sealed even if its routing is cancelled, since
rewriting it in place would leave the revision's trace pointing at content that never produced it.

**A revision is a capture.** It mints its own id, its own capture time of now, and its own source
identity from whoever made it. `revisionOf` is a trace and the only thing distinguishing it from
anything else that arrives. It does not replace what it names, which was delivered or set aside and
stays exactly as it was, so "superseded" is retired as a word: the reverse link is `revisedInto`,
it is a list, and one item may be revised any number of times into captures that are independent of
each other.

Choosing the third clause of *processed* rather than a separate seal is what collapses the rest.
The queue's key becomes capture time, matching the feed, because last touch existed so a revised
item resurfaced where it would be met and a revision now arrives at the newest end by its own time.
An amendment stops moving anything, since the person amending an item is looking at it already.

### Consequences

- **Good** — the sealing event is causally related to the reason for sealing, and states in one
  sentence.
- **Good** — a client can answer "is this editable?" from the row it holds. `revisedInto`, the
  archive state and the routing summary all ride on the item.
- **Good** — deletions: `root_id`, `revision_depth`, the feed index over them, the chain
  computation on insert, the chain lookup in keyset pagination, `PoolTx.head()` and its query, the
  `item-superseded` refusal with its status mapping and message, the `revision_of IS NULL` carve-out
  in source lookup, the revision exclusion in tags-in-use, and the client's revision-placement
  logic. The open question of 2026-08-08 about ordering a revision against its original dissolves.
- **Bad** — an unprocessed capture's earlier content is gone. Nothing preserves it, the action log
  records that an amendment happened rather than what it replaced, and the mirror record is
  overwritten. Accepted: until something has left, notemap is the only holder and the person
  editing is its owner.
- **Bad** — a rejected suggestion is kept as signal about the suggester, and after an amendment
  that signal names content that no longer exists. Accepted as thin.
- **Bad** — a retried edit can now make a second revision where the old refusal made it fail
  safely. Answered by giving the edit an envelope, so a revision is matched for replay exactly as a
  capture is.
- **Neutral** — in-place editing becomes the normal path for an item's whole pre-routing life, so
  enrichment invalidation stops being theoretical. It is bounded by requiring invalidation to be
  per declared need ([ADR 7](0007-enrichment-steps-declare-their-needs.md)): an amendment
  invalidates the enrichment whose needs it changed and no more, so editing text beside a
  transcript leaves the transcript and its corrections alone.

---

## Pros and cons of the options

### Keep ADR 11

- **Good** — nothing to build, and the immutability story is simple to state.
- **Bad** — the seal is unrelated to the item it seals, in both directions: an unrelated capture
  ends a thought still being written, and no capture at all leaves a week-old item rewritable.
- **Bad** — every consequence listed above as a deletion stays, and the head remains a global
  property an offline client has to guess at.

### Freeze on delivery

- **Good** — strictest reading of what immutability is owed to. A reservation whose delivery has
  not run has published nothing.
- **Bad** — an item with a pending delivery stays editable, and the delivery is attempted from the
  record when it runs, so the bytes that land are not the ones the person decided to send.
- **Bad** — splits from the queue's predicate, which excludes on the decision. Two rules.

### Freeze on processed

- **Good** — one predicate for the queue and for editability, and the word for it is already in the
  glossary.
- **Bad** — archiving seals, though archiving publishes nothing. Accepted: archiving is a person
  saying they are done, unarchiving thaws, and the alternative is an archived item quietly
  rewritable inside the archive.

---

## More information

Supersedes [ADR 11](0011-in-place-amendment-of-the-head.md) outright, and supersedes the key clause
of [ADR 10](0010-feed-and-queue-sort-differently.md): the surfaces no longer sort differently, the
queue's filter now doing the work its second key was there for. ADR 10's other decisions, that the
feed's key is capture time and that direction is the reader's, are untouched.

Specified in [core.md](../specs/core.md) under Editing, The queue, and Archive and purge, and not
yet built.

Revisit if enrichment turns out not to be able to declare its needs finely enough to make per-need
invalidation real, which is the assumption holding up the second **Neutral** above. Whole-item
discard on every amendment would be the fallback, and it is parity with what a revision does today
rather than a regression, but it would throw away person-made corrections and that is worth
reopening this for.
