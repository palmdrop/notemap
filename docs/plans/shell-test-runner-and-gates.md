# Shell test runner and verification gates

**Date**: 2026-08-17
**Status**: Done <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/client.md`
**Closed**: 2026-08-17

---

## Goal

> `apps/ui` is verified by the same commands as every other package: root `pnpm typecheck`,
> `pnpm lint`, `pnpm format:check` and `pnpm test` each cover it, CI runs them unchanged, and the
> shell's half of [client.md](../specs/client.md)'s acceptance criteria is asserted by tests rather
> than by hand.

This is finding 5 of [client-package-and-online-shell-2026-08-17.md](../reviews/client-package-and-online-shell-2026-08-17.md),
deferred off the `ui` branch, and it answers the Unknown
[client-package-and-online-shell.md](client-package-and-online-shell.md) left open — "Whether
`apps/ui` needs a test runner".

**What this plan is not.** The load-bearing state tests — optimistic apply, reconciliation,
rollback, drain order, operation-time ordering — live in `packages/client` and stay there. Neither
bug the review confirmed was in the shell, and a shell test runner would have caught neither. This
plan closes a verification hole; it does not move domain coverage into the app.

---

## Tasks

### Phase 0 — Branch

- [x] Create branch `agent/shell-test-runner-and-gates`.

### Phase 1 — Close the three gates that need no runner

Depends on: nothing. The shell is currently outside typecheck, lint **and** formatting; none of
that needs a test framework to fix, and CI picks all three up with no workflow change.

- [x] Add a `typecheck` script to `apps/ui` aliasing the existing `check`, so root `pnpm typecheck`
      stops reporting "10 of 11 workspace projects" and `.github/workflows/verify.yml` covers the
      shell. This is the invisibility Phase 1 of the previous plan fixed for `packages/client` and
      left standing for the app.
- [x] Add `eslint-plugin-svelte` and wire it for `**/*.svelte` in `eslint.config.js`. `eslint .`
      matches no `.svelte` file today, so every component in the repo is unlinted. The plugin's
      current release supports the repo's eslint and Svelte majors.
- [x] Add `prettier-plugin-svelte`. Prettier cannot infer a parser for `.svelte` at all, so
      `prettier --check .` skips every one silently — running it on a single file reports "No parser
      could be inferred" while the directory run passes.
- [x] Load `prettier-plugin-tailwindcss` from a prettier config. It is a devDependency of `apps/ui`
      that no config references, so class ordering in the shell is unenforced.
- [x] Clear whatever the three gates report on their first run.
- [x] `git commit`.

**Verify:** root `pnpm typecheck` runs `apps/ui` (the "10 of 11" line counts non-root workspace
projects, not coverage — it read the same before and after); `pnpm exec eslint` on a `.svelte` file
parses and reports rather than skipping; `pnpm exec prettier --check` on a `.svelte` file no longer
says "No parser could be inferred"; `pnpm lint`, `pnpm format:check` and `pnpm typecheck` are green;
CI is green on the branch.

### Phase 2 — Make the client substitutable in the shell

Depends on: Phase 1. This is the actual blocker, and it is a production change rather than a test
concern, so it lands and is verified on its own.

- [x] `apps/ui/src/lib/client.ts` exports a module-level singleton constructed at import time, and
      every component imports it directly. No test can give a component a different `Transport`
      without reaching around the module system.
- [x] Decide between Svelte context — the client created once in `+layout.svelte` and read by an
      accessor — and per-file module mocking. **Decided: module mocking** (2026-08-17). Context is
      the cleaner shape and remains the one client.md implies, but it touches every component on a
      branch whose point is verification, and a mocked module gives the tests the same substitution
      for now.
- [x] Whichever is chosen, stop components reaching for a module-level singleton, or record
      explicitly that they still do and why. **They still do**: `$lib/client.ts` constructs the
      ports at import time and every component imports that instance. Tests replace the module with
      `vi.mock("$lib/client")`, so the ports are substitutable from a test and nowhere else.
      Revisit when a second shell, or a second client instance in one shell, forces the injection.
- [x] `git commit`.

**Verify:** no production code changed, so there is nothing to re-verify by hand; `pnpm --filter
@notemap/ui check` and the gates from Phase 1 stay green.

### Phase 3 — Stand the runner up

Depends on: Phase 2. One smoke test only — this phase proves the harness, not the behaviour.

- [x] Add vitest to `apps/ui`, configured through the SvelteKit vite plugin so `$lib`, `$components`
      and Svelte 5 runes resolve the way they do in the app.
- [x] Add a DOM environment and a component testing library compatible with the workspace's vitest
      major. See Unknowns — browser mode is not free here.
- [x] Add a `test` script. CI's `pnpm test` is `pnpm -r test`, so the workflow needs no edit.
- [x] Stub the DOM gaps the current components already hit: `window.scrollTo`, which jsdom does not
      implement, and `navigator.onLine` plus the `online`/`offline` events `reachable.svelte.ts`
      listens for.
- [x] Write one test that renders a component against a mock `Transport`. `@notemap/client` already
      exports one from `./testing`; the shell should use that rather than mint a second.
- [x] `git commit`.

**Verify:** `pnpm --filter @notemap/ui test` green; root `pnpm test` runs it; CI green on the branch.

### Phase 4 — Cover the shell's acceptance criteria, and record the decision

Depends on: Phase 3. Only the criteria that are the shell's — what it draws, enables and disables.

- [x] A capture appears before the pool answers, and the form clears.
      `CaptureForm.test.ts` — "draws a capture before the pool answers, and clears the form".
- [x] A refusal is shown and can be dismissed.
      `Outbox.test.ts` — "shows what the pool refused, and lets it be dismissed".
- [x] Archive stays available with the pool unreachable, while routing and mark-processed are
      disabled and say why — the asymmetry client.md calls deliberate and requires be visible.
      `Queue.test.ts` — "archives with the pool unreachable, and disables what it cannot queue",
      driven by `navigator.onLine` and a transport that rejects, so `reachable()` is under test too.
- [x] The scroll mark restores a view on reload and never reaches the pool.
      `Queue.test.ts` — "puts the view back where the person left it, without asking the pool".
- [x] A typed note and a picture stamp different capture channels.
      `CaptureForm.test.ts` — "stamps a typed note and a picture with different channels".
- [x] Update the previous plan's Unknown to record what was decided, and add the Resolution entry for
      finding 5 to the review.
- [x] `git commit`.

**Verify:** each criterion above names a test that asserts it; `pnpm test`, `pnpm typecheck`,
`pnpm lint` and `pnpm format:check` green; CI green.

---

## Unknowns

- **Browser mode or jsdom.** **jsdom**, as the fallback said — but the vitest bump the plan ruled
  out happened anyway, because `apps/ui` is on vite 8 and vitest 3 bundles vite 7's types, so a
  `test` block in `vite.config.ts` fails `svelte-check` on mismatched plugin types. The whole
  workspace is on **vitest 4**: nothing configures a runner beyond `vitest run`, so none of what v4
  removed was in use, and all 650 tests passed unchanged. Version no longer blocks browser mode —
  what blocks it is wanting a real browser in CI, still the wrong trade for what these tests assert.
  Revisit if jsdom's gaps (no layout, no real scrolling, no `IntersectionObserver`) start costing
  more.
- **Context injection versus module mocking** (Phase 2). **Resolved: the fallback.** Each test file
  mocks `$lib/client`, no production code changed, and the shell keeps an import-time singleton —
  revisited when a second shell or a second client instance forces it.
- **How much the first lint and format runs report.** **Little.** Format: two files, five lines.
  Lint: fourteen errors of three kinds — DOM globals read as undefined, which is what
  typescript-eslint already turns off for `.ts` and `svelte-check` answers properly; and
  `svelte/no-navigation-without-resolve` on every link in the layout, which is a base-path rule for
  an app served from the origin root. Both are off for `**/*.svelte` with a note in the config, per
  the fallback. One commit, no reformat.
- **Whether SvelteKit's `$app/*` modules need stubbing.** **Not yet** — no component imports one and
  no test needed one.
- **Whether `reachable.svelte.ts` is drivable from a test.** **It is.** Redefining
  `navigator.onLine` and dispatching the event is three lines in the DOM setup, so the asymmetry is
  asserted through `Queue` with the browser offline rather than through `QueueItem`'s prop.
- **Whether `svelte-check` and `eslint-plugin-svelte` overlap enough to make one redundant.** **No
  overlap in what they reported** — the only place they met was `no-undef`, which the compiler
  answers better, so it is off for components. Both stay.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Phase 4 is the only phase that adds behavioural coverage, and it is deliberately narrow: what the
shell draws, enables and disables. Optimistic apply, reconciliation, rollback, in-order drain and
operation-time ordering are `packages/client`'s and are already covered there — duplicating them
through a DOM would be slower, more brittle and no more truthful.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above** (`docs/specs/client.md`), dated, describing at a
high level what landed and linking back to this plan. No implementation details, no granular tasks. A
plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will
flag. That entry should say that the shell's half of the acceptance criteria became executable, and
should not imply that any part of the client contract itself changed — none of it does here.
