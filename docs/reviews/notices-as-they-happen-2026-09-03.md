# Review: The shell says what happened

**Date**: 2026-09-03
**Status**: Resolved <!-- Open | Partially addressed | Resolved -->
**Scope**: PR #42 — `apps/ui/src/lib/{notices,action-log,routing,lingering,excerpt,destinations}`,
`apps/ui/src/components/{notices,queue,primitives/alarm}`, `packages/client/src/actions/watching.ts`
<!-- action-log.ts and lingering.svelte.ts were happened.ts and leaving.svelte.ts when reviewed -->
**Plan**: `docs/plans/notices-as-they-happen.md`
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`

---

## Overall

The shape is right and the honesty the plan cared most about is there: a `pending` record reads as
`retrying` and claims no landing, the watcher's first read is silent, the dedup is keyed by the
routing record rather than the log entry, and `work-abandoned` finally explains the row that comes
back on its own. The watcher is the strongest part of the change — its gating, its bounded
catch-up and its fake-clock tests all hold up. The spec trail is complete: both listed specs carry
a dated `Shipped:` entry pointing at the plan and ADR 32.

The one real defect is in phase 3, the phase the plan called droppable. `Queue.went()` computes
where the departing row stood by looking it up in a queue it has already left, so a routed row is
watched out from the top of the register rather than from its own place. Everything else is a
contract that is looser than the code needs it to be, or a comment that promises more than the
code does.

Typecheck, `pnpm -r test` and lint are all green.

---

## Bugs

### 1. A routed row is watched out from the wrong place

`apps/ui/src/components/queue/Queue.svelte:113` — `went()` finds the departing row's neighbour in
`$queue.items`, but the item is gone from that list by the time it runs.
`RoutingApi.route()` awaits `deps.processed(item, record)` before it resolves
(`packages/client/src/routing/routing.ts:38`), and `processed` drops the id from the queue
(`packages/client/src/state/state.ts:335`). `RoutingComposer` calls `onrouted` after that promise.

```
route() resolves → item already out of $queue.items
  → findIndex(...) === -1
  → $queue.items[-1 + 1] === $queue.items[0]
  → before = the top row's id, whatever it is
```

So `Leaving` is inserted above the first row of the queue. On a one-item queue `before` is
`undefined` and it lands at the foot, which is why nothing caught it — no test asserts the
position, and the `subject` comment three lines up
(`Queue.svelte:38-42`) states the very fact that makes this wrong.

Fix: capture the neighbour before the call rather than after — pass `before` into the composer the
way `QueueRow` already receives it, or record it on `subject` when the row is opened. Add a test
that asserts a routed row is drawn between the rows it stood between.

---

### 12. `markDone` reads `before` after its own row has unmounted

*(Added after the fact: turned up by the test written for finding 1, not by reading. My first pass
said `QueueRow` was unaffected because it uses the `before` prop — that is wrong.)*

`apps/ui/src/components/queue/QueueRow.svelte` — `before` is a prop, and `markProcessed()` takes
the item out of the queue before it answers, so the row is destroyed and the prop reads `undefined`
by the time `lingering.after` runs. A row marked done therefore lingers at the foot of the register
rather than in its place. The same shape as finding 1, one component over, and pre-existing rather
than introduced by this PR — `markDone` has awaited since it was written.

Fix: read both `before` and the excerpt into a local before the call.

---

## Design

### 2. A confirmation raised into a full corner is never seen

`apps/ui/src/lib/notices.svelte.ts:53` — `trimmed` drops the *first* non-standing notice, so when
four standing notices already fill the corner, the quiet notice just raised is the only candidate
and is spliced out in the same call that added it. `raise` then sets a fade timer for an id that is
no longer held, and returns that id as though it were shown.

The consequence is backwards: the notice most worth seeing is the one about what the person just
did, and it is the one dropped. The spec sentence — "past that the oldest confirmations go" —
reads as though it should survive.

Worth deciding rather than fixing blind: either a quiet notice displaces the oldest standing one
into the fold, or it is allowed to overflow and the fold counts it. Whichever way, `raise` should
not report an id for a notice it discarded.

### 3. `nameOf` reads an async interface synchronously with nothing checking

`apps/ui/src/lib/destinations.ts:11` — subscribing, letting the value land, and unsubscribing works
only because `client.destinations.all` happens to be backed by client state and emits on
subscribe. Its type is `Observable<readonly Destination[]>`, which promises nothing of the sort.
A `delay`, a `switchMap` or an async source anywhere in that pipeline turns every destination in
every notice into the string `"a destination"`, silently — the unit tests inject their own `nameOf`
and would stay green.

Either the client should expose a synchronous snapshot of the destinations it holds, or this should
say out loud that it requires a replaying observable and fail loudly when it does not get one.

### 4. A catch-up raises a page of notices *and* the mark that says there were too many

`apps/ui/src/components/notices/Corner.svelte:36-54` — on a bounded catch-up the corner raises a
notice per action in the page and then a standing "more happened". A page of `delivery-failed`
entries is a page of standing notices, none of which `trimmed` may drop, so `held` grows to the
page size and `folded` reports the remainder. The plan's own words were "More than that collapses
into one standing notice with a count", and the spec's are "A hundred things to dismiss is not a
report" — the code satisfies neither when `more` is true.

The narrower reading is defensible (one page *is* the bounded catch-up), but the two documents say
something the code does not do, and that is the thing this project does not allow to drift.

### 5. The catch-up mark has no key, so it accumulates

`Corner.svelte:48` — the "more happened" notice is standing and keyed by nothing, so every reconnect
after a long absence adds another one that only a person can clear. It is also raised *before* the
notices it is about, because the loop over `said.actions` is in an async IIFE and this is not.

---

## Minor

### 6. A stale doc comment, and a duplicated one

`apps/ui/src/lib/routing.ts:28-32` — an orphaned doc block for `saidOf` sits above `placeIn`'s own
doc block. It also contradicts the live one below: it says a pending record "has been recorded and
not delivered", the one at line 49 says it "was attempted and did not go". Delete the first.

### 7. `notices.clear()` claims a caller it does not have

`apps/ui/src/lib/notices.svelte.ts:126` — "For a test, and for a shell that has just been signed out
of." Nothing calls it outside tests. Signing out unmounts `Corner` but leaves the module state
holding standing notices about the previous session's pool work, which are drawn again on the next
sign-in. Either wire it to sign-out or cut the second half of the sentence.

`leaving.clear()` (`leaving.svelte.ts:47`) is the same, though its contents expire in 1.2s.

### 8. Archive claims success it has not waited for

`apps/ui/src/components/queue/QueueRow.svelte:68` — `void client.archive(item.id)` then
unconditionally says "archived" and watches the row out, where `markDone` awaits and catches. The
enqueue is optimistic so this is nearly always honest, but a rejected enqueue is now both an
unhandled rejection and a notice that says it worked.

### 9. `failureIn` is called twice for one value

`apps/ui/src/lib/happened.ts:106` — computed once for the ternary test and again for the value.

### 10. The corner's overflow path is untested

Nothing exercises `said.more` in the shell. `watching.test.ts:89` covers the client half; the notice
it produces is covered nowhere.

### 11. A rewrapped paragraph left a long line

`docs/specs/shell.md:646` (149 chars) and line 9 of the new `Shipped:` entry (125) run past the wrap
their own paragraphs keep — 646 is a mid-paragraph edit that was not re-wrapped after. The file
already holds longer lines elsewhere, so this is drift rather than a broken convention.

---

## Non-issues

- **`Alarm` now renders unconditionally** — `Refusals` dropped its `{#if refused.length > 0}` guard
  and `Corner` always mounts the stack. An empty grid with no children has no height, so it
  intercepts nothing.
- **`saidOf`'s pending branch returns no `key`** — deliberate, and the hinge of the whole feature:
  the deferred `routed` must be free to speak when it lands.
- **`delivery-failed` and `work-abandoned` use different key prefixes for one record** — two
  standing notices for one delivery is what the spec asks for; they are different facts.
- **The watcher keeps polling after `Corner` unsubscribes** — the mark stays where it was, so a
  remount loses nothing, and `client.close()` stops it.
- **`happened.ts` reads `action.detail` as `Record<string, unknown>`** — the log's `detail` is
  flattened generically by decision; a typed read per kind is the thing shell.md rules out.
- **Module-level `$state` in `notices.svelte.ts`** — the shell's other stores (`rail`, `pending`,
  `reachable`) are the same shape.

