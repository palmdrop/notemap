# 59. One block per file, and a multi-block delivery names its channel

**Date**: 2026-10-10
**Status**: Accepted. Widens the duplication window
[ADR 41](0041-a-delivery-that-cannot-be-confirmed-may-duplicate.md) describes for the arena kind;
ADR 41 otherwise stands. Finishes the arena half left open by
[ADR 57](0057-a-capture-can-be-routed-as-its-attachments-alone.md).
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A capture may carry any number of files of any kind since 2026-10-07, and may be routed as its
attachments alone since 2026-10-08. The arena kind takes neither: a block holds one thing, so it
refuses any capture whose payload names more than one asset, and it declares no capability that
carries the attachments alone. Routing by hand hears the refusal in the preview, before deciding; a
trigger tag hears it at delivery, spends an attempt, and gives the tag back.

So a capture the shell now lets a person make cannot reach the one destination kind whose whole
unit is a single piece of media.

How does one delivery reach a board with several files, and what does the record of it name?

---

## Decision drivers

- **A block holds one thing, and that is the service's shape rather than a limitation to route
  around.** Several files mean several blocks, as they would if a person filed them by hand.
- **One delivery, one record, one pointer.** `DeliveryOutcome` carries one `pointer` and one `url`,
  and a routing record is the trace of one decision. Several blocks have to be nameable through
  that.
- **Nothing can look at what landed.** are.na offers no conditional create and no idempotency key,
  and `/v3/search` is Premium-only, so a retry cannot ask the board what the last attempt wrote.
- **A decision thrown away is worse than a duplicate**, which is ADR 17's reasoning and ADR 41's.
- **Every record that exists must go on reading as it did.** Whatever a multi-block delivery names,
  the single-block case is the one every arena record so far was made by.

---

## Considered options

For the blocks:

1. **One block per file**, the capture's words captioning the first.
2. **The first file only**, saying what was dropped through the output and note ADR 33 gives a
   lossy delivery.
3. **Keep refusing.**

For the words, where there are several files:

- **a.** The description and alt text of the first block only.
- **b.** Their own text block beside the asset blocks.
- **c.** The same description on every block.

For a partial failure retried:

- **i.** Post everything again, and accept the duplicate.
- **ii.** Keep track of the blocks already made, so a retry resumes.
- **iii.** One delivery per file, so each has its own record and its own retry.

For the pointer:

- **x.** The channel the decision named, with every block's URL in the output.
- **y.** The first block, with the rest in the output.

---

## Decision outcome

Chosen: **option 1, with words by a, retries by i, and the pointer by x** — and the single-block
case left exactly as it is.

**`create` makes one block per file**, in slot order, each asset presigned and uploaded as the one
asset already is. The capture's words are the `description` and `alt_text` of the **first** block and
of no other: that is what a person filing a set of pictures writes, a caption repeated on each would
read as three captions, and a text block beside them would make a set of pictures into four things.
A capture with no asset is untouched — one block from its prose, a leading URL still becoming a Link
block.

**The arena kind declares `place-assets`**, whose arguments are the `channel` and nothing else. A
channel is joined rather than made, so there is no folder to establish and no mode to decide. It
makes one block per asset with no caption, and a capture referencing no asset is `rejected`, as on
the file kinds. Its words and artifacts go nowhere, which is what was asked for, so the output does
not confess them; the tags still travel, as they always do here, in the block's own metadata, and
the note says so.

**Provenance metadata goes on every block.** It says where a block came from rather than what the
capture said, and a block moved out of its channel keeps it.

**A delivery that made several blocks names the channel**: `pointer` is the channel as the decision
named it, `url` is absent, and every block's URL is in the **output**, one a line. A channel has no
permalink this adapter can compose — `/block/<id>` is a convention and a channel's address needs the
owner's slug, which `deliver` never asks for — so a `url` here would be a guess. **A delivery that
made one block is unchanged**: the pointer is the block's id and the `url` is the block. One block
names the block; several name the channel.

