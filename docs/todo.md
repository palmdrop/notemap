# Developer TODOs

## Shell — layout and interaction

- [ ] new shell design with more clear fields and less clutter/noise
    - simplify
    - stronger grids
    - easier configuration
    - better hierarchy using bold text, small-caps, grids

- [ ] batch processing, i.e selecting many captures and routing them all at once, or discarding
- [ ] easier, keyboard driven processing
  - processing, discarding, etc, with keyboard shortcuts
- [ ] single-capture mode, seeing only one capture at once with easier access to processing options
- [ ] keyboard shortcuts
- [ ] command palette

- [ ] stale and premature UI state
  - No good way to see pending operations. A held row says `retrying` while it is
    looked at and the corner speaks when the delivery resolves, but nothing shows everything in
    flight at once. Belongs with the routing-record and log readability items below.
  - ~~Log does not show new items without refresh~~ — closed 2026-09-09: the log listens to the
    watcher the corner already speaks from, and what has happened since goes to the head of the
    page. Newest-first only; read the other way the walk is what brings it.

- [ ] The markdown renderer is unchosen, so a text capture shows its asterisks.
  [standards.md](standards.md) says a text payload is CommonMark; the shell's `Prose` primitive
  draws it verbatim behind the interface a renderer will sit in. A library choice, and the question
  it drags in with it: whether captured markdown is sanitised before rendering, since a capture can
  carry raw HTML and nothing between the field and the screen would stop it.

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

- [ ] fuzzy search in composer input field. Narrowed 2026-09-09: `⇥` now walks what still matches
  once completion has nothing left to add, so a name shared with four others is reached by pressing
  the key again. Still prefix-only — a channel found by a word in the middle of its title is what
  is left of this.
- [x] ~~using a template from the composer does not add the routing tag~~ — closed 2026-09-09: an
  untouched template routes and then applies its trigger tag, which the pool absorbs as
  classification because that template's record already stands. A **corrected** one is the person's
  own decision and takes no tag.
- [x] ~~adding a routing tag from within the composer is confusing~~ — closed 2026-09-09: a trigger
  tag taken in the composer's own tag row closes the composer, the tag being the whole decision.
- [x] ~~the typed line drew a `+ filename` under a note it was about to append to~~ — closed
  2026-09-09: a `+` is for what the delivery will make, so appending draws none and the note's own
  row wears the accent as the row the line names.
- [x] ~~A schema field's **default** is not drawn~~ — closed 2026-09-09, as a suggestion the person
  types over and never written into a template's own arguments.
- [ ] Tag picking is still free entry beside a datalist rather than the shell's own
  chooser, which the order control now uses.
- [ ] Editing does not allow attaching anything. It is the edit surface rather than the
  row, and wants designing on its own.
- [ ] Consider capture templates: on capture time, I select a capture format which auto-tags and auto-routes (optionally) the finished capture when it is committed.
  - Cheaper than it was, as of 2026-09-07: the auto-routing half is done. A capture that arrives
    carrying a **trigger tag** fires its template, so a capture template that auto-tags gets the
    routing for free and needs to decide nothing about delivery. What is left is the capture format
    itself — what a person picks at capture time and what it fills in — which is a shell question.

- [ ] picking folders in composer is strange and clunky, sometimes you have to click with mouse 
  - it is not clear how to go back or use the current folder
  - tabbing down the hierarchy has no effect on input field until you press "use <path>"

## Templates

- [ ] Add a way to append text, or insert {{templates}} INSIDE the output of a capture. Requires capture output.
- [ ] add way of picking a separate location for note and assets when using templates
- [ ] A name that is taken - a capability that creates a file refuses a name that already exists, which is right and is not the whole answer. A template filing daily notes as `{{captured_at}}.md` collides on the second capture of the day: nothing is written, nothing is filed, and the item comes back to the queue. Raised 2026-09-07 from using the routing templates slice. Two answers, and they are not exclusive: `create-or-append` is what a daily note wants and the template that collided was pointed at the wrong capability, which the settings page could say; and a **collision policy** on the file capabilities — refuse, or append a number — which is an argument the adapters would declare and core would never interpret. The second wants its own slice and probably an ADR: it adds a word to an adapter's argument vocabulary, and it is useful to a decision made by hand as much as to a template.
  - Not a missing pattern: `{{captured_at:datetime}}` and `{{captured_at:time}}` already tell two
    captures on one day apart ([ADR 35](adr/0035-a-templates-arguments-are-patterns-expanded-when-the-decision-is-made.md)).
    What is open is what a template that *wants* one name per day does when it reaches the second.
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

- [x] ~~Inspecting routing records is hard to view~~ — closed 2026-09-09: the record leads with
  where it landed and what was sent, which is what most readings of one are for, and the arguments
  are behind `the decision` for the reading that is working out why it went there.
