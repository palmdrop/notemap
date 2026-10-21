# Developer TODOs

## Shell — layout and interaction

- [x] "Queue is empty" shows before the last capture is hidden from the queue when the last capture is selected and held

- [ ] add ability to order feed by order of processing, which is more intuitive since the user might expect the capture they processed latest to appear on top
- [ ] destination fields should provide succinct placeholder texts

- [ ] fuzzy search for captures, feed, tags, other views

- [ ] more compact routing record view, capture excerpt->destination+place, link to opening capture if such a link is valid
- [ ] more compact routing records when opening an item. We do not need to see the preview material on each, but it should be expandable.

- [ ] feed, filter on routed and non-routed

- [ ] mobile view improvements (this might be deferred until we do the app?):
    - action button for adding a new capture
    - full-screen for editing and capturing
    - tag input using a centered input field and expandable
    - bottom bar for switching views

- [ ] batch processing, i.e selecting many captures and routing them all at once, or discarding
    - batch processing by tag, i.e route all items tagged with a specific tag to a location. Default: only unprocessed item. Checkbox for ALL items in the feed.

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
- [ ] **Endless scroll makes the unbounded page ordinary.** Since 2026-09-24 the feed and the queue
  read their next page as the reader scrolls, so walking a page past the cache's 500-item cap no
  longer takes hundreds of presses of `load more` — it takes a long scroll. The item above is the
  fix; this is the note that it is now reachable by anyone who reads far back, and that whatever
  bounds a drawn surface has to leave the auto-read working (a windowed page re-reading what it
  dropped as the reader scrolls back).

- [x] add way to open a capture from the index view, for example, have it expand when selected, grow to a regular capture row size

- [ ] drag-and-drop for adding assets

## Composer and capture

- [ ] Consider capture templates: on capture time, I select a capture format which auto-tags and auto-routes (optionally) the finished capture when it is committed.
  - Cheaper than it was, as of 2026-09-07: the auto-routing half is done. A capture that arrives
    carrying a **trigger tag** fires its template, so a capture template that auto-tags gets the
    routing for free and needs to decide nothing about delivery. What is left is the capture format
    itself — what a person picks at capture time and what it fills in — which is a shell question.

- [ ] auto-route from relay to destination, for example, configure are.na inbox -> notemap -> template -> destination

- [ ] a proper file-picker library would be ideal, or a more traditional file picker/navigation flow at least, while still allowing text-first input

- [ ] Composer findings left out of [path-picking-and-enter](plans/path-picking-and-enter.md):
  - a half-typed heading in `under` (`Ne`) is taken as the heading it prefixes (`## Next`), and
    nothing says so before the route
  - `↑↓` after taking a folder starts at the top of the whole tree, not inside the folder just taken

- [ ] Consider a picker for a destination's root, in the destination form. Today `root` is typed
  freely. Nothing can be listed before a destination exists, so it needs a listing that does not
  go through one: through an account for WebDAV, and on the daemon's own host for the filesystem
  kind. The second lets any session enumerate the host's directories — the container limits that
  to `/var/lib/notemap/vaults`, a bare install has no such limit. Worth deciding before building.

- [ ] searchable files/folders in webdav/fs destinations, investigate if possible

- [ ] consider source to destination auto routing: for example, I might have an inbox that I *always* want routed to a specific destination, using a template.

## Templates

- [x] trigger tags with arguments, for example, I might need to insert a todo in a todo file after a specific headline... how to do that? routing tag arguments? templates with arguments? 

- [ ] add template descriptions
    - and show description, or excerpt, when template is minimized in the settings view

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

- [ ] **Decide whether the shell rewrites a processed note.** A row offers `edit` only while its
  item is unprocessed, in the queue and the feed alike, so the shell never sets out to make a
  revision. The ones in a pool come from a relay re-reading a processed item, and from an edit that
  crosses a seal on its way. Either a processed row grows an edit that makes a revision, or not
  rewriting a processed note becomes this shell's stated decision in shell.md, which today lists it
  under **Not shipped**. The composer's `rewrite` is not this: it changes one delivery and never the
  item.
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

