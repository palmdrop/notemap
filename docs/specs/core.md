# Spec: Core

**Status**: Draft
**Last updated**: 2026-08-18
**Shipped**:

- 2026-08-08 — A source needs no declaration to capture; `config.sources` is a policy registry
  rather than a guest list, and `unknown-source` is gone. The `SchemaValidator` port has its
  first real implementation (`@notemap/schema-ajv`), and the first host — the daemon — drives a
  pool through configured adapters end to end. ([plan](../plans/capture-feed-mvp.md))
- 2026-08-08 — Paginated reads continue from a domain **position** rather than an opaque
  cursor, across core's types, the store port and the SQLite driver. An abandoned enrichment
  now records `abandonedAt`, which is what its surface is ordered by.
  ([plan](../plans/http-v1-subset-and-positions.md),
  [ADR 14](../adr/0014-pagination-by-domain-position.md))
- 2026-08-11 — **Work core drives but never runs.** `work.claim`, `complete`, `extend`, `release`
  and `abandoned` are built over a store that can lease jobs. Which failures retry, how long the
  backoff is and when work is given up on are core's alone — and mirror work retries
  indefinitely where enrichment is bounded. Core owns the mirror record and answers an item's,
  read fresh. `Agent` gains a **`notemap`** variant, for work core drives on nobody's behalf: an
  attempt that failed is attributable to no person, provider or source. Dispatch — claiming and
  leasing, and the abandoned-work surface — is a **`WorkQueue`** port separate from `PoolStore`;
  enqueue and resolve stay on the transaction handle, where they have to be.
  ([plan](../plans/mirror-writer-first-slice.md))
- 2026-08-12 — **Media works end to end.** An asset is now pool state rather than a port's
  private bookkeeping, and the port beneath it narrowed to a blob store keyed by hash
  ([ADR 16](../adr/0016-the-asset-registry-is-pool-state.md)). `assets.store`, `get`, `open` and
  `verify` are built; capture resolves every reference as a read inside its transaction and
  refuses `unknown-asset`; and `maintenance.sweepUnreferencedAssets` releases assets no item ever
  referenced, after a grace window core is given as configuration, taking each blob that loses its
  last asset with them. A payload's asset reference no longer carries a blob hash — with
  server-minted ids it was the client copying back a number it had just been handed.
  ([plan](../plans/asset-upload-and-images.md))
- 2026-08-12 — **The action log is stated, and readable.** It has been half-built since the
  capture slice; what it guarantees is now written down rather than implied, and it reads newest
  first by default, ordered and paginated by position and narrowable to one subject. A subject
  the pool no longer holds answers an empty page rather than refusing, which is what a purged
  item's entries need. **Ordering is core's**: a store is handed an order it must honour, where
  the SQLite driver used to hold the default. Neither an order nor a page belongs to the feed any
  more, so `FeedOrder` and `FeedPage` become `ReadOrder`, `PageRequest` and `OrderedPage`. Failed
  attempts at work are logged and successful ones are not, and `ActionLogRefusal` is gone —
  clearing a purged item's entries is the case clearing exists for.
  ([plan](../plans/action-log-feed.md))
- 2026-08-14 — **A job says what kind of thing it is about.** `Job.subject` is a tagged union
  rather than an item id, across core's types, the store port and the SQLite driver, which splits
  the column into a kind and an id and re-keys the mirror coalescing index onto the pair. One
  variant ships — `item` — because the shape is what changed here and the second arrives with the
  work that needs it. The abandoned surface carries the subject **and** the item it concerns, so
  "what needs me" stays one read. No behaviour changed.
  ([plan](../plans/job-subject-union.md),
  [ADR 18](../adr/0018-a-jobs-subject-names-what-it-is-about.md))