- [ ] add new UI views
    - routing view, showing all routed items. Maybe rather a human-readable action log with a
      "routing" filter than a page of its own — the user needs a way to inspect the effects of
      their actions.
        - hide unnecessary items from log. **Wants the pool's help**: `GET /v1/actions` filters by
          item and nothing else, so a shell-side filter would page over rows it then throws away and
          the count under the register would stop meaning anything. A `kind` filter on the query is
          the honest version, and it crosses core, `http-v1` and the client.
        - ~~log entries should link to the capture~~ — closed 2026-09-09: the subject is a way to the
          item, drawn as the capture's own first words where the shell holds them, with the narrowed
          log a word away.
- [ ] Certain feed views allow me to view all revisions, all entries, open to see
- [ ] **Nothing in the shell can ask for a revision.** Editing is offered on the queue, which holds
  unprocessed items only, and the feed offers no edit at all — so the revision path is reachable
  only when another device processes an item between the draw and the send. Either the feed row
  grows an edit, or rewriting a processed note is deliberately not a thing this shell does and
  shell.md should keep saying so. Raised reviewing
  [editable-until-processed](plans/editable-until-processed.md).
- [ ] Reconsider where revisions *appear*. Half-answered on 2026-08-24: a revision now carries its
  own capture time, so it sorts at the moment it was written and no longer ties with what it came
  from — which is what removed the chain columns from the feed key. Showing it beside its ancestor
  is therefore a client-side grouping on `revisionOf`, best-effort across page boundaries, and no
  longer something the pool can do for a surface. Still open: whether the shell does that grouping
  by default, and whether ordering the queue by last touch comes back as a **reader's option** now
  that it is no longer the key.

## Configuration

- [ ] Destination configuration is way too clunky, not sensible to configure in BOTH config.toml and in the UI.

## Routing — templates, rules, conversion

- [ ] Routing edits - being able to freely edit an item as it is routed. Settled: **amend, then route**, two operations that already exist - a frontend can make it one smooth gesture with no new architecture. Rewriting the capture _because of where it is going_ is a dead end, and ADR 19 records why so it does not get proposed again. Open no longer, as of 2026-08-24: the amendment stands, because it was an amendment of an
  unprocessed item and the routing that sealed it never landed. Cancelling the reservation removes
  it, so the item is unprocessed again and editable in place again — unless something was revised
  from it meanwhile, which seals it for good, since rewriting it would leave that revision's trace
  naming content which never produced it
  ([ADR 21](adr/0021-an-item-is-editable-until-it-is-processed.md)).
  - NOTE: when opening, re-evaluate ADRs, amend-then-route might be a bad option, multiple routing to different locations might want different formats for the same capture. Amending for each route would be confusing, and captures become static when they have been routed.
  - NOTE: Another option would be to "clone" the capture (which is the amending behavior when it is been routed) and use that as routing. No new machinery. But consider together with "output" formats.

- [ ] Conversion - changing or formatting an item on routing, for example, making an item a piece of a TODO list. Called conversion rather than a routing template since 2026-09-05: a **routing template** is now a saved routing decision, and the two were sharing a word.
  - AI conversions, where a local model formats an entry that may or may not be properly formatted
  - Shape settled in [ADR 19](adr/0019-a-destination-converts-and-the-delivery-records-what-went.md): the destination converts a copy, the work happens inside the delivery, and the bytes that landed come back to be stored on the routing record. Open: whether a conversion is configured in the delivery's arguments or in destination config, and whether one is itself a thing a person edits.
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
- [ ] add option to render tags as markdown `#tag` entries at the end of the file instead of frontmatter items 

## Destinations and adapters

- [ ] are.na destination:
  - ~~tabbing multiple times does not move composer cursor to next channel that matches the inputted
    text~~ — closed 2026-09-09: the second press walks what still matches what was typed.
  - are.na templates resolve to channel ID, which is good, but frontend now shows ID instead of
    channel title. Frontend should show title while internally resolve to the ID. Narrowed twice:
    **inside the composer the list under the field already draws the title**, since the value is
    what narrows it, and as of 2026-09-09 the **template form's own line reads the title** while the
    field keeps the number. What is left is the two surfaces that ask the destination nothing — the
    settings template list and the routing record — where a title costs an ask on draw or a label
    stored beside the value.
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
- [ ] Consider full POC: inbox via Memos app, routing to complex obsidian project. The **inbox
  half closed 2026-09-07**: `apps/relay-memos` reads a Memos server and captures every memo into
  the pool over `/v1`, with its pictures, at its own capture time, carrying the tags it already
  had ([plan](plans/memos-relay.md),
  [ADR 39](adr/0039-a-relay-is-outside-notemap-and-reaches-v1-like-anything-else.md)). What is
  left of this line is the obsidian end. The "advertise
  folders" half closed 2026-08-31: the destination port can be asked what an argument could hold
  ([ADR 26](adr/0026-a-destination-can-be-asked-what-an-argument-could-hold.md)), and the
  filesystem kind answers it for `create` and `append`. Still open: **custom tags that
  exist for auto-routing** — the port can now answer this too, since a vault's tags are just another
  field's candidates, but no kind implements it, obsidian tags being read from the notes themselves
  rather than declared anywhere a filesystem adapter can see.

## Inboxes

- [ ] raycast extension for notemap to quickly jot down a note!

## Pool, store and correctness

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
