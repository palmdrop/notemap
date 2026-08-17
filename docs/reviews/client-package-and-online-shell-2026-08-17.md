# Review: Client package and online shell

**Date**: 2026-08-17
**Status**: Resolved <!-- Open | Partially addressed | Resolved -->
**Scope**: `packages/client/`, `apps/ui/`, `apps/daemon/src/ui/`, `docs/specs/client.md`
**Plan**: `docs/plans/client-package-and-online-shell.md`
**Spec**: `docs/specs/client.md`

---

## Overall

The shape is right and the hard part is done well. The outbox engine is genuinely written once and
indifferent to the vocabulary; the ports are real seams rather than gestures; the deferred
operations are declared and refused rather than mocked; `Unreachable` and `Refused` are kept apart
everywhere it matters. Tests, typecheck, lint and `svelte-check` are all green (44 client tests,
190 daemon, 143 integration).

The `Shipped:` trail is complete and honest — `client.md` carries a dated entry that names what did
*not* land.

Two real bugs, both in the same place: **nothing maintains the queue list except the outbox**. A
route or a mark-processed leaves the item sitting in the queue, and an optimistic capture is
inserted into the loaded window rather than beyond its horizon. Both contradict acceptance criteria
the spec states and verify steps the plan claims were done. Both are confirmed against the code, not
inferred.

---

## Bugs

### 1. Routing and mark-processed leave the item in the queue

`apps/ui/src/components/queue/QueueItem.svelte:19`, `apps/ui/src/components/queue/RouteAction.svelte:71`,
`packages/client/src/surfaces/reads.ts:59`

Both call sites do the right thing by intent — `await client.routing.markProcessed(...)` then
`await client.loadQueue()` — but `loadQueue()` is *paginate forward*, not *refresh*:

```
loadMore() → if (page.loading || page.exhausted) return    // typical case: no-op
          → otherwise read the NEXT page and append it to the tail
```

Either way, `state.queue.ids` still names the routed item. Nothing in `createRouting` touches state,
and `settle()` — the only thing that takes an item out of the queue on the pool's say-so — is
reached from the outbox drain alone, which routing deliberately does not use. Confirmed:

```
loadQueue → ["one","two"] ; markProcessed("one") ; loadQueue → ["one","two"]   (expected ["two"])
```

This breaks `client.md`'s acceptance criterion "a processed item leaves the list" and the plan's
Phase 4 verify step "routing an item to a configured destination removes it from the queue" — which
is checked off.

Fix: on a successful `route` / `markProcessed` the client drops the item from the queue list — the
pool has decided it is processed, which is exactly the condition `settle()` already encodes. A
`refreshQueue()` that resets the page and re-reads would also work, but it throws away the loaded
window to fix one row.

### 2. An optimistic insert lands inside the loaded window, not beyond its horizon

`packages/client/src/state/apply.ts:54` (capture), `packages/client/src/state/apply.ts:117` (unarchive),
with `packages/client/src/surfaces/reads.ts:39`

`insertOldestFirst` ranks the new item against **the ids currently loaded**, so an item whose content
time is newer than everything loaded is appended to the tail of the *window*. The next page is then
appended after it:

```
loadQueue (page 1) → ["old-1"]           , after=p1
capture              → ["old-1", fresh]    ← fresh ranked against a 1-item window
loadQueue (page 2) → ["old-1", fresh, "old-2"]
```

Confirmed by test; `old-2` is older than `fresh` and sorts after it. The existing test
(`client.test.ts:219`) passes only because its queue is exhausted after one page.

The same applies to `applyUnarchive` and to `settle()`, which share the helper. Both are only correct
when the list is exhausted or the item's rank falls inside the window.

Fix: insert only when the rank falls inside the loaded window — `page.exhausted`, or rank below that
of the last loaded id. Otherwise cache the item and let a later page carry it, which is what the pool
would hand back anyway.

---

## Design

### 3. `client.md` restates core's queue rule and drops a third of it

`docs/specs/client.md:115` against `docs/specs/core.md:363`

client.md gives the reordering account as a closed pair, cited to `core.md#the-queue`:

> Every event that moves an item gives it a content time of now, placing it at the newest end […]
> every event that removes one hides it […] and the client renders that without special handling.

core.md names **three** kinds, and the third is the one this plan implemented:

