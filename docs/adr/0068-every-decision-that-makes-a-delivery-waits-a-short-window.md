# 68. Every decision that makes a delivery waits a short window

**Date**: 2026-11-01
**Status**: Accepted — amends [ADR 37](0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md),
which kept a hand-made route inline, and [ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md)'s
inline first attempt, which no path now makes
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

ADR 37 gave a fired template a window before its first attempt and kept a hand-made route inline.
It reasoned that the composer *is* the review: the line, the destination and the preview are on
screen when the button is pressed, and paying for a window everywhere would slow every hand-made
route to serve a mistake that surface does not make.

The mobile redesign removes that review. A template is applied with one tap from the item, and the
shell moves straight to the next item. Against a mounted vault, the note exists before the tap's
answer arrives, so an `undo` offered on it would be a lie or a deletion.

Should a decision a person makes by hand wait before it is carried out?

---

## Decision drivers

- **Delivery cannot be undone** (ADR 17). An offer to take something back is honest only while
  nothing has been written.
- **The gesture is getting shorter.** One tap on a template from the item is as short as a trigger
  tag, which is what ADR 37's window was for.
- **Two delivery paths for one gesture** — inline here, deferred there — is what ADR 37 already
  tried not to keep.
- **A person is looking at the screen.** The window for a hand-made route needs only to be long
  enough to read a notice and reach `undo`. The trigger window covers a tag drained onto a daemon
  nobody may be watching.

---

## Considered options

1. **Keep hand routes inline** (ADR 37 as it stood). `undo` only where the destination happened to
   be unreachable.
2. **A short window on every decision that makes a delivery**, by hand or by a template taken from
   the composer, on its own setting.
3. **One window for both**, reusing `routing.triggerWindow`.
4. **Undo by deleting** what was written. Rejected in ADR 37 for the same reasons, which still hold.

---

## Decision outcome

Chosen: **option 2**.

`route` checks everything it checked before (`prepare`), writes the reservation, and enqueues the
delivery job due `routing.undoWindow` after the decision. Nothing is attempted inline. The default
is **5 seconds**: a success notice leaves the status line after 4, and a window shorter than the
time it takes to read one and reach `undo` makes the offer a lie. A window of `0` makes the job due
at once, still through the job runner, so one path carries every delivery. The trigger window is
separate and unchanged.

The decision writes a `routed` entry carrying `until`, the moment the window closes, so a shell
counts down to a fact as it does for `template-fired`. The landing writes the `routed` entry it
always did, carrying the pointer. A `routed` entry with `until` is a decision, not a landing.

**Undo** is the shell's word for cancelling the decision just made, offered only while its
delivery is pending. It is the same call as **cancel**, which any pending reservation offers.
**Withdraw** is for a delivered record and is never called undo (ADR 66). Discard and a manual mark
make no delivery, and keep `undiscard` and the mark's `undo`.

### Consequences

- **Good** — `undo` is true for every decision that makes a delivery, against any destination.
- **Good** — one delivery path: the job runner. Attempt numbering starts at the job's first attempt
  everywhere.
- **Bad** — **the route call no longer answers with where the note landed.** It answers a pending
  record and `until`; the pointer arrives in the log. A shell draws the pending record first.
- **Bad** — **a destination's refusal arrives after the window.** `422 rejected-by-destination` and
  `delivery-outcome-unknown` leave the route call. The reservation is removed when the delivery
  fails for good, the item returns to the queue, and the decision the person typed is gone from
  the composer. The shell says the failure in a notice, as it says a fired template's. Checkable
  refusals stay on the call.
- **Bad** — every route waits at least the window. A person filing one note and opening the vault
  at once sees it a few seconds later.
- **Bad** — tests can no longer read a delivery off the route call. They route, then run the due
  jobs, with the window at `0`.

---

## Pros and cons of the options

### Keep hand routes inline

- **Good** — the note is there when the call answers, pointer and all.
- **Bad** — `undo` is a lie against a mounted vault, which is the first destination most people
  configure. The redesign's one-tap routes have no review to stand in for it.

### One window for both

- **Good** — one setting.
- **Bad** — fifteen seconds is long when a person is watching, and five is short for a tag drained
  from a phone onto a daemon nobody is looking at.

### Undo by deleting

- **Bad** — reaches into a vault to remove a file notemap cannot prove it alone wrote, and an
  append cannot be taken back at all.

---

## More information

Plan: [features from the mobile rethink](../plans/features-from-the-mobile-rethink.md), W1–W5.
ADR 37's revisit note foresaw this: "the answer then is a shorter window rather than an inline
attempt".

Revisit if the window is felt as lateness, by measuring how often `undo` is pressed. If almost never,
a shorter default. If a fan-out arrives, one gesture reaching two destinations makes `undo` a
question about which of them.