## Classification

- [ ] Try JEV for typesafe AI classification/suggestions

## Routing — templates, rules, conversion

- [ ] capture merging: related to batch processing, select multiple capture rows, and/or filter by tags, then process all these at once -> a collective routing record with the body being a merged version of all the items. One frontmatter, one foot of hashtags

- [ ] trying to route a capture to the exact same place as a folder produces a strange webdav ETag error that is not very useful for a user

- [ ] ability to "invalidate" a routing record, for example, if something was routed but I then removed what was routed manually in the destination. Would like this feature, even though notemap cannot always verify that the routing record is "actually" invalid, however, if the destination can check if the file is still there, it can prompt the user with a "the note is still in the destination. Invalidate anyway?".

- [ ] Conversion - changing or formatting an item on routing, for example, making an item a piece of a TODO list. Called conversion rather than a routing template since 2026-09-05: a **routing template** is now a saved routing decision, and the two were sharing a word.
  - AI conversions, where a local model formats an entry that may or may not be properly formatted
  - The hand-picked half shipped 2026-10-14: `conversion` on the markdown kinds, `block`,
    `list-item` or `task` ([task-conversion](plans/task-conversion.md)). See the next entry for
    what is left.
  - Shape settled in [ADR 19](adr/0019-a-destination-converts-and-the-delivery-records-what-went.md): the destination converts a copy, the work happens inside the delivery, and the bytes that landed come back to be stored on the routing record. Narrowed 2026-09-10: the **hand-made** half is answered — a person's words are a first-class `content` field of the request, beside the arguments rather than inside them, because a path and a person's prose are not the same kind of thing and only one of them is a destination's to interpret ([ADR 45](adr/0045-a-delivery-may-carry-its-own-content.md)). Still open: where an **automatic** conversion is configured — a template, a destination, a model in the loop — and whether one is itself a thing a person edits.
- [ ] Routing auto-processing - routing a note to a specific destination converts it to a specified format. A todo list, a prose paragraph, a markdown image link, whatever. The format could be a templating language, or natural language, with an LLM in the loop, or a mix. ADR 19 answers _where the work happens_, and the **preview** half is now closed: the destination port has `preview`, the composer asks for one on demand, and a delivery records the output it produced so what went is readable after the fact
  ([delivery-output-and-preview](plans/delivery-output-and-preview.md),
  [ADR 33](adr/0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md)). What is
  left is the conversion itself — how a conversion is configured, and what a model in the loop
  costs — and it has the seam it will use: a kind converts inside `deliver`, answers the same
  output from `preview`, and a conversion that loses something says so in a note nobody parses.
  The repeatability worry this line carried is answered rather than solved: a preview is
  **indicative**, so a non-deterministic converter is allowed and the shell says what a preview is.
  - Narrowed 2026-10-14: a conversion is configured as a named argument the kind publishes
    ([ADR 61](adr/0061-a-conversion-is-a-named-argument-a-kind-publishes.md)), and the markdown
    kinds ship `block`, `list-item` and `task`. A templating language was weighed there and
    refused. Still open: a model in the loop, and a conversion that rewrites the whole file (a
    fold), which ADR 61 deliberately left out of its interface.
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

- [ ] when routing, if the destination is reachable, and if content is INSERTED into a pre-existing file, show snippet BEFORE and AFTER the inserted content, to show how it would look
  also, maybe worth revisting file backups on append/insertion/rewriting, the routing record saves the state of the file BEFORE routing

## Output

