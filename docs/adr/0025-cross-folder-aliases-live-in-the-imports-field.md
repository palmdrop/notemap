# 25. Cross-folder aliases live in the `imports` field

**Date**: 2026-08-27
**Status**: Accepted
**Deciders**: palmdrop

---

## Context and problem statement

Source is grouped by concern, in folders under `src/`. Reaching from one of those folders into
another meant counting `../` segments, which says nothing about what is being reached and has to
be rewritten by hand whenever a folder moves.

An alias fixes that, and every alias needs a resolver that agrees with it. Here that is not one
resolver but four, because the workspace packages **export TypeScript source rather than a build
artifact**: `@notemap/core` and `@notemap/client` name `./src/index.ts` in their `exports`, so
whoever consumes them compiles their `src/` themselves. The daemon's esbuild bundle, the app's
Vite build, vitest and `tsc --noEmit` all read these files directly, and none of them reads a
dependency's tsconfig.

Where does an alias have to be written so that all four honour it?

---

## Decision drivers

- The alias must resolve for a **consumer** compiling a dependency's source, not only for that
  dependency's own typecheck. This is what rules out anything scoped to a package's tsconfig.
- No per-toolchain configuration. An alias that needs an entry in esbuild's options, Vite's
  `resolve.alias`, vitest's config and tsconfig `paths` is four places to forget.
- The app is not like the packages. SvelteKit owns resolution there, ships `$lib` and `$app`
  already, and generates `.svelte-kit/tsconfig.json` from its own alias config.
- Nothing should have to run to make an alias work. `pnpm install` and an editor opening a file
  cold should both see the same map.

---

## Considered options

1. **tsconfig `paths`** — the familiar form, `@/*` or `~/*` mapped in each package's tsconfig.
2. **Package `imports`** — the `imports` field of the package's own `package.json`, keys
   beginning with `#`.
3. **Per-bundler alias config** — an alias table repeated in the esbuild script, `vite.config.ts`
   and vitest's config.

---

## Decision outcome

Chosen: **`imports`**, because it is the only one of the three that a consumer honours while
compiling someone else's source. Node's resolution algorithm keys a `#…` specifier to the nearest
`package.json` of the **importing file**, so `#types/domain/ids` inside `packages/core/src` finds
`packages/core/package.json` no matter who is doing the compiling. esbuild, Vite, vitest and tsc
under `moduleResolution: bundler` all implement it, and the manifest is a file every one of them
already opens.

The app is the exception. `apps/ui` keeps its aliases in `vite.config.ts` beside `$components`,
because SvelteKit owns resolution there and writes them into the generated tsconfig itself.

That exception is also where the two sigils come from, and neither is a preference: an `imports`
key **must** begin with `#` — Node requires it so an internal specifier cannot be mistaken for a
package name — and SvelteKit's own are `$lib` and `$app`, which cannot be renamed. `@` was never
available: npm scopes own it, and `@types/*` is a real namespace that a `@types`-shaped alias
would shadow. Whoever owns resolution names the alias.

### Consequences

- **Good** — one map per package, honoured by every toolchain that compiles it, with nothing to
  keep in sync and nothing to generate.
- **Good** — `#` marks a specifier as package-internal. It cannot be imported from outside the
  package, which is what it is.
- **Bad** — two spellings in one repo, `#` in the packages and `$` in the app. A reader has to
  know which package they are in.
- **Bad** — `imports` is less familiar than tsconfig `paths`, and its values are literal paths:
  `#api/*` mapped to `./src/api/*.ts` cannot reach `src/api/generated.d.ts`.
- **Neutral** — an alias exists only where a package declares one. `apps/daemon` declares none,
  and its cross-folder imports are relative and correct.

---

## Pros and cons of the options

### tsconfig `paths`

- **Good** — familiar, and editors pick it up with no plugin.
- **Bad** — it does not survive being consumed. The daemon's esbuild and the app's Vite build
  compile `packages/*/src` directly and neither reads those packages' tsconfig, so a `paths` entry
  would typecheck and then fail to bundle.
- **Bad** — tsc-only. vitest, esbuild and Vite each need their own copy of the same table.

### Package `imports`

- **Good** — resolved by the manifest, so it works for a consumer compiling the source.
- **Good** — no build step, no generated config, no plugin.
- **Bad** — the `#` prefix is mandatory, so the repo cannot spell every alias the same way.

### Per-bundler alias config

- **Good** — total control, and any sigil at all.
- **Bad** — the same table in four places, and a new consumer of the packages starts by
  discovering that its build fails.

---

## More information

Reviews: [import-aliases-2026-08-27.md](../reviews/import-aliases-2026-08-27.md) and
[import-aliases-pr-2026-08-27.md](../reviews/import-aliases-pr-2026-08-27.md). The convention
this serves — reach across an aliased folder through its alias, relative otherwise — is in
AGENTS.md.

Revisit if the packages stop exporting TypeScript source and ship a build instead, which is what
makes a consumer compile them and is the whole reason `paths` loses. A move to Rust for the core
([ADR 0005](0005-typescript-now-rust-later.md)) would end the question for whatever moves.
