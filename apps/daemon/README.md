# @notemap/daemon

The daemon serving one pool over HTTP on localhost. It is a **host**: it sources configuration,
wires adapters, and translates `/v1` onto the core library
([ADR 2](../../docs/adr/0002-core-is-a-host-agnostic-library.md)). It holds no logic of its own,
and nothing reaches the pool except through `createPool`.

The surface it answers is specified in [docs/specs/http-v1.md](../../docs/specs/http-v1.md).
Today that is the capture-and-feed subset: `POST /v1/captures`, `GET /v1/feed`,
`GET /v1/items/:id`, plus `GET /v1/openapi.json`.

## Running it

```sh
cp apps/daemon/config.example.toml ~/.config/notemap/config.toml
pnpm --filter @notemap/daemon start
```

`start` builds and runs. `--config <path>` overrides where the config is read from; without it
the daemon looks in `$XDG_CONFIG_HOME/notemap/config.toml` and refuses to start if nothing is
there, rather than coming up with no payload types and refusing every capture instead.

`daemon.host` and `daemon.port` default to `127.0.0.1` and 4747, and it sends no CORS headers.
There is no authentication: the pool is the boundary, so binding wider than localhost exposes it
to whoever can reach the address.

`SIGINT` or `SIGTERM` stops it: the listener closes, idle connections go immediately, anything
still in flight gets two seconds, and then the host closes the pool it built — and nothing else.

## Pools created now are disposable

There are no live users and no migrations are owed
([ADR 9](../../docs/adr/0009-versioned-api-mutable-until-first-real-pool.md)). `/v1` and the
schema may both change without a migration path until the developer says they hold something
they would be upset to lose. **Do not put anything in a pool yet that only exists there.** The
mirror is the next core slice, and it is what ends this stance.

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

## Why this one app has a build step

Nothing else in the repo builds. The workspace packages are written for a bundler —
extensionless relative imports, directory index files — so `node src/main.ts` cannot resolve
`@notemap/core` even though Node strips the types happily. `scripts/build.ts` bundles with
esbuild, which confines the problem to the one package that has to actually run. Making the
packages Node-resolvable is the alternative, and a bigger change than it sounds.

## Notes on the wiring

- **The asset store and the mirror ports throw.** They have no adapter yet and nothing can reach
  them: there are no asset endpoints, and no mirror job can be claimed until the store
  implements `claim()`. They throw rather than doing nothing, so "unbuilt" cannot quietly become
  "lossy" the moment one becomes reachable.
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
