# 66. A delivered record may be withdrawn

**Date**: 2026-10-26
**Status**: Accepted — amends [ADR 59](0059-one-block-per-file-and-a-multi-block-delivery-names-its-channel.md)'s
pointer for a multi-block delivery, and extends
[ADR 37](0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md)'s tag
give-back to a record that did land
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A delivered routing record says bytes reached somewhere. What happens to them afterwards is the
destination's business: a person deletes the note, empties the file, removes the block. Notemap
goes on reading the item as processed, keeps it out of the queue, and seals it, on the strength of
a delivery nothing now holds. Cancelling is for a reservation, and for a mark by hand that never
reached anywhere. Neither can be reused for this. Removing a delivered record erases something that
did happen.

So how does a person tell notemap that a delivery no longer stands?

---

## Decision drivers

- **The routing log is append-only.** A record that is not pending means bytes reached somewhere,
  and that stays true after the bytes are gone.
- **Notemap cannot verify a destination's contents.** A file still being there does not mean the
  routed words are in it. An appended entry may have been edited away from a file that is still
  there.
- **Trust the person.** The person withdrawing knows what they did in their vault. Notemap informs
  them and does not overrule them.
- **A trigger tag is how a template is applied.** Tagging is idempotent, so an item that still
  carries the tag can never fire it again.

---

## Considered options

1. **Delete the record**, as cancelling a mark by hand does.
2. **Mark the record withdrawn and keep it.**
3. **Append a second record** that cancels the first out.

---

## Decision outcome

Chosen: **Option 2**. The record gains `withdrawnAt`, the action log gains `delivery-withdrawn`,
and a withdrawn record stops counting: not processed, not `processedAt`, not the `routed` filter,
not the destination filter, not a destination's usage, not the item's routing summary, and not
**sealed**. The log and the item's records go on showing it.

**Only a delivered record that names a destination is withdrawn.** A pending one is cancelled, and
a mark by hand keeps its cancel. Withdrawing one that is already withdrawn, or of any other kind, is
refused.

**Withdrawal unseals.** A withdrawn record seals nothing, so an item with nothing else sealing it
(another delivered record, an archive, a revision) is edited in place again. The bytes did go out.
Making the next edit a revision would protect the record's account of what was sent, and that
account is already held in the record's output.

**A withdrawal is restored by the same path**, and `delivery-restored` is appended. It is refused
once the item has been edited since the withdrawal. Otherwise the record would come back naming a
delivery of words the item no longer holds, and the edit made in place would have been made to a
sealed item. A shell offers restore only in the view the withdrawal was made in, until the person
leaves that view or starts an edit.

**A trigger tag goes with the record.** Withdrawing a record that its tag fired removes the tag, so
applying it again routes again, as ADR 37 already does for a route that never landed. Restoring
puts the tag back if the item does not hold it, through a tagging option that adds a tag **without
firing** its template. Firing on restore would make a second delivery of a decision that is being
put back.

**A destination may be asked whether what a record points at is still there**, through an optional
`locate` that answers `present`, `absent` or `unknown`, with a count where a record names several
things. Core never asks it and never makes withdrawal depend on it. It is for the shell's confirm
step, which says what was found and nothing more: "the file is still there", never "the note is
still there".

**A multi-block Arena delivery keeps every block's id** on the record, beside the pointer that
still names the channel, so `locate` can check each one. This amends ADR 59, which kept them only
in the output's prose. A record made before this answers `unknown`.

### Consequences

- **Good** — a delivery that no longer stands stops holding the item out of the queue, and its
  history survives.
- **Good** — a mistaken withdrawal is undone without a second delivery, tag included.
- **Bad** — "every sealed item is processed" now holds because a withdrawn record seals nothing,
  rather than because no processed fact can be taken away from a sealed item. Accepted.
- **Bad** — restore is refused after an edit, which a person who wanted the record back after
  fixing a typo will find surprising. Accepted. The alternative is a record that lies.
- **Neutral** — `locate` is advisory. A kind without it answers `unknown`, and the shell asks
  plainly.

---

## Pros and cons of the options

### Option 1 — delete the record

- **Good** — nothing new in the model. Cancel already does it.
- **Bad** — erases a fact. The log could say what happened, but the record, its output and its
  pointer would be gone.

### Option 2 — mark it withdrawn

- **Good** — appends a fact and erases none. Restore is clearing one field.
- **Bad** — every reader of records has to leave withdrawn ones out.

### Option 3 — a cancelling record

- **Good** — strictly append-only, with no field changing.
- **Bad** — a record is one delivery, and this would be a record of no delivery. Every reader would
  pair records to find out what counts, which is option 2's cost and more.

---

## More information

Plan: [withdraw-a-routing-record](../plans/withdraw-a-routing-record.md). Revisit if `locate` turns
out to be worth enforcing, e.g. if people withdraw records whose notes are still there by mistake
often enough that a stronger prompt is wanted.
