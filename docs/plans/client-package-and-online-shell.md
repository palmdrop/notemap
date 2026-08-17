# Client package and online shell

**Date**: 2026-08-17
**Status**: Todo <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/client.md`
**Closed**:

---

## Goal

> A framework-agnostic `@notemap/client` package owns the outbox, cache and state
> behind a `subscribe()` seam, and `apps/ui` is a thin Svelte shell that consumes it —
> capture and feed driven end to end against the live daemon, with the queue and
> classification surfaces modelled and unit-tested in the package, ready to wire the
> moment their `/v1` routes exist.

Everything the client must *do* is [client.md](../specs/client.md); this plan builds it and
migrates the shell onto it. It does not restate the contract.

---

## Tasks

### Phase 0 — Branch

- [ ] Create branch `agent/client-package-and-online-shell`.

### Phase 1 — Scaffold `@notemap/client` (the seam)

Depends on: nothing. Establishes the package and its ports so later phases have somewhere to
land. No behaviour yet.

- [ ] Add `packages/client` as a workspace package (`@notemap/client`), matching the
      conventions of `packages/core` — `type: module`, `exports` pointing at `src/index.ts`,
      `typecheck` and `test` scripts, `vitest`.
- [ ] Move `openapi-fetch` and `openapi-typescript` from `apps/ui` into this package, and move
      the `codegen` script and the generated types here — the client owns the HTTP surface and
      the domain view-models, not the shell.
- [ ] Define the two ports as interfaces: `Transport` (reaching `/v1`) and `ClientStore` (where
      the outbox and cache live), per [client.md](../specs/client.md#the-ports--the-seam-for-offline).
- [ ] Define the client's public surface: a `createClient({ transport, store })` factory
      returning read surfaces exposed as `subscribe()`-shaped observables plus the mutation
      methods. Types and signatures only in this phase; no implementation.
- [ ] `git commit`.

**Verify:** `pnpm --filter @notemap/client typecheck` passes; `pnpm --filter @notemap/client test`
runs (green with a placeholder in-memory `ClientStore` test).

### Phase 2 — The online client core

Depends on: Phase 1. Implements the mutation path and read surfaces against the ports, tested
entirely against a mock `Transport` so no daemon is needed.

- [ ] Implement the **outbox**: optimistic apply to the cache, immediate drain through
      `Transport`, and reconciliation — replace-on-success, roll-back-and-surface on refusal,
      in-order per item.
- [ ] Implement the full operation vocabulary from
      [client.md](../specs/client.md#the-outbox): `capture`, `edit`, `tag`/`untag`,
      `archive`/`unarchive`, `accept-suggestion`/`reject-suggestion`. Every op carries a client
      **operation-time** stamp.
- [ ] Implement the **hand-over edit seal**: a pending capture is edited in place until sent, and
      an edit after the seal is sent as a domain edit whose amend-vs-revise shape is reconciled
      from the pool's ack.
- [ ] Implement the **read surfaces**: feed (capture-time position, follow `next`) and queue
      (oldest-first list; no skip; no processing position — scroll is the shell's).
- [ ] Absorb the client-minting helper (`uuidv7`) and the capture-envelope assembly currently in
      `apps/ui/src/lib`.
- [ ] Ship the trivial default pair: a `fetch`-backed `Transport` and an in-memory `ClientStore`.
- [ ] `git commit`.

**Verify:** package unit tests, against a mock `Transport`, cover: optimistic apply then reconcile
on ack; refusal rollback; opposing-op last-write-wins by operation-time; `capture-id-conflict`
handling on a re-sent capture; the edit seal (free edit before send, domain edit after). `pnpm
--filter @notemap/client test` green.

### Phase 3 — Migrate `apps/ui` onto the client

Depends on: Phase 2, and on which `/v1` routes the daemon answers **today** (capture, feed,
`items/:id`, assets — the queue/classification routes are Phase 5). Rewrites the throwaway UI.

- [ ] Replace `apps/ui/src/lib/api/*` and `apps/ui/src/lib/feed/feed.svelte.ts` with a thin
      Svelte adaptation of the client's observables — the client exposes a Svelte-compatible
      `subscribe()` store, so the shell reads it with `$` and holds no state logic of its own.
- [ ] Wire the web shell's ports: a same-origin `fetch` `Transport` (keeping the `baseUrl` rule
      the other agent already established in `api/client.ts`) and the in-memory `ClientStore`.
- [ ] Rework `CaptureForm`, `Feed` and `Item` to call client methods and render client state; a
      capture appears optimistically with no round trip.
- [ ] Stamp the capture **source per channel** (e.g. `web-manual`, `web-image`) rather than a
      single hardcoded `web`, per [client.md](../specs/client.md#source-identity).
- [ ] `git commit`.

**Verify:** `pnpm --filter @notemap/ui check` and `vite build` succeed; running the daemon + `vite
dev`, a capture appears instantly and reconciles, the feed paginates, and a forced refusal rolls
back visibly.

### Phase 4 — Production same-origin build pipeline

Depends on: Phase 3. Confirms the built SPA is served by the daemon from its own origin, which is
what keeps the no-CORS property ([security.md](../specs/security.md)).

- [ ] Verify the pipeline the other agent added: `apps/ui` build → `apps/daemon/scripts/bundle-ui.ts`
      → daemon serves the shell at `/`, unknown non-`/v1` paths answer the shell, and a daemon
      built without the app still serves `/v1`.
- [ ] Add a root/daemon build script wiring so `pnpm build` produces a daemon that serves the
      current UI, if one is not already wired.
- [ ] `git commit`.

**Verify:** build the app, start the daemon with no dev server, load `/` and a client-routed deep
link and get the shell same-origin; `curl` an asset and confirm no `Access-Control-Allow-Origin`
header; the daemon's existing `src/ui/serve.test.ts` and `serving.test.ts` pass.

### Phase 5 — Queue and classification surfaces (blocked)

Depends on: the daemon exposing the queue read, tagging/untagging, and archive/unarchive routes —
**still stub** in [http-v1.md](../specs/http-v1.md) and owned by
[queue-drains.md](queue-drains.md), not this plan. The client vocabulary for these ships in
Phase 2 and is tested against a mock; this phase only wires the shell to real routes once they
exist.

- [ ] Wire the queue surface as a scrollable oldest-first list route, with a local per-device
      scroll mark and no skip.
- [ ] Wire tag/untag and archive/unarchive actions on an item to the live routes.
- [ ] Make the offline-only asymmetry visible even while online: archive is an ordinary action;
      route/mark-done is deferred to a later slice and not offered here.
- [ ] `git commit`.

**Verify:** against a daemon that answers the queue/classification routes, archiving an item
removes it from the queue and it stays in the feed; a tag added appears without a round trip and
survives reload.

---

## Unknowns

- **Which `/v1` routes exist when Phase 3 runs.** Today: capture, feed, `items/:id`, assets,
  actions. If queue/tag/archive are still stub, Phase 3 ships capture+feed and Phase 5 waits on
  `queue-drains.md`. Fallback if that is unacceptable: fold the daemon routes into this plan as a
  new phase before Phase 5 — but that duplicates `queue-drains.md`'s scope and should be resisted.
- **One package or two.** [client.md](../specs/client.md) leaves open whether a headless core and
  a Svelte-binding layer split once a second shell exists. This plan keeps one package; the seam
  is designed so a later split is cheap. Fallback: if Phase 3 finds the Svelte adaptation wants
  non-trivial glue, extract `packages/client-svelte` then rather than retrofitting.
- **`ClientStore`/`Transport` exact shapes.** Named in Phase 1 but only proven in Phase 2. If the
  outbox needs a store capability not in the Phase 1 interface, widen it in Phase 2 — the interface
  is not frozen until the durable adapter (a later, offline plan) consumes it.
- **Does the daemon need any change at all here.** Source-per-channel needs none — core accepts any
  source id undeclared ([core.md](../specs/core.md#intake-and-sync)); declaring a channel in
  `config.example.toml` only attaches policy and is optional. If policy demonstration is wanted,
  add the channels to the example config in Phase 3; otherwise the daemon is untouched until
  Phase 5's dependency lands elsewhere.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The client core (Phase 2) is where the load-bearing tests live: optimistic apply, reconciliation,
rollback, operation-time ordering and the edit seal, all against a mock `Transport` with no daemon.
Shell tests (Phases 3, 5) cover adaptation and rendering, not domain logic.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above** (`docs/specs/client.md`), dated, describing at a
high level what landed and linking back to this plan. No implementation details, no granular tasks. A
plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
