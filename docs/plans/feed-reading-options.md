# Feed reading options: order by when processed, filter by state

**Date**: 2026-10-20
**Status**: Todo <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`, `docs/specs/mirror.md`
**Closed**:

---

## Goal

> On the feed, a person can choose to read it ordered by when each item was processed (its latest
> processing decision, or its capture for an unprocessed one) as well as by capture time, and can filter it by state (unprocessed, routed, discarded,
> revised), by destination and by source. Every one of these is answered by the pool, paged,
> drawn from the cache offline, and kept on the URL.

Three items from [todo.md](../todo.md): ordering the feed by processing, filtering it on routed and
non-routed, and "other relevant filters". Not built here: the same options on the queue or the log,
batch actions on a filtered set, fuzzy search.

---

## Decided

Settled with the developer on 2026-10-20 and 2026-10-21.

- **The key is when an item was processed**: the latest of each routing record's decision time
  (a pending reservation and a mark by hand count, since the decision is what processes an item),
  `archivedAt` while archived, and the capture time of each revision made from it. An unprocessed
  item's key is its capture time. **Edits never count**, `content_updated_at` included: the reading
  shows decisions, and an edit moving a row would mix in "what was I working on". Derived, so
  undoing a decision moves the key back. Every item stays on the feed in this order. Nothing is
  hidden.
- **The term is processed at**: `processedAt` on the wire, `processed_at` in the store,
  `by=processed` on the read, and `processed` in the shell, all one word. It is not `modifiedAt`.
- **Capture time stays the default key.** Processed at is a reader's option on the feed, chosen
  where the order is chosen. It is not offered on the log, which is too noisy for this.
- **This partially reverses [ADR 10](../adr/0010-feed-and-queue-sort-differently.md)**, whose feed
  key is "immutable true chronology". [ADR 65](../adr/0065-the-feed-may-be-read-by-when-each-item-was-processed.md) supersedes the feed-key clause for
  this option only. ADR 10's guarantee still holds for the default reading.
- **A filter is no longer only tags.** CONTEXT.md's **Filter** is widened to cover state,
  destination and source on the feed.
- **The key is a separate parameter, not a third `Order`.** `by=capture|processed` beside `order`.
  `next` always carries it, as it always carries `order`.
- **The position keeps its spelling.** `<at>,<id>`, `at` being the read's key. A position from one
  key handed to the other is read as an instant, not refused.
- **The store holds the key as a column**, `processed_at` on `items`, indexed on
  `(processed_at, id)`, worked out from scratch in the same transaction as every write that moves
  it, backfilled by a migration.
- **The wire item carries `processedAt`**, always present.
- **State filter**: `state=` repeated on `GET /v1/feed`, values `unprocessed`, `routed`,
  `archived`, `revised`. `archived` and not `discarded`: the wire says archive everywhere, and only
  the shell says discard. Any of; tags every one of; the kinds AND together. `state=unprocessed` on
  the feed is allowed.
- **Destination and source**: `destination=<id>` (any record naming it, pending included) and
  `source=<id>`, each repeatable as any-of. `destination` on the feed only; `source` on the queue
  and the archive too, the archive taking what the queue takes.
- **Refusals**: `422 bad-by` {by, allowed} and `422 bad-state` {value, allowed}, following the
  daemon's closed-list refusals `bad-order` and `bad-kind`. An empty `destination` or `source` is
  `422 bad-destination` / `422 bad-source` {value}; one naming nothing is an empty page. `by`,
  `state` or `destination` on the queue or the archive is `422 unsupported-parameter`
  {parameter}, since the daemon otherwise ignores unknown parameters and would answer a filtered
  question unfiltered.
- **The shell**: the feed's order chooser has two bands, `captured` (`newest`, `oldest`) and
  `processed` (`latest`, `earliest`); the control reads `latest processed` / `earliest processed`
  under that key. `by=processed` on the URL, absent for capture. The `tags ▾` control is `filter ▾`
  on both surfaces; the feed's panel has `state`, `destination` and `source` bands above the tags,
  the queue's `source` and the tags. `state` draws `discarded` and puts `state=archived` on the
  address.
- **By day under that key**, headings head the day each row was processed and the row's stamp
  stays its capture time.
- **No filter for marks by hand** for now.

---

## Tasks

### Phase 1: decisions on paper (no dependencies)

- [x] Create branch `agent/feed-reading-options`
- [x] New ADR: the feed may be read by when each item was processed. Supersedes ADR 10's feed key for that option
      only, and argues against ADR 10's own reasoning rather than around it. Add a superseding note
      at the top of ADR 10.
- [x] CONTEXT.md: add **Processed at**, widen **Filter**, check **Position** still reads right
- [x] Draft the spec changes: core.md (the feed's reads and their filters), http-v1.md (`by`,
      `state`, `destination`, `source`, `next` carrying them, the refusals), client.md (pages keyed
      by key as well as order and filter), shell.md (the order chooser, the filter panel)
- [x] Get the developer's confirmation on the docs before any code lands
- [x] `git commit`

Verify: the developer has approved the ADR, CONTEXT.md and the spec diffs.

### Phase 2: state, destination and source filters, end to end (depends on 1)

Independent of the ordering work. It ships value first and exercises the filter plumbing that
phase 4 extends.

- [ ] Store: clauses beside `carrying()` for state, destination and source, in `pool-store.ts` and
      kept to small helpers
- [ ] Core: the feed's filter type widens from a tag list to a record of tags, states,
      destinations and sources. Queue and archive take tags and sources.
- [ ] HTTP: parse, validate (`422 bad-state`, `bad-destination`, `bad-source`,
      `unsupported-parameter`), and carry the new
      parameters on `next`. Update the OpenAPI document, and regenerate the client's
      `generated.d.ts` with the project's existing script.
- [ ] Client: `Filter` widens. Update `carries()`/`belongs()` so the cache answers the same filter
      offline, routed-to-destination read from the routing summary's `to`. Update `filterOf`, and
      the URL form the shell reads.
- [ ] Shell: the filter panel's bands, the head's count, `ClearFilters`, the emptied-filter
      sentence (`Nothing matches routed and kind/quote.`)
- [ ] Tests at each layer. One integration test reading a filtered feed through the daemon.
- [ ] `git commit`

Verify: `pnpm -r --no-sort --silent test`, typecheck and lint green. Run `pnpm test:stack`, since
this crosses the HTTP surface. In the running shell, `/feed?state=routed` draws only routed rows
and survives a reload.

### Phase 3: the last-touch key in the pool (depends on 1)

- [ ] Migration: `touched_at` column, backfill, index on `(touched_at, id)`
- [ ] Write `touched_at` in every transaction that moves it: capture, amend, route reservation,
      reservation removed (the tag given back), archive, unarchive, revise (on the item revised
      from). Find each path by searching the store's writes, not from memory. The list found in
      phase 1 is under Unknowns.
- [ ] Rename the store's `touchItem`/`touched()` to say they bump `modified_at`, so "touch" means
      one thing in the store
- [ ] Store/core: feed read keyed by `capture` or `touch`, keyset paging on the chosen column
- [ ] Wire: `touchedAt` on the item. HTTP `by`, refused on queue and archive (`422 unsupported-parameter`; `bad-by` for an unknown value),
      carried on `next`.
- [ ] Tests: each write moves the key as the Decided section says. Paging under `by=touch` is
      stable across a page boundary. A position from one key is read under the other only as an
      instant.
- [ ] `git commit`

Verify: store, core and daemon tests green. `GET /v1/feed?by=touch` against a seeded pool puts
the last-routed item first.

### Phase 4: the last-touch key in the client and shell (depends on 3; extends 2 if landed)

- [ ] Client: a page carries its key beside its order. `rank`, `loaded`, `intoPage` and
      `drawnFrom` read the key the page is read by. A cache read offline sorts by it the same way.
- [ ] Client: a decision this client makes (route, archive, unarchive, edit) moves the item's
      `touchedAt` in the cache, so its row moves live. Watcher-applied actions do the same.
- [ ] Client: rename `oldestTouchedFirst` in `state/retention.ts`, which sorts by `modifiedAt`
- [ ] Shell: the order chooser's four choices, kept on the URL (`by=touch`) and remembered per
      surface beside the order. A row processed while read by touch moves to the head, and moves
      the way any arriving row does.
- [ ] Shell: the held row keeps its place while selected, even though its key moved (`placeOf`
      in `lib/held.ts` reads the page's key)
- [ ] Tests at each layer
- [ ] `git commit`

Verify: unit tests, typecheck, lint and `pnpm test:stack` green. In the running shell, route a row
on `/feed?by=touch`: it stays held while selected, then sits first.

---

## Unknowns

Resolved by reading the code, 2026-10-20:

- **Every write that moves the key.** In `packages/adapters/store-sqlite/src/pool-store.ts`, the
  `PoolTx` writes that move it are:
  - `insertItem`: the new item's key is its capture time; where `revisionOf` is set, the item
    revised from moves to the revision's capture time (already touches `modified_at` there).
  - `amendItem` does not move it: an edit is not a decision.
  - `setArchiveState`: forward to `archivedAt` on archive; recomputed on unarchive.
  - `insertRoutingRecord`: forward to `record.at`. Callers: `route.ts` `deliver` and `reserve`,
    `records.ts` `markProcessed`, `templates/fire.ts` `fire`.
  - `removeRoutingRecord`: recomputed. Callers: `route.ts` `cancelDelivery`, `work.ts` on giving up
    a delivery.
  - Not moved: `resolveRoutingRecord` (a landing), `addTag`, `removeTag`, enrichment, assets.
  - Purge has no store write yet. When it does, purging a revision takes a fact from the item it
    was revised from, which then recomputes.
  No other runtime `UPDATE items` exists; the rest are migrations. The fallback test (recompute and
  compare after the integration scenarios) is still worth having.
- **What the client knows to move `processedAt` locally.** A route and a mark answer the record,
  whose `at` is the decision time and so the key itself: exact, no guess. An archive may wait in
  the outbox, so the copy takes the operation's time and the pool's item replaces it; online, it
  answers the item. An undo (cancel, unarchive) cannot be recomputed from the
  copy, since `RoutingSummary` carries no record times, so the row waits for the pool's item.
  Written into client.md.
- **Watcher actions carrying enough.** Not all do. `archived`, `unarchived`, `revised`,
  `template-fired`, a `routed` from `markProcessed` and an inline delivery all have `at` equal to
  the instant the key took. But a reservation that lands later writes `routed` with `at` = landing
  time (`route.ts` `land`), a person's reservation whose inline attempt failed is heard only as
  `delivery-failed` attempt 1, and cancel and abandonment carry no new key. Fallback adopted: the
  watcher re-reads the item (`GET /v1/items?id=…`) on every kind that can move the key. Written into
  client.md.
- **Rebuild.** The mirror record carries everything the key is derived from except pending
  reservations, which rebuild does not restore either. A line is added to mirror.md's Rebuild.
- **A filter on routed-to-destination offline.** `RoutingSummary.to` is
  `{ kind: "destination", destination: DestinationId } | { kind: "user" }`: destinations by id. The
  cache answers the destination filter offline. A route this client makes is folded into the
  summary from the answered record (`processed()` in `state/state.ts`), and routing never waits in
  the outbox.
- **A revision's capture time** is the pool's clock at the edit (`edit.ts` sets `createdAt: now`),
  so "the capture time of a revision" is when the edit was made, never a source's past instant.

Answered by the developer 2026-10-21: by-day headings head the day each row was processed, with
the capture time on the stamp; no filter for marks by hand; `source` allowed on the queue (and so
the archive); ADR 14's table gains the row; edits never count toward the key; the term is
**processed at**, in the domain, the wire, the store and the shell alike.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Run `pnpm --filter @notemap/core mutation` and the client's mutation run while working on phases 2
and 3. Both change decisions those packages make.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
