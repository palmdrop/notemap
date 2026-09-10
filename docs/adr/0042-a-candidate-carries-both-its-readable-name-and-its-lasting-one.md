# 42. A candidate carries both its readable name and its lasting one

**Date**: 2026-09-08
**Status**: Accepted — extends [ADR 26](0026-a-destination-can-be-asked-what-an-argument-could-hold.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

[ADR 26](0026-a-destination-can-be-asked-what-an-argument-could-hold.md) made a destination
askable: a field may carry `x-notemap-candidates`, and the destination answers entries of a
`label` a person reads and a `value` the field holds.

Are.na broke the assumption that one value is enough. A channel has two names — the slug
`reading` and the numeric id `12345` — and **renaming the channel changes the slug**. So the two
surfaces that browse want different halves of the same thing:

- The **composer** makes a decision now. A slug is legible on the routing record and in a
  remembered place, and if the channel is renamed a minute later the delivery has already landed.
- The **template form** saves a decision that fires on a tag **for months**. A slug rots quietly:
  the channel is retitled, and some days later a tagged capture stops routing.

The plan for the are.na destination handled this by telling people to paste the numeric ID by hand
into a template, which is a workaround written in a README rather than a thing the software does.

A second, smaller problem arrived with it. The template form offers the pattern vocabulary —
`{{captured_at}}`, `{{item}}`, `{{source}}` — beside every field that is not a fixed enum. That is
right for a vault's `path`, where `{{captured_at}}.md` is the documented use and the delivery
**makes** the folder it names. It is nonsense for a channel, which is joined rather than made: a
pattern expanded into it can only ever name a channel nobody has.

So: how does a shell know which of a destination's two names to take, and which fields a pattern
can mean anything in — without knowing what an are.na channel is?

---

## Decision drivers

- **The shell must not learn about kinds.** `apps/ui` has one lookup keyed on destination kind and
  it is already the weak part of that seam (`docs/todo.md`). Adding "if arena, prefer the id" would
  be the same mistake in a second place.
- **Neither is a fault of the other.** Which name to take is a property of *the surface asking* — a
  decision made once against one that fires again. Whether a pattern can mean anything is a
  property of *the field*. They are two facts and want two mechanisms.
- **Core must stay uninterested.** Core matches capabilities and refuses; it does not read
  annotations it has no use for, and it must not start.
- **A README is not a feature.** "Paste the numeric ID for a template" is knowledge that lives in a
  person's head and is lost the moment they browse instead of typing.

---

## Considered options

1. **The entry carries both names**, and the surface takes the one it wants; a field says whether
   it may hold only what was offered.
2. **`candidates` takes the caller's intent** — a `durable: true` on the request, and the adapter
   answers ids instead of slugs.
3. **The template form resolves ids itself**, by knowing that an are.na channel has one.
4. **Two entries per channel**, one under each name.

---

## Decision outcome

Chosen: **option 1**, as two independent additions.

- **`CandidateEntry` gains `durable?: JsonValue`** — the same thing under a name that survives being
  renamed, where the destination has two for it. Absent is the ordinary case and means `value` is
  already the lasting one. The **composer** takes `value`; the **template form** takes
  `durable ?? value`. Neither knows why, and a kind with one name for a thing is unaffected.
- **A field may carry `x-notemap-offered-only`** — it holds only something the destination already
  has. Core never reads it. The template form draws no pattern vocabulary beside such a field,
  because a pattern expanded into one names something nobody has.
- The are.na adapter declares both. The id costs nothing: `/v3/users/{id}/contents` already returns
  it, and `channelsIn` was discarding it.
- Matching and completion consider **every** name an entry has — label, value and durable — so
  typing a title, a slug or an id all find the same channel, and `⇥` resolves to whichever form
  the surface wants.

### Consequences

- **Good** — a template browsed into an are.na channel is rename-proof by default rather than by
  instruction. The advice in the README becomes a description of what happens.
- **Good** — both additions are the adapter telling the shell something it was previously guessing,
  which is the direction ADR 26 set.
- **Good** — `x-notemap-offered-only` is likely to earn its keep again. It is the honest name for
  "this cannot be created by the delivery", which is what would also justify refusing a value that
  is not in the answer, if that is ever wanted.
- **Bad** — a template's channel field reads `12345` rather than `Reading`. Mitigated: the browse
  marks the entry that value names, so the list still says which channel it is. Not fully solved,
  and the thing to revisit first if it grates.
- **Bad** — `CandidateEntry` crosses `/v1`, so this is a wire change. It is additive and optional,
  and no client that ignores it behaves differently.
- **Neutral** — nothing validates that a value is one the destination offered. `offered-only` says
  the field *may* hold only what was offered; the shell uses it to withhold advice, not to refuse
  input. The browse answers one page of an account's own channels, so it cannot see a group
  channel, a collaborator's, or anything past the first hundred — refusing on its say-so would
  block channels that deliver perfectly well.

---

## Pros and cons of the options

### `candidates` takes the caller's intent

- **Good** — one name per entry, so nothing about the type changes.
- **Bad** — it makes a browse's answer depend on who asked, so the cache is keyed on intent and
  the same channel is two different entries in two places.
- **Bad** — it pushes a UI concern into the port. A destination has no business knowing whether the
  thing being composed will fire again.

### The template form resolves ids itself

- **Good** — no core change at all.
- **Bad** — the shell would have to know that an are.na channel has an id and where to get it,
  which is the exact knowledge the adapter seam exists to hold.

### Two entries per channel

- **Good** — no type change; the id is browsable.
- **Bad** — doubles every list, and a person reading it sees each channel twice with no way to tell
  which one they should take.

---

## More information

Written while making the are.na destination's composer usable
([plan](../plans/arena-destination.md)). The retitle behaviour was verified by hand on 2026-09-07:
renaming a channel changes its slug.

**Answered 2026-09-09.** The field showing `12345` did grate, and the fix took neither of the
shapes considered here: the line **reads** the entry's label while the field holds the durable
value, keyed on `offered-only` — which is what makes it safe, a field that may hold only what was
offered being one whose value is a handle rather than a name. Nothing about this decision changes;
`durable` is still what is stored and still what fires months later. A value the browse never
mentioned is still kept exactly as written, since the answer is one page of what a destination
holds.

Revisit if a second kind wants `offered-only` for refusal rather than for advice, which is a
different promise and would need the answer to be complete before it could be kept.
