# Spec: HTTP API (`/v1`)

**Status**: Draft — capture, feed, assets, the action log, the queue, the archive, classification,
editing, destinations, routing to one and health are settled; the rest is stub
**Last updated**: 2026-08-31
**Shipped**:

- 2026-09-01 — **Every `/v1` write declares its media type, carrying a body or not.** The rule
  used to skip the routes that read no body and the ones whose optional body was absent, which
  left `.../archive`, `.../unarchive`, `.../mark-processed`, `.../retire`, `.../unretire` and
  `.../cancel` reachable as a simple cross-site `POST`. They are now asked for `application/json`
  like everything else, so a cross-origin write is preflighted and dies on the CORS headers the
  daemon does not send. ([plan](../plans/login-and-access-tokens.md))

- 2026-08-31 — **A destination can be asked what a field could hold.**
  `GET /v1/destinations/{id}/candidates` sits beside `/description`: the capability, the field and
  an opaque scope as query parameters, capped rather than paginated. The route checks the
  capability and the field itself before the destination is asked anything — `422
  capability-undeclared` and the new `422 field-not-askable` — and otherwise answers `200` with
  entries, or `unreachable`, `unusable` or `not-offered`, on `/description`'s own terms.
  ([plan](../plans/destination-targets.md),
  [ADR 26](../adr/0026-a-destination-can-be-asked-what-an-argument-could-hold.md))

- 2026-08-31 — **`arguments` replaces `target` on the wire.** `POST /v1/items/{id}/route`'s body
  and what a `destination` routing record carries under its own `target` field now name it
  `arguments`, and `targetSchema` in a `Capability` is `argumentsSchema`. The refusal joins it:
  `target-invalid` is `arguments-invalid`. A routing record's `target` field itself is unchanged —
  that names the destination-or-user a record resolves to, which is the sense CONTEXT.md's
  glossary keeps the word for. No behaviour changed.
  ([plan](../plans/destination-targets.md))

- 2026-08-31 — **`/v1` is behind a credential.** The 2026-08-02 decision that there is no
  authentication is revised: `401 unauthenticated`, `403 session-required`, `422 not-a-session` and
  `429 too-many-attempts` join the status table, `/v1/session`, `/v1/sessions` and `/v1/tokens`
  join the routes, and health answers liveness without the pool identity to a caller outside the
  door. The pages the daemon serves stay open; everything they ask for does not.
  ([plan](../plans/login-and-access-tokens.md), [ADR 27](../adr/0027-the-daemon-authenticates-and-core-does-not.md))

- 2026-08-27 — **`GET /v1/health` answers the daemon's version**, baked in at bundle time from the
  workspace version and matching the image tag. Amends this document's own line that nothing but
  the pool identity belonged there: a container behind a proxy has an operator, and they have to be
  able to ask what is running. ([plan](../plans/run-story.md))

- 2026-08-25 — **The uploader mints the asset id.** `PUT /v1/assets/{id}` replaces
  `POST /v1/assets`: the bytes still go up raw under the same headers, but under an id the caller
  chose, so a capture's envelope can name its assets before anything is sent. A first upload is
  `201` with `Location`, an identical one replayed under that id is `200`, and an id already naming
  something else is `409 asset-id-conflict`. The raw-body carve-out in the media-type guard matches
  a method and a path pattern now that the path carries an id.
  ([plan](../plans/client-minted-assets-and-health.md),
  [ADR 22](../adr/0022-the-uploader-mints-the-asset-id.md))

- 2026-08-25 — **The daemon says which pool it is holding.** `GET /v1/health` answers that it is up
  and the identity of the pool behind it — the identity [mirror.md](mirror.md) has claimed is
  readable since 2026-08-11 and nothing served. It has no refusals and no parameters, and no client
  reads it yet: what a client does with a pool identity is
  [durable-offline-client](../plans/durable-offline-client.md)'s.
  ([plan](../plans/client-minted-assets-and-health.md))

- 2026-08-24 — **The edit route carries an envelope, and an item names its revisions.**
  `POST /v1/items/{id}/edit` takes the source making the edit and that source's own id for it
  beside the payload, so an edit resent after a lost response answers with the revision it already
  made; an envelope claiming an identity another item holds is `409 source-item-changed`. An item
  spells `revisedInto` as a list of ids, the revised half of the outcome carries `revisionOf`, and
  `409 item-superseded` left both the edit route and the two classification routes. The queue's
  position is a capture time now, the same key the feed and the archive read.
  ([plan](../plans/editable-until-processed.md),
  [ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md))

- 2026-08-18 — **Destinations are edited over `/v1`, and wiring one is no longer a restart.**
  `GET /v1/destinations` answers rows the pool holds — instantly, unpaginated, retired ones
  included, probing nothing — and what one can *do* moves to
  `GET /v1/destinations/{id}/description`, so a settings screen never stalls on an unmounted drive.
  Create, edit, retire, unretire and delete sit beside them, with `GET /v1/destination-kinds`
  publishing the schema a client builds its form from. `[[destinations]]` leaves `config.toml`,
  and an unrecognised key there is now named in a startup warning and ignored rather than refusing
  to start — while a key the daemon knows, with a value it cannot honour, still refuses.
  ([plan](../plans/destinations-in-the-pool.md),
  [ADR 20](../adr/0020-destinations-are-pool-state.md))

- 2026-08-17 — **Tagging, untagging and editing are on the wire.**
  `POST /v1/items/{id}/tag` and `/untag` carry the tag in the **body**, because a namespaced tag has
  a slash in it and a path segment cannot hold one without an encoding every layer has to agree to
  leave alone; both absorb a call for what the item already says rather than refusing it, and
  neither carries an agent — with no authentication a tag added here is an anonymous person, as
  archiving and routing already are. `POST /v1/items/{id}/edit` takes the payload **verbatim** and
  answers the `EditOutcome`, so a client reads amend-versus-revise off the pool rather than
  declaring an intent it cannot know is still true. `item-superseded` joined the refusal table at
  `409` and `payload-type-changed` at `422`, both by the rule already written.
  ([plan](../plans/editing-and-classification.md))

- 2026-08-17 — **The document is what the client's refusals are checked against.** Every code the
  document declares now has a reading in the client, derived from the generated types rather than
  listed by hand, so adding a code to a route obliges a client to say what it means. The UUIDv7 note
  below is revised: minting comes from a package on both sides of the wire. See
  [client-review-fixes.md](../plans/client-review-fixes.md).

