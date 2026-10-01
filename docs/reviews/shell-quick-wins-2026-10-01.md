# Review: Shell quick wins

**Date**: 2026-10-01
**Status**: Resolved
**Scope**: `git diff main..agent/shell-quick-wins`: `apps/daemon/src/work/runner.ts`, `packages/adapters/store-sqlite/src/jobs.ts`, `packages/core` (`WorkApi.nextDue`, `WorkQueue.nextDue`), `packages/client/src/actions/watching.ts`, `packages/adapters/destination-arena/src/blocks.ts`, `apps/ui/src/**`, `docs/specs/{core,client,shell}.md`, `docs/todo.md`
**Spec**: `docs/specs/shell.md`, `docs/specs/core.md`, `docs/specs/client.md`

---

## Overall

There is no plan for this branch. The work is a batch of `todo.md` items, so I checked it against
the spec paragraphs it amends. Code and spec agree everywhere except where the spec promises
timing the code doesn't deliver (#3, #4). The runner's wake-up is correct: I traced the poll phase,
a pass in flight, a cancelled job, and the case where `claim` skips a job `nextDue` returned, and
none of them loops or misses the job. The watcher's `ask()` and the shell's three follow-up looks
fit together. The untracking fixes in `resolve`, `described` and `PathLine` address the real
re-ask loop. The most important finding is design rather than a bug: the shell now decides whether
a pointer is a path from `x-notemap-path`, a marker core defines for folder modes (#1).

`pnpm typecheck`, `pnpm lint` and `pnpm -r --silent test` are green. I did not run
`pnpm test:stack`, though the runner change touches the host's wiring.

---

## Bugs

None.

---

## Design

### 1. "The pointer is a path" is inferred from a marker that means something else

`apps/ui/src/lib/routing.ts:42`, `:145`. `x-notemap-path` is defined in
`packages/core/src/pool/destinations/vocabulary.ts:12-19` as *the field a folder mode is about*.
The shell now also reads it as *this capability hands back a pointer that is a path*, and
otherwise treats the pointer as a minted handle and prefers the named place. The second meaning
is stated only in `shell.md`. Core's vocabulary and the adapters marking the field don't mention
it. A future kind could mark a path field and return a URL or id as its pointer, and the routing
line would then show the handle again. A kind with no path field whose pointer *is* readable
(a memo URL, say) gets the named arguments instead. Either write the second meaning into the
vocabulary's doc comment, so adapters know they are promising it, or have the adapter say what
its pointer is.

### 2. A routing line changes its words once per destination per session

`apps/ui/src/lib/routing.ts:137-146`, `apps/ui/src/components/item/Routing.svelte:80-83`. Until
`described()` answers, `reading` is undefined. The line then draws the pointer (an are.na block
id) and the place with its settings included (`research.md, none`). When the description arrives
it switches to the channel name and drops the settings. The spec acknowledges this ("Until the
capability has been described, the pointer wins"), but it is the same jump the unfurl and preview
work keeps removing. Every rows surface asks for descriptions anyway, so `short`/summary lines
could wait for the description, or the description could be warmed with `client.destinations.all`.

---

## Minor

### 3. "Half a second" after the window is up to a second and a half

`apps/ui/src/lib/firings.svelte.ts:24`, `:43`. `look()` only runs on the countdown's 1 s
interval, so each of `LOOKS_AFTER`'s three looks fires on the first tick past its offset, up to
a second late. The offsets are also compared against `until`, which is the pool's clock, using
`Date.now()`, so device clock skew shifts them as well. `shell.md:1982` states the offsets as
exact. Either schedule the three looks with their own timeouts or soften the spec.

### 4. "Always sees the job before it is due" depends on config

`docs/specs/core.md:12`. `routing.triggerWindow` and `delivery.pollInterval` can be configured
independently (`apps/daemon/src/config/load.ts:140`, `:458`), and the window may be `0`. When the
window is shorter than the poll, the first pass after enqueue can come after the job is due, and
the delivery waits for that poll as it did before. Nothing wakes the runner on enqueue. Either
qualify the sentence or have firing a template nudge the runner.

### 5. The runner measures `nextDue` against the wall clock, while the pool uses its own clock

`apps/daemon/src/work/runner.ts:109`. `nextDue` and `claim` judge "due" with `ports.clock`, and
the runner computes the wait with `Date.now()`. Today both are `systemClock`. If a host wires a
clock that lags the wall clock, `wait` goes negative while `claim` still sees the job as not due,
and the runner would loop on `setTimeout(tick, 0)`. This is unlikely to fire. A `Math.max(wait, 0)`
floor of a few ms, or reading `now` from the pool, would close it.

### 6. Two reads of the same item can land out of order and the older one wins

`apps/ui/src/lib/records.svelte.ts:39`, `:44`. The guard is `wanted === item()`, which holds for
both reads of the same item. Since this branch keeps `drawn` when the same item is re-read, a
route followed by `reread()` plus a summary change can start two reads together. If the earlier
one answers last, it replaces the newer records, and nothing re-reads until the next change. This
existed before the branch, but it is now more likely to be visible. Fix: a per-effect sequence
number.

### 7. Reactive maps that nothing reads reactively

`apps/ui/src/lib/described.svelte.ts:16` (`asking`) and `apps/ui/src/lib/firings.svelte.ts:32`
(`looked`) are `SvelteMap`s, and only plain code reads them. `asking` being reactive is half of
why `described()` needs `untrack`. Plain `Map`s would remove that need.

### 8. "best effort" is chosen by comparing the refusal text

`apps/ui/src/components/routing/PathLine.svelte:407`: `refusal === "unreachable"`. The user-facing
word doubles as the discriminant, so rewording it silently drops the qualifier. A `kind` on the
refusal would be safer.

### 9. A test sleeps on the real clock

`apps/ui/src/components/routing/PathLine.test.ts:217` waits 600 ms of wall time to show that
nothing more is asked. That is slow, and it passes vacuously if the debounce it outlasts ever
grows.

### 10. `client.md` has no `Shipped:` entry for `actions.ask()`

`docs/specs/client.md:5`. The behaviour is in the body with *(added 2026-10-01)*, and `core.md`
and `shell.md` each got a dated entry, but the client's own list does not mention the new API
method.

---

## Non-issues

- **`nextDue` excludes jobs that are already due.** A job already claimable belongs to the next
  claim, and returning it would only re-arm a zero timer. A job that becomes due during a pass is
  picked up by the same pass's claim loop.
- **`nextDue` ignores mirror coalescing and expired leases.** When `claim` skips a job `nextDue`
  returned, that job falls out of `> now` once due, so the runner doesn't loop. The poll covers
  expired leases.
- **`watching.ask()` drops a request made while a read is in flight.** The shell's looks at
  2 s and 5 s and the tempo cover it.
- **`described()` keeps a successful description for the whole session.** A capability's schema
  belongs to the kind and doesn't change when a destination is edited.
- **The dynamic import of `described.svelte` in `testing/dom.ts`.** It follows `rows.svelte` on
  the line above, so the module loads after the test file's `vi.mock("$lib/client")`.
- **The process surface draws the capture's picture twice** (in the head and in the preview).
  This is intended: the preview shows what the delivery carries, as the `todo.md` item asked.
- **Unfurl blocks that fold away move the content below them.** The spec changed this on purpose
  ("the same height asking as answered").

---

## Resolution

1. **Fixed.** Marking `x-notemap-path` now also promises the pointer is that path. This is
   written in `vocabulary.ts` and as a 2026-10-01 amendment in `core.md`. A kind whose pointer
   isn't its path marks no field.
2. **Fixed.** `readingHeld()` in `described.svelte.ts` answers `asking` until the destination has
   answered once, and `placeIn` draws no place while asking. This applies to routing lines, the
   record block and templates. A destination that could not be described (a deleted one) falls
   back to the pointer. `shell.md` is updated. The Block test's `DESCRIBED` fixture gained the
   `x-notemap-path` marker that the real markdown capability carries.
3. **Fixed.** Each look is its own timeout at `until + offset`, cleared when the firing closes,
   and only offsets still ahead are scheduled. Skew is accepted: the looks use the same clock as
   the countdown, and `shell.md` now says so.
4. **Fixed.** `openPool` takes a `heard` hook, and the daemon wakes the delivery runner on
   `template-fired`. `Runner.wake()` is now public. Tested by a full-stack test
   (`tests/full-stack/src/trigger.test.ts`, with a 60 s poll and a 300 ms window), which fails
   without the hook.
5. **Fixed.** `work.nextDue` became `work.dueIn`, which returns a `Duration` measured on the pool's
   clock, so the runner no longer reads `Date.now()`.
6. **Fixed.** Each read carries a sequence number, and only the latest one draws. This also covers
   `when()` turning false mid-read.
7. **Won't fix.** The project's `svelte/prefer-svelte-reactivity` lint rule forbids a plain `Map` in
   a `.svelte.ts` module, so `asking` stays a `SvelteMap` and `described()` keeps its `untrack`.
8. **Fixed.** `Level.refusal` is typed as `Refusal = "not offered" | "unusable" | "unreachable"`,
   so rewording it breaks the comparison at compile time.
9. **Fixed.** The test uses fake timers with `shouldAdvanceTime` and advances 10 s. Reverting the
   `untrack` makes it fail (255 asks against 3).
10. **Fixed.** `client.md` has a dated `Shipped:` entry for `actions.ask()`.

