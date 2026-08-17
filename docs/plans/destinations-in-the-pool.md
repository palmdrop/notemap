# Destinations in the pool

**Date**: 2026-08-17
**Status**: Todo
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

- [ ] Branch `agent/destinations-in-the-pool` (already carries the ADR and the spec edits)
- [ ] `Destination` in `types/domain`: id, name, kind, settings, `retiredAt`, timestamps.
      `DestinationId` joins `MintableId`; `DestinationKindName` is a new brand
- [ ] Replace `PoolPorts.destinations` with a `Destinations` port — `kinds()`,
      `describe(destination, signal?)`, `deliver(destination, delivery, signal?)`. Delete
      `DestinationAdapter`, `indexDestinations` and its duplicate-id throw
- [ ] `DestinationKind` descriptor: name plus `settingsSchema`, validated through the existing
      `SchemaValidator` on create and on edit, refused with the schema issues
- [ ] `DestinationReport` gains `unusable` beside `described` and `undescribable`: no adapter for
      the kind, or settings that no longer satisfy its schema
- [ ] Pool API: `destinations.list()`, `create`, `rename`, `reconfigure`, `retire`, `unretire`,
      `delete`, `describe(id)`. Every mutation appends an action and returns a result that may
      refuse
- [ ] `route` resolves the destination by id and refuses `destination-retired` and
      `destination-unusable`; `delete` refuses `destination-in-use`
- [ ] Store port: the destination reads and writes, and "has any routing record ever named this"
- [ ] Delivery jobs resolve the destination row when they run, and treat unusable as proof nothing
      was delivered — retried on `unreachable` terms, bounded, then abandoned
- [ ] Tests: a fake kind registry in `core/src/testing`, covering settings refusal, unusable
      reporting, retire leaving a pending delivery alone, delete refused when referenced
- [ ] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [ ] `git commit`

### Phase 2 — the table (store-sqlite)

Depends on phase 1's store port.

- [ ] Migration: `destinations` table, unique id, `retired_at` nullable, settings as JSON text
- [ ] Migration: `routing_records.destination` becomes a foreign key with `ON DELETE RESTRICT`, so
      the in-use refusal is the schema's rather than a check the code has to remember. See the
      unknown below about existing rows
- [ ] Statements and row mapping for the new reads and writes
- [ ] Tests beside the driver, including that deleting a referenced destination is refused by the
      database and not only by core
- [ ] Verify: `pnpm -r --silent test`; open a scratch pool and confirm `PRAGMA foreign_key_check`
      is clean after a route
- [ ] `git commit`

### Phase 3 — the filesystem kind (destination-fs)

Depends on phase 1's port shape. Independent of phase 2.

- [ ] `createFilesystemDestination(config)` becomes a kind module: no id, no construction, a
      `settingsSchema` for `root` and `accepts`, and `describe`/`deliver` taking the destination
- [ ] `accepts` moves from adapter construction into the kind's settings; capabilities are
      computed from the destination it is handed
- [ ] Renderers stay wired by the host, since they are not a person's setting
- [ ] Tests: the existing suite, re-pointed at the new signatures, plus settings that fail the
      schema
- [ ] Verify: `pnpm -r --silent test`
- [ ] `git commit`

### Phase 4 — wiring and configuration (daemon)

Depends on phases 1–3.

- [ ] `ports.ts` registers the kind registry — one adapter per kind — and stops mapping config into
      adapters; `adapterFor` goes
- [ ] `config/load.ts`: `destinations` leaves the schema and `DestinationConfig` goes
- [ ] Unknown keys and tables warn by name at startup and are ignored; a recognised key with a bad
      value still refuses. `strictObject` becomes a strip with a report of what it stripped
- [ ] `config.example.toml`: the destinations block goes, replaced by a line saying where they live
      now; the delivery table stays
- [ ] Startup log names the destinations the pool holds, not the ones config wired
- [ ] Tests: config tests for the warning path and for a bad value still failing
- [ ] Verify: `pnpm -r --silent test`; start the daemon against a config carrying a stale
      `[[destinations]]` block and see it start with a warning
- [ ] `git commit`

### Phase 5 — the wire (daemon routes, OpenAPI)

Depends on phase 4.

- [ ] `GET /v1/destinations` answers declarations from the pool — instant, unpaginated, retired
      ones included
- [ ] `GET /v1/destinations/{id}/description` probes one and answers described, undescribable or
      unusable
- [ ] `POST /v1/destinations`, `PATCH /v1/destinations/{id}`, `POST .../retire`, `POST
      .../unretire`, `DELETE /v1/destinations/{id}`
- [ ] `GET /v1/destination-kinds` publishes each kind's `settingsSchema`
- [ ] Refusal table: `destination-in-use` at `409`, `unknown-destination-kind` and
      `invalid-destination-settings` at `422`, `destination-retired` and `destination-unusable`
      where `route` refuses them
- [ ] Regenerate `apps/daemon/openapi.json`
- [ ] Tests beside the routes, including that listing destinations makes no adapter call
- [ ] Verify: `pnpm -r --silent test`; the `/docs` playground drives create → route → retire
- [ ] `git commit`

### Phase 6 — the mirror

Depends on phases 1 and 2. Independent of phase 5.

- [ ] The destination record: core defines it and its canonical serialisation, beside the item
      record. Retired destinations are carried
- [ ] A write is owed when a destination changes; the job's subject names a destination
      ([ADR 18](../adr/0018-a-jobs-subject-names-what-it-is-about.md))
- [ ] `mirror-fs` writes them under their own directory, atomically, as item records are
- [ ] Verify and repair reach destination records
- [ ] Tests: the round-trip property test grows destinations; verify reports a hand-deleted
      destination record as drift
- [ ] Verify: `pnpm -r --silent test`; a scratch pool's mirror holds a file per destination
- [ ] `git commit`

### Phase 7 — the client

Depends on phase 5.

- [ ] `pnpm --filter @notemap/client codegen` against the regenerated document
- [ ] A `destinations` surface: reads cached for display, mutations online-only and disabled when
      the pool is unreachable, no outbox operations
- [ ] Readings for the new refusal codes, derived from the generated types as the existing ones are
- [ ] Tests beside it, including that a mutation while unreachable is refused rather than queued
- [ ] Verify: `pnpm -r --silent test`
- [ ] `git commit`

### Phase 8 — the UI

Depends on phase 7.

- [ ] A settings route listing destinations: name, kind, retired, and description fetched per
      destination rather than for the list
- [ ] Add and edit, with the form built from the kind's `settingsSchema`
- [ ] Retire, unretire, and delete — delete offered only where the pool allows it, with the
      refusal shown when it does not
- [ ] `RouteAction` reads declarations, then describes the chosen destination; retired ones are not
      offered and unusable ones are shown as unavailable
- [ ] Tests beside the components
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`; add a destination in the
      browser and route an item to it without restarting the daemon
- [ ] `git commit`

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
