# 64. A re-read answers to the source's word, and a divergence continues

**Date**: 2026-10-20
**Status**: Accepted. Amends [ADR 39](0039-a-relay-is-outside-notemap-and-reaches-v1-like-anything-else.md)
on what a second upstream edit does, and
[ADR 34](0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md) on what a revision
carries.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A relay re-reads everything it watches on every poll, and the pool's dedup on
`(source, sourceItemId)` is what makes that harmless (ADR 39). The dedup compared a re-read against
what the item says *now*. Once a person had amended a relayed item in the shell, every re-read of
the unchanged upstream item looked like an upstream edit. The relay then sent the upstream words
back as an edit. Inside the queue that amended the person's words away without telling anyone.
Once the item was routed, it made a revision holding the old words. That revision inherited the
trigger tag that had filed the original, and sat in the queue looking like the original.

ADR 39 also accepted that each upstream edit to a processed item revises the item that holds the
plain identity. An item edited upstream three times after delivery got three sibling revisions.

What should a re-read be compared with? What happens when upstream and a person have both changed
an item? Where do later upstream edits go?

---

## Decision drivers

- **A re-read is not an edit.** Polling must cost nothing when nothing upstream changed, whatever
  happened in the pool since.
- **No branching.** Notemap does not hold two competing versions of one item. A conflict between
  two edits is resolved by making a second item, not a fork.
- **A relay holds nothing.** Whatever the decision needs must be in the pool or in what the relay
  already reads upstream.
- **A trigger tag on an item says that tag filed it.**

---

## Considered options

1. **The pool remembers what the source last said** and compares a re-read with that.
2. **The relay sends its upstream version** on capture, and the pool stores it and compares
   versions.
3. **Leave it**, and document that editing a relayed item is unsafe.

---

## Decision outcome

Chosen: **option 1**.

**An item keeps the source's word**: what the source last said for it, kept only while the item
says something else. A capture from a source says the source's word by definition. An edit from
the line's own source makes its payload the source's word again. An edit from anywhere else keeps
the word the item had.

**A line is an identity and everything that follows from it**: the item holding the identity, the
revisions made from it, and the continuation made when it diverged. Its source is the source of
the item holding the identity. Its **head** is reached by following the latest revision, then the
continuation, until there is neither. A revision made from another source carries the source's word
forward, so the word belongs to the line rather than to one row.

**A re-read resolves to the head of its line**, and is compared there:

- It says what the head says, or what the source last said → `already-captured`, answering the head.
- It says something new, and the head still says the source's word → `source-item-changed`,
  naming the head. The relay edits the head, so a second upstream edit revises the first
  revision rather than making a sibling of it.
- It says something new, and so does the head → `source-item-diverged`, naming the head.

**A divergence continues.** The relay captures afresh under an identity of its own, naming the
head it **continues**. The continuation is an ordinary capture: it starts unprocessed, processes
nothing, and becomes the line's head, so later re-reads resolve to it. A line has at most one
continuation per item. The person's edit stays exactly where they made it.

**A revision does not carry trigger tags.** Every other tag carries over as before.

### Consequences

- **Good**: a person's edit to a relayed item survives every poll, and an unchanged upstream costs
  one request.
- **Good**: a conflict produces something a person can see and decide about, rather than a silent
  overwrite.
- **Good**: upstream edits to a processed item form a chain, one revision after the other.
- **Bad**: the source's word is a second payload on an item that has been edited locally, and it
  rides on the wire and in the mirror.
- **Bad**: finding the head walks the line on every re-read. Lines are short, but every poll
  re-reads everything.
- **Neutral**: an item amended before this decision has no source's word, so its amendment reads as
  the source's. Its first re-read after the change still looks like an upstream edit, once.
- **Neutral**: re-adding a trigger tag to a revision fires it, which is how a revision gets filed.

---

## Pros and cons of the options

### Option 1: the source's word

- **Good**: nothing changes on the wire for a source, and it works for any source that re-reads.
- **Bad**: one more stored payload, and the line walk.

### Option 2: the upstream version

- **Good**: the comparison is a string, and it says exactly what changed upstream.
- **Bad**: it only works for a source that has a version to send, and changes the envelope. The
  pool still has to know whether the person edited the item, which is the source's word again.

### Option 3: leave it

- **Bad**: the shell offers `edit` on every queue row, a relayed one included, and the failure is
  silent.

---

## More information

Specified in [core.md](../specs/core.md#editing) and [http-v1.md](../specs/http-v1.md). Planned in
[relay-re-reads-and-local-edits](../plans/relay-re-reads-and-local-edits.md).
