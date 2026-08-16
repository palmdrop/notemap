# Review: The queue drains

**Date**: 2026-08-15
**Status**: Resolved — both bugs fixed, the archive indexed and its exclusions decided, the
comment sweep done, and `Surface` renamed to `ItemView`. Three findings are deliberately not
acted on: the `readBody`/capture split (6) is documented rather than unified, `ItemSlice`'s
example (8) was overtaken by the queue gaining an order, and the workflow (14) is not this
branch's file. See the Resolution below.
**Scope**: PR #10, `main..agent/queue-drains` — `7cedbae`
**Plan**: `docs/plans/queue-drains.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/mirror.md`
**ADR**: `docs/adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md`,
`docs/adr/0014-pagination-by-domain-position.md`

---

## Overall

The slice does what it says. The three exclusions compose correctly, `archived` is the exact
complement it should be on the axis it filters, migration 8 is safe, and every mutation bumps
`modified_at` and enqueues its mirror job inside the transaction that caused it. I went looking for
an item that could fall through every surface and there isn't one: an item is invisible to both
`queue` and `archived` exactly when it is unarchived and either superseded or routed, which is what
both specs say, and the feed still holds it.

The one thing that does not hold is the property the plan asked to be tested hardest.
**Unarchiving is a counterexample to "no page skips a row"** — a claim this PR wrote into two specs
and shipped a test for. The test only covers the easy half. That is finding 1, and it is a
docs-versus-code disagreement rather than a code bug: the code does the right thing and the spec
overpromises about it.

Verified by execution, on this working tree: `pnpm typecheck`, `pnpm lint`, `pnpm format:check` all
clean; `pnpm test` **436 passed** (10 core + 11 schema-ajv + 24 mirror-fs + 17 blob-fs + 116
store-sqlite + 94 integration + 164 daemon), one more than the PR's 435. Separately, against
`node:sqlite` v26.4.0 with migration 1 and migration 8's DDL reproduced verbatim, I measured the
query plans for both surfaces, paged across a content-time tie, exercised every CHECK on
`routing_records`, confirmed `ON DELETE CASCADE` takes the records with the item, confirmed the
`state` CHECK admits `pending`, and reproduced the unarchive skip. Everything else below is
inspection.

The `order` question and the archive/discard rename are under discussion elsewhere and are not
argued here; finding 8 notes one consequence of the shared slice schema that falls out of the first.

---

## Bugs

### 1. Unarchiving skips a row under a paging reader, and two specs promise it cannot

`docs/specs/core.md:287-292`, `docs/specs/http-v1.md:277-280`, against
`packages/core/src/pool/archive.ts:47-74`

Both specs argue the keyset is sound by enumerating two kinds of event:

> Every event that **moves** an item — a revision, an amendment, a new capture — gives it a content
> time of *now* … Every event that **removes** one — routing, archiving, being superseded — hides
> it, and a reader who had not reached it was never meant to see it. So no page skips a row or
> repeats one.

This PR adds a third kind: an event that **returns** an item, at a content time in the past. That is
the whole point of unarchive — `core.md:196-198` promises the position is unchanged — and it is
precisely what the enumeration does not cover.

```
reader takes page 1 → [item-0, item-2], next = (09:02, item-2)   # item-1 is archived
unarchive item-1                                                  # content time still 09:01
reader takes page 2 from (09:02, item-2) → [item-3]
reader saw item-0, item-2, item-3 — item-1 never appears
```

Reproduced by execution against the real predicate and the real keyset clause. A fresh read shows
all four; only the in-flight reader loses the row.

ADR 17 already commits to a second instance of the same shape: *"an abandoned or cancelled
reservation is removed, and the item resurfaces in the queue at its unchanged position"*
(`core.md:404`). When delivery lands, the queue will gain a second event that puts a row back behind
a reader — so this is not a one-off.

