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

*Amended 2026-08-03 — the portability rules are dropped.* This ADR originally required core to
be written so a Rust port would transfer mechanically. That tax is no longer paid: **Rust
portability does not influence how core is written.** Core is idiomatic TypeScript, and if a
port ever happens the domain layer is rewritten like everything else.

Four of the original five rules survive, each on its own independent grounds rather than as
portability constraints:

- **The domain layer takes no framework or runtime dependency.** No Node built-ins, no HTTP,
  no config, no timers — all of it behind ports. Grounded in
  [ADR 2](0002-core-is-a-host-agnostic-library.md): core must be embeddable and testable
  without a host.
- **State is modelled explicitly** as discriminated unions. Kept because the spec's guarantees
  are stated as states, and a union is how the compiler enforces exhaustiveness.
- **Ports are narrow interfaces**, one concern each, because that is what makes them
  substitutable in a test.
- **Port boundaries are async**, because they are I/O.

The fifth — *the schema lives in migrations, not inferred from TypeScript types* — rested on
portability alone and is **now open**. Schema-first tooling that generates types is a live
option for the storage adapter.

### Consequences

- **Good** — fastest iteration while tags, suggestion decisions and the job model are unsettled; one
  language across core and the queue UI; every host in ADR 2 stays open, plugin included. After
  the amendment, no continuous tax is paid for a port that may never happen.
- **Bad** — a Rust port, should it happen, is a rewrite of the domain layer and not a
  translation. That cost is accepted in exchange for writing the model the way TypeScript
  wants it written.
- **Neutral** — storage and host adapters were always going to be rewritten under a port.

---

## More information

*Reaffirmed 2026-08-02*, re-examined before scaffolding against primary sources
([../research/rust-viability.md](../research/rust-viability.md)). Two of the drivers turned
out weaker than stated: the domain layer would be plain synchronous Rust (async only at the
daemon edge via `spawn_blocking`), and the JS-host foreclosure is narrower than framed — an
Obsidian-mobile pool owner is blocked for a native-SQLite TypeScript core too, while a
desktop-only plugin can load a Rust core via napi-rs. The decision stands on iteration cost
and first-slice velocity alone, which is judged sufficient. The revisit trigger below is
unchanged.

Revisit once the domain model is stable and the queue ritual has proven itself in daily use.
Obsidian's Rust path was checked: [obsidian-rust-template](https://github.com/rachtsingh/obsidian-rust-template)
is a one-day proof of concept from December 2022 that demonstrates `wasm-pack` build plumbing
only — no storage, no filesystem, no async.
