# Editable until processed

**Date**: 2026-08-24
**Status**: Done
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/sync.md`, `docs/specs/mirror.md`, `docs/specs/shell.md`
**Closed**: 2026-08-24

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

- [x] Branch `agent/editable-until-processed-build`, the docs branch keeping its name
- [x] `Item.supersededBy` becomes `revisedInto: readonly ItemId[]`, still derived and never stored.
      Absent is the empty list rather than `undefined`, so every caller reads `length`
- [x] `sealed()` in `pool/edit.ts` loses the head clause and gains the revisions one: archived, or
      holding a routing record, or holding a revision. Delete `PoolTx.head()` and the port method
      with it
- [x] `edit` takes a capture envelope rather than a bare payload — source, that source's own id,
      and the payload — and matches a revision for replay on `(source, sourceItemId)` exactly as
      `capture` does — *amended in review*: the payload too, so an identity resent with different
      words is refused rather than answered with the earlier revision. An amendment needs no match.
      A replay answers the revision already made
- [x] **`EditEnvelope`, beside `CaptureEnvelope`**: a capture's envelope less what a revision mints
      for itself — no id, no capture time, no tags
- [x] **`EditRefusal` gains `source-item-changed`**, capture's, and for capture's reason: the
      envelope's identity naming an item that is not a revision of this one is refused rather than
      left to the store's uniqueness rule to raise as a lost write. Spec edit rides with phase 3
- [x] `revise()` mints its own capture time of now and its own source identity from the envelope,
      and stops setting `contentUpdatedAt` on the new item. Tags still carry over with their
      attribution; archive state, routing records and enrichment still do not
- [x] `EditOutcome`'s revised half carries `revisionOf` rather than `supersedes`
- [x] Delete the `item-superseded` refusal: both `refusal.ts` entries, the guard in `edit.ts`, and
      both guards in `tags.ts`. Any item that exists may be classified
- [x] **Delete `PoolReads.revisionChain`** and the driver's stub for it: there is no chain to walk
- [x] `amend()` keeps writing `contentUpdatedAt` — it records when content last changed and no
      longer orders anything
- [x] Tests: amending a week-old unprocessed item; the same item revised once routed and again
      after that, giving two independent revisions that both name it; a retried edit answering one
      revision; tagging a routed-and-revised item; a cancelled reservation making an unrevised item
      editable again and a revised one not. **These drive core through the real driver, so they
      land beside the existing ones in `tests/integration` and arrive with phase 2**
- [x] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [x] `git commit`

### Phase 2 — the feed key and the queue key (store-sqlite)

Depends on phase 1's port shape.

- [x] Migration: drop `root_id`, `revision_depth` and the `items_feed` index over them. **`DROP
      COLUMN` outright** — node 24 carries SQLite 3.53, so the unknown's fallback is not needed
- [x] `FEED_KEY` becomes `created_at, id`. Delete `chain()`, the `chainAt` query and the chain
      lookup inside `feedKeyset`, which becomes a plain two-column keyset
- [x] The queue and the archive order on `created_at, id` too. `CONTENT_TIME` stops being a sort
      key; the column stays and is still read. Replace the two `COALESCE` indexes at
      `migrations.ts:330` and `:334` with ones matching the new key. **The three surfaces are then
      one query through three filters**, the feed passing no filter at all
- [x] The `supersededBy` map built at `pool-store.ts:489` becomes a grouping into a list, so an
      item revised twice answers both, in the order the revisions were made
- [x] Delete the `revision_of IS NULL` carve-out in `itemBySourceIdentity`: a revision now has an
      identity of its own, so the lookup matches at most one row without help
- [x] **The same carve-out comes off the `items_source_identity` unique index**, which is what
      makes that true. A pool holding revisions written under the old rule — which copied the
      identity they were revised from — fails the migration rather than keeping two rows claiming
      one identity ([ADR 9](../adr/0009-versioned-api-mutable-until-first-real-pool.md): no pool is
      real yet, and the fix is a fresh one)
- [x] **Drop `items_one_revision_each`**, which held the chain to one revision per item.
      *Amended in review*: replaced by a plain `items_revision_of`, since the unique index was also
      carrying the queue's revision anti-join and the read that answers `revisedInto`
- [x] Delete the revision exclusion from tags-in-use. Every item that exists is counted
- [x] Delete `newestItem` and the `head` guard
- [x] `QUEUED` keeps all three anti-joins. The revision clause is now what keeps a thawed item out
      of the queue after something was revised from it, so it carries weight rather than agreeing
      with the routing clause by coincidence
- [x] Tests beside the driver: a revision paginating at its own capture time; a feed page across
      the boundary of an item and its revision; the queue not reordering under an amendment; two
      revisions of one item read back as a list. **And two over the migration itself**: a pool
      carried across keeps its items, and one whose revisions share an identity refuses to migrate
- [x] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [x] `git commit`

### Phase 3 — the wire (daemon)

Depends on phases 1 and 2.

- [x] `editRequestSchema` becomes `editEnvelopeSchema`: `source`, `sourceItemId`, `payload`, and
      **strict**, as the capture envelope is — a dropped `sourceItemId` costs a retry its match
- [x] `editOutcomeSchema`'s revised half carries `revisionOf`; the item schema carries
      `revisedInto` as an array of ids in place of `supersededBy`. **Required rather than optional,
      and empty where nothing was revised from the item**, which http-v1.md's presence rule is
      amended to say: the daemon answers core's item verbatim, and a list's empty is a value
- [x] `EDIT_STATUS` gains `source-item-changed` at `409`, http-v1.md's edit section says when it is
      raised, and core.md's Editing section says the rule underneath it
- [x] Delete `item-superseded` from the refusal table, from the status mapping in
      `errors/refusals.ts`, and from the two route descriptions in `routes/definitions.ts` that
      still promise a 409
- [x] **Three more descriptions were false rather than merely dated**: the feed's *superseded*, the
      queue's *content-time position*, and `/v1/tags`' *a superseded item is not counted*
- [x] Regenerate `openapi.json` with `pnpm --filter @notemap/daemon openapi` and commit the result
- [x] Route tests: the edit route on an unprocessed item, on a routed one, and replayed; the tag
      route succeeding on a revised item where it used to be refused
- [x] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [x] `git commit`

### Phase 4 — the client

Depends on phase 3's document.

- [x] Regenerate `src/api/generated.d.ts` with `pnpm --filter @notemap/client codegen`
- [x] The `edit` outbox operation carries a `sourceItemId` minted once when the operation is
      created and reused on every retry, which is what makes the replay match work. **Minted in
      `client.edit()` and carried on the operation itself**: the pending entry's own id is minted
      inside `outbox.enqueue`, and a handler's `send` receives the `Operation` and never the
      `PendingOperation`, so the entry's id is not reachable from where the request is built. It
      carries the **whole envelope**, source included, which is what a `send` with no view of the
      config can post — and is the shape a capture operation already has
- [x] **`client.edit` takes a source**, since a revision is a capture of whoever made the edit
      rather than of the item's own source. *Amended in review*: it is a parameter rather than
      client configuration, and it is the caller's ordinary capture channel — the shell passes
      `TYPED`. A rewrite through a channel wants that channel's policy, which is the only thing a
      separate source would buy, and `revisionOf` already says it was an edit
- [x] Delete `revised()`'s placement logic in `state/state.ts`. A revision is an arrival like any
      capture: it goes to the newest end, and the item it came from leaves the queue by being
      processed rather than by being pointed at. **Capture and revision share one `arrived()`**,
      which is what makes that literally true rather than merely parallel
- [x] `settle()` and any queue-membership test read `revisedInto.length` instead of `supersededBy`.
      **Put the rule in one named predicate** — unprocessed is holding no routing record, unarchived
      and `revisedInto` empty — rather than inline at each site:
      [durable-offline-client](durable-offline-client.md) derives the queue from the client's own
      cache by exactly this rule and will otherwise write a second copy of it
- [x] **`queueRank` keys on capture time**, which phase 2 made the pool's key: the client compares
      its rank against the position the pool issues, and a rank on last touch would have disagreed
      with every `after` the queue answers with
- [x] An amendment no longer re-ranks: drop the re-rank on the amended half of the edit settlement
- [x] Delete the `item-superseded` message from `errors.ts`
- [x] Tests: an optimistic amendment that settles as a revision; an amendment leaving queue
      position untouched; a retried edit leaving one revision
- [x] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [x] `git commit`

### Phase 5 — the shell

Depends on phase 4.

- [x] `apps/ui/src/lib/lineage.ts`: `became()` and `finished()` read `revisedInto`. The word on the
      older row is `revised`, not `superseded` — it says what happened, not that the row is stale
- [x] The edit action is offered on any unprocessed item and not on a processed one, which the row
      can now answer from `archived`, `routing` and `revisedInto` without a second read.
      **`editable` is the client's `unprocessed`**, re-exported rather than restated
- [x] The last touch stops being described as what the queue is ordered by
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` green
- [x] `git commit`

