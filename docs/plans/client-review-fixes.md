# Client review fixes

**Date**: 2026-08-17
**Status**: Todo <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/client.md`, `docs/specs/http-v1.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> Every finding of [client-package-and-online-shell-2026-08-17.md](../reviews/client-package-and-online-shell-2026-08-17.md)
> and every comment on PR #13 is resolved or explicitly recorded as deferred, and the specs that
> disagree with the code are corrected in the same change.

Two exceptions, both deferred with a home rather than dropped:

- **Finding 5** — the shell's verification gates and test runner, carried into
  [shell-test-runner-and-gates.md](shell-test-runner-and-gates.md).
- **The operation switch shape** (`outbox/encode.ts`, `state/apply.ts`) — raised on the PR, and the
  previous plan's own Unknown anticipated it. Taken up after these fixes land, when the switches can
  be judged at their real size rather than their current one.

Work happens on `ui`, not a fresh branch: these are corrections to open PR #13, and they belong on
the branch that PR reviews.

---

## Tasks

### Phase 1 — The observable seam becomes RxJS

Depends on: nothing. Foundational — every later phase touches files this one rewrites, so it goes
first and alone.

- [ ] Add `rxjs` to `packages/client`. Rewrite `observable/observable.ts` over `BehaviorSubject`.
- [ ] **Keep the subject private and hand out `Observable<T>`.** `error()` and `complete()` are
      `Subject`'s, not `Observable`'s, so no holder of an exposed surface can terminate one. This is
      the guard, and it is a type rather than a discipline.
- [ ] Give `derived` a change guard so a surface stops recomputing when an unrelated part of
      `ClientState` moves.
- [ ] Rewrite `state/persist.ts` over operators — it currently detects change by comparing against a
      captured variable and orders writes through a rolling promise, both of which are operators.
- [ ] Add a `no-restricted-imports` rule barring the subject types from anywhere but
      `src/observable/`, in the idiom `eslint.config.js` already uses for `packages/core` and
      `packages/client`. Operators stay importable everywhere.
- [ ] Keep the state subject and any effect stream separate objects, so a failing drain cannot take
      state with it.
- [ ] `git commit`.

**Verify:** `pnpm --filter @notemap/client test` and `typecheck` green; `pnpm --filter @notemap/ui check`
green with the shell's `$feed`/`$queue` untouched; tests pin that a throwing subscriber neither tears
down the subscription nor blocks the other subscribers, and that a projection is not recomputed when
an unrelated slice of state changes.

### Phase 2 — The two queue bugs, and the drain guard

Depends on: Phase 1.

- [ ] **Finding 1.** A successful `route` or `markProcessed` takes the item out of the queue — the
      pool has decided it is processed. Delete both shell `loadQueue()` calls that were standing in
      for this. `cancel` returning an item to the queue stays unfixed and recorded (finding 12).
- [ ] **Finding 2.** An optimistic insert lands in the queue list only when its rank falls inside the
      loaded window; beyond the horizon it is cached and left for a later page to carry. Applies to
      capture, unarchive and the settle path alike.
- [ ] **Finding 7.** The opposing-operation guard consults `inflight` as well as the recorded state,
      so an operation a drain has already claimed cannot be cancelled out from under it.
- [ ] `git commit`.

**Verify:** a test per finding — routing removes the row; a capture made against a partially loaded
queue does not sort ahead of an older item arriving on the next page; an operation claimed by a drain
is not dropped by an opposing enqueue.

### Phase 3 — Refusals get a type and a reading

Depends on: Phase 1.

- [ ] **PR comment on `errors.ts`.** Derive the refusal-code union from the generated document rather
      than hand-listing it, so a code the daemon adds cannot silently fall through. See Unknowns for
      the fallback if the type-level walk does not hold.
- [ ] Give the codes that currently have no sentence one. Twelve reach the person as
      `refused: <code>` today, one of which a test asserts as expected output.
- [ ] **Finding 11.** A 5xx becomes `Unreachable` — the pool did not decide — while 4xx stays
      `Refused`. Accepted consequence: a reproducible daemon 500 now retries on each drain.
- [ ] `git commit`.

