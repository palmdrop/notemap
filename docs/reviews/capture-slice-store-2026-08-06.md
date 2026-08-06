# Review: Capture slice over SQLite (PR #3, `agent/capture-slice-tests`)

**Date**: 2026-08-06
**Status**: Closed — 2026-08-06
**Scope**: `packages/adapters/store-sqlite/`, `packages/core/src/types/` (port reshape), `packages/core/src/pool/*.test.ts`, `packages/core/src/testing/`
**Spec**: `docs/specs/core.md`, `docs/specs/sync.md`, ADRs 1, 8, 10, 11, 12, 13

## Resolution

The file references below describe the drizzle/better-sqlite3 driver this review was written
against; the driver was rewritten on `node:sqlite` afterwards, and the findings were resolved
against that rewrite.

- **Fixed by the rewrite** (`a975cfd`, `a31f103`, `15b7f23`): 1 and 2 (reentrancy is detected
  by `AsyncLocalStorage`, no flag to leak), 3 (reads run on a second `query_only` connection),
  4 (`ROLLBACK` failure is swallowed in favour of the original error), 5 (decided: a revision
  carries the identity of the capture it revises; partial unique index plus spec and ADR 1
  amendments), 6 (`items_one_revision_each`), 8 (the fence), 9 (ADR 10 amended), 11 and 12
  (mid-flight arrival and same-instant ties are tested), 13 (core's skipped suites were
  replaced by `tests/integration/` driving core over the real store), 14.
- **Fixed after the rewrite, same branch**: 10 (timestamp equality is instant equality,
  recorded in `core.md`), 16 (cursor tags are namespaced per read surface), 17 (malformed
  cursors and non-positive limits are refused), 18 (`by_ref` null-consistency `CHECK`), and
  the `sync.md` line assigning `modified_at` to core.
- **Accepted as is**: 7 — the ADR 12 amendment records that the log coupling is now discipline;
  a structural nudge is to be revisited when the mutation surface grows past a few methods.
- **Still open**: 15, under discussion — the fix direction is per-kind minting methods on
  `IdGenerator` so the cast lives in the generator, not at call sites.

---

## Overall

The port reshape is the right call and the PR argues it honestly: preconditions as ordinary
reads inside a transaction are simpler than the `Mutation` bundle, and the schema's forced
decisions (epoch ms, no sources table, the `pool_meta` counter) are all correct with their
reasoning stated. The schema and the keyset pagination are sound. The problem is concentrated
in one file: `src/transactions.ts` has two confirmed correctness bugs — one that falsely
rejects any concurrent caller, one that permanently kills the store after a failed `BEGIN` —
plus an error-masking rollback path, and the reads that bypass its queue produce confirmed
dirty reads. All four were reproduced against the real store, and the existing tests cannot
catch them because the concurrency test queues both transactions synchronously. None of this
invalidates the design; the serialization queue needs a rework, not the port.

---

## Bugs

### 1. The `inside` flag rejects any caller that arrives while a transaction is mid-flight

`packages/adapters/store-sqlite/src/transactions.ts:19,41` — a single boolean cannot
distinguish "called from within the running transaction's callback" from "called by an
unrelated task while a transaction happens to be executing". JS is single-threaded, but the
callback is async: every `await` inside `work` yields to the event loop, and any other task
whose continuation fires in that window — a second HTTP request, a timer, a resolved promise —
sees `inside === true` and is rejected with the nested-deadlock error instead of being queued.
Reproduced against the real store:

```
const a = pool.transaction(async (tx) => { await tx.insertItem(...); await delay(30); });
setTimeout(() => appendCapture(pool, ...), 10);   // rejects: "would deadlock"
```

