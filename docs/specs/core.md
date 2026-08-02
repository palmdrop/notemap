# Spec: Core

**Status**: Draft
**Last updated**: 2026-08-02
**Shipped**:

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
- **Enrichment** — the job model, suggestions and artifacts, ratification, per-source
  auto-request policy. Ports defined; **no providers wired**.
- **Routing** — the destination port, the append-only routing log, and a filesystem
  destination including its append-to-an-existing-file form.
- **The mirror** — lossless write-only mirroring, and rebuild of a pool from mirror + assets.
  On-disk format: [mirror.md](mirror.md).
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
  and superseded items.
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
  ratification change an item's state in place and never produce a revision.
- Editing an item **appends a revision**: a new item linked to the one it replaces, carrying
  the original capture time plus the time of the edit.
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
- The single exception is **amendment of the head**: the newest item in the feed may be edited
  in place while it is still unprocessed. **Only a capture that becomes the new head seals
  it** — intake placed earlier in the feed by its source time, such as a file import or an
  offline sync, does not. There is no timeout.
- A client may freely amend or discard a capture that core has not yet accepted. Immutability
  begins at the pool. Once a capture has been handed over for delivery it must be treated as
  accepted, even before a response arrives.
- Where a client cannot know whether it still holds the head, its in-place edit is
  re-evaluated on arrival and recorded as a revision if the item is no longer the head.
- Amending or revising an item invalidates the enrichment attached to the old content, which
  becomes eligible to run again.

### Classification

- The only axis of classification is **tags**: free text, with namespacing as convention
  (`project/fiction-a`, `kind/quote`) rather than structure.
- There is no item type and no project entity. Payload type is mechanical, derived from what
  arrived, and is not classification.
- Every tag records **which agent added it** — a person, or the named provider whose suggestion
  was accepted.
- Classifying an item does not remove it from the queue.

### Archive and purge

- **Archiving** hides an item from the queue without deleting it. The item stays in the feed and
  remains fully processable from the archive; archiving is a filter, not a terminus.
- Archiving is always an explicit decision, and may carry a reason.
- **Purge** is the only destructive operation. It removes the item, its entire revision chain,
  its enrichment, its routing records, its mirror files and its assets — an asset only when no
  remaining item references it.
- Purge leaves a record of the identity and time of the deletion, and nothing else, so that
  anything holding a copy learns it is gone. That record is itself removed after a retention
  window.
- Purge does not reach material already delivered to a destination. Where routing records
  exist, the user is told specifically what may still exist elsewhere before the purge
  proceeds.

### The queue

- The queue presents items that are unprocessed, unarchived and not superseded, oldest first,
  ordered by last touch so that a revised item resurfaces where it will be encountered.
- **Last touch means content time**: the revision or amendment time where one exists
  (`content_updated_at`), the capture time otherwise (`created_at`). Classification, routing,
  archiving and enrichment never move an item in the queue.
- A third timestamp, `modified_at`, records the last change of any kind — content or state —
  and exists for sync delta reads only ([sync.md](sync.md)). It never affects ordering.
- An item is **processed** when it has been routed or archived. Being **marked processed by
  hand** — the user carried its content onward themselves — is routing: it appends a routing
  record whose destination is the user, with an optional note of where it went. Passing over
  an item changes nothing and is a skip.
- Core holds no position in the queue. Reads are ordered and paginated; where processing has
  got to is the caller's concern.

### Enrichment

- Enrichment produces **suggestions** — proposals that mean nothing until accepted or rejected —
  and **artifacts**, durable outputs such as a transcript that stand on their own and are never
  ratified. Correcting an artifact is not an edit of the capture and produces no revision.
- Enrichment never mutates a capture. Its output sits beside the item, attributed to the agent
  that produced it.
- **Accepting a suggestion writes real state carrying its attribution.** Rejecting one is
  recorded, because a rejection is the only signal distinguishing a suggester that is wrong from
  one that is ignored.