---

## Resolution

Reconciled with the developer's own review in the same session, which raised three findings, all
naming, none overlapping with these. Settled there: `Happened` → `ActionsSince`, `$lib/happened.ts`
→ `$lib/action-log.ts`, `$lib/leaving.svelte.ts` → `$lib/lingering.svelte.ts` — "event" was ruled
out against `CONTEXT.md:197`, which names it in **Action**'s _Avoid_ list.

1. **Fixed.** `Queue.svelte` holds `{ item, before }` from the moment the composer opens, read while
   the row is still standing there, rather than looking the item up in a queue it has already left.
   A test asserts the routed row is drawn between the rows it stood between; it fails against the
   old code.
2. **Fixed.** `trimmed` no longer considers the notice just raised. A confirmation into a corner of
   four failures is shown and the oldest failure is folded into the count instead. Two tests.
   `shell.md` says so.
3. **Fixed.** `DestinationsApi.held` reads the destinations cache synchronously — the client already
   holds it in a `Writable`, so this is `state.get().destinations` and no new state. `nameOf` is
   three lines and no subscription. `client.md` records the two ways the cache is read.
4. **Fixed.** A read that cannot reach back to its mark now raises one standing count pointing at
   `/log` and enumerates nothing. `shell.md`'s catch-up paragraph is rewritten to say it; the plan
   already did.
5. **Fixed.** The corner holds the id of that mark and dismisses the previous one, so a second long
   absence replaces the first. Tested.
6. **Fixed.** Deleted.
7. **Fixed.** `+layout.svelte` clears both stores when the door shuts, and the comment on `clear()`
   no longer claims a caller. The store side is tested; the one-line effect in `+layout.svelte` is
   not, that file having no test harness.
8. **Mitigated, not as written.** Awaiting the enqueue before saying anything was the wrong shape:
   it pushes the notice and the linger past the outbox's optimistic removal, so the row leaves
   before the shell has recorded where it stood — a real regression, caught by an existing test.
   Archive stays optimistic, as every outbox mutation in this shell is; the rejection is now caught
   and said on the row instead of being dropped by `void`.
9. **Fixed.**
10. **Fixed.** Two tests: a long catch-up is counted rather than read out, and a second one replaces
    the first.
11. **Fixed.** Both rewrapped.
12. **Fixed.** With 1 — `departure()` reads the neighbour and the excerpt before the call, for both
    `markDone` and `archive`.