This defeats the queue's entire purpose — serializing overlapping transactions is the case it
exists for — and it fails timing-dependently, so it will pass tests and break under a
concurrent host. The test at `pool-store.test.ts:172` ("does not let two overlapping
transactions interleave") submits both calls synchronously, before the first has begun
executing, so `inside` is still `false` at both `run()` calls and the race is never exercised.

Fix: detect reentrancy by async context, not by flag — `AsyncLocalStorage` in the adapter
(Node-only package, so it is allowed), entered in `execute`, checked in `run`. Everything else
about the queue can stay.

### 2. A failed `BEGIN IMMEDIATE` leaves `inside` stuck true; the store is then dead forever

`packages/adapters/store-sqlite/src/transactions.ts:22-23` — `connection.exec("BEGIN
IMMEDIATE")` sits after `inside = true` but *outside* the `try`/`finally` that resets it. If
`BEGIN` throws — `SQLITE_BUSY` after the busy timeout, reachable exactly when a second process
holds the write lock, which `SqlitePoolStoreConfig`'s own comment contemplates ("concurrent
hosts are made safe by leasing work") — that transaction rejects correctly, but `inside` stays
`true` and **every subsequent transaction is rejected** with the misleading nested-deadlock
error until the process restarts. Reproduced: after one induced `BEGIN` failure, the next
transaction on the same store rejects permanently.

Fix falls out of fix 1 (context-scoped detection has no flag to leak); otherwise move `BEGIN`
inside the `try`.

### 3. Reads outside a transaction see uncommitted, possibly rolled-back state

`packages/adapters/store-sqlite/src/pool-store.ts:145,167-260` — every store-level read runs
directly on the single connection, outside the queue. `BEGIN` is connection state, so a read
whose turn on the event loop lands between a transaction's statements executes *inside* that
open transaction and sees its uncommitted writes. Reproduced: `pool.item()` returned an item
mid-flight that the transaction then rolled back. A reader can also observe half an operation
— the item inserted, its action not yet — which breaks the atomicity the port promises
("commits what it wrote when the promise resolves") from the reader's side.

Fix: a second read-only connection for the store-level reads — WAL already gives snapshot
isolation across connections — leaving the tx handle's reads on the write connection, where
seeing uncommitted state is the point. Routing reads through the queue also works but
serializes reads behind writes for no reason.

### 4. `ROLLBACK` can throw and mask the original error

`packages/adapters/store-sqlite/src/transactions.ts:29` — some SQLite errors
(`SQLITE_FULL`, `SQLITE_IOERR`, `SQLITE_BUSY` among them) roll the transaction back
automatically. When `work` rejects because of one, the explicit `ROLLBACK` throws
`cannot rollback - no transaction is active`, and that error propagates instead of `cause` —
the diagnostic for a full disk arrives as a rollback complaint. Guard with better-sqlite3's
`connection.inTransaction` before issuing `ROLLBACK`, or catch and discard the rollback error
in favour of `cause`.

---

## Design

### 5. A revision's source identity is unrepresentable, or undecided, under the unique index

`packages/adapters/store-sqlite/src/schema.ts:46` — `unique(source_id, source_item_id)` covers
all items, revisions included. The domain says a revision is a clone of the original
(`core.md:82-84`); if the clone carries the original's source identity — the natural reading —
the insert is refused by the very constraint meant to backstop capture dedup. If instead core
must mint a synthetic identity per revision, that is a real decision nowhere stated, and it
changes what `itemBySourceIdentity` answers on a re-read of the source (the superseded
original — probably right for the `source-item-changed` check, but nobody has said so).
Revisions are first-slice scope, so this is the "anything unrepresentable" case: the schema
forces an answer the docs don't have. The test at `pool-store.test.ts:58-74` dodges it — the
fixture defaults `sourceItemId` to `src-${id}`, so the revision silently gets a fresh identity.

Related: that same test gives the revision a *later* `createdAt` (`pool-store.test.ts:66-69`),
but CONTEXT.md and `core.md:80-82` say a revision carries the **original** capture time plus an
edit time. With spec-shaped revisions, original and revision tie on `created_at` and the feed's
id tie-break plus `head()`'s ordering become load-bearing — and neither is exercised anywhere
(see 10).

### 6. The no-fork invariant has no backstop; capture identity got one

`packages/adapters/store-sqlite/src/schema.ts:41,48` — editing a superseded item is refused
(`core.md:94-96`), which means `revision_of` is unique among non-null values. The duplicate-id
and duplicate-source-identity checks got constraints as backstops against a core bug; the
no-fork invariant got nothing, and a fork is silently absorbed — `hydrate`'s
`revisions.find(...)` (`pool-store.ts:139`) picks an arbitrary one as `supersededBy`. One
partial unique index (`ON items(revision_of) WHERE revision_of IS NOT NULL`) closes it for the
same price as the others.

### 7. ADR 12's cannot-drift argument weakened from shape to convention

`packages/core/src/types/api/ports.ts:117-121` — the old `Mutation` carried `actions` as a
required field: a driver got the log entry and the change in one value, and core structurally
could not submit one without the other. Now `appendAction` is a separate call core may simply
forget, and nothing but review notices a mutation that logs nothing. Atomicity survives (same
transaction); the coupling ADR 12 leaned on ("written in the same command as the change it
describes and cannot drift from it") does not. At minimum the ADR amendment should say the
coupling is now discipline. Worth considering a structural nudge — `insertItem` taking its
action, or the transaction refusing to commit having written state but no action — before the
mutation surface grows past three methods.

### 8. The tx handle survives its transaction and then writes in autocommit

`packages/adapters/store-sqlite/src/pool-store.ts:354-360` — one shared `tx` object is handed
to every callback and is never invalidated. Core (or a test) that lets the handle escape —
stores it, returns it, closes over it in a callback that outlives `work` — gets writes that
silently autocommit outside any transaction, which is the exact failure the port exists to
prevent. Cheap fix: hand each `work` a wrapper that throws once the transaction settles.

### 9. Feed default order contradicts ADR 10, and the PR's docs-debt list misses it

`docs/adr/0010-feed-and-queue-sort-differently.md:19` — "The feed sorts by `created`. The
queue sorts by `updated ?? created`. **Both ascending.**" The PR makes the feed default
newest-first (`pool-store.ts:80`, `result.ts:15-23`) and its otherwise-careful list of
now-false doc statements (ADR 1, core.md, ADR 12) does not mention ADR 10 at all. An order
*parameter* is compatible with ADR 10's reasoning; a newest-first *default* reverses a recorded
decision, and per the project's own rule that takes a superseding note, not an implicit
override. The argument "core imposes no interface policy" cuts against itself here — a default
is policy whichever direction it points. I think newest-first is the right default for a feed a
client renders; it still needs ADR 10 amended, and the skipped core tests disagree with it
today (see 12).

### 10. Timestamp canonicalization is an accidental, undecided contract

`packages/adapters/store-sqlite/src/mapping.ts:38-40` — the store returns every timestamp
respelled as `toISOString()` (`09:15:00Z` in, `09:15:00.000Z` out). `Timestamp` is "RFC 3339,
always UTC" (`ids.ts:21`), which admits both spellings, so round-tripping changes the string
and any string comparison of timestamps across the store boundary breaks. The skipped core
test `capture.test.ts:37` (`expect(item.createdAt).toBe(morningAt(15))`, no-millis spelling)
fails the moment it is wired over this store. Decide it: either core canonicalizes timestamps
at intake (my preference — one spelling everywhere, and the store's normalization becomes
invisible) or `Timestamp` equality is declared semantic and the tests compare instants. Either
way it is a statement about the domain type, not the driver, and belongs in core's docs.

---

## Test quality

### 11. The concurrency tests pass while the behaviour they name is broken

`pool-store.test.ts:172-197` — both transactions are submitted synchronously, so neither
`run()` call ever observes `inside === true`; the arrival-mid-flight pattern — the one a
daemon actually produces, and the one that fails (bug 1) — is untested. A variant that submits
the second transaction from a `setTimeout` while the first is awaiting would have caught it.
The nested-refusal test (`:199`) does test something real, but the same mechanism producing
both behaviours means the suite currently certifies a false positive.

### 12. The `created_at` tie-break in pagination is dead code as far as the suite knows

`pool-store.ts:209,213` — every pagination test uses distinct minutes, so the
`and(eq(createdAt), lt/gt(id))` terms could be deleted and all 28 tests still pass. Same-ms
captures are not an edge case here: same-ms is exactly what spec-shaped revisions produce
(finding 5), and a tie straddling a page boundary is the classic keyset bug. One test with two
items on the same millisecond, `limit: 1`, both orders, pins it. `head()`'s id tie-break is
equally unexercised.

### 13. Missing tests that the confirmed bugs would have failed

- An outside read during an open transaction (bug 3) — assert `pool.item()` returns
  `undefined` for a row a still-open transaction has inserted.
- A transaction submitted while another is executing (bug 1).
- `actions()` pagination is never driven through a cursor (`pool-store.test.ts:444-455` reads
  one page); the `oldest-first` keyset there is untested.
- The skipped core feed tests encode ADR 10's ascending default
  (`packages/core/src/pool/feed.test.ts:66,75` expect capture order from a default read) and
  will fail against the newest-first default when unskipped — the same PR that changed the
  default left the tests it owns contradicting it.

Otherwise the suite is honest work: the differing-precision test (`:342`) genuinely pins the
epoch-ms decision, the rollback test asserts on all three tables through a second raw
connection, the frozen/backwards clock tests pin monotonicity properly, and nothing tested is
tautological.

---

## Docs the code now contradicts

The PR defers these deliberately; the complete list, so nothing is missed:

- `docs/adr/0001-pool-is-a-database.md:45-47` — "Core submits one command per operation …
  and never holds a transaction handle. Core therefore cannot perform I/O inside a
  transaction, because it has no transaction to be inside." All three clauses false.
- `docs/adr/0001-pool-is-a-database.md:48-51` — "Commands carry preconditions, and the driver
  refuses a command whose precondition no longer holds… a refusal demotes it to a revision."
  `Precondition`/`PreconditionFailed` are deleted; the demotion is now core's read-and-decide.
- `docs/specs/core.md:317-322` — the storage-agnostic constraint repeats both: "all-or-nothing
  application of one command per domain operation, commands carrying preconditions".
- `docs/specs/core.md:344-345` — prior-decisions brief: "including one atomic command per
  domain operation".
- `docs/adr/0012-core-keeps-an-append-only-action-log.md:31-33` — decision driver: "every
  mutation already flows through one atomic command per operation… so a log entry can be
  written in the same command". Needs the finding-7 note besides the mechanical fix.
- `docs/adr/0010-feed-and-queue-sort-differently.md:19` — "Both ascending." Missing from the
  PR's own list (finding 9).
- `docs/specs/core.md:399-400` — acceptance criterion "appears at that position in the feed,
  not at the end" reads as oldest-first; under the newest-first default the three-day-old
  capture appears near the end, not "not at the end".
- New material owed, per the PR: the epoch-ms rule, the no-sources-table rule, `FeedOrder` as
  a read parameter, and ADR 1 recording that the transaction handle narrows storage-agnostic
  to stores that tolerate a long-open transaction.
- Pre-existing, not this PR's debt: `sync.md:52` says "**Core** must assign it monotonically"
  where ADR 1 assigns `modified_at` to the driver; worth aligning while in there.

---

## Minor

### 14. `// HMM... not sure` left in a shipped type

`packages/core/src/types/domain/item.ts:21` — a thinking-out-loud marker on
`ItemRecord.payload`. Whatever the doubt was, it should be a finding or a question on the PR,
not a comment that lands.

### 15. `IdGenerator.next<T extends string>(): T` lets any call site mint any brand

`packages/core/src/types/api/ports.ts:32-34` — the generator now claims to return whatever
brand the caller asks for; `next<ItemId>()` reads as type-safe while being exactly the cast
the brands exist to make visible. The old `next(): string` forced the cast to the call site
where a reviewer can see it. Convenience bought with the brand system's honesty.

### 16. Cursor namespace is shared across surfaces

`packages/adapters/store-sqlite/src/cursor.ts:16-19` — a feed oldest-first cursor and an
actions cursor both decode under tag `o`, so a cursor from one surface is silently accepted by
the other and filters on the wrong rows. The order check exists precisely to stop cursor
misuse; one more character in the tag (`fo`/`ao`) finishes the job.

### 17. Cursor and page-limit edge cases

`cursor.ts:34-37` — `Number("")` is `0`, so the malformed `n::x` decodes as `{at: 0}` instead
of being refused. `pool-store.ts:156-164` — `limit: 0` yields `hasMore` true with no `next`
cursor (silent dead end), and negative limits are unvalidated. All harmless today, all cheap.

### 18. Agent columns lack the null-consistency check

`schema.ts:60-64,119-122` — `by_kind = 'person'` with a stray `by_ref`, or `'provider'` with
`NULL`, are representable; `toAgent` (`mapping.ts:53-62`) then casts `null` into a
`ProviderName`. A `CHECK ((by_kind = 'person') = (by_ref IS NULL))` pins what the mapper
assumes.

---

## Non-issues

Checked and found fine, for coverage:

- **Keyset predicates** — both directions' `WHERE`/`ORDER BY` pairs are correct and mutually
  consistent; the limit+1 exhaustion probe and cursor emission have no off-by-one; a
  newest-first cursor refuses an oldest-first read and vice versa, tested.
- **`modified_at` monotonicity** — the `pool_meta` counter is strictly increasing
  (`max(now, last+1)`), updated inside the same transaction (a rollback discards it, so the
  counter cannot run ahead of committed state), persisted so a backwards clock cannot lower it,
  and assignment order equals commit order under the serialized queue. Satisfies ADR 1 and
  sync.md for this slice; `changesSince` remains unimplemented and is honestly deferred.
- **Epoch-ms timestamps** — the text-sort failure it prevents is real and the test proves it;
  sub-ms loss is stated. Right call.
- **`actions` without an FK to `items`** — matches ADR 12 and `core.md:137` exactly; purge
  cannot cascade into the log.
- **`jobs.subject` cascading** — defensible for a slice with no leases; revisit when a claimed
  job's item can be purged mid-lease.
- **No `sources` table, non-global source-item uniqueness** — both correctly reasoned.
- **ADR 8 direction** — the adapter imports core with `import type` only, depends on
  `@notemap/core` and not vice versa; no shared types package is the right non-decision.
- **Transaction queue chaining** — `tail.then(execute, execute)` runs the next transaction
  after a failure, and `tail = queued.catch(...)` prevents unhandled-rejection noise; the
  queue itself (bugs aside) neither starves nor reorders.
- **`insertItem` deriving references from `payload.assets`** — removes a way for count and
  payload to disagree; the read-back guaranteeing a fully-hydrated return is sound.
- **Two stores in one process share nothing** — tested, and `:memory:` per store makes it
  structural.
- **Migration vs schema** — `drizzle/0000_init.sql` matches `schema.ts` table for table,
  index for index.
- **`pnpm-workspace.yaml`** — `allowBuilds` for better-sqlite3 with the reason commented, and
  the `minimumReleaseAgeExclude` pin is visible rather than buried.
- **Typecheck and tests** — both packages typecheck; all 28 store tests pass; the 19 core
  tests are skipped with the reason stated at each `describe.skip`.
