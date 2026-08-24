# Editable until processed

**Date**: 2026-08-24
**Status**: Todo
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/sync.md`, `docs/specs/mirror.md`, `docs/specs/shell.md`
**Closed**:

---

## Goal

Editing an item the queue still holds changes it in place, however old it is and whatever has been
captured since, and leaves it where it sits in the queue. Editing one that has been routed,
archived or revised appends a revision: an ordinary capture with its own id, its own capture time
of now and its own source identity, linked back by `revisionOf` alone. An item may be revised more
than once, a retried edit produces one revision rather than two, and `supersededBy`, the head rule
and the revision chain are gone from the code as they are already gone from the specs. Decided in
[ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md).

---

## Tasks

### Phase 1 — the seal and the revision (core)

Depends on nothing. Everything else depends on this.

- [ ] Branch `agent/editable-until-processed` (already carries the ADR and the spec edits)
- [ ] `Item.supersededBy` becomes `revisedInto: readonly ItemId[]`, still derived and never stored.
      Absent is the empty list rather than `undefined`, so every caller reads `length`
- [ ] `sealed()` in `pool/edit.ts` loses the head clause and gains the revisions one: archived, or
      holding a routing record, or holding a revision. Delete `PoolTx.head()` and the port method
      with it
- [ ] `edit` takes a capture envelope rather than a bare payload — source, that source's own id,
      and the payload — and matches a revision for replay on `(source, sourceItemId)` exactly as
      `capture` does. An amendment needs no match. A replay answers the revision already made
- [ ] `revise()` mints its own capture time of now and its own source identity from the envelope,
      and stops setting `contentUpdatedAt` on the new item. Tags still carry over with their
      attribution; archive state, routing records and enrichment still do not
- [ ] `EditOutcome`'s revised half carries `revisionOf` rather than `supersedes`
- [ ] Delete the `item-superseded` refusal: both `refusal.ts` entries, the guard in `edit.ts`, and
      both guards in `tags.ts`. Any item that exists may be classified
- [ ] `amend()` keeps writing `contentUpdatedAt` — it records when content last changed and no
      longer orders anything
- [ ] Tests: amending a week-old unprocessed item; the same item revised once routed and again
      after that, giving two independent revisions that both name it; a retried edit answering one
      revision; tagging a routed-and-revised item; a cancelled reservation making an unrevised item
      editable again and a revised one not
- [ ] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [ ] `git commit`

### Phase 2 — the feed key and the queue key (store-sqlite)

Depends on phase 1's port shape.

- [ ] Migration: drop `root_id`, `revision_depth` and the `items_feed` index over them. See the
      unknown about SQLite column drops
- [ ] `FEED_KEY` becomes `created_at, id`. Delete `chain()`, the `chainAt` query and the chain
      lookup inside `feedKeyset`, which becomes a plain two-column keyset
- [ ] The queue and the archive order on `created_at, id` too. `CONTENT_TIME` stops being a sort
      key; the column stays and is still read. Replace the two `COALESCE` indexes at
      `migrations.ts:330` and `:334` with ones matching the new key
- [ ] The `supersededBy` map built at `pool-store.ts:489` becomes a grouping into a list, so an
      item revised twice answers both
- [ ] Delete the `revision_of IS NULL` carve-out in `itemBySourceIdentity`: a revision now has an
      identity of its own, so the lookup matches at most one row without help
- [ ] Delete the revision exclusion from tags-in-use. Every item that exists is counted
- [ ] Delete `newestItem` and the `head` guard
- [ ] `QUEUED` keeps all three anti-joins. The revision clause is now what keeps a thawed item out
      of the queue after something was revised from it, so it carries weight rather than agreeing
      with the routing clause by coincidence
- [ ] Tests beside the driver: a revision paginating at its own capture time; a feed page across
      the boundary of an item and its revision; the queue not reordering under an amendment; two
      revisions of one item read back as a list
- [ ] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [ ] `git commit`

### Phase 3 — the wire (daemon)

Depends on phases 1 and 2.

- [ ] `editRequestSchema` becomes an envelope: `source`, `sourceItemId`, `payload`
- [ ] `editOutcomeSchema`'s revised half carries `revisionOf`; the item schema carries
      `revisedInto` as an array of ids in place of `supersededBy`
- [ ] Delete `item-superseded` from the refusal table, from the status mapping in
      `errors/refusals.ts`, and from the two route descriptions in `routes/definitions.ts` that
      still promise a 409
- [ ] Regenerate `openapi.json` with `pnpm --filter @notemap/daemon openapi` and commit the result
- [ ] Route tests: the edit route on an unprocessed item, on a routed one, and replayed; the tag
      route succeeding on a revised item where it used to be refused
- [ ] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [ ] `git commit`

### Phase 4 — the client

Depends on phase 3's document.

- [ ] Regenerate `src/api/generated.d.ts` with `pnpm --filter @notemap/client codegen`
- [ ] The `edit` outbox operation carries a `sourceItemId` minted once when the operation is
      created and reused on every retry, which is what makes the replay match work. See the unknown
      about where that id comes from
- [ ] Delete `revised()`'s placement logic in `state/state.ts`. A revision is an arrival like any
      capture: it goes to the newest end, and the item it came from leaves the queue by being
      processed rather than by being pointed at
- [ ] `settle()` and any queue-membership test read `revisedInto.length` instead of `supersededBy`
- [ ] An amendment no longer re-ranks: drop the re-rank on the amended half of the edit settlement
- [ ] Delete the `item-superseded` message from `errors.ts`
- [ ] Tests: an optimistic amendment that settles as a revision; an amendment leaving queue
      position untouched; a retried edit leaving one revision
- [ ] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [ ] `git commit`

### Phase 5 — the shell

Depends on phase 4.

- [ ] `apps/ui/src/lib/lineage.ts`: `became()` and `finished()` read `revisedInto`. The word on the
      older row is `revised`, not `superseded` — it says what happened, not that the row is stale
- [ ] The edit action is offered on any unprocessed item and not on a processed one, which the row
      can now answer from `archived`, `routing` and `revisedInto` without a second read
- [ ] The last touch stops being described as what the queue is ordered by
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` green
- [ ] `git commit`

