# Review: The pool identity, and `GET /v1/health`

**Date**: 2026-08-25
**Status**: Resolved
**Scope**: PR #24 — `agent/pool-identity-and-health` vs `main`
**Plan**: `docs/plans/client-minted-assets-and-health.md` (phase 2, and the health half of phase 3)
**Spec**: `docs/specs/http-v1.md`, `docs/specs/mirror.md`, `docs/specs/core.md`

---

## Overall

The slice does what the plan set out: new state, one route, no caller. Minting on first read
rather than in the migration is the right call and the reason it needs no data migration; the
identity is cached at open, so the route is a field read and cannot half-fail. `pnpm -r --silent
test`, `pnpm -r typecheck`, `pnpm lint` and `pnpm test:stack` are all green here.

No bugs. Two design points: the driver mints this id by a second path when it already has an
injected one for exactly this category, and `core.md` — the domain spec — says nothing about the
read that landed on `Pool`.

---

## Bugs

None.

---

## Design

### 1. The identity is minted off `node:crypto`, past the generator the store already takes

`packages/adapters/store-sqlite/src/identity.ts:1,21` — `poolIdentity` calls `randomUUID()`
directly. But `pool-store.ts:84` already declares `ids?: IdGenerator`, commented "Mints lease
ids, which are the store's own. Defaults to random UUIDs", and `pool-store.ts:310` threads it
into the job queue with `config.ids ?? randomIds`. A pool identity is the same category as a
lease id — a store-owned id, minted by the driver — and now there are two ways to mint one, only
one of which a test or a host can substitute.

The PR argues the exclusion in `ids.ts:29`: a pool identity is not `MintableId` because it "comes
from somewhere ... and minting one would fabricate a fact". That reasoning is about *core* not
minting one, and it does not separate the identity from `LeaseId`, which is in `MintableId` and
is equally the store's own. As written the list excludes a value on a rule its own members break.

Consequence, concretely: `identity.test.ts` can only assert "not empty" and "two differ", never a
pinned value, and a host that wanted deterministic identities (a fixture, a seeded pool) has no
seam. Fix: mint through `config.ids ?? randomIds` and widen `MintableId` to include
`PoolIdentity`, or state in `ids.ts` why a lease id is mintable and a pool identity is not.

### 2. `core.md` does not mention the read that landed on `Pool`

`packages/core/src/types/api/pool.ts:243` adds `identity()` to `Pool`, and
`packages/core/src/types/domain/ids.ts:27` adds `PoolIdentity` to the domain ids —
`docs/specs/core.md` has neither a `Shipped:` entry nor a line saying a pool answers which pool it
is. It carries the consequence already ("**A rebuilt pool mints a new identity**", line 774) but
never the fact that the identity is a thing a caller can read.

`http-v1.md` and `mirror.md` both got entries, so this is a gap rather than a policy. Nor does
anything left in the plan close it: phase 4's `core.md` bullet is "the asset id is the caller's",
a different subject, and its `Shipped:` line is owed for the asset half. Fix: a line in `core.md`
where the pool's reads are described, and a dated entry, in this PR.

---

## Minor

### 3. The example identity is a UUIDv7 for a value the spec says carries no age

`apps/daemon/src/schemas/health.ts:9` and `docs/specs/http-v1.md:249` both show
`0198f0c2-0000-7000-8000-000000000000` — version nibble `7`, so a reader who knows UUIDv7 reads a
timestamp out of it. Two lines below, the spec says the identity says "not its age". The code
mints v4. The v7-shaped example matches `schemas/routing.ts:45`, so this is house style rather
than drift, but it is house style working against the one property this field is specified to
have. A v4-shaped example costs nothing.

### 4. The "predates the table" case would pass without testing that

`packages/adapters/store-sqlite/src/identity.test.ts:70-87` applies `MIGRATIONS.slice(0, 14)`,
reopens, and expects an identity. Nothing asserts `pool_identity` was absent before the reopen —
if `BEFORE_POOL_IDENTITY` ever pointed past the migration that creates the table, the test would
go on passing while testing an ordinary open. The constant is right today and the append-only
rule in `migrations.ts:4` keeps it right, which is why this is minor rather than a bug. One
`SELECT name FROM sqlite_master` before `reopened(file)` makes the case say what it claims.

