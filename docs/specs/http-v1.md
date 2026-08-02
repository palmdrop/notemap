# Spec: HTTP API (`/v1`)

**Status**: Stub — to be written properly in a dedicated grilling session
**Last updated**: 2026-08-02
**Shipped**:

---

## Outcome

The daemon's HTTP surface: the only way into a pool over a network, and the interop contract
other software builds against. One versioned prefix, `/v1`, from the first commit.

---

## Scope

### In scope

- The `/v1` resource model: captures, items, feed, queue, tags, suggestions, artifacts,
  routing, archive, purge, assets.
- Pagination, error model, content types.
- Asset upload and download.
- The wire form of the sync surface — the protocol itself is [sync.md](sync.md).

### Out of scope

- Authentication and authorization — see the open question below; nothing for the first slice.
- Micropub — an intake adapter over the native envelope, never the primary API
  ([standards.md](../standards.md#the-ingestion-contract-the-inbox)).
- Webhooks or push of any kind; clients poll.

---

## Behavior

What is already settled, extracted from [core.md](core.md) and the ADRs. Everything else in
this spec is unwritten.

- **Versioned from the first commit.** `/v1` may take breaking changes until the first pool
  exists that would be upsetting to lose; from then on breaking changes mean a new version and
  a changelog ([ADR 9](../adr/0009-versioned-api-mutable-until-first-real-pool.md)).
- **No authentication for now** (decided 2026-08-02). The daemon binds to localhost or a
  trusted network; the pool is the boundary.
- Every intake path produces the same capture envelope: a typed payload, the source, the
  source's own identifier, and the capture time ([standards.md](../standards.md)).
- A capture is identified by a client-generated id; submitting it twice has no additional
  effect.
- Reads of the feed and queue are ordered and paginated; core owns no cursor or processing
  position ([ADR 10](../adr/0010-feed-and-queue-sort-differently.md)).

---

## Constraints

- The daemon is one host among several and holds no logic of its own; every endpoint is a thin
  translation onto the core library ([ADR 2](../adr/0002-core-is-a-host-agnostic-library.md)).

---

## Open questions

- [ ] 2026-08-02 — The resource model and endpoint shapes, verb by verb.
- [ ] 2026-08-02 — Pagination shape, and how a feed page behaves when offline sync inserts
      items behind an already-consumed position.
- [ ] 2026-08-02 — Error model: shape, codes, how a destination's refusal of a payload type
      surfaces.
- [ ] 2026-08-02 — Asset transfer: upload flow, download, range requests for audio playback.
- [ ] 2026-08-02 — Authentication: how clients hold credentials, and how the Micropub
      adapter's OAuth2 expectations relate to the native API. (Moved from core.md.)

---

## Acceptance criteria

To be written with the endpoint shapes.
