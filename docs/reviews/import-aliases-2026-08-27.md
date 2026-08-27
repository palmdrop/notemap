# Review: Import aliases (`imports` field / `$testing`)

**Date**: 2026-08-27
**Status**: Resolved
**Scope**: `5810803..e598a50` — `packages/core`, `packages/client`, `apps/ui`, `AGENTS.md`
**Plan**: none — these changes were made without one

---

## Overall

Mechanically this is clean and it does not threaten builds, deployments or CI. Every gate
passes on the branch: `pnpm -r typecheck`, `pnpm lint`, `pnpm format:check`,
`pnpm -r --silent test`, `pnpm test:stack` (8 files, 15 tests) and `pnpm build` for both the
SvelteKit app and the daemon's esbuild bundle. The `#…` specifiers resolve under all four
resolvers that matter here — tsc on `moduleResolution: Bundler`, Vite/SvelteKit, esbuild 0.28,
and vitest — which was the open question and is now answered.

The problem is elsewhere. AGENTS.md now states the convention as universal — "reach across a
top-level `src/` folder through the alias", "Never `../../`" — and the code follows only the
mechanical half of it. 339 imports still cross a top-level `src/` folder relatively, they just
spell it `../` instead of `../../`. `apps/daemon`, the largest source tree in the repo, has no
`imports` field at all. That is a doc/code disagreement, which is the one thing AGENTS.md says
is not loose.

---

## Bugs

None.

---

## Design

### 1. The stated rule is not the rule the code follows

`AGENTS.md:22`, `AGENTS.md:101` — the doc says crossing a top-level folder under `src/` goes
through an alias. What actually got converted is the `../../` *spelling*, which only ever
appeared in files two levels deep. Files one level deep cross the same boundaries and were left
alone:

```
packages/core/src    111  e.g. pool/edit.ts:7  → "../utils/result"
packages/client/src  126  e.g. state/hydrate.ts:13 → "../assets/assets"
apps/daemon/src      102
```

`packages/core/src/pool/routing/route.ts` now reads `#utils/result` while
`packages/core/src/pool/edit.ts` reads `../utils/result` — the same import, in the same package,
one folder apart. A reader can't tell which form is current.

Fix: pick one. Either finish the conversion across all three trees, or narrow the doc to the
decision that was actually made and shipped ("never `../../`") and drop the top-level-folder
framing.

### 2. `apps/daemon` is exempt from a rule written as universal

`apps/daemon/package.json` — no `imports` field, while `apps/daemon/src` has 24 top-level
folders (`routes`, `schemas`, `middleware`, `errors`, `types`, `utils`, `work`, …) and 102
cross-folder relative imports. This is exactly the shape the convention was written for, and
it's the one package that can't use it.

### 3. The alias maps are too partial to follow the rule from

`packages/core/package.json:10`, `packages/client/package.json:11` — core aliases `types`,
`utils`, `testing` but not `mirror` or `pool`. Client aliases 5 of its 15 top-level folders;
`adapters`, `destinations`, `observable`, `outbox`, `pool`, `ports`, `routing` and `surfaces`
have no alias. Someone reaching from `src/pool` into `src/outbox` and trying to follow AGENTS.md
finds there is no alias to use and no rule saying that's expected.

Fix: either the map names every top-level folder, or the doc says aliases exist for the folders
that are reached across and relative is correct for the rest.

### 4. Nothing enforces it

`eslint.config.js` has no `no-restricted-imports` for `../../` or for cross-folder patterns. CI
runs lint on every push, so the hook exists. A convention that lands with 339 standing
violations and no check regresses by default — the next agent reading `pool/edit.ts` copies the
relative form, correctly, because that's what the neighbouring code does.

---

## Minor

### 5. The changed test files still contain `../../`

`apps/ui/src/components/capture/CaptureRow.test.ts:8` imports `$testing/pool`, and `:11` still
reads `vi.mock("$lib/client", () => import("../../testing/pool"))`. Same in `Feed`, `Order`,
`Refusals`, `Queue`, `RoutingComposer` and `settings` tests;
`apps/ui/src/lib/reachable.test.ts:10` has the `../testing/pool` form. Both spellings resolve to
the same absolute id so the mock identity holds and the tests pass — this is cosmetic. But it is
`../../` surviving in the exact seven files the commit was about.

### 6. `$testing` is a SvelteKit alias, so it applies to the production bundle

