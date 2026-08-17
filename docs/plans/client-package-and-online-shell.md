# Client package and online shell

**Date**: 2026-08-17
**Status**: Done <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/client.md`
**Closed**: 2026-08-17

---

## Goal

> A framework-agnostic `@notemap/client` package owns the outbox, cache and state behind a
> `subscribe()` seam, and `apps/ui` is a thin Svelte shell over it — capture, feed, item, queue,
> archive/unarchive and routing driven end to end against the live daemon, with no state logic left
> in the shell.

Everything the client must *do* is [client.md](../specs/client.md); this plan builds it and migrates
the shell onto it. It does not restate the contract.

**What this plan cannot deliver.** `client.md`'s outbox vocabulary names `edit`, `tag`/`untag` and
`accept-`/`reject-suggestion`. All of these are `notImplemented` in core
(`packages/core/src/pool/pool.ts`), not merely absent from `/v1`. They are
[editing-and-classification.md](editing-and-classification.md)'s, and the `Shipped:` entry this plan
writes must say so rather than imply the whole contract landed.

---

## Tasks

### Phase 0 — Branch

- [-] Create branch `agent/client-package-and-online-shell` _(dropped — worked on `ui`, at the
      developer's instruction)_.

### Phase 1 — Scaffold `@notemap/client` and move the wire types

Depends on: nothing. Establishes the package and its ports so later phases have somewhere to land.
No behaviour yet.

- [x] Add `packages/client` as a workspace package (`@notemap/client`), matching the conventions of
      `packages/core` — `type: module`, `exports` pointing at `src/index.ts`, `typecheck` and `test`
      scripts, `vitest`. _(2026-08-17)_
- [x] Add `openapi-fetch`, `openapi-typescript` and the `codegen` script to this package. The client
      owns the HTTP surface and the domain view-models; the shell owns neither. _(2026-08-17 —
      `apps/ui` keeps its copies until Phase 3 stops using them, so that every commit typechecks)_
- [x] Point `codegen` at the daemon's committed document by relative path
      (`../../apps/daemon/openapi.json`). The daemon generates that document from its route
      definitions and is where the wire's truth lives, so the arrow points at it rather than at a
      shared copy. _(2026-08-17)_
- [x] **Commit the generated types.** `apps/ui/.gitignore` ignores `generated.d.ts` today, which is
      invisible only because `apps/ui` has no `typecheck` script. `packages/client` will have one and
      CI runs no codegen step, so the generated file must be tracked or `pnpm typecheck` fails on a
      fresh clone. _(2026-08-17 — tracked, and excluded from eslint and prettier instead)_
- [x] Define the two ports as interfaces: `Transport` (reaching `/v1`) and `ClientStore` (where the
      outbox and cache live), per
      [client.md](../specs/client.md#the-ports--the-seam-for-offline). _(2026-08-17)_
- [x] Define the client's public surface: a `createClient({ transport, store })` factory returning
      read surfaces exposed as `subscribe()`-shaped observables plus the mutation methods. Types and
      signatures only in this phase. _(2026-08-17)_
- [x] `git commit`. _(2026-08-17)_

**Verify:** `pnpm --filter @notemap/client typecheck` and `pnpm --filter @notemap/client test` pass
(green with a placeholder in-memory `ClientStore` test); `git ls-files` lists the generated types;
root `pnpm typecheck` is green after a clean `pnpm install` with no codegen run.

### Phase 2 — The outbox engine

Depends on: Phase 1. Implements the mutation path and read surfaces against the ports, tested
entirely against a mock `Transport` so no daemon is needed.

- [x] Implement the **outbox engine** over an abstract operation: optimistic apply to the cache,
      immediate drain through `Transport`, and reconciliation — replace-on-success,
      roll-back-and-surface on refusal, in-order per item. The engine is written once and is
      indifferent to which operations exist.
- [x] Stamp every operation with a client **operation-time**, and resolve opposing operations on one
      target last-write-wins by that stamp, per
      [client.md](../specs/client.md#the-outbox).
- [x] Encode the operations whose routes are live: `capture`, `archive`, `unarchive`. Declare
      `edit`, `tag`/`untag` and `accept-`/`reject-suggestion` in the operation type with **no
      encoder**, so the vocabulary is visible and adding one later is a wire detail rather than a
      reshape. Do not mock a wire that does not exist.
- [x] Implement **routing as a direct call, never an outbox operation** — `destinations`, `route`,
      `mark-processed`, `cancel` and an item's routing records go straight to `Transport` and fail
      loudly when it is unreachable, per
      [client.md](../specs/client.md#the-outbox).
- [x] Implement the **read surfaces**: feed (capture-time position, follow `next`) and queue
      (oldest-first list; no skip; no processing position).
- [x] Absorb the client-minting helper (`uuidv7`) and the capture-envelope assembly currently in
      `apps/ui/src/lib`.
- [x] Ship the trivial default pair: a `fetch`-backed `Transport` and an in-memory `ClientStore`.
- [x] `git commit`.

**Verify:** package unit tests, against a mock `Transport`, cover optimistic apply then reconcile on
ack; refusal rollback; in-order drain per item; opposing-op last-write-wins by operation-time;
`capture-id-conflict` handling on a re-sent capture; and that a routing call is refused rather than
queued when the transport reports unreachable. `pnpm --filter @notemap/client test` green.

### Phase 3 — Migrate `apps/ui`: capture, feed, item

Depends on: Phase 2. Every route this phase needs is live today.

- [x] Delete `apps/ui/src/lib/api/*` and `apps/ui/src/lib/feed/feed.svelte.ts`, replacing them with a
      thin Svelte adaptation of the client's observables. The shell reads client state and holds no
      state logic of its own.
- [x] Wire the web shell's ports: a same-origin `fetch` `Transport` keeping the `baseUrl` rule
      already established in `api/client.ts`, and the in-memory `ClientStore`.
- [x] Rework `CaptureForm`, `Feed` and `Item` to call client methods and render client state; a
      capture appears optimistically with no round trip.
- [x] Stamp the capture **source per channel** (e.g. `web-manual`, `web-image`) rather than a single
      hardcoded `web`, per [client.md](../specs/client.md#source-identity).
- [x] `git commit`.

**Verify:** `pnpm --filter @notemap/ui check` and `vite build` succeed; `git grep` finds no
`openapi-fetch` import under `apps/ui`; running the daemon plus `vite dev`, a capture appears
instantly and reconciles, the feed paginates by following `next`, and a forced refusal rolls back
visibly.

### Phase 4 — The queue surface

Depends on: Phase 3. `GET /v1/queue`, archive, unarchive, `mark-processed`, `route` and
`GET /v1/destinations` are all live in the daemon today.

- [x] Wire the queue as one scrollable oldest-first list, per
      [client.md](../specs/client.md#the-queue). No skip action, and no client-held processing
      position.
- [x] Keep a **scroll mark** as local per-shell view state that restores the view on reload and is
      never sent to the pool.
- [x] Wire archive and unarchive through the outbox: the item leaves the list optimistically and
      settles on the pool's answer.
- [x] Wire routing and mark-processed as direct calls, and **make the asymmetry visible**: archive
      stays available when the pool is unreachable, routing and mark-processed are disabled with a
      reason rather than queued into a promise the outbox cannot keep.
- [x] `git commit`.

**Verify:** against a running daemon, archiving an item removes it from the queue and it stays in the
feed; unarchiving returns it at its unchanged position; routing an item to a configured destination
removes it from the queue; reloading restores roughly the previous scroll position; with the daemon
stopped, archive still applies locally while the routing action is disabled and says why.

### Phase 5 — Build wiring

Depends on: Phase 4. The same-origin serving pipeline itself landed in `bb72d31`; this closes the
one gap left.

- [x] Add a root `build` script so `pnpm build` produces a daemon serving the current shell. The root
      `package.json` has none today.
- [x] Confirm the existing pipeline still holds end to end: `apps/ui` build →
      `apps/daemon/scripts/bundle-ui.ts` → daemon serves the shell at `/`, unknown non-`/v1` paths
      answer the shell, and a daemon built without the app still serves `/v1`.
- [x] `git commit`.

**Verify:** `pnpm build` from a clean tree, then start the daemon with no dev server; `/` and a
client-routed deep link both answer the shell same-origin; `curl` an asset and confirm no
`Access-Control-Allow-Origin` header; `apps/daemon`'s `src/ui/serve.test.ts`, `serving.test.ts` and
`scripts/bundle.test.ts` pass.

---

## Unknowns

- **Where the wire types live once the shell deploys separately.** The relative reach into
  `apps/daemon/openapi.json` is right while the shell is bundled into the daemon. A UI deployed apart
  from the API makes the document a genuinely shared artifact and argues for extracting a small
  contract package. Fallback: extract one when a second consumer appears, or when the shell ships
  from its own deploy — not before. A separately-deployed shell is also not same-origin and reopens
  authentication, which [security.md](../specs/security.md) already names; the `Transport` port and
  the `baseUrl` rule absorb the origin change either way.
- **One package or two.** [client.md](../specs/client.md) leaves open whether a headless core and a
  Svelte-binding layer split once a second shell exists. This plan keeps one package. Fallback: if
  Phase 3 finds the Svelte adaptation wants non-trivial glue, extract `packages/client-svelte` then
  rather than retrofitting.
- **`ClientStore`/`Transport` exact shapes.** Named in Phase 1 but only proven in Phase 2. If the
  outbox needs a store capability not in the Phase 1 interface, widen it in Phase 2 — the interface
  is not frozen until the durable adapter, a later offline plan, consumes it.
- **How an operation with no encoder is represented.** Phase 2 declares the deferred vocabulary
  without a wire. If carrying an un-encodable operation in the type turns out to complicate the
  engine rather than document it, drop it to a comment-free enum extension in
  [editing-and-classification.md](editing-and-classification.md) instead.
- **Whether `apps/ui` needs a test runner.** It has none, and root `pnpm test` would skip it. Phases
  3 and 4 add rendering behaviour worth a test. Fallback: if adding `vitest` to a SvelteKit app
  proves fiddly, keep shell coverage to the manual verify steps above and say so, rather than
  claiming tests that do not run.
- **Whether the daemon needs any change here.** Source-per-channel needs none — core accepts any
  source id undeclared ([core.md](../specs/core.md#intake-and-sync)); declaring a channel in
  `config.example.toml` only attaches policy. If policy demonstration is wanted, add the channels to
  the example config in Phase 3; otherwise the daemon is untouched.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Phase 2 is where the load-bearing tests live: optimistic apply, reconciliation, rollback, in-order
drain and operation-time ordering, all against a mock `Transport` with no daemon. Shell phases cover
adaptation and rendering, not domain logic.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above** (`docs/specs/client.md`), dated, describing at a
high level what landed and linking back to this plan. No implementation details, no granular tasks. A
plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will
flag. That entry must be explicit that editing, classification and suggestions did **not** land here.