- Removing an accepted tag deletes it. A later re-suggestion arrives as a new pending
  suggestion rather than silently reappearing.
- Each enrichment step declares what it needs. A step runs when its needs are satisfied, and its
  state is always one of: **unavailable** (no provider configured), **not applicable** (not
  requested, or its inputs will never exist), **pending**, **running**, **failed** or **done**.
  These are distinguishable from outside, so a client can always say whether anything is coming.
- Whether a step runs automatically or must be requested is policy configured **per intake
  source** — a recording from a voice-memo source may transcribe automatically while an
  arbitrary uploaded file requires an explicit request.
- Enrichment may be re-run at any time and is never destructive: a new artifact appears beside
  the old one, attributed to its own producer.
- An item is fully processable while enrichment is pending, unavailable or failed. Capture never
  waits on enrichment.
- Work in progress survives a crash: an interrupted step becomes eligible again rather than
  being lost or duplicated.

### Routing

- **Routing delivers a copy.** The item stays in the feed; nothing is moved or emptied.
- An item may be routed more than once and to more than one destination. Each delivery appends
  a record of the destination, the time, and a best-effort pointer to where it landed.
- A pointer may become stale. It records where an item once went, not a guarantee of where it
  is.
- A destination declares which payload types it accepts and which verbs it supports for each —
  creating a new entity, appending into an existing one, or placing a file. Invalid combinations
  are refused rather than approximated.
- Routing requires the destination to be reachable and may fail; a failed delivery leaves no
  routing record.
- Rules may propose a destination from an item's tags, but **a rule never delivers on its own**.
  Delivery is always a decision.

### The mirror

- Every capture is written to disk as a plain text file with its metadata, and never read back
  during normal operation.
- The mirror is **lossless**: a pool can be rebuilt from the mirror and the assets alone. This
  is the only circumstance in which the mirror is read.
- The mirror carries captures, classification, **artifacts and their corrections** — the
  original transcript and the corrected one both — and routing records. It does not carry
  pending suggestions, which are regenerable by definition.
- The on-disk layout and file formats are specified in [mirror.md](mirror.md).
- **Media is stored once.** Both the pool and the mirror reference the same asset, named for a
  human rather than for its contents. Core records each asset's content hash so that a change
  made outside notemap is detected and reported rather than silently absorbed.
- Reading media is the single exception to never reading the mirror's storage area. Text and
  state are never read back.
- An external tool editing or deleting mirror text cannot corrupt the pool.

### Intake and sync

- Every intake path produces the same capture envelope regardless of origin, carrying a typed
  payload, the source, the source's own identifier, and the capture time.
- A capture is identified by an id the client generates, so submitting the same capture twice
  has no additional effect.
- Core's obligations to offline clients are idempotent operations and client-generated ids.
  The sync protocol — outbox replay, conflict resolution, delta reads, tombstones — is
  specified in [sync.md](sync.md).
- Intake must not accept a partially written file. A file source waits for the file to be
  complete before it becomes a capture.

---

## Constraints

- **TypeScript on Node, with pnpm workspaces** (decided 2026-08-02): core, adapters and each
  host are separate packages, so the dependency direction of
  [ADR 8](../adr/0008-adapters-are-in-process-and-wired-by-the-host.md) is enforced by tooling
  — core's package has no dependencies and no Node types, and `import fs` fails typecheck
  rather than review. A future port to Rust is deliberately kept open, so the
  domain layer avoids constructs that would not survive one: explicit state modelling, narrow
  interfaces, schema in migrations rather than inferred from types.
- **Core takes no framework or runtime dependency.** No HTTP, no timers, no configuration
  sourcing, no filesystem or network access. Storage, mirroring, asset storage, the clock,
  providers and destinations are all ports.
- **Core takes configuration as data but never sources it.** The host reads config and secrets;
  core evaluates rules.
- **Core is instantiated per pool, never global.** No module-level state, no ambient
  configuration, no singleton connection.
