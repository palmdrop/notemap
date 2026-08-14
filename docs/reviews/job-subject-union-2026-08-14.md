# Review: A job's subject names what kind of thing it is about

**Date**: 2026-08-14
**Status**: Resolved — addressed in `744d994`, together with two comments the developer
raised on the PR. The version pin, the overpromising comment on `AbandonedWork.item`, the
untested keyset columns and the unrecorded cost of the `subject_kind` CHECK all landed;
the PR description was amended for the `AbandonedPosition` reshape.
**Scope**: PR #9, `agent/routing-and-queue..agent/job-subject-union` — `cf032b2`
**Plan**: `docs/plans/job-subject-union.md`
**Spec**: `docs/specs/core.md`
**ADR**: `docs/adr/0018-a-jobs-subject-names-what-it-is-about.md`

---

## Overall

The refactor is sound and the central claim holds. I could not find a semantic shift anywhere in
the diff, and the two things that could have lost something silently — migration 7's data carry-over
and the re-keyed coalescing index — check out under execution rather than under reading.

I ran migrations 0–6 against `node:sqlite` directly, seeded six job rows covering every shape that
exists (pending mirror, pending mirror-remove on the same item, a *leased* mirror carrying
`lease_id`, `lease_expires_at`, `last_failure_code` and `last_failure_detail`, an *abandoned* mirror
carrying `abandoned_at`, and two enrichment rows one of which is leased), then applied migration 7.
Six rows in, six rows out; all thirteen columns identical; `subject` → `('item', subject)` in every
case; column types, `NOT NULL` flags, defaults and PK unchanged apart from the split. Repeated under
the conditions `createSqlitePoolStore` actually uses — `PRAGMA foreign_keys = ON`, inside
`BEGIN IMMEDIATE … COMMIT` — with `PRAGMA foreign_key_check` clean afterwards. All five indexes are
recreated, and none of them is one column too wide:

| attempted insert against the migrated table | result |
| --- | --- |
| second **pending** mirror, same item | rejected — `UNIQUE constraint failed: jobs.subject_kind, jobs.subject_id, jobs.kind` |
| second **pending** mirror-remove, same item | rejected |
| pending mirror, different item | accepted |
| **leased** duplicate mirror, same item | accepted |
| **abandoned** duplicate mirror, same item | accepted |
| duplicate pending enrichment, same item and name | accepted |
| `subject_kind = 'routing-record'` | rejected by CHECK |

That is exactly what `(subject, kind)` asserted. Neither narrowed nor widened.

`migrations.test.ts` proves this rather than appearing to, on three axes: the raw-SQL `rival` insert
catches an index widened with `id`, the `item-2` insert catches narrowing to
`(subject_kind, kind)`, and — undocumented but load-bearing — the fixture gives `item-1` both a
pending `mirror` and a pending `mirror-remove`, so an index that dropped `kind` would fail at
`CREATE UNIQUE INDEX` *during the migration* and take the first test down with it. The fixture is
better than its comments claim.

`pnpm typecheck`, `pnpm test` (**380 passed**: 10 core + 24 mirror-fs + 11 schema-ajv + 17 blob-fs
+ 100 store-sqlite + 75 integration + 143 daemon) and `pnpm lint` reproduce clean from a detached
worktree at `cf032b2`; `pnpm format:check` fails on exactly the three pre-existing files the PR
names, none touched by this branch. Every number in the PR's "Verified" section is accurate.

Docs and code agree. Plan is Done, `core.md` carries a dated 2026-08-14 `Shipped:` entry, the spec's
prose at the abandoned surface and the job-subject sections already described this shape, and
`core.md`'s "whether a unit of work is ever about something other than an item" open question is
checked off. The `Shipped:` trail is complete.

Nothing here blocks merge. Finding 1 is the one worth acting on, and it has already been fixed on a
later branch rather than here.

---

## Bugs

None.

---

## Design

### 1. The migration fixture targets "the second-to-last migration", not version 6

`packages/adapters/store-sqlite/src/migrations.test.ts:36`

```ts
const version = MIGRATIONS.length - 1;
```

The whole file exists to prove migration 7 preserves a version-6 pool. Counting back from the end
means the target moves the moment migration 8 lands: the fixture would build a pool that already has
`subject_kind`/`subject_id`, and the `INSERT INTO jobs (… subject …)` would throw at prepare. It
breaks loudly rather than silently retargeting, which is the saving grace — but it stops testing
migration 7, and the obvious repair under time pressure is to point it at the new end rather than
pin it.

This is already fixed downstream, in `15a42e6` on `agent/destination-fs`, as
`const BEFORE_SUBJECT_SPLIT = 6` with a comment giving exactly this reason. That is the right call.

Fix: back-port the pin so the PR stands on its own, or note in the PR that the following plan
corrects it.

### 2. `CHECK (subject_kind IN ('item'))` costs a full table rebuild per variant, unrecorded

`packages/adapters/store-sqlite/src/migrations.ts:262`

SQLite cannot widen a CHECK, so naming a single value in the one column whose stated purpose is
"more variants are coming" guarantees another `jobs` recreate for variant two. Migration 8 on the
stacked branch does precisely that (`migrations.ts:346-347`, plus a fresh copy of all five indexes).

