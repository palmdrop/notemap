# 65. The feed may be read by when each item was processed

**Date**: 2026-10-21
**Status**: Accepted. Supersedes the feed-key clause of
[ADR 10](0010-feed-and-queue-sort-differently.md) for one reading of the feed, and only that one.
Capture time stays the feed's key by default, and ADR 10's guarantee holds for it unchanged.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A person routes a note, discards two more, marks a fourth done, and wants to see what they just
did. The feed cannot show it. It is ordered by capture time, so a note captured last week and
routed a minute ago sits a week down. The queue no longer holds it, being unprocessed items only.
The log holds it, as one entry among the taggings, deliveries, mirror writes and suggestions
around it, and it shows actions rather than the items they were about.

ADR 10 says the feed is "immutable true chronology" and that "that guarantee is the feed's entire
job", and it kept `modified_at` out of every ordering so that nothing an item undergoes moves it.

Can the feed be read in the order items were processed without giving that guarantee up?

---

## Decision drivers

- **What the guarantee protects is completeness and the capture order.** A note written offline
  and synced three days later is in the feed, where it was written. That has to hold for the feed
  as it opens.
- **ADR 10 kept `modified_at` out of ordering for a reason that still stands.** Tagging, a
  suggestion decided, an enrichment landing or a delivery arriving would make rows jump for things
  that are not anyone's decision about the item.
- **An order is already the reader's.** Direction was handed to the reader on both surfaces, on
  the argument that what a client shows first is interface policy and core imposes none.
- **Keyset paging needs a key the store can index.** Whatever the order is, it is the position of
  the read ([ADR 14](0014-pagination-by-domain-position.md)).
- **The cache answers offline what the pool answers online.** A key the client cannot read off the
  item it holds is a key the cache cannot sort by.

---

## Considered options

1. **Keep capture time only**, and answer "what did I just do" from the log.
2. **When each item was processed, as a reader's option on the feed**, capture time staying the
   default.
3. **Processing and editing alike**, so an edited unprocessed note also moves.
4. **`modifiedAt` as a reader's option**: the last change of any kind.
5. **When it was processed as the feed's key**, replacing capture time.
6. **A surface of its own** for processed items, ordered by when they were processed.

---

## Decision outcome

Chosen: **option 2**.

**The feed may be read by when each item was processed.** A read of the feed names its key,
`capture` or `processed`, beside its order. Capture time is the default. The queue, the archive
and the log take capture time only.

**An item's processed-at time is its latest processing decision**: the decision time of each
routing record it holds, a pending reservation and a mark by hand included, since the decision is
what processes an item; its archive time while it is archived; and the capture time of each
revision made from it. An unprocessed item's is its capture time. **Nothing else counts**: not an
edit, not classification, not a trigger tag arriving (the reservation it makes counts), not a
suggestion decided, an enrichment, or a delivery landing.

**It is derived, and so it can move backwards.** Cancelling the reservation that set it, a
delivery abandoned, or unarchiving, takes away the fact that made the key, and the key falls back
to the latest one left, down to the capture time. Nothing remembers that the undone decision
happened except the log. This is what makes the key recomputable from the item's own state: from
the pool on a rebuild, and on the wire from the item alone.

**The pool carries it on every item**, as `processedAt`, so a client ranks and places a row under
either key from the copy it holds. It is never `modifiedAt`, which a tag moves.

**The position is the key of the read.** A read by `processed` continues from
`<processedAt>,<id>`, spelled as every position is. A position names a place in the ordering it
was taken from, so one from a capture read handed to a processed read is read as an instant on that
key, and lands wherever that instant falls. `next` carries the key, so a client following it never
mixes them.

**Paging by it is sound for every row whose key holds still.** A decision moves an item to the
newest end. A reader walking newest first who has not reached it will not meet it again this walk,
because it went behind them, to the head. One walking oldest first meets it again at the end. A
key falling back is a return, and may land behind a reader, as an unarchived item does on the
queue. In each case a fresh read shows it where it now sorts, and a client that hears of it places
it.

