# Spec: HTTP API (`/v1`)

**Status**: Draft — capture, feed, assets and the action log are settled; the rest is stub
**Last updated**: 2026-08-12
**Shipped**:

- 2026-08-12 — **Assets are transferable.** `POST /v1/assets` takes the bytes raw under a required
  media type and filename, checks an optional `Repr-Digest` against what it received, and enforces
  a configured size limit against the stream. `GET /v1/assets/:id` answers the asset and
  `/content` the bytes — served honestly, with `nosniff`, a sandbox CSP, the blob hash as `ETag`
  and an immutable cache, and `inline` only for media that cannot execute. `asset-hash-mismatch`
  left the refusal table; `no-such-asset`, `blob-missing`, `asset-too-large`, `missing-filename`
  and `digest-mismatch` joined it. What none of this defends is now written down in
  [security.md](security.md). ([plan](../plans/asset-upload-and-images.md))
- 2026-08-12 — The action log is served: `GET /v1/actions`, newest first by default, paginated by
  position and narrowable with `item` — which is never validated, since the log outlives what it
  describes and an id no item has is an empty page rather than a `404`. The order, limit and
  position parsing is shared with the feed, and `next` carries whatever a surface pages by. A
  page at `/log` renders it, on the same host-surface terms as `/docs`.
  ([plan](../plans/action-log-feed.md))
- 2026-08-10 — The document is served with something that reads it: an OpenAPI playground at
  `/docs`, Swagger UI vendored out of `swagger-ui-dist` by the daemon's build step and pointed
  at `/v1/openapi.json`. Host surface, outside the contract and absent from the document.
- 2026-08-08 — The subset is served. `apps/daemon` is a real host: TOML config, the SQLite
  store, the ajv validator and UUIDv7 ids wired onto `createPool`, answering `POST
  /v1/captures`, `GET /v1/feed`, `GET /v1/items/:id` and `GET /v1/openapi.json` on localhost,
  with a throwaway capture-and-feed page at `/`. Implementation added `bad-limit` and
  `bad-order` to the refusal table and settled that the envelope is strict.
  ([plan](../plans/capture-feed-mvp.md))
- 2026-08-08 — The capture-and-feed subset is specified rather than stubbed: the two writes and
  two reads it needs, the error envelope and the full refusal-to-status table, pagination by
  position, transport and bind, and the OpenAPI document. Nothing is implemented yet; the
  daemon that answers these routes is
  [capture-feed-mvp.md](../plans/capture-feed-mvp.md) phase 3.
  ([plan](../plans/http-v1-subset-and-positions.md))

---

## Outcome

The daemon's HTTP surface: the only way into a pool over a network, and the interop contract
other software builds against. One versioned prefix, `/v1`, from the first commit.

---

## Scope

### In scope

- The `/v1` resource model: captures, items, feed, queue, tags, suggestions, artifacts,
  routing, archive, purge, assets, the action log.
- Pagination, error model, content types.
- Asset upload and download.
- The wire form of the sync surface — the protocol itself is [sync.md](sync.md).

### Out of scope

