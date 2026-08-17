# Complete integration tests

**Date**: 2026-08-17
**Status**: Todo <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/client.md`, `docs/specs/http-v1.md`, `docs/specs/core.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> A real `@notemap/client` drives the real daemon binary over a real socket, through the journeys a
> user actually performs — capture, upload and attach, feed, process, mirror, deliver, archive, and
> replay an outbox across a daemon that died — and the states those journeys need are produced by
> one seeder built on `/v1`, which also seeds a development pool.

Today nothing joins the layers. `packages/client` is tested against a mock transport, `apps/daemon`
against `app.request` in process, and `tests/integration` drives `createPool` with HTTP absent
entirely. Each side is well covered and the seam between them is covered by two sides agreeing
about a fake. This plan closes that seam, and fills the holes the core suite has left.

**What this plan is not.** It does not move coverage. Core's decisions stay tested in
`packages/core`, the port contracts in each adapter, and the routes in `apps/daemon`. A full-stack
test that asserts a domain rule is a slow duplicate of a fast test; these assert only what none of
those can — that the pieces agree.

**Black box, by construction.** The suite starts the daemon the way a user does — a config file and
`node apps/daemon/dist/main.js` — and touches nothing but the CLI, that file, and `/v1`. Measured:
113ms from spawn to answering, 3ms from `SIGTERM` to exit. There is no in-process harness and
`apps/daemon` exports nothing new, because at that price realism costs nothing.

---

## Tasks

### Phase 0 — Branch

- [ ] Create branch `agent/complete-integration-tests`.

### Phase 1 — A seeder over `/v1`

Depends on: nothing.

The seeder speaks HTTP, not the pool API. That is what lets one module serve both a test and a
running development daemon; a pool-level seeder could do neither without opening the SQLite file
the daemon already holds.

- [ ] New workspace package `tests/seed` (`@notemap/seed`), picked up by `pnpm -r` through the
      existing `tests/*` entry in `pnpm-workspace.yaml`.
- [ ] `seed(baseUrl, options)` captures a pool into the states worth asserting against: items in
      the feed, items with an uploaded asset attached, items marked processed, archived items, an
      item routed to a destination that is up, and an item whose delivery is owed to a destination
      that is down. All of it is reachable over `/v1`; the destinations themselves are not, so the
      README states which the daemon it seeds must have configured.
- [ ] Every write goes through `/v1` with `fetch`; no import of `@notemap/core`, no file written
      behind the daemon's back.
- [ ] Deterministic by default: a `seed` option fixes the captured ids and timestamps, so a test
      can assert on them and a second run produces the same pool.
- [ ] Root `scripts/seed.ts`, `pnpm seed`, pointing at `http://127.0.0.1:4747` by default and
      taking `--url`. Sibling of `scripts/dev.ts`; document both in the daemon README.
- [ ] `git commit`.

**Verify:** `pnpm seed` against a daemon started by `pnpm dev` fills the shell's feed and queue in
the browser; running it twice produces no duplicates and no errors.

### Phase 2 — The full-stack suite

Depends on: Phase 1.

- [ ] New workspace package `tests/full-stack` (`@notemap/full-stack-tests`), depending on
      `@notemap/client` and `@notemap/seed`. It is a sibling of `tests/integration` rather than part
      of it: that package exists to drive core through adapters with no host in sight, and its
      README says so. It does not depend on `@notemap/daemon` — it runs the built binary.
- [ ] A vitest `globalSetup` that builds the daemon, so the suite cannot run against a stale or
      missing `dist/`.
- [ ] Harness: temp directories for pool, assets, mirror and vault, a config file written into them
      with `mirror.pollInterval` and `delivery.pollInterval` low, and a teardown that `SIGTERM`s the
      child and waits for it. A failed start prints the child's stderr — a suite that reports
      "connection refused" and nothing else is a suite nobody can debug.
- [ ] Pick the port in the harness. `port = 0` is not an option: the config schema takes 1–65535, so
      the OS cannot hand out an ephemeral one. Probe by binding a socket on 0, take what it was
      given, close it, and write that into the config — then treat the daemon's own "port is already
      in use" exit as a retry rather than a failure, since the probe leaves a window and vitest runs
      files in parallel.
- [ ] Wait for the daemon's own startup line on stdout, which already names the address it bound,
      and confirm with one request. A poll loop against a port that is not open yet cannot tell
      "still starting" from "died on the way up".
