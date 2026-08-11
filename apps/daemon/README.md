# @notemap/daemon

The daemon serving one pool over HTTP on localhost. It is a **host**: it sources configuration,
wires adapters, and translates `/v1` onto the core library
([ADR 2](../../docs/adr/0002-core-is-a-host-agnostic-library.md)). It holds no logic of its own,
and nothing reaches the pool except through `createPool`.

The surface it answers is specified in [docs/specs/http-v1.md](../../docs/specs/http-v1.md).
Today that is the capture-and-feed subset plus the action log: `POST /v1/captures`,
`GET /v1/feed`, `GET /v1/items/:id`, `GET /v1/actions`, plus `GET /v1/openapi.json`. It also
serves two pages of its own, outside the contract: the capture page at `/` and an OpenAPI
playground at `/docs`.

## Running it

```sh
mkdir -p ~/.config/notemap
cp apps/daemon/config.example.toml ~/.config/notemap/config.toml
pnpm dev
```

`pnpm dev` from the repo root is `pnpm --filter @notemap/daemon start`, which builds and runs in
the foreground. There is no watch mode: a code change needs the command run again. `--config <path>` overrides where the config is read from; without it
the daemon looks in `$XDG_CONFIG_HOME/notemap/config.toml` and refuses to start if nothing is
there, rather than coming up with no payload types and refusing every capture instead.

`daemon.host` and `daemon.port` default to `127.0.0.1` and 4747, and it sends no CORS headers.
There is no authentication: the pool is the boundary, so binding wider than localhost exposes it
to whoever can reach the address.

`SIGINT` or `SIGTERM` stops it: the listener closes, idle connections go immediately, anything
still in flight gets two seconds, then the mirror runner stops — giving back any lease it holds
— and then the host closes the pool it built, and nothing else.

## The mirror

Every capture is also written to disk as a plain file pair — a `.json` **record**, which is
complete and authoritative, and a `.md` **rendering**, which nothing ever parses
([docs/specs/mirror.md](../../docs/specs/mirror.md)). Nothing reads either back during normal
operation. The point is that a lost pool is rebuildable and that uninstalling notemap costs
nothing but the tooling.

```toml
[mirror]
root = "~/.local/share/notemap/pool-mirror"
pollInterval = 1000 # milliseconds between sweeps for owed writes
leaseFor = 60000    # how long a claimed write is held before anyone may retake it
batch = 16          # writes claimed per sweep
```

The layout the root belongs to is one directory, and that directory is the backup unit —
rebuilding needs the mirror *and* the assets, and neither half is portable alone:

```
~/.local/share/notemap/
  state/notemap.db      <- authoritative, never synced
  pool-mirror/YYYY/MM/DD/
  assets/<hash-prefix>/
```

Writes are asynchronous. Capture commits, records that a write is owed, and answers; a poll loop
claims that work and performs it. **A capture never fails because a mirror write did** — a write
that fails because the folder is offline retries indefinitely, and one that fails because a
renderer threw is given up on at once and shows up on the abandoned-work surface. Because mirror
text is never read, `pool-mirror/` is safe inside a synced folder.

**Deleting the `[mirror]` table turns the mirror off**, and then nothing is written and no work
is even recorded as owed. Two consequences worth stating plainly, because they are easy to
acquire without noticing: the SQLite file becomes the only copy of everything, and the
drop-and-rebuild migration path below stops applying to that pool. Re-enabling it is one repair
run, which is not built yet — so today, turning it off and back on leaves everything captured in
between unmirrored.

The daemon wires a renderer for `text` and nothing else. A payload type with no renderer still
gets a readable file: the same provenance frontmatter, and its content as a fenced JSON block.

## Pools created now are disposable

There are no live users and no migrations are owed
([ADR 9](../../docs/adr/0009-versioned-api-mutable-until-first-real-pool.md)). `/v1` and the
schema may both change without a migration path until the developer says they hold something
they would be upset to lose.