- [ ] in-file edits: instead of creating or appending, notemap allows for *inserting* a capture in a file. Only works if file is parsed by, for example, a markdown parser, or some other pattern/filetype that the destination supports. For example, inserting a capture item below a pre-existing heading in a file, or adding a todo list entry at the top of a todo list
    - test if JEV can be used for this
    - notemap keeps a backup of the original file when doing this?
    - Narrowed 2026-10-14 by [task-conversion](plans/task-conversion.md): a `list-item` or `task`
      now lands at the end of a heading picked from the note itself, joining a tight list without
      loosening it ([ADR 61](adr/0061-a-conversion-is-a-named-argument-a-kind-publishes.md),
      [ADR 62](adr/0062-a-candidates-request-carries-the-arguments-a-field-depends-on.md)). Left
      out on purpose: inserting at the **top** of a section rather than its end. Backups were
      deliberately left out too. The output holds only the inserted fragment, so the note
      as it stood before notemap's edit cannot be recovered from the pool. The shape, if wanted:
      the whole pre-edit file as a blob, named on the routing record beside the output. A whole
      file rather than a reverse diff, because a diff only replays against a note nobody has
      touched since. It costs a full copy per insert into a changed note, and it is a new field on
      the record, so it extends ADR 19/33.

## Destinations and adapters

- [ ] Add destination descriptions

- [ ] Verify and repair reach destination, template and pool-setting records. The mirror carries
  them ([ADR 20](adr/0020-destinations-are-pool-state.md),
  [ADR 50](adr/0050-pool-settings-are-pool-state.md)), but neither verify nor repair exists to
  reach anything, so a mirror holding a stale or missing record of any of the three has nothing that
  would notice. Named together because none of them exists to reach anything yet, and pool settings
  is a third thing that would otherwise join the debt silently. Whoever builds them builds this at
  the same time.
- [ ] Rebuild restores pool settings. The mirror writes one record per pool setting under
  `settings/`, but rebuild does not exist, so nothing reads them back. Whoever builds it restores
  them beside destinations and templates, warns about and skips a record naming a setting the
  running code does not know, and adds the integration test that changes a setting, rebuilds, and
  reads it back ([mirror.md](specs/mirror.md#rebuild),
  [a-pool-holds-settings](plans/a-pool-holds-settings.md)). The same rebuild restores an item's
  `continues` and `sourceWord`, which only the `.json` carries: a pool rebuilt without the source's
  word reads every edit made in notemap as the source's own.

## Inboxes
- [ ] raycast extension: add command for viewing queue/feed and editing (BUT NOT PROCESSING?)
- [x] raycast extension need to support empty note bodies, just attachments. Move attachments above tags

- [ ] shortcut for taking selected text + URL in browser and sending it to notemap. Might require a proper notemap browser extension, or a smart keybind using raycast or the are.na extension

- [ ] browser extension: create notemap browser extension 
    - for now, in personal flow, this is covered by are.na browser extension + are.na->notemap relay

- [ ] relays: an upstream edit to a *processed* item becomes a revision of the line's head and
  resurfaces in the queue, and one to an item somebody also edited in notemap becomes a
  continuation that does the same. Either may not be what a person who already dealt with it
  expects. It is also the only way the edit reaches a destination, so dropping it would let the
  vault diverge silently. If it bites, a per-source policy in `packages/relay` rather than per
  relay: archiving the revision on arrival keeps the edit in the pool and the feed and out of the
  queue. A relay reading a block differently after an upgrade looks like an edit too, and the same
  policy would quiet that.
- [ ] A continuation takes the upstream item's capture time, so it is drawn where the original was
  rather than at the top. It has to: the relay re-reads it under that time, and a different one
  would read as a changed capture. If continuations get lost far down the queue, the fix is on the
  drawing side, not the capture time.

- [x] raycast, when escaped, cancels the input in the capture  note. Cache it temporarily and restore when command is opened again

## Pool, store and correctness

- [ ] add a way to edit tags, remove tags, rename tags, see tag statistics, etc

- [ ] When purge lands: `GET /v1/items/:id/routing` reads the item and then its records, two reads on two connection states, so an item purged between them answers `200 {"values":[]}` — the claim about an item the existence check is there to avoid. Either one core method answering both, or the route accepting the window deliberately.
- [ ] Consider redis for jobs in the future. Move the jobs managed out of the store port, let it be its own. Could be a piece of the store db, could be external. (Feel like I reimplement a lot of tried and tested things here.)
  - same for pool/work, all the jobs management. Is there existing tools we could use for this instead?
- [ ] Allow a user to have multiple pools? Use case: I route some captures to another pool, where I do more granular routing.
