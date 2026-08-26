# Review: Quieter offline marks, and a probe that keeps ticking

**Date**: 2026-08-26
**Status**: Resolved
**Scope**: `apps/ui/src/components/{feed,queue,primitives/register}`, `apps/ui/src/lib/{said,refusal,reachable.svelte,surface.svelte}.ts`, `packages/client/src/pool/reachability.ts`, `packages/client/src/{client,types}.ts`
**Plan**: `docs/plans/quieter-offline-marks.md`
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`

---

## Overall

The change does what the plan set out to do, and the reachability rewrite is the good part: `settle`
is now one function with one scheduler, the answered path pushes the probe out rather than killing
it, and `watched` is a small, correctly-guarded addition. `pnpm -r --silent test`, `pnpm -r
typecheck`, `pnpm lint` and `pnpm test:stack` are all green here.

No bugs. What is left is a doc contradiction the plan's phase 4 half-finished — `client.md` still
asserts in two places that a cache-drawn surface says so, which is the sentence this branch deleted
— and three tests the plan named that were not written or do not pin what they claim to.

---

## Bugs

None.

---

## Design

### 1. `client.md` still says the surface names itself, in two places

`docs/specs/client.md:217` — "Either may be **drawn from the cache** rather than from the pool …
**and says which it is**."

`docs/specs/client.md:555` — "**A cache-drawn surface says so.** A shell that drew it as the pool's
reading would tell a person that three rows means they are nearly done."

Both read as shell claims, and `shell.md`'s new heading is **A surface says nothing about what it is
drawn from**. On a closer read neither is false — both are the client spec describing `ListState`
carrying `fromCache`, and 555 explicitly defers the drawing to `shell.md`. But *says* is the shell's
verb everywhere in these specs, so a reader arrives at a flat contradiction and has to work out that
one of the two is talking about a field. The same file amends the point correctly at line 753.

`fromCache` is still load-bearing — the feed's `bare` and the queue's `drained` read it — so the
reason stays and only the verb changes.

### 2. `reachable()` both reads the signal and drives it, from four call sites

`apps/ui/src/lib/reachable.svelte.ts:22-25` — every caller of `reachable()` now registers a
`visibilitychange` listener and pushes `client.watched(...)`. There are four:
`routes/+layout.svelte:22`, `Queue.svelte:24`, `Feed.svelte:24`, `Destinations.svelte:18`. On a queue
page that is two listeners computing the same global and calling the same idempotent setter.

It is not wrong today — the value is derived from `document.visibilityState`, so every caller agrees,
and `watched` returns early on an unchanged value. But nothing in the shape says that, and the
cleanup deliberately does *not* call `watched(false)`, which is only safe because some other caller
is always still mounted. The signal is the shell's, singular; it belongs in the layout, with
`reachable()` left as the read. Worth stating one way or the other before a fifth caller appears.

---

## Minor

### 3. The backoff-cap test does not pin the cap

`packages/client/src/pool/pool.test.ts:59-69` — the plan's phase 3 lists "the backoff caps at ten" as
a test. This is the test that changed, and it only widened `toBeLessThan(10)` to `toBeLessThan(12)`.
Over 60s a ten-second cap gives 8 probes and the old thirty-second cap gives 5; both satisfy
`> 2 && < 12`. Reverting `SLOWEST` to `30_000` leaves the suite green.

Fix: assert the tail interval — advance past the doubling, then advance ten seconds and expect
exactly one more probe.

### 4. No test for an exhausted surface, and none for `More`

Phase 2 asks for "an exhausted surface draws neither". `NO_MORE_OFFLINE` appears only in the two
"offers no page it cannot fetch" tests, both on a surface with `more` true. Nothing pins that a
surface read to the end draws neither the sentence nor the button while offline — which is the whole
reason `More` sits behind the `{#if $queue.more}` guard rather than owning it. `More.svelte` has no
test of its own either, though `register.test.ts` is where the other primitives are covered.

### 5. `backoff` keeps doubling while unwatched

`packages/client/src/pool/reachability.ts:34-38` — with `watching` false, `waiting` is always
`undefined`, so every failed request takes the branch, doubles `backoff`, and calls `again()`, which
returns without scheduling. A shell hidden for a while with the pool away comes back with `backoff`
pinned at `SLOWEST`, so `watched(true)`'s immediate `ask()` is followed by a ten-second wait rather
than the one-second first retry.

Harmless while `SLOWEST === STEADY === 10_000`, and invisible the moment they diverge. `watched(yes)`
resetting `backoff = SOONEST` on the way in would say what is meant.

### 6. UI test clients now probe on real timers

`apps/ui/src/testing/pool.ts:29` correctly closes the client it replaces, but the last client of a
file is never closed, and `apps/ui` uses real timers throughout — so it goes on probing every ten
seconds for as long as the worker lives.

Harmless in what it can reach: `mockTransport` answers `GET /v1/health` itself unless a test sets
`health` to null, and `asked()` filters the route out, so no handler and no assertion sees it. It is
a leaked timer rather than a leaked request.

---

## Non-issues

- **The offline foot dropped the `asked` gate that `surface()` needed** — the deleted helper existed
  because `fromCache` is true through hydration, so the mark flashed on every load. The foot reads
  reachability instead, which starts `true` in both `writable(true)` and `reachable()`'s `$state`, so
  there is nothing to flash.
- **`settle` runs twice per probe** — once from the transport wrapper and once from `ask`'s own
  `await`. The second call finds `waiting` defined and `changed` false and does nothing. Pre-existing.
- **`More`'s sentence has no `role="status"`** — deliberate, per `shell.md:281`; the chrome's mark is
  the status and the foot only explains a missing action.
- **The old shell.md `Shipped:` entry still describes the register notice** — Shipped is a dated trail,
  not a description of current behaviour. Superseded, not stale.
- **`fromCache` survives the deletion of `CACHED`** — the feed's `bare` and the queue's `drained`
  still read it, which is right: an empty surface nobody has answered for is not an empty pool.

---

## Resolution

1. **Fixed.** `client.md:217` now says a surface *carries* which it is, and the bullet at 555 is
   **A cache-drawn surface is marked as one**, keeping the reason and adding a dated amendment that
   the shell draws nothing above the rows. Neither claim changed; the verb did.
2. **Fixed.** `reachable()` is the read alone. The signal moved to a `watched()` export beside it in
   `reachable.svelte.ts`, mounted once by `routes/+layout.svelte`, and its cleanup now tells the
   client so — the shell going away no longer depends on some other caller still being mounted.
   Covered by `lib/reachable.test.ts` through a fixture; the old test in `Queue.test.ts` is gone,
   the queue no longer being what drives it.
3. **Fixed.** `pool.test.ts:59` counts eight probes in the first minute and then pins the interval
   either side of a tick. Restoring `SLOWEST = 30_000` fails it.
4. **Fixed.** `register.test.ts` covers `More` in all three states, and the queue and the feed each
   gained *says nothing in the foot of a … read to the end*. Removing the `{#if more}` guard fails
   the queue's.
5. **Fixed.** `watched(true)` resets `backoff` to `SOONEST`, with a test that a shell looked at again
   after an unwatched stretch retries a second later rather than ten.
6. **Fixed.** `testing/pool.ts` closes the client after every test. Premise partly wrong as written:
   the probe never reached a test's handler.
