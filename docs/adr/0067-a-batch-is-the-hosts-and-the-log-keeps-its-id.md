# 67. A batch is the host's, and the log keeps its id

**Date**: 2026-10-30
**Status**: Accepted — extends [ADR 12](0012-core-keeps-an-append-only-action-log.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A person can mark several rows and tag, untag, archive or unarchive them all, in one gesture. That
gesture is a single request, and each item in it may land or be refused on its own. Today the log
reads such a batch as N unrelated entries. That is acceptable for now, but a log that can group a
batch's entries later can only group the ones that were recorded with an id of their own.

Where does a batch live, and what does the pool keep of it?

---

## Decision drivers

- **Core is a primitive API.** "Batching and processing rituals belong to the host or client"
  (core.md).
- **A batch may partly fail.** A trigger tag can be refused for one item and fire for the next.
  All-or-nothing would make one bad item cost the whole gesture.
- **Grouping later needs the fact now.** An id added after the first batches runs cannot be
  written back onto them.
- **The outbox replays.** A batch made offline is sent when the pool answers, possibly more than
  once, and must keep its identity across those sends.

---

## Considered options

1. **The host loops over core, and nothing is recorded.** The client holds the batch alone.
2. **The host loops over core, and the action log keeps a batch id the client created.**
3. **Core runs the batch in one transaction**, as an operation of its own.

---

## Decision outcome

Chosen: **Option 2**.

- **The daemon runs the batch.** It calls core's per-item `tag`, `untag`, `archive` or `unarchive`
  once per item, in the order given, and answers each item separately.
- **The client creates the batch id**, the way an uploader creates an asset id
  ([ADR 22](0022-the-uploader-mints-the-asset-id.md)), so a replay from the outbox carries the
  same one.
- **Core records it, nothing more.** `tag`, `untag`, `archive` and `unarchive` take an optional
  batch id, and every action-log entry they write carries it as `batch`. Core never makes a batch,
  never checks that one exists, and never reads one back.
- **Cancelling a batch is cancelling each of its records**, by the cancel that already exists.

### Consequences

- **Good** — the log can be grouped by batch later, back to the first batch.
- **Good** — core's per-item rules (refusals, trigger windows, a tag that is spent) apply to a
  batch unchanged, because a batch is nothing but those calls.
- **Bad** — a batch is not atomic. A pool that stops halfway leaves half the items done. Each of
  those halves is a state an item can already be in, so nothing new is broken, and resending the
  batch completes it, since a repeated one is absorbed or refused.
- **Neutral** — the id is unchecked. Two clients that chose the same id would group as one batch.
  The id is long and random, as an asset id is.

---

## Pros and cons of the options

### Option 1 — the host loops, nothing recorded

- **Good** — no change to core or the log.
- **Bad** — a batch is visible only on the device that made it, and is lost for good once that
  device forgets it.

### Option 2 — the host loops, the log keeps the id

- **Good** — one optional field, written and never interpreted.
- **Bad** — the log's shape changes.

### Option 3 — core runs the batch

- **Good** — all-or-nothing, and one transaction.
- **Bad** — overturns the primitive-API line, and makes one refused item refuse the whole batch.

---

## More information

[Plan: batch processing](../plans/batch-processing.md). Revisit if grouping in the log wants to
read by batch, which may want an index, or if a batch ever needs to be atomic.
