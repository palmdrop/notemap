# Research: Rust viability for core

**Date**: 2026-08-02
**Status**: Draft — informs a possible revisit of
[ADR 5](../adr/0005-typescript-now-rust-later.md).

---

## Verdict

Rust is a viable option for core's storage and domain layer. SQLite access
(rusqlite), migrations, and FTS5 are mature and unsurprising. The daemon side
(axum/tokio) is boring-stable. Tauri is a real native option with no cost.

What Rust genuinely forecloses is narrower than ADR 5's framing suggests, but
it is not nothing:

- **A pool-owning Obsidian plugin that stores in SQLite is off the table**
  whether core is Rust or TypeScript-in-a-way-that-uses-native-SQLite,
  because Obsidian mobile (Capacitor, not Electron) has no native-addon
  story and no working SQLite-via-WASM story either. This is closer to an
  Obsidian-platform limit than a Rust-specific one — see §2.
- **A desktop-only Obsidian plugin *can* load a native Rust core** via a
  `.node` addon (napi-rs) — Obsidian's own docs sanction `require()`-ing
  Node/Electron APIs when `isDesktopOnly: true` is set. That plugin then
  never runs on mobile, by the manifest flag, regardless of language.
- **sqlite-vec's own Rust story is pre-1.0** (crate `sqlite-vec` v0.1.9,
  published 2026-03-31) and loads as a compiled C extension via
  `sqlite3_auto_extension`, not a native Rust API — this is true whether the
  host language is Rust or TypeScript (better-sqlite3 loads it the same
  way), so it isn't a Rust-specific cost.
