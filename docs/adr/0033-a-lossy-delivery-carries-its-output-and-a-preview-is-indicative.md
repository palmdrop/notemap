# 33. A lossy delivery carries its output, and a preview is indicative

**Date**: 2026-09-04
**Status**: Accepted — extends
[ADR 19](0019-a-destination-converts-and-the-delivery-records-what-went.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

[ADR 19](0019-a-destination-converts-and-the-delivery-records-what-went.md) settled that a
destination converts a copy and that the delivery may record the bytes that landed. Nothing was
built: an outcome is `delivered | unreachable | rejected` with a pointer, and its closing line left
preview open as "a third method on the port".

It matters now because destinations are about to stop being faithful. A todo-list destination that
inserts one line prefixed `- [ ]` flattens a capture and drops its pictures. Routing delivers a
copy and the item is untouched, so that is allowed — but only if the person can see it, before by
asking and after by looking. Three questions fall out, and the third is the one ADR 19 deferred:

1. Is a conversion that loses something a **delivery** or a **refusal**?
2. What does the record keep, beyond the bytes — is "two pictures were not carried" a fact or a
   sentence?
3. What does a **preview** promise? A preview a person acts on is worthless if it may differ from
   what is written, and dangerous if it is trusted as a guarantee it cannot make.

---

## Decision drivers

- **Routing delivers a copy, and the item is untouched.** Nothing a destination does to its copy
  can lose anything from the pool, which is what makes lossy conversion permissible at all.
- **A reservation is a pure decision.** A deferred delivery is attempted from the routing record
  alone, and the mirror carries a decision rather than bytes. Anything that put a converted copy
  into the decision would have to be produced before the destination was reached, kept durable, and
  replayed.
- **The right output can depend on the destination's state at the moment of writing.**
  `append-to-file` writes into a note that may have changed since the decision, and
  `create-or-append-file` ([ADR 31](0031-the-adapter-decides-create-or-append-at-delivery.md))
  does not decide which it is until it holds the vault.
- **`rejected` already means something.** It is proof the destination was reached and said no, and
  it is abandoned on the first attempt. Spending it on "I could carry the text but not the
  pictures" would make an ordinary conversion unretryable and hand the decision back.
- **Core learns no vocabularies it does not need.** A fixed taxonomy of place-kinds was tried and
  rejected once (`core.md:611`); a taxonomy of what a conversion dropped is the same shape of
  mistake one level along.

---

## Considered options

For what a preview promises:

1. **Indicative** — the preview is a conversion run now and thrown away; the delivery converts
   again when it runs.
2. **Binding** — the preview's bytes are committed with the decision, and the delivery writes
   exactly those.
3. **A dry-run flag on `deliver`** — one method, one code path, a boolean saying whether to write.

---

## Decision outcome

### A lossy conversion is a delivery

A destination that carried what it could and dropped the rest **delivered**. `rejected` is kept for
a capture the destination can make no sense of at all — a payload type it cannot read, a place it
will not write. The distinction is not how much survived but whether the destination did the thing
it was asked to do.

This is not a licence to lose things quietly, which is the whole reason the rest of this decision
exists: a lossy delivery that says nothing about what it lost is indistinguishable from a faithful
one, and that is data loss with a green tick beside it.

### The record keeps the output and a prose note

A delivered outcome may carry an **output**: the content, its media type, and a short prose
**note** about what could not be carried. All three are optional, on ADR 19's own terms — a
destination posting to an API may have nothing meaningful to keep and should not be made to invent
one — and a kind with nothing to confess answers content and no note.

The content reaches core as a **lazy opener**, the shape `DeliveredAsset` already uses, so a large
output is never buffered in order to be hashed. Core stores it as a **blob**, because the store is
content-addressed already ([ADR 13](0013-assets-are-named-references-to-content-addressed-blobs.md))
and routing the same content twice costs one copy; the routing record names the hash, the media
type and the note.

**The note is free text nothing parses**, on the same footing as the `detail` that already rides on
`unreachable` and `rejected`. A machine-readable list of what was dropped is a vocabulary both core
and every shell would have to learn, and it would be wrong the first time a destination lost
something the vocabulary has no word for. What would have to be true to change this: a shell
wanting to draw *2 assets not carried* as a mark rather than a sentence is not enough on its own —
the case for structure needs at least two kinds losing the same sort of thing, and a vocabulary
that can say "something else" without lying.

### A preview is indicative, never binding

`preview` joins the port beside `deliver`, optionally. It takes what a delivery takes and answers
an output, touching nothing at the destination. **The delivery converts again when it runs**, and
the two may differ.

**Option 2, a binding preview, was refused** because it makes the reservation impure. A decision
would carry bytes: they would have to be produced before the destination was reached, stored,
mirrored, replayed on every retry, and kept in step with a record whose delivery may land days
later. It also cannot be honest for the capabilities that exist — the right bytes for
`append-to-file` depend on what the note holds at the moment of writing, and
`create-or-append-file` does not know which of the two it is doing until it is there. A preview
that binds would have to freeze an answer to a question that had not been asked yet.

**Option 3, a dry-run flag, was refused** for one sentence: it puts one boolean between showing a
person something and writing into their vault. It is genuinely attractive — preview and delivery
become incapable of disagreeing, because they are the same call — and that is the trade being
declined. Core cannot verify the flag was honoured; the honouring is entirely inside the adapter,
where an inverted condition, an early return past the check, or a helper that writes as a side
effect are all one-character mistakes that no test in core can catch. A separate method makes
writing the default of one code path and not of the other, so the same mistake has to be made twice
to write something a person only asked to see.

**Faithfulness is the adapter's discipline.** `deliver` and `preview` share one conversion because
the adapter writes them that way, and nothing in the port can enforce it. This ADR states that
rather than implying a guarantee: a kind whose preview drifts from its delivery is a bug in that
kind, not a property the protocol lost.

A preview may fail `unreachable` — previewing `append-to-file` against a sleeping vault may need
the note it would append to — and `not-offered`, on `candidates`' own terms. Neither stops the
routing decision; they stop the seeing of it.

### The pointer gains a URL beside it

The human-readable pointer stays what it is — a path a person recognises — and a destination that
can offer a link offers one, so a shell may make the pointer a link instead of guessing whether a
string is one. The filesystem kind answers a path and no URL, permanently: a path on the daemon's
host is not reachable from the phone reading the shell. Both are best-effort and both may be
stale, which the glossary already says of the pointer alone.

### Consequences

- **Good** — "what did I actually send to my vault?" is answerable after the fact and askable
  before it, and a destination that converts lossily has to say so in a place a person reads.
- **Good** — the reservation stays a pure decision, so a deferred delivery is still attempted from
  the record alone and the mirror still carries no bytes of its own.
- **Good** — the output is a blob in the store that already holds asset bytes, so the mirror
  carries a hash exactly as it does for an asset, and one output routed twice costs one copy.
- **Bad** — a preview and its delivery may disagree, and a non-deterministic converter guarantees
  they will. That is a fact about the destination rather than a fault, and the shell says what a
  preview is rather than promising what it is not.
- **Bad** — a preview of an expensive conversion pays for that conversion twice, once to be looked
  at and once to be delivered. The adapter's to cache, on the same terms ADR 19 already accepted
  for a retry.
- **Bad** — the pool stores a second copy of content it already holds, per delivery, and nothing
  releases it: only a `delivered` record carries an output, and a delivered record is never
  removed. The sweep reclaims blobs no *asset* names and must not take one a record names.
- **Neutral** — a preview is a `POST` that writes nothing, which the HTTP surface has to say out
  loud rather than smuggle in.

---

## Pros and cons of the options

### An indicative preview

- **Good** — the reservation stays a decision, and a deferred delivery needs nothing but the record.
- **Good** — honest for a capability that resolves itself against the destination at write time.
- **Bad** — what was shown and what is written may differ, and only the destination knows why.

### A binding preview

- **Good** — what a person approved is what lands, which is the strongest thing a preview could say.
- **Bad** — bytes in the decision: stored, mirrored, replayed, and stale by the time a deferred
  delivery runs.
- **Bad** — impossible to mean for `append-to-file` and `create-or-append-file`, whose right output
  is a function of the destination at the moment of writing.

### A dry-run flag on `deliver`

- **Good** — preview and delivery cannot disagree, because they are one call.
- **Good** — no second method for an adapter to implement, or to forget to keep in step.
- **Bad** — one boolean between showing a person something and writing into their vault, which core
  cannot verify and an adapter can get wrong once.

---

## More information

Plan: [delivery-output-and-preview](../plans/delivery-output-and-preview.md). The output on the
record and the note are phase 2, the filesystem kind's own answers phase 3, `preview` phase 5.
`CONTEXT.md` gains **Output** in the same change, and **Destination**'s Avoid line stops banning
the word.

Revisit the prose note if two kinds turn out to lose the same sort of thing and a vocabulary can be
written that says "something else" without lying. Revisit the indicative preview only for a
destination that can be asked to hold a conversion — which none can today, and which would be a
protocol with state rather than a third method.
