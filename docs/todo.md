# Developer TODOs

## Shell — layout and interaction

- [ ] Add proper loading icons and states. Pay attention to layout shifting - avoid it.
- [ ] stale and premature UI state
  - No good way to see pending operations. A held row says `retrying` while it is
    looked at and the corner speaks when the delivery resolves, but nothing shows everything in
    flight at once. Belongs with the routing-record and log readability items below.

- [ ] batch processing, i.e selecting many captures and routing them all at once, or discarding
- [ ] command palette

- [ ] **Nothing bounds a surface that is being drawn.** The client's cache caps feed history at 500
  items, but exempts everything a page currently holds — and a page accumulates ids as it is walked
  and nothing trims it, so a long feed session holds every row it paged and the cap does not reach
  it ([client.md](specs/client.md#what-the-cache-keeps)). The exemption itself is right: eviction
  goes oldest-touched-first, the feed is read newest-first, so the rows at risk are exactly the ones
  a deep scroll is looking at. What is missing is an answer for a surface that outgrows the cache —
  a windowed page that drops what is far from the reader and re-reads it, or a cap on the page that
  the shell knows how to draw. Raised reviewing
  [the cache's readers](reviews/cache-with-readers-2026-08-26.md).

## Composer and capture

- [ ] Editing does not allow attaching anything. It is the edit surface rather than the
  row, and wants designing on its own. The composer's `rewrite` did not reach it (2026-09-10):
  that carries words for one delivery and touches neither the capture nor its assets, so editing
  still attaches nothing.
- [ ] Consider capture templates: on capture time, I select a capture format which auto-tags and auto-routes (optionally) the finished capture when it is committed.
  - Cheaper than it was, as of 2026-09-07: the auto-routing half is done. A capture that arrives
    carrying a **trigger tag** fires its template, so a capture template that auto-tags gets the
    routing for free and needs to decide nothing about delivery. What is left is the capture format
    itself — what a person picks at capture time and what it fills in — which is a shell question.

- [ ] picking folders in composer is strange and clunky, sometimes you have to click with mouse 
  - it is not clear how to go back or use the current folder
  - tabbing down the hierarchy has no effect on input field until you press "use <path>"
  - going back is not clearly a button

- [ ] consider source to destination auto routing: for example, I might have an inbox that I *always* want routed to a specific destination, using a template.

## Templates

- [ ] Add a way to append text, or insert {{templates}} INSIDE the output of a capture. Requires capture output.
- [ ] add way of picking a separate location for note and assets when using templates
- [ ] Whether a template may restrict who can fire it. A **source-supplied** trigger tag fires like
  any other, deliberately ([ADR 34](adr/0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md)):
  an inbox deciding where its own captures go is the point. What it costs is that a system outside
  notemap can cause a delivery. If that ever bites, the answer is a per-template restriction rather
  than a different design — noted here so it is reached for rather than reinvented.
- [ ] Whether the trigger window wants to be per template rather than per host. It is one number in
  `config.toml` today, which is right while every template files to the same laptop; a template
  whose destination is a mounted vault and one whose destination is a sleeping server want
  different windows for the same reason they want different retries. Not worth splitting until
  somebody has lived with one number and found it wrong in both directions.

## Seeing what happened — log, routing records, revisions

- [ ] **Nothing in the shell can ask for a revision.** Editing is offered on the queue, which holds
  unprocessed items only, and the feed offers no edit at all — so the revision path is reachable
  only when another device processes an item between the draw and the send. Either the feed row
  grows an edit, or rewriting a processed note is deliberately not a thing this shell does and
  shell.md should keep saying so. Raised reviewing
  [editable-until-processed](plans/editable-until-processed.md). The composer's `rewrite` did not
  reach it (2026-09-10): it changes what one delivery says and never what the item says, so it
  makes no revision and nothing in the shell can still ask for one.
- [ ] Reconsider where revisions *appear*. Half-answered on 2026-08-24: a revision now carries its
  own capture time, so it sorts at the moment it was written and no longer ties with what it came
  from — which is what removed the chain columns from the feed key. Showing it beside its ancestor
  is therefore a client-side grouping on `revisionOf`, best-effort across page boundaries, and no
  longer something the pool can do for a surface. Still open: whether the shell does that grouping
  by default, and whether ordering the queue by last touch comes back as a **reader's option** now
  that it is no longer the key.

## The client

- [ ] **rxjs is most of every shell's bundle.** The client imports the `rxjs` root barrel, which
  resolves to the CJS build and so cannot be tree-shaken: 279KB across 446 modules, 59% of a 472KB
  bundle, for the handful of operators `client.ts` and `reachability` actually use
  (`distinctUntilChanged`, `filter`, `map`, `skip`). It costs about 7ms of module evaluation per
  process start, which is why it is not urgent — but it is the single largest thing every shell
  carries, and a short-lived process pays it on every launch rather than once per session. Measured
  2026-09-16 while deciding whether the Raycast extension should run a whole client
  ([plan](plans/client-store-on-a-filesystem.md)); it affects the web shell the same way. Worth
  checking what deep imports cost before assuming they are the answer — the observable seam is one
  file, and whether the client needs rxjs at all is the bigger question underneath.

## Configuration

- [ ] Destination configuration is way too clunky, not sensible to configure in BOTH config.toml and in the UI.

## Routing — templates, rules, conversion

- [ ] Conversion - changing or formatting an item on routing, for example, making an item a piece of a TODO list. Called conversion rather than a routing template since 2026-09-05: a **routing template** is now a saved routing decision, and the two were sharing a word.
  - AI conversions, where a local model formats an entry that may or may not be properly formatted
  - Shape settled in [ADR 19](adr/0019-a-destination-converts-and-the-delivery-records-what-went.md): the destination converts a copy, the work happens inside the delivery, and the bytes that landed come back to be stored on the routing record. Narrowed 2026-09-10: the **hand-made** half is answered — a person's words are a first-class `content` field of the request, beside the arguments rather than inside them, because a path and a person's prose are not the same kind of thing and only one of them is a destination's to interpret ([ADR 45](adr/0045-a-delivery-may-carry-its-own-content.md)). Still open: where an **automatic** conversion is configured — a template, a destination, a model in the loop — and whether one is itself a thing a person edits.
- [ ] Routing auto-processing - routing a note to a specific destination converts it to a specified format. A todo list, a prose paragraph, a markdown image link, whatever. The format could be a templating language, or natural language, with an LLM in the loop, or a mix. ADR 19 answers _where the work happens_, and the **preview** half is now closed: the destination port has `preview`, the composer asks for one on demand, and a delivery records the output it produced so what went is readable after the fact
  ([delivery-output-and-preview](plans/delivery-output-and-preview.md),
  [ADR 33](adr/0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md)). What is
  left is the conversion itself — how a conversion is configured, and what a model in the loop
  costs — and it has the seam it will use: a kind converts inside `deliver`, answers the same
  output from `preview`, and a conversion that loses something says so in a note nobody parses.
  The repeatability worry this line carried is answered rather than solved: a preview is
  **indicative**, so a non-deterministic converter is allowed and the shell says what a preview is.
- [ ] Routing rules - core.md has carried "how rules are expressed, how fan-out to several destinations is presented, and whether a rule may ever be trusted to fire unattended" since 2026-08-02. Half answered on 2026-09-05 by [ADR 34](adr/0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md) and the [routing-templates plan](plans/routing-templates.md): a **routing template** is what a rule would have had for a right-hand side, a **trigger tag** applies one, and the sentence about a rule never delivering on its own was rewritten deliberately rather than discovered later. Still open, and only reachable once conditions exist: the rule table itself, fan-out to several destinations from one gesture, and precedence between rules.
  - Shipped 2026-09-07, and the half that is closed is closed in code as well as on paper: templates
    are pool state, a `route/` tag applies one, a fired one waits out a configured window so the
    corner's cancel is real, and a reservation a tag made that never delivered gives the tag back.
    What the three open parts now cost is clearer for having built the rest. **Fan-out** is the
    expensive one: one gesture reaching two destinations makes *cancel* a question about which of
    them, and [ADR 37](adr/0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md)
    answers only the single-destination case. **Conditions** need a place to be written and a
    vocabulary to be written in, neither of which exists. **Precedence** is only a question once two
    things can match, so it follows conditions rather than standing beside them.

## Output

## Destinations and adapters

- [ ] **The shell picks a browse control by destination kind name.**
  `apps/ui/src/lib/candidate-browsers.ts` maps `filesystem` and `webdav` to the typed line and
  everything else to the flat one, so a third filesystem-like kind needs a UI edit to get the tree —
  which is the shell knowing about particular destinations, the thing the adapter seam exists to
  prevent. Raised 2026-09-08 while making the flat browse typeable.

  Inferring it from the answer does not work: the line has to know **before the first answer** that
  values are `/`-separated, because the level-per-segment asks, the forecast and the `+ folder` for
  what is not there yet all read the path apart. That is a property of the field, not of what came
  back. So the fix is to let the schema say it — `x-notemap-candidates` carrying a shape
  (`"path"` | `"flat"`) rather than `true`, adapter-declared and core-uninterpreted, exactly as
  every other annotation is. It changes an annotation that has already shipped and that
  `docs/specs/shell.md` and [ADR 26](adr/0026-a-destination-can-be-asked-what-an-argument-could-hold.md)
  both describe, so it wants an ADR and a migration of the three kinds that declare it.
- [ ] Verify and repair reach destination records. The mirror carries them
  ([ADR 20](adr/0020-destinations-are-pool-state.md)), but neither verify nor repair exists to
  reach anything, so a mirror holding a stale or missing destination record has nothing that would
  notice. Whoever builds them builds this at the same time.

## Inboxes

- [ ] raycast extension for notemap to quickly jot down a note > basic extension for calling the notemap api
  - Scaffolded 2026-09-16 at `apps/raycast-extension`, and it is a whole client rather than a
    call to the api: what it waits on is a store it can keep an outbox in across processes
    ([plan](plans/client-store-on-a-filesystem.md)).
  - Captures text, tags and one attachment. Tags come from a picker over `tags.inUse` plus a field
    for ones that do not exist yet, and the toast says whether the note reached the pool or is
    waiting in the outbox.
  - `src/lib/client.ts` merges the machine's trust store into Node's before it builds a client.
    Raycast's Node carries its own roots and reads neither the keychain nor a shell's
    `NODE_EXTRA_CA_CERTS`, so a pool behind a private CA answers
    `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` however the certificate was accepted on the machine. A
    publicly trusted certificate on the pool — ACME over DNS-01, which needs no route from the
    outside — retires those lines. It also gives the command `crypto`, which Raycast's global
    object leaves out and uuid reaches for, and `File`, which an attachment is and which has not
    been checked for either way.
- [ ] are.na relay

## Pool, store and correctness

- [ ] Add proper service logging, at the moment, notemap logs almost nothing, making it pointless to inspect the docker logs for debugging purposes 
- [ ] When purge lands: `GET /v1/items/:id/routing` reads the item and then its records, two reads on two connection states, so an item purged between them answers `200 {"values":[]}` — the claim about an item the existence check is there to avoid. Either one core method answering both, or the route accepting the window deliberately.
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
- [ ] Consider redis for jobs in the future. Move the jobs managed out of the store port, let it be its own. Could be a piece of the store db, could be external. (Feel like I reimplement a lot of tried and tested things here.
  - same for pool/work, all the jobs management. Is there existing tools we could use for this instead?
- [ ] Allow a user to have multiple pools? Use case: I route some captures to another pool, where I do more granular routing.
