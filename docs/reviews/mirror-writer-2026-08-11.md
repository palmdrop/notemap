# Review: The mirror writer, first slice

**Date**: 2026-08-11
**Status**: Resolved
**Scope**: `agent/mirror-writer-first-slice` against `main`, excluding the `pnpm dev` /
`daemon-doctor` commit (`a91a237`)
**Plan**: `docs/plans/mirror-writer-first-slice.md`
**Spec**: `docs/specs/mirror.md`, `docs/specs/core.md`

---

## Overall

The slice does what it set out to do. The record, its canonical form and its parse are the
strongest part — the round-trip property is real, canonicalisation happens in the projection
rather than at the byte layer, and the driver is genuinely thin over it. Docs and code agree
throughout; the `Shipped:` trail is complete (plan is Done, `core.md` and `mirror.md` both carry
dated 2026-08-11 entries). `pnpm typecheck`, `pnpm lint` and `pnpm test` are green.

The problem is the coalescing index. Its predicate is `lease_id IS NULL`, which it treats as
meaning "pending", and two states break that reading: a job resolved from a lease, and a job
abandoned. Findings 1 and 2 are both that one root cause, and both land exactly on the race the
rule exists for — a mutation arriving during a leased write. Finding 1 is reproducible in four
lines and turns "the folder went offline while you edited a note" into a rejected transaction and
a stuck job. Finding 3 is unrelated and latent (nothing enqueues `mirror-remove` yet) but deletes
other items' files when it does fire.

---

## Bugs

### 1. Resolving a mirror job that has a rival violates the coalescing index

`packages/adapters/store-sqlite/src/jobs.ts:236` — `resolveJob` clears `lease_id` for both `retry`
and `abandoned`. When a mutation enqueued a second job during the lease — which the rules
deliberately allow — clearing it leaves the item with two unleased mirror rows and
`jobs_one_unleased_mirror` rejects the UPDATE.

```
capture → job-1 enqueued
claim job-1 (leased)
mutation during the lease → job-2 inserted (correct, by design)
write fails retryably (folder offline)
work.complete → tx.resolveJob(retry) → UNIQUE constraint failed: jobs.subject, jobs.kind
→ transaction rolls back: no attempt recorded, no action logged, no backoff set,
  job-1 still leased until its lease expires, then reclaimed and failed identically
```

Reproduced directly against the store; `releaseLease` already handles this case with its `rival`
query (`jobs.ts:89`, `jobs.ts:195`) and `resolveJob` does not. The runner's whole drain rejects
into `onError`, so the rest of that batch is skipped too.

The integration test for this race (`tests/integration/src/mirror.test.ts:217`) completes the
lease as `succeeded`, and `finishJob` deletes the row rather than clearing the lease — which is
why the failure path escaped.

Fix: give `resolveJob` the same rival rule as `releaseLease` — on `retry`, delete the job when a
newer unleased one exists for that item, since that job writes state read fresh; on `abandoned`,
see finding 2 first, because the two answers have to agree.

### 2. An abandoned mirror job silently swallows every later mirror debt for that item

`packages/adapters/store-sqlite/src/migrations.ts:146` and `jobs.ts:57` — an abandoned job keeps
`lease_id IS NULL`, so it stays in the partial unique index and holds the item's only slot.
`enqueue`'s `ON CONFLICT … DO NOTHING` then discards every subsequent mirror job for that item.

```
renderer throws → non-retryable → job abandoned (row stays, unleased)
later mutation → enqueue → ON CONFLICT DO NOTHING → nothing recorded
→ the item is never mirrored again, and nothing says a write is owed
```

Reproduced: after abandonment, a second `enqueue` for the same item leaves one row and nothing
claimable. This contradicts `mirror.md`'s "a mutation committed with nothing recording that debt
would never be written and nothing would notice", and it defeats the repair path the same spec
promises ("Repair re-enqueues it") — repair's enqueue is swallowed identically. The
abandoned-work surface still shows the item, so it is not invisible, but it reports the original
failure and nothing about the writes accumulating behind it.

Fix: narrow the index predicate to `lease_id IS NULL AND abandoned_at IS NULL`, so abandonment
frees the slot and a later mutation (or repair) enqueues a fresh job. That also removes the
`abandoned` half of finding 1.

### 3. `remove` deletes any item whose id ends with the removed id

