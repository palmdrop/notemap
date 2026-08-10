# Mirror writer — first slice

**Date**: 2026-08-11
**Status**: Todo
**Spec**: `docs/specs/mirror.md`, `docs/specs/core.md`
**Closed**:

---

## Goal

Capturing into a pool leaves a correct, complete mirror record and a readable rendering on disk,
written asynchronously through claimed jobs — and every place where the code currently
contradicts the specs is fixed on the way.

**Out of this slice, deliberately**: rebuild, verify and repair. `maintenance.*` stays
unimplemented. The record's parse lands anyway (phase 4) because the round-trip property test is
the mechanism ADR 1 relies on to stop the mirror rotting unnoticed, and a codec tested in only one
direction is not tested.

Also out: purge and the mirror-removal job's *producer*. `items.purge` does not exist. The schema
and the job kind land here because they are cheap now and a migration later; nothing enqueues one
until purge is built.

---

## Tasks

### Phase 0 — Branch

- [ ] `git checkout -b agent/mirror-writer-first-slice`

### Phase 1 — Make the types agree with the specs *(no behaviour; blocks everything)*

Pure type and wiring changes, each one a place the code presently contradicts a spec. Nothing
here should change what any existing test asserts.

- [ ] `PoolPorts`: drop `mirrorReader` entirely, and make `mirrorWriter` optional. A pool wired
      for capture must hold nothing that can read the mirror (`mirror.md`, rebuild), and a pool
      may be wired without a writer (`mirror.md`, disabling)
- [ ] `MirrorWriter.write` takes the resolved assets the record needs — id, filename, media type,
      size, blob hash — since `AssetRef` carries none of them and the asset store owns them.
      Empty for every payload type that exists today
- [ ] `JobKind` gains `mirror-remove`. Document on `Job` that a subject may name an item that has
      been purged
- [ ] `WorkOutcome`: the success variant is enrichment-shaped (artifacts and suggestions). Give
      mirror work a success that carries nothing, rather than making it report two empty arrays
- [ ] Move `abandoned` from `EnrichmentApi` to `WorkApi`; `AbandonedPosition` gains `kind`, per
      ADR 14's 2026-08-11 amendment
