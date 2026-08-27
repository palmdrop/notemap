# Review: Import aliases, PR #33 as a whole

**Date**: 2026-08-27
**Status**: Resolved
**Scope**: `main...agent/import-aliases` — `packages/core`, `packages/client`, `apps/ui`,
`AGENTS.md`, `docs/reviews/import-aliases-2026-08-27.md`
**Plan**: none — stated in the PR body

---

## Overall

No bugs, and the mechanical claim holds: `pnpm -r typecheck`, `pnpm -r --silent test`,
`pnpm lint` and `pnpm format:check` are green on this branch, run here rather than taken from
the PR body. Nothing in the repo executes `packages/*/src` outside a bundler, so the `.ts`
extensions in the `imports` maps have no runtime path that could trip on them.

What is not settled is the convention. The in-diff review opened a doc/code disagreement and its
resolution closed it by narrowing the doc to "write the alias where one is declared". That
narrowing excuses folders with no alias — but 173 imports cross into folders that **do** have
one, in the two packages this PR aliased. The disagreement shrank from 339 to 173 and moved out
of sight; it did not go away. Decide whether that sentence is meant, because as it stands the
repo's most-copied example of the convention is the form the doc argues against.

---

## Bugs

None.

---

## Design

### 1. The narrowed rule is violated 173 times inside the packages that declare the aliases

`AGENTS.md:22`, `AGENTS.md:108` — "Prefer an alias … where one exists" and "Write the alias
where one is declared". Counting only crossings whose target folder is aliased:

```
packages/core    ../types  104 relative /  49 alias      ../utils    7 /  4
packages/client  ../api     34 /  8   ../state 9 / 10   ../testing 18 / 0   ../assets 1 / 2
```

The split is not a judgement about any of these imports. It is depth: files two levels deep
spelled it `../../` and were converted, files one level deep spelled it `../` and were not.
Inside one folder of one package:

```
packages/core/src/pool/edit.ts:6           import { ok, refused } from "../utils/result";
packages/core/src/pool/routing/route.ts:4  import { ok, refused } from "#utils/result";
```

The prior review's finding 1 is the same observation, and resolution 1 records it as fixed by
rewriting the doc. It isn't: the rewrite legitimises crossings into folders with **no** alias,
which is not the case these 173 are. Either the sentence means these should be converted, or it
should say what actually holds — that the alias is used where it was already used.

Fix: pick one and land it with the doc. Convert the 173 (mechanical, one package at a time), or
say plainly that both spellings are current inside an aliased package and the alias is not the
preferred form for existing code.

### 2. `packages/client`'s alias map records the sweep, not the traffic

`packages/client/package.json:11` — `AGENTS.md:108` says a folder earns an alias by being
"reached across often enough". Measured against that, the map is close to inverted:

```
aliased:      capture 1 crossing   assets 3   testing 18 (alias used 0 times)   api 42   state 19
not aliased:  outbox 13            ports 9    observable 6                      adapters 6
```

`#capture/*` exists for a single import; `outbox` and `ports` are reached across 22 times
between them and have nothing. The five folders that got aliases are the five that appear in the
`../../` sweep — which is a fact about file depth, not about which folders are reached across.
`packages/core`'s map does not have this problem (`types` 153, `utils` 11, `testing` 1 — the
three folders that are actually crossed).

Prior finding 3 called the maps "too partial" and resolution 3 declared partiality expected. The
issue is not that the map is partial, it is that the doc states a criterion the map was not drawn
by, so the next person adding an alias has no example to follow.

---

## Minor

### 3. `#testing/*` is declared and never used

`packages/client/package.json:16` — zero importers, while 18 relative crossings into
`src/testing/` stand. Dead manifest entry; either use it or drop it.

### 4. The in-diff review is marked Resolved with an open finding

