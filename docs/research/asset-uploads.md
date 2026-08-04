# Research: Asset/media upload practices for a local-first single-user pool

**Date**: 2026-08-04
**Status**: Draft

---

## Verdict

The current design sketch — separate `assets.store(bytes, meta) -> Asset` upload, human-named
files on disk, content hash recorded as metadata (not filename), dedup-on-hash with a reference
count, reference-counted release on purge — is **well-trodden and not a mistake**. Every
multi-request upload API surveyed (Micropub, Mastodon, Slack, S3, Google Drive) separates the
byte transfer from the record that references it, for the same reason notemap would: a capture
envelope and an audio/HTML blob have different failure modes and shouldn't share a request.
Content-hash dedup with an internal (never human-facing) hash is exactly what git, restic and
Perkeep do; naming the *file* for a human while keeping the hash as metadata-only is a
reasonable, even more conservative version of the same idea (§4) — notemap's own ADR1 already
argues correctly for this ("a hash filename... becomes a lie the moment the file changes").

Three places prior art doesn't already answer for notemap and are worth deciding explicitly:

1. **"Which name wins" when two captures independently produce identical bytes under different
   human names** — git/restic/Perkeep/IPFS never name content-addressed data for a human at the
   storage layer, so none of them face this. Notemap does, by design (§4). Needs its own rule
   (first-write-wins is the obvious default; flag, don't silently pick one).
2. **Orphan reclaim at store-time, not just at purge-time.** `core.md` describes purge-time
   freeing ("an asset only when no remaining item references it") but nothing yet covers the
   case where `assets.store()` succeeds and the capture that was going to reference it never
   arrives (client crash mid-flow). Slack's and S3's own docs are explicit that an allocated-
   but-never-committed upload is inert and reclaimed (§5) — notemap should say the same, and the
   cheapest version of that is transactional (don't count a reference until the referencing
   capture actually commits), not a periodic GC daemon (§5).
3. **Resumable/chunked upload protocols (tus, the IETF httpbis draft) are overkill here.** They
   exist for multi-tenant, internet-facing, large-media platforms with flaky client networks at
   scale. A single-user local daemon holding voice memos and HTML snapshots (kilobytes to tens
   of MB, not the 100 MB+ S3 itself uses as its own multipart threshold) doesn't have the
   problem these protocols solve, and the client-side outbox/replay design notemap already has
   covers the actual failure mode (retry the whole asset) at lower cost (§2).

Also worth noting: the privacy/metadata-leakage class of dedup risk (IPFS CID correlation,
convergent-encryption's "confirmation of file" attack, §4) is a **multi-tenant** problem.
Notemap is explicitly single-pool/single-user — this risk class doesn't apply, and building any
mitigation for it (e.g. convergent-encryption-style key derivation) would be solving a problem
notemap doesn't have.

---

## 1. Two-phase vs. inline upload

**Micropub media endpoint** ([W3C Recommendation, 2017-05-23](https://www.w3.org/TR/micropub/#media-endpoint)):
a separate endpoint. Client sends `multipart/form-data` with one part named `file`; server
replies `201 Created` with the file's URL in the `Location` header, body undefined. The client
then references that URL as a plain string property (`photo`) in the actual (JSON) post-creation
request. Servers *without* a media endpoint must accept `multipart/form-data` directly on the
post-creation endpoint instead — the spec explicitly treats "one request" as the fallback for
servers too simple to offer the two-phase form, not the preferred shape.

**Mastodon media attachments** ([docs.joinmastodon.org/methods/media](https://docs.joinmastodon.org/methods/media/)):
`POST /api/v2/media` uploads first, returns a `MediaAttachment` with an id; the status-creation
call references that id. Small images return `200` (ready immediately); "larger media formats
(video, gifv, audio) will continue to be processed asynchronously and return `202`" with `url`
staying `null` until a client polls `GET /api/v1/media/:id` and finds it populated. This is the
closest analog to notemap's audio-transcription-as-enrichment shape: upload finishes before
processing does, and the caller polls state rather than blocking.

**Matrix content repository** ([spec.matrix.org, latest — v1.19 header at fetch time](https://spec.matrix.org/latest/client-server-api/#content-repository)):
`POST /_matrix/media/v3/upload` (or the newer two-step `/v1/create`), returns an `mxc://` URI,
referenced from then on in room events. Also two-phase.

**Slack** ([files.getUploadURLExternal](https://api.slack.com/methods/files.getUploadURLExternal), [files.completeUploadExternal](https://docs.slack.dev/reference/methods/files.completeUploadExternal/)):
current (post-March-2025, `files.upload` deprecated) flow is explicitly three steps — allocate
(`getUploadURLExternal` returns an upload URL + `file_id`), transfer bytes to that URL, then
commit (`completeUploadExternal`, optionally attaching a channel to share into). The docs are
explicit about the abandoned case: **"if this method is not called, the uploaded file and
associated metadata will be discarded."** This is a direct, named, official-doc precedent for
"an allocated-but-uncommitted upload is not durable and gets reclaimed" — exactly the shape
notemap's `assets.store` + capture-reference split needs to state for itself (§5).

**Discord** ([docs.discord.com/developers/reference](https://docs.discord.com/developers/reference)):
the one **inline** example. A single `multipart/form-data` request carries both the JSON message
body (`payload_json`) and the file(s); an uploaded file is referenced within the same request's
embed JSON via the `attachment://filename` pseudo-URL. Default size limit 10 MiB per file. This
works because a chat message *is* one user action with nothing to decouple — retry means resend
the whole message, which is cheap and expected.

**S3 multipart upload** ([AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)):
`CreateMultipartUpload` (returns an upload id) → N × `UploadPart` → `CompleteMultipartUpload`
(the commit — S3 concatenates parts by part number and the object becomes visible only now).
AWS's own recommendation is to use this only for objects **≥100 MB**; below that, `PutObject` in
one request is the recommended path. Useful calibration for notemap: audio/HTML/image assets are
nowhere near that threshold as a rule.

**Google Drive resumable upload** ([Google docs](https://developers.google.com/drive/api/guides/manage-uploads)):
`POST` with `uploadType=resumable` returns a session `Location` URI (valid **one week**); chunks
go up via `PUT` with `Content-Range`; an interrupted client probes with an empty `PUT` and a
`Content-Range: */<total>`, gets `308` + a `Range` header saying what's already landed, and
resumes. Google's own docs frame the *simple/multipart* (single-request) form as the right choice
for files ≤5 MB where "re-uploading the data if the connection fails is not
prohibitive" — again the same calibration point.

**Reading across all of these**: two-phase-with-an-id is the default for anything where the blob
and its metadata have different lifecycles or sizes; single-request inline multipart survives
only where the whole thing is small and one user action (chat). Notemap's captures carry audio,
images and full-page HTML snapshots — closer to Mastodon/Slack/Drive's territory than Discord's.
**Two-phase, as designed, is the right call, not a premature abstraction.**

---

## 2. Resumable/chunked upload standards

**tus** ([tus.io/protocols/resumable-upload](https://tus.io/protocols/resumable-upload), protocol
v1.0.0, 2016-03-25): Creation extension — `POST` with `Upload-Length`, server replies `201` +
`Location`. Core loop: `PATCH` chunks with `Content-Type: application/offset+octet-stream` and an
`Upload-Offset` header; server replies `204` with the new offset. Resume: `HEAD` returns the
current `Upload-Offset`. Optional Checksum extension: client sends `Upload-Checksum: sha1
<base64>` per chunk; server replies `460 Checksum Mismatch` on failure — "the Server MUST support
at least the SHA1 checksum algorithm."

**IETF `draft-ietf-httpbis-resumable-upload`** — current revision **-12, dated 2026-07-06**
([datatracker.ietf.org](https://datatracker.ietf.org/doc/draft-ietf-httpbis-resumable-upload/)),
active httpbis working-group draft (not yet an RFC), authored by people from Transloadit
(a media-transcoding company) and Apple/Cloudflare. It formalizes the same shape as tus into
plain HTTP: a temporary "upload resource," an `Upload-Complete` boolean marking the final chunk,
offset discovery via `HEAD`/`GET`, `PATCH` with `application/partial-upload`, `DELETE` to cancel.
It explicitly supersedes the earlier `draft-tus-httpbis-resumable-uploads-protocol` — i.e. the
tus community's own proposal folded into httpbis. Still in flux (12 revisions since inception);
not something to build against as a stable target yet.

**Judgment, not fact**: resumability solves a problem of scale and network hostility notemap
doesn't have. tus and the IETF draft exist for internet-facing platforms serving many untrusted
clients uploading large media (video especially) over consumer mobile networks, where losing 40
minutes of a 2 GB upload at 90% is a real, recurring cost worth protocol machinery. Notemap's
media — voice memos, single images, SingleFile HTML snapshots — sit in the kilobytes-to-tens-of-
MB range, well under even S3's own 100 MB multipart-upload threshold (§1). The failure mode that
matters here (a mobile client drops connection mid-upload) is already handled at a coarser but
sufficient grain by the outbox/replay design the project already has: the client holds the
capture (and its unsent asset) and retries the *whole* operation on reconnect, idempotently, by
client-generated id. Adding tus- or IETF-draft-style byte-offset resumption on top would be a
second retry mechanism solving the same problem the outbox already solves, at a size scale where
"just resend the file" costs nothing observable. **Skip it for v1**; revisit only if a payload
type genuinely reaches into the hundreds of MB (e.g. long-form video capture), which nothing in
scope today does.

---

## 3. Integrity verification on upload

**RFC 9530** ([rfc-editor.org, published February 2024](https://www.rfc-editor.org/rfc/rfc9530)),
obsoletes RFC 3230. Defines `Content-Digest` (hashes the message body) and `Repr-Digest` (hashes
the full representation). Algorithm registry marks **SHA-256 and SHA-512 as "Active"** (suitable
for general use); **MD5 and SHA-1 are explicitly downgraded — "vulnerable to collision
attacks"** — alongside non-cryptographic legacy options (UNIX `sum`/`cksum`, Adler-32, CRC-32C).
Either side may compute and send a digest; a `Want-Content-Digest` preference field lets a client
ask the server for one, and vice versa — the RFC does not mandate who computes first.

**RFC 1864** ([rfc-editor.org, October 1995](https://www.rfc-editor.org/rfc/rfc1864)): the
original `Content-MD5` header, MIME/HTTP-era, meant to catch accidental transport corruption, not
adversarial tampering. Superseded in spirit by RFC 9530; MD5 itself has been cryptographically
broken for collision-resistance since the mid-2000s, well before RFC 9530 formalized deprecating
it.

**S3 `x-amz-checksum-*`** ([AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity.html)):
the mechanism that actually proves "the bytes I stored are the bytes you meant." AWS's own
clients (SDKs) compute a checksum client-side and send it with the upload; **S3 then
independently recomputes the checksum server-side over the bytes it actually received and
compares the two before committing the object — a mismatch fails the request (`BadDigest`)
rather than silently storing bad bytes.** Default algorithm is now CRC64NVME — a fast,
**non-cryptographic** checksum, not SHA-anything, because S3's integrity goal here is
transmission-corruption detection, not adversarial collision resistance; SHA-1/SHA-256/MD5 are
offered as options but aren't the default.

**Who computes the hash in practice, synthesized**: both sides, and the proof is in the
*comparison*, not in either side's number alone. A client-only digest (send `Content-Digest`,
trust it) only detects corruption if something later re-derives and compares it; S3's pattern —
client computes, server recomputes over what it actually persisted, compares before
acknowledging — is the stronger, load-bearing version.

**For notemap**: no adversary is trying to smuggle a colliding blob into a single-user local
daemon, so RFC 9530's "vulnerable to collision attacks" framing (an adversarial one) doesn't
directly bite. What does apply is S3's actual mechanism: whatever hash notemap already computes
for dedup (§4, needs to be cryptographically strong regardless, for collision-avoidance reasons
unrelated to transport) can double as the transmission-integrity check too — recompute it
server-side (in the adapter, over the bytes actually written to disk) and compare against
whatever the client claims, or against nothing and just record it, per `core.md`'s stated intent
("Core records each asset's content hash so that a change made outside notemap is detected").
**No need for a second, separate checksum standard** — one hash, used for both dedup addressing
and drift detection, computed on write and re-verified whenever read-time drift matters, is
sufficient at this scale.

---

## 4. Content-hash deduplication

**git** ([git-scm.com](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)): objects are
stored at `.git/objects/<2-char>/<38-char>`, keyed by SHA-1 (moving toward SHA-256 support, per
[git's hash-function-transition doc](https://git-scm.com/docs/hash-function-transition)) of a
header + content. Identical content always produces the identical key — two files with the same
bytes are structurally the same object; there is no way to store them twice. Names (paths) live
one layer up, in tree objects, entirely separate from the blob's own identity.

**IPFS** ([docs.ipfs.tech](https://docs.ipfs.tech/concepts/content-addressing/)): CIDs are the
hash of the (chunked, DAG-structured) content; identical bytes under identical chunking/codec
settings produce identical CIDs, which is IPFS's dedup property. Stated downsides: CIDs are
**not human-legible** (`QmbWqxBEKC3P8tqsKc98xmWNzrzDtRLMiMPL8wBuTGsMnR`) and need a separate
naming layer (IPNS) for anything a person needs to remember or reference; and **identical CIDs
across different uploaders make identical content traceable/correlatable** — a real privacy
concern in IPFS's multi-party, public-network context.

**Perkeep** (formerly Camlistore — ["receives your data blob, hashes it, and then stores it under
that hash (called blobref)"](https://github.com/perkeep/perkeep/blob/master/doc/terms.md)):
the whole system is built on this. A **blobref** is literally `<hashname>-<hexdigest>`
(`sha1-f1d2d2f924e986ac86fdf7b36c94bcdf32beec15`). Perkeep's own answer to "a hash isn't a name a
human wants" is the **permanode**: a separate, small, GPG-signed mutable object whose *own*
blobref is the stable handle, with signed claims layered on top attaching a title, tags, etc.
The content blob itself is never given a human name — the permanode is the naming layer,
entirely above the content-addressed store.

**Restic** ([restic.readthedocs.io](https://restic.readthedocs.io/en/stable/100_references.html)):
storage IDs are SHA-256 of pack contents; "the lower case hexadecimal representation of the
storage ID" *is* the filename inside the repository. Dedup is automatic and total — identical
content across any two backed-up files collapses to one stored blob, referenced from tree objects
that hold the human-facing filename separately. Restic's design doc treats hash-collision risk as
outside the practical threat model (relies on SHA-256 remaining unbroken).

**Borg** ([borgbackup.readthedocs.io](https://borgbackup.readthedocs.io/en/stable/internals.html)):
content-defined (Buzhash) or fixed-size chunking; "deduplication is performed globally across all
data in the repository... using Chunks," matched via a hash lookup against a local "chunks
cache." (The internals overview page doesn't itself spell out refcount/prune mechanics in the
section fetched — that detail lives on Borg's separate file-formats page, not re-fetched here.)

**Nix store**: content-addressed derivations are a real, if still-maturing, feature; there's a
documented **interaction bug** between CA derivations and the garbage collector —
[NixOS/nix#4026](https://github.com/NixOS/nix/issues/4026): a non-realised CA derivation present
in the store, combined with `keep-derivations = true` (the default), makes
`nix-collect-garbage` fail outright. Worth citing precisely because it's a concrete, sourced
instance of "content-addressing plus GC bookkeeping have a sharp edge," in a mature, widely-used
system — a caution to actually test notemap's own ref-count-plus-purge interaction rather than
assume it's obviously correct.

**Matrix**: the reference homeserver implementation (Synapse) does **not** dedup by default —
every upload gets its own `mxc://` media id regardless of byte content. A **third-party** project,
[matrix-media-repo](https://github.com/t2bot/matrix-media-repo), adds deliberate hash-based
dedup: "storing a 1:many relationship of files to mxc uris... different mxc URIs... can point to
the same file on disk (which is indexed by hash)" — secondary-source-confirmed via the project's
own README/description, not a Matrix spec requirement. This is a strong, directly-analogous
precedent for notemap's shape: **many logical references (mxc URIs / notemap's asset
references), one physically stored file, keyed by hash as an internal index — added as a
deliberate value-add layer, not assumed as a default.**

**Known downsides, and how they land for notemap**:

- **Hash collisions in practice.** SHA-1 has a real, public collision:
  [SHAttered, Feb 2017](https://shattered.io/sha1-collision/) — two distinct PDFs, one SHA-1.
  Git's response was a built-in collision-detecting SHA-1 implementation, shipped within days,
  and a longer-term move toward SHA-256 support. *Judgment*: this is a live, sourced argument for
  **not using SHA-1** for anything security-relevant, but the collision cost (birthday-bound: full
  break of SHA-256 would need ~2^128 evaluations) makes SHA-256 collision risk cosmically
  irrelevant at any single-user asset library's actual scale. Use SHA-256 (what restic already
  uses), not SHA-1 or MD5 (both explicitly deprecated by RFC 9530, §3).
- **The human-naming problem.** git, restic, IPFS and Perkeep all solve it the same way: never
  let the human-facing name *be* the content-addressed key; keep a separate naming layer (tree
  entry, permanode, IPNS) above the hash. Notemap's design — name the on-disk file for a human,
  record the hash purely as metadata — is a stricter version of the same principle: it doesn't
  even use the hash as the *internal* storage path, only as an out-of-band value for dedup
  lookup and drift detection. **Validated, and arguably safer than the prior art**, since none of
  the systems above have to worry about a human ever seeing the storage key directly.
- **"Which name wins."** None of git/restic/Perkeep/IPFS face this, because none of them name
  content-addressed objects for a human at the storage layer at all — the question doesn't arise
  when the "name" is always the hash and the human label lives one layer up, attachable
  independently per reference. Notemap's choice to give the *stored file itself* one canonical
  human name means that when two different captures (different original filenames, different
  capture times) produce byte-identical content, something has to decide **which one's name the
  stored file keeps.** This is a genuine gap not answered by any prior art surveyed — **flag as
  an open design question**, not settled by precedent. (First-write-wins is the obvious default;
  the second capture's own metadata, e.g. its original filename, would need to live elsewhere —
  perhaps as a note on that capture's reference to the asset rather than on the asset itself.)
- **Privacy/metadata leakage via hash equality.** IPFS's CID-correlation concern and the
  cryptographic literature on convergent encryption's **"confirmation of file" attack** (secondary
  source, e.g. [smarx.com's discussion](https://smarx.com/posts/2020/09/convergent-encryption-and-why-no-one-uses-it/):
  "one party with possession of a file can confirm that another party possesses the file... even
  if the other party stores only ciphertext") are both fundamentally **multi-tenant** concerns —
  they only bite when two different *parties* might hold the same content and hash equality
  reveals that fact to each other or to an operator. Notemap is explicitly single-pool,
  single-user (`core.md`: "multi-user and multi-pool operation" out of scope). **This entire risk
  class doesn't apply** — there's no second party whose possession of a file could be confirmed
  via notemap's own hash index. Don't import convergent-encryption-style mitigations; they solve
  a problem that requires a second tenant to exist.

---

## 5. Orphan/garbage collection

**TTL on unreferenced/incomplete uploads.** Google Drive's resumable session expires after **one
week** if abandoned ([Google docs](https://developers.google.com/drive/api/guides/manage-uploads)).
Slack's two-phase flow states outright that if `files.completeUploadExternal` is never called,
"the uploaded file and associated metadata will be discarded"
([Slack docs](https://docs.slack.dev/reference/methods/files.completeUploadExternal/)) — the
allocated-but-uncommitted state is explicitly inert and reclaimable, official-doc-confirmed, not
inferred.

**Explicit commit/abort, plus a TTL backstop.** S3's multipart upload is the fullest example:
`CompleteMultipartUpload` is the commit; `AbortMultipartUpload` is the explicit undo, freeing
storage immediately; **and**, because a client can simply disappear without calling either, AWS
recommends attaching an `AbortIncompleteMultipartUpload` **lifecycle rule** that auto-deletes
abandoned multipart uploads after N days regardless
([AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)) — belt (an
explicit abort path) and suspenders (a TTL sweep for the crashed-client path that never calls
abort at all).

**Mark-and-sweep GC.** `git gc` ([git-scm.com/docs/git-gc](https://git-scm.com/docs/git-gc)):
marks everything reachable from refs/index/reflog, sweeps the rest, but **doesn't delete
immediately** — `gc.pruneExpire` defaults to **2 weeks**, specifically because "when git gc runs
concurrently with another process, there is a risk of it deleting an object that the other
process is using but hasn't [yet] created a reference to." Nix's collector does the same shape:
walk from roots under `/nix/var/nix/gcroots/`, mark reachable paths via the store DB's `Refs`
table, sweep everything else
([search-derived summary of nix.dev/nixos.org manual pages](https://nixos.org/manual/nix/stable/package-management/garbage-collection)).
Both need a grace window because "referenced" and "about to be referenced" look identical to a
sweep running at the wrong instant.

**Reference-counting's classic failure modes** (*judgment — a structural property of the
mechanism, not a single citable source, except where noted*): cycles are the textbook failure
mode, and don't apply here — assets don't reference each other, only items reference assets, so
there's no cycle to leak. The two failure modes that *do* apply to any refcounting scheme:
**leaked increments** (a process crashes after incrementing a count — e.g. mid-way through
writing a capture that references an asset — but before the referencing record itself commits,
leaving a refcount too high and the asset never freed: a wasted-space bug, not a correctness
bug), and **double-decrement** (two purges racing on the same asset each decrement once when only
one logical removal should have happened, under-counting and freeing a still-referenced asset:
the dangerous failure mode — real data loss, not just waste). The Nix CA-derivation/GC interaction
bug (§4, [NixOS/nix#4026](https://github.com/NixOS/nix/issues/4026)) is a concrete, sourced
instance of exactly this class of bookkeeping edge case surfacing in a mature system — reason
enough to test notemap's own ref-count-plus-purge path deliberately rather than assume it's
obviously correct by construction.

**For notemap, specifically**: `core.md`'s purge language ("an asset only when no remaining item
references it") describes freeing at **purge time** — an item that used to reference an asset
being removed. It does not yet describe the **store-time orphan**: `assets.store()` succeeds,
minting an asset with some initial reference count, but the capture that was going to reference
it never arrives (client crash between the two calls). Slack's and S3's own precedent both say
the same thing here: an allocated-but-uncommitted upload should be **inert by construction**, not
cleaned up after the fact. The cheapest version of that for a local single-user daemon —
proportionate to its scale, unlike git-gc-style periodic reachability sweeps or a Nix-style
roots-and-refs table — is **transactional**: don't increment an asset's reference count until the
capture record that references it actually commits, in the same transaction. That makes the
"orphan" case simply "an asset with reference count zero," reclaimable by a plain, infrequent,
cheap sweep (`DELETE assets WHERE ref_count = 0 AND created_at < now() - 1 day`) — the local
equivalent of S3's lifecycle rule or Drive's one-week session expiry, sized for notemap's actual
volume (a personal pool, not a multi-tenant object store) rather than a full mark-and-sweep
across the whole pool. **This is a gap worth closing explicitly in the spec, not left implicit.**

---

## 6. Streaming APIs at a no-filesystem port boundary

**WHATWG Streams** ([streams.spec.whatwg.org](https://streams.spec.whatwg.org/), Living Standard,
last updated **17 July 2026** at fetch time): `ReadableStream` is pull-based — the underlying
source's `pull()` callback fires "until the queue reaches its high water mark," with
`desiredSize` (high water mark minus queued bytes) as the backpressure signal a producer checks.
Cancellation is bidirectional and explicit: `stream.cancel(reason)` / `reader.cancel(reason)`
invokes the source's own `cancel()` callback. `ReadableStream.from(asyncIterable)` bridges from
async generators or a Node `Readable` directly, and native `for await` consumption acquires a
reader and respects backpressure/cancellation automatically.

**Node.js `Readable`** ([nodejs.org/api/stream.html](https://nodejs.org/api/stream.html#readable-streams)):
backpressure via `highWaterMark` + pause/resume/flowing-mode state machine; natively
async-iterable (`for await (const chunk of readable)`); cancellation via `.destroy([error])` or an
`AbortSignal` threaded through `stream/promises`' `pipeline()`. Functionally comparable to
WHATWG streams, but it's a Node-specific class living in `node:stream`.

**`AsyncIterable<Uint8Array>`**: the plain-TS-interface option — no class hierarchy, no DOM-lib
dependency, just the language's own iterator protocol. Backpressure is implicit and free: a
`for await` consumer only requests the next value when it's ready for it, so a well-behaved
async-generator producer naturally paces itself to consumption without any explicit signal.
Cancellation is weaker than either stream type: there's no producer-facing `.cancel(reason)` —
early exit (`break`, thrown error) invokes the iterator's own `.return()` if defined, which is
enough for cleanup but doesn't carry a *reason*, and doesn't let a caller abort an
otherwise-still-producing source independent of consumption.

**For notemap's port boundary specifically**: core is constrained to take no Node dependency by
default ("Core takes no framework or runtime dependency... a tsconfig without Node types" —
[core.md](../specs/core.md)) — that rules out `node:stream`'s `Readable` **as the port's own
type**, full stop, regardless of which streaming style wins on merits; a host's adapter is free
to use `Readable` internally and adapt it to whatever type the port actually declares (Node's own
`Readable.toWeb()`/`Readable.from()` make that trivial either direction). That leaves
`AsyncIterable<Uint8Array>` vs. the global `ReadableStream<Uint8Array>` (available in Node ≥18
without DOM lib, in every browser, and in Deno/Bun) as the two real candidates.

**Recommendation**: `AsyncIterable<Uint8Array>` for the port signature. It's the lowest-ceremony
choice — a bare iterator protocol, not a class with its own controller/lock/reader-acquisition
model — gets backpressure for free from `for await`'s pull semantics, and every real source an
adapter would hand core (a Node `Readable`, a WHATWG stream, an HTTP request body) is already
natively async-iterable or one call away from it. The one real gap — no explicit abort signal
independent of consumption — is cheaply closed by accepting an optional `AbortSignal` alongside
the iterable in the port's method signature, rather than adopting `ReadableStream`'s heavier API
surface just to get `.cancel()`. `ReadableStream` is the reasonable second choice if the team
would rather have a single globally-spec'd type with cancellation built in and doesn't mind the
slightly heavier surface (`getReader()`/lock semantics) at the port boundary.

---

## Fit vs. gap, by section

| # | Practice examined | Verdict for notemap | Note |
|---|---|---|---|
| 1 | Two-phase upload (id-returning, referenced later) | **Fits.** Matches Micropub/Mastodon/Slack/S3/Drive, not Discord's inline shape — and notemap's media is closer to their scale than to chat-attachment scale. | — |
| 2 | tus / IETF resumable-upload draft | **Skip for v1.** Solves flaky-mobile-at-scale; notemap's outbox/replay already covers the retry-whole-asset case at its actual size range. | Revisit only if a payload type reaches hundreds of MB. |
| 3 | Content-Digest / checksum-on-write | **Reuse, don't duplicate.** The dedup hash (needs to be strong anyway) can double as the drift/corruption check; no separate checksum standard needed. | Verify server-side by recomputing over written bytes, per S3's own pattern — don't just trust a client-supplied value. |
| 4 | Content-hash dedup, human name kept separate from hash | **Validated, stricter than prior art.** git/restic/Perkeep/IPFS all keep human names off the content-addressed key; notemap goes further by not even using the hash as the on-disk path. | Use SHA-256, not SHA-1/MD5 (§3, §4). |
| 4 | "Which name wins" on identical bytes, different origin names | **Open gap.** No prior art surveyed faces this — none of them name content-addressed data for humans at the storage layer. | Needs an explicit rule (first-write-wins is the obvious default). |
| 4 | Privacy/correlation risk from hash equality | **Doesn't apply.** That risk class is multi-tenant-only; notemap is single-pool/single-user. | Don't adopt convergent-encryption-style mitigations. |
| 5 | Orphan reclaim (store succeeds, reference never arrives) | **Open gap, cheap fix available.** `core.md` covers purge-time freeing, not store-time orphaning. | Don't count a reference until the referencing capture commits (transactional); back that with an infrequent zero-refcount sweep, not a mark-and-sweep GC daemon. |
| 5 | Reference-counting double-decrement / leaked-increment | **Real failure class, worth testing.** Nix's own CA-derivation/GC bug ([#4026](https://github.com/NixOS/nix/issues/4026)) shows this bites mature systems too. | Test the purge-plus-refcount path deliberately. |
| 6 | Port-boundary streaming type | `AsyncIterable<Uint8Array>` (+ optional `AbortSignal`) fits core's no-Node-types constraint best; `ReadableStream` is the reasonable second choice; `node:stream.Readable` is ruled out for the port signature itself. | Adapters may use `Readable` internally regardless. |

---

## Sources consulted

Primary: W3C Micropub Recommendation, Mastodon's own developer docs, the Matrix spec
(spec.matrix.org), Slack's and Discord's official API docs, AWS S3 user guide + integrity-check
docs, Google Drive API guides, tus.io's protocol page, the IETF datatracker (current
httpbis-resumable-upload draft), RFC 9530 and RFC 1864 via rfc-editor.org, git's own docs
(git-scm.com) and source-adjacent book, IPFS's official docs, Perkeep's own repo docs
(terms.md), restic's and Borg's official read-the-docs sites, the NixOS/nix GitHub issue tracker
and manual, the WHATWG Streams Living Standard, and Node.js's official API docs. Secondary,
flagged inline where used: a product write-up on convergent encryption
(smarx.com) for the "confirmation of file" attack description, and a third-party project's own
README (matrix-media-repo) for Matrix's actual (non-default) dedup behavior, since the Matrix
spec itself doesn't mandate dedup.
