# 5. TypeScript now, with a Rust port kept open

**Date**: 2026-08-01
**Status**: Accepted

---

## Context and problem statement

Core is a host-agnostic library ([ADR 2](0002-core-is-a-host-agnostic-library.md)) that owns
storage behind a driver port. Which language, given that learning Rust is a goal of the
project and the domain model is still being designed?

---

## Decision drivers

- The domain model is actively churning; iteration cost dominates right now.
- The web queue UI is TypeScript regardless.
- Rust would exclude only **JS-based hosts as pool owners** — an Obsidian plugin and a
  browser-only web app. A Tauri desktop app preserves the zero-services deployment either way.
- Async Rust would be the first Rust exposure, on a model that is still moving.

---

## Decision outcome

**TypeScript on Node with pnpm, now.** A Rust port is deliberately kept open and reconsidered
once the domain model has settled.

The stack of any existing project is precedent, not a mandate; in particular Bun is not
inherited.

Because the port is a real possibility rather than a nicety, core is written to stay
portable:

- **The domain layer takes no framework or runtime dependency.** No Node built-ins, no HTTP,
  no config, no timers — all of it behind ports.
- **State is modelled explicitly** as discriminated unions, so it maps mechanically to Rust
  enums. No structural-typing tricks, no decorator or metaprogramming cleverness in the model.
- **Ports are narrow interfaces**, one concern each, so they map to traits one-to-one.
- **Port boundaries are async**, which both a Node host and a future Rust host want anyway.
- **The schema lives in migrations**, not inferred from TypeScript types, so it survives a
  rewrite untouched.

### Consequences

- **Good** — fastest iteration while tags, ratification and the job model are unsettled; one
  language across core and the queue UI; every host in ADR 2 stays open, plugin included.
- **Bad** — the portability rules are a tax paid continuously for a port that may never happen.
- **Neutral** — if the port does happen, storage and host adapters are rewritten regardless;
  only the domain layer is meant to transfer.

---

## More information

Revisit once the domain model is stable and the queue ritual has proven itself in daily use.
Obsidian's Rust path was checked: [obsidian-rust-template](https://github.com/rachtsingh/obsidian-rust-template)
is a one-day proof of concept from December 2022 that demonstrates `wasm-pack` build plumbing
only — no storage, no filesystem, no async.