The behaviour is right. A queue is a work list, not a stream, and an item unarchived while someone
is halfway down a page is genuinely not urgent; it appears on the next read. What is wrong is the
absoluteness of the claim, and the `pool-store.test.ts:1002-1024` test named
"neither skips nor repeats a row when a capture arrives mid-read", which exercises only the case the
argument already covers — a capture at 09:30 landing after every existing row, i.e. *ahead* of the
reader. The interesting direction is untested.

Fix: amend both spec bullets to say what is true — no event that *moves* an item can make a page
skip or repeat, and an item **returned** to the queue behind a reader is seen on the reader's next
pass rather than on this one — and add the unarchive-mid-read test beside the existing one, asserting
the skip as documented behaviour. Do not change the code.

### 2. A bodyless `POST` is `415` unless the client sends `content-type: application/json`

`apps/daemon/src/middleware/content-type.ts:22-33`, against
`apps/daemon/src/routes/definitions.ts:277-280,306-309,335-338` and `docs/specs/http-v1.md:301-305`

`requireJsonBody` keys on the method, not on whether a body is present — deliberately, and the
comment gives a good reason. The three new routes declare `required: false` in OpenAPI and the spec
says *"an empty body is read as `{}`, so a client with nothing to say sends nothing."* A client that
sends nothing sends no `content-type` either:

```
curl -X POST /v1/items/abc/archive        → 415 unsupported-media-type, contentType ""
```

Every test in `queue.test.ts` goes through the local `send()` helper, which always sets the header,
so nothing catches this. Generated clients and `fetch(url, { method: "POST" })` will not.

The spec's own sentence a line earlier — *"Both routes are `POST` and so require `application/json`
like every other bodied request"* — describes the implementation, so the two halves of that bullet
contradict each other. Capture is unaffected: its body is mandatory.

Fix: let a request with no body through the guard (`content-length: 0` or absent, and no
`transfer-encoding`), keeping `415` for a non-empty body under the wrong type so the declared status
stays reachable — and drop the "so a client with nothing to say sends nothing" claim if you would
rather keep the guard as it is. Either way the two sentences in `http-v1.md` need to agree.

---

## Design

### 3. `keysetClause`'s stated guarantee does not hold on the queue

`packages/adapters/store-sqlite/src/pool-store.ts:137-142`, used at `:366`

> A row value rather than the `OR` form that spells out the same thing: SQLite **seeks straight to
> the position** on this, and scans the index from the end on that, which costs a page its offset in
> rows.

Measured with `EXPLAIN QUERY PLAN`:

| query | plan |
| --- | --- |
| feed, `(created_at, id) < (?, ?)` | `SEARCH items USING COVERING INDEX items_feed ((created_at,id)<(?,?))` |
| queue, `(COALESCE(…), id) > (?, ?)` | `SCAN item USING INDEX items_queue` |
| queue, the `OR` form | `SCAN item USING INDEX items_queue` |
| queue, bare `COALESCE(…) > ?` | `SEARCH item USING INDEX items_queue (<expr>>?)` |

SQLite will seek a row value against ordinary columns and will not against an expression index, so
on the queue the row-value form buys nothing over the `OR` form the comment rejects, and page *n*
costs its offset in rows — the exact cost the comment claims to have avoided. The PR discloses the
scan in its "Measured, not guessed" section, which is why this is design and not a bug; what is
wrong is that a comment now asserts a guarantee for a call site where it is false, which
`AGENTS.md` singles out.

Note the inversion: the *coarse* position (a bare instant, no id) seeks, and the precise one does
not.

Fix now: qualify the comment — the seek is a property of the feed's plain columns, and the queue
rides the expression index by scan. Fix later, if a pool ever gets large enough to care: make the
content time a real column (`content_time INTEGER NOT NULL`, written as `created_at` at capture and
overwritten on revision or amendment) rather than a `COALESCE`. That restores the seek and removes
the expression index, at the cost of one migration and one write-path invariant. It is a
denormalisation of a *content* time, not of the routing log, so it does not touch the "processed is
derived" argument.

