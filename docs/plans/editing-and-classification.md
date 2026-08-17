# Editing and classification

**Date**: 2026-08-17
**Status**: Todo <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`
**Closed**:

---

## Goal

> An item can be edited and tagged end to end: core implements `items.edit`, `items.tag` and
> `items.untag`, `/v1` grows the routes and refusals for them, and the shell offers editing and
> tagging through the client's outbox — with an edit landing as an in-place amendment of the head or
> as a revision, decided by the pool.

`core.md` already specifies all of this behaviour ([editing](../specs/core.md#editing),
[classification](../specs/core.md#classification)); the types are defined and the pool methods are
`notImplemented`. This plan fills them in and carries them out to the wire and the shell. It does not
restate the contract.

**Why this is a plan of its own.** [client-package-and-online-shell.md](client-package-and-online-shell.md)
declares these operations in the client's vocabulary with no encoder, because none of them exists
below the client. The missing piece is core, not the HTTP surface.

---

## Scope

In: `items.edit`, `items.tag`, `items.untag` — through the store port, core, `/v1` and the shell.

Out: **suggestions.** `accept-suggestion` and `reject-suggestion` need `SuggestionsApi`, and a
suggestion is produced by enrichment — the whole `EnrichmentApi` is `notImplemented` too. Accepting a
suggestion that nothing can create is not a slice. It waits on an enrichment plan.

Out: **purge.** `items.purge` is `notImplemented` alongside these, but it is the one destructive
operation, has tombstone and mirror-removal consequences ([ADR 4](../adr/0004-purge-leaves-a-minimal-tombstone.md)),
and shares nothing with editing but a neighbouring line in `pool.ts`.

---

## Tasks

### Phase 0 — Branch

- [ ] Create branch `agent/editing-and-classification`.

### Phase 1 — Classification through the stack

Depends on: nothing. Tags are the smaller of the two and prove the port-then-core-then-wire shape
before editing needs it. The sqlite store already has an `item_tags` table with the columns core's
`Tag` needs, so no migration is expected.

- [ ] Add the tag writes to `PoolTx`. The interface is deliberately partial and grows one slice at a
      time, so add what tagging needs and no more.
- [ ] Implement them in `@notemap/store-sqlite` over the existing `item_tags` table.
- [ ] Implement `items.tag` and `items.untag` in core: every tag records **which agent added it**,
      classifying does not remove an item from the queue, and both refuse under `TagRefusal` when the
      subject is missing or purged.
- [ ] Append an action for each, and enqueue a mirror job — tags are mirrored material
      ([core.md](../specs/core.md#the-mirror)).
- [ ] `git commit`.

**Verify:** `pnpm --filter @notemap/core test` and `pnpm --filter @notemap/store-sqlite test` green,
covering: a tag round-trips with its agent and time; tagging twice is idempotent rather than
duplicated; untagging a tag that is not there and tagging a purged item both refuse; a tagged item
stays in the queue; and each operation leaves an action and a pending mirror job.

### Phase 2 — Editing through the stack

Depends on: Phase 1, for the port-widening pattern. The harder half: one operation with two outcomes.

- [ ] Add the in-place item update `PoolTx` needs for amendment. A revision needs no new write —
      `insertItem` already carries `revisionOf`.
- [ ] Implement it in `@notemap/store-sqlite`.
- [ ] Implement `items.edit`, choosing between the two outcomes core already types
      (`EditOutcome`): **amend in place** when the item is the newest in the feed and still
      unprocessed, **append a revision** otherwise. Only a capture that becomes the new head seals
      it; there is no timeout.
- [ ] Carry the revision rules `core.md` sets out: it keeps the original's capture time and source
      identity, tags carry over with their attribution, routing records and archive state do not, and
      it starts unprocessed.
- [ ] Refuse under `EditRefusal`: a superseded item is `item-superseded`, a payload that fails its
      schema is `payload-invalid`, and a changed payload type is `payload-type-changed`.
- [ ] Append an action and enqueue a mirror job for either outcome.
- [ ] `git commit`.

**Verify:** `pnpm --filter @notemap/core test` green, covering: editing the unprocessed head amends
in place; editing once a later capture has taken the head appends a revision; a revision ties with
its original in the feed and is ordered after it by the revision link, not by id; the original is
excluded from the queue as superseded while the revision sits in it; editing a superseded item is
refused; a revision of an archived item is not archived; and both outcomes leave an action and a
pending mirror job.

### Phase 3 — The `/v1` surface

Depends on: Phases 1 and 2. `http-v1.md` currently lists tagging and untagging as still stub and does
not mention editing at all — the spec and the routes land together.

- [ ] Write the tagging, untagging and editing sections into
      [http-v1.md](../specs/http-v1.md), and move them out of its still-stub list.
- [ ] Add the new refusals to its refusal-to-status table. `payload-invalid` is already there at
      `422`; `item-superseded` and `payload-type-changed` are not.
- [ ] Implement the routes in `apps/daemon`, following the existing route modules, and regenerate
      `openapi.json`.
- [ ] `git commit`.

**Verify:** daemon route tests alongside the existing ones cover each route's success and each
refusal's status; `pnpm --filter @notemap/daemon test` green; the regenerated `openapi.json` is
committed and `openapi.test.ts` passes.

### Phase 4 — The client and the shell

Depends on: Phase 3, and on
[client-package-and-online-shell.md](client-package-and-online-shell.md) having landed the outbox
engine. This phase adds encoders to an engine that already exists.

- [ ] Encode `tag`, `untag` and `edit` as outbox operations against the new routes, reusing the
      engine's optimistic apply, in-order drain, rollback and operation-time ordering unchanged.
- [ ] Implement the **hand-over edit seal**: a pending capture is edited freely in place while its
      `capture` operation is still un-sent and may be discarded; the `POST` seals it, and an edit
      after that is sent as a domain `edit`, per
      [client.md](../specs/client.md#editing-and-the-hand-over-seal).
- [ ] Reconcile amend-versus-revise from the pool's ack rather than predicting it — the optimistic
      view may show an amendment and settle into a revision.
- [ ] Offer tagging on an item and editing in the shell.
- [ ] `git commit`.

**Verify:** `pnpm --filter @notemap/client test` covers the seal (free edit before send, domain edit
after) and reconciling an optimistic amendment into a revision, against a mock `Transport`. Against a
running daemon: a tag appears without a round trip and survives reload; editing the newest item keeps
it in place; editing an older one visibly becomes a revision.

---

## Unknowns

- **Whether amendment needs a distinct store write or is an `insertItem` variant.** Named in Phase 2
  as an in-place update because the head is one row. Fallback: if the store's item shape makes an
  update awkward, express amendment as a replace within the transaction — the outcome core reports
  is unchanged either way.
- **How a client's in-place edit is re-evaluated on arrival.** `core.md` says an edit from a client
  that cannot know whether it still holds the head is recorded as a revision if it no longer does.
  Whether the wire needs to carry the client's intent, or the pool simply decides from current state,
  is settled in Phase 3. Fallback: the pool decides unilaterally; the client already treats the
  outcome as the pool's call.
- **Tag idempotency semantics.** Whether re-tagging is a no-op or refreshes the attribution and time.
  `core.md` does not say. Phase 1 assumes no-op; if that is wrong, say so and amend `core.md` in the
  same change rather than encoding a second answer in the store.
- **Whether editing invalidates enrichment observably.** `core.md` says amending or revising
  invalidates enrichment attached to the old content, which becomes eligible to run again. Nothing
  runs enrichment yet, so this is a no-op today. Fallback: implement the invalidation only when the
  enrichment slice exists, and record here that Phase 2 deliberately left it.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Phases 1 and 2 carry the load: the amend-versus-revise decision, the revision's carry-over rules and
the ordering of a revision against its original are where this can quietly go wrong, and none of them
needs a daemon.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above** (`docs/specs/core.md`, `docs/specs/http-v1.md`,
`docs/specs/client.md`), dated, describing at a high level what landed and linking back to this plan.
No implementation details, no granular tasks. A plan marked Done whose spec has no matching
`Shipped:` entry is an error the `review` skill will flag.
