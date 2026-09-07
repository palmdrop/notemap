# 37. A fired template waits, and a route that never landed gives the tag back

**Date**: 2026-09-05
**Status**: Accepted — amends [ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md)'s
inline first attempt for one path, and extends
[ADR 34](0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

ADR 34 gives a fired template a corner notice carrying the way to cancel while the delivery is
pending. ADR 17 says **the inline attempt is the first attempt**: `route` mints the reservation and
calls the adapter at once, so against a mounted vault the note exists before the call returns. Put
together, the corner offers a cancel on something that has already happened, for exactly the
destination kind most people will configure first.

Two more things sit in the same seam. **Tagging is idempotent**, and firing is on the tagging, so an
item left carrying `route/research` after a route that never landed can never be filed by that tag
again — re-applying it is a no-op. And the tag and the reservation are two writes: a daemon that
dies between them leaves precisely that item, tagged and inert, with nothing to find it.

So: what happens between the tag landing and the bytes landing?

---

## Decision drivers

- **The gesture is one keystroke.** A hand-made route is pressed in a composer with the line and
  the destination on screen; a trigger tag is a tap in a chooser, one row away from a different
  template. The cheaper the gesture, the more the mistake needs an answer.
- **Delivery is not idempotent and cannot be undone** ([ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md)).
  Once bytes are in somebody's vault, a shell offering *cancel* is either lying or deleting a file
  it did not write.
- **ADR 17's inline attempt is a virtue where a person pressed a button** — a mounted vault behaves
  as the synchronous model did, pointer and all — and a liability where the decision was spelled
  as short as a tag.
- **A timer in the daemon is not a mechanism.** The process is a laptop process; it is killed, it
  sleeps, it is restarted by an upgrade. Anything that has to survive that has to be a row.
- **Core performs no I/O inside a transaction** ([core.md](../specs/core.md)), so the write that
  records a decision and the attempt that carries it out are already separate by rule.
- **A trigger tag reads as history.** ADR 34 keeps it on the item after firing because it says why
  the item went where it went. A tag on an item that went nowhere says the opposite of that.

---

## Considered options

1. **Leave it.** `cancel` means *cancel if it is still pending*, which against a local vault is
   never. The corner offers what it can and says nothing when it cannot.
2. **A window before the first attempt.** A fired template makes its reservation and enqueues the
   delivery due a configured moment later; nothing is attempted inline.
3. **Deliver at once, and undo by deleting.** The corner's cancel reaches into the destination and
   removes what was written.
4. **Confirm before firing.** The tag lands, and the shell asks whether to route.

---

## Decision outcome

Chosen: **option 2**, with two rules that only make sense beside it.

**A fired template never attempts inline.** `route` from a template mints the reservation and
enqueues an ordinary delivery job whose `nextAttemptAt` is the configured window from now. Nothing
in the work queue is new: a job with a future `nextAttemptAt` and `attempt` at zero is what a
backed-off retry already is, so a crash inside the window costs nothing — the job is a row, and the
dispatcher claims it when it comes due exactly as it claims a retry. **The window is host
configuration**, beside the retry policy and the sweep's grace window, on the terms `core.md`
already sets for operational knobs.

**A route made by hand is unchanged.** ADR 17's inline attempt stands where a person pressed
`route` in the composer with the destination and the line in front of them: the decision was
reviewed as it was made, the vault is mounted, and the pointer comes back with the call. What is
being bought here is a window on the gesture that has no review in it, and paying for it everywhere
would make every hand-made route slower to serve a mistake that surface does not make.

**The tag and the reservation commit in one transaction.** There is no I/O to exclude from it any
more — the attempt is a job by construction — so the state *tagged but not reserved* cannot exist,
and no sweep has to exist to find it. This is what makes the offline case need nothing: an outbox
drains a `tag` operation, the daemon tags and reserves in one write, and the window opens then.

**A reservation a trigger tag made, removed without delivering, takes that tag with it.**
Cancelling within the window untags. So does abandonment — an `establish` template whose folder was
moved is `rejected`, abandoned on the first attempt, and the item comes back to the queue with the
tag gone. Two reasons, and the first is mechanical: tagging is idempotent, so an item that keeps the
tag can never be filed by it again, and the queue slowly fills with items wearing a tag that does
nothing. The second is the one ADR 34 already argued for the opposite case — the tag is on the item
exactly when it filed it somewhere, which is what makes it readable a year later and what a filter
is written against.

**Only a tag-fired route untags, so the record has to say it was one.** A template taken in the
composer is a decision a person made with the line in front of them, and the item may carry the
trigger tag for their own reasons — cancelling that route must leave their classification alone.
The record already names its template ([ADR 34](0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md));
it also says whether the tagging made it, which is one more thing the log wants anyway.

What does not change: a **delivered** record keeps its tag, and **untagging still does not unroute**.
The rule is one-directional, and it is about a reservation that never became a record.

**The corner says which it is.** While the window is open it reads `routing · research` and carries
`cancel`; when the record resolves it reads `routed · research` and carries nothing but the way to
dismiss it. That is the whole of the window's visibility — no countdown, no bar — and it keeps the
notice from claiming an item was filed somewhere before anything was written.

**Why not option 1.** It makes the corner's cancel a coin flip on destination kind: real against a
sleeping WebDAV vault, never against the local one. A control that works depending on what somebody
configured is worse than no control.

**Why not option 3.** Deleting from a vault is a write notemap did not decide to make, against a
file a person may have edited in the seconds since. It also cannot work: the capability is
`create-or-append-file`, so undoing an append means rewriting somebody's note.

**Why not option 4.** It puts a confirmation on the gesture whose entire point was to be one
gesture, and it is the composer opening to re-ask a settled question — the thing ADR 34 rejected
option 2 over.

### Consequences

- **Good** — the cancel in the corner is real, for every destination kind, and it is the only thing
  standing between a mistyped tag and somebody's vault.
- **Good** — a crash between the tag and the bytes is ordinary and needs no reconciliation: either
  the transaction committed and a due job is waiting, or it did not and nothing happened.
- **Good** — the queue never fills with items wearing a spent tag, and a template whose folder
  moved hands back an item that can be re-tagged once the folder is fixed.
- **Bad** — an item filed by tag reaches the vault a configured moment later than one filed by
  hand. For the local vault that is the difference between *instantly* and *shortly*.
- **Bad** — the daemon owns a third timing knob, and a window set to zero re-creates the problem
  this record exists to solve. It is configuration, so it can be got wrong.
- **Bad** — the untag on cancel is a change to classification that no person asked for directly.
  The log has to say the template's firing was cancelled and the tag came off with it, or the tag
  will look like it removed itself.
- **Neutral** — the `tag` call answers the reservation rather than a delivery outcome. Nothing reads
  it for one: a shell learns what landed from the log, which is what
  [ADR 32](0032-a-shell-learns-what-happened-by-reading-the-log.md) already decided.
- **Neutral** — a tag drained from an outbox onto a daemon nobody is watching opens a window nobody
  is there to use, and then delivers. The window costs the unattended case nothing but time.

---

## Prior decisions this rests on

- [ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md) — the inline first attempt,
  amended here for one path, and the reservation that is removed rather than logged when nothing
  landed.
- [ADR 34](0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md) — firing is on the
  tagging, the tag stays on a delivered item, and the corner stands with a way to cancel.
- [ADR 36](0036-a-folder-is-created-required-or-established-once.md) — a missing folder is
  `rejected` and hands the item back, which is the abandonment case the untag rule has to cover.

## More information

Revisit if the window is felt as lateness rather than as safety — the answer then is a shorter
window rather than an inline attempt, since the inline attempt is what makes the cancel a lie. Also
revisit when a rule table or fan-out arrives: one gesture reaching two destinations makes *cancel*
a question about which of them, and this record answers only the single-destination case.