### Phase 6 — across the layers, and the specs

Depends on every phase above.

- [x] `pnpm test:stack` green. Add a case that crosses the layers: capture, route, edit through the
      client, and read the revision back from the feed at its own capture time
- [x] Remove the *Specified 2026-08-24, not built* note from core.md's Editing section
- [x] Drop the **Build ADR 21** item from `docs/todo.md`
- [x] Add the dated `Shipped:` entries (see Notes)
- [x] **client.md's retry criterion says it is session-scoped**, per the settled unknown below
- [x] `git commit`

---

## Unknowns

- **~~Dropping a column in SQLite.~~** *Settled 2026-08-24*: node 24 bundles SQLite 3.53, so the
  columns are dropped outright, after the indexes naming them. Every migration so far is
  `ALTER TABLE ADD COLUMN`; nothing has
  removed one. `DROP COLUMN` needs SQLite 3.35+ and refuses a column an index names, so the two
  indexes come out first. *Fallback*: leave `root_id` and `revision_depth` in place, stop reading
  them, and drop them in a later migration. Ugly but harmless, and the pool is greenfield
  ([ADR 9](../adr/0009-versioned-api-mutable-until-first-real-pool.md)) so neither route needs a
  data migration.
- **~~Where the client's edit `sourceItemId` comes from.~~** *Settled 2026-08-24*: minted in
  `client.edit()` and carried on the operation, for the reason given in phase 4. What remains is a
  limit rather than an unknown — the operation lives in a store nothing reads back, so the id is
  stable only **within a session**. A retry after a reload mints a fresh one and the pool records a
  second revision, which makes client.md's "an edit retried after a lost response leaves one
  revision rather than two" a session-scoped claim until
  [durable-offline-client](durable-offline-client.md) lands. Say so where the criterion is written,
  rather than letting it read as absolute.
- **~~Whether `revisedInto` belongs on the wire as ids or as a count.~~** *Settled 2026-08-24*:
  ids, and always spelled — a list's empty is a value, so every reader asks for its length rather
  than for its presence. The specs say ids, and a
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

## Related plans

This one goes first. Three plans wait on it, in this order:

1. [client-minted-assets-and-health](client-minted-assets-and-health.md) — the uploader mints the
   asset id, `PUT /v1/assets/{id}` replaces `POST`, and `GET /v1/health` answers the pool identity.
   Disjoint in design from this plan, but it edits the same refusal table and regenerates the same
   `openapi.json`, which is the only reason it waits rather than running beside it.
2. [durable-offline-client](durable-offline-client.md) — the client's store stops being write-only
   and both surfaces are derived from the cache when the pool is out of reach. It reuses this plan's
   unprocessed predicate and its capture-time ranking, which is why phase 4 asks for the predicate
   to be named once.
3. [shell-offline-marks](shell-offline-marks.md) — the pending mark, the incomplete-surface mark,
   and a picture drawn before it is sent. Phase 5 of this plan touches the same rows.

[offline-capture-rollout](offline-capture-rollout.md) sequences all four into pull requests and says
where each one may be split.

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
