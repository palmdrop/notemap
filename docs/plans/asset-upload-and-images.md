# Asset upload and images

**Date**: 2026-08-11
**Status**: Todo
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/mirror.md`, `docs/specs/security.md`
**Closed**:

---

## Goal

An image can be captured: its bytes go up in their own request and come back down under the
filename they were uploaded with, a capture referencing an asset it cannot resolve is refused, the
same bytes uploaded twice under two names give two assets and one blob, an upload no capture ever
claims is eventually swept, and both the capture page and the mirror's `.md` show the picture.

**Out of this slice, deliberately**: purge (`items.purge` does not exist, so the sweep is the only
producer of asset release), range requests and resumable uploads (`asset-uploads.md` §2 argues
against both at this scale), thumbnails, deep verify of blobs, and rebuild. Authentication stays
out everywhere — phase 1 writes down what that leaves undefended rather than closing it.

---

## Decisions

Taken 2026-08-11, before phase 1. Three of them change something a doc already states, which is
why phase 1 is docs and goes first.

### D1 — The asset registry is pool state; the port carries bytes only

`AssetStore` owned storing, resolving, verifying and releasing; the pool store owned only
`item_assets`. Between them no table held *which assets exist*, so the sweep's real target — an
asset **no item ever referenced**, because its capture never arrived — was unnameable by either
side. The port could have grown an enumeration and the driver its own index, and the objection was
never capability: it was that the driver's index is a second database, not transactional with the
first, that can disagree with it. `asset-uploads.md` §5 names double-decrement as the failure that
loses bytes rather than wasting them, and split bookkeeping is where that lives.

So: the `assets` table is pool state — id, filename, media type, blob hash, size, stored at — and
the port narrows to a **`BlobStore`** keyed by hash, knowing nothing about names:
`put`, `open`, `verify`, `delete`, `pathFor`.

Both refcounts become SQL in one transaction. Capture's asset resolution becomes a read inside the
transaction rather than an `await` before it, which is the shape the 2026-08-06 amendment moved
every other precondition to. `mirror.recordFor` stops reaching outside to resolve references and so
can no longer fail — the mirror writes no blobs, `assets/` being shared and written once by the
blob store.

ADR 13's model is untouched: a named asset, a content-addressed blob, two levels of refcount,
filenames that round-trip. Only the port boundary moves, which makes it a new ADR rather than an
edit to 13.

### D2 — Upload is a raw body; `AssetRef` loses its hash

`POST /v1/assets`, bytes as the raw body, `Content-Type` the media type,
`Content-Disposition: attachment; filename="…"` the name. `201` with the `Asset`.

Over `multipart/form-data`: Hono buffers a multipart body to parse it, and filename encoding in
multipart is a swamp, where `Content-Disposition` has `filename*` for UTF-8 and streams straight
into the hash. The cost is that a no-JavaScript form cannot upload, which nothing in scope needs.

A missing filename or a missing content type is **refused, not invented** — a filename is user data
(ADR 13) and the media type is served back, so a guess would be a lie we store.

**`AssetRef` becomes `{slot, asset}` and `asset-hash-mismatch` leaves the refusal table.** With
server-minted asset ids, the ref's hash was the client copying back a number the server handed it a
moment earlier, and every failure it claimed to catch resolves elsewhere: a swept asset is
`unknown-asset`, a rebuilt pool restores asset identities so the id still resolves, and a corrupted
blob is invisible to it because the row and the ref agree — both say H, the disk is what is wrong.
Client-minted asset ids would have made it a real assertion, and were rejected on their own terms:
the whole benefit is avoiding a duplicate asset row after an ambiguous upload failure, and that row
is unreferenced and swept anyway.

Integrity moves to the upload, where a wire separates the two numbers: an optional client
`Repr-Digest` (RFC 9530), recomputed server-side over the bytes received and refused on mismatch.
That is S3's pattern and the one `asset-uploads.md` §3 calls load-bearing.

A size limit lives in daemon config — a cap is interface policy and core is a primitive API —
enforced against the stream, since `Content-Length` is a claim.

### D3 — Anything uploads; only inert things render

The allowlist governs `inline` versus `attachment`, never what may be uploaded: a zip, an encrypted
archive, raw binary all store and download normally.

**Inline** is by inertness rather than image-ness: raster images (PNG, JPEG, GIF, WebP, AVIF, BMP,
ICO), audio (MPEG, MP4/AAC, Ogg, WAV, WebM, FLAC), video (MP4, WebM, Ogg), and `text/plain`.
**Attachment** is everything else, so a media type nobody has thought about yet downloads rather
than executes. HTML, XHTML, SVG and XML are the named dangerous ones; PDF is attachment too, being
a large attack surface for a format that is mostly documents routed elsewhere.

With it: `X-Content-Type-Options: nosniff` always, `Content-Security-Policy: default-src 'none';
sandbox` on asset responses, the recorded media type served honestly, and `ETag` as the blob hash
with an immutable cache — an asset id names one blob forever.

**SVG is not sanitized.** It mutates user data for one media type invisibly, every sanitizer is a
denylist wearing a parser, and it needs a DOM on the server. It is also unnecessary: SVG loaded
through `<img>` executes no script by spec, so the capture page can display one safely, and the
danger is top-level navigation, which attachment plus the sandbox already covers.

The gap this leaves — no auth, uploaded bytes on the daemon's own origin, no CORS headers as the
only thing stopping cross-origin reads — is written down in a new `docs/specs/security.md` rather
than left in a comment.

### D4 — Four smaller ones

- **`storedAt` is a column, not a field on `Asset`.** `mirror.md` enumerates what an asset carries
  in a record; a sixth field lands in the record and moves the round-trip property test. It is
  operational, so it stays in the store the way `modified_at` does.
- **Storing appends no action; sweeping appends one.** An asset before its capture belongs to no
  item, and the capture that references it is the event worth tracing. Deletion is the opposite, so
  one `assets-released` per sweep **run** — the kind already exists and `Action.subject` is already
  optional — by agent `notemap`, detail carrying what went. Not one per asset: a sweep collecting
  four hundred orphans must not bury the log it shares with captures.
- **Download does not verify.** Rehashing to answer every `<img>` is not affordable; `verify` stays
  explicit and deep verify walks every blob. So `blob-drifted` cannot arise on a read, and only
  `no-such-asset` and `blob-missing` need statuses — both `404`, distinguished by code.
- **The sweep runs on an interval in the daemon**, beside the mirror runner. Its grace window goes
  in `PoolConfig` beside `retry`, which is the closest precedent for an operational knob core takes
  as data. The grace is what makes the sweep safe against a capture in flight, per `git gc`'s
  `gc.pruneExpire` reasoning that "referenced" and "about to be referenced" look identical to a
  sweep running at the wrong instant.

---

## Tasks

### Phase 0 — Branch

- [ ] `git checkout -b agent/asset-upload-and-images`

### Phase 1 — Write the decisions down *(blocks everything)*

Docs only, landing before the code that depends on them. The largest doc phase this project has
had, which is why it is first rather than last.

- [ ] ADR: the asset registry is pool state, the port carries bytes. Weigh the two-store split it
      replaces, and say that ADR 13's model survives intact — only the boundary moves
- [ ] `core.md`: the port list names a blob store; the asset-reference rules gain the sweep's grace
      window as configuration core is given; `AssetRef` carries no hash, and why
- [ ] `mirror.md`: a record can no longer fail on a missing asset — drop it from the non-retryable
      list and say why the mirror has no blob to be missing
- [ ] `http-v1.md`: the assets section — upload, download, inline versus attachment, the new
      refusals and their statuses, the size limit. `asset-hash-mismatch` leaves the table. Narrow
      the "asset transfer" open question down to range requests, and note that audio seeking is
      what will force them
- [ ] New `docs/specs/security.md`: what is deliberately undefended and what auth has to close —
      no authentication, the pool as sole boundary, no CORS headers as the only thing stopping
      cross-origin reads, uploaded bytes on the daemon's own origin, no quota beyond the upload cap,
      and the exposure a wider bind permits. `http-v1.md`'s auth open question becomes a pointer
- [ ] `CONTEXT.md`: check **asset** and **blob** still read true after the boundary moves
- [ ] Verify: `pnpm lint`; every refusal code in the table has exactly one status
- [ ] `git commit`

### Phase 2 — Make the types agree with the decisions *(no behaviour; depends on phase 1)*

Each of these is a place the code now contradicts a doc. Assertions change only where a field is
gone.

- [ ] `BlobStore` replaces `AssetStore` beside the other ports; `PoolPorts.assets` becomes `blobs`
- [ ] `AssetRef` becomes `{slot, asset}`; `asset-hash-mismatch` leaves `CaptureRefusal` and the
      daemon's status map. The mirror record's serialisation, its parse and the round-trip property
      test follow — the resolved assets beside the payload still carry the blob hash, so a rebuild
      is unaffected
- [ ] `PoolConfig` gains the sweep's grace window
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint`
- [ ] `git commit`