`packages/adapters/mirror-fs/src/paths.ts:46` and `writer.ts:98` — the removal walk matches on
`endsWith(`${suffix}.json`)` where the suffix is `-<sanitised id>`. An item id that is a
`-`-suffix of another id matches both.

```
items "b" and "a-b" written
remove("b") → matches T142305-text-b.json AND T142305-text-a-b.json
→ all four files deleted
```

Reproduced against the real driver: removing `b` left zero files instead of two. Capture ids are
client-minted (`capture.ts:90` takes `envelope.id`), so this is reachable input, not a
hypothetical. Latent today only because nothing enqueues `mirror-remove` yet — and it is purge,
the one destructive operation, that will.

Fix: match the stem exactly rather than by suffix. The stem's shape is known —
`T<HHMMSS>-<type>-<id>` — so a regex anchored on `-<id>\.(json|md)$` with the id preceded by the
type separator is still ambiguous; the honest fix is to parse the stem into its three parts and
compare the id part, or to read the `.json` and compare `item.id`.

---

## Design

### 4. `MirrorReader` no longer matches what the mirror is

`packages/core/src/types/api/ports.ts:101` — the interface is unchanged from before ADR 15:
`items()` yielding `Item`, plus per-item `artifacts()` and `routingRecords()`. The mirror is now
one record file per item carrying all three, and an `Item` is not what a record holds (no
`supersededBy`, and `modifiedAt` sits outside `item`). It also cannot express what `mirror.md`'s
Constraints require of a reader — "reports rather than skips": there is no way to return a file
that failed to parse, an orphan, or a leftover temporary file, and a reader that dropped them
would let verify call a mirror healthy that cannot rebuild.

The plan resolved "keep `MirrorReader`" and fixed the signatures that *took* one, but not the
reader itself. It is unimplemented, so this costs nothing today; it will be re-decided in the
verify/rebuild slice, and pinning it now would just be a second guess.

### 5. A missing asset makes an item permanently unmirrorable, quietly

`packages/core/src/pool/mirror.ts:36` throws a plain `Error` when the asset store does not have a
referenced asset. `asWorkOutcome` (`failure.ts:40`) classifies anything it does not recognise as
retryable, so that item's write retries forever at the backoff cap, never reaches the
abandoned-work surface, and leaves only a growing action log. Rebuild takes the opposite stance
for the same fact — `mirror.md`: "a missing or drifted blob is reported, never fatal" — and it is
the writer, not the rebuild, that could still do something about it.

Not reachable yet (no asset store, no asset endpoints), and the "unknown is retryable" default is
deliberate and right. What is missing is that this particular case is *known*: it deserves a
`MirrorWriteFailure` with its own code, so the decision to retry or abandon is made where the
fact is, not by the fallback.

---

## Minor

### 6. `drain()` can hand back a drain that started before the caller's work

`apps/daemon/src/mirror/runner.ts:88` — `inFlight ??= runOnce()` means a caller awaiting `drain()`
while a tick is running gets that tick's promise, which may have claimed before their capture
committed. Harmless for the daemon's timer, and the fixtures drive it serially so tests are
unaffected; it would bite anything that reads `drain()` as "everything owed right now is written".

### 7. The default rendering can break its own fence

