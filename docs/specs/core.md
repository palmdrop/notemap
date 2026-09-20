# Spec: Core

**Status**: Draft
**Last updated**: 2026-09-15
**Shipped**:

- 2026-09-15 — **A manual mark is cancellable, the summary names its templates, and a note confesses less.** `cancelDelivery`
  takes back a record naming the user whatever its state; the routing summary names the distinct
  templates whose records stand; the markdown kinds no longer confess tags their settings left out.
  See [shell-minor-changes](../plans/shell-minor-changes.md).
- 2026-09-13 — **The action log is read through one query.** `actions.read` takes a subject, a set
  of kinds, or both, where `forItem` and `all` stood; `ACTION_KINDS` is the list a host validates
  against.
- 2026-09-10 — **A delivery may carry its own content, and the reservation holds it.** A routing
  request may supply the words one delivery carries in place of the capture's; core checks them
  against the item's payload type exactly as it checks a capture, substitutes them into the payload
  it hands the adapter, and the routing record keeps them beside the arguments, so a deferred
  delivery replays the words it was decided with. The item is untouched, so one capture reaches two
  destinations in two wordings. ([routing-edits](../plans/routing-edits.md),
  [ADR 45](../adr/0045-a-delivery-may-carry-its-own-content.md))

- 2026-09-09 — **A destination can be asked what one value it holds is called.**
  `destinations.naming` joins `candidates` on the pool API and on the `Destinations` port, optional
  on a kind adapter: it names a capability, a field and the value the field holds, and answers the
  one entry that value names — or nothing, where the destination has nothing by that name, which is
  an answer rather than a failure. Separate from `candidates` because a browse is capped and this
  is not: the value a surface already holds is exactly the one a truncated page may never mention.
  Failures are `candidates`' own, and a kind whose values are their own names has no `naming` at
  all. ([ADR 44](../adr/0044-naming-a-value-is-a-second-question-a-destination-answers.md))

- 2026-09-09 — **Configuration holds what an install is.** The `[[payloadTypes]]`, `[[sources]]`
  and `[[enrichments]]` blocks leave `config.toml`. The payload types become a constant core
  exports and a host hands back, since a second one is a code change everywhere else; the source
  registry and the enrichment list are removed unread, nothing having ever consulted either.
  `PoolConfig` loses `sources` and `enrichments` with them, and a leftover block is ignored with
  the warning any unknown key gets.
  ([ADR 43](../adr/0043-config-holds-what-an-install-is.md))

- 2026-09-08 — **A board is a destination, and a capability stops being file-shaped.** Capability
  names lose the word *file* — `create`, `append`, `create-or-append` — so a vault's note and a
  board's block are one capability rather than two, and `create` stops promising it refuses a name
  already taken: that becomes each kind's own promise, as does whether a retry can duplicate. The
  markdown kinds gain a **frontmatter** switch, a setting on the destination and an argument on one
  capture, so a delivered file is no longer guaranteed to carry its own provenance. A third kind
  ships, `arena`, whose destination *is* an account and whose channel is an argument, and it is the
  first to answer a followable `url` on a routing record. What an account must carry becomes the
  kind's own, checked against that kind's schema when the daemon starts.
  A candidate may answer under **two names** — what a person reads and what survives a rename —
  and a field may say it holds only something the destination already has.
  ([plan](../plans/arena-destination.md),
  [ADR 40](../adr/0040-a-destination-kind-declares-the-shape-of-its-own-account.md),
  [ADR 41](../adr/0041-a-delivery-that-cannot-be-confirmed-may-duplicate.md),
  [ADR 42](../adr/0042-a-candidate-carries-both-its-readable-name-and-its-lasting-one.md))

- 2026-09-07 — **One tag files it where it goes.** A **routing template** is a saved routing
  decision — a destination, a capability, arguments held as patterns, how its folder is treated —
  and a **trigger tag** under the reserved `route/` namespace applies it. Applying one *is* the
  decision, which rewrites this document's *"a rule never delivers on its own"*. Core expands the
  patterns when the decision is made, from a closed vocabulary, so a capture carries the UTC
  offset it was made at and `{{captured_at}}` means the right day. A folder is `create`, `require`
  or `establish`, checked by the adapter at delivery. A fired template **never attempts inline**:
  the delivery is an ordinary job due a configured window later, so the cancel offered while it
  waits is real against a mounted vault — and the tag and the reservation commit together, so
  *tagged but not reserved* cannot exist. A reservation a tag made and that never delivered gives
  that tag back.
  ([plan](../plans/routing-templates.md),
  [ADR 34](../adr/0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md),
  [35](../adr/0035-a-templates-arguments-are-patterns-expanded-when-the-decision-is-made.md),
  [36](../adr/0036-a-folder-is-created-required-or-established-once.md),
  [37](../adr/0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md))

- 2026-09-07 — **One payload type, an item that answers its assets, and the sources enumerated.**
  `text` and `image` collapse into **`note`** — optional prose, any number of attachments — because
  a type derived from what a capture happens to hold cannot survive an edit, which may not change
  it ([ADR 38](../adr/0038-text-and-image-collapse-into-one-payload-type.md)). `requiredSlots` and
  the `missing-asset-slot` refusal go with it, `image` having been their only user. Every read that
  answers an `Item` now carries its payload's assets resolved, from the same transaction, so
  nothing has to read an attachment to find out what it is. And the sources can be enumerated:
  every one the pool has an item from, with how much of it and when it last captured, derived from
  the items rather than from a list anyone keeps.
  ([plan](../plans/memos-relay.md))

- 2026-09-04 — **A delivery says what went, and a destination can be asked what would go.** A
  delivered outcome may carry the content it produced, its media type and a short prose note about
  what it could not carry; core stores the content as a blob and the routing record names it, so
  "what did I actually send to my vault?" is answerable. Converting lossily is a delivery rather
  than a refusal, which is only honest because the note and the output are there to read. Beside
  it, `preview`: a fourth thing a destination can be asked, taking what a delivery takes,
  reserving nothing, and **indicative rather than binding** — the delivery converts again when it
  runs. The sweep gained a rule to go with the first half: a blob a record names as its output is
  never reclaimed.
  ([plan](../plans/delivery-output-and-preview.md),
  [ADR 33](../adr/0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md))

- 2026-09-02 — **The pool answers what a field has already held.** Beside `candidates`, which asks
  the destination, a read that asks the pool: what has been routed to this destination through this
  capability's field, how often, and when last. Nothing goes and looks, so it answers when the
  destination cannot — which is what keeps a place completable against a vault that is not mounted.
  Facts rather than an order, per destination rather than pool-wide, and counting a reservation
  that is still being retried but not one that was given up on.
  ([plan](../plans/typed-routing-composer.md))

- 2026-09-02 — **A capability may name an outcome and decide at delivery.** The kinds that write
  files gained a third capability that means *put this note here* and settles create-against-append
  itself, when it is holding the vault and the answer is true, rather than making a composer commit
  a guess against a destination it may not have been able to reach. The two that decide nothing are
  kept, because refusing to overwrite and naming a path nothing may derive from are promises a rule
  wants and an outcome-shaped capability cannot make. Nothing in core moved — this is a rule about
  what a capability should be named after.
  ([plan](../plans/typed-routing-composer.md),
  [ADR 31](../adr/0031-the-adapter-decides-create-or-append-at-delivery.md))

- 2026-09-02 — **A destination can be asked whether it is really there.** `destinations.probe`
  joins `describe` and `candidates`, optional on a kind adapter and answering `ready`, `rejected`,
  `unreachable`, `unusable` or `not-offered`. Describing answers from a declared shape and never
  leaves the process, so an unmounted drive and an account nobody declared both describe themselves
  cheerfully; this goes and asks. `rejected` against `unreachable` is `DeliveryOutcome`'s own
  distinction one call earlier — a person's to fix, against one already being retried. Nothing
  writes to find out, so `ready` is reached rather than proven writable.
  ([plan](../plans/destination-checks-and-accounts.md),
  [ADR 30](../adr/0030-a-destination-can-be-asked-whether-it-is-really-there.md))

- 2026-09-03 — **A webdav vault can be enumerated.** The kind answers `candidates` from one
  `PROPFIND` at `Depth: 1` per scope, which is the round trip per level the filesystem kind pays a
  `readdir` for, so both kinds now draw the same typed line. It reaches the server, unlike
  `describe`, so an account that is asleep answers unreachable and the line goes on being typed
  against what the pool remembers.
  ([plan](../plans/typed-routing-composer.md))

- 2026-09-01 — **A second destination kind, and what a kind holding a credential may be told.** A
  `webdav` destination delivers a note to a folder on a WebDAV server, with the filesystem kind's
  own two capabilities and the same note: what turning a delivery into markdown *is* now lives
  beside both kinds rather than inside one of them, so the two cannot drift into two dialects.
  Nothing in core moved — a new kind reaches the composer by being registered, which is what the
  settings schema and `describe()` were for. What did change is a rule about settings: for a kind
  that holds a credential, *which endpoint* is no longer a person's free-text field, because
  settings are pool state and a free-text address is somewhere the daemon would send a password.
  ([plan](../plans/destination-webdav.md),
  [ADR 28](../adr/0028-a-remote-destination-names-a-credential-profile-not-a-url.md))