### Phase 6 — across the layers, and the specs

Depends on every phase above.

- [ ] `pnpm test:stack` green. Add a case that crosses the layers: capture, route, edit through the
      client, and read the revision back from the feed at its own capture time
- [ ] Remove the *Specified 2026-08-24, not built* note from core.md's Editing section
- [ ] Drop the **Build ADR 21** item from `docs/todo.md`
- [ ] Add the dated `Shipped:` entries (see Notes)
- [ ] `git commit`

---

## Unknowns

- **Dropping a column in SQLite.** Every migration so far is `ALTER TABLE ADD COLUMN`; nothing has
  removed one. `DROP COLUMN` needs SQLite 3.35+ and refuses a column an index names, so the two
  indexes come out first. *Fallback*: leave `root_id` and `revision_depth` in place, stop reading
  them, and drop them in a later migration. Ugly but harmless, and the pool is greenfield
  ([ADR 9](../adr/0009-versioned-api-mutable-until-first-real-pool.md)) so neither route needs a
  data migration.
- **Where the client's edit `sourceItemId` comes from.** It has to be stable across retries of one
  edit and distinct between two edits of one item. The outbox operation already has an identity
  that satisfies both. *Fallback*: mint a fresh uuid when the operation is created and store it on
  the operation, which is the same thing said longhand.
- **Whether `revisedInto` belongs on the wire as ids or as a count.** The specs say ids, and a
  shell wanting to open the revision needs one. *Fallback*: if the list turns out to cost a join
  per page that the store cannot index away, carry a count on the item and read the ids per item,
  which is the treatment routing records already get.
- **Whether the queue's `created_at` key wants a reader-facing order by last touch.** Out of scope
  here and recorded in `docs/todo.md`; the column survives precisely so that stays possible.

---

## Out of scope

Enrichment invalidation. core.md now requires it to be per declared need, but no enrichment runs
and `EnrichmentDescriptor` does not yet say what a need is, so there is nothing to invalidate. The
slice that builds enrichment carries it.

Purge. It is `notImplemented` and the specs describe what it should do; whoever builds it reads
core.md's Archive and purge section rather than this plan.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The existing edit and tag tests encode the old rule directly — `apps/daemon/src/routes/edit.test.ts`
asserts a 409 `item-superseded`, `apps/daemon/src/routes/tags.test.ts` asserts the same for tagging,
and `packages/client/src/editing.test.ts` drives a refusal through the client. Those are not
failures to fix but rules that were removed; rewrite each to assert what replaces it rather than
deleting the case.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