> Returning is a third kind of event, neither a move nor a removal: it puts an item back at the
> content time it left with […] Unarchiving is one such event.

`applyUnarchive` correctly implements core.md's rule (it re-inserts at the item's unchanged rank),
and the plan's Phase 4 verify step says the same. So the code and core.md agree; the new spec is the
odd one out. "The client renders that without special handling" is also not true — `insertOldestFirst`
*is* the special handling.

Fix: add the returning case to client.md's queue section and drop the "without special handling"
claim.

### 4. Assets escape the `Transport` port

`packages/client/src/client.ts:47` and `packages/client/src/client.ts:99`

`assetContent()` hands the shell a bare URL string for the browser to fetch by itself, and
`uploadAsset()` builds a `Request` by hand — `new Request("/v1/assets")` throws outside a browser,
because a relative URL has nothing to resolve against. Every other call goes through `createApi`,
which lets openapi-fetch join `baseUrl` properly.

client.md says the client "speaks the HTTP surface through" the transport. A native shell that binds
something other than `fetch` — the whole reason the port exists — gets neither uploads nor images.
It is also why `uploadAsset` has no test: it cannot be exercised through `mockTransport` with the
same empty `baseUrl` the web shell uses.

Not urgent while there is one shell, but it is the port's first leak and worth naming before a second
shell finds it.

### 5. The shell is ungated: no tests, no lint, not in root `typecheck`

The plan's Unknown allowed skipping shell tests with the condition "say so, rather than claiming tests
that do not run" — but neither the plan nor the spec records that decision, and the plan is marked
Done. Both bugs above live at the shell/client seam.

Beyond tests:

- `eslint.config.js` has no `eslint-plugin-svelte`, so `eslint .` lints **no `.svelte` file** in the
  repo. The config gained a careful `no-restricted-imports` rule for `packages/client` in the same
  change, which makes the gap easy to miss.
- `apps/ui` has no `typecheck` script, so root `pnpm typecheck` runs "10 of 11 workspace projects" and
  silently skips the shell. `pnpm --filter @notemap/ui check` is the only gate and nothing at the root
  invokes it. This is the exact failure mode Phase 1 called out for `generated.d.ts` — "invisible only
  because `apps/ui` has no `typecheck` script" — fixed for the package and left standing for the app.

Fix: at minimum alias `typecheck` to `check` in `apps/ui/package.json` so the root command covers it.

**Deferred** (2026-08-17): not fixed on this branch. Carried whole into
[shell-test-runner-and-gates.md](../plans/shell-test-runner-and-gates.md). Widened there by one —
prettier has no `prettier-plugin-svelte` either, so `prettier --check .` skips every `.svelte` file
silently; run it on a single one and it reports "No parser could be inferred". Three gates open, not
two.

### 6. Nothing drains the outbox on reconnect

`apps/ui/src/lib/reachable.svelte.ts:14`

The shell already listens for `online`/`offline`. On `online` it flips a flag and does not call
`client.drain()`. So an operation that failed while the daemon was down stays `unreachable` until the
person mutates something else or finds the Retry button — and while it sits there, `reachable().yes`
is false, which disables routing and mark-done on *every* row in the queue.

client.md defers reachability-reporting to the offline slice, which is fair for a transport-level
signal. But the browser's own event is already wired here, and one line closes the loop.

### 7. The "already handed over" guard ignores `inflight`

`packages/client/src/outbox/outbox.ts:63`

`enqueue` decides an operation is still cancellable by reading `held.state !== "sending"`. `drain`
claims an operation into `inflight` synchronously but `send` writes `state: "sending"` a microtask
later. In that window an opposing `enqueue` drops the entry from the outbox — and `send` then runs
anyway with the captured `entry`, sends it to the pool, and `record()` re-adds it to the outbox
because it appends what it does not find.

Narrow — it needs two mutations inside one microtask turn, which a click cannot produce — but
`inflight` exists precisely to answer "has a drain already claimed this", and the guard does not
consult it. Fix: `inflight.has(held.id) || held.state === "sending"`.

### 14. A durable `ClientStore` would restore nothing

`packages/client/src/client.ts:31` — numbered after the minors because it was found answering a
question about offline capture, not in the first pass.

`ClientStore` has `readOutbox()` and `readItems()`. Neither has a caller anywhere in `createClient`.
`persistItems` mirrors the cache *out* to the store and `record()`/`drop()` mirror the outbox out;
nothing ever reads back. So swapping `createMemoryStore()` for a durable adapter would persist
faithfully and restore nothing — an unsent capture would still be gone after a reload.