### 4. The archive surface has no index and sorts every page

`packages/adapters/store-sqlite/src/migrations.ts:326-331`, against `pool-store.ts:105`

`items_queue` is partial on `archived_at IS NULL`, so `ARCHIVED` (`archived_at IS NOT NULL`) can use
nothing:

```
SCAN item
USE TEMP B-TREE FOR ORDER BY
```

Every page of `/v1/archived` scans the whole items table and builds a sort — including the keyset
pages, which cannot seek either. The migration comment says the archive "is small and drains
nowhere", which is the right instinct about *size* but is the argument for it growing without bound:
the queue drains to zero, the archive is the thing that accumulates. On the pool that presents this
surface at all, the archive is eventually the larger of the two.

Fix: either a second partial index `ON items (COALESCE(content_updated_at, created_at), id) WHERE
archived_at IS NOT NULL`, which costs one line and mirrors the first, or record in the plan's
Unknowns that the archive read is a full scan by choice. I would take the index — the two together
cover the table once and the asymmetry is otherwise invisible to a reader of the schema.

### 5. The archive does not exclude superseded items, and nothing says whether it should

`packages/adapters/store-sqlite/src/pool-store.ts:105`

`ARCHIVED` filters on one column. An item that is archived *and* superseded appears in the archive
while its revision sits in the queue — two versions of one thing on two surfaces, with nothing on
the wire marking the archived one as superseded. Verified by execution.

