# Review: Runner wakes for a job that came due during its pass

**Date**: 2026-10-08
**Status**: Resolved
**Scope**: `apps/daemon/src/work/runner.ts`, `packages/core/src/pool/work.ts`, `packages/core/src/types/api/{pool,ports}.ts`, `packages/adapters/store-sqlite/src/jobs.ts`, tests beside each, `tests/integration/src/work.test.ts`
**Spec**: `docs/specs/core.md`

---

## Overall

The fix is right. `dueIn(kinds, since)` closes the race where a job comes due between a pass's
last claim and its follow-up `dueIn`, and it covers more than the early-timer case named in the
commit: a backoff or window that runs out during a long pass gets the same answer. It can't
hot-loop. A job the claim passed over, or that the pass released as already attempted, stays out,
because release never moves `next_attempt_at`. The `wakingAt` guard is a separate fix that was
needed. The `Shipped:` entry is present and `pnpm -r --silent test` is green. The finding that
matters is a design one: the host now mints the `since` timestamp from its own wall clock and core
compares it against times on the pool's clock.

---

## Bugs

None.

---

## Design

### 1. `since` comes from the host's clock, compared against the pool's

`apps/daemon/src/work/runner.ts:55` stamps `looked = new Date().toISOString()`, and
`nextDue` compares it against `next_attempt_at`, which core wrote from `ports.clock`. The spec
(`core.md`, 2026-10-01 entry) says `dueIn` is "measured on the pool's own clock". Before this
change that held, because the host only ever received a duration. Now the host hands core a
`Timestamp` from a clock core knows nothing about.

In the daemon both are `systemClock`, so it works. But the `WorkApi` contract now quietly assumes
the caller and the pool share a clock:

```
host clock behind pool clock → since too early → job passed over answers 0 → extra pass per poll
host clock ahead of pool clock → since too late → job that came due mid-pass left out → the original race returns
```

Fix: give the runner the pool's `Clock` (`main.ts` already holds `systemClock`) and stamp `looked`
with `clock.now()`. Alternatively, have the claim report the time it claimed at, so the timestamp
never leaves core's clock.

---

## Minor

### 2. The doc claims more than the stamp guarantees

`packages/core/src/types/api/pool.ts:395` says a job that came due after `since` "is one that
claim could not have taken". `looked` is stamped *before* `claim` is called, and the claim reads
its own later `now`. So a job due between the two could have been taken, or passed over. If it was
passed over, it costs one extra pass. Stamping before the claim is the safe side to err on (see
Non-issues), but the sentence states it as exact. The `Shipped:` entry has the same wording.

### 3. The runner's comment names only the early-timer case

`apps/daemon/src/work/runner.ts:109`. The `since` comment explains it only as "a timer can fire a
moment before" the job is due. The same argument also covers a backoff or window that runs out
during a pass, with no timer involved, and the commit title describes that broader case. A
narrower comment invites someone to remove `since` later as "only for libuv jitter".

### 4. No plan behind the branch

`agent/runner-wakes-for-due-work` has no `docs/plans/runner-wakes-for-due-work.md`. AGENTS.md
names branches after plans. That's fine for a one-commit fix, but the branch name points at a file
that doesn't exist.

---

## Non-issues

- **Stamping `looked` before the claim, not after**: stamping after would leave out a job that came due between the claim's `now` and the stamp, which is the race this change exists to close.
- **A released, already-attempted job doesn't come back as due-after-`since`**: `releaseLease` only clears the lease, and `next_attempt_at` stays put, so a zero-backoff failure re-claimed in the same pass is still due before the pass's last claim.
- **The `Math.max(…, 0)` clamp moved from runner to core**: `due` can now fall before `now` when `since` is earlier, so core is where a negative wait first appears.
- **`wakingAt` can keep a timer whose job has gone (superseded, deleted)**: it costs one empty pass, after which the pass's own `wake(looked)` re-arms correctly.
- **The public `wake()` passes no `since`**: it fires on `template-fired`, whose job is due ahead of now, which is the same as before.
- **Fixing it in core instead of padding the timer**: padding handles only the early timer, not a job coming due mid-pass.

---

## Resolution

1. **Fixed.** `startRunner`, `startMirrorRunner` and `startDeliveryRunner` take a `Clock`; the daemon and the test fixture hand them `ports.clock`, and `looked` is stamped from it. A runner test pins that `since` is the clock's reading.
2. **Fixed.** `WorkApi.dueIn` now says a job due after `since` is one the claim *may* have missed, and that `since` is on the pool's clock; the `Shipped:` entry says the same.
3. **Fixed.** The runner's comment covers a backoff running out mid-pass as well as an early timer.
4. **Won't fix.** No plan needed for a one-commit fix.
