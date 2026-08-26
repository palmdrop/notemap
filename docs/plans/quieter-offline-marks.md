# Quieter offline marks, and a probe that keeps ticking

**Date**: 2026-08-26
**Status**: Todo
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`, `CONTEXT.md`
**Closed**:

---

## Goal

Being offline is said in two places instead of three: the chrome's `offline` mark, and the foot of
whichever surface is being read, which stops offering a page nobody can fetch. The register entry
above the rows is gone from the queue and the feed. And the mark tells the truth without being
asked: while a shell is being looked at, the pool is probed every ten seconds whether or not it is
answering, so a daemon that dies is offline within ten seconds and one that comes back drains
within ten, rather than at the far end of a thirty-second backoff or on the next action that
happens to want it.

Amends [shell-offline-marks](shell-offline-marks.md)'s phase 2 and
[durable-offline-client](durable-offline-client.md)'s reachability: both of those are what this
argues with, and neither is being undone wholesale.

---

## Tasks

### Phase 1 — the register stops saying it

Depends on nothing.

- [ ] Create branch `agent/quieter-offline-marks`
- [ ] The cached notice goes from the **queue and the feed** both. `CACHED` goes from
      `$lib/said`, and `Notice` keeps only the refused sentence — a read the pool answered no to is
      not this condition and keeps its register entry, in the accent, as
      [shell.md](../specs/shell.md) already has it
- [ ] `surface()` loses `cached` and, with it, the `asked` flag and the `read()` wrapper that exists
      only to set it. What is left is the refused derivation; if that is all it is, it is a function
      and not a helper with state. The two call sites lose their `await said.read(...)` dance
- [ ] The feed's `first` and the queue's `drained`/`bare` conditions still read `fromCache` and
      still need to: an empty surface nobody has answered for is not an empty pool
- [ ] Tests: the queue and the feed draw no cache sentence while unreachable, and the refused
      sentence is still drawn where a read was refused. The existing `CACHED` assertions in
      `Queue.test.ts` and `Feed.test.ts` are rewritten rather than deleted — what they were pinning
      (a cold surface is not a drained one) is still true and is now pinned through the foot
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` green
- [ ] `git commit`

### Phase 2 — the foot says it instead

Depends on phase 1, sharing both files.

- [ ] While the pool is out of reach, the foot of a surface with more to read says so and offers no
      action: one sentence, muted, in the foot's own place. `Load more` is a promise the shell
      cannot keep offline, and the honest statement is that there is more and it is not reachable
- [ ] The word is drawn from the client's reachability, not from `fromCache`: a surface drawn from
      the cache while the pool answers is a surface whose read is about to land, and it has nothing
      to say. The feed grows the `reachable()` the queue already has
- [ ] The sentence lives in `$lib/said` with the others. It uses `offline`, the chrome's word
      ([CONTEXT.md](../../CONTEXT.md)); it is not a second `role="status"` — the chrome's mark is
      the status, this is the foot explaining why the action is gone
- [ ] The foot keeps its `more` guard. A surface read to the end says nothing about being offline:
      there is nothing more to fetch either way
- [ ] Tests: unreachable with more to read draws the sentence and no `load more` button; reachable
      draws the button and not the sentence; an exhausted surface draws neither
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` green
- [ ] `git commit`

### Phase 3 — a probe that keeps ticking

Depends on nothing in phases 1 and 2, and lands after them so the shell change is reviewed against
a mark that is already correct.

- [ ] `packages/client/src/pool/reachability.ts` probes in **both** states: every ten seconds while
      the pool answers, and on the existing one-second-doubling backoff capped at ten seconds while
      it does not. The cap drops from thirty seconds. Ten is chosen against the drain: a pool that
      comes back is drained by the probe that finds it, and a minute of waiting for that is what
      this is about
- [ ] Probing while reachable is the reversal of a stated decision — client.md says the probe "runs
      only in that state" because a client whose requests are answered has better evidence than a
      poll. That is true of a client being *used* and false of one sitting on screen, which is the
      case that matters: nothing is asking, so nothing notices the daemon went away
- [ ] The probe is **paused while nobody is looking**, and probes once on being looked at again, so
      the cost is one request per ten seconds per visible shell rather than per open tab forever
- [ ] The visibility signal is the shell's — `document.visibilityState` and `visibilitychange` in
      `apps/ui/src/lib/reachable.svelte.ts`, beside the `online`/`offline` listeners already there —
      and reaches the client through a method on `Client`, in the same shape as `drain()`. The
      client keeps the cadence; the shell only says whether anyone is there. The method is
      `watched(yes: boolean)`, with a matching **Watched** entry in `CONTEXT.md` under The client
- [ ] Tests, in `pool.test.ts`: a reachable pool is asked again after ten seconds; the backoff caps
      at ten; an unattended client asks nothing; attending again asks at once rather than waiting
      out the interval. `stops asking once the pool answers` is the test this contradicts — it
      becomes a test that it *keeps* asking, at the steady interval
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint` and `pnpm test:stack` green
- [ ] `git commit`

### Phase 4 — the docs that said otherwise

Depends on phases 1 to 3. Per AGENTS.md these ride with the change; they are listed apart only
because they span all three.

- [ ] [shell.md](../specs/shell.md)'s **A surface says what it is drawn from** is rewritten: the
      surface no longer says it, the foot does, and the reason is that the chrome's mark plus a row's
      `pending` were already enough. Its **Draining** section gains the offline foot beside
      `Load more`
- [ ] [client.md](../specs/client.md)'s **Reachability** section: the probe runs in both states, at
      ten seconds, paused when unattended. Its prior-decisions entry on reachability being the
      client's is amended rather than replaced — the round-trip cost it names as the condition to
      revisit under is now paid ten times a minute, which is worth stating plainly
- [ ] `CONTEXT.md` gains **Watched**
- [ ] `Shipped:` entries on both specs, dated, linking here
- [ ] This plan's Status set to `Done`
- [ ] `git commit`

---

## Unknowns

- **Whether the client-wide fake-timer tests start counting probes they did not before.** A steady
  ten-second poll sends requests inside any test that advances timers, and several assert on
  `transport.sent` wholesale. *Fallback*: those assertions filter by route, as `asks who the pool is
  once, on start` already does; the ones that do not are the ones to fix.
- **Whether an integration or stack test leans on the probe stopping.** `tests/integration` drives a
  real daemon and a real client. *Fallback*: `client.close()` in teardown, which is what the unit
  tests already do.
- **Whether `watched` is the right word.** Settled 2026-08-26: it is. The alternative shape — the
  shell owning the cadence outright and calling a plain `check()` — is rejected because it puts two
  probe loops in play while the pool is out of reach.

---

## Out of scope

- The chrome's `offline` mark and the row's `pending` mark. They are what this argues are already
  enough; neither changes.
- The refused read's register entry, the corner's refused operations, and the bar's `N waiting`.
- Anything about *what* the cache holds or how long. This is only about what is said out loud.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

`pnpm test:stack` is run once, in phase 3, because reachability is the one part of this that crosses
the client's transport and the daemon's `/v1/health`. Phases 1 and 2 are `apps/ui` alone.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