### Phase 3 — The blob store *(depends on phase 2)*

New package `packages/adapters/blob-fs`, following the conventions `mirror-fs` set.

- [ ] Content-addressed write: hash while streaming to a temporary file in the target directory,
      then rename to `assets/<2-char shard>/<full sha-256>`. Bytes that already exist are the same
      bytes, so the temporary file is dropped rather than the target rewritten
- [ ] `open`, `verify` — rehash and compare against the name — `delete`, and `pathFor`, since the
      layout is this driver's and phase 7's renderer must name a file in it
- [ ] Tests: two writes of one content leave one file; an interrupted write leaves no blob and no
      debris; `verify` reports drift after an external edit and absence after a delete; the shard
      path is stable across processes
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint`
- [ ] `git commit`

### Phase 4 — Assets are rows *(store; depends on phase 2, parallel to phase 3)*

- [ ] New migration — never edit an existing one. An `assets` table, indexed by blob hash.
      `item_assets.asset_id` gains a foreign key to it, which SQLite cannot add in place, so the
      table is recreated the way `jobs` was. The FK restricts rather than cascades: releasing an
      asset an item still references must fail loudly
- [ ] Reads and writes: resolve an asset by id, insert one, list assets referenced by no item and
      stored before an instant, and delete a set answering the blob hashes that lost their last
      asset. `unreferencedAssets` stops being `unimplemented` and means what it says
- [ ] `schema.test.ts` and `rows.ts` stay in agreement
- [ ] Tests: two assets over one blob; deleting one leaves the blob referenced and both leaves it
      orphaned; an asset an item references cannot be deleted; the sweep list respects the instant
      and excludes anything referenced
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint`
- [ ] `git commit`