`docs/reviews/import-aliases-2026-08-27.md:4` — **Status: Resolved**, but resolution 8 reads
"**Open.** No ADR written." The template makes Status the thing that says whether a review is
done. One open item under a Resolved header means the header can't be trusted, and reviews are
the only record of what was decided and deferred here.

Fix: `Partially addressed`, or write the ADR.

### 5. The `imports`-vs-`paths` reasoning is still in AGENTS.md

`AGENTS.md:114-118` — carried from prior finding 8, still open. Four resolvers were weighed
(tsc, Vite, esbuild, vitest), one option was rejected with a reason, and the app was made an
exception. That is the shape the project's own rules send to `docs/adr/`, leaving AGENTS.md the
rule. The PR is where it would land with the code.

---

## Non-issues

- **Toolchain resolution of `#…`** — confirmed independently here for typecheck, vitest and
  lint; build and `test:stack` taken from the prior review, not re-run. `imports` under
  `moduleResolution: bundler` resolves for tsc, and `svelte-kit sync` writes `$testing` into
  `.svelte-kit/tsconfig.json`.
- **`.ts` in the map values** — `scripts/seed.ts` does run under plain Node, but it reaches
  `@notemap/seed`, which drives the daemon over HTTP and imports neither package. Everything
  that loads `packages/*/src` goes through esbuild, Vite or vitest, so Node's own resolver never
  sees a `#…` specifier.
- **Sibling relatives kept** — `../handler`, `../actions`, `../destinations/usability` stay
  relative because they do not cross a top-level folder. Correct.
- **`$testing` reaches the production bundle** — recorded in the prior review as known and
  unchanged; nothing in `src/routes` or `src/components` imports it.
- **`#api/*` cannot reach `src/api/generated.d.ts`** — recorded and declined; `api/types.ts`
  re-exports it as a sibling.
- **`apps/daemon` has no `imports` field** — under "where one exists" its relative crossings are
  correct. A manifest for it is its own change.

---

## Resolution

Settled by sweeping rather than by narrowing the doc again. The earlier review chose the
opposite and its resolutions 1 and 3 stand as what was known then; this supersedes them.

1. **Fixed.** 195 imports rewritten — every crossing into a folder its package aliases now goes
   through the alias, in both `packages/core` and `packages/client`. Purely mechanical
   (`../types/` → `#types/` and so on), and nothing was converted that stays inside a folder:
   `../handler`, `../actions` and `../destinations/usability` are untouched. `AGENTS.md:104-113`
   now says that the sweep is what holds the preference up, in place of the earlier claim that
   the tree still reaches across relatively.
2. **Fixed.** `#outbox/*` and `#ports/*` added to `packages/client/package.json`, the two
   folders whose traffic earned one. Every entry in both maps now has importers — client:
   `#api` 42, `#state` 19, `#testing` 18, `#outbox` 13, `#ports` 9, `#assets` 3, `#capture` 1;
   core: `#types` 153, `#utils` 11, `#testing` 1. `adapters` and `observable` (6 crossings each)
   were left relative deliberately.
3. **Fixed** by the sweep. `#testing/*` has 18 importers now that the crossings into
   `src/testing/` were converted; it was dead only because those imports were the ones left
   spelled `../`.
4. **Fixed.** `docs/reviews/import-aliases-2026-08-27.md` was flipped to `Partially addressed`
   while its finding 8 stood, and back to `Resolved` once 5 below closed it.
5. **Fixed.** `docs/adr/0025-cross-folder-aliases-live-in-the-imports-field.md` records why
   `imports` beats tsconfig `paths` here, why the app is the exception, and why the two sigils
   are not a choice. `AGENTS.md:104-113` keeps the rule and points at it, down from twenty-one
   lines to nine.

Verified after the sweep: `pnpm -r typecheck`, `pnpm -r --silent test`, `pnpm lint`,
`pnpm format:check`, `pnpm build` and `pnpm test:stack` (8 files, 15 tests) all pass.