- 2026-08-31 — **A destination can be asked what one field of one capability's arguments could
  hold.** `destinations.candidates` joins `describe` on the pool API and on the `Destinations`
  port, optional on a kind adapter: it names a capability, a field, and an opaque scope an earlier
  answer minted, and answers entries — a label, the value the field would take where the field may
  hold it, and a scope to ask again with where there is more past it — plus whether the answer was
  cut short. `describe()` is untouched and stays offline-safe. Failures are `unreachable`,
  `unusable` and `not-offered`. An adapter can now declare the last two itself, by throwing
  `Unusable` or `NotOffered`, for what only it knows.
  ([plan](../plans/destination-targets.md),
  [ADR 26](../adr/0026-a-destination-can-be-asked-what-an-argument-could-hold.md))

- 2026-08-31 — **A delivery supplies arguments, not a target.** `Capability.targetSchema`,
  `DeliveryRequest.target`, `Delivery.target`, and the arguments a `destination` `RoutingTarget`
  carried under its own `target` field, are all `arguments` now — matching CONTEXT.md.
  `RoutingTarget` itself keeps the word, for the one sense it still names: the destination-or-user
  a record resolves to. No behaviour changed.
  ([plan](../plans/destination-targets.md))

- 2026-08-25 — **An asset takes the id its uploader minted.** `assets.store` is given the id
  instead of minting one, and answers whether it stored the asset or already held it, refusing
  `asset-id-conflict` where that id names content, a filename or a media type it disagrees with. So
  a capture's envelope can name its assets before the bytes are sent, and an upload repeated after
  a lost answer costs the transfer again but not a second asset.
  ([plan](../plans/client-minted-assets-and-health.md),
  [ADR 22](../adr/0022-the-uploader-mints-the-asset-id.md))

- 2026-08-25 — **A pool says which pool it is.** The store mints an identity with the pool and
  answers the same one for as long as that pool exists; the pool reads it, so a host never reaches
  past the pool for it. It is opaque and says nothing about the pool it names, which is why it is
  not one of the ids a generator may mint. A rebuild makes a new pool and so a new identity — the
  consequence this spec already carried, now with something behind it.
  ([plan](../plans/client-minted-assets-and-health.md))

- 2026-08-24 — **An item is editable until it is processed.** The seal is now a decision about the
  item — routed, archived or something revised from it — rather than a later capture taking the
  head, so an unprocessed capture is a person's to rewrite however old it is, and an amendment
  moves nothing. A revision became an ordinary capture carrying a trace: its own id, its own
  capture time, its own source identity from the edit's envelope, which is what lets a retried edit
  be matched for replay the way a capture is. `supersededBy` became `revisedInto`, a list, and one
  item may be revised any number of times; the head rule, the revision chain and the
  `item-superseded` refusal are gone. ([plan](../plans/editable-until-processed.md),
  [ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md))

