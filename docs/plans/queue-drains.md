# The queue drains

**Date**: 2026-08-13
**Status**: Todo
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/mirror.md`
**Closed**:

---

## Goal

An item can leave the queue and come back. Archiving hides it and unarchiving returns it at its
unchanged position; marking it processed by hand appends a routing record naming the user and takes
it out of the queue for good; and both the queue and the archive read, ordered and paginated, over
`/v1`.

**Out of this slice, deliberately**: destinations and real delivery — `routing.route` and
`routing.destinations` stay `notImplemented`, and no adapter is wired. That is
[delivery-machinery.md](delivery-machinery.md) and [destination-fs.md](destination-fs.md).

---

## Decisions

Taken 2026-08-13 in the grilling session. The routing-record model is
[ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md); this plan builds the half
of it that needs no adapter.

### `markProcessed` needs none of the delivery machinery

Its target is the user. There is nothing to reach, nothing to be unreachable, and nothing to retry:
the record is born delivered. So the queue can drain end to end — archive one way, mark processed
the other — before a line of retry logic exists, and the surfaces that matter get exercised against
real writes rather than against a stub.

### `processed` is derived, and indexed for deliberately

Archived, or holding at least one routing record. No `routed_at` column: the routing log is
authoritative, and a column that agrees with it is one that can later disagree. This is the
treatment `supersededBy` already gets.

The indexes are committed up front rather than added when it hurts, because the queue's predicate
is three anti-joins and the shape of them is knowable now: an expression index on the content time
for the ordering, `routing_records(item_id)` for the routing anti-join, and the existing
`items_one_revision_each` already covering the superseded one.

### Archiving an already-archived item is refused

Not a no-op. Archiving carries a reason and a time, so a second archive either overwrites what the
first recorded or silently discards what the second was given — and neither is something a caller
asked for. `ArchiveRefusal` is `SubjectRefusal` today and gains a kind for it. The same holds for
unarchiving something that is not archived.

This is the opposite call to capture's, deliberately: a capture replay is a client resending
something it may not know arrived, where an archive is a fresh decision about a state the caller
can already read.

### The record carries its state from the start

`routing_records` ships with a `state` column that only ever holds `delivered` in this slice.
Delivery adds `pending`. Landing the column now costs one CHECK constraint and saves a migration
over a table that will by then hold real data.

---

## Tasks

### Phase 0 — Branch

- [ ] `git checkout -b agent/queue-drains`

### Phase 1 — Write the wire down *(blocks phase 5)*

Docs before the routes that implement them, as the asset slice did.

- [ ] `http-v1.md`: `GET /v1/queue` and `GET /v1/archived`; archive and unarchive; marking processed
      and reading an item's routing records. The queue's position is a **content time**, spelled
      `<at>,<id>` exactly as the feed's is and meaning something else — say plainly that the two are
      not interchangeable, since nothing in the wire form can stop a client swapping them
- [ ] The refusal-to-status table gains whatever these raise. `no-such-item` already has a row;
      archiving something already archived, and unarchiving something that is not, are refusals —
      `409` by the table's own rule, being a conflict with what the pool already holds
- [ ] Verify: `pnpm lint`; every refusal code in the table has exactly one status
- [ ] `git commit`

### Phase 2 — The store *(depends on nothing but phase 0)*

- [ ] New migration: `routing_records` — id, item, target kind, destination and capability for a
      destination target, note for a user target, state, time, pointer. CHECK constraints pair the
      target kind to the columns that may be set, the way `item_tags` pairs `by_kind` to `by_ref`.
      **Foreign key to items, `ON DELETE CASCADE`** — a routing record is item state and purge
      already takes it
- [ ] Indexes: `routing_records(item_id)`; an expression index on
      `(COALESCE(content_updated_at, created_at), id)` over `items`, partial on `archived_at IS
      NULL`, for the queue's ordering
- [ ] `queue` and `archived` stop being `unimplemented`. Queue: unarchived, not superseded, holding
      no routing record, oldest first by content time. Archived: archived, ordered the same way.
      Both keyset-paginated through the existing `keysetPage`
- [ ] `routingRecords` stops answering `[]` and reads the table
- [ ] Writes: insert a routing record; set and clear archive state. Both bump `modified_at`
- [ ] Tests: an archived item leaves the queue and appears in the archive; unarchiving returns it
      at its original position; an item with a routing record leaves the queue; a superseded item is
      in neither; purging an item takes its routing records with it. Paging the queue while a new
      capture arrives never skips or repeats a row — the property `core.md` now claims
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint`
- [ ] `git commit`

### Phase 3 — Core *(depends on phase 2)*

- [ ] `items.archive` and `items.unarchive`. Each writes the state, bumps `modified_at`, enqueues a
      mirror job — archive state is mirrored material — and appends `archived` or `unarchived` by an
      anonymous person
- [ ] `routing.markProcessed`: mint a routing record targeting the user, delivered, with the
      optional note. Mirror job and a `routed` action, same transaction
- [ ] `routing.recordsFor`
- [ ] `views.queue` and `views.archived`, taking a `Page` and no order — oldest first is what makes
      the queue a queue ([ADR 10](../adr/0010-feed-and-queue-sort-differently.md))
- [ ] Tests: archiving an archived item is refused and changes nothing, as is unarchiving one that
      is not archived; marking processed twice
      leaves two records and the item processed either way; an archived item can still be marked
      processed; the mirror record for a marked item carries the routing record
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint`
- [ ] `git commit`

### Phase 4 — `/v1` *(depends on phases 1 and 3)*

- [ ] `GET /v1/queue` and `GET /v1/archived`, paginated by position, sharing the limit and position
      parsing the feed and the log already share. Neither takes `order`
- [ ] Archive, unarchive, mark-processed and read-routing-records routes
- [ ] The OpenAPI document, which is checked in and so appears in this commit's diff
- [ ] Tests: the queue drains to empty as items are archived and marked processed; following `next`
      yields every queued item exactly once with no trailing empty page; a feed position handed to
      the queue is accepted and produces a wrong page, which is the documented consequence rather
      than a bug
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint`
- [ ] `git commit`

### Phase 5 — End to end *(depends on phase 4)*

- [ ] Integration test: capture three, archive one, mark one processed, drain the mirror queue, and
      find the queue holding exactly one — with the mirror files for all three agreeing with the
      pool
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint` from a clean checkout
- [ ] `git commit`

---

## Unknowns

- **Whether the queue wants a partial index it cannot have.** SQLite cannot index a `NOT EXISTS`,
  so the routing anti-join rides on `routing_records(item_id)` rather than on the queue's own index.
  *Fallback*: measure before adding anything cleverer; a personal pool is small and the shape is
  right.
- **Whether `markProcessed`'s note belongs on the record or in the target.** `RoutingTarget`'s user
  variant already carries `note?`. *Fallback*: leave it there; it is where the type already put it.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The properties worth testing hardest:

- **Unarchiving returns an item to its original position.** `core.md` promises the position is
  unchanged because archiving never moved it, which only holds if the queue orders on content time
  and archiving does not touch it.
- **The queue's three exclusions compose.** An item that is archived *and* routed, or superseded
  *and* routed, must appear once in the right surface and nowhere else.
- **Keyset stability under concurrent capture.** The claim `core.md` now makes about the queue
  reordering safely is only true because new work lands ahead of an oldest-first reader; test it
  rather than trusting the argument.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`.
**Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what
landed and linking back to this plan. No implementation details, no granular tasks. A plan marked
Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
