# 19. A destination converts, and the delivery records what went

**Date**: 2026-08-17
**Status**: Accepted — extends [ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md)
and the routing section of [core.md](../specs/core.md). **Not implemented**; recorded while the
reasoning is fresh, because the alternative it rejects is one that will be proposed again.

---

## Context and problem statement

Routing is going to reshape content. `todo.md` wants templates, per-destination formats, and a
local model turning a loose capture into a TODO entry or a prose paragraph. A note bound for a
daily log is not the same text as the same note bound for a project file.

Two questions fall out, and they are usually confused for one:

1. **Who converts** — does the capture get rewritten before it is routed, or does the destination
   reshape a copy on its way out?
2. **What is remembered** — once the bytes that landed differ from the bytes in the pool, how does
   anyone find out what was actually sent?

---

## Decision drivers

- **Routing delivers a copy** ([core.md](../specs/core.md)). The item stays in the feed, and one
  item may go to several destinations.
- **Enrichment never mutates a capture**, and neither does anything else. The capture is immutable
  from the moment it enters the pool.
- **Dialects belong to destinations** ([standards.md](../standards.md#routing-dialects-one-item-many-destinations)).
  Core holds no formats, the way it holds no capability names.
- **Everything that leaves the pool carries identity and provenance**
  ([standards.md](../standards.md)). A pointer saying *where* something went, with no record of
  *what* went, is half a provenance trail.
- Core takes configuration as data but never sources it, and performs no I/O of its own.

---

## Considered options

1. **Amend, then route** — an auto-edit rewrites the capture into the destination's shape, and the
   amended item is delivered.
2. **The destination converts a copy**, and nothing about the item changes.
3. **Core converts**, running a template or a provider and handing the adapter finished content.

---

## Decision outcome

Chosen: **the destination converts a copy**, and the delivery records the bytes that landed.

### Option 1 is a dead end, not a trade-off

It looks attractive because it reuses amendment, which already exists. It cannot work.

An item may be routed to three destinations in three dialects. There is no single amended form
that serves them, so the last destination to route would win and the pool would end up holding
whichever dialect happened to go last — with the original gone. That contradicts routing being
non-destructive, contradicts the capture being immutable, and quietly makes the pool's copy a
function of its delivery history.

It is written down here because it is the obvious idea, and it will be proposed again by anyone
who notices that amendment already exists.

### Option 3 puts formats in core

Core would need templates, a renderer per payload type, and a way to reach a provider — all of
which are the things ADR 8 and `standards.md` deliberately keep out. The destination already
receives everything durable about the item and is where the dialect lives.

### The state this needs already exists

A delivery that is mid-conversion is a **pending reservation**
([ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md)): the record is pending, the
job is leased, the adapter is working. Conversion is simply part of what `deliver` does, whether
that is string formatting or a call to a local model. The lease covers it and `extend` exists for
a slow one; a host that dies mid-conversion lands on the unknown-outcome rule and is abandoned
rather than retried.

No new job kind, no new record state, no new outcome.

**This is only true because the destination converts.** Had core owed the conversion — a delivery
waiting on an enrichment still running — the delivery would have had a *need* that is met later,
which is a genuinely new concept and would have wanted ADR 7's needs mechanism. Putting the work
in the adapter removes the case rather than solving it.

### The delivery records what went

The adapter may answer, with a successful delivery, the content it actually delivered. Core stores
those bytes as a **blob** and the routing record names the hash.

- A **blob**, because the store is already content-addressed
  ([ADR 13](0013-assets-are-named-references-to-content-addressed-blobs.md)): routing the same
  content twice costs one copy, and the layer already exists.
- On the **routing record**, not the item. Two destinations with two templates produce two
  outputs from one item, so hanging them on the item loses which delivery each belonged to.
- **Not an artifact.** `CONTEXT.md` defines an artifact as an enrichment output belonging to an
  item; this belongs to a delivery and is produced by a destination. Reusing the word would make
  two different things share a name permanently.
- **Optional.** A destination posting to an API may have nothing meaningful to keep, and should
  not be made to invent something.

Routing records are already mirrored, so a rebuild restores what was sent rather than only where.

### Consequences

- **Good** — the capture stays immutable and one item can go to any number of destinations in any
  number of dialects, with no interference between them.
- **Good** — "what did I actually send to my vault?" becomes answerable, and survives a rebuild.
- **Good** — no new state, job kind or outcome. The conversion hides inside the delivery that was
  already asynchronous, leased and retried.
- **Bad** — an expensive conversion is re-run on every retry. That is the adapter's to cache; core
  will not hold a half-finished delivery.
- **Bad** — the pool stores a second copy of content it already holds, per delivery. Deduplicated
  by hash, and optional, but a destination that reformats trivially still doubles its text.
- **Neutral** — a non-deterministic converter produces different bytes on a retry, so the record is
  a log of what went rather than a reproducible function of the item. That is what it is for.

---

## Pros and cons of the options

### Amend, then route

- **Good** — reuses an operation that exists, and the amended text is visible in the queue.
- **Bad** — cannot serve two destinations from one item; the last route would win.
- **Bad** — rewrites a capture because of where it is going, which nothing else in the model does.

### The destination converts a copy

- **Good** — dialects stay where `standards.md` puts them, and the capture is untouched.
- **Good** — needs no new concept; a conversion is just a slower delivery.
- **Bad** — the same content may be converted repeatedly across retries and across destinations.

### Core converts

- **Good** — one place to configure formats, and a preview would be easy.
- **Bad** — puts templates, renderers and provider access inside core, all of which are
  deliberately outside it.

---

## More information

Decided in discussion on 2026-08-17, alongside the queue gaining an order
([ADR 10](0010-feed-and-queue-sort-differently.md)) and the destination port's `describe` becoming
asynchronous. The `todo.md` entries this answers — routing templates, routing edits, routing
auto-processing — are reworded to point here rather than restating the question.

Nothing here is built. When it is, the open part is what a **preview** looks like: a person
composing a routing decision with a template will want to see the result before committing, which
is a third method on the port rather than a change to this decision.
