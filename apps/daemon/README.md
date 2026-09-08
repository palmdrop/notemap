# @notemap/daemon

The daemon serving one pool over HTTP on localhost. It is a **host**: it sources configuration,
wires adapters, and translates `/v1` onto the core library
([ADR 2](../../docs/adr/0002-core-is-a-host-agnostic-library.md)). It holds no logic of its own,
and nothing reaches the pool except through `createPool`.

The surface it answers is specified in [docs/specs/http-v1.md](../../docs/specs/http-v1.md).
Today that is capture, feed, assets and the action log: `POST /v1/captures`, `GET /v1/feed`,
`GET /v1/items/:id`, `PUT /v1/assets/:id`, `GET /v1/assets/:id`, `GET /v1/assets/:id/content`,
`GET /v1/actions`, plus `GET /v1/openapi.json`. Outside the contract it serves the app — at `/`
and at every path the app routes, the action log included — and an OpenAPI playground of its own
at `/docs`.

## Running it

```sh
mkdir -p ~/.config/notemap
cp apps/daemon/config.example.toml ~/.config/notemap/config.toml
pnpm dev
```

`pnpm dev` from the repo root is `scripts/dev.ts`: it builds the app, then builds and runs the
daemon in the foreground. There is no watch mode: a code change needs the command run again.
Arguments after `--` go to the daemon. `--config <path>` overrides where the config is read from; without it
the daemon looks in `$XDG_CONFIG_HOME/notemap/config.toml` and refuses to start if nothing is
there, rather than coming up with no payload types and refusing every capture instead.

`daemon.host` and `daemon.port` default to `127.0.0.1` and 4747, and it sends no CORS headers.
There is no authentication: the pool is the boundary, so binding wider than localhost exposes it
to whoever can reach the address. What that leaves undefended, in full, is
[docs/specs/security.md](../../docs/specs/security.md).

`pnpm seed` fills a running daemon with something to look at — a handful of captures in every
state, over `/v1` and nothing else. It takes `--url` and otherwise assumes this daemon on its
default port; [tests/seed](../../tests/seed/README.md) says what it leaves behind and which
destinations it expects to find.

`SIGINT` or `SIGTERM` stops it: the listener closes, idle connections go immediately, anything
still in flight gets two seconds, then the mirror runner stops — giving back any lease it holds —
then the delivery runner, then the sweeper, and then the host closes the pool it built, and nothing
else.

## Assets

Bytes go up in a request of their own: `PUT /v1/assets/:id`, the body raw, `Content-Type` the media
type and `Content-Disposition` the filename. Both are required and neither is guessed — a
filename is user data and a media type is served back to a browser, so inventing either would be
a lie the pool then stores. An optional `Repr-Digest` is recomputed over the bytes received and
refused on mismatch. **The id is the uploader's**, so an upload can be repeated: the same bytes
under the same name and media type answer the asset already stored, and an id naming anything else
is refused.

```toml
[assets]
root = "~/.local/share/notemap/assets"
maxUpload = 268435456 # bytes — enforced against the stream, not against Content-Length

[sweep]
grace = 86400000   # how long an unreferenced asset is left alone
interval = 3600000 # milliseconds between sweeps
```

Unlike the mirror, the blob store is **not optional**: a pool that cannot store bytes cannot
capture an image at all.

An asset's reference is taken when the capture naming it commits, so an upload whose capture
never arrives is unreferenced — wasted space rather than a reference to something that does not
exist. The sweeper takes those, and any blob that loses its last asset with them, once `grace`
has passed. The window exists because to a sweep running at the wrong instant, "referenced" and
"about to be referenced" look identical.

**Anything may be uploaded; only inert things render.** On the way out, an allowlist decides
`inline` versus `attachment` — images, audio, video and `text/plain` render in place, and
everything else, HTML and SVG and PDF included, downloads. Every asset response also carries
`nosniff` and `default-src 'none'; sandbox`.

## Destinations

Items are routed **out** to destinations, which are **pool state** rather than configuration
([ADR 20](../../docs/adr/0020-destinations-are-pool-state.md)): they are added, renamed, retired
and deleted from the UI or over `/v1/destinations`, with no restart. The daemon wires one adapter
per **kind**, and one kind exists — a folder on disk
([@notemap/destination-fs](../../packages/adapters/destination-fs/)), whose settings are a `root`
and nothing else. What a folder takes is every payload type declared in the config, which the
daemon hands the kind rather than asking a person to repeat — one folder taking less than another
would be routing policy rather than something the folder cannot do. What stays in `config.toml` is
the cadence deliveries are retried at:

```toml
[delivery]
pollInterval = 5000 # milliseconds between claims for deliveries that are owed
leaseFor = 300000   # how long a claimed delivery is held before anyone may retake it
batch = 4
```

`GET /v1/destinations` lists what the pool holds and probes nothing;
`GET /v1/destinations/{id}/description` asks one what it can do. Two capabilities per folder:
`create`, which takes `{ directory, filename? }` and refuses rather than overwriting, and
`append`, which takes `{ path, heading? }` and creates both the file and the heading when
they are missing. The filename is derived from the first line of the payload when the target names
none — weak, because the domain has no title.

**The root must already exist**, and `~` in one means the home of whoever the daemon runs as. The
daemon never creates one: a root that is not there is an
unmounted drive far more often than it is a typo, and the adapter reports it as unreachable so the
decision is kept and retried rather than a folder being conjured where a vault was meant to be. The
same is true of a permission error.

**Appending is not safe against a file you have open in an editor.** One writer per file is the
standing rule and this adapter is it; an unsaved buffer in Obsidian is outside that promise and will
overwrite whatever landed.

`POST /v1/items/{id}/route` attempts the delivery once inline, so a folder that is there answers
immediately with a delivered record and a pointer. One that is not leaves a **pending** record and a
job, which the delivery runner retries with backoff until it lands or `retry.maxAttempts` is spent —
after which the record is removed, the item returns to the queue, and the failure appears on the
abandoned-work surface. A client must read `state` rather than reading a record as arrival.

Two things are never retried, deliberately: a destination that was reached and *refused* — a
traversal, a file already there — and a delivery whose lease expired with nothing reported, because
nobody can say whether those bytes landed.

Nothing a delivery names can escape `root`. Absolute paths, `..` and symlinks leaving the folder are
resolved and refused, and an asset filename is flattened to one segment before it is used.

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

- **The blob store is wired and not optional**, unlike the mirror writer. The mirror's absence
  is a state core knows about — a pool wired without one enqueues no mirror jobs rather than
  accumulating work nothing will claim — where a pool that cannot store bytes simply cannot
  capture an image.
- **The upload route is the one `/v1` route whose body is not JSON.** The media-type guard carves
  out that method and that path pattern rather than a prefix, so a route added under `/v1/assets`
  later — or another method on the same path — does not quietly inherit the exemption.
- **A runner holds a timer and nothing else.** Which job is next, whether a failure retries and
  when, and when work is given up on are all core's
  ([ADR 2](../../docs/adr/0002-core-is-a-host-agnostic-library.md)): the host drives *when*, core
  owns the state. Polling rather than being kicked from the capture route is the boring choice
  and needs no signal from a route handler.
- **The mirror and the delivery runner are one loop**, in `work/runner.ts`. Claiming, the
  one-attempt-per-drain guard, the single-flight drain and the timer are identical; what a job *is*
  is the only difference, and it arrives as a `perform`. The two configure different cadences
  because the work is different — a delivery is waiting on something outside this machine.
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