- [ ] `apps/daemon/src/ports.ts`: delete `noMirrorReader` and `noMirrorWriter`; the daemon wires
      no mirror writer until phase 6, which is now a legal state rather than a stub that throws
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint` — green, with no test assertions changed
- [ ] `git commit`

### Phase 2 — Jobs that can be claimed *(store; depends on phase 1)*

`claim`, `extendLease` and `releaseLease` are `unimplemented` in the driver and the `jobs` table
has no lease or retry columns. The mirror cannot run before this exists.

- [ ] New migration — never edit migration 0. SQLite cannot drop a foreign key in place, so this
      recreates `jobs`: no FK on `subject`, `kind` CHECK widened to include `mirror-remove`, plus
      lease columns (lease id, expiry) and retry columns (attempts, next attempt at, abandoned at,
      last failure code and detail)
- [ ] Coalescing as a **partial unique index**: at most one *unleased* mirror job per subject.
      `enqueue` becomes a no-op on that conflict rather than an error, which is exactly the
      coalescing rule — a mutation arriving while a job is leased inserts, because the index does
      not cover leased rows
- [ ] `claim`: by kind, oldest `enqueued_at` first, skipping jobs whose next attempt is in the
      future, whose lease has not expired, or which are abandoned. **A mirror job is claimable
      only when its subject has no leased mirror job**, so at most one write per item is in flight
- [ ] `extendLease`, `releaseLease`
- [ ] Tests: coalescing collapses N enqueues into one job; a mutation during a lease enqueues a
      second; two concurrent claims of one item's mirror work yield one lease; an expired lease is
      reclaimable with no reaper having run; `schema.test.ts` still agrees with `rows.ts`
- [ ] `git commit`

### Phase 3 — Core drives the work *(depends on phase 2)*

- [ ] `work.claim`, `work.extend`, `work.release` — thin passes onto the store
- [ ] `work.complete(lease, outcome)`: success removes the job; a **retryable** failure bumps
      attempts and schedules the next attempt with capped backoff from the configured
      `RetryPolicy`; a **non-retryable** failure abandons immediately
- [ ] Mirror work ignores `maxAttempts` on retryable failures and retries indefinitely at the
      backoff cap, per `core.md`'s 2026-08-11 addition. Enrichment keeps the bounded rule; the
      difference is by job kind
- [ ] Every attempt appends an action carrying what went wrong
- [ ] `work.abandoned(page)`: one list of abandoned work of any kind, ordered by `abandonedAt`,
      positioned by `{ at, item, kind, enrichment? }`
- [ ] Tests: a retryable failure is still claimable after its backoff and was never abandoned; a
      non-retryable one is abandoned on attempt 1 and appears on `work.abandoned`; completing
      under a stale lease is refused `lease-lost`
- [ ] `git commit`

### Phase 4 — The mirror record *(core; independent of phases 2–3)*

Core owns the record, its canonical serialisation and its parse (ADR 15).

- [ ] `MirrorRecord` and a projection from an item plus its assets, artifacts and routing records
- [ ] Canonical serialisation: stable key order, and **one spelling per instant** — without it the
      byte comparison deep verify will perform reports drift forever
- [ ] Parse, and the round-trip property test: pool state → record → state, over generated inputs
- [ ] Tests: round trip; a record whose timestamps arrive in a different but equivalent spelling
      serialises identically; the fields `mirror.md` says are *not* carried are absent
- [ ] `git commit`

### Phase 5 — The local filesystem driver *(depends on phases 1 and 4)*

New package `packages/adapters/mirror-fs`, following the conventions `store-sqlite` set.

- [ ] Path derivation: `pool-mirror/YYYY/MM/DD/<HHMMSS>-<payload-type>-<item-id>.{json,md}`, UTC
      from the capture time, computable from the item alone — assert that in a test, since the
      whole naming scheme rests on it
- [ ] Atomic write: temp file in the target directory, flush, rename. **Record written and
      flushed before the rendering is attempted**
- [ ] Renderer registry, wired per payload type at construction; a fixed frontmatter block emitted
      by the driver from the record, never by the renderer; default rendering — frontmatter plus a
      fenced JSON block — for an unwired type; a renderer that throws propagates as a
      non-retryable failure
- [ ] `remove` for a mirror-removal job: deletes both files, tolerating either being gone already
- [ ] Tests: the pair lands; a rewrite replaces in place; an interrupted write leaves the previous
      pair intact; an unwired payload type still produces a readable file with provenance
      frontmatter; a throwing renderer leaves the record durable
- [ ] `git commit`

### Phase 6 — Daemon wiring and the runner *(depends on phases 3 and 5)*

- [ ] Config: the mirror root, and its absence meaning no mirror writer is wired
- [ ] A `text` renderer for the one payload type that exists
- [ ] A loop that claims mirror jobs, calls the writer, and reports the outcome — the host drives
      *when*, core owns the state (ADR 2). Shut it down with the pool
- [ ] Daemon README: how the mirror is configured, and that the pool is no longer the only copy
- [ ] Tests: capture through HTTP, drain the queue, assert the files; a capture with the mirror
      unconfigured still succeeds and enqueues nothing
- [ ] `git commit`

### Phase 7 — End to end *(depends on phase 6)*

- [ ] Integration tests in `tests/integration/`: capture → job → files on disk matching the pool;
      an unwritable mirror root retries and recovers when it becomes writable, without having been
      abandoned; a mutation arriving during a leased write is written by a later job rather than
      lost. That last one is the race the coalescing rule exists for and the only one that loses
      material silently if it is wrong
- [ ] `git commit`

---

## Unknowns and pending decisions

Consult the developer before resolving the first three — AGENTS.md puts library and layout choices
with them.

- **A property-testing library.** Phase 4's round trip wants generated inputs and the repo has
  only vitest. `fast-check` is the obvious candidate. *Fallback if it is not wanted*: hand-rolled
  generators in vitest, which costs coverage rather than correctness.
- **The pool directory layout contradicts itself today.** `mirror.md` and ADR 1 lay out
  `notemap/{state/notemap.db, pool-mirror/, assets/}` as siblings, but the daemon defaults its
  pool to `~/.local/share/notemap/pool.db`. Either the default moves under `state/`, or the layout
  drops `state/`. This is a decision, not a bug to pick a side on. *Fallback*: mirror root
  configured independently of the pool path, which works and leaves the backup unit unstated.
- **Does `MirrorReader` survive phase 1?** It has no consumer once it leaves `PoolPorts`, and
  rebuild is out of this slice. Deleting it and reintroducing it with rebuild keeps dead types out;
  keeping it records the shape while it is fresh. *Fallback*: keep it, unreferenced.
- **Directory fsync after rename.** Renaming atomically swaps the entry, but the *directory* entry
  itself is not durable until the directory is synced on most filesystems. *Fallback*: sync the
  directory too — one extra syscall per write, and it removes a class of "the file vanished after
  a power cut" that is miserable to diagnose.
- **Runner cadence.** A poll interval is the simple thing; a kick after each capture is more
  responsive and needs a signal from the host's own request path. *Fallback*: poll on an interval
  from config, which is testable and boring.
- **Does `mirror-remove` land with no producer?** Included above on the grounds that the schema
  is cheap now and a migration later. *Fallback*: leave the CHECK narrow and widen it with purge.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The three properties worth testing hardest, because each fails silently:

- **Round trip** — a record that loses a field loses it forever and nothing notices until a
  rebuild that may be years away.
- **Coalescing across a lease** — a mutation absorbed into an in-flight write is material lost
  with nothing recording the loss.
- **Record durable before rendering** — the ordering is the only thing keeping a renderer bug from
  costing material.

Adapter tests live with their package; cross-package behaviour goes in `tests/integration/`.

---

## Notes

Every mutation that changes mirrored material must enqueue a mirror job. Only `capture` exists
today, so this slice wires exactly one producer — but the rule belongs to each mutation as it is
built, not to a sweep afterwards, and `edit`, `tag`, `archive`, `route` and `correct` each own it
when they land.

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what
was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`.
**Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what
landed and linking back to this plan. No implementation details, no granular tasks. A plan marked
Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
