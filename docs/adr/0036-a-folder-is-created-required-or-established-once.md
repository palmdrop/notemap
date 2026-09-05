# 36. A folder is created, required, or established once

**Date**: 2026-09-05
**Status**: Accepted — answers the fourth-name question left open by
[ADR 31](0031-the-adapter-decides-create-or-append-at-delivery.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

Every capability that writes files makes the folders it needs. That is deliberate — ADR 31 records
why, and the composer draws the folders it is about to create as `+ drafts/` so nobody is
surprised.

A template repeats one decision daily, which turns that from a one-off surprise into a slow one. If
`research/` is renamed, moved, or lost with a vault reorganisation, a template pointed at it does
not fail: it makes a new `research/` in the old place and keeps filing into it, and the first
evidence is a folder full of notes nobody meant, found later.

The obvious guard does not work. A probe answers *reached*, not *writable*, and nothing consults
one before a delivery; `candidates` answers what is there *now*, and a template routes against
destinations that are routinely asleep, which is the property deferred delivery rests on. Checking
at the moment of the decision checks the wrong moment.

ADR 31 anticipated this exactly, and declined to solve it: *"A capability that means this must
already exist does not exist, and if a rule ever wants one it is a fourth name, not a
reinterpretation of this one."*

The rule wants one. So: how does a template say the folder must be there, when is that checked, and
is ADR 31's fourth name the right shape for it?

---

## Decision drivers

- **A template must be routable against an unreachable destination.** This is the whole of deferred
  delivery, and a guard that requires the vault to be up at decision time removes it.
- **The check has to happen where the vault is held**, which is the adapter, at the moment of the
  write — ADR 31's own reasoning, applied to a different fact.
- **A folder that is legitimately not there yet is the common first case.** A person configuring a
  template for a project they are starting has no `research/` folder. Demanding one before the
  first capture is demanding they go and make it by hand, which is the friction the template was
  supposed to remove.
- **A missing folder is not a transient failure.** It will not come back on its own, and retrying
  past it is retrying past a thing that needs a person.
- **The precondition is orthogonal to the three capabilities**, applying identically to
  `create-file`, `append-to-file` and `create-or-append-file`.

---

## Considered options

1. **A fourth capability**, as ADR 31 instructed — a name meaning *file into a folder that is
   already there*.
2. **An argument on the file-writing capabilities**, resolved to a concrete value when the decision
   is made.
3. **A setting on the destination** — *this vault's folders are mine; never make one*.
4. **A check in the settings view and nowhere else** — say the folder is gone when a person looks,
   and let the delivery do what it does.

---

## Decision outcome

Chosen: **option 2**, with three modes on the template and two values reaching the adapter.

A template states its **folder mode**:

- **`create`** — missing folders are made, every time. What happens today.
- **`require`** — a missing folder refuses the delivery.
- **`establish`** — the first delivery creates it, and every one after that requires it.

**`establish` never leaves the template.** The template records **when it was established**,
written in the transaction that stores the first *delivered* record naming it, and the mode is
resolved at decision time: unestablished resolves to `create`, established resolves to `require`.
So the arguments on a record are always the two-valued thing, the adapter never hears the word
`establish`, and the record is honest about what it asked for.

**Editing a template's literal path clears its establishment.** A changed prefix is a different
place, and establishment does not carry to it. Without this rule a deliberate reorganisation bricks
the template, and the only way out is guessing that re-saving is what fixes it.

**The check is the adapter's, at delivery, and a missing folder is `rejected`.** So routing against
an unreachable destination stays exactly as free as it is now: the reservation is made, the item
leaves the queue, and the delivery waits. When the destination comes back the folder is looked for,
and if it is gone the delivery is refused — which
[ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md) abandons on the first attempt,
since `rejected` is proof the destination was reached and said no. Abandoning removes the
reservation and **the item resurfaces in the queue**, at its unchanged content time, with the
decision handed back. That is the whole of the behaviour wanted here, and none of it is new: the
only new code is the adapter looking before it writes.

**Why not option 1, against ADR 31's own instruction.** Two reasons, and the first is ADR 31's
other rule. A capability is named after *the outcome a person wants*, and the outcome here is the
same outcome — a note, in a folder — under a condition about the world. A condition is not an
outcome, so naming it as one is spending the vocabulary on the wrong axis. The second is that the
axis is orthogonal: as names it turns three capabilities into six, all of them long, and every kind
that writes files owes all six.

ADR 31 rejected a flag because `ifPresent: "append"` forked one capability's write path, its
failure modes and its retry semantics on a boolean — a fair charge there, and it does not reach
this. A folder mode forks nothing: it is one look before an unchanged write, whose only new outcome
is `rejected`, which the port already has and already knows what to do with. So the fourth-name
instruction is answered rather than ignored, on the ground that this is not the kind of thing that
was being named.

**Why not option 3.** `establish` is per-template state by construction — a daily-note template
creating month folders and a research template requiring one can point at the same vault — so a
destination-level switch cannot express the case that motivated the whole thing.

**Why not option 4.** It finds out after the fact, which is what already happens; and it cannot see
a folder lost between two glances at the settings page.

**A person inspecting templates gets a live answer, and it is wider than folders.** Each template
draws a **report**, asked per row exactly as the destinations section already asks its own, saying
whether the destination can support it *now*: the destination retired or unusable, the capability no
longer declared, the arguments no longer validating against the current `argumentsSchema`, or — for
`require` and an established `establish` — the folder not there.

**An unreachable destination means *cannot say*, not *gone*.** The shell learned this the expensive
way: `gone` was drawn beside the composer's place line until it was removed on 2026-09-04 for
reading as an alarm about an ordinary condition. A sleeping WebDAV server must not light up four
templates in the accent. The settings page may say more than the composer's ghost — a person went
there on purpose — but the difference between *not there* and *not asked* is the whole value of the
report.

### Consequences

- **Good** — a moved folder fails loudly, at the first delivery after the destination comes back,
  and the item comes back to the queue with the decision in the person's hands.
- **Good** — the first capture into a project that does not have a folder yet still works, which is
  what `establish` is for and what a plain `require` would have made annoying.
- **Good** — nothing about deferred delivery changes. A template is as routable against an asleep
  vault as a hand-made decision is.
- **Bad** — `require` costs one extra look per delivery. Against a remote kind that is one more
  round trip on a path that is already doing several.
- **Bad** — the establishment is a fact stored about a template that a person can get wrong, by
  moving a folder and re-saving the path without noticing they cleared it. The report is what makes
  that visible.
- **Neutral** — an `establish` template whose first delivery was abandoned is still unestablished,
  so the next one creates. Correct: nothing landed.
- **Neutral** — two routes made from an unestablished template before either delivers both resolve
  to `create`. The second finds the folder there and carries on.
- **Neutral** — `create` stays the default, so a template that says nothing behaves as every
  routing decision behaves today.

---

## Prior decisions this rests on

- [ADR 31](0031-the-adapter-decides-create-or-append-at-delivery.md) — folders are made
  deliberately, capabilities are named after outcomes, and the fourth name this ADR declines.
- [ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md) — `rejected` is abandoned on
  the first attempt, which is why a missing folder hands the decision back rather than retrying.
- [ADR 30](0030-a-destination-can-be-asked-whether-it-is-really-there.md) — `ready` means reached,
  not writable, which is why the probe is not the guard here.

## More information

Revisit if a destination kind appears whose folders cannot be looked up at all — the check is a
promise `require` makes, and a kind that cannot keep it has to say so rather than pass silently.
