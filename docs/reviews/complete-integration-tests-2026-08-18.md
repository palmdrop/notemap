# Review: Complete integration tests

**Date**: 2026-08-18
**Status**: Resolved <!-- Open | Partially addressed | Resolved -->
**Scope**: `tests/full-stack/`, `tests/seed/`, `tests/integration/`, `packages/adapters/store-sqlite/`, `scripts/seed.ts`, CI
**Plan**: `docs/plans/complete-integration-tests.md`
**Spec**: `docs/specs/client.md`, `docs/specs/http-v1.md`, `docs/specs/core.md`

---

## Overall

The plan is delivered as written: a seeder that touches nothing but `/v1`, a suite that spawns the
real binary over temp directories and drives it with the real client, and the core-suite gaps
filled or explicitly dropped with a reason. The journeys assert on things they caused, every wait
is a bounded poll for something appearing, and the `Shipped:` trail is complete across all three
specs. The one real defect is in the harness rather than the tests: a daemon that fails to announce
itself is never killed, so the failure mode the harness exists to make debuggable is also the one
that poisons the rest of the run. Second is a teardown race in `tests/integration`'s new `reopen`,
where one harness deletes the directory another is still open over.

---

## Bugs

### 1. A daemon that times out on the way up is orphaned, holding the port

`tests/full-stack/src/harness/daemon.ts:118` — `ready()` rejects on `START_TIMEOUT` without killing
the child, and `daemons()` only registers a `Running` for teardown *after* `start()` resolves
(`daemon.ts:53`). The `exit` path is harmless — the child is already dead — but the timeout path
leaves a live daemon bound to 4748 with no handle on it.

```
daemon slow to bind → ready() rejects at 10s → start() throws → nothing pushed to `started`
  → afterEach stops nothing → child survives the run, holding the port
  → every later test fails with "the daemon exited with 1 instead of starting"
```

One genuinely slow start under CI load turns a single failure into a whole-suite failure, and
leaves a process behind after vitest exits — which the plan's own verify step (`pgrep -f
notemap-daemon` finds nothing) is meant to rule out.

Fix: kill the child on both rejection paths in `ready()`, or push the `Running` before awaiting
readiness so teardown owns it either way.

### 2. `reopen()` leaves two harnesses over one directory, and cleanup races

`tests/integration/src/fixture.ts:220` — `reopen()` returns a second `Harness` sharing `directory`,
`file` and the blob root. Both are registered in `restart.test.ts`'s `open[]`, and `afterEach` runs
`Promise.all(open.map(cleanup))`. Each `cleanup` closes its own pool and then `rmSync`es the *same*
directory, so whichever finishes first can delete the SQLite file out from under a pool the other
has not closed yet.

`force: true` swallows the second `rmSync`, and the close that follows a deleted file happens to
succeed, so this is silent today — but it is an ordering that is true by luck. Fix: have `reopen`
hand ownership of the directory to the new harness (the old one's `cleanup` closes only), or run
the cleanups in sequence.

---

## Design

### 3. A skipped destination silently burns a seed item

`tests/seed/src/seed.ts:196` — `routeEach` pairs `items[index]` with the destination at the same
index. A destination that is `undescribable`, or that lacks `create-file`, hits `continue` — but
the item it was paired with is never offered to the next destination, so it stays unrouted while
later items get routed. With the full-stack world's two working destinations this never fires; with
a real config whose first destination is down it produces a pool that differs from the README's
description of it. Fix: walk items with their own cursor, advancing only when one is actually sent.

### 4. `read()` types away a source that does not emit synchronously

`tests/full-stack/src/harness/read.ts:13` — `seen as T` turns "the observable never emitted" into a
value of type `T` that is `undefined`. Today every source read is a `BehaviorSubject`, so it always
emits; if one ever isn't, the failure surfaces as `Cannot read properties of undefined` inside an
assertion rather than as "nothing was emitted". Throwing when nothing arrived would cost one line
and name the problem.

---

## Minor

### 5. The plan says `seed`, the code says `offset`

`docs/plans/complete-integration-tests.md` phase 1 promises "a `seed` option fixes the captured ids
and timestamps"; `SeedOptions` has no such option — ids and times are always fixed, and `offset`
shifts them so a second seeding adds rather than matches. The behaviour is better than the plan's;
the plan is what is now wrong. Worth a line in the plan or the seed README so the next reader is
not looking for an option that was never built.

### 6. The stack CI job assumes the daemon builds without the UI

`.github/workflows/verify.yml` — the `stack` job installs and goes straight to `codegen` and
`pnpm test:stack`, whose `globalSetup` runs `apps/daemon/scripts/build.ts`. Root `build` runs
`@notemap/ui` first, so if the daemon's build (or its runtime static-file wiring) expects the UI's
`dist`, this job is one step short. Unverified here — it either works or CI says so on the first
push, but it is the one thing in the diff that cannot be checked locally.

### 7. Stray blank line

`tests/integration/README.md` — the appended paragraph leaves a trailing blank line at EOF.

---

## Non-issues

- **`close()` becoming idempotent in `store-sqlite`** — driven by `reopen`, but a real fix: a host
  sent `SIGTERM` twice should not get an exception from the second. Amended in `core.md` in the
  same change, which is the rule.
- **The suite having no `test` script** — deliberate, documented in `AGENTS.md` and both READMEs,
  and the `typecheck` script keeps the package visible to the compiler.
- **`fetch` used directly in tests beside the client** — the point is that two independent readers
  agree; going through the client for both would assert only that the client agrees with itself.
- **Fixed port rather than an ephemeral one** — stated in the plan: a suite that quietly moves
  hides what is already running. The failure message names `NOTEMAP_TEST_PORT`.
- **`until()` never waiting for an absence** — the negative assertions in `delivery.test.ts` and
  `outbox.test.ts` are made only after a positive fence the runner has demonstrably passed.
- **The stack CI job not building the UI** — `bundle-ui.ts` warns and carries on without one, and
  a daemon serving `/v1` alone is everything this suite drives (see finding 6).
- **The seeder duplicating types instead of importing `@notemap/client`** — a seeding tool that
  imported the domain would stop being a black-box `/v1` client, which is its whole justification.

---

## Resolution

1. **Fixed.** `start()` stops the child when `ready()` rejects, so a daemon that never announced
   itself is not left holding the port. Checked by squatting on 4748: the run fails naming
   `NOTEMAP_TEST_PORT` and leaves no process behind.
2. **Fixed.** `reopen()` hands ownership of the directory to the harness it returns; the old one's
   `cleanup` closes its pool and deletes nothing.
3. **Fixed.** `routeEach` advances its item cursor only when a destination actually takes one.
4. **Fixed.** `read()` throws when the source emitted nothing on subscribe, rather than returning
   `undefined` typed as `T`.
5. **Fixed.** The plan now describes what was built — always deterministic, with `offset` to shift.
6. **Won't fix — not an issue.** `apps/daemon/scripts/bundle-ui.ts` warns and continues when
   `apps/ui/build` is missing, so the `stack` job builds a daemon that serves `/v1` only, which is
   all the suite touches. Moved to Non-issues.
7. **Fixed.** Trailing blank line removed.
