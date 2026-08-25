# Client-minted assets, and a pool that says who it is

**Date**: 2026-08-24
**Status**: In progress
**Spec**: `docs/specs/http-v1.md`, `docs/specs/core.md`, `docs/specs/mirror.md`
**Closed**:

---

## Goal

A client mints an asset id before it uploads anything, so a capture's envelope is complete the
moment a person makes it: `PUT /v1/assets/{id}` replaces `POST /v1/assets`, answers `201` on the
first upload, `200` on an identical replay and `409 asset-id-conflict` when the bytes, filename or
media type differ under an id already used. `GET /v1/health` answers that the daemon is up and
which pool it is holding, which is the identity mirror.md has claimed is readable since 2026-08-11
and nothing has ever served.

Depends on [editable-until-processed](editable-until-processed.md) being merged, not for its
semantics — the two are disjoint — but because both regenerate `openapi.json`, both edit the
refusal table, and resolving that twice is waste.

---

## Tasks

### Phase 1 — an asset arrives with a name (core)

Depends on nothing.

- [ ] Branch `agent/client-minted-assets-and-health`
- [ ] ADR 0022: the uploader mints the asset id. Record the rejected alternative — deferring the
      upload into the drain and writing the minted id back into the pending operation — and why the
      lost-response case killed it: a re-upload mints a different id, so the same capture id goes up
      with a different body and earns `capture-id-conflict` for a capture that landed
- [ ] `assets.store` takes the id from the caller instead of `ports.ids.next`. Its result gains a
      shape like `CaptureOutcome`'s: stored, or already-stored, so the route can answer `201` or
      `200` without a second read
- [ ] Replay and conflict: an id already held answers that asset when the blob hash, filename and
      media type all match, and refuses `asset-id-conflict` otherwise. All three, because an asset
      is a *named* reference and both the name and the media type are served back to a browser
- [ ] `asset-id-conflict` joins `AssetRefusal` and the refusal union in `types/api/refusal.ts`
- [ ] Tests beside `pool/assets.ts`: a first upload; the same bytes, name and type replayed; each of
      the three differing in turn; an id whose asset was swept, which mints again
- [ ] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [ ] `git commit`

### Phase 2 — the pool says who it is (core, store-sqlite)

Depends on nothing in phase 1; independently verifiable.

- [x] A pool identity, minted once and stable for the life of that pool. Nothing in
      `packages/core` or `packages/adapters/store-sqlite` holds one today — this is new state, not
      a read of existing state
- [x] The store port answers it; the sqlite driver mints it when the schema is created and reads it
      back thereafter — as a one-row table the migration creates empty and the first read fills, so
      a pool that predates the table takes one without a data migration. A rebuild makes a *new*
      pool, so it takes a new identity without anything being told to reset one
      ([mirror.md](../specs/mirror.md))
- [x] A core read alongside the other pool reads, so a host never reaches into the store for it
- [x] Tests: two pools answer two identities; one pool answers the same identity across reopens; a
      pool rebuilt from a mirror answers a different one from the pool it was built from — the
      rebuild case is not written: rebuild has no entry point yet, and two pools differing is the
      same assertion it would make
- [x] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [x] `git commit`

### Phase 3 — the wire (daemon)

Depends on phases 1 and 2.

- [ ] `PUT /v1/assets/{id}` replacing `POST /v1/assets`: the same raw body, the same required
      `Content-Type` and `Content-Disposition`, the same optional `Repr-Digest`, the same streamed
      size limit. `201` with `Location` on a mint, `200` without one on a replay, `409` on conflict
- [ ] **The media-type guard's carve-out becomes a pattern.** http-v1.md says the raw-body exception
      is matched "by exact path rather than by prefix" so no other route loses it; the path now
      carries an id, so the guard matches a method and a shape rather than a string. Whatever it
      becomes, a test asserts that no other `/v1` path is carved out with it
- [x] `GET /v1/health`: the daemon is up, and the pool identity it is serving. Liveness has no
      refusals — a daemon that cannot answer is not answering
- [ ] `asset-id-conflict` joins the refusal table, the status mapping in `errors/refusals.ts`, and
      the route descriptions in `routes/definitions.ts`
- [ ] Regenerate `openapi.json` with `pnpm --filter @notemap/daemon openapi` and commit the result
- [ ] `tests/seed` uploads under ids it mints
- [ ] Route tests: a mint, an identical replay, each conflicting field, an oversized body still
      `413`, a digest mismatch still `422`, and `/v1/health` answering an identity that matches what
      the pool reports
- [ ] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [ ] `git commit`

### Phase 4 — the client, the docs and the stack (client, specs)

Depends on phase 3's document.

- [ ] Regenerate `src/api/generated.d.ts` with `pnpm --filter @notemap/client codegen`
- [ ] `client.uploadAsset` mints the id and `PUT`s. The capture flow is otherwise untouched: the
      shell still uploads before it captures while the pool is reachable, and the offline half is
      [durable-offline-client](durable-offline-client.md)'s
- [ ] A reading for `asset-id-conflict` in `errors.ts`
- [ ] `CONTEXT.md`: amend **Asset** — the id is minted by whoever uploads, so an asset has an
      identity before the pool holds its bytes, as a capture does. **Pool identity** landed with the
      health route
- [ ] `docs/specs/http-v1.md`: the upload section and the refusal table — `/v1/health` is written
      up already. `docs/specs/core.md`: the asset id is the caller's. `docs/specs/mirror.md`: the
      identity it has been asserting is readable now is — done
- [ ] `pnpm test:stack` green, with a case that uploads under a minted id, replays it and conflicts
      on it. The `/v1/health` case is in
- [ ] Add the dated `Shipped:` entries (see Notes) — http-v1.md and mirror.md carry the health
      half's already; core.md's is owed here
- [ ] `git commit`

---

## Unknowns

- **Where the pool identity lives in the store.** Nothing holds pool-level state today; every table
  is about items, assets, jobs or destinations. *Fallback*: a one-row table written at schema
  creation, read on open, minted on first read if absent — which also covers the developer's
  existing pool without a data migration.
- **What `/v1/health` answers besides the identity.** A version, a schema version and an uptime all
  suggest themselves and none has a caller. *Fallback*: the identity alone, and let the first thing
  that needs more ask for it.
- **A conflicting upload still writes a blob.** The bytes are hashed into the blob store before the
  transaction opens (`pool/assets.ts:9`), so a conflicting `PUT` leaves bytes no asset names. This
  is today's crash window rather than a new hole, and sweep does not reach it — deep verify does.
  *Fallback*: accept it, and say so where the comment already explains the ordering.
- **Whether the media-type guard can express a pattern cleanly** in the middleware as it stands.
  *Fallback*: match the method and an explicit prefix, with a test asserting the exact set of paths
  that get the raw-body treatment.

---

## Out of scope

What a client *does* with a pool identity — caching it, noticing it changed, dropping what it holds
— is [durable-offline-client](durable-offline-client.md)'s. This plan makes it readable and nothing
more.

Delta reads, tombstones and the rest of [sync.md](../specs/sync.md). Serving an identity does not
open the sync surface.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

`apps/daemon/src/routes/assets.test.ts` and `packages/core/src/pool/assets.test.ts` encode a
pool-minted id directly. Those are not failures to fix but a rule that was replaced; rewrite each to
assert what replaces it rather than deleting the case.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