- 2026-08-14 — **Items can be routed out over the wire.** `GET /v1/destinations` reports what each
  wired adapter declares, capabilities and argument schemas and all, so a client builds arguments
  from the destination's own terms rather than from anything `/v1` holds.
  `POST /v1/items/{id}/route` records the decision and attempts the delivery inline — and **may
  answer a record that has not landed**, which is written down rather than left to be discovered:
  `state` is `pending` when the destination could not be reached, and a client reading a record as
  arrival is wrong exactly when one is down.
  `POST /v1/routing/{record}/cancel` calls off a pending delivery and answers `204`, being the one
  path that names a single routing record. `PreparationRefusal`, `AttemptFailure` and
  `CancelRefusal` joined the refusal table, all decided by the status rule already written.
  *(Amended 2026-08-17: describing a destination is asynchronous, as `core.md` already required, so
  `GET /v1/destinations` reports one that could not answer as `undescribable` rather than dropping
  it, and `POST /route` refuses `422 unreachable` when it cannot read a destination's capabilities
  at all.)* ([plan](../plans/destination-fs.md))
- 2026-08-14 — **The queue and the archive are served, and so are the decisions that drain them.**
  `GET /v1/queue` and `GET /v1/archived` page oldest first from a **content-time** position, which
  is spelled exactly like the feed's and means something else — nothing in the wire form can tell
  the two apart, so the consequence is written down rather than defended against
  *(reversed 2026-08-24: the key is capture time, the feed's own, and the three surfaces are one
  ordering)*. Neither takes an `order` *(reversed 2026-08-17: both do, defaulting to oldest first)*.
  `POST /v1/items/:id/archive`, `/unarchive` and `/mark-processed` each take an optional
  strict JSON body, so a decision with nothing to add sends nothing, and
  `GET /v1/items/:id/routing` answers where an item has been — refusing an id the pool does not
  hold, unlike the action log, because routing records are the item's own state and go when it
  does. `already-archived` and `not-archived` joined the refusal table at `409`; `item-purged`
  joined it at `404`, ahead of the purge that will raise it.
  ([plan](../plans/queue-drains.md))
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
  *Superseded 2026-09-02*: `/log` is a route of the app, not a page the daemon serves. What this
  spec promised is `GET /v1/actions`, which is unchanged.
  ([plan](../plans/log-in-the-shell.md), [ADR 30](../adr/0030-the-action-log-is-a-shell-surface.md))
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
- 2026-08-18 — **The surface is exercised end to end.** A seeder fills a pool over `/v1` alone —
  queued, processed, archived, an image with its bytes, and one item routed to each destination the
  daemon reports — and backs both the full-stack suite and `pnpm seed` for a development pool. CI
  now also regenerates the client's types from the OpenAPI document and fails on a diff, so a
  document that is current cannot sit beside types that are not.
  (plan: `docs/plans/complete-integration-tests.md`)

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

Settled (2026-08-11, amended 2026-08-25): asset upload and download — `PUT /v1/assets/{id}`,
`GET /v1/assets/:id` and
`GET /v1/assets/:id/content`, the upload's integrity check and size limit, and which media types
are served inline.

Settled (2026-08-11, amended 2026-09-02): `GET /v1/actions`. The page at `/log` was the daemon's
until 2026-09-02 and is the app's now, which this spec does not describe.

Settled (2026-08-14): `GET /v1/queue` and `GET /v1/archived`, both paginated by a capture-time
position *(the key was content time until 2026-08-24)*; archiving and unarchiving an item; marking
one processed by hand; and reading an item's routing records.

Settled (2026-08-14): `GET /v1/destinations`, `POST /v1/items/{id}/route` — whose response may name
a delivery that has not happened yet — and `POST /v1/routing/{record}/cancel`
([ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)).

Settled (2026-08-17): `POST /v1/items/{id}/tag` and `/untag`, and `POST /v1/items/{id}/edit`,
whose answer says whether the edit became an amendment or a revision.

Settled (2026-08-20): `GET /v1/tags`, and `routing` on the `Item` — a summary of where an item has
been, carried by every read that answers items.

Settled (2026-08-25, amended 2026-08-27): `GET /v1/health` — that the daemon is up, which pool it
is serving, and its own version.