This is consistent with the house pattern — the `kind` CHECK behaves identically and has already
been rebuilt once for `delivery` — and the plan asked for the CHECK explicitly, so it is a cost
accepted rather than a mistake. But neither the plan's Unknowns nor ADR 18's consequences mention
that the next variant costs a table rebuild, and the Unknowns section is where that belongs: it is
the second half of the "will SQLite re-create the `jobs` table again" question, which was answered
only for this migration.

Fix: one line in the plan's Unknowns, or in ADR 18's consequences, saying variant two rebuilds the
table.

---

## Minor

### 3. `AbandonedWork.item`'s comment claims a resolution the code does not perform

`packages/core/src/types/domain/work.ts:83`

> The capture the work concerns, resolved by the store so the surface stays one read.

Today `item` is literally `subject.item` — `toAbandonedWork` in `jobs.ts` sets both from the same
`toJobSubject(row)`. Nothing is resolved. AGENTS.md: "A comment that claims a guarantee must be one
the code actually enforces." It is a promise about a later PR, written in the present tense. It is
true downstream, and `core.md` makes the same promise, so this is small — but as of this commit it
describes code that does not exist.

Fix: say what it is for rather than what the store does — the field exists so the surface's shape
does not change when the subject stops always being an item.

### 4. The abandoned keyset's new columns are never compared by a test

`tests/integration/src/work.test.ts:213`, against
`packages/adapters/store-sqlite/src/jobs.ts:296-306`

`ABANDONED_KEY` widens from four elements to five, and `subjectColumns` binds two of them. But
"pages the surface from the position it handed back" gives every row a distinct `abandonedAt`, so
the tuple comparison is decided on its first element every time and positions 2 and 3 are never
reached. Exposure is low — `subjectColumns` is shared with the INSERT, where a swapped order would
violate the `subject_kind` CHECK immediately, so the helper's order is pinned by another path — but
the keyset's bind order has no test of its own.

Fix: abandon two jobs at the same millisecond (the clock is settable) and page across the tie.

### 5. "A pure refactor with no behaviour change" glosses one reshaped port type

PR #9 description.

`AbandonedPosition.item` becomes `AbandonedPosition.subject`
(`packages/core/src/types/domain/position.ts:17`) — a pagination position changing shape. It is
harmless *only* because nothing in `apps/daemon` serves the abandoned surface, so no cursor encodes
it. Worth a sentence: had anything been serialising that position, this would be a wire break
inside a "pure refactor".

### 6. `migrations.ts:287`'s index comment is addressed to a reviewer, not a reader

> Still at most one *pending* mirror job per item: the pair names the same one thing the single
> column did, so the rule neither narrows nor widens.

"Neither narrows nor widens" is a claim about the diff, meaningful only to someone holding
migration 5 in mind. The first sentence earns its place; the second belongs in the PR body, where it
already is. Nothing is lost by cutting it — the *why* for the `lease_id IS NULL AND
abandoned_at IS NULL` predicate lives on `PENDING_MIRROR` in `jobs.ts:41-46`, which is where the
code that depends on it can be read.

---

## Non-issues

- **The one-variant union.** Deliberate, argued in ADR 18 and the plan, and worth it — but for the
  reason the plan gives (the schema splits while a rebuild is cheap, and a mirroring regression
  stays attributable), not for type pressure. With one variant `subject.item` compiles everywhere
  and TypeScript discriminates nothing; every construction site is `{ kind: "item", item: x }` and
  every read site is `.item`. Nothing is forced until variant two, at which point it does break all
  of them, as the stacked branch shows.
- **`AbandonedWork` carrying both `subject` and `item`.** In this diff alone it is the same id
  twice. The plan states this outright and `core.md` promises the field, so it is disclosed
  ceremony, not accidental ceremony.
- **`migrations.test.ts` re-rolling temp-dir and cleanup bookkeeping** rather than using
  `testing/fixture.ts`'s `store()`. `store()` opens and migrates immediately, so it cannot build a
  pool at an older schema version. The duplication is forced.
- **`1c835af` does not typecheck in isolation.** Disclosed in the PR and the lesson recorded in the
  plan. It leaves a commit `git bisect` over a build step would trip on; squash-merging makes it
  moot, and nothing in `AGENTS.md` requires per-commit green.
- **`ON CONFLICT (subject_kind, subject_id, kind)` matching the partial index.** If the target did
  not match an index exactly, `write.query` would throw at prepare time when `jobQueue()` is
  constructed — which every store test exercises. It cannot be silently wrong.
- **`ABANDONED_ORDER` splitting `subject ASC` into two columns.** `subject_kind` is constant
  `'item'`, so the lexicographic order is identical. When `routing-record` arrives, item-subject
  work will sort before routing-record work within one `abandoned_at` millisecond; that is a new
  fact, not a changed one.
- **`toJobSubject`'s unchecked `row.subject_id as ItemId`.** `JobRow.subject_kind` is the literal
  `"item"` and the DB CHECK enforces it, so the cast is as sound as the rest of `mapping.ts`. It
  stops compiling when the row type widens, which is the right failure.
- **Dropping and renaming `jobs` under `PRAGMA foreign_keys = ON`.** No table references `jobs`;
  verified by grep and by a clean `foreign_key_check` after the migration.

---

## Resolution

<!--
Add once findings are addressed, and flip **Status** above. One numbered entry per finding,
mirroring its number. Mark each: Fixed / Mitigated / Won't fix (reason).
-->
