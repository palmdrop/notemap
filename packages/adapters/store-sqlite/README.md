# @notemap/store-sqlite

The SQLite driver for core's `PoolStore` port — the default, and the one that ships. Core is
storage-agnostic ([ADR 1](../../../docs/adr/0001-pool-is-a-database.md)), so another driver is
possible where a platform or a hosting arrangement cannot use this one.

## Written against `node:sqlite`, with no ORM

Node ships SQLite as a built-in from 22, and this package uses it directly — no native module,
no build step, no query builder. drizzle-orm over better-sqlite3 was tried first and dropped.

The reasoning, since "we used an ORM and removed it" is the kind of thing that gets re-litigated:
the driver has to issue `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` itself, because core's
transaction callback is asynchronous and better-sqlite3's transaction helper refuses a
promise-returning function. So the hardest part of the driver was already outside the library.
What remained — keyset pagination, a `user_version` migration runner, and later an FTS5 index and
a recursive revision-chain query — is SQL either way. That left a typed schema and generated
migrations as the whole benefit, against a native dependency, a compile on install, and two
packages in the tree of a project whose point is being self-hostable.

Type safety is kept by hand instead, in two halves that check each other:

- `rows.ts` declares the shape of every table, and `statements.ts` asserts it once per prepared
  statement rather than at each call site.
- `schema.test.ts` reads `PRAGMA table_info` back out and fails if a column exists in one half
  and not the other. Hand-written types cannot prove they match the DDL; this is what catches
  it when they stop.

## Limits of this driver

- **A pool lives on a local filesystem, never a network share.** SQLite's locking does not
  survive one. This is a limit of this driver, not something core requires of storage.
- **Transactions are serialized.** One write at a time, across the whole pool, for as long as
  core's callback runs. Fine for a single-user local pool; it is a throughput ceiling for
  anything else. A transaction that overruns `transactionTimeoutMs` (30s by default) is rolled
  back, and its handle dies with it — a callback that keeps running afterwards finds every
  method throwing rather than writing outside the transaction it thinks it is in.
- **`:memory:` gives no read isolation.** Reads normally run on a second connection so they
  cannot observe an open transaction's uncommitted writes, and an in-memory database has no
  second connection to give — each one would be a separate database. Tests use files.

## Migrations

Plain SQL in `migrations.ts`, applied in order, tracked by `PRAGMA user_version`. A migration
that has run anywhere real is never edited; a new statement goes in a new one. There are no live
pools yet, so the first migration is still fair game.
