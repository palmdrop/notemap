# 53. A reservation nothing has tried does not seal a capture

**Date**: 2026-09-30
**Status**: Accepted. Amends [ADR 21](0021-an-item-is-editable-until-it-is-processed.md) on what
seals a capture. Everything else in ADR 21 stands, the queue's predicate included.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

ADR 21 seals a capture when it is processed, and a pending routing record processes an item. A
trigger tag reserves a delivery and holds it for a window, so the person can still cancel it,
and nothing is handed to the destination until the window has passed.

In the shell a person captured, opened the edit, added a trigger tag and saved. The tag reached
the pool first and reserved a delivery. The edit arrived at a sealed item and became a revision:
a second capture carrying the trigger tag, which fires nothing, and no routing record. The template
then delivered the words from before the edit. The person saw their note back in the queue,
wearing a trigger tag, with nothing filed from it, while the destination held the version they
had just corrected.

Does a reservation that nothing has tried yet seal the capture it names?

---

## Decision drivers

- **Immutability is owed to what has left the pool** (ADR 21's first driver). While the window
  is open, nothing has left.
- **The window exists so the decision can still be taken back.** Cancelling inside it is real.
  Changing the words inside it is the same kind of second thought.
- **A delivery reads the item when it is tried.** A seal has to hold from the first read, or the
  bytes that land differ from what the item says.
- **One rule for the queue and for editing** (ADR 21's third driver). Every exception to it has to
  be kept in step by hand.

---

## Considered options

1. **Keep ADR 21**: any routing record seals.
2. **Freeze on delivery**: only a landed delivery seals. ADR 21 considered and rejected this.
3. **Freeze once something could have left**: a record seals once its delivery has been claimed
   or attempted, or when it was born delivered. A reservation nothing has tried does not.

---

## Decision outcome

Chosen: **option 3**.

**An item is sealed when it is archived, revised, or holds a routing record that is not a
reservation nothing has tried.** A record is untried while it is pending and its delivery has
never been claimed or attempted. A mark by hand is born delivered and seals at once. A composer
route attempts once before answering, so it seals at once too. In practice the untried
reservation is a trigger tag's, inside its window.

**An edit reaching an untried reservation amends the item in place.** The item stays processed
and out of the queue, and the delivery, when it is tried, carries what the item now says. The
reservation's arguments were expanded from the capture time, the item id and the source, none of
which an edit changes, so the reservation stays valid.

**The check is made inside the edit's transaction, against the delivery's job.** A claim and an
edit both take the write lock. If the edit commits first, the claimed delivery reads the new
words. If the claim commits first, the edit makes a revision. A clock comparison against the
window would leave a gap between the window closing and the claim, so the job is what is read.

### Consequences

- **Good**: an edit that crosses a trigger tag in flight files what the person meant, and makes no
  revision nobody asked for.
- **Good**: the seal follows ADR 21's own reason for sealing more closely than ADR 21's rule did.
- **Bad**: editability and queue membership are no longer one predicate. An item inside its window
  is out of the queue and still amendable. The shell offers editing only on unprocessed items, so
  the pool's wider rule is reached only by an edit already on its way when the tag fired. The
  shell holds a trigger tag added during an edit and sends it only once the edit has landed, so
  its own edits do not race the tag in the first place.
- **Bad**: the store port grows a read, whether a reservation's delivery is still untried.
- **Neutral**: a person who decided to file one version, and then edits it inside the window,
  files the edited one. ADR 21 counted this as a cost of freezing on delivery. Inside the window
  the decision is still being made, so it is the right outcome here.

---

## Pros and cons of the options

### Option 1: keep ADR 21

- **Good**: nothing to build, and one predicate.
- **Bad**: the race above stays: a revision appears in the queue wearing a trigger tag that does
  nothing, and the destination gets the uncorrected words.

### Option 2: freeze on delivery

- **Good**: the strictest reading of what immutability is owed to.
- **Bad**: ADR 21 rejected it because "the bytes that land are not the ones the person decided to
  send". Option 3 accepts that too, inside the window, and answers it there: the window exists so
  the decision can still be taken back, and an edit made inside it is part of the decision. Past
  the window the objection holds in full, and is worse than ADR 21 said. A retrying delivery has
  already read the item and may have reached the destination without the pool hearing back, so an
  edit would make what landed and what the item says disagree.

### Option 3: freeze once something could have left

- **Good**: nothing is amended after a queued delivery has read the item. The one path that reads
  an item before any record exists, the inline attempt, is a gap this option does not close and
  did not open (see below).
- **Good**: it covers exactly the window that exists to be changed.
- **Bad**: the second predicate and the store read above.

---

## More information

Specified in [core.md](../specs/core.md#editing), with the shell's side in
[shell.md](../specs/shell.md).

Two things this rests on, stated in core.md beside the delivery rules:

- **A delivery's lease is released only unused.** A released lease reads as untried, so a host
  that released one after asking for the delivery under it would let an edit change words already
  on their way.
- **An edit arriving during an inline attempt still amends.** A composer route reads the item
  before any record exists, so an edit landing meanwhile finds an unprocessed item, and the
  record that follows names a delivery of the words it replaced. This predates ADR 21 and is the
  same window as a host dying mid-attempt.

Revisit if a reservation other than a trigger tag's ever waits before its first attempt, such as
a scheduled delivery. This rule would then quietly cover it, which may or may not be wanted. Also
revisit if the queue and editability need to be one predicate again, for example if a client has
to decide offline whether an edit amends.