---

## Non-issues

- **Health cannot report an unhealthy pool** — the identity is read once at open and cached, so
  the route is a field read that answers `200` whatever the store is doing. That is `http-v1.md`'s
  stated position: liveness is the `200` itself.
- **A write on every open** — `INSERT OR IGNORE` runs each time a pool is opened, not only the
  first. It is the same statement that makes the mint idempotent, and nothing opens a pool file
  read-only.
- **The concurrency claim in `identity.ts:13`** holds: `busy_timeout` and WAL are set before
  `poolIdentity` runs (`pool-store.ts:196-198`), so a second process waits and its insert is a
  no-op.
- **The unreachable `row === undefined` throw** — `.get()` is typed `unknown`, so the guard is
  what earns the cast rather than a claim the row can vanish.
- **`{ "pool": ... }` rather than `poolIdentity`** — reads as "which pool", and does not collide
  with `CONTEXT.md`'s avoid-list.
- **No client method** — the plan defers what a client does with an identity to
  `durable-offline-client`, and the full-stack test reads over `fetch` for that reason.
- **`healthRoute` first in `ROUTES`** — puts `/v1/health` first in `openapi.json`, matching the
  order `http-v1.md` puts its sections in.

---

## From the co-review

palmdrop's review, reconciled with the above. Neither was in mine.

### 5. Phase 4's bullets read as half-done while staying unchecked

`docs/plans/client-minted-assets-and-health.md:100-109` — the bullets were amended with
"landed with the health route", "— done", "The `/v1/health` case is in", so a `- [ ]` box sat
under prose saying part of it was finished.

### 6. Unnecessary comments

Across the slice: several new comments restate the code or repeat what `CONTEXT.md` and the specs
already say.

---

## Resolution

Co-reviewed with palmdrop on PR #24; their two are 5 and 6 below.

1. **Won't fix, reasoning corrected instead.** Routing the mint through `config.ids` turns out to
   be wrong: `apps/daemon/src/ports.ts:92` wires `uuidV7Ids` into the store, so the identity would
   have become a UUIDv7 and encoded its own minting time — which `http-v1.md` specifies it may not
   do ("not its age"). The finding was still real: the *stated* reason for excluding
   `PoolIdentity` from `MintableId` did not separate it from `LeaseId`. `ids.ts` now gives the
   reason that does — a generator may mint time-ordered ids, and a pool identity may carry no
   time — and `identity.ts` says the same at the call site, where a reader sees `randomUUID`
   beside a store that holds a generator.
2. **Fixed.** `core.md` gained a dated `Shipped:` entry and a line under *The pool and the feed*:
   the pool answers which pool it is, opaque, a read on the pool rather than on the store, and not
   among the ids a generator mints.
3. **Fixed.** Both examples are v4-shaped now (`schemas/health.ts`, `http-v1.md`), so nothing in
   the document invites a reader to parse a timestamp out of a value specified to carry none.
   `openapi.json` and the client's generated types regenerated.
4. **Fixed.** The case asserts `pool_identity` is absent from `sqlite_master` before the reopen,
   so it fails rather than quietly passing if `BEFORE_POOL_IDENTITY` ever points past the
   migration.
5. **Fixed** (palmdrop). Phase 4's bullets in the plan no longer read as half-done: what remains
   is the bullet, and what landed with the health route is a parenthetical, so an unchecked box
   means an unfinished bullet.
6. **Fixed** (palmdrop). Comment sweep — removed `rows.ts`'s (the `CHECK` says it),
   `types/api/pool.ts`'s (restated the method name) and `schemas/health.ts`'s (duplicated the
   route description two files over); cut the migration's comment to the one thing a schema reader
   asks, which is why the table is created empty; dropped `PoolIdentity`'s docblock in `ids.ts`,
   where `CONTEXT.md` now carries the same words and no other brand in the file has one. Kept
   `ports.ts` (a contract on the implementor), `identity.ts`, `BEFORE_POOL_IDENTITY` and both
   full-stack test comments — each answers a *why* the code cannot.
