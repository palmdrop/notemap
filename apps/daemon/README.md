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

It binds **`127.0.0.1` only**, on port 4747 by default, and sends no CORS headers. There is no
authentication: the pool is the boundary. Putting this behind a reverse proxy is the point at
which authentication stops being deferred.

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
esbuild, which confines the problem to the one package that has to actually run rather than
rewriting every import in core and the adapters. If the build step ever becomes the annoying
part, making the packages Node-resolvable is the alternative, and it is a bigger change than it
sounds.

## Notes on the wiring

- **Ids are UUIDv7**, from the `uuid` package. Time-ordered as `core.md` encourages, though
  nothing in the model may depend on that.
- **The asset store and the mirror ports throw.** They have no adapter yet and nothing can reach
  them: there are no asset endpoints, and no mirror job can be claimed until the store
  implements `claim()`. They throw rather than doing nothing, so "unbuilt" cannot quietly become
  "lossy" the moment one becomes reachable.
- **Route documentation and route handlers are registered separately** in `app.ts`, rather than
  through `@hono/zod-openapi`'s `app.openapi()`. That helper types each handler against the
  responses its route declares, and this API answers every refusal through one helper, in one
  envelope, at statuses the helper would rather see enumerated per route. The generated document
  comes from the same registry either way, and the test above is what keeps the two honest.