- **The host wires adapters.** Core imports no adapter. Calls are in-process; there is no IPC.
- Repository layout separates the domain, the adapters and the hosts.
- **A pool lives on a local filesystem, never on a network share.** Concurrent hosts are made
  safe by leasing work, not by forbidding it.
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
  lossless write-only mirror buys ownership without reconciliation.
- **[Core is a host-agnostic library](../adr/0002-core-is-a-host-agnostic-library.md)** — the
  daemon is one host, not the architecture. The seam is nearly free now and expensive later.
- **[Clients hold an outbox; pools do not replicate](../adr/0003-clients-hold-an-outbox-pools-do-not-replicate.md)**
  — the real axis is reachability, not connectivity. Immutable id-addressed captures make
  offline sync need no merge.
- **[Purge leaves a minimal tombstone](../adr/0004-purge-leaves-a-minimal-tombstone.md)** — a
  delete that silently doesn't is the worst property a delete can have.
- **[TypeScript now, Rust later](../adr/0005-typescript-now-rust-later.md)** — iteration cost
  dominates while the model churns; Rust would exclude only JS hosts, and only as owners.
- **[Suggestions and artifacts](../adr/0006-enrichment-splits-into-suggestions-and-artifacts.md)**
  — only one of the two is ratifiable, and ratification must not discard provenance.
- **[Steps declare their needs](../adr/0007-enrichment-steps-declare-their-needs.md)** — one
  mechanism covers unconfigured providers, opt-in steps and unmet inputs, and keeps item status
  answerable.
- **[Adapters are in-process, wired by the host](../adr/0008-adapters-are-in-process-and-wired-by-the-host.md)**
  — direct calls, but the dependency points inward so core stays portable.
- **[Versioned API, mutable until the first real pool](../adr/0009-versioned-api-mutable-until-first-real-pool.md)**
  — the freeze is triggered by a checkable event, not by a feeling.
- **[Feed and queue sort differently](../adr/0010-feed-and-queue-sort-differently.md)** — each
  surface gets the order its job requires.
- **[In-place amendment of the head](../adr/0011-in-place-amendment-of-the-head.md)** — starting
  a new thought ends the previous one; no timer.

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
      probably differs per destination.
- [ ] 2026-08-02 — Multiple pools per user, and multi-user operation. Nothing decided forecloses
      either; neither is designed.

---

## Acceptance criteria

- A capture submitted twice with the same client-generated id produces exactly one item.
- A capture whose source reports a capture time three days old appears at that position in the
  feed, not at the end.
- Editing a non-head item leaves the original readable in the feed and excludes it from the
  queue; the revision appears in the queue.
- Editing the head while unprocessed changes it in place and creates no revision. Capturing a
  new head first causes the same edit to produce a revision instead; an intake whose capture
  time places it earlier in the feed seals nothing.
- An item that has been routed no longer appears in the queue and still appears in the feed,
  with a record of where it went.
- An item routed to two destinations carries two routing records.
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
- Purging an item that has been routed warns, before proceeding, about the specific
  destinations it reached.
- A pool rebuilt from its mirror and assets is equivalent to the original: same items, same
  order, same classification, same artifacts and corrections, same routing records.
- Deleting or editing a mirror text file leaves the pool unaffected.
- Editing an asset outside notemap is reported as a change rather than passing unnoticed.
- With no providers configured, every enrichment step reports unavailable, and items remain
  fully classifiable, archivable and routable.
- An enrichment step interrupted mid-run becomes eligible again and does not produce a duplicate
  artifact.
- Accepting a suggested tag produces a tag attributed to the provider that suggested it;
  removing that tag and re-running enrichment produces a new pending suggestion rather than
  restoring the tag.
- A destination refuses a payload type it does not declare support for, rather than delivering
  an approximation.
- A file that is still being written is not ingested until it is complete.
- Core can be instantiated twice over two different pools in one process without interference.