Not reachable through `/v1` today (`items.edit` is `notImplemented`, and revisions only arrive
through the store's own append path), so this is a note for the edit slice rather than a defect now.
But `core.md:157` makes it reachable by design — *"a revision of an archived item is not archived —
editing says the item is alive again"* — so the state will exist the moment editing does.

Fix: decide it when editing lands, and write the answer into the archive bullet of `core.md`
either way. The queue's exclusion of superseded items is stated; the archive's non-exclusion is
silence.

### 6. `readBody` is adopted by the three new routes and not by `captureHandler`

`apps/daemon/src/utils/body.ts:17-44` versus `apps/daemon/src/routes/captures.ts:11-24`

This is the developer's `mirror.ts:13` question in a second place, and the answer is less obvious
here: `readBody` reads an empty body as `{}`, where capture refuses one as `malformed-json`, and
that difference is load-bearing for a route whose body is mandatory. So capture cannot adopt it
as-is.

Fix: give `readBody` a `required` flag, or a sibling that refuses an empty body, and move capture
onto it — otherwise the daemon has two body readers with subtly different empty-body semantics and
nothing saying which a new route should pick. If you would rather leave capture alone, say so in the
`readBody` docblock, which is the one thing that comment could usefully carry and currently does not.

---

## Minor

### 7. The keyset's id half is never compared by any test

`packages/adapters/store-sqlite/src/pool-store.test.ts:996-1000` and `:1002-1024`

Every queue and archive test gives each item a distinct content time, so
`(COALESCE(…), id) > (?, ?)` is decided on its first element in all of them and the tie-break on
`id` is never exercised. This is finding 4 of the `job-subject-union` review, in the same file, one
surface along.

I confirmed by execution that it does work — two items at one instant, paged at `limit=1`, come back
in id order, each exactly once, with no repeat across the boundary. There is just no test of it. The
feed has one (`:551`, "Same instant for all three, so only the id tie-break orders them"); the queue
should have its twin.

### 8. `ItemSlice`'s example is a feed URL with an `order` on it

`apps/daemon/src/schemas/item.ts:71-74`

```
example: "/v1/feed?order=newest-first&limit=50&after=..."
```

The schema is now shared by three surfaces, two of which do not take `order`. It is the only example
a client reading the OpenAPI document sees for `next`. Either drop the query string to
`"/v1/feed?…"`, or keep the rename's promise and make the example neutral.

### 9. `routingRecordsHandler` asks the pool two questions with a gap between them

`apps/daemon/src/routes/routing.ts:29-38`

`pool.items.get(id)` and `pool.routing.recordsFor(id)` are two reads on two connection states. Once
purge exists, an item can go between them and the route answers `200 {"values":[]}` — exactly the
"claim about an item" the comment says the existence check exists to prevent. Harmless today; worth a
line in the purge plan, or a core method that answers both in one read.

### 10. `state` never reaches the domain, and ADR 17 says clients must read it

`packages/adapters/store-sqlite/src/mapping.ts:214-221`, `apps/daemon/src/schemas/routing.ts:11-27`

`toRoutingRecord` drops `row.state`. The PR argues this deliberately and I agree for this slice — one
possible value, and adding it would ripple into the mirror codec's round-trip arbitraries. But
ADR 17:136 is explicit that *"clients must read the state rather than assuming a record means
arrival"*, so `RoutingRecord` on the wire will gain a required-ish field in the delivery slice, and
any client written against `/v1/items/:id/routing` between now and then will be assuming exactly what
the ADR forbids. One sentence in `http-v1.md`'s routing-records section — records read today are all
delivered, and a `state` field arrives with delivery — costs nothing and inoculates the reader.

### 11. `migrations.test.ts`'s pin moved but its reason changed shape

`packages/adapters/store-sqlite/src/migrations.test.ts:30-35`

The pin itself is the right fix and closes finding 1 of the previous review. Note only that the
constant is now declared below the `afterEach` and above its one user, where the file's other
constants are at the top — trivial, but it reads as though it were moved to sit next to the comment
rather than next to its neighbours.

---

## Comment sweep

### 12. Comments to delete

The developer's note was *"a lot of unnecessary comments; make a general sweep."* Every comment this
PR adds, judged against `AGENTS.md`'s two questions. Six were flagged inline already and are marked
as such; the rest are mine.

**Delete outright**

| Where | Comment | Why |
| --- | --- | --- |
| `apps/daemon/src/errors/refusals.ts:60` | "Marking an item processed refuses only about its subject." | Restates the two-entry map directly below it. |
| `apps/daemon/src/routes/archive.ts:29-30` | "Strict and empty: unarchiving says one thing…" | The schema it describes is one import away and says it in its own comment; two comments for one `strictObject({})`. |
| `apps/daemon/src/routes/definitions.ts:77` | "The queue and the archive take no order…" | `pageQuery.omit({ order: true })` is the sentence. Fourth restatement of "oldest first is what makes a queue a queue" in the diff. |
| `apps/daemon/src/routes/queue.ts:9-13` | "The queue and the archive: the same read with two filters…" | Fifth. "The surface names its own path" restates `` `/v1/${surface}` ``. The developer flagged line 11 on other grounds; the whole block goes. |
| `apps/daemon/src/routes/routing.ts:21-22` | "200 rather than 201…" | The same sentence, nearly word for word, is already the OpenAPI response description at `definitions.ts:342-343`, where clients actually read it. |
| `apps/daemon/src/schemas/archive.ts:4` | "Strict, and both bodies optional…" | Restates `.strictObject` and `.optional()`; the why is `body.ts:12-16`'s already. |
| `apps/daemon/src/schemas/item.ts:68` | "One shape for every paginated read of items…" | The identifier is `itemSliceSchema`. |
| `apps/daemon/src/types/index.ts:50` | "The feed and the log let a reader choose an end…" | *(developer flagged)* |
| `apps/daemon/src/utils/query.ts:7` | "How far and from where — everything a paginated read takes but the direction." | Restates the type it returns. |
| `packages/adapters/store-sqlite/src/pool-store.ts:90-94` | "Unprocessed, unarchived and not superseded. Processed is derived here rather than stored…" | First sentence restates three SQL clauses; second explains a rejected alternative (the column that could disagree), which `AGENTS.md` names specifically and which `core.md:282-286` already carries. |
| `packages/adapters/store-sqlite/src/pool-store.ts:356-360` | "The queue and the archive: one key, one direction…" | *(developer flagged)* |
| `packages/adapters/store-sqlite/src/testing/fixture.ts:186` | "A record of the one target that needs no adapter…" | *(developer flagged)* |
| `packages/core/src/pool/archive.ts:60-61` | "The content time is untouched, which is what returns the item to the queue…" | Claims a guarantee this file does not enforce — it is `setArchive`'s three-column `UPDATE` in `pool-store.ts:570-577` that keeps it. A comment on a line that does nothing, about code elsewhere. |
| `packages/core/src/pool/mirror.ts:7-12` | "The write a mutation owes…" | *(developer flagged)* |
| `packages/core/src/pool/pool.ts:49` | "Neither takes an order…" | *(developer flagged)* |
| `packages/core/src/types/api/ports.ts:194` | "Sets the archive state, or clears it when given none…" | *(developer flagged)* |
| `tests/integration/src/queue.test.ts:315-316` | "Every item, however it left: what is on disk is what the pool would project for it now, field for field." | Restates the two-line loop under it. |
| `tests/integration/src/queue.test.ts:340-341` | "The row the reader has not reached yet, taken out from under it…" | Restates the test name plus the spec claim. |

**Trim rather than delete**

| Where | Keep | Cut |
| --- | --- | --- |
| `apps/daemon/src/errors/refusals.ts:48-52` | the `item-purged` sentence — a code nothing raises is genuinely surprising | "Both `409`s are a conflict with what the pool already holds", which `:12` already states for the whole table |
| `apps/daemon/src/utils/body.ts:11-16` | "An empty body is read as `{}` rather than refused" — a real *why* | "making the client send `{}` would be ceremony…" — a rejected alternative. Replace it with the fact from finding 6: capture does not use this, and why. |
| `packages/adapters/store-sqlite/src/mapping.ts:208-212` | "nothing here can produce a `pending` record" | the retelling of the column's future, which `migrations.ts:314-315` carries |
| `packages/core/src/pool/routing.ts:10-14` | "the record is born delivered" | the restatement of what marking processed *means*, which `CONTEXT.md` defines |
| `packages/core/src/types/api/refusal.ts:46-50` | nothing, if you want it gone | the whole block duplicates `http-v1.md:294-299` and the plan; the two kinds name themselves |
| `packages/adapters/store-sqlite/src/pool-store.ts:137-142` | the row-value/`OR` distinction | the "seeks straight to the position" guarantee — see finding 3 |

**Keep** — these answer a question the code cannot: `routing.ts:33-34` (why an existence check when
`recordsFor` would answer `[]`), `pool-store.ts:87` ("never of state" is the `modified_at` question
answered), `pool-store.ts:591` (why an insert into another table touches the item),
`archive.ts:38` (attribution), `migrations.test.ts:30-35` (the pin),
`migrations.ts:305,309,314-315,322-323,326-328` (a schema file is read without the code around it),
`queue.test.ts:116-118` and `queue.test.ts:149-150` (non-obvious test set-up),
`schema.test.ts:117-118` (the only thing making five positional `record.run(…)` calls readable —
though naming the arguments would be better), `mapping.ts:237` (matches `itemParams` and
`agentColumns` exactly; the bind-order coupling is real).

One inconsistency the sweep turns up: `archive.ts:38` explains `by: { kind: "person" }` and
`routing.ts:33` does not, for the identical line. Whichever way you go, go both ways.

---

## The handler pattern

### 13. Extract the tail, not the handler

The pattern the developer named — read body, refuse if `!body.ok`, do the operation, branch on
`kind` — has exactly **three** call sites, all added by this PR: `archive.ts:11-19`,
`archive.ts:26-38`, `routing.ts:11-25`. Every other handler differs somewhere that matters:

| handler | why it does not fit |
| --- | --- |
| `captureHandler` | mandatory body with different empty-body semantics; two success shapes; `201` + `Location` |
| `assetUploadHandler` | no JSON body at all; refusals arrive as a thrown `RefusedUpload` |
| `itemHandler`, `assetHandler` | no body, and `undefined` rather than a `Result` |
| `routingRecordsHandler` | no body, no `Result`, and a hand-rolled existence check |
| `feedHandler`, `actionsHandler`, `surfaceHandler` | query, not body; and they build a `next` URL |

So: **do not wrap the handler.** Three sites of ten lines each, all of which would have to pass a
schema, a status map, an id extractor and an operation into a higher-order function — that is more
moving parts than it removes, and the fourth route with a body will very likely be `route()`, which
takes a destination and a capability and returns something with its own success shape.

Two smaller extractions do pay, and both cover more sites than the big one would:

```ts
// utils/responses.ts
export function answer<T, R>(
  result: Result<T, R>,
  status: (refusal: R) => number,
): Response;
```

That is the last three lines of `archiveHandler`, `unarchiveHandler` and `markProcessedHandler`
verbatim, and the refusal branch of `captureHandler` (`captures.ts:27-29`) and
`assetContentHandler` (`assets.ts:74-76`) — five sites, one of which is not this PR's. It composes
with capture, which keeps its own success path and calls `answer` only when refused.

```ts
// utils/params.ts
export function itemIdFrom(context: Context): ItemId;
```

`context.req.param("id") ?? "" as ItemId` appears six times across five files, casting a string the
route already guarantees. One helper, one cast, one place to change when ids stop being strings.

Neither is urgent. `answer` is the one I would take now, since it is a pure subtraction.

---

## The workflow

### 14. `.github/workflows/verify.yml`

It is **not in this PR's diff** — it landed on `main` in `eefd8c5`, which this branch is rebased
onto. Reviewed anyway, as asked.

It gates what it claims: `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm test`, which
is exactly the four `AGENTS.md` requires, in an order that fails fast on the cheap ones. Versions are
right: `node-version: 24` matches `.nvmrc` and `engines.node`, and `pnpm/action-setup` `version: 11`
matches `devEngines.packageManager` 11.20.0 — note it is `devEngines`, not the `packageManager`
field, so the action does not read it from the manifest and the `11` in the workflow is the only
thing pinning it. Those two numbers can drift apart silently; a comment in the workflow, or moving to
`packageManager`, would tie them.

Two things to change:

- **`on: push` with no filter duplicates every PR run.** A push to `agent/…` with an open PR fires
  both `push` and `pull_request`, so every check runs twice, on two commits that are the same tree.
  `on: push: branches: [main]` plus `pull_request:` gives one run per PR and keeps `main` covered
  after merge.
- **No `concurrency` group.** Force-pushing a branch — or three commits in a row on a plan branch —
  leaves the superseded runs going. `concurrency: { group: ${{ github.workflow }}-${{ github.ref }},
  cancel-in-progress: true }` is the usual two lines.

Neither is a correctness problem. `permissions` is unset and the job needs none, which is the safe
default given nothing here writes to the repo.

---

## Naming and organisation

### 15. `Surface` is not vague so much as over-broad

`apps/daemon/src/routes/queue.ts:14`

I agree with the developer, with a correction: "surface" *is* the project's word — `core.md` says
"the abandoned surface", `http-v1.md` says "two sibling surfaces", and ADR 14's table is literally
headed **Surface**, listing five of them (`feed`, `queue`, `archived`, `actions.*`, `abandoned`).
The problem is that the type takes that whole word for two of the five, so
`function surfaceHandler(pool, surface: Surface)` reads as though it could serve the feed, which it
cannot — the feed takes an order.

`CONTEXT.md` and `Pool` both give a more precise word: the queue is "a view, not a place", and the
handler literally indexes `pool.views[surface]`. So:

```ts
export type ItemView = Extract<keyof Pool["views"], "queue" | "archived">;
export function itemViewHandler(pool: Pool, view: ItemView) { … }
```

`Extract` keeps it honest — rename `views.archived` in core and this stops compiling, where
`"queue" | "archived"` written out would not. If `ItemView` reads oddly next to `views.feed`, the
other honest option is naming what the two share rather than what they are: `OrderlessView`.

Otherwise organisation is right and matches the house: routes beside routes, schemas beside schemas,
`archive.ts`/`routing.ts` split by concern rather than piled into one file, and every test beside
what it tests. `queue.test.ts` in `apps/daemon/src/routes/` covers `queue.ts`, `archive.ts` and
`routing.ts` — three subjects in one file named after one of them. Small, but `routes.test.ts` next
door is the precedent for a shared file, so either name it for the slice or split it three ways;
right now it is neither.

---

## Non-issues

- **The predicate composes.** Verified by execution: routed + superseded appears in neither surface
  (the revision carries it), archived + superseded + routed appears in the archive alone, and
  archived + routed appears in the archive alone. `ARCHIVED` being the plain complement of
  `archived_at IS NULL` is correct — an archived item is in the archive whatever else is true of it,
  which is what "the archive is a filter, not a terminus" requires. No item is invisible on every
  surface: the feed is unfiltered.
- **Migration 8.** Pure DDL inside `BEGIN IMMEDIATE … COMMIT` with no data movement, so there is
  nothing to lose. `ON DELETE CASCADE` verified: deleting the item takes its routing records with
  `foreign_keys = ON`, which `createSqlitePoolStore` sets before `migrate`. All four CHECK
  constraints verified — a `destination` target missing its capability, a `user` target carrying a
  destination, and a `destination` target carrying a note are each rejected; the two legal shapes are
  accepted. `state` **does** admit `pending` (verified by insert), which is the correction the PR
  makes to the plan and is right: SQLite cannot widen a CHECK in place.
- **Bind order in `byContentTime`.** `where` is a parameterless constant, so `[...keyset.params,
  limit]` is correct, and `ORDER BY` matches the comparison's direction and columns. A future filter
  carrying parameters would have to push them in clause order the way `actions` does; a mismatch
  throws at bind time rather than silently misreading.
- **`modified_at` and mirror debt.** All three mutations run inside `store.transaction`, which is
  `BEGIN IMMEDIATE` under a process-wide write lock, so the read-check-write in `archive` cannot race
  a second archiver in-process, and `BEGIN IMMEDIATE` covers a second host. `setArchive` bumps
  `modified_at` in the same `UPDATE`; `insertRoutingRecord` touches the item immediately after, in
  the same statement sequence. `enqueueMirrorWrite` is called before the action in every path, inside
  the transaction. Nothing commits owing an unrecorded mirror write.
- **Refusal semantics.** Archiving an archived item and unarchiving an unarchived one both refuse
  before any write, in the same transaction that read the state, so nothing changes on refusal — and
  the tests assert the first reason survives the second attempt. `409` for both is what the table's
  own rule gives.
- **Empty-string `destination` / `capability` pass the CHECK**, which only tests null-ness. Consistent
  with every other CHECK in the schema, and core cannot mint one.
- **A `user` target may carry a `pointer`.** Odd but harmless, and nothing writes one; tightening it
  would be a fifth CHECK for a shape core cannot produce.
- **`routingRecordParams` returning a positional tuple** rather than an object. Matches `itemParams`
  and `agentColumns`; the tuple type is what makes the arity a compile error.
- **`markProcessed` not refusing a superseded item.** Nothing in `core.md` says it should, and a
  routing record on a superseded item is a true statement about where its content went.
- **`item-purged` in both status maps ahead of purge.** The exhaustive `satisfies Record<…>` forces
  it, and `404` is the same answer `no-such-item` gets. Argued in the PR.

---

## Resolution

1. **Fixed** (docs). Both spec bullets now claim only what holds — no event that *moves* an item
   can cost a page a row — and each carries a second bullet for the third kind of event, written
   for returning in general rather than unarchive alone, since ADR 17 commits to the same shape.
   The store has the test beside the existing one: page 1, unarchive behind the reader, page on,
   and the row appears only on a fresh read. The code is unchanged.
2. **Fixed**. The guard no longer keys on the method alone. A request whose route declares an
   optional body and which carries no body — no `transfer-encoding`, and either a zero-length body
   or no body stream at all — passes without a `content-type`. Which routes those are is filtered
   out of `ROUTES`, so the guard and the OpenAPI document cannot disagree. Capture keeps `415` for
   a bodyless `POST`, every route keeps it for a non-empty body under the wrong type, and
   `http-v1.md`'s two sentences now agree. Tested in `middleware/content-type.test.ts`.
3. **Fixed** (comment). `keysetClause` now says the seek is the feed's plain columns' and that
   neither form seeks on an expression index. The query is untouched; the column is finding 3's
   later fix and is not taken now.
4. **Fixed**. `items_archived` mirrors `items_queue` on the other half of the partial predicate.
   Measured after: both pages of the archive are `SCAN item USING INDEX items_archived` with no
   temp b-tree, where before they were `SCAN item` plus a sort. It goes into migration 8, which is
   this branch's own and unreleased.
5. **Fixed** — decided rather than deferred. The archive excludes nothing: it filters on the one
   axis archiving acts on, so an archived item a revision points at stays in the archive while the
   revision sits in the queue. Dropping it would leave it reachable from the feed alone, which is
   the surface for what is never lost rather than for what was set aside — and `supersededBy` is
   read off the item wherever it appears, so nothing about the pair is hidden from a client. Stated
   in `core.md`'s archive section and echoed in `http-v1.md`.
6. **Mitigated**. `readBody` keeps its empty-body semantics and its docblock now carries the fact
   that was missing: capture does not use it, because its body is mandatory and an empty one is
   malformed rather than absent. No `required` flag, and no second reader — one call site is not
   yet a shape.
7. **Fixed**. The queue now has the feed's twin: three items at one instant, paged at `limit=2`,
   each returned once in id order.
8. **Won't fix**. Overtaken by `839a444`: all three surfaces sharing `itemSliceSchema` take an
   `order`, so `order=newest-first` in the example is no longer a parameter two of them refuse.
   What is left is that a shared schema illustrates `next` with one surface's URL, and a concrete
   example beats a neutral one.
9. **Mitigated**. Recorded in `docs/todo.md` against purge, which is where the window opens: either
   one core method answering both questions, or accepting it deliberately.
10. **Fixed**. `http-v1.md`'s routing-records section says every record read today has been
    delivered and that delivery adds a `state` a client must read, so nothing written against the
    route now assumes what ADR 17 forbids.
11. **Fixed**. `BEFORE_SUBJECT_SPLIT` sits with the file's other constants; the comment moved with
    it.
12. **Fixed**. Every comment on the delete list is gone, every trim is trimmed, and every keeper
    kept. Three were wrong rather than merely redundant and are named in the commit. The comments
    `b637dc3` and `839a444` added were judged against the same bar: the surface-query, `ordered`
    and `fallback` docblocks go, `PoolReads.queue`'s stays, since the default order it names is
    invisible in the signature. `by: { kind: "person" }` is now explained in both files that
    hardcode it.
13. **Won't fix**, as the review recommends: no handler wrapper. `answer` and `itemIdFrom` are not
    taken here either — both are pure subtractions and both are cheaper once the fourth bodied
    route exists to shape them.
14. **Won't fix here**. `verify.yml` is not in this branch's diff. The duplicate `push`/
    `pull_request` runs and the missing `concurrency` group are real and cheap, but they belong to
    a change against `main` rather than to this PR.
15. **Fixed**. `ItemView`, in the `Extract` form, with `itemViewHandler` and `itemViewQuery`
    following it. `queue.test.ts` is split three ways beside what each file tests — `queue.ts`,
    `archive.ts`, `routing.ts` — with the media-type cases moved next to the guard and the shared
    client helpers moved into the daemon fixture.
