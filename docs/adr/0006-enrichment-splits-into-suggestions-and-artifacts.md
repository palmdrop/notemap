# 6. Enrichment splits into suggestions and artifacts; ratification writes attributed state

**Date**: 2026-08-02
**Status**: Accepted

---

## Context and problem statement

"Enrichment produces suggestions attached to the item, never mutations" is the constitutional
rule of the project ([standards.md](../standards.md#the-ingestion-contract-the-inbox)), but no
document says what happens when the user says *yes*. What does accepting write?

---

## Decision outcome

**Enrichment produces two different kinds of thing, and only one is ratifiable.**

- A **suggestion** is a proposal awaiting a decision — a tag, a title, a destination guess. It
  means nothing until someone accepts or rejects it.
- An **artifact** is a durable output that stands on its own — a transcript, an embedding.
  Nobody accepts a transcript; it is simply there. Correcting one is explicitly *not* an edit
  of the capture and triggers no revision
  ([audio-intake.md](../exploration/vision/audio-intake.md#the-audio-item-in-the-queue)).

This split is already assumed by [ADR 1](0001-pool-is-a-database.md): the mirror carries
transcripts and corrections but not pending suggestions, because enrichment is regenerable.

**Accepting a suggestion writes real state that carries its attribution.** A tag row records
who put it there — a human, or the named provider — so `wasAttributedTo` survives ratification
and "which of my tags did a model give me?" stays answerable. The suggestion is marked
accepted or rejected and kept: rejections are the only signal distinguishing a suggester that
is *wrong* from one that is merely ignored, and they cannot be backfilled.

Removing a tag is a row delete. A later re-suggestion arrives as a fresh pending suggestion.

*Amended 2026-08-02*: the suggestion history is **not mirrored**. A pool rebuilt from its
mirror loses the rejection signal; that loss is accepted rather than paid for in mirror
complexity.

### Considered options

- **Copy the value, keep attribution only on the suggestion.** Simplest schema. Rejected
  because the provenance join degrades exactly where it matters: enrichment re-runs against
  revisions and re-transcription creates new artifacts beside old ones by design, so several
  suggestions come to carry the same value and per-tag attribution stops having an answer.
- **Accepted suggestions *are* the state, unioned at read.** Attribution exact by
  construction, nothing duplicated. Rejected on a concrete scenario: accept a tag, remove it,
  then edit the note — enrichment re-runs, the suggestion is still "accepted", and the removed
  tag silently reappears. Preventing that needs rejected-after-accept bookkeeping to patch a
  model that should not have had the problem.

### Consequences

- **Good** — one place to read classification from; provenance survives; rejection signal is
  captured from day one.
- **Bad** — one extra column and one extra write per ratification.
- **Neutral** — whether removing a tag should suppress that suggestion permanently is left
  open (2026-08-02). Rejecting once per revision is mild; suppression is easy to add later.