- [ ] A client per test: `createFetchTransport(baseUrl)` over `createMemoryStore()`.
- [ ] Journey: capture through the client, read it back on `/v1/feed`, and see the client's own
      feed observable hold what the daemon returned.
- [ ] Journey: upload bytes with `uploadAsset`, capture an image referencing the asset, fetch the
      URL `assetContent` produces, and get the bytes back.
- [ ] Journey: process an item and wait for the mirror record to appear on disk — written by the
      daemon's own runner on its own timer, with nothing draining it.
- [ ] Journey: route an item to a filesystem destination and wait for the vault file, likewise
      undriven.
- [ ] Journey: archive, and see the item leave the queue on both sides.
- [ ] Journey: the outbox. Mutate while the daemon is dead, see the operation stay pending and the
      client report it unreachable, start a daemon again over the same directories, `drain()`, and
      see the mutation land exactly once.
- [ ] Journey: shutdown and restart. `SIGTERM` ends the process cleanly, and what was captured is
      there when it comes back — which is also the only test that the config file, the host wiring
      and `main.ts` work at all.
- [ ] Every wait is a bounded poll-until with a clear timeout message, never a fixed sleep, and
      every one waits for something to appear. A test that asserts something has *not* happened yet
      is asserting on a race; where a negative matters — a delivery still owed, an operation still
      pending — it is asserted after a positive fence the daemon has demonstrably passed.
- [ ] `git commit`.

**Verify:** `pnpm --filter @notemap/full-stack-tests test` green; `pgrep -f notemap-daemon` finds
nothing afterwards; each journey fails loudly, not silently, when the daemon never started.

### Phase 3 — Fill the core suite's gaps

Depends on: nothing. Independent of Phases 1–2 and can land before or after them.

- [ ] A pool closed and opened again over the same file: what was captured is there, and work that
      was owed is still owed. Nothing in `tests/integration` reopens a store today.
- [-] Enrichments _(dropped — core does not implement them: `pool.ts` wires `statusOf`, `request`,
      `artifactsFor` and `correct` to `notImplemented`, and recording enrichment output throws.
      There is nothing to drive.)_
- [ ] The sweep at its boundary: an unreferenced asset inside `grace` survives, the same asset
      after `grace` does not, driven by moving the frozen clock.
- [ ] A second claimant against a held lease, and the same claimant after the lease expires.
- [ ] A blob that drifted under a delivery and under a mirror write, not only under `verify`.
- [ ] `git commit`.

**Verify:** `pnpm --filter @notemap/integration-tests test` green, and each new test fails when the
behaviour it names is broken (check by breaking it locally, not by trusting the green).

### Phase 4 — Say where all this is

Depends on: Phases 1–3.

- [ ] `tests/full-stack/README.md`: what it covers that the other suites cannot, and why it runs the
      binary rather than importing the host.
- [ ] `tests/seed/README.md`, and a line in `apps/daemon/README.md` about `pnpm seed`.
- [ ] A paragraph in `tests/integration/README.md` distinguishing it from the new package, so the
      next person picks the right one.
- [ ] `Shipped:` entries in `docs/specs/client.md`, `docs/specs/http-v1.md` and `docs/specs/core.md`.
- [ ] `git commit`.

**Verify:** root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm -r test` are green;
CI green on the branch.

---

## Unknowns

- **How stable the undriven journeys are on a loaded machine.** Waiting for a runner's own timer is
  the point of Phase 2, and it is also the one thing that can flake in CI. Every wait is bounded and
  generous, and only ever waits for something to appear; if one still flakes, the fallback is to
  assert that effect through the core suite and leave the full-stack test asserting only the HTTP
  response.
- **What the whole suite costs.** A boot is 113ms, so a daemon per test is right until there are
  enough tests for it not to be — revisit at thirty. The fallback is a daemon per file, at the price
  of tests sharing a pool, which the seeder's fixed ids make survivable.
- **Whether `pnpm dev` should seed.** Left out deliberately: `pnpm seed` stays a separate command
  until there is a reason for a dev server to have data forced into it.

Resolved while planning: the daemon needs no `exports` map, since nothing imports it; `File` works
in Node 24, so `uploadAsset` is driven exactly as the shell drives it; every seeded state is
reachable over `/v1`, destinations excepted; enrichments are not implemented.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

This plan is tests, so the risk is inverted: the danger is a test that passes without asserting
anything — a journey against a daemon that never started, a poll that found what was already there,
an assertion on an empty list. Every journey asserts on something it caused, and a test that would
pass against an empty pool is a bug in the test.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
