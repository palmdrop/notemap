# Review: Live arrivals on the queue and the feed

**Date**: 2026-10-09
**Status**: Open
**Scope**: `main..agent/live-arrivals` (PR #99) — `apps/daemon/src/routes/{items,definitions}.ts`, `packages/adapters/store-sqlite/src/pool-store.ts`, `packages/core/src/types/api/{pool,ports}.ts`, `packages/client/src/{client.ts,state/state.ts,actions/watching.ts}`, `apps/ui/src/lib/action-log.ts`, `apps/ui/src/components/status/StatusLine.svelte`, `tests/full-stack/src/arrivals.test.ts`
**Plan**: `docs/plans/live-arrivals.md`
**Spec**: `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`

---

## Overall

The PR meets the goal. An unheld capture from elsewhere is read in one request, placed through
`settle` → `reconciled`, and reported as `arrived`. Placement on whole, filtered and oldest-first
pages is right because it reuses `intoPage`/`loaded` unchanged. The route, the store read and the
spec text for `GET /v1/items` agree. `pnpm -r --silent test` and `pnpm typecheck` are green.

The weak point is that `heard` uses "the client holds it" to mean "this client made it". That is
false in the outbox's drop→settle gap, where an own revision gets reported as an arrival (1). The
unsent check is also made once, before a read the watcher now awaits (2). Several spec sentences
claim more than the code enforces: own copies "applied before the pool heard of it", the report
"already holds it", and the scroll anchoring in the motion paragraph.

Shipped trail: the plan is Done, and all three specs carry a dated 2026-10-09 `Shipped:` entry. OK.

---

## Bugs

### 1. An own revision can be reported as an arrival from elsewhere

`packages/client/src/outbox/outbox.ts:231-232`, `packages/client/src/state/state.ts:710-714`

`send` drops the operation from `state.outbox` synchronously inside `drop`, then awaits
`stored(id)`, `store.removeOperation(id)` and `released(...)`, and only then applies
`landed.settle`. For an edit that made a revision, `revised(...)` is what first puts the revision
id into `state.items`, so for that whole stretch the edit is neither unsent nor held.

```
edit lands → drop(): op leaves state.outbox → await store writes / release
  → watcher tick: `revised` action, subject not unsent, detail.revision not held
  → read + arrived = [revision] → status line says "revised" for this shell's own edit
  → outbox settle runs afterwards
```

The window is one durable-store write plus the asset release, so it is narrow with the memory store
and wider with IndexedDB/fs or an edit that carried pictures. Captures are not affected because
their optimistic copy is held from enqueue. client.md:628 states the opposite as a rule: "One it
holds is its own, applied by the outbox before the pool heard of it." For revisions, the outbox
applies the revision *after* the pool answers.

Fix: settle before dropping the operation from state (or in the same `update`), or have `heard`
also treat the revision as own while the edit's settlement is outstanding. Correct the client.md
sentence either way. Needs a test that makes the drop→settle gap visible, e.g. a store whose
`removeOperation` is held open.

### 2. The unsent check runs before an awaited read, so a read can overwrite an optimistic copy

`packages/client/src/client.ts:204-212`, `packages/client/src/client.ts:397-401`

`heard` receives `undrained(current.outbox)` once, before `rereadAll` goes over the network. The
comment at client.ts:204-205 states the invariant: "a read now would overwrite the optimistic copy
under it". That invariant does not hold across the await:

- An operation enqueued while the read is out (a tag, or an archive of a held item that came back
  via `unarchived`/`delivery-cancelled`) is overwritten when `settle` lands. The row flickers back
  until that operation's own answer arrives.
- An operation that lands *and settles* while the read is out is worse: the older read answer then
  settles over the newer state, and the wrong copy stays (and is persisted) until something reads
  the item again.

The second case predates this PR (`reread` had it). The PR widens it: `unarchived` and returns are
now read whether held or not, and the watcher now waits on these reads. The first case can be
closed cheaply: inside the `state.update` in `rereadAll`, skip `settle` for any id in
`undrained(current.outbox)`.

Fix: re-check unsent ids at settle time. The stale-answer case needs ordering (e.g. skip a read
answer for an id whose operation landed after the read was sent), which can be its own change.

---

## Design

### 3. `delivery-cancelled` and `work-abandoned` sit in both sets, and `RETURNING` claims more than they do

`packages/client/src/state/state.ts:666-679`, `state.ts:724-727`

`RETURNING.has(kind) || (REROUTING.has(kind) && held)`: any kind in `RETURNING` is read whether
held or not, so the held-only condition on `delivery-cancelled` and `work-abandoned` in `REROUTING`
never applies. Those two `REROUTING` entries are dead, and the `REROUTING` doc comment no longer
describes when they are read.

The `RETURNING` comment says these "make an item work again, wherever it was". That is false for a
cancellation or an abandoned delivery that leaves other routing records: the item stays processed.
Placement still comes out right (`belongs` keeps it off the queue). The cost is a read, plus a cache
entry in `state.items` for an unheld item that is still processed and usually outside every window.
`drawnFrom` will then draw it on a cache-drawn feed. That is correct data, but it grows the cache
on every cancellation across the pool.

Either drop the two kinds from `REROUTING` and reword `RETURNING` as "may make an item work again",
or accept the extra reads and say so. AGENTS.md says a comment that claims a guarantee must be one
the code enforces.

### 4. "Held" is a proxy for "own", and both the code and client.md state it as an identity

`packages/client/src/state/state.ts:713-718`, `docs/specs/client.md:626-629`

Apart from (1), a capture from another device that this client already read through a page read
(the reader switched to the feed, or `enter` re-read on return, before the watcher ticked) is held.
So it is neither read nor `arrived`, and no notice is raised. The shell spec promises one for
captures made elsewhere. Dropping the notice for something already on screen is arguably fine, but
then the spec should say "not already held", not "its own". The plan chose this proxy. The spec
sentence is what overstates it.

### 5. The watcher now waits for item reads before reporting

`packages/client/src/actions/watching.ts:108-111`, `packages/client/src/client.ts:212`

Behaviour checked:

- **Stop/teardown mid-await**: safe. `close()` aborts `closing.signal`, `rereadAll`'s request
  rejects, `.catch` swallows it, and `reported.next` on a completed RxJS `Subject` is a no-op.
  `again()` returns on `stopped`.
- **Errors**: a failed read is swallowed and the report still goes out, with `arrived` computed
  before the read. So client.md:637-638 ("a shell told of an arrival already holds it") is not
  guaranteed. When the read fails, or the pool left the id out (purged), the shell names an item
  it does not hold and links to one that may not exist. `action-log.test.ts` ("a capture not held
  is still said") accepts this. The spec should too. A rejection from `applied` itself would drop
  the report with the mark already advanced. `applied` cannot reject today, but the type allows it.
- **Latency**: every report that names a read now costs a second round trip, up to `TIMEOUT_MS`
  (30s) when the pool stalls. While it waits, `asking` stays true, so `ask()` is silently dropped.
  That is the call the shell makes 0.5/2/5s after a firing's window closes (shell.md:2107-2110,
  `StatusLine.svelte:258`). The tempo also restarts only after the reads. Most reads are one fast
  request on a LAN. On a phone over a poor link, the firing promise and "within one tempo" both
  degrade.

Worth deciding on purpose: bound the wait, or let an `ask()` that arrives during the read queue one
follow-up read rather than vanish.

### 6. The motion paragraph states as fact a guarantee nothing in the code enforces

`docs/specs/shell.md:2251-2254`, `docs/specs/shell.md:10`

"A row arriving above a reader scrolled into the list does not move what they are reading" depends
entirely on native `overflow-anchor`. Nothing in `apps/ui` sets or relies on it in code. The plan
records Safari as "still open after implementation", and the phone is mostly Safari. Rows also
slide in by animating height, so anchoring has to hold across frames. That was measured in Chromium
only. The plan is marked Done with this Unknown open, and the shipped entry (shell.md:10) repeats
the claim.

Either qualify the sentence ("where the browser anchors scrolling — Chromium, Firefox") until
Safari is checked, or keep the plan In progress. The plan's other Unknown, "an arrival placed above
the selected row … test it", has no test.

### 7. Test gaps

- `watching.test.ts` is unchanged. Nothing covers `applied` being awaited: report ordering against
  a slow read, `stop()` during the await, a failed read still reporting, or `ask()` dropped while
  reads are out.
- No test for (1) or (2).
- `rereadAll`'s chunking past 100 is untested. The watcher never reaches it (25 per page), so only
  a direct test would.
- Placement is tested only on the newest-first feed and the oldest-first queue. Nothing covers an
  oldest-first feed or a newest-first queue, where the spec sentence in (8) is wrong.
- The plan's Phase 3 list includes "no notice on a `more` read". That branch lives in
  `StatusLine.svelte:242-247` and `StatusLine.test.ts` does not exercise it. `arrivalOf` itself is
  never called on `more`, so its unit tests do not cover it either.
- The plan lists `client.test.ts` for Phase 2 tests, and it was not touched. Everything landed in
  `catching-up.test.ts`. That is fine, but the plan says otherwise.
- No test for a `delivery-cancelled` on an unheld item that stays processed (3).

---

## Minor

### 8. client.md's placement sentence hard-codes the default orders

`docs/specs/client.md:481-484` — "on the feed's head, and on the queue only once it has been read
to its end". The order is the reader's (CONTEXT.md, **Queue**), and `loaded` is direction-aware.
On an oldest-first feed an arrival appends only when exhausted, and on a newest-first queue it lands
at the head. A *returned* item (unarchive, abandoned delivery) is placed mid-window by rank, as the
test at `catching-up.test.ts` "puts an item unarchived elsewhere back on the queue" shows, and never
"once read to its end". Say "placed by rank where the window reaches", as the queue section already
does. shell.md:8's "lands on an open feed or queue … placed where it sorts" also overclaims for an
oldest-first queue that has not been walked to its end.

### 9. The revision skip is broader than "the edit that made it is this client's"

`packages/client/src/state/state.ts:710` — `unsent.has(subject)` skips a `revised` entry whenever
the *original* has any operation unsent: a tag, an archive, anything. A revision made on another
device while this client has a slow tag on the original is then never read or announced. Only the
next page read places it. Checking for an unsent `edit` on the subject would match the comment.

### 10. A read answered after `forgotten` or `rebuilt` re-caches into the emptied state

`packages/client/src/client.ts:397-401` — no generation check. A read sent before sign-out (or
before a pool identity change) and answered after it puts items back into `state.items`. `forgotten`
exists so the cache cannot outlive the session that drew it. Pages are reset and `unpositioned`, so
nothing is drawn as answered, but the items sit in the cache. This predates the PR (`reread`), and
the PR extends it to captures this client never held.

### 11. http-v1 wording and schema

- `docs/specs/http-v1.md:571` — "refused rather than clamped as a page's `limit` is" reads as if a
  page's limit were clamped. http-v1.md:637 says it is refused. Needs a comma: "…clamped, as a
  page's `limit` is."
- `apps/daemon/src/routes/definitions.ts:537` answers with `itemSliceSchema`, whose `next` is
  documented as "the next page". This route never pages. A `{ values }`-only schema would keep the
  OpenAPI document (and the generated client type) from suggesting otherwise.

### 12. `heldCapture` adds a second way to describe a held item

`apps/ui/src/components/status/StatusLine.svelte:209-218` — a synchronous
subscribe-then-unsubscribe on `client.held(item)`, which works only because `derived` over a
`BehaviorSubject` emits synchronously. The pattern appears nowhere else in `apps/ui`, and
`whichCapture` (same file, :154) already describes an item, asynchronously. Defensible (no network,
no ordering against `hear`), but a one-line reason would help if the synchronous emission is the
point.

---

## Non-issues

- **`PoolReads.items` is not in an explicit transaction** although the plan says "read in one
  transaction". `bun:sqlite` calls are synchronous within one tick, the same as the single `item`
  read (`one` → `hydrate`), so routing and assets are derived just as consistently.
- **`limit-too-large` reused for an id count.** Settled in the plan, documented in http-v1, and
  `limit` carries the count.
- **`/v1/items` and auth.** `authenticate` covers `/v1/*` except the open paths, so the bare
  collection path is not exposed.
- **`?id=` (empty) is an id.** It answers `200 { values: [] }`, the same as any id the pool does
  not hold.
- **A capture and a `template-fired` for it in one read.** `heard` reads it once via `captured`,
  and the answer's `routing` keeps it off the queue (tested).
- **`only: "arrived"`.** The newest arrival notice replaces the last, as shell.md says.
- **`c475f303 docs(todo): tick off shipped shell items`** rides on this branch, ticking items this
  PR did not touch. It is a separate commit, and the items it ticks exist on main (e.g. "Queue is
  empty.").