- Authentication and authorization — see the open question below; nothing for the first slice.
- Micropub — an intake adapter over the native envelope, never the primary API
  ([standards.md](../standards.md#the-ingestion-contract-the-inbox)).
- Webhooks or push of any kind; clients poll.

### Settled here, and what is still stub

Settled (2026-08-08): `POST /v1/captures`, `GET /v1/feed`, `GET /v1/items/:id`, the error
envelope and the complete refusal-to-status table, pagination by position, content types, the
bind address and port, and the OpenAPI document.

Settled (2026-08-11): asset upload and download — `POST /v1/assets`, `GET /v1/assets/:id` and
`GET /v1/assets/:id/content`, the upload's integrity check and size limit, and which media types
are served inline.

Settled (2026-08-11): `GET /v1/actions`, and the log page at `/log`.

Still stub, and unwritten below: the queue read, tagging and untagging, suggestions and their
decisions, artifacts and corrections, routing and destinations, archive and unarchive, purge and
tombstones, range requests over asset content, the wire form of sync delta reads, and
authentication. Nothing here forecloses them; they get the same treatment when their slice is
built.

**What this surface deliberately does not defend is written down**, rather than left to be
discovered: [security.md](security.md).

---

## Behavior

### Standing rules

- **Versioned from the first commit.** `/v1` may take breaking changes until the first pool
  exists that would be upsetting to lose; from then on breaking changes mean a new version and
  a changelog ([ADR 9](../adr/0009-versioned-api-mutable-until-first-real-pool.md)).
- **No authentication for now** (decided 2026-08-02). The daemon binds to localhost or a
  trusted network; the pool is the boundary.
- Every intake path produces the same capture envelope: a typed payload, the source, the
  source's own identifier, and the capture time ([standards.md](../standards.md)).
- A capture is identified by a client-generated id; submitting it twice has no additional
  effect.
- Reads of the feed and queue are ordered and paginated by **position**; core owns no cursor
  and no processing position ([ADR 10](../adr/0010-feed-and-queue-sort-differently.md),
  [ADR 14](../adr/0014-pagination-by-domain-position.md)).

### Transport

- **`application/json; charset=utf-8` in both directions.** A request with a body whose media
  type is anything but `application/json` is refused `415 unsupported-media-type`; a missing
  `Content-Type` on a request with a body is treated the same way. Parameters on the type are
  ignored, and so is the charset — the body is parsed as UTF-8 regardless.
- **The daemon binds `127.0.0.1` by default**, on port `4747`; both are configurable. It sends
  no CORS headers: nothing but a page it serves itself is meant to reach it, and adding the
  header is the moment to reconsider authentication rather than a convenience. Binding wider
  than localhost exposes an unauthenticated pool to whoever can reach the address — the
  configuration allows it, and nothing in `/v1` defends it.
- The capture page is served at `/`, the action log page at `/log`, and the playground at
  `/docs`. Everything the API itself answers is under `/v1`.
- An unknown path is `404 unknown-route`. A known path with the wrong method is `405`, carrying
  an `Allow` header listing the methods that path does answer. `OPTIONS` is one of them, and is
  answered `204` with the same `Allow`.

### Instants

Every time the API accepts — `capturedAt`, and the `at` of a position — is an **ISO 8601
instant**, and is stated back in the RFC 3339 UTC form core uses.

| Accepted | |
|---|---|
| `2026-08-08T09:00:00.000Z` | any fractional precision, or none |
| `2026-08-08T09:00Z` | seconds optional |
| `2026-08-08T09:00:00+02:00` | an offset, converted to UTC |
| `2026-08-08` | a date alone, meaning midnight UTC |

Everything else is refused — `Aug 8 2026`, `8/8/2026`, epoch seconds, and calendar impossibles
like `2026-02-31`, which a naive parser silently rolls over into March.

**A date-time without an offset (`2026-08-08T09:00:00`) is refused.** It names no instant: read
as UTC it is wrong for every client that meant local, and read as the daemon's own zone the
captured instant would depend on where the daemon happens to run. A client that means local time
says so with an offset, which is exact. The refusal is `400 malformed-envelope` with keyword
`format` for a capture, `422 bad-position` for a position.

What is accepted is wider than what is returned: the daemon normalises before core sees it, so a
`Timestamp` in the pool is always RFC 3339 UTC and a round trip returns the canonical spelling
rather than the one the client wrote.

### Captures

`POST /v1/captures`

The request body is core's `CaptureEnvelope` **verbatim** — no wrapper, no renaming:

```json
{
  "id": "0198f0c2-...",
  "source": "capture-page",
  "sourceItemId": "0198f0c2-...",
  "capturedAt": "2026-08-08T09:00:00.000Z",
  "payload": { "type": "text", "content": { "text": "a thought" },
               "metadata": {}, "assets": [] },
  "tags": ["kind/quote"]
}
```

- `201 Created` on a first capture. The body is the `CaptureOutcome` verbatim —
  `{ "kind": "captured", "item": { … } }` — and `Location: /v1/items/<id>` names the item.
- `200 OK` on a replay: `{ "kind": "already-captured", "item": { … }, "matchedOn": "id" }`,
  where `matchedOn` is `"id"` or `"source"`. No `Location`: nothing was created.
- A replay under an existing identity whose content differs is a refusal, not a success — `409`,
  see the table.

**A client that mints its own capture id supplies that same value as `sourceItemId`.** One
minted value fills both fields. The two identities answer different questions
([core.md](core.md#intake-and-sync)), but for a client that mints at the moment of capture they
have the same answer, and inventing a second value would only be a second thing to keep. A
passive source that is re-read rather than replayed omits `id` and supplies its own
`sourceItemId`, which is what the two fields are actually for.

### Items

`GET /v1/items/:id` — `200 OK` with the `Item` verbatim, or `404 no-such-item`.

In the subset because the capture page needs to read back what it just wrote, and because
`Location` on a `201` that resolves to nothing is a lie.

### The feed

`GET /v1/feed`

| Parameter | Default | Meaning |
|---|---|---|
| `order` | `newest-first` | `newest-first` or `oldest-first` |
| `limit` | `50` | 1–500 |
| `after` | *(absent)* | The position to continue from |

- **`limit` above 500 is refused, never clamped** — `422 limit-too-large`, carrying `limit` and
  `max`. A page silently smaller than asked for is a bug a client finds late, in production,
  by noticing rows it never saw; a refusal is found on the first call.
- **`after` is a position**, spelled `<at>,<id>` — an instant, a comma, then the id of the last
  row seen. Ids are arbitrary strings and may contain commas, so the split is on the **first**
  comma only; an instant contains none.
- **A bare instant is accepted as a coarse entry point**: `after=<at>` with no comma bounds
  the read on `at` alone, strictly. It may skip rows sharing the boundary instant, which is
  what "coarse" means and why a continuation always carries the id.
- A position that is not one of those two forms is `422 bad-position`.

The response is a slice:

```json
{
  "values": [ { … Item … } ],
  "next": "/v1/feed?order=newest-first&limit=50&after=2026-08-08T09%3A00%3A00.000Z%2C0198f0c2-..."
}
```

- `next` is a **ready-to-fetch relative URL** carrying the order, the limit and the next
  position, so a client pages by following a link rather than by reassembling a query it has to
  keep the parameters of.
- `next` is **absent on the last page**. There is never a trailing empty page: the daemon knows
  a page is the last one because core's slice says so, not because the next one came back
  empty.
- A position naming a row that no longer exists still works. It is a comparison, not a lookup
  ([ADR 14](../adr/0014-pagination-by-domain-position.md)).
- Both orders may be read from one position. It names a place in the feed, not a direction of
  travel — `newest-first` continues below it, `oldest-first` above it.

### Assets

Bytes go up in a request of their own and come back down under the filename they were uploaded
with. An asset is minted by the upload and referenced by a later capture; the reference is taken
when that capture commits, so an upload no capture ever claims is swept
([core.md](core.md#archive-and-purge)).

#### Upload

`POST /v1/assets` — **the body is the bytes, raw**. Not `multipart/form-data`.

| Header | | |
|---|---|---|
| `Content-Type` | required | The asset's media type, recorded and served back verbatim |
| `Content-Disposition` | required | `attachment; filename="…"`, or `filename*=UTF-8''…` |
| `Repr-Digest` | optional | RFC 9530, `sha-256=:…:`, checked against the bytes received |

`201 Created` with the `Asset` — `{ "id", "filename", "mime", "blob", "bytes" }` — and
`Location: /v1/assets/<id>`.

- **A raw body rather than multipart**, because Hono buffers a multipart body in order to parse
  it, and filename encoding in multipart is a swamp — where `Content-Disposition` has `filename*`
  for anything outside ASCII and the body streams straight into the hash. The cost is that a
  form with no JavaScript cannot upload, which nothing in scope needs.
- **A missing filename or a missing media type is refused, never invented.** A filename is user
  data ([ADR 13](../adr/0013-assets-are-named-references-to-content-addressed-blobs.md)) and the
  media type is served back to a browser, so a guess would be a lie the pool then stores. No
  `Content-Disposition`, or one with no `filename`, is `422 missing-filename`; no `Content-Type`
  is `415 unsupported-media-type`, the same answer any other bodied request gets for it.
- **`Repr-Digest` is recomputed server-side and compared before anything is minted**, which is
  S3's pattern and the one [asset-uploads.md](../research/asset-uploads.md#3-integrity-verification-on-upload)
  calls load-bearing: the proof is in the comparison, not in either side's number. Only
  `sha-256` is understood, being the hash notemap computes anyway; an entry naming any other
  algorithm is **ignored**, which is what RFC 9530 asks of a recipient that does not support one.
  A mismatch is `422 digest-mismatch` and stores no asset. Absent, the upload proceeds — the
  daemon still hashes, it simply has nothing to compare against.
- **A `sha-256` entry that cannot be read is refused, not ignored** — `422 bad-digest`, carrying
  the header as sent. The RFC's licence to ignore covers an algorithm the recipient does not
  support, not a supported one whose value is malformed: the value must be a byte sequence,
  `sha-256=:<32 base64 bytes>:`. Ignoring it would answer `201` to a client that believes its
  bytes were checked, which is the one outcome an integrity field must never produce.
- **The size limit is enforced against the stream**, not against `Content-Length`, which is a
  claim. An oversized body is `413 asset-too-large` carrying `max`, and leaves no blob and no
  asset. The limit is daemon configuration: a cap is interface policy, and core is a primitive
  API ([core.md](core.md#constraints)).
- `413` is the one status outside the rule below, and deliberately: a size limit is a transport
  fact that clients and proxies already act on, and answering `422` would hide it from the layer
  that could have stopped the upload early.
- **This is the one `/v1` path whose body is not JSON**, and the media-type guard carves it out
  by exact path rather than by prefix, so no other route quietly loses it.

#### Download

`GET /v1/assets/{id}` — `200 OK` with the `Asset` as JSON, or `404 no-such-asset`.

`GET /v1/assets/{id}/content` — the bytes.

- `Content-Type` is the media type recorded at upload, served honestly.
- `Content-Disposition` carries the filename, `filename*=UTF-8''…` encoded, and is `inline` or
  `attachment` per the allowlist below.
- `ETag` is the blob hash, and the response is `Cache-Control: private, max-age=31536000,
  immutable`. An asset id names one blob forever, so a cached copy can never be stale.
- `X-Content-Type-Options: nosniff` always, and
  `Content-Security-Policy: default-src 'none'; sandbox`.
- **No `Content-Length`.** It could only come from the row, and a read never rehashes, so a blob
  that drifted in size would advertise a length its bytes disagree with — a truncated transfer
  where a chunked one fails honestly.
- **Downloading does not verify.** Rehashing a blob to answer every `<img>` is not affordable, so
  `blob-drifted` cannot arise on a read; drift is what `verify` and deep mirror verification are
  for. Only two things can go wrong, and both are `404`, distinguished by code: `no-such-asset`
  for an id the pool does not hold, `blob-missing` for a row whose bytes are gone from disk.

#### Inline or attachment

**Anything may be uploaded; only inert things render.** The allowlist governs disposition alone —
a zip, an encrypted archive, raw binary all store and download normally.

Served **`inline`**: raster images (`image/png`, `image/jpeg`, `image/gif`, `image/webp`,
`image/avif`, `image/bmp`, `image/x-icon`, `image/vnd.microsoft.icon`), audio (`audio/mpeg`,
`audio/mp4`, `audio/aac`, `audio/ogg`, `audio/wav`, `audio/x-wav`, `audio/vnd.wave`,
`audio/webm`, `audio/flac`), video (`video/mp4`, `video/webm`, `video/ogg`), and `text/plain`.

Where one format has several registered spellings — ICO and WAV both do — every spelling is
listed. A missing one is fail-closed, and so downloads rather than rendering, but it is still
wrong: the media type is the uploader's and notemap does not normalise it.

Served **`attachment`**: everything else, so a media type nobody has thought about yet downloads
rather than executes. `text/html`, `application/xhtml+xml`, `image/svg+xml` and the XML types are
the named dangerous ones. `application/pdf` is an attachment too — a large attack surface, for a
format that is mostly documents on their way somewhere else.

The list is by **inertness**, not by image-ness, which is why `text/plain` is on it and
`image/svg+xml` is not.

**SVG is not sanitized.** Sanitizing mutates user data for one media type invisibly, every
sanitizer is a denylist wearing a parser, and doing it on the server needs a DOM there. It is
also unnecessary: an SVG loaded through `<img>` executes no script by specification, so a page
may display one safely, and the danger is top-level navigation — which `attachment` plus the
sandbox already covers.

### The action log

`GET /v1/actions`

| Parameter | Default | Meaning |
|---|---|---|
| `order` | `newest-first` | `newest-first` or `oldest-first` |
| `limit` | `50` | 1–500 |
| `after` | *(absent)* | The position to continue from |
| `item` | *(absent)* | Narrows the read to one subject |

- `order`, `limit` and `after` mean what they mean on the feed and are refused in the same ways.
  A position is `<at>,<id>`, or a bare instant as a coarse entry point.
- **`item` is neither validated nor refused.** Any string is a legal filter, and one that names
  nothing answers an empty page. The log outlives the material it describes
  ([core.md](core.md#the-action-log)), so a purged item's entries are a normal thing to ask for
  and `404 no-such-item` would be a lie about a log that holds them.

```json
{
  "values": [
    {
      "id": "0198f0c2-...",
      "kind": "captured",
      "subject": "0198f0c2-...",
      "by": { "kind": "source", "source": "capture-page" },
      "at": "2026-08-08T09:00:00.123Z",
      "detail": {}
    }
  ],
  "next": "/v1/actions?order=newest-first&limit=50&after=2026-08-08T09%3A00%3A00.123Z%2C0198f0c2-..."
}
```

- `at` is when the pool applied the action, which for a capture is its arrival and not the
  `capturedAt` its source reported.
- `by` is the agent, and unlike a tag's it may be `{ "kind": "notemap" }` — work core drives on
  nobody's behalf.
- `detail` is open JSON whose shape follows the kind. It carries facts and never a sentence, the
  same as an error body.
- `next` is a ready-to-fetch relative URL on the same terms as the feed's, carrying the order, the
  limit, the filter where there is one, and the next position. It is absent on the last page.

### Errors

Every error, from core or from the daemon, is one shape:

```json
{ "error": { "code": "unknown-payload-type", "type": "audio" } }
```

- `code` is the refusal's **`kind`, unchanged**. The remaining facts of the refusal are spread
  beside it.
- **There is no `message`.** A refusal carries facts, never a sentence
  ([core.md](core.md#constraints)); the daemon has no locale either, and rendering is the
  client's. A client that wants a sentence has everything it needs to write one.
- Errors the daemon mints itself — a malformed body, a limit it refuses, a route that does not
  exist — use the same grammar, so a client parses one shape.

| Status | `code` | Facts | Raised by |
|---|---|---|---|
| `400` | `malformed-json` | — | daemon |
| `400` | `malformed-envelope` | `issues` (`SchemaIssue[]`) | daemon |
| `404` | `unknown-route` | `path` | daemon |
| `404` | `no-such-item` | `item` | daemon |
| `404` | `no-such-asset` | `asset` | core |
| `404` | `blob-missing` | `blob` | core |
| `405` | `method-not-allowed` | `method`, `allow` | daemon (+ `Allow` header) |
| `409` | `capture-id-conflict` | `existing` | core |
| `409` | `source-item-changed` | `existing` | core |
| `413` | `asset-too-large` | `max` | daemon |
| `415` | `unsupported-media-type` | `contentType` | daemon |
| `422` | `limit-too-large` | `limit`, `max` | daemon |
| `422` | `bad-limit` | `limit` | daemon |
| `422` | `bad-order` | `order`, `allowed` | daemon |
| `422` | `bad-position` | `after` | daemon |
| `422` | `missing-filename` | — | daemon |
| `422` | `bad-digest` | `digest` | daemon |
| `422` | `digest-mismatch` | `expected`, `actual` | daemon |
| `422` | `unknown-payload-type` | `type` | core |
| `422` | `payload-invalid` | `issues` | core |
| `422` | `missing-asset-slot` | `slot` | core |
| `422` | `unknown-asset` | `asset` | core |

The rule behind the table, so a refusal added later has a status without a decision being
needed: **`409` is for a conflict with something the pool already holds** — the request is
well-formed and the client may have to reconcile. **`400` is for a body the daemon could not
read as an envelope at all**, which is a shape problem and never reaches core. **`422` is
everything else core or the daemon refused**: the request was understood and declined. Anything
outside the table is a bug, and is `500` with no body — a daemon that turns an unexpected
throw into a domain-looking refusal teaches clients to trust a fiction.

`413 asset-too-large` is the single deliberate exception, for the reason given above: a size
limit is a fact the transport layer acts on, and hiding it inside `422` would cost a client the
chance to stop an upload early.

**`asset-hash-mismatch` is gone** (2026-08-11). A payload's asset reference no longer carries a
blob hash, so there are no longer two numbers for the daemon to disagree about — and every
failure that refusal claimed to catch resolves elsewhere ([core.md](core.md#the-mirror)).
Integrity moved to the upload, where the client's number and the server's are genuinely
independent.

`malformed-envelope` reports its problems as `SchemaIssue` — `{ path, keyword }` — the same
shape `payload-invalid` uses, because a client rendering one has then rendered both. `path` is
a JSON Pointer and `keyword` names the rule that failed, in JSON Schema's vocabulary wherever
one applies, so the two do not merely share a shape but a language.

**The envelope is strict**: a key `/v1` does not know is `400 malformed-envelope` naming that
key, not a key quietly dropped. A client that misspells `capturedAt` would otherwise file every
capture at the wrong time and never be told. This is affordable because `/v1` may still take
breaking changes ([ADR 9](../adr/0009-versioned-api-mutable-until-first-real-pool.md)); a
version that has to evolve additively will have to revisit it.

A parameter is refused the same way as a body: a `limit` that is not a positive count is
`bad-limit`, an `order` that is not one of the two is `bad-order` carrying the ones that are.
Both are `422` by the same rule as the rest — the request was understood and declined.

### The OpenAPI document

`GET /v1/openapi.json` serves an **OpenAPI 3.1** description of everything above. It is part of
the contract, not documentation beside it: it is **generated** from the route definitions —
Hono with `@hono/zod-openapi` — and **checked into the repo**, so a change to a route that
changes the document shows up in the diff of the change that caused it.

Generating clients or hooks from the document is deliberately deferred. The document exists so
that it can be, and so that anything speaking OpenAPI can read this API without the spec.

### The playground

`GET /docs` is a **Swagger UI page the daemon serves itself**, reading `/v1/openapi.json` from
the daemon that served it. It describes the daemon that is running rather than a copy of it, and
requests it issues are same-origin — which is the only way a browser can execute them against an
API that sends no CORS headers. A playground on any other origin could render the document and
never call it.

Its script and stylesheet are **vendored, never fetched from a CDN**: a local-first daemon that
reaches a third party in order to describe itself is not one, and the playground has to work on
a machine with no route to the internet. The daemon's build step copies them out of
`swagger-ui-dist`; they are not checked in. A `/docs` path naming anything else is
`404 unknown-route` — the request names one of two files, not a path into the filesystem.

The playground is **host surface, not contract**. It is absent from the document, nothing in
`/v1` refers to it, and removing it changes no promise this spec makes. `/v1/openapi.json`
remains the interop surface; `/docs` is a convenience over it.

### The log page

`GET /log` is a page the daemon serves itself, reading `GET /v1/actions` from the daemon that
served it and paging by following `next`. It exists so that the log can be looked at without a
database client, which is the difference between a trace that is kept and one that is read.

It is **host surface on the same terms as the playground**: absent from the document, referred to
by nothing in `/v1`, and removable without changing a promise this spec makes.

---

## Constraints

- The daemon is one host among several and holds no logic of its own; every endpoint is a thin
  translation onto the core library ([ADR 2](../adr/0002-core-is-a-host-agnostic-library.md)).
  The `next` URL is the one thing the daemon composes rather than passes through, and it
  composes it from the position core handed back.
- **Daemon configuration is TOML** (decided 2026-08-08): comments survive a hand-edit, and it
  is the format a self-hosted single-file config is least annoying to write by hand. The host
  reads it; core takes it as data ([core.md](core.md#constraints)).
- The daemon mints UUIDv7 with the `uuid` package. The static capture page hand-rolls v7 inline
  — a build step for one function would cost more than the function does.

---

## Open questions

- [ ] 2026-08-02 — The resource model and endpoint shapes for everything outside the
      capture-and-feed subset, verb by verb.
- [ ] 2026-08-02 — **Range requests** over `GET /v1/assets/:id/content`. Upload and download are
      settled; this is what is left of the question. Nothing needs it while assets are images —
      a browser fetches one whole — and **audio is what will force it**: seeking in a long
      recording without `Range` means downloading the whole file to hear the last minute of it.
      Resumable *uploads* are separately out, per
      [asset-uploads.md](../research/asset-uploads.md#2-resumablechunked-upload-standards).
- [ ] 2026-08-02 — Authentication: how clients hold credentials, and how the Micropub
      adapter's OAuth2 expectations relate to the native API. (Moved from core.md.) What the
      absence of it currently leaves open is enumerated in [security.md](security.md), which is
      the list this question has to close.
- [ ] 2026-08-08 — Whether a read may ask for a page *before* a position as well as after it.
      Nothing needs it yet; a feed that can only be walked one way is a limit worth noticing
      before a client works around it.

---

## Acceptance criteria

- A capture posted twice returns `201` and then `200 already-captured`, and the pool holds one
  item.
- A capture posted twice under one id with differing content returns `409 capture-id-conflict`
  and changes nothing.
- Every `CaptureRefusal` kind maps to exactly one status in the table above, and its body
  carries the refusal's facts under `error` with `code` equal to its `kind`.
- A body that is not JSON returns `400 malformed-json`; a JSON body that is not an envelope
  returns `400 malformed-envelope` with `issues`.
- A request with a body and no `application/json` content type returns `415`; `text/json` is
  one of the types refused.
- `capturedAt` accepts an offset and stores the instant it names in UTC; a date alone is
  midnight UTC; `2026-08-08T09:00:00` with no offset, `Aug 8 2026` and `2026-02-31` are all
  `400 malformed-envelope` with keyword `format`.
- `OPTIONS` on a known path returns `204` and an `Allow` header; on an unknown path, `404`.
- A path that merely resembles a route — `/v1/openapiXjson` — returns `404 unknown-route`,
  never a `405` listing the method that was just refused.
- `GET /v1/feed` with no parameters returns the 50 newest items and, where more exist, a `next`
  URL that fetches the next 50 without further assembly.
- Following `next` until it is absent yields every item exactly once, in order, and no trailing
  empty page.
- `limit=501` returns `422 limit-too-large`; no request ever returns more rows than asked for
  or silently fewer.
- A position whose row has been purged still continues the feed from that place.
- A position taken from a `newest-first` read continues an `oldest-first` read from the same
  place, in the other direction.
- `GET /v1/items/:id` returns the item captured a moment earlier at exactly the path the
  capture's `Location` header named.
- An unknown path returns `404 unknown-route`; a known path with the wrong method returns `405`
  with an `Allow` header.
- `GET /v1/openapi.json` returns a valid OpenAPI 3.1 document describing every route above, and
  it matches the copy checked into the repo.
- `GET /v1/actions` with no parameters returns the 50 newest entries, newest first, and the entry
  for a capture carries the instant the daemon received it rather than its `capturedAt`.
- `GET /v1/actions?item=<id>` returns that subject's entries and no others, and following `next`
  carries the filter with it.
- An `item` no pool item has returns `200` with an empty page, never `404`; an item purged after
  its entries were written still returns them.
- `GET /docs` returns a page that loads its script, its stylesheet and the OpenAPI document from
  the daemon itself, and nothing from anywhere else.
- `GET /log` returns a page that loads nothing from anywhere but the daemon, and renders entries
  it read from `GET /v1/actions`.
- A `/docs` path naming anything but the vendored Swagger UI files returns `404 unknown-route`,
  and no `/docs` path reaches a file outside the vendored directory.
- Neither the playground nor the log page appears anywhere in `GET /v1/openapi.json`.
- Bytes uploaded to `POST /v1/assets` come back from `GET /v1/assets/:id/content` byte for byte,
  under the filename they were uploaded with, for content that is not valid UTF-8 and for a
  filename that is not ASCII.
- The same content uploaded twice under two filenames returns two asset ids sharing one blob
  hash, and each download returns its own name.
- An upload with no `Content-Disposition` filename is `422 missing-filename`; one with no
  `Content-Type` is `415`; neither stores anything.
- An upload whose `Repr-Digest` disagrees with the bytes received is `422 digest-mismatch` and
  stores nothing.
- A `Repr-Digest` whose `sha-256` value is unreadable — not base64, the wrong length, or missing
  the byte-sequence colons — is `422 bad-digest` and stores nothing, where one naming only an
  algorithm notemap does not compute is ignored and the upload succeeds.
- A body over the configured limit is `413 asset-too-large` and leaves no blob behind, whatever
  `Content-Length` claimed.
- A JSON body posted to `/v1/captures` still requires `application/json`, unaffected by the
  upload path's carve-out.
- An uploaded `text/html` file is served `Content-Disposition: attachment`; an uploaded
  `image/png` is served `inline`. Both carry `nosniff` and the sandbox CSP.
- Every registered spelling of a format on the allowlist is served `inline` — both ICO spellings
  and all three WAV ones.
- No asset content response carries a `Content-Length`.
- `GET /v1/assets/:id` for an id the pool does not hold is `404 no-such-asset`; an asset whose
  blob has been deleted from disk is `404 blob-missing` on its content.