That makes client.md's claim false as written:

> Because the seam is here from the first line, offline is a matter of wiring, not a rewrite.

Rehydration is not wiring, and `outbox.ts:30` already says why: reversals are closures, so an outbox
read back from a store has nothing to roll back to. Restoring an outbox forces the rollback question
before it can replay safely.

Offline capture today, stated plainly: it applies optimistically, survives an unreachable drain with
its optimistic state intact, and re-sends under its minted id exactly once — all tested. It does not
survive a reload, does not go on reconnect without a manual Retry (finding 6), and cannot carry an
asset, since `uploadAsset` is an unavoidable round trip for the id the capture references.

Fix: record it. An open question in client.md naming rehydration *and* the undo problem it forces,
so the offline plan inherits both rather than discovering the second one.

---

## Minor

### 8. A refusal becomes invisible on `/feed`

`apps/ui/src/routes/feed/+page.svelte` renders no `Outbox`, unlike `/` and `/queue`. A capture refused
after navigating there is rolled out of the feed with nothing said. There is also no way to dismiss an
`unreachable` entry (Outbox.svelte:24 offers Dismiss for `refused` only), so one stuck operation pins
`reachable().yes` false indefinitely — see finding 6.

### 9. "What an item says" is derived in the shell, twice

`apps/ui/src/components/item/Item.svelte:9` and `apps/ui/src/components/queue/QueueItem.svelte:12` each
re-derive `payload.content.text ?? payload.content.caption` with an identical `as string`. That is a
small piece of payload knowledge in the shell, which client.md forbids, and `client.images()` already
sits in the client for exactly this reason.

### 10. `HEAD` on an app path is a 404

`apps/daemon/src/ui/serve.ts:76` gates on `method !== "GET"`, so `curl -I /` falls through to the
not-found handler. Harmless for a browser; surprising for a health check.

### 11. An unparseable error body is treated as a refusal

`packages/client/src/api/http.ts:31` — a response with neither `error` nor `data` becomes
`Refused("empty-answer")`, which rolls the operation back permanently and does not retry. A proxy
answering 502 with HTML lands here, and "the pool said no" is the wrong reading of "something between
us dropped it".

### 12. Half of `RoutingApi` is unused and untested

`cancel` and `recordsFor` are implemented and exported, called by no shell code and covered by no test.
`recordsFor` is part of the item surface the shell has not built; `cancel` has no caller at all.

### 13. Two ways to say the same thing in `pnpm-workspace.yaml`

`allowBuilds: {esbuild: true}` and the newly added `onlyBuiltDependencies: [esbuild]` are the same
declaration under two keys.

---

## Non-issues

- **`sveltekit({...})` with no `svelte.config.js`** — kit 2.70's `sveltekit(config)` takes inline
  config and forwards unrecognised options to vite-plugin-svelte. `svelte-check` resolves
  `$components`, so it is being read.
- **`packages/client/src/api/generated.d.ts` tracked while `apps/ui/.gitignore` still ignores
  `generated.d.ts`** — the app no longer generates one; the stale ignore line is inert.
- **`applyArchive` undoes by index rather than by rank** — deliberate, and the comment says why: the
  pool breaks ties on its own key, so re-ranking a rolled-back item would shuffle it.
- **A refused capture is rolled fully out of the feed even on `capture-id-conflict`, where the pool
  does hold something under that id** — what it holds is not the body shown, so keeping the optimistic
  copy would be the bigger lie.
- **`Unencodable` thrown from both `applyOperation` and `sendOperation`** — the vocabulary is declared
  for the type, refused at both ends, and tested at both ends.
- **`ClientStore.readOutbox` / `readItems` have no caller** — they exist for the durable adapter and are
  exercised by the memory store's own test and by `client.test.ts:332`. Rehydration is the offline
  slice's.
- **`.prettierignore` widened from `apps/daemon/public/vendor/` to `apps/daemon/public/`** — nothing under
  `public/` is tracked; it is all build output.
- **`window.scrollTo` after one page load may not reach a deep mark** — the spec and the plan both say
  "roughly".

---

## Resolution

Addressed on `ui` under [client-review-fixes.md](../plans/client-review-fixes.md), alongside the
comments on PR #13.

