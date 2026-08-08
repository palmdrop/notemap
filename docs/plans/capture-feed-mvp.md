# Capture-and-feed MVP

**Date**: 2026-08-07
**Status**: In progress — phase 1 done, in
[http-v1-subset-and-positions.md](http-v1-subset-and-positions.md)
**Spec**: `docs/specs/http-v1.md`, `docs/specs/core.md`
**Closed**:

---

## Goal

A daemon serving a real pool on localhost, with a browser page that captures text and reads
the feed — every byte flowing through a properly specified `/v1` subset, so that daily use of
notemap can begin and inform the design.

**MVP stance, stated for whoever picks this up**: pools created during this phase are
**disposable**. ADR 9's freeze trigger is armed by the developer explicitly saying they hold
data they are afraid to lose, and not before. No migrations are owed until then. The mirror is
the planned next core slice after this plan, precisely so that stance can end.

---

## Tasks

### Phase 1 — Spec the `/v1` capture-and-feed subset — **done 2026-08-08**

The grilling session happened. Its outcome, and the core work it turned out to require, is
[http-v1-subset-and-positions.md](http-v1-subset-and-positions.md): `http-v1.md` now specifies
the capture-and-feed subset in observable terms, ADR 14 records pagination by domain position,
and core's paginated reads take positions instead of cursors.

Phase 3 below depends on both of that plan's phases.

### Phase 2 — `SchemaValidator` adapter over ajv *(independent of phase 1)*

The port is `SchemaValidator` in `packages/core/src/types/api/ports.ts`; every host needs it.
Follow the adapter conventions `packages/adapters/store-sqlite/` set: `import type` from core,
no shared types package, README recording any non-obvious call.

- [ ] `packages/adapters/schema-ajv`: map ajv errors onto core's `SchemaIssue`
- [ ] Tests: a valid payload, each issue kind the mapping produces, and that the adapter is
      per-instance (no module-level ajv cache shared across pools)
- [ ] No `close()` — it holds nothing open, per the amended port decision in `core.md`
- [ ] `git commit`

### Phase 3 — Daemon slice *(depends on phases 1 and 2)*

`apps/daemon` is an empty scaffold. The daemon is a thin translation onto core (ADR 2): no
logic of its own, and nothing reaches the pool except through `createPool`.

- [ ] Config loading from TOML: pool file path, sources, payload types (one `text` type to
      start), empty enrichments, a retry policy, bind port (default 4747). The host sources
      config; core takes it as data
- [ ] Wire ports: `store-sqlite`, system clock, UUIDv7 id generator (the `uuid` package), ajv
      validator, `unimplemented`-stub mirror writer/reader (nothing can invoke them — the
      driver's `claim()` does not exist yet), empty destinations
- [ ] Endpoints exactly as `http-v1.md` specifies them, on Hono with `@hono/zod-openapi`:
      `POST /v1/captures`, `GET /v1/feed`, `GET /v1/items/:id`, including the full
      refusal-to-status table and the `{ "error": { "code", ...facts } }` envelope
- [ ] Positions on the wire: parse `after` as `<at>,<id>` or a bare timestamp, refuse anything
      else `422 bad-position`, refuse `limit` above 500 rather than clamping, and render core's
      next position as the ready-to-fetch relative `next` URL
- [ ] `GET /v1/openapi.json`, generated from the routes and checked into the repo
- [ ] Graceful shutdown: the host closes the pool it built, and closes nothing else
- [ ] Tests: HTTP-level — capture, replay, each refusal's status and body, feed pagination by
      following `next` to exhaustion, a bare-timestamp entry, and a refused limit. Verify by
      hand: start the daemon, `curl` a capture, read it back
- [ ] `git commit`

### Phase 4 — Static capture-and-feed page *(depends on phase 3)*

Deliberately not the queue UI, and deliberately throwaway: one static page the daemon serves,
no framework, no build step. It retires when the real frontend gets designed.

- [ ] Capture box that mints a UUIDv7 client-side — hand-rolled inline, no build step — sends it
      as both `id` and `sourceItemId`, and `POST`s the envelope; visible
      already-captured/refused feedback rendered from the structured error body
- [ ] Feed list, newest first, "load more" by following the slice's `next` URL
- [ ] Online-only, stated on the page or in the daemon README: offline capture waits for the
      outbox protocol (`sync.md`)
- [ ] Daemon README: how to run, the disposable-pool stance, localhost-only
- [ ] Verify by hand in a browser; the HTTP tests from phase 3 cover the surface it uses
- [ ] `git commit`

---

## Unknowns and pending decisions

Resolved in the phase-1 grilling session (2026-08-08), recorded in
[http-v1.md](../specs/http-v1.md) and carried here for whoever reads this plan alone:

- **HTTP library** — **Hono**, with `@hono/zod-openapi` for the OpenAPI document.
- **Config file format** — **TOML**.
- **UUIDv7 minting** — the **`uuid` package** in the daemon; the static page hand-rolls v7
  inline, because a build step for one function costs more than the function.
- **Browser client's `sourceItemId`** — **the same value as the capture id**. One minted value
  fills both fields.
- **Port** — **4747** by default, bound to `127.0.0.1` only, no CORS headers.
- **The OpenAPI document** is part of the contract: generated, served at `/v1/openapi.json`,
  checked in. Client and hook generation from it is deferred.

Still open — consult the developer before resolving (AGENTS.md: language and library choices
are theirs):

- **`SchemaIssue` fit** — if ajv's errors carry something `SchemaIssue`
  (`packages/core/src/types/json.ts`) cannot express, the fallback is widening the core type
  with the developer, not lossy flattening in the adapter.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The daemon's tests are HTTP-level and belong to `apps/daemon`; core and the store are already
covered by `tests/integration/` and the driver suite. The static page is verified by hand —
it has no logic worth a harness at this size.

---

## Notes

Follow-up candidates, deliberately out of this plan's scope: the mirror slice (next core work,
ends the disposable-pool stance), a `notemap capture` CLI (cheap, and the first-slice
definition in `core.md` wants a CLI eventually), CI running typecheck/test/lint on PRs,
offline capture via the outbox.

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or
any sensible set of changes — is done, check off the relevant tasks, `git commit`, and
describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`.
**Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level
what landed and linking back to this plan. No implementation details, no granular tasks. A
plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill
will flag.
