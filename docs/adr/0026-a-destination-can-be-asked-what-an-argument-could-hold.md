# 26. A destination can be asked what an argument could hold

**Date**: 2026-08-31
**Status**: Accepted — extends the routing section of [core.md](../specs/core.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A capability already declares an `argumentsSchema`, and the routing composer draws it as a form.
For a field naming a place — `create-file`'s `directory`, `append-to-file`'s `path` — that form is
a bare text input, because nothing has ever told a destination what is actually there. `todo.md`
line 2 asks for exactly this, in the developer's own words: *"Router should be able to advertise
folders, and keep track of custom tags that exist for auto-routing."*

An earlier version of [destination-targets.md](../plans/destination-targets.md) built this as a
destination answering what it holds **at a path**: entries that were collections or items, walked
one level at a time. That is a tree walk, and it re-commits a mistake `core.md:611` already
records making once: a fixed vocabulary that turns out to be filesystem-shaped. A vault's tags
have no path and no hierarchy, and neither do a board's columns — the counterexample is the
developer's own todo line. So the question cannot be "what is under this path"; it has to be
narrower and stranger: **what could this particular field hold**.

---

## Decision drivers

- **`describe()` touches neither disk nor network, by design** (`core.md`: "a destination is asked
  what it can do, and may need to go and look" is already asynchronous, but describing is meant to
  answer from a destination's declared shape, not its current state). An unmounted drive and an
  unreachable Nextcloud still have to be *routable*, with the delivery deferred until it comes
  back. Folding "what could this field hold" into `describe()` would make every settings screen
  stall on a destination that is merely asleep, the moment it grew a folder field.
- **A fixed vocabulary of place-kinds was tried once and rejected** (`core.md:611`, for
  capabilities themselves: create, append, place). Encoding "collection" and "item" into the
  protocol repeats it one level down: a board's columns and a vault's tags are neither, and every
  new sort of place would cost a third value both core and the shell have to learn.
- **A vault holds thousands of notes.** An adapter that can only answer "everything under this
  path" is one nobody can use twice — the composer needs to ask a smaller question and get a
  usable answer back.
- **An unmounted or unreadable destination and an empty one are different answers** to someone
  looking for a folder, and the protocol has to be able to tell them apart.

---

## Considered options

1. **An enum, refreshed at `describe()` time.** A field's schema carries a list of values the
   adapter fills in whenever it describes itself.
2. **A path-walk protocol**, returning entries that are explicitly collections or items — the
   first version of this plan.
3. **Ask about a field, one scope at a time.** A destination is asked which capability, which
   field of its arguments, and an opaque scope it minted in an earlier answer; it answers entries,
   each usable as the field's value and, where there is more to see, a scope to ask again with.

---

## Decision outcome

Chosen: **option 3**. The method is named `candidates`, joins `DestinationKindAdapter` and the
`Destinations` port optionally, and is asked through a dedicated call rather than through
`describe()`.

### Option 1 folds state into a schema that is supposed to be static

An enum has to be refreshed somehow, which means either `describe()` grows the disk-and-network
reach it was deliberately built without, or a second call refreshes it anyway — at which point the
enum is not saving a call, only a layer of indirection around one. It also cannot express
hierarchy at all: an enum is flat, and a folder tree is not.

### Option 2 is a fixed vocabulary wearing a different hat

"Collection" and "item" are still a taxonomy of place-kinds, chosen to fit a filesystem and a
WebDAV server. A vault's tags are neither, and a board's columns are neither. The protocol would
need a third shape the moment a third kind of destination showed up, which is precisely the
failure `core.md:611` already named once for capabilities.

### Option 3 asks about a field instead of a place

A **field** — not a path — is what makes "folder", "note", "board column" and "tag" all valid
answers to the same question, because the protocol never has to say which of those it is asking
about. Hierarchy becomes something an answer *may* offer, through the scope on an entry, rather
than something the protocol assumes: a filesystem's scope descends into a folder, a vault's tag
list has no scope on any of its entries, and both are the same shape of answer.

**A request carries no arguments filled in so far.** The route this method eventually gains is a
`GET` (settled 2026-08-31 in the plan's amendment) and cannot carry them, and no field of either
kind implemented today depends on another — `create-file` takes `directory` and `filename`,
`append-to-file` takes `path` and `heading`, neither pair interdependent. A parameter no caller can
fill is worse than one added the day a kind actually needs it.

**One scope at a time**, because the alternative is a destination asked to enumerate everything it
holds, which for a few thousand notes is not an answer anyone can use. A destination that wants to
say more than it is comfortable listing marks its answer `truncated` instead.

**The method is optional on the adapter, and the port always answers.** A kind that has not
implemented `candidates` and a kind that tried and refused are the same fact to a caller: nothing
here can be browsed. The port's own `candidates` never has an absent case — the registry turns a
missing adapter method into the same `not-offered` failure a kind could otherwise choose to signal
itself, so a caller checks one thing rather than two.

**Failures reuse the vocabulary this domain already has**, on the same terms as
`DestinationReport`: `unusable` before anything is asked, on exactly the same settings-versus-kind
check `describe()` already runs; `unreachable` where the destination was asked and could not say;
`not-offered` where the kind does not do this at all. No new failure shape was invented.

### Consequences

- **Good** — a vault's tags, a board's columns, and a filesystem's folders answer the same
  question through the same port method, with no per-kind vocabulary for core or the shell to
  learn.
- **Good** — `describe()` keeps its constant-time, offline-safe contract; asking what a field could
  hold is its own call and can be slow or refused independently.
- **Good** — a kind that never implements this degrades to exactly what routing looks like today:
  free text, with a reason why.
- **Bad** — walking a filesystem-shaped destination costs one request per level rather than one for
  a whole subtree, because the protocol was built for kinds that are not filesystem-shaped too.
- **Neutral** — a request depending on an earlier field's value is not supported, and nothing today
  needs it. The first kind that does pays for the parameter, and for the route shape it forces.

---

## Pros and cons of the options

### An enum, refreshed at `describe()` time

- **Good** — no new port method, no new request shape.
- **Bad** — either drags disk-and-network reach into `describe()`, or needs a second call anyway.
- **Bad** — flat by construction; cannot express a folder a person has not yet browsed into.

### A path-walk protocol, collections-or-items

- **Good** — a natural fit for a filesystem and for WebDAV's `PROPFIND`.
- **Bad** — bakes "collection" and "item" into the protocol, which a vault's tags and a board's
  columns are neither.
- **Bad** — repeats the fixed-vocabulary mistake `core.md:611` already records core paying for
  once.

### Ask about a field, one scope at a time

- **Good** — a folder, a note, a tag and a board column all answer the same question, with
  hierarchy carried on the entries rather than assumed by the protocol.
- **Good** — failure reuses `unusable`/`unreachable` rather than inventing a parallel vocabulary.
- **Bad** — a destination that is naturally tree-shaped is walked one request per level, where a
  bespoke protocol could have asked for a whole subtree at once.

---

## More information

Plan: [destination-targets.md](../plans/destination-targets.md), phase 3. The route
(`GET /v1/destinations/{id}/candidates`), the client's in-memory-only cache, and the composer's
browser are phases 7 through 9 of the same plan and are not built by this decision.
