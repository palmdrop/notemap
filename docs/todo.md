# Developer TODOs
- [ ] Consider allowing in-place edits to notes IF they have not been routed. If they are routed, editing becomes revision only, with a new capture entry to process. 
- [ ] Routing arguments - more detailed routing within a destination. The mechanism already exists: a capability's `targetSchema` is a JSON Schema the adapter publishes and core validates, so an adapter wanting a template name, a format, a column or a priority just declares one. What is left is making those schemas good enough to build a form from - titles, descriptions, defaults, enums - and saying so in the spec, so adapters bother.
  - This has a caller now. The routing composer builds the target step from `targetSchema`, so a
    schema with nothing in it renders as unlabelled text inputs; an enum would render as the same
    marked-option idiom the `where` and `do` steps already use.
- [ ] Routing templates - changing or formatting an item on routing, for example, making an item a piece of a TODO list
  - AI templates, where a local model formats an entry that may or may not be properly formatted
  - Shape settled in [ADR 19](adr/0019-a-destination-converts-and-the-delivery-records-what-went.md): the destination converts a copy, the work happens inside the delivery, and the bytes that landed come back to be stored on the routing record. Open: whether a template is configured in the delivery's arguments or in destination config, and whether a template is itself a thing a person edits.
- [ ] Routing edits - being able to freely edit an item as it is routed. Settled: **amend, then route**, two operations that already exist - a frontend can make it one smooth gesture with no new architecture. Rewriting the capture _because of where it is going_ is a dead end, and ADR 19 records why so it does not get proposed again. Open: what happens to the amendment if the routing decision it was made for is then abandoned.
- [ ] Routing auto-processing - routing a note to a specific destination converts it to a specified format. A todo list, a prose paragraph, a markdown image link, whatever. The format could be a templating language, or natural language, with an LLM in the loop, or a mix. ADR 19 answers _where the work happens_; the interesting half is still open - **preview**. Composing a routing decision with a template means wanting to see the result before committing, which is a third method on the destination port and needs the conversion to be repeatable enough that a preview means something.
- [ ] Routing rules - core.md has carried "how rules are expressed, how fan-out to several destinations is presented, and whether a rule may ever be trusted to fire unattended" since 2026-08-02. Capture templates that auto-route are the first thing to touch it: choosing a template _is_ a person's decision to route, made early, which is how it survives "a rule never delivers on its own" - but that sentence wants writing deliberately rather than discovering later.
- [ ] Reconsider revisions: maybe they should appear in the original place of the note, or that should be a filter option. User can choose to view the queue in order of creation, modification, etc. Revisions appear in place of original, but in the db, they are different entries.
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
- [ ] The client's store is write-only, so offline is a promise nothing keeps. `ClientStore`
  declares `readOutbox()` and `readItems()` and nothing in `packages/client` calls either —
  `persistItems` only writes — and `apps/ui/src/lib/client.ts` builds a `createMemoryStore()`. A
  capture made with the pool unreachable is gone on reload, and the outbox never replays across a
  session. Wants a durable `ClientStore` adapter (browser storage), `createClient` reading it back
  at start, and a decision about whether boot drains. [client.md](specs/client.md) calls the
  offline protocol a designed seam, unbuilt; this is that seam, and it is the one place the code
  currently claims something it does not do.
- [ ] Routing state has to reach a client, and that is a backend change. `Item` carries `archived`,
  `revisionOf` and `supersededBy` and nothing about routing, so the queue excludes routed items
  server-side and the feed receives them undifferentiated. The feed therefore cannot say `routed`,
  or draw the `sent` line naming destination, capability and when, without a
  `GET /v1/items/:id/routing` per row. A slice across [core.md](specs/core.md) and
  [http-v1.md](specs/http-v1.md) first, then the client and the shell — the shell's half is drawn
  and waiting. Decided 2026-08-20 that the answer is to carry it rather than work around it.
- [ ] `GET /v1/tags` — the tag chooser has nothing to choose from. No route reads the tags in use,
  so the shell offers free entry into a control already shaped to take suggestions. Wants a core
  read, the route, and a client cache. Open: whether it carries counts, which is the difference
  between a chooser and a tag manager; and whether it answers for the whole pool or for a surface.
- [ ] Nothing can enumerate a destination's targets. Capabilities are already dynamic — `describe()`
  answers them live and the composer draws whatever comes back — but the target half is not:
  `describe()` returns a `targetSchema` and that is the whole vocabulary, so nothing can offer a
  folder tree, a board column, or an existing note to append to. Either the adapter publishes an
  enum it refreshes at describe time, or the destination port gains a method for asking. **This is
  the same seam preview needs** (above), so design the two together or it gets built twice.
- [ ] A pending outbox operation has no visible mark on the row it is about. The chrome says the
  pool is out of reach; nothing says *this item* has work that has not drained, so a capture and a
  capture-plus-unsent-tag look identical. The visible half of the offline story, and it pairs with
  the durable store above. [shell.md](specs/shell.md) has carried this since 2026-08-19 and names
  the candidates: inverting the row's timestamp, or a word in the row's left column.
- [ ] The markdown renderer is unchosen, so a text capture shows its asterisks.
  [standards.md](standards.md) says a text payload is CommonMark; the shell's `Prose` primitive
  draws it verbatim behind the interface a renderer will sit in. A library choice, and the question
  it drags in with it: whether captured markdown is sanitised before rendering, since a capture can
  carry raw HTML and nothing between the field and the screen would stop it.