The mirror is what ends this stance, and it is now here — but only half of it. Writing works;
**rebuild, verify and repair do not exist yet**, so the mirror is a complete copy that nothing
can yet read back. Until they land, treat it as insurance you cannot currently claim on: the
files are correct and a human can read them, but notemap cannot turn them back into a pool.

## Capture is online-only

The page this daemon serves posts straight to the API and keeps nothing locally. Capturing
while the daemon is unreachable is what the outbox protocol is for
([docs/specs/sync.md](../../docs/specs/sync.md)), and none of it is built.

## The OpenAPI document is checked in

`openapi.json` is generated from the routes by the same binary that serves them:

```sh
pnpm --filter @notemap/daemon openapi
```

A test compares the served document against the checked-in copy, so a route change that changes
the contract either shows up in the diff of the change that caused it or fails the suite.

## The playground is served, not fetched

`/docs` is Swagger UI reading `/v1/openapi.json` from the daemon that served it. Two files —
`swagger-ui-bundle.js` and `swagger-ui.css` — are copied out of `swagger-ui-dist` into
`public/vendor/swagger/` by the build step and are not checked in. Loading them from a CDN would
be smaller and would mean a daemon that cannot describe itself offline, and that tells a third
party each time it is asked to.

Same origin is the requirement, not a convenience: the daemon sends no CORS headers, so a
playground served from anywhere else could render the document and never call it.

`swagger-ui-dist` pulls in `@scarf/scarf`, which reports the install to a third party from a
postinstall script. `pnpm-workspace.yaml` denies it the right to run. Nothing in the two files
the daemon serves refers to it.

## Why this one app has a build step

Nothing else in the repo builds. The workspace packages are written for a bundler —
extensionless relative imports, directory index files — so `node src/main.ts` cannot resolve
`@notemap/core` even though Node strips the types happily. `scripts/build.ts` bundles with
esbuild, which confines the problem to the one package that has to actually run. Making the
packages Node-resolvable is the alternative, and a bigger change than it sounds.

Two things follow from it. `scripts/` runs under bare Node rather than the bundler, so its own
imports carry a `.ts` extension and the package enables `allowImportingTsExtensions`. And every
source file collapses into `dist/main.js`, so `import.meta.url` at runtime is that one file's,
whatever depth the source sat at: anything resolved against it belongs in `src/paths.ts`, which
sits at the depth the bundle does. The tests import sources and cannot see this difference —
`src/paths.test.ts` is what stands in for them.

## Notes on the wiring

- **The asset store throws.** It has no adapter yet and nothing can reach it — there are no
  asset endpoints — and it throws rather than doing nothing, so "unbuilt" cannot quietly become
  "lossy" the moment it becomes reachable. The mirror writer is different: it is genuinely
  optional, and its absence is a state core knows about rather than a stub, so a pool wired
  without one enqueues no mirror jobs instead of accumulating work nothing will claim.
- **The runner holds a timer and nothing else.** Which job is next, whether a failure retries and
  when, and when work is given up on are all core's
  ([ADR 2](../../docs/adr/0002-core-is-a-host-agnostic-library.md)): the host drives *when*, core
  owns the state. Polling rather than being kicked from the capture route is the boring choice
  and needs no signal from a route handler.
- **Routes are documented in `routes/definitions.ts` and handled in `routes/*.ts`**, rather than
  through `@hono/zod-openapi`'s `app.openapi()`. That helper types each handler against the
  responses its route declares, which fights an API answering every refusal through one helper,
  in one envelope. Handlers take their Hono path from the same definition the document is built
  from, and the per-status error codes are derived from the status maps in `errors/refusals.ts`,
  so neither can drift.
- **Schemas import `z` from `zod`, not from `@hono/zod-openapi`.** The re-exported one collapses
  `z.infer` to `any` under this tsconfig, which silently disables every type check written
  against it. `.openapi()` still works on plain zod schemas — the package augments the
  prototype.