`packages/adapters/mirror-fs/src/renderers.ts:26` — content containing ` ``` ` ends the JSON block
early. Nothing parses the file, so this costs a human reader a garbled block and nothing else.

### 8. The mutation-during-flight race is only tested on the success path

`tests/integration/src/mirror.test.ts:217` — the one test standing in for the race completes the
lease as `succeeded`, which takes a different store path (delete-by-lease) from the one finding 1
breaks. The failure-plus-rival combination is the case worth pinning once fixed.

---

## Non-issues

- **Integer-like keys sort ahead of everything in the canonical JSON** — `Object.fromEntries`
  re-orders array-index keys numerically regardless of insertion, so the output is not strictly
  lexicographic. It is still one order per state, which is all canonicalisation needs, and the
  byte-for-byte property test covers generated keys.
- **`leasedJob` and `extendLease` accept an expired lease** — deliberate and documented: a lease
  ends by being taken from you, not by the clock passing.
- **`artifacts` and `routingRecords` answering empty in the store** — neither has a table, so
  empty is what an item genuinely has; a throw would be a lie the mirror asks for on every write.
- **`work.complete` throwing on an `enriched` outcome** — enrichment output is a later slice, and
  it is named rather than silently absent.
- **A text note's content living in both files** — accepted in ADR 15.
- **Sub-millisecond timestamps truncated by `instant()`** — the store already stores epoch
  milliseconds, so the mirror matches the pool rather than losing against it.
- **`MirrorWriteFailure` and `asWorkOutcome` living in core** — a host has to map a driver's
  failure to an outcome without knowing which driver it wired; the plan states this.

---

## Resolution

Addressed 2026-08-11, alongside the PR review on
[#5](https://github.com/palmdrop/notemap/pull/5).

1. **Fixed.** `resolveJob` takes the same rival rule as `releaseLease`: a `retry` whose item
   already has a pending job is deleted rather than put back, since that job writes state read
   fresh. `abandoned` needs no rule once finding 2 is fixed — an abandoned job is no longer in the
   index. Pinned by `jobs.test.ts`, which reproduces the original
   `UNIQUE constraint failed: jobs.subject, jobs.kind` when the guard is removed.
2. **Fixed.** The index predicate narrows to `lease_id IS NULL AND abandoned_at IS NULL`, and
   `PENDING_MIRROR` matches it. Edited into migration 2 rather than added as a fourth: nothing
   real exists on this schema, so the file states the index once instead of recording how it got
   there. It is `jobs_one_pending_mirror` now — the old name asserted the predicate it had. A
   consequence
   the finding did not name: an abandoned row would then linger on the abandoned-work surface
   reporting a failure a later write had already settled, so `resolveJob(done)` clears its item's
   abandoned mirror rows.
3. **Fixed.** Removal walks the tree and matches the id **inside** each record rather than the
   filename, which cannot be turned back into an id. A record that will not parse is left where it
   is — nothing can say whose it is. Also fixed alongside, and not in the review: `SAFE` admitted
   `A-Z` verbatim, so `abc` and `ABC` were two items and one file on any case-folding filesystem.
   Filenames now fold case, with the digest keeping the two apart.
4. **Fixed**, rather than deferred as the finding suggested. `MirrorReader` is
   `entries(): AsyncIterable<MirrorEntry>` — a record, a file that would not parse, or a stray.
   That is not a guess about the verify slice: `mirror.md`'s Constraints already name those three
   cases, and the old shape could express none of them. Deleting the type outright was not
   available either, since the same spec settles that verify and repair take a reader.
   A record entry names the rendering beside it, absent where there is none — without that, the
   rule stated alongside this fix (a record without its rendering is expected, and reported) would
   describe a finding no reader could produce.
5. **Fixed.** A missing asset throws `MirrorWriteFailure("asset-missing", …, retryable: false)`
   instead of falling through the "unknown is retryable" default.
6. **Fixed.** A caller arriving mid-tick now waits for that tick *and then a fresh one*, so
   `drain()` means "everything owed when I asked is written". The timer still joins a running
   drain rather than queueing behind it.
7. **Fixed.** The default rendering fences with a run one backtick longer than the longest one in
   the content.
8. **Fixed.** `tests/integration/src/mirror.test.ts` pins the failure-plus-rival combination.

### From the PR review, not this document

- **Comment density.** A pass over the whole slice, −180 lines: rejected alternatives,
  restatements and rationale that belongs here or in the specs. The one comment asked for — an
  example path in `paths.ts` — was added.
- **`FIXED_KEYS` drifting from the schema.** The mapping is now
  `satisfies Record<keyof ItemRecord, string | null>`, so adding *or* removing a domain field
  fails to compile. It stays a mapping rather than a derivation: the key names are an interop
  contract and must survive a rename on the domain side.
- **Hand-rolled YAML.** Replaced with `yaml`. The emitted frontmatter is byte-identical, which
  the existing assertions prove.
- **A record written without its rendering.** Real, and now stated in `mirror.md` as a state the
  mirror is expected to be in, rather than asserted only in a code comment.
- **Partial removal.** Converges on retry, does not if abandoned; the ordering is now
  rendering-then-record, so an interrupted removal leaves a record whose pair is incomplete rather
  than a rendering that outlives its record.
- **`WorkQueue`.** The queue's dispatch half is its own port. See `core.md`.
- **Transaction naming.** `serializeTransactions` → `writeLock`, `.run` → `.transact`.
