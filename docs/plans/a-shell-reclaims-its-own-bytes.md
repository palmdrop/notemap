# A shell reclaims its own bytes

**Date**: 2026-10-11
**Status**: Done
**Spec**: `docs/specs/client.md`
**Closed**: 2026-10-11

---

## Goal

> A client started against a store holding blobs no operation names lets them go itself, so neither
> shell needs a script or a console snippet to tidy up after a bug that left some.

---

## Decisions

Settled with the developer on 2026-10-11, from the questions the
[previous branch](an-edit-lets-go-of-its-bytes.md) closed with:

1. **`ClientStore` answers what blobs it holds**: `blobs()`, yielding `{ asset, at }`, where `at` is
   when the **store** wrote them rather than anything the file says about itself. The port has had
   no way to be asked this, which is why the reclaim had to live outside the client.
2. **A grace window, for the reason the pool's reclaim has one.** The bytes are written before the
   operation that names them, so to a walk running at the wrong instant named and about-to-be-named
   look alike — and two tabs share one store, so the instant is reachable without a crash.
3. **At hydration, once per client.** Nothing creates an orphan by design any more, so a process
   start is often enough; a periodic walk would be a second mechanism for a case that should not
   recur. It never blocks `ready` and never rejects it: a store that cannot list is reported.
4. **The rule is `heldBy`'s inverse.** Hydration already rebuilds `state.held` from the assets its
   outbox names (`state/hydrate.ts:92`); the reclaim takes what that walk did not.
5. **IndexedDB records the write time**, so its `blobs` value becomes `{ file, at }` and the schema
   goes to version 4. A row an older version wrote has no `at` and reads as written long ago, which
   is the safe reading: it predates this client, so it is either named or an orphan from before.
6. **Only after the previous branch.** With attach-at-pick, an edit open in another tab held
   unnamed bytes for as long as it was open, and this walk would have taken them.

---

## Tasks

- [x] Create branch `agent/a-shell-reclaims-its-own-bytes`

### Phase 1 — The store says what it holds

Depends on nothing.

- [x] `ClientStore.blobs()` in `packages/client/src/ports/store.ts`, answering
      `readonly { asset: AssetId; at: string }[]`.
- [x] The filesystem adapter walks `blobs/`, reading `at` from the bytes file's mtime, and skips a
      directory holding no record.
- [x] The IndexedDB adapter stores `{ file, at }` under version 4, reads the file back out of it,
      and treats a value an older version wrote as a bare file written long ago.
- [x] The memory adapter records when it wrote, off a clock a test can drive — a grace window
      cannot be tested against an adapter whose write time is the wall clock's.
- [x] Commit

**Verify:** `pnpm --filter @notemap/client test`. Each adapter answers what it was given, with an
`at` that moves forward on a second write of the same asset; the IndexedDB one reads a bare file
back and answers an `at` in the distant past for it.

### Phase 2 — The client lets go of what nothing names

Depends on phase 1.

- [x] A grace window, beside the walk that reads it in `packages/client/src/assets/reclaim.ts`
      rather than beside `HISTORY`: it bounds held bytes, not what the cache keeps.
- [x] After hydration, the client lists the store's blobs, drops every one its outbox names and
      every one inside the grace window, and removes the rest — reported through `onError` rather
      than thrown, and never delaying what `ready` resolves.
- [x] Commit

**Verify:** `pnpm --filter @notemap/client test`. A client built over a store holding one blob an
operation names, one orphan written long ago and one orphan written now keeps the first and the
third and takes the second; a store whose `blobs()` throws leaves a working client and one report.

### Phase 3 — Docs

Depends on phases 1 and 2.

- [x] `client.md`: the store's answers gain `blobs()`, and a `Shipped:` entry says a client lets go
      of what nothing names.
- [x] `running.md`: the browser no longer needs the console snippet — opening the shell is what
      reclaims. Say what the script is still for, which is a store whose shell you would rather not
      start.
- [x] `docs/todo.md`: the line about bytes earlier versions left, closed.
- [x] Commit

**Verify:** `grep -n "blobs()" docs/specs/client.md` finds the port's new answer described.

### Phase 4 — Close out

Depends on every phase above.

- [x] `pnpm typecheck`, `pnpm -r --silent test`, `pnpm lint`, `pnpm test:stack`.
- [x] Status to `Done`, and the `Shipped:` entry dated.
- [x] Commit

**Verify:** all four clean.

---

## Unknowns

- **Whether a bare-file row should read as old or as unknown.** Decision 5 says old, which makes
  the first run after the upgrade able to take what earlier versions left — the whole point. The
  risk it carries: a blob written seconds before the upgrade, by a capture still in flight, has no
  `at` and is inside no grace window. It is named by its operation, so the outbox covers it; the
  gap is only a blob written before the operation was recorded *and* an upgrade in between.
- **Two clients over one store.** Raycast builds one per command, each hydrating, so two commands
  at once both walk. Removing a blob the other has already removed is `force: true` on one side and
  a `delete` of a missing key on the other; neither is an error. Nothing holds a lock, which is the
  same stance the outbox's lease takes about files rather than about blobs.
- **Found in phase 2: two clocks, again.** The client reads `now` off its injected clock and the
  memory store was writing the wall clock's, so a stopped-clock test saw every blob as written in
  its future and reclaimed nothing. `createMemoryStore` takes a clock now. The filesystem adapter
  still answers the filesystem's, which is the same thing the daemon's reclaim had to backdate
  files for.
- **Whether `openReader` should reclaim at all.** It is over a memory store, so its walk finds
  nothing. If it ever moves to the extension's directory, this becomes a question.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The grace window is the assertion that matters: a test that only checks an old orphan is taken
would pass against a walk that takes a blob a capture is one `await` away from naming.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed
and linking back to this plan. No implementation details, no granular tasks. A plan marked Done
whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