**A partial failure retried duplicates, and the kind says so.** Block one lands, block two is
unreachable, the delivery is retried, and block one is posted again. This is the same answer ADR 41
gave, for the same reason — nothing can look, and abandoning is worse than duplicating — but it is
no longer only the narrow window of an unconfirmed POST: it is deterministic, every retry, for
everything that already landed. The kind's README says that, as ADR 41 requires a kind with no
strong promise to.

### Consequences

- **Good** — three pictures reach a board as three blocks, by hand or through a trigger tag, and a
  board can be asked for the attachments alone. No shell code knows this kind by name: the carrier
  is found by `x-notemap-carries` wherever it is offered.
- **Neutral** — a board is reached through `do` rather than through the `attachments only` switch,
  that switch belonging to a kind whose other capability the surface *settles* and this kind
  settling none. Declaring a second capability therefore makes `do` a question on a board, where
  one capability was never asked about; and it cost the shell one rule, that a carrier is not
  offered for an item with no attachment ([shell.md](../specs/shell.md#the-process-surface)).
- **Good** — every arena record made before this reads as it did, and the common case keeps a link
  a person can follow.
- **Bad** — a record of a multi-block delivery has no `url`, so a person follows one of the block
  URLs in the output instead of a link on the record. Accepted: a guessed channel address would be
  worse than none.
- **Bad** — a delivery of five files that fails on the fifth and is retried leaves four duplicate
  blocks. Accepted, as rare, visible and reversible by hand, against a decision abandoned silently;
  and it is the honest cost of a protocol with no conditional create.
- **Bad** — the pointer means two things by number. Accepted: the alternative is either a wrong
  pointer for every existing record or a pointer naming one of several blocks arbitrarily.
- **Neutral** — option ii stays available and this decision is what would justify it. If partial
  failures prove common rather than rare, progress has to be carried between attempts, and the shape
  for that is a partial outcome rather than a second mechanism inside the adapter.

---

## Pros and cons of the options

### The first file only, saying what was dropped

- **Good** — one block, one pointer, the retry promise unchanged, and ADR 33 already gives a lossy
  delivery the words to confess it.
- **Bad** — the person asked for the files to go, and four of five silently becoming a note in the
  output is not that. are.na should receive everything.

### Keep refusing

- **Good** — nothing to decide, and the preview says so before a decision is made.
- **Bad** — a capture the shell now makes freely cannot be routed to the kind a board is for, and a
  trigger tag finds out at delivery. The workaround is splitting the capture by hand, every time.

### The words as their own text block

- **Good** — nothing is captioned, so no file is privileged, and the prose is readable on its own.
- **Bad** — a capture becomes N+1 things on the board, and the words lose their connection to the
  picture they were about.

### Keep track of the blocks already made

- **Good** — the only option where a retry cannot duplicate.
- **Bad** — `DeliveryOutcome` is all-or-nothing, so progress has nowhere to live: a new partial
  shape through core's routing, the store, `/v1` and every surface, for a failure nobody has
  measured yet. Premature, on ADR 41's own reasoning about `uncertain`.

### One delivery per file

- **Good** — each file retries on its own, and nothing duplicates.
- **Bad** — fan-out from one gesture, which makes *cancel* a question about which delivery;
  [ADR 37](0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md) answers
  only the single-destination case. A much larger change than the thing being asked for.

### The first block as the pointer

- **Good** — every record keeps a followable `url`.
- **Bad** — it names one of several blocks for no reason a reader could work out, and says nothing
  about the other four.

---

## More information

Written for the are.na entry in `docs/todo.md`, where the shape was decided on 2026-10-08, and
implemented by [arena-takes-every-file](../plans/arena-takes-every-file.md).

Revisit if are.na gains an idempotency key or a conditional create, which would let this kind make
the strong promise for a multi-block delivery too; or if partial failures prove common, which is the
evidence option ii was waiting for.