1. **Fixed.** A successful `route` or `markProcessed` takes the item out of the queue in the client;
   core derives processed as holding no routing record, so the returned record is the pool's answer.
   Both shell `loadQueue()` calls are gone. Regression test confirmed failing beforehand.
2. **Fixed.** An optimistic insert lands only inside the window a page has read, keyed on the pool's
   own position (`<at>,<id>`) rather than the last loaded id — so it keeps answering once every row
   in the window has left. Applies to capture, unarchive and settle.
3. **Fixed.** `client.md` now names core's three kinds of event, including returning at unchanged
   content time, and says plainly that the returned case is the one the client places itself.
4. **Fixed.** `uploadAsset` goes through the typed client, joins `baseUrl` and is tested against the
   mock transport. Asset URLs are now `Transport.assetUrl` — the port answers where an asset's bytes
   are, because an `<img>` fetches for itself and carries no header a transport would add, so auth on
   a remote daemon breaks a concatenated URL just as a native shell does. What a non-browser shell
   puts behind it is an open question in client.md; the seam is not.
5. **Fixed** (2026-08-17), on `agent/shell-test-runner-and-gates` rather than here. All three gates
   reach the shell: `apps/ui` has a `typecheck` script the root command runs, eslint parses
   `.svelte` through `eslint-plugin-svelte`, and prettier through `prettier-plugin-svelte` — which
   also picked up the tailwind class sorter that was a devDependency no config referenced. The shell
   has a runner (vitest on jsdom) and the shell's half of client.md's acceptance criteria is
   asserted by it. The client stays an import-time singleton that tests replace with `vi.mock`;
   Svelte context is still the cleaner shape and is recorded as deferred, not rejected. Neither
   confirmed bug was in the shell, and no shell test would have caught either.
6. **Fixed.** The shell drains on the browser's `online` event. Rehydration — the larger half — is an
   open question in client.md naming the undo problem it forces.
7. **Fixed.** The opposing-operation guard consults `inflight`, so an operation a drain has claimed
   cannot be cancelled out before `send` records it. Regression test confirmed failing beforehand.
8. **Fixed.** The outbox surface is on `/feed`. An `unreachable` entry still offers only Retry, which
   the reconnect drain in 6 makes far less sticky; leaving it is deliberate, since dismissing one
   would discard a capture the person made.
9. **Fixed.** `client.says(item)` derives it once in the client; both components read that.
10. **Fixed.** `HEAD` is answered wherever `GET` is, with a test.
11. **Fixed.** A 5xx is `Unreachable`, 4xx stays `Refused`. Accepted consequence, stated at the time:
    a reproducible daemon 500 now retries on each drain.
12. **Fixed.** `recordsFor` and `cancel` have tests. `cancel` now returns the item to the queue at
    its unchanged content time — finding 3's third event — but only when the item holds no other
    record, because processed is derived rather than stored. It takes the item alongside the record,
    since the pool answers nothing on a cancel. No shell surface calls it yet; the client is correct
    ahead of the item surface that will.
13. **Fixed.** `onlyBuiltDependencies` removed; `allowBuilds` already said it.
14. **Recorded.** Rehydration is an open question in client.md, with the closure problem named so the
    offline plan inherits both halves. The shell comment that claimed a durable store was all offline
    needed from that file is corrected.

**From PR #13**, in the same pass: `uuid` replaces the hand-rolled v7 and `http-v1.md`'s note
arguing for hand-rolling is revised; the observable seam is RxJS behind a facade that hands out
observables with no `error` or `complete`, with an eslint rule keeping the subject types in one file;
refusal codes are typed off the generated document and all thirty-three have a reading, where
fourteen previously reached a person as `refused: <code>`; `robots.txt` disallows crawling; the
scaffold README is replaced. Comments that restated the code are gone and the ones answering a *why*
stayed.

**Since resolved**: the `outbox/encode.ts` and `state/apply.ts` switch shape, which was judged once
the rest had landed. Each operation now answers for itself behind a table the compiler checks; the
switches' real fault was the `default:` arm, which let a ninth kind compile and throw at runtime.

**Left standing, by agreement**, to be resurfaced when needed rather than planned now: the offline
slice (rehydration and a durable store), suggestions and enrichment, purge, and the item surface —
tags, enrichment state, suggestions and routing records drawn, which is what would give `cancel` and
`recordsFor` a caller.