**Verify:** removing a sentence fails typecheck; a 502 leaves the operation in the outbox with its
optimistic state, a 422 rolls it back.

### Phase 4 — The remaining findings and PR comments

Depends on: Phases 1–3. Independent of each other; grouped because each is small.

- [ ] **PR comment on `uuid.ts`.** Take the dependency, drop the hand-rolled v7, and rewrite the
      `http-v1.md` note that argued for hand-rolling.
- [ ] **Finding 4.** `uploadAsset` goes through the typed client so it joins `baseUrl` like every
      other call and can be tested against a mock transport. `assetContent` stays a hole and becomes
      an open question in client.md.
- [ ] **Finding 6.** The shell drains on the browser's `online` event.
- [ ] **Findings 8–10, 12, 13.** The outbox surface on the feed route; the item's text derived in the
      client rather than twice in the shell; `HEAD` answered where `GET` is; tests for the two
      untested routing calls; the duplicated pnpm workspace key.
- [ ] **PR comments.** `robots.txt` disallows crawling; `README.md` says what the app is in a few
      lines; comments that restate the code go, comments that answer a *why* the code cannot stay.
- [ ] `git commit`.

**Verify:** `uploadAsset` has a test against the mock transport; going offline and back drains
without a click; `curl -I` on the app root answers 200.

### Phase 5 — The specs catch up

Depends on: Phases 1–4. Last, so it describes what actually landed.

- [ ] **Finding 3.** client.md's queue section gains core.md's third kind of event — returning, at
      unchanged content time — and loses the claim that the client needs no special handling for it.
- [ ] client.md's framework-agnosticism constraint changes from "no reactivity library" to nothing
      framework-tied, and records the `Observable`-not-`Subject` guarantee as the reason a shared
      reactive dependency is safe here.
- [ ] **Finding 14.** An open question for rehydration, naming the undo problem it forces — an outbox
      read back from a store has no reversals, because they are closures.
- [ ] An open question for asset URLs escaping the transport.
- [ ] Fill the review's Resolution section, one entry per finding, and set its Status.
- [ ] `git commit`.

**Verify:** every finding number appears in the review's Resolution; no spec still states something
the code contradicts.

---

## Unknowns

- **Whether the refusal-code union can be walked out of the generated types.** The codes are there as
  literal unions, but per response rather than as a named schema, so the walk crosses `paths`,
  methods, statuses and content types. Fallback: hand-write the union and add a test that reads
  `apps/daemon/openapi.json` and fails when it holds a code the union does not. That fails loudly on
  the daemon adding one, which is the property actually wanted.
- **Whether `derived`'s change guard can be cheap and correct.** The projections rebuild their arrays
  each time, so identity comparison alone will never match. Fallback: compare element identity and
  length rather than deep-compare, and if that is still wrong, drop the guard — it is an efficiency,
  not a correctness fix, and finding 2's fix matters more.
- **Whether exposing `Observable` in the client's public types drags rxjs into the shell's
  resolution.** It is a type-only reference through a workspace dependency. Fallback: keep the
  package's own structural `Readable<T>` as the public seam and let rxjs stay internal, which costs
  the shell nothing but the ability to pipe.
- **Whether taking an item out of the queue on a routing record is right for every record state.**
  core.md derives processed as holding *no* routing record, so a pending delivery counts. Fallback: if
  a refused or cancelled record turns out to leave the item in the queue, key the removal on the
  record's state rather than its existence.
- **How much the comment strip touches.** The line between restating and answering a *why* is a
  judgement made per comment. Fallback: err toward removal — AGENTS.md makes comments the exception —
  and let the PR argue back on any that should have stayed.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Both confirmed bugs were reachable from `packages/client` alone, and their regression tests belong
there rather than in a shell the next plan gives a runner. Phase 1's tests are about the seam's
guarantees — a throwing subscriber, an unrelated state change — not about RxJS, which is not ours to
test.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

_This plan is the exception its Goal names: the work lands on `ui`, the branch of the open PR these
findings were raised against, rather than on a branch of its own._

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above** (`docs/specs/client.md`, `docs/specs/http-v1.md`),
dated, describing at a high level what landed and linking back to this plan. No implementation
details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error
the `review` skill will flag.