Still stub, and unwritten below: suggestions and their decisions, artifacts and corrections, purge
and tombstones, range requests over asset content, the wire form of sync delta reads, and
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
- **The daemon authenticates** (decided 2026-08-27, revising 2026-08-02's "no authentication for
  now"). One middleware over `/v1` takes either a session cookie or `Authorization: Bearer`, and a
  request carrying neither is `401 unauthenticated` in this document's own refusal envelope. A
  daemon nobody has set a password on asks for nothing and behaves exactly as it did before. The
  rest of this document still describes the undefended daemon in places; see
  [the login plan](../plans/login-and-access-tokens.md).
- Every intake path produces the same capture envelope: a typed payload, the source, the
  source's own identifier, and the capture time ([standards.md](../standards.md)).
- A capture is identified by a client-generated id; submitting it twice has no additional
  effect.
- Reads of the feed and queue are ordered and paginated by **position**; core owns no cursor
  and no processing position ([ADR 10](../adr/0010-feed-and-queue-sort-differently.md),
  [ADR 14](../adr/0014-pagination-by-domain-position.md)).

### Transport

- **`application/json; charset=utf-8` in both directions, declared whether or not anything is
  carried.** Every `POST`, `PUT` and `PATCH` under `/v1` states its media type, and one that is
  anything but `application/json` — or absent — is refused `415 unsupported-media-type`. That
  holds for the routes reading no body at all, which have nothing to be wrong about and are asked
  anyway: a media type no HTML form can send is what makes a browser preflight a cross-origin
  write, and a preflight is what the daemon refuses by sending no CORS headers
  ([security.md](security.md#no-cors-headers-which-is-load-bearing)). The upload is the one
  exception, and it is a `PUT` carrying bytes under their own type, which no form can send either.
  Parameters on the type are ignored, and so is the charset — the body is parsed as UTF-8
  regardless.
- **The daemon binds `127.0.0.1` by default**, on port `4747`; both are configurable. It sends
  no CORS headers: nothing but a page it serves itself is meant to reach it, and adding the
  header is the moment to reconsider authentication rather than a convenience. Binding wider
  than localhost exposes an unauthenticated pool to whoever can reach the address — the
  configuration allows it, and nothing in `/v1` defends it.
- The app is served at `/` and every path of its own it routes, and the playground at `/docs`.
  Everything the API itself answers is under `/v1`.
- **The pages the daemon serves stay reachable without a credential, and what they ask for does
  not.** The app and `/docs` are files: they are the application, not the pool, and something
  has to be able to draw a login. Each draws nothing until it calls `/v1`, and every one of those
  calls is behind the door — an unauthenticated app is a surface that reports a refusal rather
  than one full of somebody's material. Shutting them would also answer a person a JSON refusal
  where they asked a browser for a page. `/v1/openapi.json` is open for the same reason and one
  more: it describes the routes and never the pool, so closing it would break a signed-out
  operator's only way to read the API without withholding anything the source does not say.
- **`GET /v1/health` is open, and answers less from outside.** The shell probes it to tell a
  closed door from a daemon that is down, so a `401` here would make the two look alike. It
  answers liveness and the version to anyone; `pool` is omitted where a password is set and
  nothing was presented, because which pool this is, is a fact about the pool. Where no password
  is set there is no door to be outside of, and it answers everything as it always did.
- An unknown path **under `/v1`** is `404 unknown-route`. A known path with the wrong method is
  `405`, carrying an `Allow` header listing the methods that path does answer. `OPTIONS` is one
  of them, and is answered `204` with the same `Allow`.
- **An unknown path outside `/v1` answers the app's shell**, `200 text/html`, so that the app
  can route it in the browser — its own paths exist nowhere else. A path carrying a file
  extension is exempt and stays a `404`: answering the shell there hands a browser HTML where
  its own markup told it to expect a script. A daemon built without an app answers `404` to
  both, and serves `/v1` unchanged.

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

### Health

`GET /v1/health` — that the daemon is up, which pool it is holding, and what it is.

```json
{ "pool": "a1c9f2e4-6b30-4d51-9e7a-2f8b40c1d6e3", "version": "0.2.0" }
```

- **Liveness is the `200` itself.** The route has no refusals: a daemon that cannot answer is not
  answering, and a body reporting its own unhealthiness would be a fiction the connection already
  disproved.
- **The version is the release the daemon was built from** — the workspace version, baked in at
  bundle time, and the same number the image is tagged with. It says what this daemon *is*, never
  anything about the pool: an upgrade changes it and nothing in the pool moves. A daemon that was
  not built — a test run, or the source run directly — answers `0.0.0-dev`, because a number there
  would be a claim about a release nobody cut.
- *Amended 2026-08-27.* This section previously said nothing else belonged in the response, "no
  version, no schema number, no uptime — because nothing asks for those yet". Something does now:
  the daemon is deployed as a container behind a proxy ([security.md](security.md)), and the person
  running it has to be able to ask what is running rather than infer it from an image tag that
  `latest` makes a lie. The reasoning stands for schema number and uptime, which stay out.
- **The pool identity is opaque**, minted with the pool and stable for as long as that pool exists.
  It says *which* pool, never anything about it: not its age, not its size, and not the daemon
  serving it. Two daemons over one pool answer one identity.
- **A rebuilt pool answers a different identity**, because a rebuild makes a new pool
  ([mirror.md](mirror.md)). That is the whole point of serving it: a client holding anything it read
  from a pool — a cached window, a delta cursor — can tell that what it holds describes somewhere
  else. What it should then do is [sync.md](sync.md)'s open question, and unanswered.
- It takes no parameters and is not paginated.

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

In the subset because the app needs to read back what it just wrote, and because `Location` on a
`201` that resolves to nothing is a lie.

**An `Item` carries `routing` wherever one is answered** — the item route, the feed, the queue, the
archive, a capture outcome, an edit outcome:

```json
{ "routing": { "records": 2, "pending": 1,
               "to": [ { "kind": "destination", "destination": "0198f0c2-..." },
                       { "kind": "user" } ] } }
```

- **Absent where the item has been nowhere**, like `archived`, rather than present and zeroed.
  `revisedInto` is the exception and is **always spelled, empty where nothing was revised from the
  item** (amended 2026-08-24): it is a list, whose empty is a value rather than a claim, and every
  reader of it asks for its length.
- `to` is **distinct and in the order the records were made**, and names a destination by id: a
  client resolves the name from `GET /v1/destinations`, which it already reads, and a record's
  capability, arguments and pointer are not here.
- **`pending` is what has not landed**, on the same terms as a record's `state`. It is the whole of
  what a row can say about arrival; `GET /v1/items/{id}/routing` is what says which record.
- A summary saying nothing and one saying `records: 0` are the same claim, so only the first is
  spelled — a cancelled last reservation takes the field away again.

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

### The queue and the archive

`GET /v1/queue` — every item that is unprocessed, oldest first by default. Unprocessed is the
whole of the filter: archived, routed and revised items are all processed.

`GET /v1/archived` — every archived item, on the same key and the same default.

| Parameter | Default | Meaning |
|---|---|---|
| `order` | `oldest-first` | `oldest-first` or `newest-first` |
| `limit` | `50` | 1–500 |
| `after` | *(absent)* | The position to continue from |

- **Both take `order`, defaulting to oldest first** (decided 2026-08-17). Oldest first is what
  makes the queue a queue and stays the default, but which end a reader starts from is the
  reader's, as it is for the feed and the log — a person clearing a backlog may want the newest
  captures first, and core imposes no interface policy
  ([ADR 10](../adr/0010-feed-and-queue-sort-differently.md), superseded in part).
- `order`, `limit` and `after` mean what they mean on the feed and are refused in the same ways: an
  `order` that is neither value is `422 bad-order` carrying the ones that are.
- The response is a slice of items with a `next` URL, on the same terms as the feed's: ready to
  fetch, and absent on the last page.

**The queue's position is a capture time** (amended 2026-08-24), spelled `<at>,<id>` exactly as
the feed's is and meaning the same thing. The queue, the feed and the archive are now one ordering
read through three filters, so a position taken from any of them continues any other from the same
place. It says less than it looks: an item is in exactly one of the queue and the archive, so a
position carried across still lands where it belongs in the order and answers about a different
set. A client pages by following `next`, which is issued by the surface it came from.

This replaces the content-time key, which existed so that a revised item resurfaced where it would
be met. A revision is an ordinary capture now and arrives at the newest end by its own time, so the
second key is no longer buying anything ([ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md)).

- An item leaves the queue when it is archived, when it is routed — including being marked
  processed by hand — or when something is revised from it. `GET /v1/archived` makes none of those
  exclusions: every archived item is there, revised or routed alike
  ([core.md](core.md#archive-and-purge)).
- **The queue reorders under a reader, and no event costs it a row.** Nothing moves an item within
  the queue any more, the key being capture time, so the events are arrivals and removals. An
  arrival lands ahead of a reader walking oldest-first; a removal hides an item that reader was
  never meant to see.
- **An item returned to the queue is seen on the next read rather than this one.** Unarchiving
  puts an item back at the position it left with, which may be behind a reader who has already
  paged past it; that reader's remaining pages will not carry it, and a fresh read will
  ([core.md](core.md#the-queue)).

### Archiving

`POST /v1/items/{id}/archive` — hides an item from the queue. The body is optional and carries
one field:

```json
{ "reason": "noise" }
```

`POST /v1/items/{id}/unarchive` — returns it to the queue, at its unchanged position. It takes no
body.

Both answer `200 OK` with the `Item` as it now stands.

- **Archiving an item that is already archived is refused** — `409 already-archived`, carrying the
  instant it was archived at. It is not a no-op: archiving carries a reason and a time, so a second
  archive either overwrites what the first recorded or discards what the second was given, and
  neither is what the caller asked for. Unarchiving an item that is not archived is refused the
  same way, `409 not-archived`.
- This is the opposite call to a capture replay's, deliberately. A replay is a client resending
  something it may not know arrived; an archive is a fresh decision about a state the caller can
  already read.
- An id no item has is `404 no-such-item`.
- **A body is still JSON, and no body is a body of `{}`.** A client with nothing to say sends no
  body and the route reads `{}` — but it still declares `application/json`, like every other write
  ([Transport](#transport)). Anything else, absence included, is `415 unsupported-media-type`. A
  key neither route knows is `400 malformed-envelope`, on the same strictness the capture envelope
  has.

### Classifying an item

`POST /v1/items/{id}/tag` and `POST /v1/items/{id}/untag` — the whole of classification. Both take
the same body:

```json
{ "tag": "project/fiction-a" }
```

Both answer `200 OK` with the `Item` as it now stands.

- **The tag is in the body, not in the path.** Namespacing is convention rather than structure
  ([core.md](core.md#classification)), so `project/fiction-a` is one tag with a slash in it — and a
  path segment cannot carry one without a percent-encoding that every layer between the client and
  the route has to agree not to decode. A body has no such problem, and untagging is a `POST` rather
  than a `DELETE` for the same reason: there is no resource path to delete.
- **Neither half is refused for asking what the item already says.** Adding a tag it carries answers
  the item unchanged, keeping the attribution and time it has; removing one it does not carry
  answers it unchanged too. This is the opposite call to archiving's, and
  [core.md](core.md#classification) gives the argument: a tag's name is the whole of the request,
  where an archive carries a reason a second decision would discard.
- **The wire carries no agent**, though core takes one for either half. With no authentication
  there is nobody for a client to claim to be, so a tag added or removed through `/v1` is an
  anonymous person — the treatment archiving and routing already get
  ([core.md](core.md#the-action-log)). The attribution that is not a person's is written by
  *accepting a suggestion*, which is core's own call rather than something a route is told.
- An id no item has is `404 no-such-item`. **A processed item is classified like any other**
  (amended 2026-08-24): classification is not content, so nothing that seals a capture reaches it,
  and `409 item-superseded` is gone from this route with the word it was named for.
- The body is required and strict: no `tag` is `400 malformed-envelope`, and so is a key the route
  does not know. The route does not police the tag itself: core trims it, and one that trims to
  nothing is `422 tag-invalid` carrying what was sent.

### The tags in use

`GET /v1/tags` — every tag the pool carries, so a client can complete one instead of asking a
person to remember it.

```json
{ "values": [ { "name": "kind/quote", "items": 12 } ] }
```

- **Most used first, then by name**, which is the order a completion list wants and saves every
  client sorting the same way.
- **Not paginated and not narrowed.** There is no `prefix` parameter: the set is small, a client
  holds the whole of it, and filtering it as somebody types is then instant and works once the pool
  goes out of reach. A `prefix` would be the opposite trade — a request per keystroke, and nothing
  to complete from offline.
- **Nothing holds the set small**, and the route does not pretend otherwise: a pool with tens of
  thousands of distinct tags answers all of them on every read. Adding `prefix` later narrows this
  shape rather than replacing it, and a client that holds the whole set is the one that would then
  need changing — which is the trade being taken while a pool is one person's.
- **The tag and its count are the whole of a row.** When it was last added is in the pool and is
  not answered: nothing reads it, and a wire field no client consumes is one the next reader has to
  work out the meaning of.
- `items` counts every item carrying the tag (amended 2026-08-24), archived and revised alike.
  Tags carry over to a revision, so a tag is counted for the item it came from and again for the
  revision, which is two items both carrying it. The exclusion this replaces was for a revision
  chain counting one note once per link, and there is no chain any more.
- This route offers; it never limits. A tag no item carries is simply absent, and
  `POST /v1/items/{id}/tag` takes any tag that trims to something whether it is here or not.

### Editing an item

`POST /v1/items/{id}/edit` — a change to what the capture says. The body is a capture envelope
(amended 2026-08-24): the source making the edit, that source's own id for it, and the payload.

```json
{ "source": "shell/web", "sourceItemId": "01K3...-edit-1",
  "payload": { "type": "text", "content": { "text": "a second thought" },
               "metadata": {}, "assets": [] } }
```

`200 OK` with the outcome, which says which of the two shapes the edit took:

```json
{ "kind": "amended", "item": { … } }
```

```json
{ "kind": "revised", "revision": { … }, "revisionOf": "0198f0c2-..." }
```

- **The client does not say which it wants, and the pool decides** — an in-place **amendment**
  while the item is unprocessed, an appended **revision** once it is routed, archived or revised
  ([core.md](core.md#editing),
  [ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md)). A client can usually predict
  which it will get, everything the seal derives from riding on the item it already holds, but
  another client may have routed that item since its last read. So the request carries no intent to
  honour, and the outcome is read off the answer — which is what
  [client.md](client.md#editing-and-the-hand-over-seal) already told a client to do, and which
  keeps an edit made against a stale view a quiet revision rather than a refusal a person has to
  clear.
- **A revision is an ordinary capture with a new id**, carrying its own capture time of now and its
  own source identity from the envelope, plus the tags of the item it came from with their
  attribution, and no archive state or routing records. It sits in the feed at its own time rather
  than beside what it names ([core.md](core.md#editing)).
- **The envelope is what makes a retried edit safe.** A revision is matched for replay on
  `(source, sourceItemId)` exactly as a capture is, so an edit resent after a lost response answers
  with the revision it already made instead of appending a second one. An amendment needs no match,
  writing the same payload twice being the same as writing it once.
- **An identity another item already claims is `409 source-item-changed`** (added 2026-08-24),
  carrying that item's id, exactly as a capture under a taken identity is refused. The match is
  capture's whole match, payload included, so an envelope naming an identity that belongs to
  anything other than a revision of this item *saying these same words* is a caller's mistake
  rather than a resend.
- **An item may be revised more than once.** The revisions are independent captures sharing an
  ancestor; neither is the current one, and the item they came from names both.
- `200` rather than `201`, although a revision creates an item. The outcome carries the whole item,
  and a client that wants its URL has its id; a `Location` on the amended half would name the item
  the request already named.
- **Editing an item something was revised from appends another revision** (amended 2026-08-24)
  rather than answering `409 item-superseded`, which is gone. Being revised is one of the three
  things that process an item, and a processed item is revised rather than refused.
- **An edit is refused what a capture's payload is refused for**, less one: a `content` that fails
  its type's schema is `422 payload-invalid`, a required slot left empty is
  `422 missing-asset-slot`, and a reference to an asset the pool does not hold is
  `422 unknown-asset`. There is no `unknown-payload-type`, because a `type` that is not the item's
  own is `422 payload-type-changed` first, carrying the type it was captured as.
- An id no item has is `404 no-such-item`.
- The body is required: a bare `POST` is `400 malformed-envelope` rather than an empty payload.

### Marking an item processed

`POST /v1/items/{id}/mark-processed` — the user carried the content onward themselves. The body is
optional:

```json
{ "note": "pasted into the fiction-a vault" }
```

`200 OK` with the routing record that was appended:

```json
{
  "id": "0198f0c2-...",
  "item": "0198f0c2-...",
  "target": { "kind": "user", "note": "pasted into the fiction-a vault" },
  "state": "delivered",
  "at": "2026-08-08T09:00:00.123Z"
}
```

- **This is routing, whose destination is the user** ([core.md](core.md#the-queue)). The item
  leaves the queue, stays in the feed, and stays unarchived.
- **`200` rather than `201`, although a record was created.** A routing record has no URL of its
  own — an item's records are read as one list — so there is no `Location` to name, and a `201`
  whose `Location` is absent says less than the record in the body already does.
- Marking an item processed twice appends two records and is not refused. Nothing about the first
  says the second did not happen, which is the difference between this and archiving.
- An archived item may still be marked processed: the archive is a filter, not a terminus.
- An id no item has is `404 no-such-item`.

### Destinations

`GET /v1/destinations` — the destinations the pool holds. A read of pool state
([ADR 20](../adr/0020-destinations-are-pool-state.md)): it answers at once, cannot fail, and
probes nothing.

```json
{
  "values": [
    {
      "id": "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
      "name": "Vault",
      "kind": "filesystem",
      "settings": { "root": "~/notes" },
      "retired": false
    }
  ]
}
```

`GET /v1/destinations/{id}/description` — what that one can be asked to do, asked now.

```json
{
  "kind": "described",
  "capabilities": [
    {
      "name": "create-file",
      "accepts": ["text", "image"],
      "argumentsSchema": {
        "type": "object",
        "required": ["directory"],
        "properties": {
          "directory": { "type": "string" },
          "filename": { "type": "string" }
        }
      }
    }
  ]
}
```

- **The two reads are split because they are different animals.** What a destination *is* comes
  from the pool; what it can *do* is I/O against the outside world that may hang or fail. Fusing
  them made listing destinations probe every one of them, so a settings screen — or a routing
  picker — stalled on an unmounted drive. The list fills instantly and only the chosen destination
  is asked.
- **The capabilities are the destination's, not core's** ([core.md](core.md#routing)). This route
  reports what the adapter for that kind declared and holds no list of its own, so a new kind of
  destination adds a capability here without changing `/v1`.
- `argumentsSchema` is JSON Schema, and is the whole of what a client needs to build the
  `arguments` a delivery must supply. Arguments that do not satisfy it are refused before
  anything is attempted.
- **A destination is asked what it can do, and may have to go and look**
  ([core.md](core.md#routing)). One that could not answer is `undescribable` with the reason; one
  whose kind no adapter is registered for, or whose settings no longer satisfy that kind's schema,
  is `unusable` with the reason. Neither is dropped: missing, unreachable and unusable are three
  different answers to a person looking for a destination. A client renders the last two as present
  and unavailable, and cannot build arguments until the destination describes itself again.
- Retired destinations are listed. A client shows them as not offered for routing rather than
  hiding them, because a record may still name one.
- Not paginated and never refused: there are as many destinations as a person made. An empty
  `values` means none exists, which is a fact rather than an error.
- **Which destinations exist is no longer stable for the life of a connection** (revised
  2026-08-17). It was, when wiring one meant a restart. A client re-reads rather than caching for
  the session, and what each can do is re-read per request as it always was.

`GET /v1/destinations/{id}/candidates` — what one field of one capability's arguments could hold,
asked now. `capability`, `field` and an opaque `scope` are query parameters, `scope` absent asking
at the top:

```
GET /v1/destinations/019a3f2c-.../candidates?capability=create-file&field=directory&scope=inbox
```

```json
{
  "kind": "answered",
  "entries": [
    { "label": "drafts", "value": "inbox/drafts", "scope": "inbox/drafts" }
  ],
  "truncated": false
}
```

- **An entry carries a `value`, a `scope`, or both.** `value` is what the field would take and is
  absent where this entry is only somewhere to look further; `scope` is what to ask again with and
  is absent where there is nothing past it. Browsing `append-to-file`'s `path` for a note lists a
  folder with a scope and no value — somewhere to descend, never something to append to — and a
  note with a value and no scope. A client draws all three the same way: opening an entry descends
  where it can and takes the value otherwise.

- **The same animal as `/description`**: a question the destination answers, slowly, and may
  refuse. It sits beside it rather than folded into it, on `describe()`'s own terms
  ([core.md](core.md#routing)).
- **The route checks the capability and the field itself, before the destination is asked
  anything** — the capability must be one `/description` already declared, and the field must be a
  property of that capability's `argumentsSchema` carrying `x-notemap-candidates`. An undeclared
  capability is `422 capability-undeclared`, the same code and shape routing an item refuses one
  with; a field that is not askable is `422 field-not-askable`. Neither reaches the destination.
- **It is capped, not paginated.** `truncated` says the destination held more than it answered. A
  folder holding thousands of notes is a search problem rather than a paging one, and a cursor
  would put a position on an ordering notemap does not own and cannot promise is stable between two
  reads.
- **`200` carries everything else this can answer**, on `/description`'s own terms: `answered` with
  the entries; `unreachable` where the destination was asked and could not say; `unusable` where
  nothing speaks its kind or its settings no longer satisfy it; `not-offered` where the kind does
  not do this at all, whether the adapter said so or was never asked to implement it. None of the
  three is an error status — a destination that is merely asleep is not a broken request.
- An id no destination has is `404 unknown-destination`.

`POST /v1/destinations` — create one, from a name, a kind and that kind's settings. The id is
minted and answered; a name is a label and need not be unique.

`PATCH /v1/destinations/{id}` — change the name, the settings, or both, in one operation: two
would leave an edit half-applied. The kind is fixed: changing it would make one destination two,
and a record cannot tell which it meant. A half that arrives unchanged is not a change, and
appends nothing.

`POST /v1/destinations/{id}/retire` and `/unretire` — stop offering it for new routing, or offer it
again. Neither touches a delivery already decided.

`DELETE /v1/destinations/{id}` — allowed only where no routing record has ever named it, and
`409 destination-in-use` where one has, which names retirement as what to do instead.

`GET /v1/destination-kinds` — every kind the daemon has an adapter for, each with a
`settingsSchema` a client builds its form from. The same arrangement as `argumentsSchema`, one
level up: the daemon publishes what a kind needs and holds no opinion about how it is asked for.

- Settings are validated against the kind's schema on create and on edit, and a failure is
  `422` carrying the schema issues — the same shape bad arguments get.
- **Writes are online-only, and the client makes that visible** ([client.md](client.md)). They are
  not in the outbox: whether a root exists, and whether settings satisfy the kind registry the
  daemon is actually running, are questions only the daemon can answer.
- Routing to a retired or unusable destination is refused, with which of the two it was.

### Routing an item to a destination

`POST /v1/items/{id}/route` — the decision that this item belongs at that destination.

```json
{
  "destination": "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
  "capability": "create-file",
  "arguments": { "directory": "inbox", "filename": "a-thought.md" }
}
```

`200 OK` with the routing record the decision minted:

```json
{
  "id": "0198f0c2-...",
  "item": "0198f0c2-...",
  "target": {
    "kind": "destination",
    "destination": "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
    "capability": "create-file",
    "arguments": { "directory": "inbox", "filename": "a-thought.md" }
  },
  "state": "delivered",
  "at": "2026-08-08T09:00:00.123Z",
  "pointer": "inbox/a-thought.md"
}
```

- **A `200` here may name a delivery that has not happened.** `state` is `pending` when the
  destination could not be reached: the decision is recorded, the item leaves the queue, and a job
  carries the delivery out later ([ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)).
  A client that reads a record as arrival is wrong exactly when a destination is down, which is
  the case it matters in. `pointer` is absent until something has landed.
- **The call blocks for one delivery attempt**, which is what buys the interactive answer. Core
  imposes no timeout and neither does the daemon; a client that wants one abandons the request.
- **A destination that was reached and refused writes nothing** — `422 rejected-by-destination`,
  carrying the destination's own `detail` verbatim. No record is minted and the item stays in the
  queue, because a refusal is proof that nothing arrived and will be refused identically next time.
- **A destination that could not say what it accepts is `422 unreachable`**, carrying the reason.
  No arguments can be checked against capabilities nobody could read, and nothing is attempted or
  written, so this refuses rather than reserving — a record minted here would carry arguments
  nobody validated. This is the one way `unreachable` is raised on this route; a destination that
  fails during the *attempt* still answers `200` with a pending record.
- **An attempt that neither answered nor refused is `422 delivery-outcome-unknown`**, carrying the
  `detail` core has. No record is minted and the item stays in the queue, but unlike a refusal this
  is not proof that nothing arrived: the material may be at the destination already, and a client
  routing again should say so to whoever is deciding ([core.md](core.md#routing-and-delivery)).
- `200` rather than `201`, on the same terms as marking an item processed: an item's routing
  records are read as one list, so there is no `Location` to name.
- Routing one item twice appends two records and is not refused. It is a decision, not a replay.
- An archived item may still be routed: the archive is a filter, not a terminus.
- **A destination that failed during the attempt is a `200` carrying a pending record**, which is
  the whole point of ADR 17. Only a destination that could not be asked what it accepts refuses,
  and it refuses before anything is attempted.
- A destination the daemon has not wired is `422 unknown-destination`; a capability that
  destination never declared is `422 capability-undeclared`; a payload type it does not accept is
  `422 payload-type-unsupported`, carrying the types it does; arguments that do not satisfy the
  capability's schema are `422 arguments-invalid`, carrying `issues` in the same shape
  `payload-invalid` uses. None of them touches the destination.
- An id no item has is `404 no-such-item`.

### Cancelling a pending delivery

`POST /v1/routing/{record}/cancel` — calling off a delivery that has not landed. It takes no body.

- `204 No Content`. The reservation is removed and the item returns to the queue at its unchanged
  content time, so there is nothing left to answer with.
- **This is the one path that names a single routing record.** Records are still read as an item's
  list; cancelling is the one operation about exactly one of them, and it needs a name for it.
- **There is no "retry by hand" and no route for one.** The record is gone and the item is back in
  the queue, so routing it again *is* the retry.
- A record that has already delivered is `409 not-pending` — there is nothing left to call off.
- A record a host currently holds a lease on is `409 delivery-in-flight`: that attempt may be
  halfway through, and its outcome is not the canceller's to decide. Trying again after the lease
  expires succeeds.
- An id no record has is `404 no-such-record`.

### An item's routing records

`GET /v1/items/{id}/routing` — where an item has been.

```json
{ "values": [ { "id": "0198f0c2-...", "item": "0198f0c2-...",
                "target": { "kind": "user" }, "state": "delivered",
                "at": "2026-08-08T09:00:00.123Z" } ] }
```

- Not paginated: an item's routing records are a handful, and the list is item state rather than a
  surface over the pool.
- **`404 no-such-item` for an id the pool does not hold**, unlike `GET /v1/actions?item=`. Routing
  records are the item's own state and go when it does, so an empty list for an unknown id would
  be a claim about an item rather than a filter that matched nothing.
- A `pointer` is present only where a delivery recorded one, and is best-effort: it says where an
  item once went, never where it is.
- **`state` is `pending` or `delivered`**, and a client may not read a record as arrival without it
  ([ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)). Marking an item
  processed is delivered by construction; a record routed to a destination may be either, and the
  field is the same field. A `destination` target additionally carries the `arguments` the delivery
  named there, because a delivery that has not landed is attempted again from the record alone.
- A record that is pending disappears rather than changing state if its delivery is abandoned or
  cancelled, and the item returns to the queue. So a record this route answers at all either has
  delivered or is still going to be tried.

### Assets

Bytes go up in a request of their own and come back down under the filename they were uploaded
with. An asset is named by whoever uploads it and referenced by a later capture; the reference is
taken when that capture commits, so an upload no capture ever claims is swept
([core.md](core.md#archive-and-purge)).

#### Upload

`PUT /v1/assets/{id}` — **the body is the bytes, raw**. Not `multipart/form-data`. The id is the
caller's ([ADR 22](../adr/0022-the-uploader-mints-the-asset-id.md)).

| Header | | |
|---|---|---|
| `Content-Type` | required | The asset's media type, recorded and served back verbatim |
| `Content-Disposition` | required | `attachment; filename="…"`, or `filename*=UTF-8''…` |
| `Repr-Digest` | optional | RFC 9530, `sha-256=:…:`, checked against the bytes received |

`201 Created` with the `Asset` — `{ "id", "filename", "mime", "blob", "bytes" }` — and
`Location: /v1/assets/<id>`. An upload the pool already holds under that id is `200 OK` with that
asset and no `Location`; an id naming something else is `409 asset-id-conflict`.

- **The id is minted by the uploader**, as a capture's is, so a capture with an attachment can be
  written whole before any bytes move. An upload is therefore idempotent: the same bytes, under the
  same filename and media type, sent again under the same id, answer the asset already stored
  rather than making a second one.
- **All three are compared**, and any of them differing is the conflict. An asset is a *named*
  reference, and both the name and the media type are served back to a browser, so a `PUT` that
  changed either would rewrite what an existing capture points at. Two names over one content are
  still two assets and one blob — that is two ids, and neither conflicts with the other.
- A conflicting upload still writes its blob, since the bytes are hashed before the row is read.
  Space rather than loss, and deep verify's to reclaim.
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
- **This is the one `/v1` route whose body is not JSON**, and the media-type guard carves out that
  method and that path pattern rather than a prefix, so a route added under `/v1/assets` — or
  another bodied method on this same path — does not quietly inherit the exemption.

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
| `401` | `unauthenticated` | — | daemon |
| `403` | `session-required` | — | daemon |
| `404` | `unknown-route` | `path` | daemon |
| `404` | `no-such-item` | `item` | daemon, core |
| `404` | `item-purged` | `item`, `at` | core |
| `404` | `no-such-asset` | `asset` | core |
| `404` | `blob-missing` | `blob` | core |
| `404` | `no-such-record` | `record` | core |
| `404` | `unknown-destination` | `destination` | core (on `/v1/destinations/{id}`) |
| `405` | `method-not-allowed` | `method`, `allow` | daemon (+ `Allow` header) |
| `409` | `asset-id-conflict` | `asset` | core |
| `409` | `capture-id-conflict` | `existing` | core |
| `409` | `source-item-changed` | `existing` | core |
| `409` | `already-archived` | `item`, `at` | core |
| `409` | `not-archived` | `item` | core |
| `409` | `not-pending` | `record` | core |
| `409` | `delivery-in-flight` | `record` | core |
| `409` | `already-retired` | `destination`, `at` | core |
| `409` | `not-retired` | `destination` | core |
| `409` | `destination-in-use` | `destination` | core |
| `409` | `destination-retired` | `destination` | core |
| `409` | `destination-unusable` | `destination`, `detail` | core |
| `413` | `asset-too-large` | `max` | daemon |
| `415` | `unsupported-media-type` | `contentType` | daemon |
| `422` | `limit-too-large` | `limit`, `max` | daemon |
| `422` | `bad-limit` | `limit` | daemon |
| `422` | `bad-order` | `order`, `allowed` | daemon |
| `422` | `bad-position` | `after` | daemon |
| `422` | `missing-filename` | — | daemon |
| `422` | `bad-digest` | `digest` | daemon |
| `422` | `digest-mismatch` | `expected`, `actual` | daemon |
| `422` | `tag-invalid` | `tag` | core |
| `422` | `unknown-payload-type` | `type` | core |
| `422` | `payload-invalid` | `issues` | core |
| `422` | `payload-type-changed` | `from` | core |
| `422` | `missing-asset-slot` | `slot` | core |
| `422` | `unknown-asset` | `asset` | core |
| `422` | `unknown-destination` | `destination` | core (routing an item) |
| `422` | `unknown-destination-kind` | `destinationKind` | core |
| `422` | `invalid-destination-settings` | `issues` | core |
| `422` | `capability-undeclared` | `capability` | core (routing an item) |
| `422` | `capability-undeclared` | `capability` | daemon (asking what a field could hold) |
| `422` | `field-not-askable` | `capability`, `field` | daemon |
| `422` | `payload-type-unsupported` | `type`, `accepts` | core |
| `422` | `arguments-invalid` | `issues` | core |
| `422` | `rejected-by-destination` | `detail` | core |
| `422` | `delivery-outcome-unknown` | `detail` | core |
| `422` | `not-a-session` | `presented` | daemon |
| `422` | `unreachable` | `detail` | core |
| `429` | `too-many-attempts` | `retryAfter` | daemon (+ `Retry-After` header) |

The rule behind the table, so a refusal added later has a status without a decision being
needed: **`409` is for a conflict with something the pool already holds** — the request is
well-formed and the client may have to reconcile. **`400` is for a body the daemon could not
read as an envelope at all**, which is a shape problem and never reaches core. **`422` is
everything else core or the daemon refused**: the request was understood and declined. Anything
outside the table is a bug, and is `500` with no body — a daemon that turns an unexpected
throw into a domain-looking refusal teaches clients to trust a fiction.

`unknown-destination` is the one code the table carries twice, and the rule says which is which:
where the id is what the request is *about* — every `/v1/destinations/{id}` route — it is `404`,
the answer a missing item gets. Where it is a fact *inside* a request about something else, as it
is when routing an item, the request was understood and declined, so it is `422`.

`413 asset-too-large` is the single deliberate exception, for the reason given above: a size
limit is a fact the transport layer acts on, and hiding it inside `422` would cost a client the
chance to stop an upload early.

`payload-type-changed` is `422` by the rule unchanged: a request that was understood and declined,
since the type an edit carries is the item's own and a different one is not an edit of it.
`item-superseded` left the table on 2026-08-24 with the rule it enforced — an item something was
revised from is edited into another revision and classified like any other item, so there is no
conflict left for a `409` to report.

`item-purged` is in the table because it is part of the refusal a client parses, not because
anything raises it yet: purge is not built. It is `404` on the same terms as `no-such-item` — from
a caller's side the item is not there — and carries the instant it went.

**`unreachable` is raised only before an attempt**: a destination that could not be asked what it
accepts refuses with it, while one that fails during the delivery answers `200` with a pending
record rather than a refusal
([ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)). It is part of the same
union as `rejected-by-destination` and `delivery-outcome-unknown`, so a client parsing one parses
all three, and each is `422` by the rule — the request was understood and something declined it.
None of them gets a status of its own for being a third party's answer rather than notemap's: they
are told apart by `code`, and no client can act differently on a status it cannot influence.

The three routing-record refusals follow the rule unchanged. `no-such-record` is `404` for a record
the pool does not hold. `not-pending` and `delivery-in-flight` are both `409`: the first conflicts
with a delivery that already landed, the second with a lease somebody else holds, and in each case
the caller may have to reconcile with a state they can read.

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

---

## Constraints

- The daemon is one host among several and holds no logic of its own; every endpoint is a thin
  translation onto the core library ([ADR 2](../adr/0002-core-is-a-host-agnostic-library.md)).
  The `next` URL is the one thing the daemon composes rather than passes through, and it
  composes it from the position core handed back.
- **Daemon configuration is TOML** (decided 2026-08-08): comments survive a hand-edit, and it
  is the format a self-hosted single-file config is least annoying to write by hand. The host
  reads it; core takes it as data ([core.md](core.md#constraints)).
- **The daemon never writes its own config file** (decided 2026-08-17,
  [ADR 20](../adr/0020-destinations-are-pool-state.md)). A machine write flattens it — parse and
  re-emit returns the values and drops every comment, which is what the format was chosen for. What
  a person edits from the UI is pool state, and what stays in the file is how the daemon runs:
  paths, ports, mirror, sweep, delivery cadence, payload types, sources and enrichments.
- **An unrecognised key warns; a value that cannot be honoured refuses** (decided 2026-08-17).
  Unknown keys and tables are named in a startup warning and ignored, so an upgrade or a downgrade
  never leaves the daemon unable to start over a block it does not know. A key it does know, with a
  value out of range or of the wrong type, still fails: dropping it silently would leave a running
  daemon that does not match the file a person wrote.
- **UUIDv7 comes from the `uuid` package everywhere** (revised 2026-08-17). The client hand-rolled
  one inline on the argument that a function is cheaper than a dependency in the browser; it ships
  `openapi-fetch` and `rxjs` to the browser regardless, so the argument was not a live one, and a
  minted id is the wrong place to keep a bit-twiddling implementation of our own.

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
- A `POST` to a route that reads no body, or one whose body is optional and absent, returns `415`
  where it declares no content type or a type an HTML form can send.
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
- `GET /v1/queue` returns every unprocessed item oldest first — excluding the archived, the routed
  and those something was revised from — and following `next` until it is absent yields each
  exactly once with no trailing empty page.
- Archiving an item removes it from `GET /v1/queue` and adds it to `GET /v1/archived`;
  unarchiving returns it to the queue between the same two neighbours it had before.
- Marking an item processed answers a routing record naming the user, removes it from the queue,
  and leaves it in the feed unarchived; doing it twice answers two records and refuses neither.
- Archiving an archived item is `409 already-archived` and changes nothing; unarchiving one that
  is not archived is `409 not-archived`.
- `POST /v1/items/{id}/archive` with no body at all succeeds, and with a key the route does not
  know is `400 malformed-envelope`.
- `GET /v1/items/{id}/routing` answers an item's records, and `404 no-such-item` for an id the
  pool does not hold.
- `POST /v1/items/{id}/tag` answers the item carrying the tag, attributed to an anonymous person; a
  tag with a slash in it round-trips; a tag that trims to nothing is `422 tag-invalid`; and tagging
  or untagging for what the item already says answers `200` with the item unchanged rather than a
  refusal.
- Tagging or untagging an item that has been routed, archived or revised succeeds, and the tag
  does not appear on any revision made from it.
- `GET /v1/tags` answers every tag with the number of items carrying it, most used first, and drops
  one the last item carrying it lost.
- An item read from `GET /v1/feed` after being routed and marked processed carries
  `routing: { records: 2, pending: … }` naming both places; one that has been nowhere carries no
  `routing` at all, and neither does one whose only reservation was cancelled.
- `POST /v1/items/{id}/edit` on an unprocessed item answers `{ "kind": "amended" }`, the item keeps
  its id, and its place in the queue is unchanged — however old it is, and whatever has been
  captured since.
- The same call on a routed item answers `{ "kind": "revised" }` with a revision carrying a new id
  and a capture time of now, which the queue holds at its newest end while the routed item stays
  where it was.
- Repeating that call with the same `sourceItemId` answers the revision already made; repeating it
  with a fresh one appends a second, independent revision.
- A payload naming a different type is `422 payload-type-changed` and changes nothing, on either
  outcome.
- `GET /v1/destinations` answers every wired destination with its capabilities, each carrying the
  payload types it accepts and the JSON Schema of the arguments it needs.
- `POST /v1/items/{id}/route` to a reachable destination answers `200` with a `delivered` record
  and a pointer, and removes the item from `GET /v1/queue`.
- The same call to a destination that cannot be reached answers `200` with a `pending` record and
  no pointer, and the item is out of the queue although nothing has arrived.
- A capability the destination never declared is `422 capability-undeclared` and the destination is
  never called; arguments that do not satisfy its schema are `422 arguments-invalid` with `issues`.
- A destination that refuses the delivery is `422 rejected-by-destination` carrying its own detail,
  leaves no routing record, and leaves the item in the queue.
- An attempt whose outcome nobody can state is `422 delivery-outcome-unknown`, on the same terms
  except that the material may have arrived.
- `POST /v1/routing/{record}/cancel` on a pending record answers `204`, removes it from
  `GET /v1/items/{id}/routing`, and returns the item to `GET /v1/queue`; on a delivered record it
  is `409 not-pending`, and on an id no record has it is `404 no-such-record`.
- A position taken from `GET /v1/feed` is accepted by `GET /v1/queue` and answers a page from the
  wrong place rather than a refusal, which is what "not interchangeable" costs.
- `GET /v1/actions` with no parameters returns the 50 newest entries, newest first, and the entry
  for a capture carries the instant the daemon received it rather than its `capturedAt`.
- `GET /v1/actions?item=<id>` returns that subject's entries and no others, and following `next`
  carries the filter with it.
- An `item` no pool item has returns `200` with an empty page, never `404`; an item purged after
  its entries were written still returns them.
- `GET /docs` returns a page that loads its script, its stylesheet and the OpenAPI document from
  the daemon itself, and nothing from anywhere else.
- A `/docs` path naming anything but the vendored Swagger UI files returns `404 unknown-route`,
  and no `/docs` path reaches a file outside the vendored directory.
- The playground appears nowhere in `GET /v1/openapi.json`.
- Bytes uploaded to `PUT /v1/assets/{id}` come back from `GET /v1/assets/:id/content` byte for byte,
  under the filename they were uploaded with, for content that is not valid UTF-8 and for a
  filename that is not ASCII.
- The same content uploaded twice under two filenames returns two asset ids sharing one blob
  hash, and each download returns its own name.
- The same bytes, filename and media type sent again under the same id are `200` with the asset
  already stored, and no `Location`; bytes, a filename or a media type differing under an id already
  used is `409 asset-id-conflict` and leaves the stored asset as it was.
- An upload with no `Content-Disposition` filename is `422 missing-filename`; one with no
  `Content-Type` is `415`; neither stores anything.
- An upload whose `Repr-Digest` disagrees with the bytes received is `422 digest-mismatch` and
  stores nothing.
- A `Repr-Digest` whose `sha-256` value is unreadable — not base64, the wrong length, or missing
  the byte-sequence colons — is `422 bad-digest` and stores nothing, where one naming only an
  algorithm notemap does not compute is ignored and the upload succeeds.
- A body over the configured limit is `413 asset-too-large` and leaves no blob behind, whatever
  `Content-Length` claimed.
- Every other bodied `/v1` route still requires `application/json`, unaffected by the upload
  route's carve-out.
- An uploaded `text/html` file is served `Content-Disposition: attachment`; an uploaded
  `image/png` is served `inline`. Both carry `nosniff` and the sandbox CSP.
- Every registered spelling of a format on the allowlist is served `inline` — both ICO spellings
  and all three WAV ones.
- No asset content response carries a `Content-Length`.
- `GET /v1/assets/:id` for an id the pool does not hold is `404 no-such-asset`; an asset whose
  blob has been deleted from disk is `404 blob-missing` on its content.
