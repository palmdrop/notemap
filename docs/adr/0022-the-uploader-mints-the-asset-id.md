# 22. The uploader mints the asset id

**Date**: 2026-08-25
**Status**: Accepted
**Deciders**: palmdrop

---

## Context and problem statement

Every other identity a capture carries is the capturer's. A client mints its capture id so that a
replay after a lost response is harmless, and mints its source identity for the same reason
([core.md](../specs/core.md#intake-and-sync)). An asset's id was the one exception: bytes went up to
`POST /v1/assets`, the pool minted an id and answered it, and only then could a payload name the
asset it had just uploaded.

That ordering makes a capture with an attachment the one capture whose envelope cannot be written
until the pool has answered. An offline client can hold a `capture` operation and drain it later; it
cannot hold one that names an asset whose id does not exist yet. The upload is also the one
operation in the system that is not idempotent — the same bytes sent twice give two assets over one
blob, by design ([ADR 13](0013-assets-are-named-references-to-content-addressed-blobs.md)) — so a
retry after a lost response leaks an asset no capture will ever claim.

Who mints an asset's id?

---

## Decision drivers

- A capture's envelope should be complete the moment a person makes it, so that an attachment does
  not make capture depend on reachability.
- A lost response must be recoverable by resending the same request. That is what every other
  `/v1` mutation offers.
- Deduplication is the blob's job, not the asset's. Two names over one content are two assets, and
  that must stay true whoever mints the ids.

---

## Considered options

1. **Keep the pool minting**, and defer the upload into the outbox drain: the drain uploads, writes
   the minted id back into the pending capture operation, and then sends the capture.
2. **The uploader mints**, and `PUT /v1/assets/{id}` replaces `POST /v1/assets`.

---

## Decision outcome

Chosen: **the uploader mints**.

`PUT /v1/assets/{id}` takes the bytes under an id the caller chose. A first upload is `201` with
`Location`; the same bytes under the same filename and media type replayed under the same id is
`200` and the asset already held; anything else under an id already used is `409
asset-id-conflict`. All three fields are compared, because an asset is a *named* reference and both
the name and the media type are served back to a browser — a `PUT` that changed either would
rewrite what an existing capture points at.

Option 1 was rejected on the lost-response case, which is the case the whole design is for. If the
pool mints, then a drain that uploads, patches the capture operation and loses the capture's
response has to start again — and the second upload mints a *different* asset id. The capture is
then resent under its own unchanged id with a body that names a different asset, and the pool
refuses `capture-id-conflict` for a capture that landed perfectly well. The client cannot tell that
from a real conflict, and the item is stranded in the outbox. A client-minted asset id makes the
second attempt byte-identical to the first, so the capture replays as `already-captured` and the
upload as `already-stored`.

### Consequences

- **Good** — a capture with an attachment is an ordinary offline capture. The envelope names its
  assets before any bytes move, which is what [durable-offline-client](../plans/durable-offline-client.md)
  needs to queue one.
- **Good** — the upload becomes idempotent, and stops being the one mutation that is not. Retrying
  it no longer leaks an asset.
- **Good** — one rule for identity across the whole API: whoever makes the thing names it, and the
  pool refuses a name reused for different content.
- **Bad** — a new refusal for clients to read, and a three-field comparison in core that must stay
  in step with what an asset is. A field added to `Asset` that a client can set is a field this
  comparison has to grow.
- **Bad** — an id is now chosen by the caller, so a client can claim one another client would have
  minted. Accepted: a pool is single-tenant and self-hosted, ids are UUIDv7s, and a caller that can
  reach `/v1` at all can already capture anything it likes.
- **Bad** — a refused `PUT` has already written the blob, since the bytes are hashed before the
  transaction opens. Space rather than loss, no worse than the crash window that was there before,
  and deep verify's to reclaim rather than the sweep's ([core.md](../specs/core.md#archive-and-purge)).
- **Neutral** — the payload's asset reference still names a slot and an asset and nothing else. A
  client that mints the id now also knows the bytes, so it *could* carry the hash, but every
  failure that would catch still resolves elsewhere and the argument of 2026-08-11 is unchanged.

---

## Pros and cons of the options

### Keep the pool minting, and defer the upload into the drain

- **Good** — no wire change, and no new refusal.
- **Good** — the client never has to think about an id colliding.
- **Bad** — the lost-response case above, which turns a landed capture into a permanent conflict.
- **Bad** — the outbox would hold an operation whose body is rewritten between attempts, so "the
  same operation, sent again" stops being literally true and every idempotency argument that rests
  on it has to be made again for this one case.
- **Bad** — a retry still leaks an asset per attempt.

### The uploader mints

- **Good** — everything above.
- **Bad** — `PUT` under a caller's id means the pool must decide what a reused id means, and answer
  it consistently for the rest of time.

---

## More information

Does not disturb [ADR 13](0013-assets-are-named-references-to-content-addressed-blobs.md): an asset
is still a named reference to a content-addressed blob, and identical bytes under two names are
still two assets over one blob. Only who chooses the name of the reference changes.

Specified in [http-v1.md](../specs/http-v1.md#assets) and [core.md](../specs/core.md), and
built by [client-minted-assets-and-health](../plans/client-minted-assets-and-health.md).
