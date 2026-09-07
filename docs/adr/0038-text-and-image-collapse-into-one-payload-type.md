# 38. `text` and `image` collapse into one payload type

**Date**: 2026-09-07
**Status**: Accepted
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

The shipped config declared two payload types. `text` carried `{ text }` and no attachments;
`image` carried an optional `{ caption }` and one required asset in the slot `image`. Which one a
capture got was decided by what it happened to hold: a picture attached made it an `image`, no
picture made it `text`.

An edit may not change an item's payload type — `422 payload-type-changed`
([core.md](../specs/core.md#editing)) — because the answer must not depend on whether the pool
amends or revises, which an offline caller cannot always know.

Those two rules cannot both hold for anything that syncs. A **relay** reading an upstream system
re-posts every memo it finds; the moment someone adds a picture to a note upstream, or deletes the
last picture from one, the type derived from its contents changes and the item becomes permanently
unsyncable. One upstream thing must map to one payload type for life.

---

## Decision drivers

- **A payload type is what a capture mechanically *is*, not what it is about.** A photograph with a
  sentence under it and a sentence with a photograph under it are the same thing arriving.
- **The distinction `image` drew is already carried where the glossary says it belongs.** The two
  **sources** `web-manual` and `web-image` exist precisely so that policy can differ between a
  typed note and a picture "even though one page sent both" ([CONTEXT.md](../../CONTEXT.md)).
- **`image` never reached the standard.** [standards.md](../standards.md#payload-types)'s payload
  table has a `text` row and has never had an `image` one, so the two documents already disagreed.
- **`requiredSlots` had exactly one user.** The mechanism, its refusal `missing-asset-slot`, its
  wire row and its error message existed for `image` alone.
- **What an attachment *is*, is its media type.** Recorded when the bytes went up, on the asset
  itself, and true of a payload with three attachments of three kinds — which a payload type,
  being one word for the whole capture, can never be.

---

## Considered options

1. **One type, `note`** — optional prose, any number of attachments.
2. **Keep both and let an edit change the type** — relax `payload-type-changed`.
3. **Keep both and pin the type at first capture** — a relay decides once and never revisits.

---

## Decision outcome

**One payload type, `note`: `content.text` optional with no `minLength`, and any number of
attachments.** `PayloadTypeDescriptor.requiredSlots` and the `missing-asset-slot` refusal are
removed with it.

Option 2 was rejected on its own terms: the type is the one part of a capture an edit may not
touch, and an offline caller that cannot predict amend-or-revise cannot be told the answer depends
on which it got. Option 3 keeps the coupling and moves it somewhere worse — the relay would hold
state about a decision the pool made, which is the one thing a relay that re-reads everything every
poll is built not to do.

Consequences worth stating:

- **An empty capture — no prose, no attachment — is legal in core.** Core validates `content`
  against the type's schema and nothing else; the shell and each relay guard their own input.
  That is what core being a primitive API means, and it is not a new position: nothing stopped an
  `image` capture with no caption before.
- **Existing `image` payloads are rewritten by a migration**, `caption` moving to `text`, and the
  migration inserts the mirror writes it makes owed. The mirror is written by a job and never by a
  store write, so a payload rewritten underneath it would leave the copy describing items that no
  longer exist that way and `verify` reporting drift on every one.
- **Both renderers stop keying on the payload type and key on each asset's media type.** An
  attachment that is a picture is embedded; one that is not is linked.
- **The shell keeps two capture sources.** `web-manual` and `web-image` both produce a `note`.

### The rule this leaves behind

A second payload type exists **only when `content` needs a different schema**. `link` qualifies,
carrying a `{ url }` that nothing else validates; `table` qualifies. **Voice does not**: a
recording's audio is an **asset** and its transcript an **artifact**, so a `voice` type would be
`note`'s schema under another name and `checkPayload` could not tell one from the other.
Auto-transcription already keys on the **source**, through `autoRequest`.

The test is `content`, deliberately, and not "is this a different kind of thing" — the second
question has no answer anyone can check, and it is the one that produced `image`.

---

## Pros and cons of the options

### One type, `note`

- Good, because one upstream thing maps to one type for life, which is what makes a relay's
  re-read idempotent.
- Good, because it closes the disagreement between the config and `standards.md` rather than
  opening one.
- Good, because it removes `requiredSlots` and its refusal, whose only user it was.
- Bad, because a photograph is now typed `note`, which reads oddly until you know that `note`
  names a payload's shape and not what the capture is about.
- Bad, because a renderer can no longer be chosen for pictures ahead of time; it has to look at
  each attachment.

### Keep both, let an edit change the type

- Good, because nothing needs migrating.
- Bad, because the type is the one thing an edit may not change, and the reason — an offline caller
  cannot know whether it will amend or revise — does not go away.

### Keep both, pin the type at first capture

- Good, because it leaves core untouched.
- Bad, because a relay would have to remember which type it chose per upstream item, which is
  durable state a relay is built not to hold.
- Bad, because the first capture's contents then decide the shape of every later one — a memo that
  began as prose can never carry a picture the shell would draw.

---

## More information

The collapse landed with the relay work ([plan](../plans/memos-relay.md)), but stands on its own:
the config, the glossary and `standards.md` disagreed with each other before any relay existed.

`note` names a payload's shape. **Item**'s avoid-list still stands — it is the wrong word for an
item, and always was.