### Phase 5 — Core owns assets *(depends on phases 3 and 4)*

- [ ] `assets.store`: hash and write the bytes through the blob store, then mint the asset and
      insert it — I/O first, transaction second, per core.md's rule about what may happen inside one
- [ ] `assets.get`, `assets.open`, `assets.verify`
- [ ] Capture resolves every `AssetRef` inside the transaction; an unresolvable one is
      `unknown-asset`. This is the TODO left at `packages/core/src/pool/capture.ts:54`
- [ ] `maintenance.sweepUnreferencedAssets`: delete assets no item references and older than the
      configured grace, then delete each blob that lost its last asset, and append one
      `assets-released`. Blob deletion is outside the transaction — a crash between the two leaks a
      file, which is space, where the reverse order loses bytes an asset still names
- [ ] `mirror.recordFor` resolves assets from the store; `MirrorWriteFailure`'s `asset-missing` goes
      with it, per phase 1's amendment
- [ ] Tests: the same bytes under two filenames give two assets and one blob, each resolving to its
      own name; a capture quoting an unknown asset is refused and writes nothing; a referenced asset
      survives the sweep; an unreferenced one survives inside the grace window and is taken with its
      blob outside it; a blob shared by two assets survives one of them going
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint`
- [ ] `git commit`

### Phase 6 — Upload and download over `/v1` *(depends on phase 5)*

- [ ] Config: the assets root as a sibling of `state/` and `pool-mirror/` under the same data root;
      the upload size limit; the sweep's interval. `config.example.toml` and the daemon README with
      them
- [ ] Wire the blob store in `ports.ts`, replacing `noAssets`. Unlike the mirror it is not optional:
      a pool that cannot store bytes cannot capture an image at all
- [ ] `POST /v1/assets` per D2, the limit enforced against the stream, an oversized upload leaving
      no blob. `Repr-Digest` checked when present
- [ ] `requireJsonBody` carves out exactly this path, by path equality, so no other route quietly
      loses the guard
- [ ] `GET /v1/assets/{id}` for the asset and `GET /v1/assets/{id}/content` for the bytes, per D3:
      the inline allowlist, `nosniff`, the sandbox CSP, the blob hash as `ETag`, and the filename
      encoded for UTF-8 in `Content-Disposition`
- [ ] The new refusals join the status maps and the OpenAPI document, which is checked in and so
      appears in this commit's diff
- [ ] A sweep loop beside the mirror runner, shut down with it
- [ ] Tests: upload then download returns the same bytes and the same filename, over content that is
      not valid UTF-8; two names over one content; a body over the limit is refused and stores
      nothing; a mismatched `Repr-Digest` is refused; an upload with no filename or no content type
      is refused; JSON posted to `/v1/captures` still requires its content type; an HTML upload
      comes back as an attachment and a PNG inline; an unknown asset is `404`; the checked-in
      OpenAPI document matches the generated one
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint`
- [ ] `git commit`

