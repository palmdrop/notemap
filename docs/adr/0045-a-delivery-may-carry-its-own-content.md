# 45. A delivery may carry its own content, and the reservation holds it

**Date**: 2026-09-10
**Status**: Accepted — extends
[ADR 19](0019-a-destination-converts-and-the-delivery-records-what-went.md) and amends one line of
[ADR 33](0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A capture is typed in a hurry. On the way out it wants a word fixed, a sentence cut, a heading put
on it — and it wants that for **this** delivery, because the same capture is also going somewhere
else where none of those changes make sense.

`todo.md` has carried *routing edits* since the beginning and settled it on 2026-08-24 as **amend,
then route**: two operations that already exist, made one gesture by a frontend. The same entry
carries a `NOTE` against its own settlement, and the note is right. An item routed twice in two
wordings has no single amended form. The last route would win, the capture would end up a function
of its delivery history, and the first destination would hold words the pool no longer has.

That is the objection [ADR 19](0019-a-destination-converts-and-the-delivery-records-what-went.md)
raised against amend-then-route as a **conversion** mechanism, reached again from the editing side
and unchanged by the trip. So the question is not whether amendment can be made to serve. It is
where a person's own words for one delivery live, given that the capture cannot hold them.

---

## Decision drivers

- **The capture is immutable once processed, and non-destructive while it is not.** Routing
  delivers a copy ([core.md](../specs/core.md)), and nothing about where an item is going may
  change what the pool holds.
- **One item, several destinations, several forms.** Whatever holds the words has to be per
  delivery, or the second delivery overwrites the first's.
- **A reservation is attempted from the record alone.** A deferred delivery reads a record hours
  later, so anything the decision carries has to be durable, mirrored, and replayed.
- **A reservation is a pure decision** ([ADR 33](0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md)).
  That line was written to keep a *converted output* out of the record. Whether it also keeps out a
  person's typing is exactly what this decision has to answer rather than assume.
- **Core holds no formats.** Whatever this is, it cannot become core learning what a destination's
  dialect looks like.

---

## Considered options

1. **Amend the capture, then route it** — the settled line, reached from the editing side.
2. **Clone the capture and route the clone** — `todo.md:136`'s note. No new machinery.
3. **The delivery carries its own content** — a field of the request beside the arguments, checked
   against the item's payload type and substituted into the delivery, held on the routing record.

---

## Decision outcome

Chosen: **the delivery carries its own content**, and the reservation holds it.

The request gains a `content` beside its `arguments`. Core validates it against the item's payload
type's own `contentSchema` — the identical check a capture gets, refused as `content-invalid` with
issues — and substitutes it into the payload it hands the adapter. The capture is untouched. The
routing record's destination target keeps the content, so what went is answerable per delivery
rather than per item, and a delivery deferred for six hours replays the words the decision was made
with.

Absence is the ordinary case and means *use the item's*. There is no flag: a record written before
this existed, and every record nobody rewrote, carry no content and behave exactly as they did.

### You own the words; the destination owns the shape

The content is the **input** to a conversion, never a replacement for one. A template's `- [ ]`,
the frontmatter, the `#tag` foot and the asset links all apply to the supplied words exactly as
they would have applied to the capture's. The two compose, and a person who rewrites into a
todo-list destination still gets a todo entry.

`payload.assets` sits outside `content` and is not touched, so a rewrite cannot silently drop a
picture. That is not a nicety: content and assets are separate fields of a payload precisely
because the words are the person's and the attachments are the capture's.

### Why this is not the bytes ADR 33 refused

ADR 33 refused a **binding preview**: the destination's converted output, committed with the
decision. Three things were wrong with it, and each of them turns on the output being the
*destination's*.

It would have to be produced before the destination was reached, which for `append-to-file` means
guessing what the note holds. It goes **stale**, because the right answer depends on the
destination at the moment of writing, and `create-or-append-file`
([ADR 31](0031-the-adapter-decides-create-or-append-at-delivery.md)) does not know which of the two
it is doing until it holds the vault. And it would freeze an answer to a question that had not been
asked yet.

Supplied content is none of those. It is produced **before** the destination is reached because
that is the only place it can come from — a person typing. It cannot go stale, because a decision
about what to say is not an answer about what a file currently contains; it is as true in six hours
as it was when it was typed. And it is not an answer to any question the destination will be asked.

So the line ADR 33 drew is narrowed rather than moved: **a reservation may not carry a
destination's answer, and may carry a person's decision.** The arguments on a record have always
been the second kind, and this is one more of them. What would have to be true to widen it further:
nothing produced by asking a destination anything belongs on a record before the delivery runs, and
that includes a preview a person looked at and liked.

### Where a hand-made conversion is configured

`todo.md:140` asks whether a conversion is configured in the delivery's arguments or in destination
config. For the hand-made half this answers it: **content is a first-class field of the request,
beside the arguments rather than inside them.**

A path and a person's prose are not the same kind of thing. Arguments are the capability's, shaped
by a schema the capability publishes and interpreted by the adapter; content is the item's, shaped
by the payload type's schema and interpreted by nobody. Putting the words inside `arguments` would
make every capability declare a field for them, make core unable to check them against anything,
and hand a destination the right to reinterpret what a person wrote. The automatic half — a
template or a model producing the content rather than a person — stays open.

### Why not amend, and why not clone

**Amending** is the dead end ADR 19 already recorded, and nothing about approaching it as an
editing gesture rather than a conversion mechanism repairs it. One amended form cannot serve two
destinations; the last route wins; the pool's copy becomes a function of its delivery history. It
is also the wrong act to reach for by reflex, which is why the row keeps `edit` and the composer
gains a different word. Two controls an aisle apart both called `edit` is how somebody permanently
rewrites a capture meaning to fix one delivery.

**Cloning** costs no new machinery, and that is its whole appeal. It makes an item nobody asked
for, puts a twin in the queue that has to be processed or discarded, and answers "what did I send?"
with a second capture whose relationship to the first is a link a person has to follow. An item is
a thing with a lifecycle; a delivery's wording is not one.

### Consequences

- **Good** — one capture reaches two destinations in two wordings, and each routing record holds
  the one it sent. "What did I actually send?" is answerable from the decision as well as from the
  output.
- **Good** — the capture is untouched, so nothing about where an item went can change what the pool
  holds. `edit` keeps meaning what [ADR 21](0021-an-item-is-editable-until-it-is-processed.md) says
  it means.
- **Good** — a rewrite works against a sleeping vault, because the reservation carries the words
  and every retry replays them.
- **Bad** — a record now holds a copy of a capture's prose, per rewritten delivery, and the mirror
  carries it. Records were small; some will not be. Nothing here caps it, and a bound would want to
  arrive beside the host's other operational knobs rather than as a rule core invented.
- **Bad** — two ways to change words, one item apart, and the difference between them is real but
  has to be taught. The names are the whole defence.
- **Neutral** — a preview of a rewrite costs nothing extra to build: `prepare` is shared, so
  previewing rewritten words works the moment routing them does.

---

## Pros and cons of the options

### Amend the capture, then route

- **Good** — reuses an operation that exists, and the amended text is visible in the queue.
- **Bad** — cannot serve two destinations from one item; the last route wins.
- **Bad** — rewrites a capture because of where it is going, which nothing else in the model does.

### Clone the capture and route the clone

- **Good** — no new machinery at all; the clone is an ordinary item and routes like one.
- **Bad** — makes an item nobody asked for, and puts a twin in the queue.
- **Bad** — the wording of one delivery becomes a thing with its own lifecycle, feed position,
  tags and enrichment.

### The delivery carries its own content

- **Good** — per delivery by construction, so two rewrites of one capture cannot interfere.
- **Good** — checked by the identical schema a capture is checked by, so nothing new is learnt
  about what a payload may be.
- **Bad** — puts a person's prose on the routing record, mirrored and replayed.

---

## More information

Plan: [routing-edits](../plans/routing-edits.md). The ADR is phase 1 because everything else rests
on the distinction above; core is phase 2, the wire and the client phase 3, the composer phase 4.
`CONTEXT.md` gains **Rewrite** in the same change, drawing its own line against *amendment*,
*revision*, *edit* and *conversion*, each of which is already a different act.

Revisit if the automatic half of `todo.md:140` lands: a conversion configured on a template or a
destination produces content the same way a person does, and whether it goes through this field or
another one is a question that decision gets to ask. Revisit the absent bound if a long capture
makes records unpleasant to read or to page.