`apps/ui/vite.config.ts:30` — the alias isn't test-scoped. Nothing in `src/routes` or
`src/components` imports it today, and the previous `../../testing/` path was the only thing
discouraging that. Worth knowing rather than worth changing.

### 7. `#api/*` can't reach a `.d.ts`

`packages/client/package.json:12` maps `#api/*` to `./src/api/*.ts`, so `#api/generated` misses
`src/api/generated.d.ts`. Nothing needs it — `src/api/types.ts` re-exports it as a sibling — but
the map has a silent hole where the generated types live.

### 8. No ADR for the part that is reasoning

`AGENTS.md:105-111` weighs `imports` against tsconfig `paths` and says why the app is the
exception. That is ADR-shaped: it records what was known and what was traded. Per the project's
own rules the reasoning belongs in `docs/adr/`, with AGENTS.md keeping only the rule.

---

## Non-issues

- **`#…` resolution across the toolchain** — verified end to end. tsc resolves `imports` under
  `moduleResolution: Bundler`; Vite resolves it for a workspace-linked package compiled from
  source; esbuild 0.28 resolves it while bundling `@notemap/core` into `dist/main.js`. All four
  builds and both test suites are green.
- **Docker and CI** — untouched. The Dockerfile's `COPY . .` + `pnpm build` is the same build
  that passes locally, and `imports` is a manifest field that `pnpm fetch` and
  `pnpm install --offline` do not read. Not executed here: no Docker daemon on this machine.
- **Sibling and within-folder relatives kept** — `../destinations/usability`, `../handler`,
  `../actions` stay relative because they don't cross a top-level `src/` folder. That is the
  rule working, not an oversight.
- **`$testing` declared in `sveltekit({ alias })`** — this repo has no `svelte.config.js`;
  `$components` already lives there and `svelte-kit sync` writes `$testing` into
  `.svelte-kit/tsconfig.json`, so `svelte-check` sees it (711 files, 0 errors).

---

## Resolution

<!-- Superseded on findings 1 and 3 by docs/reviews/import-aliases-pr-2026-08-27.md,
     which swept the code instead. Left as it stood. -->

Settled by narrowing the doc rather than sweeping the code: the alias is a preference applied
where one is declared, and the 339 relative crossings stand as correct until a folder earns an
alias. `AGENTS.md:22` and `AGENTS.md:101-114` were rewritten to say that, including that nothing
checks it.

1. **Fixed.** AGENTS.md no longer claims every crossing goes through an alias. It states the
   preference, that the alias has to exist to be used, and that converting the rest is its own
   change rather than something to do in passing.
2. **Won't fix.** `apps/daemon` has no `imports` field, so under "where one exists" its 102
   relative crossings are correct. A manifest for it is a separate change if the daemon's
   folders turn out to be reached across often enough to earn one.
3. **Won't fix.** The partial maps are now the expected state, not a gap — a package names the
   folders it aliases and stops there.
4. **Won't fix.** No lint rule, deliberately. Both shapes were prototyped: a depth rule
   (`no-restricted-syntax` on `^\.\./\.\.`) cost 8 errors, a boundary rule keyed to each file's
   depth cost 345. Enforcement would have hardened a preference into a law and forced the sweep
   the doc now says not to do. Worth knowing if it is revisited: `no-restricted-imports` does not
   see dynamic `import()`, and its options do not merge across flat-config blocks, so a new entry
   overlapping `packages/core/**/*.ts` would silently replace the node-builtin ban at
   `eslint.config.js:76`.
5. **Fixed.** The seven `vi.mock` factories now read `import("$testing/pool")`, and
   `apps/ui/src/lib/reachable.test.ts` reaches `$testing/pool` and `$testing/dom`. Left alone:
   `apps/daemon/src/docs/docs.test.ts:3` reaches `../../scripts/vendor-swagger.ts`, outside `src/`
   entirely, where no alias exists or would help.
6. **Won't fix.** Recorded, not changed. `$testing` is reachable from app code and would ship if
   imported; nothing imports it.
7. **Won't fix.** `#api/*` still misses `src/api/generated.d.ts`. Nothing reaches it across a
   folder, and adding a map entry for a file with one sibling consumer buys nothing.
8. **Fixed.** `docs/adr/0025-cross-folder-aliases-live-in-the-imports-field.md`. AGENTS.md
   keeps the rule and points at it.