### Edits do not count

Option 3 would answer "what did I just work on" rather than "what did I just process". It mixes two
questions into one order: an unprocessed note edited a minute ago would sit among the routed ones,
and the reading stops being one a person can trust to show their decisions. It would also make an
edit move a row its editor is looking at, which ADR 21 argued against for the queue, and it would
bring along the case of an item amended under a reservation nothing has tried yet
([ADR 53](0053-a-reservation-nothing-has-tried-does-not-seal-a-capture.md)), processed and still
editable, whose key would move for an edit and a decision both. Keeping edits out keeps the word
honest: the key is when an item was processed.

### ADR 10's reasons, answered

ADR 10 gave three reasons for the feed's key. **"A note written offline sits where it was
written"** survives, because that is the default reading and nothing about it changes. **"Editing
never moves it"** survives too: an edit moves nothing under either key. **"`modified_at` never
affects ordering"** survives as well. The processed-at time is a narrower fact than `modified_at`,
chosen to leave out every change that is not a decision about the item.

What ADR 10 called the feed's entire job is completeness: nothing lost. A reading by when each item
was processed holds every item the feed holds, hides none, and is chosen per read. The guarantee
was never about the order a reader is allowed to ask for.

### Consequences

- **Good**: "what did I just process" is a reading of the feed, paged by the pool and answered by
  the cache offline.
- **Good**: the default reading, and every guarantee stated about it, is untouched.
- **Bad**: the store holds and indexes a second key on items, and every write that moves it has
  to move it in the same transaction. A missed path is a stale key nothing reports.
- **Bad**: a feed read this way reorders under its reader, and a row the reader had not reached can
  go behind them for this walk.
- **Bad**: undoing a decision moves an item back down, which can read as the row vanishing from
  the head. It is the honest consequence of a derived key, and the log still says what happened.
- **Neutral**: unprocessed items sit among the processed ones at their capture time, so the head of
  the reading is decisions and newly captured notes together.

---

## Pros and cons of the options

### Keep capture time only

- **Good**: nothing to build, one key, and ADR 10 stands entire.
- **Bad**: the log answers in actions and in noise. Filtering it to routing and archiving still
  leaves several entries per item, and still does not show the item.

### When each item was processed, as a reader's option

- **Good**: the question is answered by the surface that already holds every item, under the
  filters it already takes.
- **Bad**: a second index, and the write paths that keep it.

### Processing and editing alike

- **Good**: one reading also shows the notes being worked on.
- **Bad**: two questions in one order, an edit moving the row its editor is looking at, and a key
  that moves for an item amended under an untried reservation as well as for its decision.

### `modifiedAt` as a reader's option

- **Good**: the column and its maintenance already exist.
- **Bad**: tagging, enrichment and delivery landing all move it, so rows jump for what nobody
  decided. ADR 10's reason for keeping it out of ordering applies in full.
- **Bad**: it is a store-assigned sequence for sync, and opaque by design. Exposing it as a sort
  key makes it a fact clients reason about.

### When it was processed as the feed's key

- **Good**: one key, and the reading people may want most often after triage.
- **Bad**: the offline capture lands at the time it was processed, and the feed stops being the
  place where something is where it was written. That is the guarantee worth keeping.

### A surface of its own

- **Good**: a narrower question, with nothing unprocessed in it.
- **Bad**: a fifth surface whose items are all on the feed already. The feed's state filter
  answers "processed only" on this reading.

---

## More information

Plan: [feed-reading-options.md](../plans/feed-reading-options.md). Specified in
[core.md](../specs/core.md#the-pool-and-the-feed), [http-v1.md](../specs/http-v1.md#the-feed),
[client.md](../specs/client.md) and [shell.md](../specs/shell.md). Extends the position table of
[ADR 14](0014-pagination-by-domain-position.md) by one row: a feed read by `processed` continues
from `{ at: processedAt, id }`.

Revisit if the queue turns out to want the same reading, or if a fact left out above turns out to
be one people expect to count, the likely one being a delivery landing after a long wait.