- 2026-08-14 — **The queue drains.** `items.archive` hides an item and `items.unarchive` returns it
  at its unchanged position, since neither touches content time; `routing.markProcessed` appends a
  routing record naming the user and takes the item out of the queue for good. That last one needs
  none of the delivery machinery — its target is the user, nothing can be unreachable, and the
  record is born delivered — which is what lets both ways out of the queue exist before a line of
  retry logic does. `views.queue` and `views.archived` read oldest first from a content-time
  position and take no order *(reversed 2026-08-17: which end a reader starts from is the
  reader's)*, and **processed is derived** as promised: unarchived, unsuperseded
  and holding no routing record, three anti-joins the store indexes for rather than denormalises
  around. Archiving something already archived is **refused** rather than absorbed, and so is
  unarchiving something that is not: both carry a reason and a time, and a second decision would
  discard one of them. `routing.route` and `routing.destinations` are still unimplemented; delivery
  is the next slice. ([plan](../plans/queue-drains.md),
  [ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md))
- 2026-08-14 — **Delivery is machinery, and no duplicate can come out of it.** `routing.route` mints
  a routing record as a reservation, attempts delivery once inline through a wired destination
  adapter, and resolves it by what the adapter reported: delivered answers a record and a pointer,
  a refusal writes nothing, and a destination that could not be reached leaves the record pending
  and enqueues a **delivery job** — the third job kind, whose subject is the record rather than the
  item. Retries are bounded and keyed on evidence: a lease that expired with nothing reported is
  abandoned rather than retried, so every automatic retry is backed by proof that nothing was
  delivered. Abandoning or cancelling a delivery removes the reservation, which returns the item to
  the queue, and puts a row naming that item on the abandoned-work surface. A record now carries
  its **state** and what the delivery **targeted**, because a delivery carried out later is
  assembled from the record alone; `routing.cancelDelivery` and `routing.deliveryFor` are new, and
  `routing.destinations` answers what each wired adapter declares. No adapter ships: this is proved
  against a destination that fails on command.
  ([plan](../plans/delivery-machinery.md),
  [ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md))
- 2026-08-14 — **Items leave, and land in a folder.** The first destination adapter ships:
  `@notemap/destination-fs` declares `create-file` and `append-to-file` over a configured root,
  renders a delivery as CommonMark under provenance frontmatter, and writes every asset beside the
  note under the name it was uploaded with — closing the copy-or-reference question for this
  destination in favour of a copy. The daemon wires destinations from configuration, and a delivery
  runner beside the mirror runner drives what could not be carried out inline; the two share one
  loop, differing only in what a job is. A missing or unwritable root reports **unreachable**, so a
  decision made against an unmounted drive is kept and retried; a traversal, a file already there
  and a target of the wrong shape report **rejected**, which is abandoned at once. Nothing a
  delivery names can escape the root: the target is resolved against the root's real path and
  compared, and the deepest existing part of it read back through the filesystem, so a symlink out
  is caught as well as an absolute path or a `..`. Nothing is overwritten either — a file is created
  with a hard link, which refuses a name that is taken and still appears whole or not at all.
  *(Amended 2026-08-17: `describe` is asynchronous, as the destination section already required.
  Identity moved onto the adapter as `id`, so a duplicate is still caught at wiring time while
  capabilities are re-read per call; `routing.destinations` answers a report per destination, and
  one that could not describe itself is reported rather than dropped; and `routing.route` refuses
  `unreachable` when it cannot read capabilities to check a target against.)*
  ([plan](../plans/destination-fs.md))
- 2026-08-17 — **An inline attempt that throws is unknown, not failed.** `routing.route` was letting
  an adapter's exception — including the caller's own `AbortSignal` firing — unwind the call with
  nothing written, so material that may have reached the destination left no trace and the person
  re-routing was never warned. It is now refused as `delivery-outcome-unknown` and appended to the
  log under the same code, on the terms the evidence rule already set for a vanished attempt. A host
  that dies mid-attempt inline still leaves nothing, which the routing section now states as a
  limit. ([review](../reviews/delivery-machinery-2026-08-17.md))
- 2026-08-17 — **The rest of the delivery review.** One run of attempts on a destination now reads
  as one run: the inline attempt is the first, `maxAttempts` bounds the total handed over rather
  than the job's share of it, and every failure appends the same kind of entry under one numbering.
  Reporting an outcome a job cannot have produced is refused instead of passing as a success; a
  claim that has to end a vanished delivery refills the page it was asked for; and asking for the
  delivery of a record that already landed answers nothing. A routing record's time is stated to be
  the decision's, a destination's own idea of when it received something is no longer asked for, and
  purge is told to find an item's jobs by the item rather than the subject.
  ([review](../reviews/delivery-machinery-2026-08-17.md))
- 2026-08-17 — **Items can be edited and classified.** `items.tag` and `items.untag` are built over
  the `item_tags` table that was already there: every tag records the agent that added it,
  classifying moves nothing in the queue, and **both halves absorb** a call asking for what the item
  already says — the opposite of archiving's, because a tag's name is the whole of the request where
  an archive carries a reason a second decision would discard. `items.edit` decides between the two
  outcomes core already typed: **amend in place** while the item is the newest in the feed and
  unprocessed, **append a revision** otherwise, carrying the original's capture time, source
  identity and tags with their attribution and leaving archive state and routing records behind. A
  revision ties with its original in the feed and follows it **by the link, never by an id**, which
  the SQLite driver pays for with a chain key beside `created_at` rather than a recursive walk per
  page. `EditRefusal` gained the two asset refusals a capture has, since an edit may change an
  attached file. Enrichment invalidation is stated and deliberately not carried out: nothing runs
  enrichment to invalidate. ([plan](../plans/editing-and-classification.md))
- 2026-08-18 — **A pool that is opened again.** Core through real adapters is now driven across a
  restart: what was captured is there, work that was owed is still owed, and a lease a dead host
  held is taken back only once it has run out. Two concurrent claimants never share a job.
  (plan: `docs/plans/complete-integration-tests.md`)

---

## Outcome

Anything worth keeping enters one pool, where it is never lost and never silently altered. It
can be classified, enriched with advisory suggestions, and delivered onward to wherever it
actually lives — while a complete plain-file copy accumulates on disk, so uninstalling notemap
costs you nothing but the tooling.

The first slice is done when a pool can be captured into, processed and routed, and then
rebuilt from its mirror alone, driven entirely by a CLI and a test suite.

---

## Scope

### In scope

- **The pool** — captures, revisions, head amendment, tags, archive, purge and tombstones.
- **Payload types** — open-ended `(type, content, metadata)`, including payloads with media.
- **Feed and queue** — ordered, paginated reads of both surfaces.
- **Enrichment** — the job model, suggestions and artifacts, accepting and rejecting, per-source
  auto-request policy. Ports defined; **no providers wired**.
- **Routing** — the destination port, the append-only routing log, and a filesystem
  destination including its append-to-an-existing-file form.
- **The mirror** — lossless write-only mirroring, and rebuild of a pool from mirror + assets.
  On-disk format: [mirror.md](mirror.md).
- **The action log** — an append-only trace of every mutation, read newest first and paginated.
  Clearing it is its own operation; retention is undecided.
- **Intake** — the capture envelope, with stable source identity and source-supplied capture
  time.
- **Sync** — the domain obligations only: client-generated ids and idempotent operations.
  The protocol — delta reads, conflict resolution, tombstone retention — is
  [sync.md](sync.md).
- **Hosts** — a CLI and a daemon exposing `/v1`. The HTTP surface is
  [http-v1.md](http-v1.md).

### Out of scope

- Any user interface: the web queue UI, a mobile app, an Obsidian plugin.
- **Authentication and authorization.** Deferred entirely; the pool is the boundary.
- Multi-user and multi-pool operation.
- Transcription, formatting, tagging and embedding **providers** — the port exists, no
  implementation ships.
- Semantic search and the embedding index.
- Destination adapters beyond the filesystem one, including the Obsidian dialect, webhook,
  command and Micropub intake.
- Auto-archive, in any form.
- Processing position — cursor or scroll — which belongs to the frontend.
- A plugin system for third-party adapters.

---

## Behavior

### The pool and the feed

- Every capture entering the pool becomes an **item** and is never lost. Routing, archiving and
  classification are all non-destructive.
- The feed presents every item chronologically by capture time, complete, including archived
  and superseded items. **Which end it starts from is the reader's** (decided 2026-08-06):
  the feed takes an order, newest first by default. The queue does not — oldest first is what
  makes it a queue ([ADR 10](../adr/0010-feed-and-queue-sort-differently.md)).
- **Capture time comes from the source, never from arrival.** A note written offline and synced
  three days later occupies its true chronological position. A file picked up by an import path
  is placed at its recording time, read from file metadata or the source's naming pattern.
- Feed order never changes. Editing, archiving, routing and enrichment do not move an item.
- Items never merge with one another. There is no item-to-item combination anywhere in the
  model.
- Every item carries the identity of the source it came from and that source's own id for it,
  so re-reading a source cannot produce a duplicate.

### Editing

- **A revision is about content, and only content.** Editing the capture's content — its text,
  or an attached file — appends a revision. Classification, archiving, routing and
  accepting a suggestion change an item's state in place and never produce a revision.
- Editing an item **appends a revision**: a new item linked to the one it replaces, carrying
  the original capture time plus the time of the edit.
- **A revision carries the source identity of the capture it revises** (decided 2026-08-06).
  It is a new item but not a new capture: no source produced it, so it mints no identity of its
  own. Source identity is unique per capture, and a revision is exempt — the uniqueness exists
  so that re-reading a source cannot duplicate, which a revision cannot do.
- A revision is a clone with a link: **tags carry over**, keeping their attribution.
  **Routing records do not** — they are the original's history and stay with it. The revision
  therefore starts unprocessed and resurfaces in the queue, whether or not the original was
  routed.
- Nothing that triggers routing carries over either. A proposed destination is a
  **suggestion**, not a tag
  ([ADR 6](../adr/0006-enrichment-splits-into-suggestions-and-artifacts.md)), and pending
  suggestions attach to one item: rules re-propose against the revision's tags.
- A revision of an archived item is **not archived** — editing says the item is alive again.
  The same holds for routing, per the above; archive and routing state both stay behind.
- An item is **superseded** when a later revision points at it. This is derived from the link,
  never stored, and superseded items are excluded from the queue.
- **Ids never order a revision against its original** (decided 2026-08-06). A revision carries
  its original's capture time, so the two tie in the feed, and ids are not guaranteed to sort
  by mint order — see intake. Wherever the tie matters — feed order, finding the head — a
  revision's place comes from the revision link: it follows the item it supersedes. Ties
  between unrelated items may break on any stable key, id included, since no meaning rides on
  them.
- **Editing a superseded item is refused** (decided 2026-08-04). Allowing it would fork the
  revision chain into two revisions of one original, both live in the queue, with nothing to
  say which is current. Edits go to the end of the chain.
- The single exception is **amendment of the head**: the newest item in the feed may be edited
  in place while it is still unprocessed. **Only a capture that becomes the new head seals
  it** — intake placed earlier in the feed by its source time, such as a file import or an
  offline sync, does not. There is no timeout.
- A client may freely amend or discard a capture that core has not yet accepted. Immutability
  begins at the pool. Once a capture has been handed over for delivery it must be treated as
  accepted, even before a response arrives.
- Where a client cannot know whether it still holds the head, its in-place edit is
  re-evaluated on arrival and recorded as a revision if the item is no longer the head.
- **An edit is refused what a capture's payload is refused for** (stated 2026-08-17), less the
  one refusal it cannot raise. Editing may change an attached file as readily as the text, so a
  content that fails its schema, a required slot left empty and a reference to an asset the pool
  does not hold are refused exactly as at capture. A payload type it does not know is not among
  them: the type an edit carries is the item's own, since one that differs is already refused as
  `payload-type-changed`.
- **Both outcomes touch two items, and a revision owes two mirror writes** (stated 2026-08-17).
  The revision is new material; the original is superseded, which takes it out of the queue, so
  its `modified_at` moves and a delta read that missed it would leave a client showing work that
  has gone.
- **An edit records the agent that made it** (decided 2026-08-17), as classification does. Only a
  person edits today, but that is a fact about what exists rather than a rule core enforces.
- Amending or revising an item invalidates the enrichment attached to the old content, which
  becomes eligible to run again. *Nothing runs enrichment yet, so this is a rule with no
  observable effect today; it is carried out by the slice that builds enrichment, not by the one
  that built editing.*

### Classification

- The only axis of classification is **tags**: free text, with namespacing as convention
  (`project/fiction-a`, `kind/quote`) rather than structure.
- There is no item type and no project entity. Payload type is mechanical, derived from what
  arrived, and is not classification.
- A tag name is **trimmed and must carry at least one non-whitespace character**; nothing else is
  asked of it. Core normalises rather than a caller, because absorbing a tag the item already has
  is a comparison against what is stored — normalise anywhere else and `" kind/quote"` writes a
  second tag beside `"kind/quote"`. One that trims to nothing is refused; one a **capture**
  carried is dropped instead, since a whole capture is not lost over a stray tag.
- Every tag records **which agent added it** — a person, or the named provider whose suggestion
  was accepted. **Removing one records an agent too** (decided 2026-08-17): who classified is a
  fact about the pool, and core does not get to assume that only a person ever untags merely
  because only a person does today.
- Classifying an item does not remove it from the queue.
- **A superseded item is refused, both halves** (decided 2026-08-17), carrying the id of the
  revision. Classification goes to the end of the chain as editing does: a revision does not
  inherit a tag that arrives after it was made, so a tag on the item it superseded is attached
  where nobody reads it.
- **Both halves are idempotent** (decided 2026-08-17). Adding a tag an item already carries leaves
  the attribution and time it has; removing one it does not carry changes nothing. Neither absorbed
  call appends an action or owes the mirror a write, because nothing changed. This is the opposite
  call to archiving's, and what separates them is what the caller supplies: an archive carries a
  reason, so a second one either overwrites what the first recorded or discards what the second was
  given. A tag's name is the whole of the request, and `by` is not something the caller chooses over
  again — so the first agent there stands, and a person's tag is not silently reattributed to the
  provider whose suggestion arrives after it.

### Archive and purge

- **Archiving** hides an item from the queue without deleting it. The item stays in the feed and
  remains fully processable from the archive; archiving is a filter, not a terminus.
- Archiving is always an explicit decision, and may carry a reason. **Unarchiving is likewise an
  explicit action** (decided 2026-08-03): an archived item returns to the queue, at its
  unchanged position, since archiving never moved it.
- **The archive excludes nothing** (decided 2026-08-17): every archived item is in it, superseded
  or routed alike. It filters on one axis, which is the one archiving acts on. The queue's
  exclusions say what is not worth working on now; the archive is not a work list but the record
  of what was set aside, and an item dropped from it for having a revision would be reachable from
  the feed alone. So an archived item a revision points at sits in the archive while that revision
  sits in the queue — two items, one of which says which it is, since `supersededBy` is read off
  the item wherever it appears.
- **Purge** is the only destructive operation. It removes the item, its entire revision chain,
  its enrichment, its routing records, its mirror files and its assets — an asset only when no
  remaining item references it, and the blob beneath it only when no remaining asset does.
- **A job's subject may outlive the item it names** (decided 2026-08-11), which closes the open
  question of 2026-08-06. Removing an item's mirror files is work about an item that no longer
  exists, so purge deletes the item's outstanding jobs explicitly and enqueues a mirror-removal
  job carrying the bare id. The alternative — deleting the files outside the transaction — leaves
  a failed unlink with nothing recording that removal is owed and nothing retrying, while purge
  reports success; for the one destructive operation that is the wrong trade
  ([ADR 4](../adr/0004-purge-leaves-a-minimal-tombstone.md)). The store therefore places no
  foreign key on a job's subject, following the action log, which already carries a subject
  without one for the same reason. *Amended 2026-08-13*: a subject now says **what kind of thing**
  it names as well as which one ([ADR 18](../adr/0018-a-jobs-subject-names-what-it-is-about.md)),
  so mirror removal naming a departed item stops being a special note about a column and becomes an
  ordinary consequence of subjects naming things that may be gone.
- **Purge finds an item's jobs by the item each one concerns**, which is not always the thing its
  subject names (stated 2026-08-17). A delivery job's subject is a routing record, so deleting an
  item's outstanding work by subject would walk straight past the deliveries of it — leaving jobs
  pointed at records that were about to cascade away. Every job carries the item it concerns beside
  its subject, resolved when it was enqueued, and that is what purge deletes on.
- **An asset's reference is taken when the capture referencing it commits**, not when its bytes
  are stored (decided 2026-08-04). A client that uploads and then crashes leaves an unreferenced
  asset, which is wasted space, rather than a reference to a capture that never arrived, which
  would keep content alive forever. Unreferenced assets are swept after a grace window long
  enough that "just stored" is never mistaken for "abandoned".
- **Which assets exist is pool state** (decided 2026-08-11,
  [ADR 16](../adr/0016-the-asset-registry-is-pool-state.md)). An asset — its id, filename, media
  type, blob hash and size — is held by the store beside the item references that count it, so
  releasing one moves both counts in a single transaction and the reference is enforced rather
  than merely observed. The port beneath it is a **blob store** keyed by hash, which knows
  nothing about names. Before this, no side held the registry, and the sweep's real subject — an
  asset no item *ever* referenced, because its capture never arrived — could not be named by
  either.
- **The sweep's grace window is configuration core is given**, beside the retry policy, and for
  the same reason: it is an operational knob, not a rule core invents. A sweep with no grace
  takes an asset whose capture is in flight, since "referenced" and "about to be referenced"
  look identical to a sweep running at the wrong instant — `git gc`'s reasoning for
  `gc.pruneExpire`.
- **Sweeping appends one action, storing appends none.** An asset before its capture belongs to
  no item, and the capture that references it is the event worth tracing; a sweep is the
  opposite, and appends a single `assets-released` per run — by agent `notemap`, since nobody
  asked for it — rather than one per asset. A sweep collecting four hundred orphans must not
  bury the log it shares with captures.
- **The sweep reaches assets, and blobs only through them.** `assets.store` writes the bytes
  before the transaction that mints the row, so a crash between the two leaves a blob no asset
  ever named — and the sweep enumerates the `assets` table, so nothing it does will ever find
  one. The same is true of a driver's own debris, such as a temporary file left by a killed
  write. Both are space rather than loss, and both are **deep verify's** to reclaim, not the
  sweep's; until that exists, the only thing that reuses those bytes is an identical upload.
- Purge leaves a record of the identity and time of the deletion, and nothing else, so that
  anything holding a copy learns it is gone. That record is itself removed after a retention
  window.
- **Purge does not clear the action log by default** (decided 2026-08-04). The pool is private
  and local-first, so the log is already the user's own; erasing the trace of what happened is
  a separate wish from erasing the material. Clearing a purged item's log entries, or the whole
  log, is offered as its own operation.
- Purge does not reach material already delivered to a destination. Where routing records
  exist, the user is told specifically what may still exist elsewhere before the purge
  proceeds. **Core does not enforce that warning** (decided 2026-08-03): it exposes an item's
  routing records, and the host or client asks. Core is a primitive API; a confirmation ritual
  is interface policy and belongs where the interface is.
- **A delivery that lands after its item is purged leaves the trace and not the state** (added
  2026-08-13). Delivery happens outside any transaction, so an item can be purged between the
  attempt and the write that records it. The routing record is item state and dies with the item,
  which is what purge already does to routing records; the action is a trace, and the action log
  carries no foreign key to items precisely so it outlives them. So the `routed` entry is appended
  — the only remaining record that bytes left the machine — no record is written, and the call is
  refused as purged.

### The queue

- The queue presents items that are unprocessed, unarchived and not superseded, ordered by last
  touch so that a revised item resurfaces where it will be encountered.
- **Which end the queue starts from is the reader's** (decided 2026-08-17), oldest first by
  default. This reverses "the queue does not take an order" and supersedes that clause of
  [ADR 10](../adr/0010-feed-and-queue-sort-differently.md), on the argument that ADR already made
  for the feed and then declined to follow one surface further: what a client shows first is
  interface policy, and core imposes none. A person clearing a backlog may reasonably want the
  newest captures first, and refusing them buys the domain nothing. What makes it a queue is the
  **key** — last touch — which is unchanged.
- **Last touch means content time**: the revision or amendment time where one exists
  (`content_updated_at`), the capture time otherwise (`created_at`). Classification, routing,
  archiving and enrichment never move an item in the queue.
- A third timestamp, `modified_at`, records the last change of any kind — content or state —
  and exists for sync delta reads only ([sync.md](sync.md)). It never affects ordering.
- An item is **processed** when it has been routed or archived. Being **marked processed by
  hand** — the user carried its content onward themselves — is routing: it appends a routing
  record whose destination is the user, with an optional note of where it went. Passing over
  an item changes nothing and is a skip.
- **It is the decision that processes an item, not the arrival** (added 2026-08-13). A routing
  record exists from the moment a person routes, so an item leaves the queue even when its
  delivery is still pending, and returns to it if that delivery is abandoned
  ([ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)). Otherwise the queue
  would report on whether a destination happened to be reachable rather than on what has been
  decided.
- **Processed is derived, never stored** (added 2026-08-13): archived, or holding at least one
  routing record. This is the treatment `supersededBy` already gets, and for the same reason — the
  routing log is authoritative about deliveries, and a column agreeing with it is a column that can
  one day disagree. The cost is an anti-join per queue page, which the store is expected to index
  for rather than denormalise around.
- **Keyset pagination is sound although the queue reorders under the reader** (added 2026-08-13).
  The feed gets this for free, its order never changing; the queue's does, which is the point.
  Every event that moves an item — a revision, an amendment, a new capture — gives it a content
  time of *now*, which places it ahead of a reader walking oldest-first. Every event that removes
  one — routing, archiving, being superseded — hides it, and a reader who had not reached it was
  never meant to see it. So no event that moves an item can make a page skip a row or repeat one.
- **An item returned to the queue behind a reader is seen on that reader's next pass, not this
  one** (added 2026-08-17). Returning is a third kind of event, neither a move nor a removal: it
  puts an item back at the content time it left with, which may be behind a reader who has already
  paged past that position, and the rest of that reader's walk will not carry it. Unarchiving is
  one such event and an abandoned or cancelled delivery is another. A fresh read always shows it,
  and a queue is a work list rather than a stream: an item that has just come back is not urgent.
- Core holds no position in the queue. Reads are ordered and paginated, continuing from a
  **position** the caller hands back — the sort key of the last row it saw
  ([ADR 14](../adr/0014-pagination-by-domain-position.md)). Where processing has got to is the
  caller's concern, and a position is not it.

### Enrichment

- Enrichment produces **suggestions** — proposals that mean nothing until accepted or rejected —
  and **artifacts**, durable outputs such as a transcript that stand on their own and are never
  accepted or rejected. Correcting an artifact is not an edit of the capture and produces no
  revision.
- Enrichment never mutates a capture. Its output sits beside the item, attributed to the agent
  that produced it.
- **Accepting a suggestion writes real state carrying its attribution.** Rejecting one is
  recorded, because a rejection is the only signal distinguishing a suggester that is wrong from
  one that is ignored.
- Removing an accepted tag deletes it. A later re-suggestion arrives as a new pending
  suggestion rather than silently reappearing.
- Each enrichment declares what it needs. An enrichment runs when its needs are satisfied, and its
  state is always one of: **unavailable** (no provider configured), **not applicable** (not
  requested, or its inputs will never exist), **pending**, **running**, **failed** (will be tried
  again), **abandoned** (will not) or **done**.
  These are distinguishable from outside, so a client can always say whether anything is coming.
- **Retrying is bounded** (decided 2026-08-04). A failing enrichment is retried with backoff up
  to a limit, after which it is **abandoned** and stops being claimed. A worker may also report a
  failure as not worth retrying — a provider rejecting a file that is not audio will reject it
  identically five times — and that abandons it immediately. Without a terminus, an item could
  never answer "is anything still coming?", which is the question the state list exists to
  answer.
- **A failure is visible, not just recorded.** The failing state carries what went wrong and how
  many attempts have been made; the change bumps the item's `modified_at`, so a syncing client
  learns about it without polling every item; and every **failed** attempt is an entry in the
  action log ([ADR 12](../adr/0012-core-keeps-an-append-only-action-log.md)) — a successful one is
  not, per [the action log](#the-action-log) (clarified 2026-08-11). Core additionally exposes
  everything currently abandoned as one readable surface, so a client can show "three things
  need you" without walking the pool. **An abandoned enrichment records when it was abandoned**
  (added 2026-08-08): that surface is a list a person works through, and a list with no order is
  one they cannot resume, so `abandonedAt` is what it is ordered and paginated by
  ([ADR 14](../adr/0014-pagination-by-domain-position.md)).
- **That surface covers work, not only enrichment** (amended 2026-08-11). Mirroring is a job like
  any other and a mirror job that cannot succeed needs the same visibility, so both job kinds
  report an outcome and the surface is one list of abandoned **work**. A client answers "what needs
  me" with one read rather than merging two, and a third job kind later adds no third list.
  *Amended 2026-08-13*: delivery is that third kind, and it adds no list. A row is keyed by its
  job's subject, which is no longer always an item
  ([ADR 18](../adr/0018-a-jobs-subject-names-what-it-is-about.md)) — so a row **also carries the
  item it concerns**, resolved by the store, because a person working this list needs to know which
  capture is stuck and the one-read promise is the whole point of the surface.
- **An outcome the job cannot have produced is refused** (added 2026-08-17), rather than being read
  as a plain success. A pointer reported for a mirror write, or artifacts for a delivery, means a
  host has confused two pieces of work, and the outcome that would be dropped is the one the work
  existed to produce. The lease is left held and the job untouched, so the report can be made again.
- **Mirror work retries differently, and deliberately** (added 2026-08-11). Bounded retry exists
  so an item can answer "is anything still coming?", and for enrichment the answer may honestly
  be no. For mirroring it is always yes: the material exists and is unmirrored, and giving up
  does not change that. A retryable mirror failure — an offline folder, a full disk — therefore
  retries indefinitely with capped backoff, while a non-retryable one — a renderer that throws —
  is abandoned on the first attempt, since it will fail identically forever.
- **An abandoned enrichment can be requested again by hand**, which resets its attempts. Giving
  up is core's decision about automatic work, never a refusal to try when asked.
- **Notemap is its own agent for the work it drives** (added 2026-08-11). Every action carries
  the agent who performed it, and an attempt at a job nobody asked for — a mirror write that
  failed, work given up on — belongs to no person, provider or source. `Agent` therefore has a
  `notemap` variant, used for that and nothing else: a tag, an artifact or a suggestion is always
  somebody's.
- Backoff timing and the attempt limit are **configuration data core is given**, not policy core
  invents, consistent with core taking configuration as data but never sourcing it.
- Whether an enrichment runs automatically or must be requested is policy configured **per intake
  source** — a recording from a voice-memo source may transcribe automatically while an
  arbitrary uploaded file requires an explicit request.
- Enrichment may be re-run at any time and is never destructive: a new artifact appears beside
  the old one, attributed to its own producer.
- An item is fully processable while enrichment is pending, unavailable or failed. Capture never
  waits on enrichment.
- Work in progress survives a crash: an interrupted enrichment becomes eligible again rather than
  being lost or duplicated.

### Routing

- **Routing delivers a copy.** The item stays in the feed; nothing is moved or emptied.
- An item may be routed more than once and to more than one destination. Each delivery appends
  a record of the destination, the time, and a best-effort pointer to where it landed.
- A pointer may become stale. It records where an item once went, not a guarantee of where it
  is.
- **A destination declares its capabilities** (decided 2026-08-04). Each capability names one
  thing that destination can do, the payload types it accepts for it, and a schema for what a
  delivery must target. A delivery names a capability and supplies a target; core refuses one
  the destination has not declared, or a payload type it does not accept, rather than
  approximating.
- **Core holds no list of capabilities.** A fixed set — create, append, place — was tried and
  rejected: it is filesystem-shaped, and a board, a webhook or a Micropub endpoint does not
  decompose into it. Capability names and target shapes belong to the adapter, the way payload
  types already do, so a new kind of destination needs no change in core.
- **Routing records a decision; delivery carries it out** (amended 2026-08-13,
  [ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)). This replaces
  "routing requires the destination to be reachable and may fail; a failed delivery leaves no
  routing record", which was written when the only destination in prospect was a local filesystem.
  Most destinations are remote and unreachable for ordinary reasons, and a decision that evaporates
  because a server was restarting is one the person has to remember to make again.
- A routing record is minted as a **reservation** the moment the decision is made, and core
  attempts delivery **once, inline**. Delivered resolves the reservation and fills in the pointer;
  a destination that refuses removes it and the call is refused; a destination that could not be
  reached leaves it pending and enqueues a **delivery job**. A destination that is up therefore
  answers immediately, and only one that was genuinely absent becomes deferred work.
- **A record's time is when the decision was made**, not when the bytes arrived (stated 2026-08-17).
  The two were the same thing until a delivery could be deferred, and they are now days apart at the
  extreme. The decision is what the record exists to remember, and it is what orders an item's
  records; where a delivery landed is what the pointer is for. A destination's own idea of when it
  received something is not kept, since no reader was found for it that the pointer does not serve.
- **A record remembers what the delivery targeted** (added 2026-08-14), beside the destination and
  the capability. Under the synchronous model the target was consumed by the one attempt; a delivery
  that is carried out later has to be assembled from the record alone, and a reservation that could
  not say what it was pointed at would be a decision nothing could act on.
- **Core imposes no timeout on the inline attempt.** A default is interface policy, and core is a
  primitive API; the caller bounds it with the `AbortSignal` that reaches the adapter. A host that
  passes none waits as long as its destination takes.
- **An inline attempt that neither answers nor refuses is refused as unknown** (added 2026-08-17).
  An adapter that throws, or a caller's signal firing mid-attempt, proves nothing either way —
  aborting stops the waiting, not the destination — so the call is refused as
  `delivery-outcome-unknown`, no routing record is written, and the item stays in the queue it never
  left. Nothing is enqueued, because the same evidence rule that abandons a vanished attempt forbids
  retrying this one. The attempt is appended to the action log under the same code, so a person
  about to route again can find out that material may already have arrived.
- **A host that dies during an inline attempt leaves no trace, and this is a known limit.** The
  deferred path survives it because a reservation and its job are durable before the attempt begins;
  inline there is nothing written yet, and nothing can record a crash after the fact. The item is
  left in the queue, which is the safe direction — what is lost is the warning, not the material.
  Closing it would mean minting the reservation, its job and its lease before the attempt and
  resolving them after, which is a different shape from the one
  [ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md) settled and would want a
  decision of its own.
- **Retry is keyed on evidence, not on failure.** `unreachable` is proof that nothing was
  delivered, so a retry cannot duplicate and the job is retried with backoff. `rejected` is proof
  that the destination was reached and refused, so it is abandoned on the first attempt — the same
  call enrichment makes for a failure reported as not worth retrying. A lease that expired with no
  outcome reported is **no evidence at all**, and is abandoned rather than retried: a delivery is
  not idempotent, the domain cannot tell a retry from a genuine second delivery, and the cost of
  guessing wrong is a duplicate nobody can detect.
- **Delivery retries are bounded**, unlike mirror work. Mirroring retries forever because giving up
  does not change the fact that material is unmirrored. Giving up on a delivery does change
  something: it hands the decision back, so the person can repair their configuration or route
  somewhere else.
- **The inline attempt is the first attempt** (added 2026-08-17), and the bound counts it. What
  `maxAttempts` limits is the number of times a destination is handed one item's material, which for
  something that cannot be repeated safely is the number worth bounding — not how much of that
  happened to be done by a job. So the count a person reads on the abandoned surface is the count
  that was made.
- **Every failed attempt at a delivery appends the same kind of entry**, whether it was the inline
  one or a job's, numbered in one sequence. A person reading an item's history is reading one run of
  attempts on one destination; splitting it by which side of the queue it happened on would be
  recording an implementation detail as though it were a fact about the item. Giving up appends
  `work-abandoned` beside the last of them, which is what every kind of work lands on.
- **An abandoned or cancelled reservation is removed, and the item resurfaces in the queue** at its
  unchanged content time. This is not a second exception to the append-only rule: the routing log
  is append-only, and a reservation is not in it yet. A record joins the log when its delivery
  lands, so a record that is not pending means bytes reached somewhere. Removing one that never
  delivered erases no fact.
- A person may **cancel a pending delivery** before it resolves, by the same path.
- **A failed delivery is nonetheless recorded**, so a destination failing silently and
  repeatedly is visible rather than invisible. The routing log says where an item went; a
  failed attempt is one kind of entry in the action log
  ([ADR 12](../adr/0012-core-keeps-an-append-only-action-log.md)), not a separate log of its
  own. Abandonment reaches the same surface as every other job kind — see
  [enrichment](#enrichment) — and an unknown outcome is distinguished there by its failure code, so
  a host can warn that material may already have arrived before offering to route again. Core does
  not enforce that warning, on the same terms as the warning before purging a routed item.
- **A delivery carries everything durable about the item**, and the adapter reaches back for
  nothing: the payload, the tags with their attribution, the capture and content times, the source,
  the artifacts, and every asset the payload and artifacts reference, resolved and openable as a
  stream. It carries neither prior routing records — where else an item went is another
  destination's business — nor pending suggestions, which are regenerable and meaningless
  undecided.
- **The delivery is not the mirror record**, although the two carry nearly the same material. The
  mirror record's contract is that a pool can be rebuilt from it
  ([ADR 15](../adr/0015-the-mirror-record-is-authoritative-markdown-is-a-rendering.md)); a change
  made to serve rebuild would otherwise ripple into every destination adapter, and it carries
  `modifiedAt`, which no destination can use.
- **Asset bytes reach an adapter as a stream it is handed, never as a store it reaches into.** An
  asset id resolves to a blob only through pool state
  ([ADR 16](../adr/0016-the-asset-registry-is-pool-state.md)), so an adapter given a blob store
  could not resolve a reference and one given the pool store could read everything. Core resolves,
  and the adapter receives each asset with its filename and a lazy opener — so a capability that
  wants no bytes reads none, and a long recording is never buffered.
- **Which assets share a filename within one capture is the adapter's problem**, as destination
  layout is, for the same reason a blob's path is the blob driver's.
- **A destination may reshape an item on its way out, and never reshapes the item** (added
  2026-08-17, [ADR 19](../adr/0019-a-destination-converts-and-the-delivery-records-what-went.md)).
  Templates and format conversion — including a local model rewriting a loose capture into a list
  entry — happen inside the delivery, where the dialect already lives. Amending the capture into
  the destination's shape first is not an option: one item may go to three destinations in three
  dialects, so the last to route would win and the original would be gone.
- **Conversion needs no state of its own.** A delivery mid-conversion is a pending reservation, the
  job holds its lease, and a slow one extends it. A host that dies mid-conversion lands on the
  unknown-outcome rule and is abandoned rather than retried, exactly as any other delivery is.
- **A delivery may report what it delivered**, and the routing record names those bytes, so the
  pool can answer what it sent and not only where. It is optional — a destination posting to an API
  may have nothing meaningful to keep — and it belongs to the delivery rather than the item,
  because two destinations with two templates produce two outputs from one item. Routing records
  are mirrored, so a rebuild restores it.
- **A destination is asked what it can do, and may need to go and look** (added 2026-08-17).
  Describing a destination is asynchronous: a vault whose templates are files, a board whose
  columns come from an API, or another pool cannot answer from a constant fixed at wiring time. A
  destination that cannot describe itself is reported as such rather than omitted silently, since a
  missing destination and an unreachable one are different answers to a person looking for one.
- **A capability's accepted payload types may be a wildcard**, for a destination whose fallback
  genuinely handles anything. It is a promise rather than a shrug: claiming it trades away the
  refusal core would otherwise make up front, so what would have been an immediate
  `payload-type-unsupported` becomes a delivery that is attempted and rejected.
- Rules may propose a destination from an item's tags, but **a rule never delivers on its own**.
  Delivery is always a decision. Deferring the *execution* of a decision a person has made does not
  weaken this: no rule decided anything.

### The mirror

- Every capture is written to disk and never read back during normal operation. **Every mutation
  that changes mirrored material enqueues a mirror job for that item** (amended 2026-08-11), in
  the same atomic unit as the mutation itself: a change committed with nothing recording that its
  mirror is owed would never be written, and nothing would notice. This originally read "each
  capture enqueues exactly one mirror job" (decided 2026-08-06), which covered only the first of
  an item's writes — tags, archive state, artifacts and routing records all arrive later and are
  all mirrored.
- **Mirror jobs coalesce against pending jobs only** (decided 2026-08-11, amended the same day).
  An abandoned job is not pending: it records a failure for a person, not a write still to come,
  so it holds no slot and a later mutation enqueues afresh. A mutation arriving
  while a pending, unleased job exists adds nothing, because that job will write current state.
  A mutation arriving while the item's only mirror job is *leased* enqueues a new one: the host
  holding the lease has already read the state it is writing, and absorbing the mutation into it
  would lose the mutation with nothing recording the loss. A mirror job is claimable only when
  its item has no leased mirror job, so at most one write per item is in flight and two writers
  never race on one file.
- The mirror is **lossless**: a pool can be rebuilt from the mirror and the assets alone. This
  is the only circumstance in which the mirror is read.
- The mirror carries captures, classification, **artifacts and their corrections** — the
  original transcript and the corrected one both — and routing records. It does not carry
  pending suggestions, which are regenerable by definition.
- **The record is core's; the bytes are the driver's** (decided 2026-08-11,
  [ADR 15](../adr/0015-the-mirror-record-is-authoritative-markdown-is-a-rendering.md)). Core
  defines one item's mirror record, its canonical serialisation and its parse, so losslessness is
  proved once as a property test with no filesystem rather than by each driver. The plain-text
  file beside it is a **rendering that nothing ever parses**, produced by a host-wired renderer —
  which is what lets it be readable for payload types whose content could never round-trip
  through markdown.
- **Rebuild is its own entry point, not an operation on a live pool** (decided 2026-08-11). It
  takes the mirror reader explicitly and populates an empty pool, so a pool wired for capture
  holds nothing that can read the mirror. It writes items directly, enqueuing no mirror jobs and
  appending no actions, and derives enrichment state from mirrored artifacts so that nothing
  already enriched is enriched again. **A rebuilt pool mints a new identity**, since its
  `modified_at` sequence restarts and every cached delta cursor is therefore void rather than
  merely stale; what a client does about that is [sync.md](sync.md)'s.
- **The mirror may be disabled by wiring a pool without a mirror writer** (decided 2026-08-11),
  in which case nothing enqueues mirror jobs. Re-enabling is one verify/repair run. The cost is
  that the database becomes the only copy and ADR 9's drop-and-rebuild migration path stops
  applying to that pool.
- The on-disk layout and file formats are specified in [mirror.md](mirror.md).
- **Media is stored once, and named twice**
  ([ADR 13](../adr/0013-assets-are-named-references-to-content-addressed-blobs.md)). An **asset**
  keeps the filename exactly as uploaded; the **blob** it points at holds the bytes, is addressed
  by its SHA-256, and is shared by every asset with the same content. The same bytes uploaded
  under two names give two assets and one blob, and each download returns the name it was given.
  Both the pool and the mirror reference the same blob; the mirror records the filename beside
  it, since the blob itself is named for a machine.
- **A payload's asset reference names a slot and an asset, and nothing else** (decided
  2026-08-11). It once carried the blob hash as well, so that a swapped asset would be caught at
  capture. With server-minted asset ids that was the client copying back a number the server
  handed it a moment earlier, and every failure it claimed to catch resolves elsewhere: a swept
  asset is `unknown-asset`, a rebuilt pool restores asset identities so the id still resolves,
  and a corrupted blob is invisible to it, because the row and the reference agree — both name
  the same hash, and the disk is what is wrong. Integrity belongs where the two numbers have a
  wire between them, which is the upload ([http-v1.md](http-v1.md)).
- A blob's name is its expected content hash, so a change made outside notemap is detected and
  reported rather than silently absorbed.
- Reading media is the single exception to never reading the mirror's storage area. Text and
  state are never read back.
- An external tool editing or deleting mirror text cannot corrupt the pool.

### The action log

- **Every action that changes state appends an entry**, in the same atomic unit as the change it
  describes ([ADR 12](../adr/0012-core-keeps-an-append-only-action-log.md)). An entry carries what
  happened, the agent who did it, the time core applied it, the subject where the action had one,
  and the facts of what changed.
- **The kinds are not listed here.** A kind arrives with the mutation that appends it, so the list
  is core's `ActionKind` and the code is where it is documented; a list kept in two places is one
  that disagrees with itself.
- **An entry's detail carries facts, never a sentence** — the rule a refusal follows, for the
  reason a refusal follows it: core has no locale and no interface, and rendering is the host's.
- **Archiving and routing are attributed to an anonymous person** (added 2026-08-13), rather than
  taking an agent the way tagging does. A tag needs one because accepting a suggestion writes a tag
  attributed to the provider that suggested it; nothing else can archive or route, since both are
  always an explicit decision. A signature that cannot express an attribution the model forbids is
  worth more than one that is uniform, and with no authentication an anonymous person is the whole
  of what a host could supply anyway.
- **A delivery's entries are subject to the item**, not to the routing record the job names. Core
  resolves the one to the other, so reading an item's log still finds every attempt to deliver it.
- **The log records arrival.** Capture time comes from the source, so the entry is the only record
  of when the pool actually received something.
- **Failed attempts at work are logged; successful ones are not** (clarified 2026-08-11). Work
  that produces material appears in the log as that material — an artifact added, a delivery
  routed — and an entry beside it would record one event twice. A mirror write is the only success
  with no product, and the file it wrote is its trace.
- The log is read **newest first by default**, ordered and paginated by position
  ([ADR 14](../adr/0014-pagination-by-domain-position.md)), and may be narrowed to one subject.
  Which end a reader starts from is the reader's, as it is for the feed.
- **A subject the pool does not hold answers an empty page, not a refusal.** The log outlives the
  material it describes, so a purged item's entries are exactly what someone asks for, and reads
  do not refuse.
- **Clearing the log is its own operation** — one item's entries, or the log entire — and nothing
  else clears it, purge included. Clearing appends an entry recording that it happened, so a log
  that has been emptied says so rather than lying by omission.
- **State is never derived from the log.** It is a record read by a person tracing something;
  nothing is replayed or rebuilt from it, and nothing in the pool becomes unanswerable if it is
  cleared.
- The log is operational state rather than the user's material, so it is not mirrored
  ([mirror.md](mirror.md)) and a pool rebuilt from its mirror has no history.

### Intake and sync

- Every intake path produces the same capture envelope regardless of origin, carrying a typed
  payload, the source, the source's own identifier, the capture time, and any tags the source
  already knows about. **Source-supplied tags are attributed to that source** (decided
  2026-08-04), so importing from an already-classified system does not lose its classification.
- **A source needs no declaration** (decided 2026-08-08). Any source id is accepted at capture.
  Declaring a source in configuration attaches **policy** to it — today only whether its
  captures auto-request an enrichment — and nothing else; an undeclared source captures
  normally and carries empty policy. Registration gated nothing an open client could not
  spell, and refusing a capture for a paperwork reason is the wrong trade for a tool whose
  first job is that capture always works. The accepted cost: a typo'd source id mints a
  parallel identity rather than being caught, which shows up in attribution.
- **Every capture is identified twice: by its own id, and by its source's id for it**
  (decided 2026-08-04). Both are unique, and they answer different questions. The capture id
  makes replay harmless for a client that captured while unreachable. The source identity makes
  re-reading harmless for a source that is read repeatedly — a watched folder, a polled inbox.
- **A source that cannot remember an id does not supply one.** A client that captures offline
  mints its own id and replays it; a passive source has no capture moment at which to mint one
  and no memory across a restart, so it supplies only its source identity and core mints the
  id. Ids core mints are time-ordered UUIDv7s, and a client is encouraged to mint the same —
  but any unique id is accepted, not validated for shape (clarified 2026-08-06), so nothing
  in the model may depend on ids sorting by time.
- Submitting the same capture twice has no additional effect, whichever identity matches, and
  the caller is told which one did. **Resubmitting under an identity that already exists, with
  content that differs, is refused** — for either identity (clarified 2026-08-04). An external
  change must not rewrite pool history, and a client whose replay disagrees with what the pool
  holds must be told rather than silently ignored.
- Core's obligations to offline clients are idempotent operations and client-generated ids.
  The sync protocol — outbox replay, conflict resolution, delta reads, tombstones — is
  specified in [sync.md](sync.md).
- Intake must not accept a partially written file. A file source waits for the file to be
  complete before it becomes a capture.

---

## Constraints

- **TypeScript on Node, with pnpm workspaces** (decided 2026-08-02): core, adapters and each
  host are separate packages, so the dependency direction of
  [ADR 8](../adr/0008-adapters-are-in-process-and-wired-by-the-host.md) is enforced by tooling.
  **Core is idiomatic TypeScript.** A Rust port is not foreclosed, but it
  is not paid for in advance and does not influence how the domain layer is written
  (amended 2026-08-03, [ADR 5](../adr/0005-typescript-now-rust-later.md)). Explicit state
  modelling and narrow ports stay, on their own merits: the spec's guarantees are stated as
  states, and a narrow port is what a test can substitute.
- **Core takes no framework or runtime dependency.** No HTTP, no timers, no configuration
  sourcing, no filesystem or network access. Storage, mirroring, blob storage, the clock,
  providers and destinations are all ports. *Amended 2026-08-11*: the media port is a **blob
  store** — `put`, `open`, `verify`, `delete` and the path a blob is at — keyed by hash and
  holding no names, because which assets exist is pool state
  ([ADR 16](../adr/0016-the-asset-registry-is-pool-state.md)). *Clarified 2026-08-04*: this is a rule about
  **reaching the outside world**, not a dependency count. Pure computational libraries — a
  schema validator, an id generator — are fine, and core carries `@types/node` so that runtime
  types such as `AbortSignal` are available. **`fs` is therefore importable and is avoided by
  convention, not by tooling.** The seam is a design rule that review defends; it was never
  worth a hand-rolled type to keep a compiler error.
- **Core takes configuration as data but never sources it.** The host reads config and secrets;
  core evaluates rules.
- **Core is a primitive API** (decided 2026-08-03). It exposes operations and the facts needed
  to decide on them; it does not impose interface policy. Confirmation prompts, warnings,
  batching and processing rituals belong to the host or client.
- **Every operation that changes state returns a result that may be a refusal** (decided
  2026-08-04), whether or not that particular operation has anything to refuse today. Uniformity
  is the point: a caller never has to remember which operations can say no, and an operation
  that gains a refusal later does not change shape. Reads are exempt — absence is absence.
- **A refusal carries facts, never a sentence.** Core has no locale and no interface, so it
  reports what was wrong in structured terms — the payload type and the list that was accepted,
  the id that was not found — and the host renders that into a message or a status code.
- **A timestamp is an instant, not a spelling** (decided 2026-08-06). `Timestamp` is RFC 3339
  UTC, which admits more than one spelling of one instant, and a store is free to hand a
  timestamp back in its own canonical form. Timestamp equality is therefore instant equality —
  a replay is compared by what time it names, never by the string that names it — and nothing
  compares timestamps as text across the store boundary.
- **Core is instantiated per pool, never global.** No module-level state, no ambient
  configuration, no singleton connection.
- **A pool is disposed explicitly, by the host that built it** (decided 2026-08-06). Closing the
  pool releases every port holding something open, and **only those ports declare `close()`**
  (amended 2026-08-06): a clock and an id generator have nothing to release, and a method that
  does nothing on most implementations is one a host learns to ignore. Which ports hold
  something open is core's to know — the host wires the ports and closes the pool, and closes
  nothing else itself.
- **The host wires adapters.** Core imports no adapter. Calls are in-process; there is no IPC.
- Repository layout separates the domain, the adapters and the hosts.
- **Core is storage-agnostic** (amended 2026-08-03,
  [ADR 1](../adr/0001-pool-is-a-database.md)). It states what it requires of a store —
  all-or-nothing application of a transaction core opens, ordered paginated reads asked for in
  domain terms, unique client-generated capture ids, monotonic `modified_at`,
  an asset registry whose references are counted and enforced, work whose subject may name a
  purged item — and does not know which store answers. *Amended
  2026-08-08*: **that includes the continuation.** A paginated read is continued from a
  **position** — the sort-key fields of the last row handed out, in domain terms — rather than
  from an opaque cursor the store minted, and `PageCursor` is gone
  ([ADR 14](../adr/0014-pagination-by-domain-position.md)). The one exception is sync's delta
  cursor, which stays opaque deliberately: it names a store-internal sequence, which is exactly
  what should not be stated in domain terms. SQLite is the
  default driver and the one that ships; another may be wanted for a platform or a hosting
  arrangement that cannot use it. *Amended 2026-08-06*: core holds a transaction handle and
  reads and writes inside it, so preconditions are ordinary reads rather than assertions
  carried on a command. **Core still performs no I/O inside a transaction** — the store holds a
  write lock for its duration — but that is now a convention review defends rather than a
  structural impossibility, the same call already made for `fs`.
- **Dispatch is a port of its own** (decided 2026-08-11). `WorkQueue` — claiming a job, extending
  and releasing a lease, and the abandoned-work surface — is separate from `PoolStore`, because
  none of it touches item state. **Enqueue and resolve are not**, and cannot be: they live on the
  transaction handle because a mutation that committed with nothing recording the work it owes is
  exactly what the mirror's guarantee forbids, and there is no atomic write across two stores. A
  driver may implement both ports as one object, and the SQLite one does. The split names which
  half would have to move to run the queue elsewhere — it is not a claim that anything has.
- **A pool lives on a local filesystem, never on a network share.** Concurrent hosts are made
  safe by leasing work, not by forbidding it. This is a limit of the SQLite driver, documented
  with it, rather than a requirement core places on storage.
- The HTTP surface is versioned from the first commit. `/v1` may take breaking changes until the
  first pool exists that would be upsetting to lose; from then on breaking changes mean a new
  version and a changelog. The surface itself is specified in [http-v1.md](http-v1.md).
- **No authentication for now** (decided 2026-08-02). The daemon binds to localhost or a
  trusted network; the pool is the boundary.
- Everything that leaves the pool carries identity and provenance, per
  [standards.md](../standards.md). Local-only is the default for every provider; anything that
  sends content off-box is opt-in and named on the item.

---

## Prior decisions

Recorded in full under [docs/adr/](../adr/). In brief:

- **[The pool is a database](../adr/0001-pool-is-a-database.md)** — file-backed stores make
  external edits expensive, and the cost falls on reading files back, not writing them. A
  lossless write-only mirror buys ownership without reconciliation. *Amended 2026-08-03*:
  SQLite is the first driver, not the decision; core is storage-agnostic and states its
  requirements, including all-or-nothing application per domain operation. *Amended
  2026-08-06*: core holds a transaction handle; preconditions are gone.
- **[Core is a host-agnostic library](../adr/0002-core-is-a-host-agnostic-library.md)** — the
  daemon is one host, not the architecture. The seam is nearly free now and expensive later.
- **[Clients hold an outbox; pools do not replicate](../adr/0003-clients-hold-an-outbox-pools-do-not-replicate.md)**
  — the real axis is reachability, not connectivity. Immutable id-addressed captures make
  offline sync need no merge.
- **[Purge leaves a minimal tombstone](../adr/0004-purge-leaves-a-minimal-tombstone.md)** — a
  delete that silently doesn't is the worst property a delete can have.
- **[TypeScript now, Rust later](../adr/0005-typescript-now-rust-later.md)** — iteration cost
  dominates while the model churns; Rust would exclude only JS hosts, and only as owners.
  *Amended 2026-08-03*: the portability rules are dropped and core is written as idiomatic
  TypeScript.
- **[Suggestions and artifacts](../adr/0006-enrichment-splits-into-suggestions-and-artifacts.md)**
  — only one of the two awaits a decision, and accepting must not discard provenance.
- **[Enrichments declare their needs](../adr/0007-enrichment-steps-declare-their-needs.md)** — one
  mechanism covers unconfigured providers, opt-in enrichments and unmet inputs, and keeps item status
  answerable.
- **[Adapters are in-process, wired by the host](../adr/0008-adapters-are-in-process-and-wired-by-the-host.md)**
  — direct calls, but the dependency points inward so core stays portable.
- **[Versioned API, mutable until the first real pool](../adr/0009-versioned-api-mutable-until-first-real-pool.md)**
  — the freeze is triggered by a checkable event, not by a feeling.
- **[Feed and queue sort differently](../adr/0010-feed-and-queue-sort-differently.md)** — each
  surface gets the order its job requires.
- **[In-place amendment of the head](../adr/0011-in-place-amendment-of-the-head.md)** — starting
  a new thought ends the previous one; no timer.
- **[An append-only action log](../adr/0012-core-keeps-an-append-only-action-log.md)** — every
  mutation is recorded for tracing; state stays authoritative and nothing is ever derived from
  the log.
- **[Assets name, blobs store](../adr/0013-assets-are-named-references-to-content-addressed-blobs.md)**
  — a filename is user data and must survive a round trip, so the human name and the
  deduplicated content live at different layers. Supersedes ADR 1's asset addressing.
- **[The asset registry is pool state](../adr/0016-the-asset-registry-is-pool-state.md)** — with
  the registry split across a port and the store, the sweep's subject was nameable by neither and
  a release moved two counts that could not be written together. The rows move into the pool and
  the port narrows to bytes. ADR 13's model is untouched; only the boundary moves.
- **[Pagination by domain position](../adr/0014-pagination-by-domain-position.md)** — an opaque
  cursor bought nothing a store's sort key does not already make public, and offsets drop rows
  in a domain where inserts land behind the reader. Supersedes ADR 10's cursor clause.
  *Amended 2026-08-11*: the abandoned surface covers work of every job kind, not enrichment
  alone.
- **[The mirror record is authoritative; the markdown is a
  rendering](../adr/0015-the-mirror-record-is-authoritative-markdown-is-a-rendering.md)** — a
  payload's content is open-ended JSON, so markdown cannot carry losslessness for most payload
  types. The files divide by audience instead, and nothing ever parses the readable one.
  Supersedes ADR 1's capture-`.md` + state-`.json` split.
- **[Delivery is asynchronous, and retried only on
  evidence](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)** — most destinations
  are remote and unreachable for ordinary reasons, and a decision that evaporates because a server
  was restarting is one the person must make again. One inline attempt keeps interactive feedback;
  only a destination genuinely not reached becomes a job. Delivery is not idempotent, so an
  automatic retry needs proof that nothing was delivered.
- **[A job's subject names what it is
  about](../adr/0018-a-jobs-subject-names-what-it-is-about.md)** — an optional field per job kind
  is a shape that rots, each with its own paired constraint and no way to say which combinations
  are real. Closes the "must a job be about an item?" question and unblocks the asset sweep.
- **[A destination converts, and the delivery records what
  went](../adr/0019-a-destination-converts-and-the-delivery-records-what-went.md)** — one item goes
  to many destinations in many dialects, so amending the capture into any one of them is a dead
  end. The reshaping belongs to the delivery, which is already asynchronous and leased, and the
  bytes that landed are recorded so provenance covers *what* and not only *where*. Not built.

---

## Open questions

- [ ] 2026-08-02 — The routing-rule table: how rules are expressed, how fan-out to several
      destinations is presented, and whether a rule may ever be trusted to fire unattended.
- [ ] 2026-08-02 — Whether removing an accepted tag should suppress that suggestion permanently,
      or only until the next revision.
- [ ] 2026-08-02 — Auto-archive: whether it is wanted at all, and after how long.
      `action-plan.md` lists this as a question the Obsidian trial should answer.
- [ ] 2026-08-02 — Where transcript correction happens: delegated to a provider's own interface,
      or a minimal editor in notemap.
- [ ] 2026-08-02 — Whether routing copies an asset to the destination or leaves a reference, which
      probably differs per destination. *Half closed 2026-08-13*: the filesystem destination
      **copies**, because a reference into notemap's blob layout breaks the moment notemap moves,
      and a vault has to keep working without it. The mechanism is settled generally — an adapter
      is handed each asset with its filename and a lazy stream — so what remains is whether any
      destination ever wants a reference instead.
- [ ] 2026-08-02 — Multiple pools per user, and multi-user operation. Nothing decided forecloses
      either; neither is designed.
- [x] 2026-08-11 — Whether a unit of work is ever about something other than *an item*.
      **Closed 2026-08-13**: it is. A delivery job is about a delivery, and a job's subject now says
      what kind of thing it names ([ADR 18](../adr/0018-a-jobs-subject-names-what-it-is-about.md)).
      The asset sweep, which prompted the question, is still not modelled as a job — but nothing in
      the model stops it now, and whether a pool-wide unit of work wants a subject variant of its
      own or no subject at all is the case that will say.
- [ ] 2026-08-13 — What a destination names a file, when the domain has no title. A capture is an
      open-JSON payload and nothing in it is a title, so the filesystem destination derives from
      the first line of text and falls back to the item id. Serviceable for text, ugly for
      everything else. A title is plausibly an artifact — an enrichment could produce one — which
      would answer this and several routing-template questions in `todo.md` at once.
- [ ] 2026-08-13 — Whether a capability may declare itself idempotent, and so opt into retrying a
      delivery whose outcome is unknown. ADR 17 abandons those deliberately, being conservative for
      adapters that can promise nothing. A content-addressed store or an API taking an idempotency
      key could promise more.
- [ ] 2026-08-11 — Action log retention: whether entries expire at all, and whether expiry is per
      kind. [ADR 12](../adr/0012-core-keeps-an-append-only-action-log.md) left it to be decided
      when the log's size becomes noticeable in practice. Nothing prunes it today, and the only
      way to shrink it is the clear operation, which is a decision rather than a policy.
- [ ] 2026-08-08 — How a revision is ordered against its original in the feed, in a store. This
      spec says a revision carries its original's capture time, so the two tie, and that the tie
      is broken by the revision link: the revision follows the item it supersedes. The SQLite
      driver breaks it on `(created_at, id)`, which agrees with the link **only when ids sort by
      mint order** — true for the UUIDv7s core mints, and not guaranteed for the arbitrary ids a
      client is allowed to supply. A client minting `aaa` for a revision of `zzz` would see the
      revision before its original. The candidates are ordering on the chain explicitly, which
      is a recursive query on every feed page, or narrowing what an id may be, which contradicts
      "any unique id is accepted". Not urgent — nothing revises yet — but the pagination
      position is `(createdAt, id)`, so whatever this becomes, it has to stay a total order the
      position can name.

---

## Acceptance criteria

- A capture submitted twice with the same client-generated id produces exactly one item.
- A capture whose source reports a capture time three days old appears at its chronological
  position in the feed, not at the position its arrival would give it.
- Editing a non-head item leaves the original readable in the feed and excludes it from the
  queue; the revision appears in the queue.
- Editing the head while unprocessed changes it in place and creates no revision. Capturing a
  new head first causes the same edit to produce a revision instead; an intake whose capture
  time places it earlier in the feed seals nothing.
- An item that has been routed no longer appears in the queue and still appears in the feed,
  with a record of where it went.
- An item routed to two destinations carries two routing records.
- Routing to a reachable destination answers a delivered record with a pointer, and enqueues no
  job.
- Routing to an unreachable destination answers a pending record, leaves the item out of the queue,
  and enqueues a delivery job that succeeds once the destination returns.
- A destination that refuses a delivery abandons it on the first attempt, leaves no routing record,
  and leaves the item in the queue.
- A delivery abandoned after exhausting its retries removes its routing record, returns the item to
  the queue at its original position, and appears on the abandoned-work surface naming that item.
- A delivery whose lease expired with no outcome reported is abandoned rather than retried, and is
  distinguishable on that surface from one the destination refused.
- Cancelling a pending delivery removes its record and returns the item to the queue.
- An item purged while a delivery of it is in flight has the delivery's `routed` entry in its
  action log and no routing record, and the call is refused as purged.
- An adapter receives every asset the payload and artifacts reference, under the filename it was
  uploaded with, and can read the bytes without reaching any store.
- A capability that accepts no asset-bearing payload type never causes an asset stream to be
  opened.
- An archived item does not appear in the queue, does appear in the archive, and can still be
  routed from there.
- An item marked processed by hand leaves the queue, stays in the feed unarchived, and carries
  a routing record naming the user as destination.
- Editing a routed item produces a revision that carries the original's tags with their
  attribution, carries none of its routing records, and appears in the queue; the original
  keeps its routing records.
- Accepting a tag on an item does not change its position in the queue.
- Purging an item removes every revision of it, its assets where unreferenced, and its mirror
  files; a client that had cached it learns it is gone on its next sync.
- Purging an item that has been routed exposes, before proceeding, the specific destinations it
  reached. The warning itself is the host's; core's obligation is that the records are
  available to ask for.
- An archived item can be unarchived, and returns to the queue at its original position.
- The queue read newest first answers the same items as oldest first, in the opposite order, and a
  position taken from one continues the other from the same place.
- A pool rebuilt from its mirror and assets is equivalent to the original: same items, same
  order, same classification, same artifacts and corrections, same routing records.
- Deleting or editing a mirror text file leaves the pool unaffected.
- Editing a blob outside notemap is reported as a change rather than passing unnoticed.
- The same bytes uploaded under two filenames produce two assets and one blob, and downloading
  either returns the filename it was uploaded with.
- An upload whose capture never arrives leaves an unreferenced asset that is eventually swept,
  and never a reference that outlives the item.
- Purging one of two items that share an asset leaves the asset and its blob intact.
- With no providers configured, every enrichment reports unavailable, and items remain
  fully classifiable, archivable and routable.
- An enrichment interrupted mid-run becomes eligible again and does not produce a duplicate
  artifact.
- An enrichment that keeps failing is eventually abandoned rather than retried forever, and the
  item then reports that nothing further is coming.
- A failure reported as not worth retrying is abandoned on the first attempt.
- An abandoned enrichment appears on the surface listing what needs attention, carries what went
  wrong, and runs again when requested by hand.
- Accepting a suggested tag produces a tag attributed to the provider that suggested it;
  removing that tag and re-running enrichment produces a new pending suggestion rather than
  restoring the tag.
- The entry recording a capture is timed by its arrival, not by the capture time its source
  reported, and is the only place that arrival appears.
- An attempt at work that failed appears in the log; one that succeeded does not.
- The log can be read for an item that has been purged, and answers that item's entries rather
  than refusing.
- A position taken from a newest-first read of the log continues an oldest-first read from the
  same place.
- A destination refuses a payload type it does not declare support for, rather than delivering
  an approximation, and refuses a capability it never declared at all.
- A file that is still being written is not ingested until it is complete.
- Core can be instantiated twice over two different pools in one process without interference.
