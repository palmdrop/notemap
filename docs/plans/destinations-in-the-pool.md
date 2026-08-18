# Destinations in the pool

**Date**: 2026-08-17
**Status**: Done
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/mirror.md`, `docs/specs/client.md`
**Closed**:

---

## Goal

A person adds, renames, retires and deletes a destination from the UI, with no config file and no
restart: the destination is a row in the pool, the daemon registers one adapter per kind, a routing
record resolves to a row that cannot be deleted out from under it, and a mirror carries them.
`[[destinations]]` is gone from `config.toml` and an unknown key there warns instead of refusing to
start. Decided in [ADR 20](../adr/0020-destinations-are-pool-state.md).

---

## Tasks

### Phase 1 — the domain and the port (core)

Depends on nothing. The rest of the plan depends on this.

- [x] Branch `agent/destinations-in-the-pool` (already carries the ADR and the spec edits)
- [x] `Destination` in `types/domain`: id, name, kind, settings, `retiredAt`, timestamps.
      `DestinationId` joins `MintableId`; `DestinationKindName` is a new brand
- [x] Replace `PoolPorts.destinations` with a `Destinations` port — `kinds()`,
      `describe(destination, signal?)`, `deliver(destination, delivery, signal?)`. Delete
      `DestinationAdapter`, `indexDestinations` and its duplicate-id throw
- [x] `DestinationKind` descriptor: name plus `settingsSchema`, validated through the existing
      `SchemaValidator` on create and on edit, refused with the schema issues
- [x] `DestinationReport` gains `unusable` beside `described` and `undescribable`: no adapter for
      the kind, or settings that no longer satisfy its schema
- [x] Pool API: `destinations.list()`, `create`, `rename`, `reconfigure`, `retire`, `unretire`,
      `delete`, `describe(id)`. Every mutation appends an action and returns a result that may
      refuse
- [x] `route` resolves the destination by id and refuses `destination-retired` and
      `destination-unusable`; `delete` refuses `destination-in-use`
- [x] Store port: the destination reads and writes, and "has any routing record ever named this"
- [x] Delivery jobs resolve the destination row when they run, and treat unusable as proof nothing
      was delivered — retried on `unreachable` terms, bounded, then abandoned
- [x] Tests: a fake kind registry in `core/src/testing`, covering settings refusal, unusable
      reporting, retire leaving a pending delivery alone, delete refused when referenced
- [x] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [x] `git commit`

### Phase 2 — the table (store-sqlite)

Depends on phase 1's store port.

- [x] Migration: `destinations` table, unique id, `retired_at` nullable, settings as JSON text
- [x] Migration: `routing_records.destination` becomes a foreign key with `ON DELETE RESTRICT`, so
      the in-use refusal is the schema's rather than a check the code has to remember. See the
      unknown below about existing rows
- [x] Statements and row mapping for the new reads and writes
- [x] Tests beside the driver, including that deleting a referenced destination is refused by the
      database and not only by core
- [x] Verify: `pnpm -r --silent test`; open a scratch pool and confirm `PRAGMA foreign_key_check`
      is clean after a route
- [x] `git commit`

### Phase 3 — the filesystem kind (destination-fs)

Depends on phase 1's port shape. Independent of phase 2.

- [x] `createFilesystemDestination(config)` becomes a kind module: no id, no construction, a
      `settingsSchema` for `root` and `accepts`, and `describe`/`deliver` taking the destination
- [x] `accepts` moves from adapter construction into the kind's settings; capabilities are
      computed from the destination it is handed
- [x] Renderers stay wired by the host, since they are not a person's setting
- [x] Tests: the existing suite, re-pointed at the new signatures, plus settings that fail the
      schema
- [x] Verify: `pnpm -r --silent test`
- [x] `git commit`

### Phase 4 — wiring and configuration (daemon)

Depends on phases 1–3.

- [x] `ports.ts` registers the kind registry — one adapter per kind — and stops mapping config into
      adapters; `adapterFor` goes
- [x] `config/load.ts`: `destinations` leaves the schema and `DestinationConfig` goes
- [x] Unknown keys and tables warn by name at startup and are ignored; a recognised key with a bad
      value still refuses. `strictObject` becomes a strip with a report of what it stripped
- [x] `config.example.toml`: the destinations block goes, replaced by a line saying where they live
      now; the delivery table stays
- [x] Startup log names the destinations the pool holds, not the ones config wired
- [x] Tests: config tests for the warning path and for a bad value still failing
- [x] Verify: `pnpm -r --silent test`; start the daemon against a config carrying a stale
      `[[destinations]]` block and see it start with a warning
- [x] `git commit`

### Phase 5 — the wire (daemon routes, OpenAPI)

Depends on phase 4.

- [x] `GET /v1/destinations` answers declarations from the pool — instant, unpaginated, retired
      ones included
- [x] `GET /v1/destinations/{id}/description` probes one and answers described, undescribable or
      unusable
- [x] `POST /v1/destinations`, `PATCH /v1/destinations/{id}`, `POST .../retire`, `POST
      .../unretire`, `DELETE /v1/destinations/{id}`
- [x] `GET /v1/destination-kinds` publishes each kind's `settingsSchema`
- [x] Refusal table: `destination-in-use` at `409`, `unknown-destination-kind` and
      `invalid-destination-settings` at `422`, `destination-retired` and `destination-unusable`
      where `route` refuses them
- [x] Regenerate `apps/daemon/openapi.json`
- [x] Tests beside the routes, including that listing destinations makes no adapter call
- [x] Verify: `pnpm -r --silent test`; the `/docs` playground drives create → route → retire
- [x] `git commit`

### Phase 6 — the mirror

Depends on phases 1 and 2. Independent of phase 5.

- [x] The destination record: core defines it and its canonical serialisation, beside the item
      record. Retired destinations are carried
- [x] A write is owed when a destination changes; the job's subject names a destination
      ([ADR 18](../adr/0018-a-jobs-subject-names-what-it-is-about.md))
- [x] `mirror-fs` writes them under their own directory, atomically, as item records are
- [ ] ~~Verify and repair reach destination records~~ — **not done, and not doable here**: neither
      verify nor repair is built (`maintenance.verifyMirror` and `repairMirror` still throw
      `not implemented`, and [mirror.md](../specs/mirror.md) says so). Whoever builds them reaches
      destination records at the same time; nothing here stands in the way
- [x] Tests: the round-trip property test grows destinations. *The drift half of this task belongs
      to verify, above, and is deferred with it*
- [x] Verify: `pnpm -r --silent test`; a scratch pool's mirror holds a file per destination
- [x] `git commit`

### Phase 7 — the client

Depends on phase 5.

- [x] `pnpm --filter @notemap/client codegen` against the regenerated document
- [x] A `destinations` surface: reads cached for display, mutations online-only and disabled when
      the pool is unreachable, no outbox operations
- [x] Readings for the new refusal codes, derived from the generated types as the existing ones are
- [x] Tests beside it, including that a mutation while unreachable is refused rather than queued
- [x] Verify: `pnpm -r --silent test`
- [x] `git commit`

### Phase 8 — the UI

Depends on phase 7.

- [x] A settings route listing destinations: name, kind, retired, and description fetched per
      destination rather than for the list
- [x] Add and edit, with the form built from the kind's `settingsSchema`
- [x] Retire, unretire, and delete — delete offered only where the pool allows it, with the
      refusal shown when it does not
- [x] `RouteAction` reads declarations, then describes the chosen destination; retired ones are not
      offered and unusable ones are shown as unavailable
- [x] Tests beside the components
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`; a destination created
      against a running daemon, routed to, retired and refused deletion, all without a restart.
      *Driven over `/v1` rather than in a browser, which this session has none of; the screen's
      own path is covered by its tests*
- [x] `git commit`

---

## Unknowns

- **Existing `routing_records` rows.** The foreign key in phase 2 has nothing to point at for
  records written against a config-file destination. Fallback: the migration mints a destination row
  per distinct id already in `routing_records`, carrying that id as its name and a kind no adapter
  registers, so it reports unusable and the history stays readable. If that proves noisier than it
  is worth on a real pool, drop the foreign key and enforce the in-use refusal in core alone.
- **Concurrent edits.** Left open deliberately in the specs. The assumption is last-write-wins,
  consistent with every other mutation; if two clients editing one destination turns out to matter,
  it wants a `modifiedAt` precondition and a `409`, which is a change to phase 5 only.
- **Building a form from JSON Schema in the UI.** Fallback: hand-roll for the two fields the
  filesystem kind has — a string and a list of payload types — rather than take a dependency to
  render a form nobody has seen yet.
- **What `describe` costs on a list of many destinations.** The split read exists so nothing pays
  for it; if the settings screen ends up wanting reachability for every row at once, that is a
  deliberate second call and not a reason to refuse the split.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The mirror's losslessness is proved once as a property test over generated pools
([mirror.md](../specs/mirror.md)); destination records join that test rather than getting a
parallel one.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