- **The async argument in ADR 5 is weaker than stated.** SQLite is
  synchronous full stop — rusqlite doesn't implement `Sync` on `Connection`
  and cannot be `.await`ed directly ([rusqlite#697](https://github.com/rusqlite/rusqlite/issues/697)).
  A Rust core can be a plain synchronous library, with async confined to the
  daemon's edge (`tokio::task::spawn_blocking` around calls into core) —
  exactly the shape core already has in TypeScript, where storage calls are
  async at the port boundary but SQLite itself never yields concurrently.
  Learning async Rust is not a prerequisite for writing the domain layer.
- **The real cost is iteration speed while the domain model churns** —
  compile times, and the borrow checker's known weak spot on graph/pointer-
  shaped data, which matters here because revision chains are exactly that
  shape. This is real friction, not a hard blocker, and is a judgment call
  the team already flagged in ADR 5.

Net: Rust does not foreclose the daemon, the CLI, or a Tauri desktop app. It
forecloses being able to run a **storage-owning** plugin inside Obsidian on
**mobile** — but so does a TypeScript core, once you actually try to ship
`better-sqlite3` or `wa-sqlite`+OPFS to Obsidian's Capacitor mobile runtime.
The plugin-mobile case ADR 5 leans on is weaker evidence against Rust
specifically than the ADR implies.

---

## 1. SQLite from Rust

**rusqlite** is the standard, mature binding. Current version **0.40.1**
(docs.rs, no listed release date beyond version history —
[docs.rs/rusqlite](https://docs.rs/rusqlite/latest/rusqlite/)), ~4.3k GitHub
stars, ~2,946 commits
([github.com/rusqlite/rusqlite](https://github.com/rusqlite/rusqlite)). MSRV
policy: "latest stable Rust at time of release; might compile with older"
(same README). Supports SQLite ≥ 3.34.1 out of the box, more with `bundled`.

- **Transactions**: a `Transaction` type wrapping a connection, rolls back on
  drop unless committed or its drop behavior is set
  ([`Transaction` docs](https://docs.rs/rusqlite/latest/rusqlite/struct.Transaction.html)).
  Also exposes `Savepoint`. This is the conventional RAII pattern, nothing
  exotic.
- **Prepared statements**: `Connection::prepare` returns a cached
  `Statement`, reused across calls once dropped
  ([`Statement` docs](https://docs.rs/rusqlite/latest/rusqlite/struct.Statement.html)).
  Ordinary ergonomic API — parameter binding, typed row mapping.
- **Feature flags** (from
  [`Cargo.toml`](https://github.com/rusqlite/rusqlite/blob/master/Cargo.toml)):
  `bundled` (vendors and compiles SQLite from source — no system SQLite
  dependency), `load_extension`, `loadable_extension` (build a cdylib
  extension), `functions` (register Rust closures as SQL functions),
  `backup`, `blob`, `hooks`, `vtab` (+ `csvtab`, `array`, `series`).
- **FTS5**: no separate rusqlite feature flag is needed — the `bundled`
  build compiles SQLite with `-DSQLITE_ENABLE_FTS5` baked into
  `libsqlite3-sys`'s build script, alongside `-DSQLITE_ENABLE_RTREE`,
  `-DSQLITE_ENABLE_JSON1`, `-DSQLITE_ENABLE_LOAD_EXTENSION=1`, etc.
  ([`libsqlite3-sys/build.rs`](https://github.com/rusqlite/rusqlite/blob/master/libsqlite3-sys/build.rs)).
  FTS5 is then just SQL (`CREATE VIRTUAL TABLE ... USING fts5(...)`) — no
  Rust-specific FTS5 API exists or is needed, matching how FTS5 is used from
  any language.
- **Migrations**: `rusqlite_migration` (crate, by cljoly) is small,
  macro-free, stores the version in SQLite's own `user_version` pragma
  rather than a migrations table. Current version **2.5.0**
  ([crates.io/crates/rusqlite_migration](https://crates.io/crates/rusqlite_migration),
  [docs.rs](https://docs.rs/rusqlite_migration)). The maintainer states an
  intent to track rusqlite's own versioning policy going forward
  ([README](https://github.com/cljoly/rusqlite_migration/blob/master/README.md)).
  This is a reasonable, low-drama dependency, comparable in scope to
  `better-sqlite3`'s migration story in the Node ecosystem (which itself
  relies on third-party packages, same as here).
- **sqlite-vec from Rust**: there is an official `sqlite-vec` crate
  ([crates.io](https://docs.rs/crate/sqlite-vec/latest), latest **0.1.9**,
  published **2026-03-31**). It does **not** expose a native Rust query API —
  it vendors and statically compiles the C extension via the `cc` crate at
  build time, then you register the C entry point `sqlite3_vec_init` with
  `sqlite3_auto_extension()` so it auto-loads on every new connection
  ([alexgarcia.xyz/sqlite-vec/rust.html](https://alexgarcia.xyz/sqlite-vec/rust.html),
  official example: [`examples/simple-rust/demo.rs`](https://github.com/asg017/sqlite-vec/blob/main/examples/simple-rust/demo.rs)).
  There's a live compatibility wrinkle: the auto-extension registration
  signature changed between rusqlite 0.30 and 0.34, and existing examples
  need adjusting per rusqlite version
  ([sqlite-vec#206](https://github.com/asg017/sqlite-vec/issues/206)). The
  project overall states it is **pre-1.0**: "`sqlite-vec` is a pre-v1, so
  expect breaking changes!" ([github.com/asg017/sqlite-vec](https://github.com/asg017/sqlite-vec)).
  This maturity caveat is language-agnostic — it applies identically to the
  Node/Python/Go bindings — so it's a project-wide risk to weigh regardless
  of core's implementation language, not a Rust-specific one.

**Read on this**: SQLite-from-Rust is unsurprising and production-grade.
The one live risk is sqlite-vec's own pre-1.0 status, already known and
already recorded as "enrichment infra" in [standards.md](../standards.md);
nothing here changes that risk's shape.

---

## 2. The Obsidian plugin host

ADR 5 names this as the case Rust would foreclose. Splitting it into desktop
vs. mobile changes the picture.

**Desktop (Electron).** Obsidian's desktop app is an Electron shell
([Obsidian product teardown](https://medium.com/design-bootcamp/obsidian-app-in-depth-product-teardown-6d685930a367)
— secondary source, cited for the Electron claim only, corroborated by
Obsidian's own developer docs behavior below). Obsidian's **official**
developer docs state plugins may `require('electron')` or Node built-ins
like `require('fs')` directly in `main.js`, and that `manifest.json`'s
`isDesktopOnly` field exists specifically to declare "this plugin uses
NodeJS or Electron APIs"
([docs.obsidian.md — plugin self-critique checklist](https://docs.obsidian.md/oo24/plugin);
corroborating detail via search of
[Submission requirements for plugins](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins)). Loading a native `.node`
addon (what napi-rs produces) is the same mechanism as `require('fs')` —
Node's own native-addon loader — so it is officially sanctioned on desktop,
not a hack. One forum thread shows a developer hitting *packaging*
friction (esbuild couldn't resolve the `.node` file's path at bundle time),
not a platform prohibition
([forum.obsidian.md/t/import-native-module](https://forum.obsidian.md/t/import-native-module/83356)) — solvable bundler
config, not a wall.

**Mobile (Capacitor).** Obsidian mobile is a Capacitor wrapper, a materially
different runtime from desktop's Electron/Node
(per the same product-teardown source, and consistent with Obsidian's own
`isDesktopOnly` mechanism existing precisely because mobile lacks these
APIs). Native Node addons compiled for desktop OS/arch targets do not run
there. Setting `isDesktopOnly: true` is exactly the escape hatch for a
plugin that needs Node/Electron and accepts giving up mobile —
**this trade-off exists independent of Rust**: a TypeScript core using
`better-sqlite3` (also a native Node addon) would need the identical
`isDesktopOnly: true` flag for the identical reason. Rust does not add a
constraint here that a native-module TypeScript core wouldn't already have.

**The wasm32 route (the one path that could reach mobile).** This is where
Rust-specifically does hit a real wall for a *storage-owning* plugin:

- Pure compute-only Rust-via-`wasm-bindgen` **does** work in Obsidian today
  on both platforms via `wasm32-unknown-unknown` + `wasm-bindgen`/`wasm-pack`
  — confirmed by a live, non-2022 project,
  [zkdavis/obsidian-smart-vault](https://github.com/zkdavis/obsidian-smart-vault)
  (semantic-embedding similarity search, `lib.rs`/`llm.rs` compiled to
  `pkg/` and loaded via `wasm-bindgen`), and by an active 2025-era forum
  thread on getting `wasm-pack` output initializing correctly under
  esbuild ([forum.obsidian.md/t/wasm-in-obsidian-plugin](https://forum.obsidian.md/t/wasm-in-obsidian-plugin/103577)). Neither
  source mentions filesystem or SQLite access — because the WASM they run
  doesn't need it.
- **rusqlite itself does not run under `wasm32-unknown-unknown` with disk
  persistence today.** The tracking PR
  ([rusqlite#1010](https://github.com/rusqlite/rusqlite/pull/1010)) has been
  open since 2021, still open as of comments dated Feb 2025, and explicitly
  supports **only `Connection::open_in_memory()`** — its VFS "liberally
  returns `SQLITE_IOERR`" for any file-backed open. Real file persistence on
  `wasm32-unknown-unknown` needs `wasm32-wasi` instead, a different target
  Obsidian's plugin runtime doesn't use. A related earlier issue
  ([rusqlite#603](https://github.com/rusqlite/rusqlite/issues/603)) was
  closed by a narrower fix (PR #785) for a specific compile error, not by
  landing full wasm32 support.
- The browser/JS-native alternative — running SQLite itself as WASM,
  independent of Rust — is real and shipping: the **official
  sqlite.org WASM build** with OPFS persistence
  ([sqlite.org/wasm](https://sqlite.org/wasm),
  [about.md](https://sqlite.org/wasm/doc/trunk/about.md)), plus community
  builds `wa-sqlite` (Asyncify-based) and `sql.js` (in-memory only, the
  oldest of the three) — see the current-state survey
  ([PowerSync, May 2026](https://powersync.com/blog/sqlite-persistence-on-the-web))
  for the comparison, corroborated by the official docs directly. This path
  is open to a TypeScript core (it's how a browser-only or Obsidian-mobile
  pool-owner would have to work regardless) but is **not** what rusqlite
  offers today — a Rust core reaching mobile via wasm-vec-in-browser would
  mean reimplementing storage against sqlite.org's WASM build's own C API
  from Rust, or not owning storage from wasm at all, i.e. giving up the
  "core owns the pool" model for that host specifically.

**Bottom line on §2**: the 2022 `obsidian-rust-template` ADR 5 cites really
was just `wasm-pack` plumbing with no storage or async, as ADR 5 already
says. Newer evidence (`obsidian-smart-vault`, the 2025 forum thread) shows
Rust-via-wasm now works fine in Obsidian for **compute**, but the
storage-owning case ADR 5 actually cares about is still blocked — not
because Obsidian rejects Rust, but because **rusqlite's own wasm32 story
is file-storage-incapable**, a rusqlite/sqlite limitation more than an
Obsidian one. A desktop-only Rust plugin (napi-rs) works today and is no
worse off than a desktop-only TypeScript plugin using `better-sqlite3`.

---

## 3. Bindings middle path: napi-rs and UniFFI

**napi-rs** — Rust → native Node addon via Node-API (N-API). Actively
maintained: core `napi` crate at **3.8.4**, upstream repo pushed
2026-06-01, with `core`/`derive`/`build`/derive-backend/CLI components all
updated April–May 2026
([napi.rs changelog](https://napi.rs/changelog/napi),
[github.com/napi-rs/napi-rs](https://github.com/napi-rs/napi-rs)). Async is
first-class: enabling the `tokio_rt` feature lets an `async fn` marked
`#[napi]` run on napi-rs's built-in Tokio runtime and surface to JS as a
native `Promise`
([napi.rs/docs/concepts/async-fn](https://napi.rs/docs/concepts/async-fn)); an
`async-runtime` feature also lets a custom async runtime be plugged in
instead. This is the natural path if the daemon (or an Obsidian desktop
plugin) wants to stay TypeScript-facing while core itself is Rust: the
TS host calls a native module, not a subprocess or HTTP hop.

**UniFFI** (Mozilla) — a multi-language bindings generator, natively
targeting **Kotlin, Swift, Python, Ruby**, with third-party bindings for
C#/Go and, notably, community **`uniffi-bindgen-js`** which targets
WebAssembly + TypeScript for browser/Node/Deno/Bun
([mozilla/uniffi-rs](https://github.com/mozilla/uniffi-rs),
[uniffi-bindgen-js on lib.rs](https://lib.rs/crates/uniffi-bindgen-js)) and
**`uniffi-bindgen-react-native`**, a Mozilla Hacks-announced project turning
Rust into React Native Turbo Modules
([Mozilla Hacks, Dec 2024](https://hacks.mozilla.org/2024/12/introducing-uniffi-for-react-native-rust-powered-turbo-modules/)).
Async is supported via UniFFI's own `RustFuture` scaffolding, which drives
a Rust future to completion from whatever async runtime the foreign side
already has — deliberately not forcing a Rust async runtime choice onto
callers ([UniFFI async overview](https://mozilla.github.io/uniffi-rs/latest/internals/async-overview.html)). But JS/TS is
a **third-party/community binding**, not one of UniFFI's own maintained
targets — a materially less-trodden path than napi-rs for this project's
actual need (Node, not WASM-in-browser).

**Does this preserve "JS hosts as pool owners"?** Partially, and it matters
which sense of "owns" is meant:

- If "owns the pool" means *the process that calls into storage is
  TypeScript*, napi-rs preserves this cleanly for Node hosts (the daemon,
  a desktop Obsidian plugin) — the TS process still opens/holds the
  connection, just through a native module instead of `better-sqlite3`.
- If "owns the pool" means *the pool can be embedded in a JS-only runtime
  with no native compilation step* (a browser-only web app, or Obsidian
  mobile), bindings don't help — napi-rs produces a native addon, not
  something that runs in a JS-only sandbox, and UniFFI's JS target compiles
  to WASM, which inherits rusqlite's wasm32 storage gap from §2.

So: napi-rs is a credible **middle path for the daemon and desktop
Obsidian**, keeping their surface TypeScript while core is Rust underneath.
It does **not** open the browser-only or Obsidian-mobile case — those were
already foreclosed by rusqlite's wasm32 story regardless of which binding
generator sits on top.

---

## 4. Daemon: axum + tokio

Presumed fine per the task brief; confirmed current and stable:

- **axum** — latest stable is **0.8**, as of March 2026
  ([docs.rs/axum](https://docs.rs/axum/latest/axum/),
  [releases](https://github.com/tokio-rs/axum/releases)).
- **tokio** — actively maintained with an explicit LTS policy: **1.47.x**
  LTS supported until September 2026, **1.51.x** LTS until March 2027
  ([crates.io/crates/tokio](https://crates.io/crates/tokio)).

No red flags. This is the boring, correct choice for a Rust daemon.

---

## 5. Tauri

Current major version is **Tauri 2**, stable since October 2024, on patch
**2.11.5** as of 2026-07-01, with 2.11.3/2.11.4 released mid-2026
([Tauri release changelog](https://tauri.app/release/tauri/all-versions/)).
Actively released, not stagnant. Because Tauri bundles a Rust backend by
construction, a Rust core is **native** there with zero binding layer — the
one host in ADR 2's list where Rust is strictly *simpler* than the
TypeScript-now path, not costlier.

---

## 6. Does core even need async Rust?

No, and this is the most load-bearing correction to ADR 5's framing.

- SQLite is inherently synchronous, and rusqlite reflects that directly:
  `Connection` is not `Sync`, so it cannot be held across `.await` points —
  confirmed by a maintainer-acknowledged issue
  ([rusqlite#697](https://github.com/rusqlite/rusqlite/issues/697): "a
  reference to `T` is not `Send` when `T` is not `Sync`" blocks the
  attempted async usage). rusqlite does not pretend otherwise; there is no
  async rusqlite API to reach for.
- The idiomatic pattern the ecosystem converged on is exactly what tokio
  itself documents for any blocking work: hand it to
  `tokio::task::spawn_blocking`, which runs the closure on a dedicated
  blocking-thread pool sized generously by default, specifically because
  blocking calls (disk I/O chief among them) must not run inline on an
  async executor's worker threads
  ([tokio::task::spawn_blocking docs](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html)).
  Wrapper crates (`tokio-rusqlite`, `async-rusqlite`) exist and do exactly
  this: own a `Connection` on a dedicated thread, accept closures over a
  channel, return results as futures
  ([tokio-rusqlite](https://docs.rs/tokio-rusqlite),
  [async-rusqlite](https://docs.rs/async-rusqlite)) — this is a call-site
  concern for whatever process embeds core and drives an event loop, not
  something core's domain logic needs to know about.
- Given that, **core's domain layer can be plain synchronous Rust** —
  functions that take a `&Connection`/`&Transaction` and return `Result<T,
  E>`, no `async fn` anywhere in the domain. Async only shows up at the
  daemon's HTTP handlers, which wrap calls into core with
  `spawn_blocking` (or a `tokio-rusqlite`-style dedicated thread) the same
  way any synchronous library gets embedded in an async server. A CLI host
  wouldn't need async at all.

This directly undercuts ADR 5's "async Rust would be the first Rust
exposure" driver: writing core's domain layer needs ordinary synchronous
Rust — structs, enums, `Result`, trait objects for ports — not async Rust.
Async Rust (the genuinely harder subset, with `Send`/`'static` bounds
threading through futures) only becomes unavoidable at the daemon edge,
which is a much smaller, more contained surface than "the whole domain
model."

---

## 7. Beginner iteration cost (judgment, marked as such)

*Everything in this section is opinion/judgment, cited where a primary
source exists to ground it — not a claim of settled fact.*

- **Compile times**: the official Rust survey channel confirms this is a
  persistent, named complaint across multiple years, not a one-off gripe —
  the 2025 State of Rust survey states resource usage (compile times,
  storage) remains among the top things limiting productivity
  ([2025 State of Rust Survey results](https://blog.rust-lang.org/2026/03/02/2025-State-Of-Rust-Survey-results)),
  and a dedicated compiler-performance survey opened in mid-2025
  specifically because "long compile times... are frequently cited as one
  of the biggest challenges limiting productivity"
  ([Rust compiler performance survey 2025](https://blog.rust-lang.org/2025/06/16/rust-compiler-performance-survey-2025)).
  *Judgment*: with `cargo check`/incremental builds and a small crate this
  is manageable day-to-day, but full rebuilds during dependency churn
  (adding `bundled` SQLite, sqlite-vec's `cc`-compiled C extension) will be
  slower than the TypeScript loop the team has now, materially so on a
  laptop.
- **Refactor churn while the model moves**: no primary metric exists for
  this; it's a direct, structural consequence of Rust requiring every type
  to be fully specified (no `any`, no structural typing) and every
  ownership relationship to be explicit. ADR 5's own "iteration cost
  dominates right now" driver is exactly this concern, correctly identified
  without needing a citation to justify it.
- **Borrow checker on graph/chain-shaped data**: revision chains
  (item → supersedes → superseded-by) are exactly the shape the borrow
  checker is famously bad at as a *first* Rust exercise. The community's
  own teaching material makes this the explicit lesson: "Learn Rust With
  Entirely Too Many Linked Lists" exists because "such a CS 101 data
  structure hits Rust's blind spot, and ends up being absolutely the worst
  way to learn Rust"
  ([rust-unofficial/too-many-lists](https://rust-unofficial.github.io/too-many-lists/)).
  *Judgment, and a mitigating one*: this project's revision chain is not
  actually an in-memory pointer graph — it lives in SQLite as foreign-key
  rows (`revision_of` column), walked with SQL joins/recursive CTEs, not
  `Rc<RefCell<_>>` or raw pointers in Rust's own memory. The classic
  linked-list pain is specifically about *owning* graph nodes in-process;
  a SQL-backed chain sidesteps almost all of it, because the "pointers" are
  foreign keys the database owns, and Rust only ever holds plain owned
  structs deserialized from query rows. This is a real, non-obvious
  mitigation worth weighing against ADR 5's implicit assumption that a
  revision chain is inherently a borrow-checker problem.

---

## Blockers vs. friction

| # | Item | Hard blocker | Friction (real, but workable) |
|---|---|---|---|
| 1 | rusqlite: transactions, prepared statements, FTS5 | — | Mature; no issue found. |
| 1 | rusqlite_migration | — | Small, single-maintainer crate; low but nonzero bus-factor risk (same as most narrow-scope crates in this space). |
| 1 | sqlite-vec Rust crate | — | Pre-1.0, wire-format-of-registration churn across rusqlite versions ([#206](https://github.com/asg017/sqlite-vec/issues/206)); language-agnostic risk, not Rust-specific. |
| 2 | Obsidian desktop plugin + native Rust core (napi-rs) | — | Works today per Obsidian's own docs; bundler config friction only. |
| 2 | Obsidian **mobile** plugin owning a SQLite pool (Rust *or* TS) | **Yes** — Capacitor has no native-addon path, and rusqlite's wasm32 target has no file-backed storage. | — |
| 2 | Obsidian plugin doing wasm-based **compute** (no storage) | — | Proven working now (`obsidian-smart-vault`, 2025 forum thread). |
| 3 | napi-rs as TS-facing wrapper over a Rust core (daemon, desktop plugin) | — | Real, maintained, async-capable; adds a build/toolchain step (native compilation per target triple). |
| 3 | UniFFI to TS/JS | — | Only via community `uniffi-bindgen-js`, not a first-party target; more speculative than napi-rs for this project's actual need. |
| 4 | axum + tokio | — | None; current and LTS-backed. |
| 5 | Tauri | — | None; Rust core is *native* here, no binding cost at all. |
| 6 | Async Rust as a prerequisite to writing core's domain layer | **No — this isn't actually true.** | Async only needed at the daemon's edge (`spawn_blocking`), a small, well-trodden pattern. |
| 7 | Compile times during active iteration | — | Real and documented; will be slower than the current TS loop. |
| 7 | Borrow checker vs. revision chains | — | Mitigated by chains living in SQL, not in-process pointers — genuinely less scary than the canonical "linked list in Rust" horror story. |

---

## Sources consulted

All links above are inline; primary sources used throughout: docs.rs,
crates.io, the rusqlite/sqlite-vec/napi-rs/uniffi-rs GitHub repos and issue
trackers, sqlite.org/wasm, Obsidian's own developer docs and forum, the
official Rust blog's State of Rust survey posts, tokio's own docs.rs pages,
and the axum/Tauri release pages. Secondary sources (a product teardown,
a persistence-on-the-web comparison post) are flagged inline where used,
and only for claims corroborated elsewhere or clearly labeled as such.
