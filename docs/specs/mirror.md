# Spec: The mirror on disk

**Status**: Draft
**Last updated**: 2026-08-12
**Shipped**:

- 2026-08-12 — **`assets/` is real, and a rendering can point into it.** A local filesystem blob
  store (`@notemap/blob-fs`) writes content-addressed blobs under `assets/<2-char shard>/<sha-256>`,
  and the daemon wires it. A record can no longer fail to be made: references resolve against rows
  in the same pool, so `asset-missing` left the non-retryable list. A renderer is now told which
  directory it is writing into and may be handed the blob driver's `pathFor`, which is how the
  `image` type emits a markdown image pointing at the blob itself rather than at a copy.
  ([plan](../plans/asset-upload-and-images.md))
- 2026-08-12 — **Frontmatter strings are single-quoted.** The YAML library is now `js-yaml`,
  which ships ESM: `yaml` is CommonJS on node, and the `require("process")` inside it survived
  into the daemon's ESM bundle as a call that throws on load. Values are still quoted without
  exception and keys still are not, so nothing reads back as a number, a bool or null; only the
  quote character changed. A smoke test now runs `dist/main.js`, which is what nothing did.

- 2026-08-11 — **The writer half.** The mirror record, its canonical serialisation and its parse
  live in core, proved lossless by a property test over generated pools. Mirror jobs can be
  claimed, coalesce against unleased jobs only, and are claimable only when their item has no
  write in flight. A local filesystem driver (`@notemap/mirror-fs`) writes a record and a
  rendering per item, atomically, record first. The daemon wires it, polls for owed writes, and
  captures normally with it turned off. **Rebuild, verify and repair are not built**, so what
  exists today is a complete copy that notemap cannot yet read back.
- 2026-08-11 — **Review fixes.** Coalescing counts *pending* jobs, so an abandoned job no longer
  swallows the writes its item goes on to owe, and a retry whose rival is already pending is
  dropped rather than rejected. Removal matches the id inside a record instead of the filename,
  which was deleting every item whose id merely ended with the one asked for. Filenames fold
  case. A missing asset carries its own non-retryable code. The frontmatter block is emitted by
  a YAML library and its key mapping is exhaustive over `ItemRecord`, so a field added to the
  domain fails to compile until someone decides where it goes. `MirrorReader` now describes what
  a record mirror holds. ([review](../reviews/mirror-writer-2026-08-11.md))
  ([plan](../plans/mirror-writer-first-slice.md),
  [ADR 15](../adr/0015-the-mirror-record-is-authoritative-markdown-is-a-rendering.md))

---

## Outcome

Everything worth keeping accumulates as plain files while notemap runs, without notemap ever
reading them back. A lost pool is rebuilt from the mirror and the assets alone, and
uninstalling notemap costs nothing but the tooling.

---

## Scope

### In scope

- The **mirror record**: what one item's durable state is on disk, what is left out, and how it
  is serialised.
- Write semantics: what makes a mirror write owed, when it happens relative to the pool write,
  and what a failed write means.
- The on-disk layout and file formats of the local filesystem driver, including `pool-mirror/`.
- Rebuild of a pool from mirror and assets, and the verify/repair operation.

### Out of scope

