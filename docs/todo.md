# Developer TODOs
- [ ] fix minor UI issues
  - Immediately hiding a routed item from the queue is confusing, especially if it fails. There's no good way to see pending operations. 

- [ ] add new UI views
    - routing view, showing all routed items. Can be implemented as a filter on the log view rather than a page of its own

- [ ] Workflow publishes a docker image for each commit, not just each release. Might not be necessary? Investigate

- [ ] Consider collapsing some UI actions: "Route", "Archive", "mark done" (maybe even "Copy") could all become "Process". Pressing process opens the routing composer, which would become a "Processing composer". Processing could be routing using a configured destination, but also be archiving or marking done, or copying manually (which would then result in an automatic "mark done")
  - Designed 2026-09-05 and specified across [shell.md](specs/shell.md#one-way-out-of-the-queue)
    and `CONTEXT.md`; built by [one-way-to-process](plans/one-way-to-process.md). `copy` stayed
    out: it is not a way out of the queue, and copying is *offered* inside `manual` rather than
    marking processed on its own. The two words are `manual` and `discard`.

- [ ] Destination configuration is way too clunky, not sensible to configure in BOTH config.toml and in the UI.

- [x] "Checks" in the settings page against DAEMON and destinations should be done automatically. Also, destination checks only shows if the adapter is reachable, not the destination itself. Would be great with a way to check if the destination is correctly configured before trying to route to it.

- [ ] Consider full POC: inbox via Memos app, routing to complex obsidian project. The "advertise
  folders" half closed 2026-08-31: the destination port can be asked what an argument could hold
  ([ADR 26](adr/0026-a-destination-can-be-asked-what-an-argument-could-hold.md)), and the
  filesystem kind answers it for `create-file` and `append-to-file`. Still open: **custom tags that
  exist for auto-routing** — the port can now answer this too, since a vault's tags are just another
  field's candidates, but no kind implements it, obsidian tags being read from the notes themselves
  rather than declared anywhere a filesystem adapter can see.
- [x] Consider allowing in-place edits to notes IF they have not been routed. Settled 2026-08-24 in
  [ADR 21](adr/0021-an-item-is-editable-until-it-is-processed.md), one clause wider than this line
  asked for: an item is editable while it is **unprocessed**, which is routed, archived or revised.
  A revision stopped being a version of an item and became an ordinary capture holding a trace.
  Specified across core.md, http-v1.md, client.md, sync.md, mirror.md and shell.md, and built on
  2026-08-24 ([plan](plans/editable-until-processed.md)).
- [ ] **Nothing in the shell can ask for a revision.** Editing is offered on the queue, which holds
  unprocessed items only, and the feed offers no edit at all — so the revision path is reachable
  only when another device processes an item between the draw and the send. Either the feed row
  grows an edit, or rewriting a processed note is deliberately not a thing this shell does and
  shell.md should keep saying so. Raised reviewing
  [editable-until-processed](plans/editable-until-processed.md).
- [x] Routing arguments - more detailed routing within a destination. The mechanism already exists: a capability's `argumentsSchema` is a JSON Schema the adapter publishes and core validates, so an adapter wanting a template name, a format, a column or a priority just declares one. What is left is making those schemas good enough to build a form from - titles, descriptions, defaults, enums - and saying so in the spec, so adapters bother.
  - This has a caller now. The routing composer builds the arguments step from `argumentsSchema`,
    so a schema with nothing in it renders as unlabelled text inputs; an enum would render as the
    same marked-option idiom the `where` and `do` steps already use.
  - Closed 2026-08-31: titles and descriptions landed on every argument field of both kinds (phase 4
    of [destination-targets](plans/destination-targets.md), which also renamed `targetSchema` to
    `argumentsSchema`). What would have been a static `enum` is answered dynamically instead — a
    destination is asked what a field could hold
    ([ADR 26](adr/0026-a-destination-can-be-asked-what-an-argument-could-hold.md)) — and the
    composer draws it through exactly the marked-option idiom this line predicted.
- [ ] A schema field's **default** is not drawn. Titles, descriptions and dynamic candidates landed
  2026-08-31; a `default` an adapter declares is still ignored by the composer, which starts every
  field empty. Split off the routing-arguments line above rather than left ticked inside it.
- [ ] Conversion - changing or formatting an item on routing, for example, making an item a piece of a TODO list. Called conversion rather than a routing template since 2026-09-05: a **routing template** is now a saved routing decision, and the two were sharing a word.
  - AI conversions, where a local model formats an entry that may or may not be properly formatted
  - Shape settled in [ADR 19](adr/0019-a-destination-converts-and-the-delivery-records-what-went.md): the destination converts a copy, the work happens inside the delivery, and the bytes that landed come back to be stored on the routing record. Open: whether a conversion is configured in the delivery's arguments or in destination config, and whether one is itself a thing a person edits.
- [ ] Routing edits - being able to freely edit an item as it is routed. Settled: **amend, then route**, two operations that already exist - a frontend can make it one smooth gesture with no new architecture. Rewriting the capture _because of where it is going_ is a dead end, and ADR 19 records why so it does not get proposed again. Open no longer, as of 2026-08-24: the amendment stands, because it was an amendment of an
  unprocessed item and the routing that sealed it never landed. Cancelling the reservation removes
  it, so the item is unprocessed again and editable in place again — unless something was revised
  from it meanwhile, which seals it for good, since rewriting it would leave that revision's trace
  naming content which never produced it
  ([ADR 21](adr/0021-an-item-is-editable-until-it-is-processed.md)).
- [ ] Routing auto-processing - routing a note to a specific destination converts it to a specified format. A todo list, a prose paragraph, a markdown image link, whatever. The format could be a templating language, or natural language, with an LLM in the loop, or a mix. ADR 19 answers _where the work happens_, and the **preview** half is now closed: the destination port has `preview`, the composer asks for one on demand, and a delivery records the output it produced so what went is readable after the fact
  ([delivery-output-and-preview](plans/delivery-output-and-preview.md),
  [ADR 33](adr/0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md)). What is
  left is the conversion itself — how a conversion is configured, and what a model in the loop
  costs — and it has the seam it will use: a kind converts inside `deliver`, answers the same
  output from `preview`, and a conversion that loses something says so in a note nobody parses.
  The repeatability worry this line carried is answered rather than solved: a preview is
  **indicative**, so a non-deterministic converter is allowed and the shell says what a preview is.
- [ ] Routing rules - core.md has carried "how rules are expressed, how fan-out to several destinations is presented, and whether a rule may ever be trusted to fire unattended" since 2026-08-02. Half answered on 2026-09-05 by [ADR 34](adr/0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md) and the [routing-templates plan](plans/routing-templates.md): a **routing template** is what a rule would have had for a right-hand side, a **trigger tag** applies one, and the sentence about a rule never delivering on its own was rewritten deliberately rather than discovered later. Still open, and only reachable once conditions exist: the rule table itself, fan-out to several destinations from one gesture, and precedence between rules.
- [ ] Reconsider where revisions *appear*. Half-answered on 2026-08-24: a revision now carries its
  own capture time, so it sorts at the moment it was written and no longer ties with what it came
  from — which is what removed the chain columns from the feed key. Showing it beside its ancestor
  is therefore a client-side grouping on `revisionOf`, best-effort across page boundaries, and no
  longer something the pool can do for a surface. Still open: whether the shell does that grouping
  by default, and whether ordering the queue by last touch comes back as a **reader's option** now
  that it is no longer the key.
- [ ] Verify and repair reach destination records. The mirror carries them
  ([ADR 20](adr/0020-destinations-are-pool-state.md)), but neither verify nor repair exists to
  reach anything, so a mirror holding a stale or missing destination record has nothing that would
  notice. Whoever builds them builds this at the same time.
- [ ] Consider capture templates: on capture time, I select a capture format which auto-tags and auto-routes (optionally) the finished capture when it is committed.
- [ ] Certain feed views allow me to view all revisions, all entries, open to see
- [ ] Consider redis for jobs in the future. Move the jobs managed out of the store port, let it be its own. Could be a piece of the store db, could be external. (Feel like I reimplement a lot of tried and tested things here.
  - same for pool/work, all the jobs management. Is there existing tools we could use for this instead?
- [ ] Allow a user to have multiple pools? Use case: I route some captures to another pool, where I do more granular routing.
- [ ] When purge lands: `GET /v1/items/:id/routing` reads the item and then its records, two reads on two connection states, so an item purged between them answers `200 {"values":[]}` — the claim about an item the existence check is there to avoid. Either one core method answering both, or the route accepting the window deliberately.
- [x] The client's store is write-only, so offline is a promise nothing keeps. Closed 2026-08-25:
  `ClientStore` answers for every collection the client holds, an IndexedDB adapter backs it, the
  web shell wires it, and `createClient` reads it back before anything may touch what it read. It
  drains on boot, and a refusal of an operation with no reversal left to run is settled by
  re-reading the item ([ADR 24](adr/0024-a-refusal-after-a-restart-is-settled-from-the-pool.md),
  [plan](plans/durable-offline-client.md)). What the surfaces draw is still the pool's pages
  rather than the cache's.
- [x] Routing state reaches the client. Shipped in b42eeb9 as a **routing summary** on every item:
  how many records, how many still pending, and the distinct places they name, derived rather than
  stored and absent where an item has been nowhere. The feed says `routed` and names where from the
  row it already has — `FeedRow.svelte` renders the summary, and both `Feed.test.ts` and
  `Queue.test.ts` assert that no `GET /v1/items/:id/routing` is issued per row. A record's
  capability, target and pointer stay per-item and are read when a row is opened
  (`QueueRow.svelte`), which was the design rather than a gap: they are an item's detail, not a
  row's. Decided 2026-08-20 to carry it rather than work around it, and that is what happened.
- [x] `GET /v1/tags` — the tag chooser has nothing to choose from. No route reads the tags in use,
  so the shell offers free entry into a control already shaped to take suggestions. Wants a core
  read, the route, and a client cache. Open: whether it carries counts, which is the difference
  between a chooser and a tag manager; and whether it answers for the whole pool or for a surface.
- [x] Nothing can enumerate a destination's targets. Capabilities are already dynamic — `describe()`
  answers them live and the composer draws whatever comes back — but the target half is not:
  `describe()` returns a `targetSchema` and that is the whole vocabulary, so nothing can offer a
  folder tree, a board column, or an existing note to append to. Either the adapter publishes an
  enum it refreshes at describe time, or the destination port gains a method for asking. **This is
  the same seam preview needs** (above), so design the two together or it gets built twice.
  - Closed 2026-08-31: the destination port gained `candidates`, asked about a field rather than a
    path so a board's columns and a vault's tags answer the same question a filesystem's folders do
    ([ADR 26](adr/0026-a-destination-can-be-asked-what-an-argument-could-hold.md),
    [destination-targets](plans/destination-targets.md)). Preview did not, in the end, share the
    seam this line predicted — see above.
- [ ] Nothing reclaims a blob no asset ever named. **Whatever closes this must not take an
  output**: a delivery's output is a blob named by a routing record rather than by an asset, so a
  reclaim that reasons from the `assets` table alone would delete the evidence of what was sent
  (2026-09-04). An output also *adds* to what this entry owes: the blob is written before the
  transaction that names it, so a route refused as `item-purged` after a delivery landed, or a
  completion whose lease was lost, leaves one behind. That is an ordinary path rather than the
  crash the upload case describes. The store already withholds one from the sweep's release path; a reclaim that
  walks the blob store instead has to ask the same question. The sweep enumerates the `assets` table, so a
  blob written by an upload that never minted a row — a crash between the two, or a refused
  `asset-id-conflict` — is permanent, where every other kind of debris is eventually taken. Both
  [core.md](specs/core.md) and [ADR 22](adr/0022-the-uploader-mints-the-asset-id.md) park this on
  deep verify, which does not exist. The narrow version is a sweep over the blob store dropping
  hashes no asset names, behind the same grace window the asset sweep already uses for the same
  reason. Raised reviewing [client-minted assets](plans/client-minted-assets-and-health.md), where
  a refused upload made this reachable rather than only a crash window.
- [ ] The sweep deletes a blob after its transaction commits, and the other order would be worse
  — but an upload of that same content committing in the window between the two ends up naming a
  file the sweep then deletes, so an asset that landed reads `blob-missing`. Pre-existing and
  unrelated to who mints the id; found reviewing
  [client-minted assets](plans/client-minted-assets-and-health.md). Wants either a delete that
  re-checks the asset table under the write lock, or a grace on the blob as well as the asset.
- [ ] **Nothing bounds a surface that is being drawn.** The client's cache caps feed history at 500
  items, but exempts everything a page currently holds — and a page accumulates ids as it is walked
  and nothing trims it, so a long feed session holds every row it paged and the cap does not reach
  it ([client.md](specs/client.md#what-the-cache-keeps)). The exemption itself is right: eviction
  goes oldest-touched-first, the feed is read newest-first, so the rows at risk are exactly the ones
  a deep scroll is looking at. What is missing is an answer for a surface that outgrows the cache —
  a windowed page that drops what is far from the reader and re-reads it, or a cap on the page that
  the shell knows how to draw. Raised reviewing
  [the cache's readers](reviews/cache-with-readers-2026-08-26.md).
- [ ] The markdown renderer is unchosen, so a text capture shows its asterisks.
  [standards.md](standards.md) says a text payload is CommonMark; the shell's `Prose` primitive
  draws it verbatim behind the interface a renderer will sit in. A library choice, and the question
  it drags in with it: whether captured markdown is sanitised before rendering, since a capture can
  carry raw HTML and nothing between the field and the screen would stop it.
