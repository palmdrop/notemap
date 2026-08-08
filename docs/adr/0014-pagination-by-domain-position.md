# 14. Paginated reads continue from a domain position

**Date**: 2026-08-08
**Status**: Accepted — supersedes the cursor clause of
[ADR 10](0010-feed-and-queue-sort-differently.md); the rest of ADR 10 stands.

---

## Context and problem statement

Core's paginated reads took a `PageCursor`: an opaque string the store minted, tagged with the
surface and the order it was issued for, and refused under any other. The daemon was about to
put that string on the wire, where "opaque" means the client cannot tell a stale cursor from a
corrupt one, cannot construct a starting point of its own, and cannot read the same place in
the other order.

So: what does a client name when it asks for the next page?

---

## Decision drivers

- **Core states what it requires of a store in domain terms** ([core.md](../specs/core.md)) —
  and the continuation was the one part of a read that was stated in the store's terms instead.
- **A cursor's opacity has to buy something.** Here it bought nothing: every store that answers
  a feed read sorts it by `(created_at, id)`, because that is what the domain says the feed's
  order is.
- **Inserts behind an already-consumed position are normal**, not an edge case. Offline sync and
  file import both place items at their source time, which is routinely in the past.
- **The wire form and the core form should be the same thing** spelled differently, so the
  daemon translates rather than invents.

---

## Considered options

1. **Opaque store-minted cursor** — the status quo.
2. **Offset and limit** — `?offset=100&limit=50`.
3. **A domain position** — the sort-key fields of the last row seen, named in domain terms.

---

## Decision outcome

Chosen: **a domain position**. `PageCursor` and the driver's `cursor.ts` are deleted.

A **position** is the sort-key fields of the last row a read handed out, in the domain's own
terms. It is a read parameter and is **never stored** — core holds no processing position, which
is unchanged from ADR 10.

**The sort key of the surface is the position of the surface.** No surface invents a shape:

| Surface | Position |
|---|---|
| `feed` | `{ at: createdAt, id }` |
| `queue`, `archived` | `{ at: content time, id }` |
| `actions.*` | `{ at, id }` |
| `abandoned` | `{ at: abandonedAt, item, enrichment }` |

The abandoned surface has no id of its own — an enrichment state is identified by the pair it
belongs to — so its position names the pair. That surface previously had **no time to sort by at
all**, so this decision adds **`abandonedAt`** to the abandoned enrichment state: the instant
core gave up. It was needed anyway. "Three things need you" is a list a person works through,
and a list with no order is one they cannot resume.

`id` is **optional**, which is what makes a bare timestamp a usable coarse entry point: with no
id, the read is bounded on `at` alone, strictly. It may skip rows sharing the boundary instant.
That is the price of a coarse entry, and it is why a continuation always carries the id. Ids are
arbitrary strings ([core.md](../specs/core.md#intake-and-sync)) with no minimum or maximum value
to substitute, so there is no sentinel that would make a bare timestamp exact.

**A position is order-free.** It names a place in the feed, not a direction of travel: the same
position continues a `newest-first` read below it and an `oldest-first` read above it. This is
the clause of ADR 10 that this ADR supersedes — "a cursor belongs to the order it was issued
for, and is refused under the other" was a property of the tagging, not of the domain.

**A position naming a row that no longer exists still works**, because it is a comparison and
not a lookup. Purging the row a client is paging from does not strand it.

**Wrong-surface and malformed-cursor handling disappears from the store.** A position is typed
domain data; there is no tag to check and no string to parse. Where it arrives over a wire, the
host parses it and refuses `bad-position` before core is called
([http-v1.md](../specs/http-v1.md#the-feed)), so a malformed position never reaches the store.

**Sync's `changesSince` cursor stays opaque, by design.** It is not the same thing wearing a
different name: delta reads are keyed on `modified_at`, a store-assigned monotonic sequence
([sync.md](../specs/sync.md)) which exists precisely so that writes committing out of order
cannot be missed. That is the store's bookkeeping, and stating it in domain terms would make it
a fact clients could reason about when they must not. Opacity buys something there; it bought
nothing here.

### The `next` URL is a host layer, not a domain one

Core hands back the next **position**. The daemon renders it as a ready-to-fetch relative URL
carrying the order, the limit and the position, so a client follows a link instead of
reassembling a query. That is interface convenience, which is the host's
([ADR 2](0002-core-is-a-host-agnostic-library.md)) — core imposes no interface policy, and a CLI
host paging the same read has no use for a URL.

### Consequences

- **Good** — a client can construct a starting point (`after=<yesterday>`), read the same place
  in either order, and see what it is asking for.
- **Good** — the store loses cursor encoding, decoding, space tagging and their failure modes.
- **Good** — every paginated read is now stated entirely in domain terms, so the storage
  constraint in core.md holds without an exception.
- **Bad** — the continuation is now part of the public contract. Changing a surface's sort key
  is a breaking change to its pagination, where an opaque cursor could have absorbed it. This
  is acceptable: a surface's sort order is already public — it is what the surface *is* — so a
  change of sort key was never quietly absorbable in the first place.
- **Neutral** — positions are slightly longer on the wire than a tagged cursor. Nobody is
  counting these bytes.

---

## Pros and cons of the options

### Opaque store-minted cursor

- **Good** — the store may change its sort key without changing the contract; a client cannot
  build a cursor that means nothing.
- **Bad** — the client cannot construct an entry point, cannot reuse a place across orders, and
  cannot distinguish stale from corrupt.
- **Bad** — it is the one part of a read core asked for in the store's terms rather than the
  domain's, which contradicts the storage constraint core states.
- **Bad** — every failure mode is a string-parsing failure mode: wrong surface, wrong order,
  truncated, from another pool. Each one needed a check, a message and a test.

### Offset and limit

- **Good** — trivial to implement, and every client already understands it.
- **Bad** — **wrong for this domain, not merely inefficient.** An item's feed position comes
  from its capture time, so an offline sync or a file import inserts *behind* a position a
  client has already read past. With an offset, that shifts every later row by one and the
  client silently re-reads one row and never sees another. The feed's whole job is that nothing
  is ever lost; a pagination scheme that drops rows undermines the one guarantee the surface
  exists to make.
- **Bad** — `OFFSET n` makes the store walk and discard `n` rows.

### A domain position

- **Good** — insert-safe, order-free, purge-safe, constructible, and stated in the domain's own
  terms.
- **Bad** — public, so a sort key cannot change silently. See the consequence above.

---

## More information

Decided in the grilling session of 2026-08-07/08 and implemented by
[docs/plans/http-v1-subset-and-positions.md](../plans/http-v1-subset-and-positions.md). The wire
form is in [http-v1.md](../specs/http-v1.md); the term is in
[CONTEXT.md](../../CONTEXT.md).

Revisit if a surface appears whose sort key is genuinely not expressible in domain terms — a
relevance-ranked search read is the plausible one, where the key is a score the store computed
and nothing in the domain names. That read may need a cursor of its own; it does not need this
decision reversed.