- The mirror as an interop surface. It is a safety net; nothing builds against it
  ([standards.md](../standards.md#conformance)).
- Routed-output formats at destinations — the router's concern, per
  [standards.md](../standards.md#routing-dialects-one-item-many-destinations).
- The layout of `assets/`, which belongs to the asset-store driver
  ([ADR 13](../adr/0013-assets-are-named-references-to-content-addressed-blobs.md)). It appears
  here only because the backup unit spans both and a rebuild needs both.
- What a client does once it learns its pool was rebuilt — [sync.md](sync.md).

---

## Behavior

### What the mirror carries

The unit is the **mirror record**: one item's complete durable state, sufficient on its own to
restore that item. It carries

- the item — its id, source and source item id, capture time, content time, revision link,
  archive state, and its tags with their attribution;
- the payload — type, content, metadata, and its asset references;
- the assets those references reach, each with its id, filename, media type, size and blob
  hash, so a rebuild restores the same asset identities and a human can find the bytes;
- the item's artifacts, including corrections, each with its attribution and `correctionOf`
  link;
- the item's routing records;
- the item's `modified_at`, recorded for verification only and never restored.

It does not carry suggestions, decided or pending; enrichment states; jobs, leases or the action
log ([ADR 12](../adr/0012-core-keeps-an-append-only-action-log.md)); tombstones; or anything
derived, `supersededBy` included. This is the material-not-operational rule of 2026-08-03 held
to: what the user kept is mirrored, how notemap ran is not. A rebuilt pool therefore has no
history and no rejection signal, and both losses are accepted.

**Media is stored once**, in `assets/`, referenced by both the pool and the mirror. Blobs are
content-addressed and sharded by hash prefix
([ADR 13](../adr/0013-assets-are-named-references-to-content-addressed-blobs.md)); a blob's name
is its own SHA-256, so drift is detected and reported, never silently absorbed. `assets/` is
therefore not browsable the way a folder of named files would be: a human who has lost notemap
finds the bytes by reading the record, which names them. The data is there and findable, not
arranged the way it arrived.

### The record is core's; the bytes are the driver's

Core defines the mirror record, its canonical serialisation and its parse. Every field in it is
domain vocabulary, and losslessness is a domain guarantee, so it is proved once — as a property
test over generated pools, with no filesystem — rather than by each driver separately
([ADR 15](../adr/0015-the-mirror-record-is-authoritative-markdown-is-a-rendering.md)).

Serialisation is **canonical**: stable key order, and one spelling per instant. A timestamp is
an instant rather than a spelling ([core.md](core.md#constraints)), and a store is free to hand
one back in its own form, so without canonicalisation the byte comparison that verify performs
would report drift forever.

The driver decides where the bytes go: paths, layout, atomicity, and the entire human-facing
rendering. A different driver could put the same records in object storage without touching the
domain.

Because a job carries no snapshot, core also answers **the record for an item as it stands now**,
which is what whatever performs a write asks for at the moment it writes. That is a read of the
pool, not of the mirror; nothing about it can reach a mirror file, and nothing in it can fail —
an item is either there or it is gone.

### What makes a write owed

**Every mutation that changes mirrored material enqueues a mirror job for that item**, in the
same transaction as the mutation itself. A capture, an amendment, a revision, a tag added or
removed, an archive or unarchive, an artifact or a correction, a routing record: each leaves the
pool owing the mirror a write, and a mutation committed with nothing recording that debt would
never be written and nothing would notice.

Jobs **coalesce against pending jobs only**. A mutation arriving while an item already has a
pending, unleased mirror job adds nothing — that job will write the current state when it runs.
A mutation arriving while the item's only mirror job is *leased* enqueues a new one, because the
host holding that lease has already read the state it is writing and would otherwise absorb the
mutation into a write that cannot contain it.

**Abandoned jobs are not pending** (decided 2026-08-11). An abandoned job records a failure a
person has to look at; it is not a write that is still going to happen, so it holds no slot and
a later mutation — or a repair — enqueues afresh. Treating it as pending made it swallow every
write its item went on to owe, which is exactly the loss the debt rule exists to prevent. A job
that ends by being *retried* while a rival is already pending is dropped instead: the rival
writes state read fresh, so it says everything the retry would have. An abandoned job stops
being reported once a later write for that item succeeds — the failure it names is settled.

A mirror job is **claimable only when its item has no leased mirror job**. At most one write per
item is ever in flight, so two writers never race on one file and a write carrying older state
can never land second. At most two mirror jobs exist for an item at any time.

The writer writes the item's current state, read fresh. A job carries no snapshot.

### Writing

A write produces two files, in this order:

1. The **record**, serialised canonically, written to a temporary name in its target directory,
   flushed, and renamed over the target. The rename is atomic within a directory, so a crash
   leaves either the previous complete record or the new one, never a truncated file that a
   rebuild would read as authoritative.
2. The **rendering**, produced by the host's renderer for that payload type, written the same
   way.

Material is durable before presentation is attempted. A renderer is host-supplied code, and a
bug in it must not keep material out of the mirror.

**A record without its rendering is therefore a state the mirror can be in** (stated 2026-08-11),
and an expected one: an abandoned rendering leaves it so indefinitely. It is not drift and it is
not a torn write — the record is complete and a rebuild reads only the record. Verify reports the
missing rendering, and a repair rewrites the pair. The reverse — a rendering with no record — is
a stray, because nothing ever writes one in that order.

### The markdown is a rendering

Nothing ever parses the `.md`. It exists for a person who has lost notemap, and losslessness
rides entirely on the record beside it, so **a renderer may be as lossy, opinionated and pretty
as it likes** — dropping fields, reordering, summarising, emitting a dialect that suits wherever
those notes were destined. This is worth stating because the instinct on reading "mirror" is
that everything on disk must round-trip, and here half of it deliberately does not.

Renderers are wired by the host, per payload type, because a payload's content is an open JSON
object and nothing in core knows which part of it is prose. A payload type with no renderer
falls back to the driver's default: frontmatter and a fenced JSON block of the content, whose
fence is made longer than any backtick run inside it — a payload's content is open JSON and may
hold one of any length. A
renderer that throws **fails the job**, so a broken renderer is visible rather than silently
degrading into JSON blocks — and because the record is already durable by then, nothing is lost
while it is broken.

**A rendering may point at a blob, and never copies one** (added 2026-08-11). An image renders as
a markdown image whose target is the blob's own file, relative to the rendering — `assets/` is
shared and written once, and a second copy beside the `.md` would double every photo on disk for
a link. The path scheme is the blob driver's, so the renderer is handed that driver's `pathFor`
at wiring time and is told which directory it is writing into; the mirror learns no second layout.
Two things follow and are accepted: a blob file has no extension, so a viewer that guesses by
suffix will not preview it, and the alt text carries the **filename** — the only place in the
readable file that says what the bytes were called.

**Frontmatter is the driver's, not the renderer's.** The driver emits a fixed block from the
record — identity, capture time and source, tags, and the provenance relations of
[standards.md](../standards.md#identity--provenance-the-cross-app-glue) — and the renderer
supplies the body, plus any extra keys, which may not shadow the fixed ones. Provenance is a
standing guarantee and not something a host's renderer may drop.

### When a write fails

Mirror jobs report an outcome the way enrichment jobs do, and every attempt is an entry in the
action log.

- A **retryable** failure — the folder is offline, the disk is full, a mount is stale — retries
  indefinitely with capped backoff. The work is genuinely still owed and will eventually
  succeed, and a bounded limit would abandon every pending job at once the first time a synced
  folder went away for a day.
- A **non-retryable** failure — a renderer that throws, a record that will not serialise — is
  abandoned on the first attempt. It will fail identically on every attempt, and retrying forever
  would keep it off the surface that exists to say something needs a person.

**An unrecognised failure is retryable.** That default is deliberate: giving up on work that is
genuinely still owed loses material until someone runs a repair, where retrying something
hopeless costs a row on a surface that already says it needs a person. It follows that a case
worth abandoning has to *say so*, rather than falling through to the default (decided
2026-08-11).

**A missing asset is no longer one of them** (amended 2026-08-11). A record used to be assembled
by resolving each reference through the asset store, which could answer that it had no such
asset, so projecting a record was itself a way for a write to fail. Assets are now rows in the
pool beside the references that count them
([ADR 16](../adr/0016-the-asset-registry-is-pool-state.md)), and a foreign key makes an
unresolvable reference impossible — so **the record a write asks for cannot fail**, and
`asset-missing` leaves the list. A blob's bytes are not in the picture either: the mirror writes
no blobs. `assets/` is written once by the blob store and shared, and a record names a blob
rather than carrying it, so nothing about a missing or drifted blob can fail a mirror write.
Deep verify is what reports one. Rebuild takes the same stance on the same fact, and correctly: a
missing blob is reported and never fatal, because by then nothing can be done about it.

Abandoned mirror work appears on the same surface as abandoned enrichment
([core.md](core.md#enrichment)), so one read answers "what needs me". Repair re-enqueues it, and
the abandoned row stops being reported once that write lands.

### Purge

Purge removes an item's mirror files. The removal is a **job carrying the item's bare id**,
enqueued as purge deletes the item's other jobs, and it therefore outlives the item it is about.
It inherits leasing, retry, abandonment and the abandoned-work surface: a purge whose files could
not be deleted is visible rather than silent, which is what [ADR
4](../adr/0004-purge-leaves-a-minimal-tombstone.md) demands of the one destructive operation.

Blobs are not the mirror's to free. An asset is released when its last item goes and a blob when
its last asset does, by the asset store.

### Layout — the local filesystem driver

```
notemap/
  state/notemap.db                 <- authoritative, never synced
  pool-mirror/YYYY/MM/DD/          <- write-only: one .json + one .md per item
  assets/<hash-prefix>/            <- blobs, single copy, content-addressed
```

One file pair per **item**, revisions included. A revision is a first-class item in the feed, and
a chain sharing one pair would put two items behind one file, breaking the one-write-per-file
guarantee that coalescing buys.

```
pool-mirror/2026/08/11/T142305-text-<item-id>.json
pool-mirror/2026/08/11/T142305-text-<item-id>.md
```

Directory and time prefix come from the item's capture time **in UTC**; the type is the payload
type; the id is the item's. Every component is immutable, so **the path is computable from the
item alone**, identically on every machine, forever.

Ids are client-minted and may hold anything, so the id in the filename is a **one-way encoding**
(stated 2026-08-11): anything but a lowercase safe name is replaced *and* given a digest of the
original. Case is folded because `abc` and `ABC` are two items but one file on macOS and Windows,
and a digest is what keeps two ids that sanitise alike in two files. The consequence is that a
filename cannot be turned back into an id — so removal, which is given a bare id because the item
may already be purged, walks the tree and matches on the id **inside** each record. Matching on
the name would take every item whose id merely ends with the one asked for. This is what lets a rewrite, a removal and a
repair address a file directly, in a store that may never be read for an index. A revision
carries its original's capture time and so lands in the same directory at the same instant; the
id keeps them distinct.

The cost is that late-evening captures file under the previous UTC day, and that a filename says
when and what rather than what it is about. The mirror's promise is that material is there and
findable, which is the same narrowing ADR 13 already accepted for `assets/`. The exact capture
time is in the filename, the frontmatter and the record.

Amending the head **rewrites the pair in place**. Appending would only make sense if the mirror
were an event log, which ADR 12 deliberately keeps it from being, and an amendment overwrites
content the pool no longer holds either.

Because mirror text is never read, `pool-mirror/` is safe inside a synced folder. Neither half is
portable alone: **the backup unit is the whole `notemap/` directory**, and rebuilding needs the
mirror *and* the assets.

### Rebuild

Rebuild is **its own entry point**, not an operation on a live pool: it populates an empty pool
from a source that normal operation must never touch. It takes the mirror reader explicitly, and
`PoolPorts` therefore carries no reader at all — a pool wired for capture is handed nothing that
can read the mirror, which makes the write-only rule structural rather than a convention review
defends.

It does not go through capture. Capture mints ids, enqueues mirror jobs and appends actions, all
wrong when replaying material that already has ids and already has files on disk. Rebuild writes
items directly, enqueues nothing and logs nothing.

- **Enrichment state is derived from material.** An `(item, enrichment)` pair with at least one
  mirrored artifact is `done`; everything else falls to normal per-source policy. Without this a
  rebuilt pool re-requests everything, and since enrichment is never destructive, every voice
  memo would acquire a third transcript beside the mirrored original and its correction. No
  operational state has to be mirrored to get it: done-ness is a fact about material.
  An enrichment that only ever produces suggestions leaves no artifact and so runs again, which
  is right — suggestions are regenerable by definition and were never mirrored.
- **A missing or drifted blob is reported, never fatal.** The item is restored with its asset
  references intact and the blob is simply absent or drifted. A voice memo keeps its text, tags,
  corrected transcript and routing history when its audio is gone; refusing the whole rebuild
  over one bad blob would fail at the moment recovery matters most.
- **A rebuilt pool mints a new identity.** Its `modified_at` sequence restarts from zero, and
  delta cursors name that store-internal sequence
  ([ADR 14](../adr/0014-pagination-by-domain-position.md)), so every cached client cursor becomes
  not merely stale but plausibly wrong. A client comparing the pool identity it cached learns
  its cursor is void instead of receiving a confidently incorrect delta. What it then does is
  [sync.md](sync.md)'s.

### Verify and repair

Mirror writes are asynchronous, so the lossless claim is "lossless up to pending mirror jobs".
Verify closes that gap, and backup tooling runs it first. Like rebuild, it takes the mirror
reader explicitly — walking the mirror is not normal operation.

**Fast** checks that every item has a pair, that the record parses, and that the `modified_at` it
records matches the item's; and it reports orphaned files and temporary files left by crashed
writes.

**Deep** additionally re-serialises each record canonically and compares it byte for byte, which
catches an external edit that fast mode cannot, and verifies every referenced blob through the
asset store. It hashes every byte in the pool, so it is run on request rather than at every
backup.

The reader hands back **one entry per pair**, each of which is a record that parsed, a file that
would not parse, or a stray — a temporary file a crash left, a rendering with no record. A record
entry names the rendering beside it, and **a record whose rendering is absent is a finding, not a
fault**: writes are record-first, so an abandoned renderer leaves exactly that. Whether a record
is an *orphan* is not the reader's to say: that needs the pool. Artifacts and routing are not
asked for per item, because a record already carries them.

**Repair only enqueues.** A mirror job for every item whose files are missing or stale, a removal
job for every orphan — and then the job runner writes, as it does for everything else. There is
exactly one write path into the mirror, so repair cannot race a running daemon, cannot half-write,
and inherits leasing, retry and the abandoned-work surface. Repair is a pool mutation and nothing
more; the caller drains the queue afterwards.

Repair never touches the pool's material. The pool is authoritative and the mirror is the copy;
a mirror file that disagrees is rewritten, never read back.

### Disabling the mirror

A pool may be wired without a mirror writer, in which case nothing enqueues mirror jobs.
Re-enabling is one repair run, which enqueues a write for every item.

Two consequences, stated plainly because they are easy to acquire without noticing: the SQLite
file becomes the only copy of everything, and the drop-and-rebuild migration path of
[ADR 9](../adr/0009-versioned-api-mutable-until-first-real-pool.md) — which makes pre-freeze
schema churn cheap — does not apply to that pool.

---

## Constraints

- **The mirror is never read during normal operation.** Rebuild and verify are the only readers
  of mirror text, and both take the reader as an explicit argument. Media bytes in `assets/` are
  the single runtime exception.
- **The reader enumerates, and reports rather than skips.** Verify has to find files that belong
  to no item and temporary files left by a crash, so reading the mirror is not only "give me the
  records": a file that fails to parse is a finding, not something to pass over quietly, and a
  reader that silently skipped one would let verify report a healthy mirror that cannot rebuild.
- **A capture never fails because a mirror write did.** Mirror writes go through the same
  job/lease machinery as enrichment.
- **An external tool editing or deleting mirror text cannot corrupt the pool.** Deep verify
  reports the divergence; repair rewrites from the pool.
- **Tombstones are not carried.** A rebuilt pool has no purge history; the consequences for
  clients live in [sync.md](sync.md).
- Pre-freeze the format is cheap to change: the mirror is regenerable from the database
  ([ADR 9](../adr/0009-versioned-api-mutable-until-first-real-pool.md)), and repair is the
  regeneration.

---

## Prior decisions

- **[The mirror record is authoritative; the markdown is a
  rendering](../adr/0015-the-mirror-record-is-authoritative-markdown-is-a-rendering.md)** — a
  payload's content is open-ended JSON, so markdown cannot carry losslessness for most payload
  types. The two files divide by audience instead. Supersedes ADR 1's capture-`.md` +
  state-`.json` split.
- **[The pool is a database](../adr/0001-pool-is-a-database.md)** — a lossless write-only mirror
  buys ownership without reconciliation, and the round-trip test is what keeps it honest.
- **[Assets name, blobs store](../adr/0013-assets-are-named-references-to-content-addressed-blobs.md)**
  — the mirror records each asset's filename beside its blob reference, which is what makes an
  unbrowsable `assets/` acceptable.
- **[The asset registry is pool state](../adr/0016-the-asset-registry-is-pool-state.md)** — an
  asset is a row beside the references that count it, so projecting a record resolves them by
  reading the same pool. The mirror writes no blobs, and a record can no longer fail to be made.
- **[An append-only action log](../adr/0012-core-keeps-an-append-only-action-log.md)** — the log
  is operational and not mirrored, which is also why the mirror is not an event log and an
  amendment rewrites in place.

---

## Open questions

- [ ] 2026-08-11 — Whether a mirror record should be compressed on disk, and whether that is the
      driver's choice alone. A long transcript is rewritten whole whenever an unrelated tag is
      added, which is fine at personal scale and might not stay fine.
- [ ] 2026-08-11 — Whether the abandoned-work surface needs a companion that answers "how far
      behind is the mirror?". Abandonment is visible; a large backlog of healthy pending jobs is
      not, and only a verify run reports it today.
- [ ] 2026-08-11 — Whether repair should be able to delete an orphan it cannot attribute to a
      purge. It enqueues a removal today, which is right for purge residue and possibly wrong for
      a file a person put there.

---

## Acceptance criteria

- A pool rebuilt from its mirror and assets is equivalent to the original: same items, same
  order, same classification with the same attribution, same artifacts and corrections, same
  routing records, same asset identities and filenames.
- A pool round-trips through mirror records and back with no filesystem involved, over generated
  pools, as a property test.
- Tagging, archiving, correcting an artifact and routing each leave the item's mirror files
  matching the pool once the queue drains.
- A mutation arriving while an item's mirror write is in flight is written by a subsequent job,
  not absorbed into the one already running.
- Two mirror writes for one item are never in flight at once.
- A crash mid-write leaves either the previous complete record or the new one, never a partial
  file.
- A renderer that throws leaves the record durable, fails the job, and puts the item on the
  abandoned-work surface; the item still rebuilds.
- A payload type with no renderer wired still produces a readable file with provenance
  frontmatter.
- A mirror write failing because the folder is offline retries when it returns, without having
  been abandoned in the meantime.
- Deleting or editing a mirror text file leaves the pool unaffected; deep verify reports it and
  repair restores it.
- Editing a blob outside notemap is reported as a change rather than passing unnoticed.
- Purging an item removes its mirror files; a purge whose removal fails is visible on the
  abandoned-work surface rather than reported as complete.
- The same item rewritten from a machine in another timezone writes the same path.
- A rebuild over a mirror missing some blobs restores every item and reports every missing blob.
- A rebuilt pool re-runs no enrichment that already produced an artifact.
- A client that cached a pool identity can tell that the pool it is now talking to was rebuilt.
- A pool wired without a mirror writer captures normally and enqueues no mirror jobs; a repair
  run afterwards mirrors every item.