- 2026-08-18 — **A destination is pool state, and the port is per kind.** One is a row a person
  creates, renames, retires and deletes through the pool's own API, each mutation appending to the
  action log; `PoolPorts.destinations` and the per-destination adapter are replaced by one
  `Destinations` port that takes the destination as a parameter, so an edit takes effect on the next
  call. A kind publishes the schema its settings must satisfy and core refuses with the issues. A
  kind nothing speaks, or settings that no longer satisfy one, is **unusable** — reported beside
  described and undescribable, refused for routing, and left untouched. A deferred delivery resolves
  its destination when it runs and carries unusable on `unreachable` terms; retirement stops the
  next decision and nothing already decided.
  ([plan](../plans/destinations-in-the-pool.md),
  [ADR 20](../adr/0020-destinations-are-pool-state.md))
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
  position *(reversed 2026-08-24: the key is capture time, which the feed already read)* and take
  no order *(reversed 2026-08-17: which end a reader starts from is the reader's)*, and **processed is derived** as promised: unarchived, unrevised
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
  its **state** and the **arguments** the delivery supplied, because a delivery carried out later
  is assembled from the record alone; `routing.cancelDelivery` and `routing.deliveryFor` are new, and
  `routing.destinations` answers what each wired adapter declares. No adapter ships: this is proved
  against a destination that fails on command.
  ([plan](../plans/delivery-machinery.md),
  [ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md))
- 2026-08-14 — **Items leave, and land in a folder.** The first destination adapter ships:
  `@notemap/destination-fs` declares `create` and `append` over a configured root,
  renders a delivery as CommonMark under provenance frontmatter, and writes every asset beside the
  note under the name it was uploaded with — closing the copy-or-reference question for this
  destination in favour of a copy. The daemon wires destinations from configuration, and a delivery
  runner beside the mirror runner drives what could not be carried out inline; the two share one
  loop, differing only in what a job is. A missing or unwritable root reports **unreachable**, so a
  decision made against an unmounted drive is kept and retried; a traversal, a file already there
  and arguments of the wrong shape report **rejected**, which is abandoned at once. Nothing a
  delivery names can escape the root: the target is resolved against the root's real path and
  compared, and the deepest existing part of it read back through the filesystem, so a symlink out
  is caught as well as an absolute path or a `..`. Nothing is overwritten either — a file is created
  with a hard link, which refuses a name that is taken and still appears whole or not at all.
  *(Amended 2026-08-17: `describe` is asynchronous, as the destination section already required.
  Identity moved onto the adapter as `id`, so a duplicate is still caught at wiring time while
  capabilities are re-read per call; `routing.destinations` answers a report per destination, and
  one that could not describe itself is reported rather than dropped; and `routing.route` refuses
  `unreachable` when it cannot read capabilities to check arguments against.)*
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
  held is taken back only once it has run out. Two concurrent claimants never share a job. Closing
  a pool twice answers rather than throwing, which a host sent the same signal twice was relying on
  without knowing it. (plan: `docs/plans/complete-integration-tests.md`)

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
  There is one, `note`: optional prose and any number of attachments.
- **Feed and queue** — ordered, paginated reads of both surfaces.
- **Enrichment** — the job model, suggestions and artifacts, accepting and rejecting, per-source
  auto-request policy. Ports defined; **no providers wired**.
- **Routing** — the destination port, the append-only routing log, a filesystem destination
  including its append-to-an-existing-file form, and **routing templates**: a saved decision, the
  expansion of its patterns, and the trigger tag that applies it.
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
- **Authentication and authorization.** Not core's, and still not — a host authenticates or does
  not, and core gains no user either way. *Clarified 2026-08-31*: the daemon now has a door
  ([ADR 27](../adr/0027-the-daemon-authenticates-and-core-does-not.md)); this line was and remains
  true **of core**.
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
  items and the items revisions were made from. **Which end it starts from is the reader's** (decided 2026-08-06):
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
- **The pool answers which pool it is** (decided 2026-08-25). A **pool identity** is minted with
  the pool, stable for as long as it exists, and opaque — it names a pool without describing one,
  so nothing may be read out of it, its age included. It is a read on the pool rather than
  something a host asks the store for, and it is not among the ids a generator mints, which are
  free to be time-ordered. A rebuilt pool takes a new one by being a new pool.

### Editing

- **An item is editable in place while it is unprocessed, and revised once it is processed.**
  Processed means routed, archived or revised, so editability and queue membership are one
  predicate read two ways: everything in the queue is a person's to change, and nothing else is.
- **A revision is about content, and only content.** Editing the capture's content, its text or an
  attached file, is what this section describes. Classification, archiving, routing and accepting
  a suggestion change an item's state in place and never produce a revision.
- **Only a decision about the item seals it.** Capturing something else does not, and neither does
  time passing. What fixes a capture is that a copy of it went somewhere notemap does not own, or
  that the person declared themselves done with it by archiving it or by rewriting it into
  something new.
- **A revision is an ordinary capture carrying a link.** It mints its own id, its own capture time
  of now, and its own source identity from whoever made it. The link, `revisionOf`, is a trace,
  and it is the only thing that distinguishes a revision from anything else that arrives. A
  revision is not a newer version of what it names and does not replace it: the item it came from
  was delivered or set aside and stays exactly as it was.
- Tags carry over to a revision, keeping their attribution. **Routing records, archive state and
  enrichment do not**, belonging to the item they were made about. A revision therefore starts
  unprocessed and appears in the queue whether or not the item it came from was routed.
- Nothing that triggers routing carries over either. A proposed destination is a **suggestion**,
  not a tag ([ADR 6](../adr/0006-enrichment-splits-into-suggestions-and-artifacts.md)), and
  pending suggestions attach to one item: rules re-propose against the revision's tags.
- **An item may be revised more than once**, and the revisions are independent captures that
  happen to share an ancestor. There is no chain and no current end, so nothing has to say which
  of them is authoritative. What the item they came from says about them is `revisedInto`, derived
  from the links and never stored, and it is what processes that item.
- **A revision does not sit where its ancestor sits.** It carries its own capture time, so the
  feed places it when the person wrote it and the queue does the same. A surface wanting to draw a
  revision beside what it came from groups on the link, which is interface policy and not core's.
- **An in-place amendment does not move an item in the queue**, whose key is capture time.
  Resurfacing exists so a person meets an item again, and the person amending one is looking at it
  already; a revision resurfaces on its own by being new. `content_updated_at` still records when
  the content last changed, for the mirror's rendering and for a surface that wants to say so, and
  orders nothing.
- **The payload type may not change**, on either outcome. An edit changes what a capture says, not
  what it is, and the answer must not depend on whether the pool amends or revises, which an
  offline caller cannot always know.
- **An edit is refused what a capture's payload is refused for**, less the one refusal it cannot
  raise. Editing may change an attached file as readily as the text, so content that fails its
  schema and a reference to an asset the pool does not hold are refused exactly as at capture. A
  payload type the host does not know is not among them, since a type differing from the item's
  own is already refused as `payload-type-changed`.
- **The pool decides which outcome an edit gets, and the caller reads it off the answer.** A
  caller can usually predict it now, everything the seal derives from riding on the item it
  already holds, but another client may have routed that item since. Deciding server-side is what
  keeps an edit made against a stale view a quiet revision rather than a refusal, and a refusal
  needs a person where a revision does not.
- **An edit carries an envelope, because a revision is a capture.** It names the source and that
  source's own id, which is what makes a retried edit idempotent: a revision is matched for replay
  exactly as a capture is, so an edit resent after a lost response answers with the revision it
  already made instead of making a second one. An amendment needs no such match, writing the same
  payload twice being the same as writing it once. Matching *exactly* as a capture does means the
  payload is compared too: **an identity already claimed, by anything other than a revision of this
  item saying these same words, is refused** as `source-item-changed`. Every item claims one
  identity, a revision included, so a resend that changed its mind under an id it already spent is
  a caller's mistake rather than a replay — answering it with the earlier revision would drop the
  words it sent and call that success.
- A client may freely amend or discard a capture that core has not yet accepted. Immutability
  begins at the pool, and then only once the pool has been told the item is done with. Once a
  capture has been handed over for delivery it must be treated as accepted, even before a response
  arrives.
- **Both outcomes touch two items, and a revision owes two mirror writes.** The revision is new
  material; the item it came from is now processed, which takes it out of the queue, so its
  `modified_at` moves and a delta read that missed it would leave a client showing work that has
  gone. Its mirror record is unchanged in substance, `revisedInto` being derived and never
  mirrored, but the record carries a `modifiedAt` that verify compares.
- **An edit records the agent that made it**, as classification does. Only a person edits today,
  but that is a fact about what exists rather than a rule core enforces.
- **An amendment invalidates exactly the enrichment whose declared needs it changed.** An
  enrichment whose needs are untouched does not re-run, so editing the text beside a transcript
  leaves the transcript and the corrections made to it alone. *Nothing runs enrichment yet and the
  needs mechanism is unbuilt ([ADR 7](../adr/0007-enrichment-steps-declare-their-needs.md)); this
  binds the slice that builds it rather than describing anything observable today.*

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
- **The pool answers which tags are in use** (added 2026-08-20), each with the number of items
  carrying it, most used first and then by name. Not paginated and not narrowed by a
  prefix: the set is small, and a caller completing a tag holds the whole of it and filters that
  itself, which is what keeps completion working while the pool is out of reach. **Every item that
  exists is counted** (amended 2026-08-24), archived and revised alike. Tags do carry over to a
  revision, so a tag is counted once for the item it came from and once for the revision, which is
  correct: those are two items and both carry it. The exclusion this replaces was for a revision
  chain, where the same note counted once per link, and there is no chain any more. This is a
  reading of what classification has already produced, never a vocabulary: a tag no item carries
  does not exist, and nothing here constrains what may be written.
- **Any item that exists may be classified** (decided 2026-08-24), including a processed one.
  Classification is not content, so nothing that seals a capture reaches it, and re-filing a note
  after sending it is an ordinary thing to want. This reverses the 2026-08-17 refusal of both
  halves on a revised item, whose argument was that the tag would land where nobody reads it: the
  item a revision was made from is a real item in the feed carrying its own routing records, and a
  tag on it is read exactly where it was put. A revision still does not inherit a tag that arrives
  after it was made, being a separate capture.
- **Both halves are idempotent** (decided 2026-08-17). Adding a tag an item already carries leaves
  the attribution and time it has; removing one it does not carry changes nothing. Neither absorbed
  call appends an action or owes the mirror a write, because nothing changed. This is the opposite
  call to archiving's, and what separates them is what the caller supplies: an archive carries a
  reason, so a second one either overwrites what the first recorded or discards what the second was
  given. A tag's name is the whole of the request, and `by` is not something the caller chooses over
  again — so the first agent there stands, and a person's tag is not silently reattributed to the
  provider whose suggestion arrives after it.
- **A tag under `route/` may have an effect** (added 2026-09-07,
  [ADR 34](../adr/0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md)). The
  namespace is **reserved**: only a routing template may declare a trigger tag, and only under it.
  A tag under `route/` that no template declares is an ordinary tag and does nothing — the
  namespace marks where an effect *may* live, so nobody meets one by surprise, and it is not itself
  a decision.
- **Firing is on the tagging, not on the tag being present.** Adding the tag applies the template;
  the tag then stays on the item, saying why it went where it went. Nothing scans for items wearing
  one. So an absorbed re-tag fires nothing, a revision carrying its original's tags fires nothing,
  and a tag drained from a client's outbox fires when it arrives, by the same path any tag takes.
  **Untagging does not unroute**: the record exists, and it is cancelled where cancelling lives.
- **A trigger tag that filed an item cannot be taken off while what it filed still stands** (added
  2026-09-07). It sits among ordinary tags in the same chooser, one keystroke from being removed,
  and putting it back would file a **second copy** rather than undo the first — firing being on the
  tagging, and the tag having nothing to say about the record it already made. So the removal is
  refused for as long as a record from that template is on the item, pending or delivered. The way
  back from a decision is to **cancel** it, which removes the reservation and gives the tag with it;
  once nothing it filed stands, the tag is live again and files as it did the first time.
- **The same rule keeps a second firing off an item**: a tag arriving where that template already
  has a record on the item lands as ordinary classification and fires nothing. A person may have
  taken the template in the composer and tagged the item afterwards, which says why it went there
  and is not a second decision.
- **A source-supplied tag fires too.** Attribution could tell a person's tag from a source's, and
  deliberately is not used: a capture arriving from an inbox already tagged `route/research` and
  filing itself is the point rather than an accident of it. What it costs is that a system outside
  notemap can cause a delivery.
- **A trigger tag whose template cannot route is refused, not applied** (added 2026-09-07). A route
  refused for anything but being unable to *reach* the destination means a stale or misconfigured
  template — one whose destination was deleted or retired, whose capability is no longer declared,
  or whose expanded arguments no longer fit — and that is the person's to go and fix. Since tagging
  is idempotent, a tag that filed nothing would be **spent** the moment it landed: re-applying it
  after the repair would be absorbed, and the item could never be filed by it again. So nothing is
  written at all, the tag included, and the refusal names the template and why. A destination that
  merely could not be reached is not this case: the reservation is made and the delivery waits it
  out, which is what the whole deferred model is for.
- **A capture's trigger tag is dropped rather than the capture refused**, on the rule this section
  already sets for a tag that trims to nothing: a whole capture is not lost over a tag, and there
  is nobody there to be told. Landing it would be worse than dropping it, for the reason above.

### Archive and purge

- **Archiving** hides an item from the queue without deleting it. The item stays in the feed and
  remains fully processable from the archive; archiving is a filter, not a terminus.
- Archiving is always an explicit decision, and may carry a reason. **Unarchiving is likewise an
  explicit action** (decided 2026-08-03): an archived item returns to the queue, at its
  unchanged position, since archiving never moved it.
- **The archive excludes nothing** (decided 2026-08-17): every archived item is in it, revised or
  routed alike. It filters on one axis, which is the one archiving acts on. The queue's exclusions
  say what is not worth working on now; the archive is not a work list but the record of what was
  set aside, and an item dropped from it for having a revision would be reachable from the feed
  alone. So an archived item a revision was made from sits in the archive while that revision sits
  in the queue — two items, one of which says which it is, since `revisedInto` is read off the item
  wherever it appears.
- **Purge** is the only destructive operation. It removes one item, its enrichment, its routing
  records, its mirror files and its assets — an asset only when no remaining item references it,
  and the blob beneath it only when no remaining asset does.
- **Purge takes one item and no more** (decided 2026-08-24). A revision made from the purged item
  is a capture in its own right, which may since have been tagged, routed and revised again, so
  taking it along would destroy work nobody asked to lose. Its `revisionOf` is left pointing at the
  tombstone ([ADR 4](../adr/0004-purge-leaves-a-minimal-tombstone.md)), which is enough to say the
  thing it came from was purged. This replaces removing the whole revision chain, which was right
  while a chain was one note spread over several rows.
- **Core does not warn, and does not refuse an entangled item.** Every fact a person needs before
  purging rides on the item already — `revisedInto`, and the routing summary saying how many places
  it reached — so a shell can say what will be left behind and what will not, in its own words.
  Making core refuse without an acknowledgement would put interface policy in the one place that
  holds none.
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
- **An asset's id is the uploader's** (decided 2026-08-25,
  [ADR 22](../adr/0022-the-uploader-mints-the-asset-id.md)), as a capture's is. Storing under an id
  the pool already holds answers that asset where the blob, the filename and the media type all
  agree, and is refused otherwise: all three, because an asset is a named reference and the name
  and media type are both served back. This is what lets a capture with an attachment be written
  whole before its bytes move, and what makes an upload idempotent — the one mutation that was not.
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

- The queue presents the items that are unprocessed, ordered by capture time. Unprocessed is the
  whole of it: an archived item, a routed one and one that has been revised are all processed, and
  each is excluded by the same clause rather than by a list of exceptions.
- **Which end the queue starts from is the reader's** (decided 2026-08-17), oldest first by
  default. This reverses "the queue does not take an order" and supersedes that clause of
  [ADR 10](../adr/0010-feed-and-queue-sort-differently.md), on the argument that ADR already made
  for the feed and then declined to follow one surface further: what a client shows first is
  interface policy, and core imposes none. A person clearing a backlog may reasonably want the
  newest captures first, and refusing them buys the domain nothing. What makes it a queue is the
  **key**, and that the queue drains.
- **The key is capture time** (decided 2026-08-24), the same one the feed uses, so the queue, the
  feed and the archive are one ordering read through three filters. Nothing an item undergoes moves it: not
  classification, routing, archiving or enrichment, and not editing either. This replaces last
  touch, which existed so a revised item resurfaced where it would be met and is no longer needed
  for it, a revision now being a new capture that arrives at the newest end by its own time.
  `content_updated_at` survives as a record of when content last changed, read by the mirror's
  rendering and by any surface that wants to say so, and orders nothing.
- A third timestamp, `modified_at`, records the last change of any kind — content or state —
  and exists for sync delta reads only ([sync.md](sync.md)). It never affects ordering.
- An item is **processed** when it has been routed, archived or revised. Being **marked processed
  by hand** — the user carried its content onward themselves — is routing: it appends a routing
  record whose destination is the user, with an optional note of where it went. Passing over
  an item changes nothing and is a skip.
- **It is the decision that processes an item, not the arrival** (added 2026-08-13). A routing
  record exists from the moment a person routes, so an item leaves the queue even when its
  delivery is still pending, and returns to it if that delivery is abandoned
  ([ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)). Otherwise the queue
  would report on whether a destination happened to be reachable rather than on what has been
  decided.
- **Processed is derived, never stored** (added 2026-08-13, third clause added 2026-08-24):
  archived, holding at least one routing record, or holding at least one revision. This is the
  treatment `revisedInto` already gets, and for the same reason — the routing log is authoritative
  about deliveries, and a column agreeing with it is a column that can one day disagree. The cost is an anti-join per queue page, which the store is expected to index
  for rather than denormalise around.
- **Keyset pagination is sound although the queue reorders under the reader** (added 2026-08-13).
  The feed gets this for free, its order never changing; the queue's does, which is the point.
  Nothing moves an item within the queue at all now that the key is capture time, so the only
  events are arrivals and removals. An arrival, whether a capture or a revision, carries a capture
  time of *now* and lands ahead of a reader walking oldest-first. A removal, whether routing,
  archiving or being revised, hides an item a reader who had not reached it was never meant to
  see. Neither can make a page skip a row or repeat one.
- **An item returned to the queue behind a reader is seen on that reader's next pass, not this
  one** (added 2026-08-17). Returning is a third kind of event, neither a move nor a removal: it
  puts an item back at the capture time it left with, which may be behind a reader who has already
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
- Whether an enrichment runs automatically or must be requested is policy attached **per intake
  source** — a recording from a voice-memo source may transcribe automatically while an
  arbitrary uploaded file requires an explicit request. Where that policy is written is open: the
  configuration block that held it was removed unread
  ([ADR 43](../adr/0043-config-holds-what-an-install-is.md)), and pool state is where it lands.
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
- **An item carries a summary of where it has been** (added 2026-08-20): how many records it
  holds, how many of those are still pending, and the distinct places they name — a destination
  by id, or the user. Present only where a record exists, and **derived rather than stored**,
  which is the treatment `revisedInto` already gets and for the same reason: the routing log is
  authoritative and a second copy is one that can one day disagree. It is on the item because a
  surface reads a page of them and cannot ask per row — without it a feed can say an item was
  archived and cannot say it was routed. The records themselves are still read one item at a
  time: a capability, arguments and a pointer are an item's detail, not a row's. *Amended
  2026-09-15*: it also names the **templates whose records stand**, distinct and in the same
  order. A trigger tag cannot come off while what it filed stands
  ([classification](#classification)), and a row drawing the tag has to know that without reading
  the records — so the one fact that refusal turns on rides on the item as the places do.
- **A destination declares its capabilities** (decided 2026-08-04). Each capability names one
  thing that destination can do, the payload types it accepts for it, and a schema for the
  arguments a delivery must supply. A delivery names a capability and supplies arguments; core
  refuses one the destination has not declared, or a payload type it does not accept, rather
  than approximating.
- **Core holds no list of capabilities.** A fixed set — create, append, place — was tried and
  rejected: it is filesystem-shaped, and a board, a webhook or a Micropub endpoint does not
  decompose into it. Capability names and argument shapes belong to the adapter, the way payload
  types already do, so a new kind of destination needs no change in core.
- **A destination is pool state** (decided 2026-08-17,
  [ADR 20](../adr/0020-destinations-are-pool-state.md)). One is a row: a minted id, a name a person
  can change, a **kind**, that kind's settings, and whether it is retired. It was configuration the
  host read and handed over, which left a routing record's `destination` referring into a text file
  a person could delete a paragraph from. Creating, editing, retiring and deleting one are
  operations like any other, and each appends to the action log.
- **A kind publishes the schema for its settings**, and core validates against it and refuses with
  facts — the same arrangement as a capability's arguments schema, one level up. Core holds no list of
  kinds, so a new kind of destination still needs no change in core. The host registers **one
  adapter per kind**, not one per destination
  ([ADR 8](../adr/0008-adapters-are-in-process-and-wired-by-the-host.md)): the destination is
  handed to the adapter with the delivery, and there is no per-destination instance to build,
  cache or invalidate. An edit takes effect on the next call.
- **Name and settings change together or not at all** — one `edit`, one transaction, one entry per
  half that actually differs. Two operations would leave a shell that sends both with an edit
  half-applied, and a save that changed nothing appending that it had.
- **A destination is retired, not removed** — reversibly, which stops it being offered for new
  routing and disturbs nothing already decided. Deletion is refused for any destination a routing
  record has ever named, and allowed for one none has, so a mistyped destination need not become
  permanent furniture while a used one can never stop resolving. Renaming is free, because a record
  names the id.
- **A destination the running code cannot make sense of is reported, never dropped** — a kind no
  adapter is registered for, or settings that no longer satisfy that kind's schema, is **unusable**
  with a reason, beside described and undescribable. Routing to it is refused. The row is left
  exactly as it is, because the code that understood it may come back and the person who wrote it
  cannot reach the row to fix it otherwise.
- **An adapter may declare a destination unusable itself** (added 2026-08-31), by throwing
  `Unusable` from `describe()` or from `candidates()`, and core reports it on exactly the terms
  above. The two checks core makes — a kind nothing speaks, settings that fail the kind's schema —
  are the ones core can make from the outside, and they are not all of them: a filesystem root
  pointed at the daemon's own state satisfies every schema there is and is still a destination
  nothing should be delivered to. Without this an adapter's only way to say so is a throw, which
  core has to read as merely unreachable — a destination that will come back — and retry forever.
  A kind that throws anything else is unreachable, as it always was.
- **A deferred delivery resolves its destination when it runs**, not when the decision was made: a
  root corrected after a failure is why the retry succeeds. A destination that has become unusable
  is proof that nothing was delivered, so the job retries on the same terms as `unreachable` and is
  eventually abandoned, handing the decision back.
- **Retiring a destination does not touch a delivery already decided.** A reservation still lands;
  what retirement stops is the next decision.
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
- **A record remembers the arguments the delivery supplied** (added 2026-08-14), beside the
  destination and the capability. Under the synchronous model the arguments were consumed by the
  one attempt; a delivery that is carried out later has to be assembled from the record alone, and
  a reservation that could not say what it was pointed at would be a decision nothing could act on.
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
- **Retry is keyed on evidence, not on failure** (narrowed 2026-09-08,
  [ADR 41](../adr/0041-a-delivery-that-cannot-be-confirmed-may-duplicate.md)). `unreachable` means
  the adapter **could not confirm** that anything was delivered, so the job is retried with backoff.
  Whether a retry can duplicate is then **each kind's own promise**, made where it is enforced and
  stated in that kind's README: both file kinds keep the strong one — a retry cannot duplicate,
  by a digest in an asset's filename, by `EEXIST` and by `PUT If-None-Match: *` — and a kind whose
  protocol offers no conditional create and no idempotency key says instead that it may, and names
  the window. `rejected` is proof that the destination was reached and refused, so it is abandoned
  on the first attempt — the same call enrichment makes for a failure reported as not worth
  retrying. A lease that expired with no outcome reported is **no evidence at all**, and is
  abandoned rather than retried: a delivery is not idempotent, the domain cannot tell a retry from a
  genuine second delivery, and the cost of guessing wrong is a duplicate nobody can detect.
- **Delivery retries are bounded**, unlike mirror work. Mirroring retries forever because giving up
  does not change the fact that material is unmirrored. Giving up on a delivery does change
  something: it hands the decision back, so the person can repair their configuration or route
  somewhere else.
- **The inline attempt is the first attempt** (added 2026-08-17), and the bound counts it. What
  `maxAttempts` limits is the number of times a destination is handed one item's material, which for
  something that cannot be repeated safely is the number worth bounding — not how much of that
  happened to be done by a job. So the count a person reads on the abandoned surface is the count
  that was made. *Amended 2026-09-07 for one path*: a **template fired by its trigger tag** makes no
  inline attempt, so its job's first attempt is the first, numbered from zero. Every other route —
  including one made by taking a template by hand — is unchanged.
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
- **A mark made by hand is cancelled by the same path** *(added 2026-09-15)*. `markProcessed`
  writes a record born delivered, and a delivered record is otherwise not cancellable — but
  nothing reached anywhere, so there is nothing that already happened to leave standing. Cancelling
  it removes the record, returns the item to the queue, appends `delivery-cancelled` with
  `target: user`, and owes the mirror the item, which a reservation never does: the mark was
  mirrored when it was made.
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
- **A delivery may carry its own content, and the reservation holds it** (added 2026-09-10,
  [ADR 45](../adr/0045-a-delivery-may-carry-its-own-content.md)). A routing request may supply the
  words this one delivery carries in place of the capture's. Core checks them against the item's
  payload type's own `contentSchema` — the identical check a capture gets, refused as
  `content-invalid` with issues — and substitutes them into the payload it hands the adapter. The
  item is untouched, so one capture reaches two destinations in two wordings and neither overwrites
  the other. Absent content means the item's own words, which is what every record written before
  this existed says; there is no flag, and the presence is the fact.
- **A rewrite is refused where an edit is forgiven, and the difference is the schema.** An item
  whose payload type the running config no longer names is refused as `unknown-payload-type` — but
  only where a request carries content, since nothing else on this path reads that schema. Editing
  such an item is deliberately allowed through unchecked, because an edit keeps the type the pool
  already holds and there is nothing to check it against. A rewrite cannot have that: the whole of
  what it promises is the identical check a capture gets, so where that check cannot run, the
  delivery is refused rather than carrying words nobody validated. Routing the item without words
  of its own goes on working.
- **The words are the person's, and the shape is still the destination's.** Supplied content is the
  *input* to a conversion rather than a replacement for one: a list marker, front matter and a tag
  foot apply to it exactly as they would have applied to the capture's words. Only the payload's
  content is replaced — `assets` and `metadata` are the capture's — so a rewrite cannot silently
  drop a picture.
- **The routing record carries it, beside the arguments and for the same reason.** A deferred
  delivery is attempted from the record alone, so a reservation that could not say what words it
  was decided with would replay the capture's on every retry. This narrows the line
  [ADR 33](../adr/0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md) drew
  rather than reversing it: what a reservation may not carry is a **destination's** converted
  output, which is produced before the destination is reached, goes stale, and cannot be honest for
  a capability that resolves itself at write time. A person's words are a decision rather than a
  conversion and are as true in six hours as when they were typed.
- **Amending the capture and cloning it were both refused.** Amendment is
  [ADR 19](../adr/0019-a-destination-converts-and-the-delivery-records-what-went.md)'s own dead
  end, reached again from the editing side: one amended form cannot serve two destinations, so the
  last route would win. A clone makes an item nobody asked for and puts a twin in the queue.
- **Conversion needs no state of its own.** A delivery mid-conversion is a pending reservation, the
  job holds its lease, and a slow one extends it. A host that dies mid-conversion lands on the
  unknown-outcome rule and is abandoned rather than retried, exactly as any other delivery is.
- **A delivery may report what it delivered**, and the routing record names those bytes, so the
  pool can answer what it sent and not only where. It is optional — a destination posting to an API
  may have nothing meaningful to keep — and it belongs to the delivery rather than the item,
  because two destinations with two templates produce two outputs from one item. Routing records
  are mirrored, so a rebuild restores it.
- **A conversion that loses something is a delivery, not a refusal** (added 2026-09-04,
  [ADR 33](../adr/0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md)). A
  todo-list destination that inserts one line prefixed `- [ ]` flattens a capture and drops its
  pictures, and it delivered: routing delivers a copy and the item is untouched. `rejected` is kept
  for a capture the destination can make no sense of at all — a payload type it cannot read, a place
  it will not write. Spending it on a partial carry would make an ordinary conversion unretryable
  and hand the decision back for something that worked.
- **What went is the output, and what did not is a note.** A delivered outcome may carry the
  **output**: the content, its media type, and a short prose note about what could not be carried.
  All three are optional and independent — a destination with nothing worth keeping may still have
  something to say, and a kind that carries everything has content and nothing to confess. The
  content is handed over as a **lazy opener**, the shape a delivered asset already uses, so a large
  output is never buffered in order to be hashed. Core stores it as a **blob**, the store being
  content-addressed already, and the record names the hash, the media type and the note.
- **A kind confesses what its own rendering left behind** (added 2026-09-10). The markdown kinds
  drop an item's artifacts always, and that reaches the output's note — a lossy delivery that says
  nothing is indistinguishable from a faithful one, which is the whole reason the note exists. What
  each dialect lost is the dialect's to say: the renderer names its own losses and the note
  assembly names the tags it was asked to write and could not, because neither knows the other's
  half. *Amended 2026-09-15*: tags the destination's settings left out are **not confessed**. They
  used to be, on the reasoning above; but a setting is a choice rather than a loss, the output
  already shows what it holds, and a note saying `its tags did not go` under every delivery to a
  vault that writes no frontmatter was the confession nobody could act on. A hashtag that could
  not be made of a tag is still said: that one was asked for.
- **The note is free text nothing parses**, on the same footing as the `detail` that rides on
  `unreachable` and `rejected`. A machine-readable list of what was dropped is a vocabulary both
  core and every shell would have to learn, and would be wrong the first time a destination lost
  something the vocabulary has no word for — which is the argument this section already had once
  over capability names.
- **The pointer may carry a URL beside it.** The human-readable pointer stays what it is, a path a
  person recognises, and a destination that can offer a link offers one. The filesystem kind
  answers a path and no URL, permanently: a path on the daemon's host is not reachable from the
  phone reading the shell. Both are best-effort and both may be stale.
- **The sweep never takes an output.** It reclaims blobs no *asset* names, and an output is named
  by a routing record rather than by an asset — the two may be the same bytes, so releasing the
  last asset that named a blob does not make it the sweep's. Nothing releases an output today:
  only a delivered record carries one, and a delivered record is never removed.
- **A destination can be asked what it would write** (added 2026-09-04), through a fourth method,
  **`preview`**. It takes what a delivery takes, answers an output, and touches nothing at the
  destination beyond whatever it had to read to answer. Core builds the delivery and **reserves
  nothing**: no routing record, no job, no lease, nothing appended to the log.
- **A preview is indicative, never binding.** The delivery converts again when it runs, and where a
  converter is not deterministic the two will differ — a fact about the destination rather than a
  fault. Committing the preview's bytes with the decision was rejected: it would put bytes in a
  reservation that is a pure decision, and it cannot be honest for a capability whose right output
  depends on the destination at the moment of writing, which `append` and
  `create-or-append` both are. A dry-run flag on `deliver` was rejected for one sentence: it
  puts one boolean between showing a person something and writing into their vault, which core
  cannot verify and an adapter can get wrong once.
- **That the two agree is the adapter's discipline**, not a guarantee the port makes. `deliver` and
  `preview` share one conversion because the kind is written that way; nothing in core can enforce
  it, and a kind whose preview drifts from its delivery is a bug in that kind.
- **A preview is refused for the reasons a route is refused** — an unknown destination, an
  undeclared capability, a payload type not accepted, arguments that fail the schema, content that
  fails the payload type's — because one that answered where a route would refuse would be
  describing a decision nobody can make. It takes the content a delivery takes and needed nothing
  of its own for it: the two share one preparation, so previewing a rewrite works the moment
  routing one does.
  `unreachable`, `rejected` and `not-offered` are **reported** rather than refused: none of them
  stops the decision being made, only the seeing of it. Optional on the adapter, with the port
  turning an absent method into `not-offered`, on `candidates`' terms.
- **What one value a field holds is called is a second question, not the same one**
  (added 2026-09-09, [ADR 44](../adr/0044-naming-a-value-is-a-second-question-a-destination-answers.md)).
  `candidates` asks what a field could hold and answers a capped page; **`naming`** asks what one
  thing it holds is called and answers one entry. They are not one method with an argument: a page
  may be truncated and a lookup may not, a page is slow and a lookup is cheap, and a caller that
  wants only a name would otherwise pay for a page it discards. The value is whichever form the
  field ended up holding — a decision made once keeps `value`, a template keeps `durable`, and a
  destination that answers for one answers for both. An entry the destination has nothing to say
  about comes back **answered and empty**, since a place typed by hand is not one it offered and
  refusing would make a value it delivers to look broken. Optional on the adapter, with the port
  turning an absent method into `not-offered` — which is the right answer for a kind whose values
  are their own names, a path being one.
- **A destination is asked what it can do, and may need to go and look** (added 2026-08-17).
  Describing a destination is asynchronous: a vault whose templates are files, a board whose
  columns come from an API, or another pool cannot answer from a constant fixed at wiring time. A
  destination that cannot describe itself is reported as such rather than omitted silently, since a
  missing destination and an unreachable one are different answers to a person looking for one.
- **A destination can also be asked what one field of one capability's arguments could hold**
  (added 2026-08-31, [ADR 26](../adr/0026-a-destination-can-be-asked-what-an-argument-could-hold.md)),
  through its own method, **`candidates`**, rather than `describe()` grown a mode. `describe()`
  answers from a destination's declared shape and stays constant-time and offline-safe; a folder's
  contents, which notes exist, or the tags a vault already uses are current state, and folding them
  in would make every settings screen stall on a destination that is merely asleep. It is optional
  on the adapter, and asked about **a field** rather than a path: a fixed vocabulary of place-kinds
  was tried once for capabilities themselves and rejected, and encoding "collection" and "item" for
  what a field can hold would repeat it the day a board's columns or a vault's tags showed up
  neither. An answer is entries — a label, and then a value, a scope, or both: what the field may
  hold, somewhere to look for more, and no assumption that they are the same thing. Browsing for a
  note descends through folders and is never offered one as a note, which is what an entry with a
  scope and no value says. So a tree is walked by a caller that was never told it is a tree, and
  `truncated` says where the destination held more than it answered. An entry may also carry a
  **`durable`** form of its value (added 2026-09-08,
  [ADR 42](../adr/0042-a-candidate-carries-both-its-readable-name-and-its-lasting-one.md)) — the
  same thing under a name that survives being renamed, where the destination has two for it. Absent
  is the ordinary case and means the value is already the lasting one. Which of the two to take is
  the **asking surface's** business rather than the destination's: a decision made once prefers the
  readable name and reads it back on its record, and one that fires again for months prefers the
  name that cannot rot. Core carries both and reads neither. A
  request carries none of the arguments filled in so far, because no field either kind declares
  today depends on another. Failures are `unreachable`, `unusable` and `not-offered`, on the same
  terms `describe()`'s own report already uses. `not-offered` is one answer however it was reached
  — a kind whose adapter implements none of this, and a field an adapter does not answer for, are
  the same fact to a caller: nothing here can be browsed.
- **The pool can be asked what a field has already held on a destination** (added 2026-09-02).
  The same question `candidates` asks — a destination, a capability, a field — answered from the
  routing records the pool already holds rather than from the destination. The two are deliberately
  the same shape and deliberately different reads: one is the destination's answer and can be
  `unreachable`, the other is the pool's own and cannot, which is what lets a surface keep
  completing a place while the destination behind it is not there. It answers **facts and not an
  order** — each distinct value, how many records used it, when the last one was — because which to
  put first is presentation and belongs to whatever draws it; changing that must not be a change to
  the read. **Per destination, never pool-wide**: a place in one vault means nothing in another.
  What counts as a use is *delivered, or still being tried*: a `delivered` record counts outright,
  and a `pending` one counts unless its delivery was abandoned — which is the one place this is
  more than a query over records, since `RoutingRecordState` carries no failure and the answer
  lives on the job. Capped on `candidates`' own terms, so a pool with thousands of records cannot
  make it unbounded.
- **A destination can be asked whether it is really there** (added 2026-09-02,
  [ADR 30](../adr/0030-a-destination-can-be-asked-whether-it-is-really-there.md)), through a third
  method, **`probe`**. `describe()` answers from a declared shape and never leaves the process, so
  it says nothing about an unmounted drive or an account nobody declared — both describe themselves
  cheerfully, and the first evidence either is wrong is a delivery that does not land. A probe goes
  and asks: it resolves what it needs, opens the connection, presents the credential and asks
  whether the root is there. The answer is `ready`, `rejected`, `unreachable`, `unusable` or
  `not-offered`. `rejected` against `unreachable` is the whole point of it and is
  `DeliveryOutcome`'s own distinction one call earlier — something a person must go and fix, against
  something that will come back on its own and is already being retried. Optional on the adapter,
  with the port turning an absent method into `not-offered`, on `candidates`' terms.
- **`ready` means reached, not writable.** A probe never writes: proving a vault is writable means
  creating and deleting a file in it, which is not what a check does. It takes an answer where one
  is free — a filesystem kind asks the kernel, and both kinds refuse a root that turns out to be a
  file, which is a note rather than somewhere notes go — and infers the rest from having reached
  the place at all. Nothing consults a probe before a delivery: what a delivery finds out is
  still a delivery's to find out.
- **A capability may defer its own decision to delivery** (added 2026-09-02,
  [ADR 31](../adr/0031-the-adapter-decides-create-or-append-at-delivery.md)). A routing decision is
  recorded against a destination that may be asleep, and the gap before the delivery lands is
  unbounded, so a capability that asks the caller to state what is *already there* is asking about
  a fact nobody at that moment holds. Such a capability instead names the outcome and lets the
  adapter resolve it against the destination as it finds it — the adapter is holding the vault at
  the moment of the write, and it is the only thing that ever knows. A surface may still forecast
  what will happen, from `candidates`, and say so before committing; the forecast is drawn and
  never stored. Core is unchanged by this: it validates arguments against the declared schema and
  refuses a capability that was not declared, exactly as before. What the decision settles is a
  rule about **how a capability should be named** — after the outcome a person wants, not after
  the mechanism that will achieve it — and it is why the kinds that write files offer a capability
  that decides at delivery beside two that are stated up front. `append` promises a *named place*:
  nothing is derived from the item, so a rule files into exactly the note it names. `create`
  promises a new thing rather than an addition to one — but **not** that a name already taken is
  refused, which is each kind's own promise and stated in its README. Both file kinds make it, by
  `EEXIST` and by `PUT If-None-Match: *`; a kind whose protocol offers no conditional create cannot.
  Neither capability promises the place is already there — both file kinds write one that is not,
  which is what a daily note whose sections appear as things are filed into them needs.
- **A capability's accepted payload types may be a wildcard**, for a destination whose fallback
  genuinely handles anything. It is a promise rather than a shrug: claiming it trades away the
  refusal core would otherwise make up front, so what would have been an immediate
  `payload-type-unsupported` becomes a delivery that is attempted and rejected.
- **Nothing delivers that a person did not ask for** (rewritten 2026-09-07,
  [ADR 34](../adr/0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md)). This
  replaces *"a rule never delivers on its own"*, which was written when the only thing that could
  fire was a conditional rule nobody had specified. A routing template is not that: it holds a
  decision a person made once, and applying it — by taking it in a composer, or by putting its
  trigger tag on an item — **is** the decision being made again. What the old line was protecting
  is intact, and is now said directly: nothing in core watches the pool and decides on its own
  behalf, no condition is evaluated against an item, and every delivery traces to a gesture. A
  conditional rule table remains unbuilt and would need its own decision.

### Routing templates

- **A routing template is a saved routing decision** (added 2026-09-07,
  [ADR 34](../adr/0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md)), held as
  **pool state** beside destinations: an id, a name a person can change, the destination, the
  capability, the arguments **as patterns**, how its folder is treated, and optionally a trigger
  tag. It is configuration rather than history, which is why there is no retire — a destination is
  retired because records name it forever, and a template names nothing that outlives it.
- **A template names a destination**, never `manual` and never `discard`. Both are decisions about
  an item rather than places to file one, and neither needs saving.
- **A trigger tag is unique across templates**, and must sit under `route/`. Both are refused with
  their own reasons rather than silently ignored. It is **declared rather than derived** from the
  name, so renaming a template disarms no tag already written on an item.
- **A destination a template names stays deletable, and the delete warns**, naming the templates it
  strands. A record naming a destination still refuses the delete: a record is history that would
  otherwise name nothing, and a template is configuration a person can repoint. So everything that
  reads a template tolerates a destination that is gone, and routing from a stranded one is refused
  as an unknown destination, which needed no new refusal.
- **The routing record names the template it came from**, optionally — a decision made by hand
  names none — and says whether **the tagging made it**. Three things want it: `establish` has to
  know whether it has ever landed, and the log can say a template filed this rather than that
  somebody took one. It is **no longer what decides whether the tag comes back** *(amended
  2026-09-09)*: a reservation any template made takes that template's trigger tag with it, the
  composer having since become a place the tag is written from too.
- **Arguments are patterns, and core expands them when the decision is made** (added 2026-09-07,
  [ADR 35](../adr/0035-a-templates-arguments-are-patterns-expanded-when-the-decision-is-made.md)).
  The template stores what was typed; the record stores what it came out as. So everything that
  reads a record goes on working with no knowledge that templates exist, and a record is honest
  about the place it actually asked for.
- **The vocabulary is closed, and expansion is statically total.** The fields are the item's own —
  its capture date, its id, its source — with named formats rather than a date language. An unknown
  field or an unknown format **refuses the write** when the template is saved, while the person is
  still looking at it, and every field in the table is present on every item, so there is no second
  refusal at route time and a template that saved will always expand. Expansion applies to string
  values only, at every depth of the arguments, and the result is validated against the
  capability's arguments schema exactly as a hand-made set is.
- **The line against [ADR 31](../adr/0031-the-adapter-decides-create-or-append-at-delivery.md)**:
  the adapter resolves what only it can know — what is already there, at the moment of writing —
  and core resolves what only the item knows. A date is the item's, not the vault's.
- **A capture records the UTC offset it was made at**, optionally, and the date pattern is read in
  it: a note captured at 22:32 in Stockholm is filed under that day and not the next. A capture
  that carries none is read in a **fallback zone the host names**, an IANA zone on the terms this
  document already sets for operational knobs — never a silent UTC, which would file a person's
  evening in tomorrow.
- **A folder is created, required, or established once** (added 2026-09-07,
  [ADR 36](../adr/0036-a-folder-is-created-required-or-established-once.md)). A capability that
  writes into a folder takes `create` or `require`; the check is the **adapter's**, at delivery,
  because whether a folder is there is a fact only the thing holding the vault ever has. A missing
  folder under `require` is **rejected**, which is abandoned on the first attempt and hands the item
  back to the queue — so a research folder that was renamed stops the filing and says so, rather
  than making a second one beside it.
- **A capability says which of its fields is a path**, with a vendor annotation in its own
  arguments schema, and core reads that rather than knowing capabilities by name. It is what the
  template report's folder check is about, and the rule it keeps is the one stated above: *core
  holds no list of capabilities*. A destination whose places are a fixed set — a board's columns, a
  mailbox — marks no field and has no folders, which is the ordinary case rather than a gap: there
  is nothing to check, and nothing about a path is inferred for it. Marking a field is the whole of
  what a new kind has to do to be folder-checked, and doing nothing is the whole of what it has to
  do not to be.
- **A capability may say a field holds only something the destination already has** (added
  2026-09-08, [ADR 42](../adr/0042-a-candidate-carries-both-its-readable-name-and-its-lasting-one.md)).
  A vault's folder is *made* by the delivery that needs it; an are.na channel is joined, a mailbox
  subscribed to. Both are askable and both take a string, so nothing can tell them apart by looking.
  **Core never reads this one** — it is said for the surfaces, and the fact it carries is that a
  value which has to name something already there cannot be expanded into: a routing template's
  pattern vocabulary beside such a field is advice that can only ever fail. It says the field *may*
  hold only what was offered, not that a caller must refuse anything else — a browse answers one
  page of what a destination holds, so what it did not name is not thereby wrong.
- **`establish` is the template's word alone**, and resolves at decision time: unestablished it asks
  the adapter to create, established it asks the adapter to require. No adapter ever hears it, so
  the arguments on a record are always the two-valued thing. The **argument it is carried in is
  notemap's own**, not a destination's — core writes it, an adapter declares it to accept it, and a
  surface drawing where an item went leaves it out of the place, a condition about getting somewhere
  not being the somewhere. The establishment is written in the
  transaction that stores the **first delivered** record naming the template, and is **cleared when
  the template is pointed anywhere else** — its arguments, its destination or its capability. A
  different place has not been established, and a **repointed** template is the largest version of
  that move: what was established was established at the destination that is gone. A first delivery
  that was abandoned leaves it unestablished, correctly: nothing landed.
- **A fired template waits, and never attempts inline** (added 2026-09-07,
  [ADR 37](../adr/0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md)).
  Tagging mints the reservation and enqueues an ordinary delivery job due a **configured window**
  later. Nothing in the work model is new: a job with a future due time and no attempts behind it is
  what a backed-off retry already is, so the wait is a row and a host that dies inside it loses
  nothing. The window is host configuration, beside the retry policy and the sweep's grace. Its
  whole purpose is that a shell can offer a real *cancel* — inline, against a mounted vault, the
  note exists before the notice is on screen.
- **A route made by hand keeps the inline attempt.** What is bought here is a window on the gesture
  that has no review in it; paying for it everywhere would slow every reviewed decision to serve a
  mistake that surface does not make.
- **The tag and the reservation commit in one transaction.** There is no I/O to keep out of it,
  because the attempt is a job by construction. So *tagged but not reserved* is a state that cannot
  exist and nothing has to sweep for it — including for a tag that arrived from a client's outbox,
  which is one call like any other.
- **A tag-fired reservation removed without delivering takes its trigger tag with it**, whether it
  was cancelled inside the window or abandoned after a failure. Two reasons: tagging is idempotent,
  so an item that keeps the tag can never be filed by it again and the queue slowly fills with items
  wearing a tag that does nothing; and the tag is on the item exactly when it filed it somewhere,
  which is what makes it readable a year later. **Only a tag-fired one** — a template taken in a
  composer is a decision a person made with the item in front of them, and the tag may be there for
  their own reasons. A **delivered** record keeps its tag, and untagging still does not unroute.
  The entry recording the removal names the record, so the tag does not read as having removed
  itself.
- **The pool derives how much of itself a template made** — how many records name it and when the
  last one did — beside the template, on the terms an item's routing summary is already derived.

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
  capture. That was the client copying back a number the server handed it a moment earlier, and
  every failure it claimed to catch resolves elsewhere: a swept
  asset is `unknown-asset`, a rebuilt pool restores asset identities so the id still resolves,
  and a corrupted blob is invisible to it, because the row and the reference agree — both name
  the same hash, and the disk is what is wrong. Integrity belongs where the two numbers have a
  wire between them, which is the upload ([http-v1.md](http-v1.md)). *Unchanged by the id becoming
  the uploader's* (2026-08-25): a client that mints the id does know the hash it would be copying
  back, and the argument was never about who minted the id.
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
  ([ADR 14](../adr/0014-pagination-by-domain-position.md)), and may be narrowed to one subject, to a set of kinds, or both.
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
- **A host may listen** (added 2026-09-20). The ports take an optional observer that core tells
  each action once the transaction that appended it has committed — never before, and never one
  that rolled back, so what the observer hears is exactly what the log holds. What it does with
  an action is the host's business; core keeps no log of its own beyond the store's, and never
  writes to a console, a file or a socket.
- The log is operational state rather than the user's material, so it is not mirrored
  ([mirror.md](mirror.md)) and a pool rebuilt from its mirror has no history.

### Intake and sync

- Every intake path produces the same capture envelope regardless of origin, carrying a typed
  payload, the source, the source's own identifier, the capture time, and any tags the source
  already knows about. **Source-supplied tags are attributed to that source** (decided
  2026-08-04), so importing from an already-classified system does not lose its classification.
- **A source is discovered, never declared** (decided 2026-08-08, tightened 2026-09-09). Any
  source id is accepted at capture, and capturing under one is the whole of what brings it into
  existence: the sources that exist are read back off the items themselves. Registration gated
  nothing an open client could not spell, and refusing a capture for a paperwork reason is the
  wrong trade for a tool whose first job is that capture always works. The accepted cost: a
  typo'd source id mints a parallel identity rather than being caught, which shows up in
  attribution.
- **A source carries no policy yet, and the policy it will carry is the pool's**
  ([ADR 43](../adr/0043-config-holds-what-an-install-is.md)). The registry that once declared
  one lived in configuration and held `autoRequest`, which nothing read, so it went with the
  other blocks a file could not usefully change. When enrichment exists, per-source policy lands
  as pool state on the destinations' pattern — with the difference that matters: there is no
  create, because a surface attaching policy lists what has already captured.
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
  core evaluates rules. *Clarified 2026-08-17*: a **destination is not configuration** and never
  was, really — it is state a person creates, a record refers to and a rebuild restores, so it is
  the pool's ([ADR 20](../adr/0020-destinations-are-pool-state.md)). *Narrowed 2026-09-09*: what
  the host reads is what an **install** is — paths, addresses, cadences, limits, and the accounts
  that carry a password ([ADR 43](../adr/0043-config-holds-what-an-install-is.md)). What it still
  hands core beyond those is the retry policy, the sweep's grace, the trigger window, the capture
  zone, and the **payload types**, which are core's own constant rather than anything a file
  decides.
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
  nothing else itself. **Closing twice is not an error** (amended 2026-08-18): a host sent the
  same signal twice, or closing on an error path and again on the way out, is stating what it
  already stated, and a port that declares `close()` answers a repeat rather than throwing.
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
- **No authentication in core**, which was written as "no authentication for now" on 2026-08-02
  and meant both things while they were the same thing. They are not since 2026-08-31: the daemon
  authenticates and core does not, gaining no user, no credential and no notion that a request has
  an author ([ADR 27](../adr/0027-the-daemon-authenticates-and-core-does-not.md)).
- Everything that leaves the pool carries identity and provenance, per
  [standards.md](../standards.md) — **where the destination writes it, and in that document's own
  words wherever it does** (narrowed 2026-09-08). A
  markdown kind can be told to write no frontmatter, as a setting on the destination and as an
  argument on one capture, and a note written that way carries no id, no capture time and no
  `derived_from`. The pool still holds all of it, and the routing record still says where the note
  went; what is given up is the file being traceable on its own. Absent means none, so a
  destination that never said writes none. **Tags are a second switch beside it** (added
  2026-09-10), on the same terms: among the frontmatter, as `#tag` at the foot of the note, or
  nowhere. They are not provenance — `standards.md`'s vocabulary does not name them — so where they
  go is a question about a vault's own conventions rather than about traceability, and a note
  carrying them in its body carries none of them in a block it is also writing. Local-only is the default for every provider; anything
  that sends content off-box is opt-in and named on the item.

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
  surface gets the order its job requires. *Its key clause is superseded by
  [ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md)*: both surfaces now sort by
  capture time, and the queue's job is done by its filter rather than by a second key.
- **[In-place amendment of the head](../adr/0011-in-place-amendment-of-the-head.md)** — starting
  a new thought ends the previous one; no timer. *Superseded by
  [ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md)*: what seals a capture is a
  decision about that capture, not the arrival of an unrelated one.
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
- **[An item is editable until it is
  processed](../adr/0021-an-item-is-editable-until-it-is-processed.md)** — immutability is owed to
  the copy that left, so nothing but routing, archiving or being revised fixes a capture. A
  revision stops being a version of an item and becomes an ordinary capture holding a trace, which
  removes the feed tie, the revision chain and the head rule together. Supersedes ADR 11 and ADR
  10's key clause.

---

## Open questions

- [ ] 2026-08-02 — The routing-rule table: how rules are expressed, how fan-out to several
      destinations is presented, and whether a rule may ever be trusted to fire unattended.
      *Half closed 2026-09-07*: the last part is answered, and answered by not needing a rule. A
      **routing template** holds the decision and a trigger tag applies it, so a saved decision
      fires unattended because a person applied it — no condition is evaluated and nothing watches
      the pool ([ADR 34](../adr/0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md)).
      What is still open is the table itself: **conditions** — a rule that fires on what an item
      *is* rather than on a gesture — **fan-out** to several destinations from one gesture, which
      also reopens what *cancel* means when one of two has landed, and **precedence** between rules
      that both match.
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
      would answer this and several conversion questions in `todo.md` at once.
      *Noted 2026-09-07*: a **routing template** answers it for the person who configured one —
      `research/{{captured_at}}.md` is a filename they chose, expanded per item — but that is an
      answer somebody had to write down. The general case, for a capture nobody has configured a
      template for, is still a title nobody has.
- [ ] 2026-08-13 — Whether a capability may declare itself idempotent, and so opt into retrying a
      delivery whose outcome is unknown. ADR 17 abandons those deliberately, being conservative for
      adapters that can promise nothing. A content-addressed store or an API taking an idempotency
      key could promise more.
- [ ] 2026-08-11 — Action log retention: whether entries expire at all, and whether expiry is per
      kind. [ADR 12](../adr/0012-core-keeps-an-append-only-action-log.md) left it to be decided
      when the log's size becomes noticeable in practice. Nothing prunes it today, and the only
      way to shrink it is the clear operation, which is a decision rather than a policy.
- [x] 2026-08-08, closed 2026-08-24 — How a revision is ordered against its original in the feed.
      The question existed because a revision carried its original's capture time, so the two tied
      and the tie had to be broken by the revision link; the driver answered it by denormalising
      `root_id` and `revision_depth` into the feed key, which this spec never recorded. Both the
      question and that answer are gone: a revision carries its own capture time and ties with
      nothing, so `(created_at, id)` is a total order again and the chain columns come out.

---

## Acceptance criteria

- A capture submitted twice with the same client-generated id produces exactly one item.
- A capture whose source reports a capture time three days old appears at its chronological
  position in the feed, not at the position its arrival would give it.
- Editing an unprocessed item changes it in place and creates no revision, however old the item
  is and whatever has been captured since. Its position in the queue does not change.
- Editing a processed item appends a revision: an item with its own id, its own capture time of
  now and its own source identity, appearing at the newest end of the feed and in the queue, while
  the item it came from stays readable and unchanged where it was.
- Editing that same processed item a second time appends a second revision. Both name it, it names
  both, and neither is treated as the current one.
- An edit resent after a lost response answers with the revision it already made, and the pool
  holds one revision rather than two.
- An item that has been routed no longer appears in the queue and still appears in the feed,
  with a record of where it went.
- An item routed to two destinations carries two routing records.
- An item read from the feed says how many records it holds, how many are pending, and where they
  went; one that has been nowhere says nothing at all, and one whose last reservation was
  cancelled says nothing again.
- The tags in use name every tag the pool carries, counting an archived item and a revised one
  alike, and drop a tag the last item carrying it lost.
- Tagging an item that has been routed and revised succeeds, and the tag does not appear on the
  revision.
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
- Editing a routed item produces a revision that carries its tags with their attribution, carries
  none of its routing records or archive state, and appears in the queue; the item it came from
  keeps its routing records and stays out of the queue.
- Cancelling the only delivery of an item that has not been revised returns it to the queue and
  makes it editable in place again. Doing the same to an item that has been revised returns it to
  neither.
- Accepting a tag on an item does not change its position in the queue.
- Purging an item removes that item alone, its assets where unreferenced, and its mirror files; a
  client that had cached it learns it is gone on its next sync. A revision made from it survives,
  in the queue, its `revisionOf` naming a tombstone.
- Purging an item that has been routed or revised exposes, before proceeding, the destinations it
  reached and the revisions made from it. The warning itself is the host's; core's obligation is
  that both are on the item without asking for them.
- An archived item can be unarchived, and returns to the queue at its original position.
- The queue read newest first answers the same items as oldest first, in the opposite order, and a
  position taken from one continues the other from the same place.
- A pool rebuilt from its mirror and assets is equivalent to the original: same items, same
  order, same classification, same artifacts and corrections, same routing records.
- Deleting or editing a mirror text file leaves the pool unaffected.
- Editing a blob outside notemap is reported as a change rather than passing unnoticed.
- An upload under an id the pool already holds answers that asset where its content, filename and
  media type agree, and is refused where any of them does not.
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
- A template saved with a pattern naming a field or a format nobody declared is refused when it is
  saved, and one that saved expands against every item without a second refusal.
- Two templates cannot claim the same trigger tag, and neither can claim one outside `route/`.
- Repointing an established template at another destination leaves it unestablished, so its next
  delivery makes the folder rather than requiring one that was never there.
- Deleting a destination a template names goes through and says which templates it stranded;
  deleting one a routing record names is still refused.
- A template applied to a capture made at 22:32 with an offset of two hours files it under that
  day, and one made with no offset at all files it under the day the host's fallback zone was in.
- Tagging an item with a trigger tag leaves it holding the tag and one pending reservation, or
  holding neither: there is no state in which it carries the tag and nothing is coming.
- Nothing is handed to the destination while the window is open, and the delivery becomes claimable
  only once it has passed.
- Untagging a trigger tag whose record still stands is refused, and the item still carries it;
  the same call after the record is cancelled succeeds. Tagging with a trigger tag whose template
  already has a record on the item applies the tag and reserves nothing further.
- Cancelling inside the window removes the reservation, removes the trigger tag, and returns the
  item to the queue; a first attempt that is abandoned does the same. A delivery that landed keeps
  the tag.
- The same template taken by hand in a composer takes its trigger tag off the item when its
  delivery is cancelled, as a tag-fired one does — including where the item wore that tag before
  the template existed, which fires nothing and means nothing until a decision gives it a meaning.
- A trigger tag whose template names a destination that was deleted or retired is refused, and the
  item is left carrying neither the tag nor a record. The same tag on a capture is dropped and the
  capture stands.
- An `establish` template creates its folder on the first delivery that lands and requires it after;
  editing its arguments makes it establish again.
- A capability whose place field is called anything at all is folder-checked, and one that marks no
  path field is not checked rather than checked against nothing.
- A template against a destination with no folders and a fixed set of places saves, expands the
  patterns in the fields that have them, leaves the fixed value untouched, routes and fires from a
  trigger tag, with no change to core.
- A file that is still being written is not ingested until it is complete.
- Core can be instantiated twice over two different pools in one process without interference.