### Phase 7 — Images *(depends on phase 6)*

- [ ] An `image` payload type in `config.example.toml`: an optional caption in the content, one
      required asset slot. The first configured type with a required slot, so also the first
      exercise of `missing-asset-slot`
- [ ] A mirror renderer for it, emitting a markdown image whose target is the blob's own path,
      relative to the record. The path scheme is the blob driver's, so the driver's `pathFor` is
      handed to the renderer at wiring time rather than the mirror learning a second layout.
      Accepted: a blob file has no extension, and the alt text carries the filename so a person
      reading the `.md` without notemap can still find and name the bytes
- [ ] The capture page: pick a file, upload it, capture referencing it, show the images in the feed.
      Full size — a thumbnail endpoint is deliberately not built
- [ ] Verify the assumption D3 rests on: that `Content-Disposition` is a navigation-level directive
      and a subresource `<img src>` renders an attachment-disposition response anyway. If it does
      not hold, the fallback is an explicit inline flag on the URL for types the page embeds
- [ ] Tests: capturing an image leaves a record naming the asset and a rendering pointing at a file
      that exists; the same item rendered from another timezone resolves to that same file; a
      capture missing the required slot is refused
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint`, and upload one through the capture page
- [ ] `git commit`

### Phase 8 — End to end *(depends on phase 7)*

- [ ] Integration tests in `tests/integration/`: upload → capture → drain the mirror queue → pool,
      blob and mirror pair all agree; an upload whose capture never arrives is gone after a sweep
      with the grace wound back, and its blob with it; two items sharing an asset both keep it when
      one is swept against
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint` from a clean checkout
- [ ] `git commit`

---

## Unknowns

- **Whether an image capture wants a content schema at all.** A caption is arguably a tag or an
  artifact, and the payload might be `{}` with the whole of it in the asset. *Fallback*: ship it
  empty; a content schema is cheap to widen and expensive to narrow.
- **What the capture page does while bytes are in flight.** Two requests where there was one, and
  the second must not fire if the first failed. *Fallback*: disable the control and report the
  upload's refusal verbatim — it is a throwaway page, not a client.
- **Whether `Content-Disposition` on upload survives every client we care about.** Well-specified,
  and `fetch` sends what it is told, but nothing here has exercised it. *Fallback*: accept a
  filename query parameter beside it, which costs one line and no protocol.
- **Whether attachment disposition blocks subresource loads anywhere we care about.** Phase 7 has
  the check and the fallback; naming it here because the capture page is unusable if it bites and
  nothing else in the plan would catch it.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The properties worth testing hardest, because each fails silently or destructively:

- **Two names, one blob.** The whole reason ADR 13 exists; a regression returns the wrong filename
  to a user who will not know it was ever theirs.
- **The refcount under sweep.** `asset-uploads.md` §5 names double-decrement as the dangerous half —
  under-counting frees bytes something still references, which is loss, not waste. Test the path
  deliberately rather than trusting the foreign key.
- **The grace window.** A sweep that runs a moment too early takes an asset whose capture is in
  flight.
- **Bytes in equal bytes out.** Round-trip an upload through download over content that is not
  valid UTF-8, so nothing quietly decodes it on the way.
- **Attachment for anything not inert.** The one property in this slice whose failure is a security
  bug rather than a lost file.

Adapter tests live with their package; cross-package behaviour goes in `tests/integration/`.

---

## Notes

Every mutation that changes mirrored material must enqueue a mirror job. Nothing here is a new
mutation of an item — an upload changes no item, and the capture referencing it already enqueues —
so this plan adds no producer. Purge, when it lands, owns asset release the way it owns mirror
removal.

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`.
**Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what
landed and linking back to this plan. No implementation details, no granular tasks. A plan marked
Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
