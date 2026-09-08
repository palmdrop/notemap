# Spec: The client

**Status**: Draft — the online contract is settled; the offline protocol is being built through the seam
**Last updated**: 2026-09-07
**Shipped**:

- 2026-09-07 — **Routing templates are cached, and a tag may now apply one.** `TemplatesApi` reads
  and edits them on the destinations' terms — a read cache with `all` and `held`, and the edits
  outside the outbox for the same reason a destination's are. `RoutingApi.route` and `.preview`
  take a template in place of a destination, a capability and arguments; `.resolve` answers what
  one would route an item as. `tag` is unchanged on this side and does more on the other: a trigger
  tag drained from the outbox applies its template when it arrives, and one whose template cannot
  route comes back refused, which is a refusal the shell already knows how to hold.
  ([plan](../plans/routing-templates.md),
  [ADR 34](../adr/0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md))

- 2026-09-07 — **The client stops guessing what an attachment is.** A cached item carries the
  resolved assets the pool answers, so a picture is told from a recording by its media type rather
  than by the payload's type — which no longer distinguishes them, there being one. The client
  remembers the media type of bytes it holds for a capture that has not drained, so an attachment
  is drawn before it lands as well as after. `sources.inUse()` reads `GET /v1/sources` and caches
  nothing: what it is asked for is whether a source has gone quiet.
  ([plan](../plans/memos-relay.md))

- 2026-09-04 — **Asking what would go, and reading what went.** `RoutingApi.preview` asks a
  destination what it would write before anything is committed, and `RoutingApi.output` reads what
  a delivery actually produced. Neither is an outbox operation, for the reason routing is not one —
  a decision made offline cannot be replayed, and a preview of a destination that could not be
  reached is not a thing to queue — and neither is cached: both describe a moment rather than
  state the pool holds.
  ([plan](../plans/delivery-output-and-preview.md))

- 2026-09-03 — **A client learns what it did not ask about.** `ActionsApi.watch()` answers what the
  pool has done since this client started looking, read from the action log on its own tempo, gated
  on watched and on reachable, from a mark taken at start that says nothing about what came before
  it. One page at a time, with a mark when there was more. `DestinationsApi.held` reads the
  destinations cache synchronously, for the callers that name one in a line of text.
  ([plan](../plans/notices-as-they-happen.md),
  [ADR 32](../adr/0032-a-shell-learns-what-happened-by-reading-the-log.md))

- 2026-09-03 — **An item is read by id, and says what it was drawn from.** `item` reaches the pool
  for an id no surface has ever drawn, so a deep link into a fresh browser answers, and falls back
  to the client's own copy where the pool does not — answering an `ItemState` that carries the
  item, whether it came from the cache, and the failure if there was one, as a list surface
  already does. `held` follows the copy the client holds afterwards.
  ([plan](../plans/item-route-and-record-view.md))

- 2026-09-02 — **The client reads the places a field has already held.**
  `DestinationsApi.remembered` names a destination, a capability and a field and answers the
  pool's own record of what has been routed there, with how often and when last. A passthrough on
  `candidates`' terms — asked now, cached by nothing, written to no store — but answered by the
  pool rather than the destination, which is what lets a shell go on completing a place while the
  vault behind it is unreachable.
  ([plan](../plans/typed-routing-composer.md))

- 2026-09-02 — **The reachability mark says when, and a destination can be probed.**
  `reachable` carries the time the pool last answered anything and, where the probe was what
  asked, how long it took — so a shell draws "answered eight seconds ago" without holding a second
  notion of reach, and `probe()` re-asks out of turn. `DestinationsApi.probe()` is a passthrough
  over `GET /v1/destinations/{id}/probe`, cached by nothing: what a probe found is true of a
  moment. ([plan](../plans/destination-checks-and-accounts.md))

- 2026-09-02 — **The client reads the action log.** `ActionsApi.read` takes an order, an optional
  subject filter and a position, and answers a page with the position the next one continues from.
  Not a surface with a held page and not in the durable store: the log is read for diagnosis rather
  than drained. The position is the domain's — an instant and an id — read out of the `next` link
  `/v1` answers rather than passed back as a URL.
  ([plan](../plans/log-in-the-shell.md), [ADR 29](../adr/0029-the-action-log-is-a-shell-surface.md))

- 2026-08-31 — **A destination can be asked what a field could hold, and the answer is never
  cached.** `DestinationsApi.candidates()` is a passthrough over
  `GET /v1/destinations/{id}/candidates`, on `describe()`'s own terms: asked now, kept by nothing
  in the store. A vault's contents are somebody else's state, and the durable cache is for the
  pool's own collections alone. ([plan](../plans/destination-targets.md))

- 2026-09-01 — **The client holds the access tokens, and a transport may carry one.** `tokens`
  lists what exists, mints one under a name — the only answer carrying the string, which is not
  stored anywhere — and revokes one at a time. None of it is cached and none of it is an outbox
  operation: an offline mint would hand somebody a credential the daemon has never heard of.
  `createFetchTransport` takes a token, which is what a client that is not a browser carries
  instead of a cookie; the client itself still knows nothing of credentials, and `assetUrl` is the
  one thing a token cannot reach.
  ([plan](../plans/login-and-access-tokens.md))

- 2026-08-31 — **The client learns there is a door.** A `401` reads as `Unauthenticated` rather
  than as a refusal, so what is queued parks and drains instead of being burned terminally. The
  client carries session state a surface can read, asked on start and revised whenever a `401`
  arrives from any route; `login` and `logout` are on it, and signing out drops what was drawn
  from the pool and keeps the outbox.
  ([plan](../plans/login-and-access-tokens.md), [ADR 27](../adr/0027-the-daemon-authenticates-and-core-does-not.md))

- 2026-08-26 — **The pool is asked whether it is there, whether or not anything else is asking.**
  The health probe runs in both states at ten seconds, down from a backoff capped at thirty, so a
  daemon that dies is marked offline without an action to discover it and one that comes back drains
  within ten seconds. An answered request pushes the probe out, and a client nobody is watching asks
  nothing at all. ([plan](../plans/quieter-offline-marks.md))

- 2026-08-26 — **The outbox answers what is undrained, per item and as a count.** A shell asks it
  two questions — whether anything at all is waiting, and whether *this* row is — so it answers
  both rather than making each shell derive one from the raw list. A refusal is in neither.
  ([plan](../plans/shell-offline-marks.md))

- 2026-08-26 — **A capture carries its own bytes until the pool takes them.** Attaching a file mints
  the asset and hands the bytes to the client's store, so the capture that names it is complete
  before anything is sent and a picture taken with the pool out of reach is an ordinary mutation
  rather than a round trip a person waits on. The drain sends the pair — the bytes under the id the
  envelope already names, then the envelope — and an `edit` does the same, a revision being an
  ordinary capture. Both requests carry ids minted before either was sent, so a failure between them
  retries the pair and leaves one asset and one item. A picture is drawn from the bytes the store
  holds until its capture lands, and from the pool's copy after; the bytes are copied when they are
  attached, so nothing depends on the file staying where it was, and go when the operation that
  named them leaves the outbox. ([plan](../plans/durable-offline-client.md))

- 2026-08-26 — **A surface comes back when the pool does.** Reachability already recovered on its
  own; what a surface was left holding did not, so a failure stood until the page was reloaded and
  rows the pool never answered for stayed drawn. A read failure now says whether the pool refused it
  or never answered it, and coming back into reach reads the surfaces again after the drain: one
  drawn from the cache from the start, one that walked real pages left holding them and rid of a
  failure the pool never made, and one nobody asked for left alone.
  ([plan](../plans/reconnect-and-remembered-order.md))
- 2026-08-26 — **The cache acquires readers, a lifetime, and a check that it still describes the
  pool it thinks it does.** The queue and the feed are drawn from the cache until the pool answers
  for them, so a client opened with the daemon down finds its pool rather than an empty list, and a
  surface says which of the two it is holding. Reachability is the client's own — every request is
  evidence and a probe of `GET /v1/health` backs off behind it while the pool is out of reach — so
  the outbox drains the moment the pool returns, with nothing to prod it. That probe also asks which
  pool this is: an identity that does not match what the store holds means a rebuild or a different
  daemon, and the cache is dropped while the outbox is kept. What the cache keeps is bounded: the
  working set stays whatever its size and feed history is capped.
  ([plan](../plans/durable-offline-client.md),
  [ADR 23](../adr/0023-a-changed-pool-identity-drops-the-cache-and-keeps-the-outbox.md))

- 2026-08-25 — **The store stops being write-only, and the client reads it back on start.**
  `ClientStore` answers for every collection the client holds — the outbox and the cached items as
  before, plus the tags in use, the destinations, the pool identity, and an asset's blob with the
  local URL for it — and an IndexedDB adapter backs it in the browser. `createClient` starts
  hydration at once and every path that touches state waits on it, so an outbox filled with the pool
  down survives a reload and drains on boot without anyone asking, and a client opened cold
  completes tags and names destinations from the last lists it read. A refusal of an operation read
  back from the store is settled by re-reading the item rather than rolled back, and one read back
  mid-send is attempted again rather than stranded. What the store could not read is reported
  through `onError` rather than swallowed. The surfaces are not drawn from the cache yet. ([plan](../plans/durable-offline-client.md),
  [ADR 24](../adr/0024-a-refusal-after-a-restart-is-settled-from-the-pool.md))

- 2026-08-24 — **An edit names the channel its words came in through, and a revision is an
  arrival.** `edit` takes a source beside the payload and mints a `sourceItemId` once, reusing it
  on every retry, so a lost response costs one revision rather than two — within a session, until
  the outbox survives a reload. A revision settles at the newest end like any
  capture rather than beside what it names, an amendment no longer re-ranks anything, and whether
  an item is still work is one named predicate, `unprocessed`, read off the row.
  ([plan](../plans/editable-until-processed.md),
  [ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md))

- 2026-08-20 — **Which end a reader starts from reaches the client.** `ListPage` carries an order,
  `loadFeed` and `loadQueue` take one, and a surface reports the order it is in so a control can
  draw it. Naming an order a surface is not already in turns it around and reads it again from the
  start, because a position belongs to the order that made it; optimistic placement of a returned
  or freshly captured item follows the order in force rather than the default.
  ([plan](../plans/shell-design-port.md))

- 2026-08-18 — **Editing destinations is the outbox's second exception, and the shell shows it.**
  The client reads destinations into a cache a settings screen renders from while the pool is
  unreachable, and creating, editing, retiring and deleting one reach the pool directly or fail —
  never queued, because only the daemon can say whether a root exists or whether settings satisfy
  the kind registry it is running. The shell has a settings route that lists them, builds its form
  from the kind's own schema, asks each what it can do only when asked, and disables every change
  while the pool is out of reach. ([plan](../plans/destinations-in-the-pool.md),
  [ADR 20](../adr/0020-destinations-are-pool-state.md))

- 2026-08-17 — **Editing and classification reach the pool.** `tag`, `untag` and `edit` are outbox
  operations now, applied at once and reconciled with what the pool recorded — and an `edit` is the
  first operation whose answer may take a different shape from the guess, so a handler settles the
  pool's reply rather than merely handing back an item: an optimistic amendment is reversed before
  the revision the pool recorded takes its place. **The hand-over seal has no window in the
  outbox**, which is the one thing this spec had wrong: every mutation drains, so a capture is
  claimed and sent in the turn it is enqueued, and an attempt that failed at the socket cannot be
  told from a lost response. The pre-hand-over draft is the shell's compose surface, and the
  client's `edit` is always a domain edit. The queue offers tags and an edit box, neither disabled
  offline. ([plan](../plans/editing-and-classification.md))

- 2026-08-17 — **The shell's half of the acceptance criteria is executable.** `apps/ui` has a test
  runner and is covered by the same lint, format and typecheck commands as every other package, and
  what the shell draws, enables and disables — an optimistic capture before the pool answers, a
  refusal shown and dismissed, archive available while routing and mark-processed are disabled and
  say why, the scroll mark restored without reaching the pool, and a typed note and a picture
  stamping different capture channels — is asserted by tests rather than walked by hand. Nothing in
  the client contract changed. See
  [shell-test-runner-and-gates.md](../plans/shell-test-runner-and-gates.md).

- 2026-08-17 — **The operation vocabulary answers for itself, and the transport owns asset URLs.**
  Each operation carries its target, opposition, optimistic apply and encoder in one place behind a
  table the compiler checks, so a kind cannot be declared without an answer; and
  `Transport.assetUrl` makes where an asset's bytes live the shell's answer rather than a URL the
  client builds. See [client-review-fixes.md](../plans/client-review-fixes.md).

- 2026-08-17 — **Review fixes.** The queue now empties when the pool records a routing decision and
  places an optimistic item only inside the window a page has read; the observable seam is RxJS,
  handed out as observables a shell cannot end; every refusal `/v1` declares has a reading, checked
  against the document by the compiler; and a 5xx reads as undecided rather than as a refusal. The
  queue's third kind of event, the framework-agnosticism constraint and two offline gaps are
  described above as they now stand. See [client-review-fixes.md](../plans/client-review-fixes.md)
  and [client-package-and-online-shell-2026-08-17.md](../reviews/client-package-and-online-shell-2026-08-17.md).

- 2026-08-17 — `@notemap/client` holds the outbox, the cache and the state over them behind a
  `subscribe()` seam, written against a `Transport` and a `ClientStore`, and `apps/ui` is a shell
  that draws it and holds no state logic. Capture, the feed, the queue, archive and unarchive are
  live end to end; routing reaches the pool directly and is disabled rather than queued when it
  cannot. See [client-package-and-online-shell.md](../plans/client-package-and-online-shell.md).

  **Not shipped, and not for want of a wire**: editing and the hand-over seal, tagging and
  untagging, and suggestion decisions. All of them are `notImplemented` in core, so the client
  names them in its vocabulary and refuses to send them rather than guessing a route.
  [editing-and-classification.md](../plans/editing-and-classification.md) starts where they do.
- 2026-08-18 — **The client is driven against a real daemon.** A full-stack suite starts the daemon
  binary over temp directories and drives it with this client over `createFetchTransport`: capture
  and feed, an asset uploaded and fetched back from the URL the client reports, archiving, and an
  outbox that filled up while the daemon was dead replaying exactly once when it came back. What was
  agreed between a mock transport and a Hono app in process is now agreed over a socket.
  (plan: `docs/plans/complete-integration-tests.md`)

---

## Outcome

A person captures, reads, classifies and clears their pool through one frontend that feels the
same on the web, the desktop and a phone — because the part that thinks is written once and the
part that draws is all that changes. Every mutation is applied at once and reconciled with the
pool behind the scenes, so the interface never waits on a round trip. Nothing in the client
depends on being reachable that does not have to.

---

## Scope

This spec is the client contract: what a notemap **client** is, the surfaces it presents, and the
obligations it carries. It is host-agnostic — it governs the web SPA, a Tauri desktop build and a
mobile build identically, which is the point. The protocol a client speaks to the pool is
[http-v1.md](http-v1.md); the domain it presents is [core.md](core.md); the offline machinery it
will eventually replay is [sync.md](sync.md).

### In scope

- **The client and the shell.** The shared client — an outbox, a cache and the state over them —
  and the thin platform shell that wraps it.
- **The surfaces.** Capture, the feed, the queue, an item and its processing actions, in
  observable terms.
- **The outbox.** The mutation vocabulary a client applies optimistically and drains to the pool,
  and what happens to a mutation the pool refuses or reshapes.
- **The seam for offline.** The `ClientStore` and `Transport` ports the client is written
  against, and the shape the outbox and cache take so that an offline slice adds persistence and
  replay rather than a second code path.
- **Reactivity.** How the shell observes client state without the client knowing what a shell is.
- **Source identity.** What a client stamps as a capture's source.

### Out of scope

- **The offline sync protocol.** Delta reads, tombstone handling, conflict resolution over the
  wire, and what a client does when it detects a rebuilt pool are [sync.md](sync.md)'s, and depend
  on a `/v1` sync surface that does not exist yet ([http-v1.md](http-v1.md)). This spec designs
  the seam those will plug into; it does not specify them.
- **Authentication.** There is none ([security.md](security.md)); a client reaches a same-origin
  daemon and holds no credential. A shell that cannot be same-origin is where that question
  reopens, and it is named in [security.md](security.md), not answered here.
- **Visual design.** Component trees, styling, layout and the choice of UI framework are the
  shell's. This spec names surfaces and behaviour, never markup. The web shell's half is
  [shell.md](shell.md).
- **Routing rules, enrichment providers, destinations.** A client presents what core exposes; it
  invents no domain of its own.

---

## Behavior

### The client and the shell

A **client** is a satellite of one pool ([ADR 3](../adr/0003-clients-hold-an-outbox-pools-do-not-replicate.md)):
it holds an **outbox** of pending mutations and a **cache** of recent items, and reaches the pool
only through `/v1`. The state logic over those — applying a mutation optimistically, draining it,
reconciling the result — is the client, and it is written once, framework-agnostic, with no
knowledge of the platform it runs on.

A **shell** is the platform wrapper the client runs inside: the web SPA, the Tauri desktop build,
the mobile build. Only the shell differs between platforms. It supplies the ports (below), draws
the surfaces, and adapts the client's state to its own reactivity. It holds no domain logic — a
rule that lives in a shell is a rule the next shell has to rewrite.

This mirrors the split core already makes with its hosts ([ADR 2](../adr/0002-core-is-a-host-agnostic-library.md)):
the thinking is portable and the wiring is the platform's.

### The surfaces

A client presents four surfaces, each a thin projection of core:

- **Capture** — composing a new item and handing it to the pool. Before hand-over it is the
  client's alone (see [editing](#editing-and-the-hand-over-seal)).
- **The feed** — the pool read chronologically and completely ([core.md](core.md)), newest first
  by default, paginated by a capture-time **position** and walked by following the `next` link
  [http-v1.md](http-v1.md) hands back. A read surface: it never drains.
- **The queue** — the pool read as unprocessed, unarchived items, oldest first by default.
  Presented as **one scrollable list** (see [the queue](#the-queue)).
- Either may be **drawn from the cache** rather than from the pool (see
  [surfaces drawn from the cache](#surfaces-drawn-from-the-cache)), and carries which it is.
- **An order** — which end of a surface a reader starts from. A default per surface and a
  parameter of a read, never a stored preference.
- **An item** — its payload, tags, enrichment state, suggestions and routing records, and the
  actions that process it. Every item a surface holds also carries a **routing summary**
  ([core.md](core.md#routing)) — how many records, how many pending, where they went — so a row
  says what became of an item without a request of its own; the records themselves are read when
  a person opens one.
  **It is read by id whether or not a surface has ever drawn it** *(2026-09-03)*, which is what
  makes it addressable: `item` reaches the pool for any id, and answers what it drew, whether that
  was the pool's answer or the client's own copy, and what went wrong where the pool did not
  answer — the same three things a surface reports, about one item. An item the pool answers *no
  such item* for is an absent item with no failure beside it: the pool decided, and a link that
  outlives what it names is not a failure of anything. The cached copy is kept either way, an
  answer about the pool being no statement about what this client holds. What the client holds is
  then followed rather than re-read (`held`), so a mutation made where one item is drawn marks it
  the way it marks a row.

### The queue

The queue is presented as **one scrollable, paginated list** of unprocessed items, oldest first.
The person scrolls it freely, up and down, and picks the item they want to process; the interface
*nudges* toward the oldest but enforces no walk. An item leaves the list only when it is actually
processed — routed or archived — which the pool decides, not the scroll.

- **There is no skip action.** Scrolling past an item is a skip, and a skip changes nothing
  ([core.md](core.md#the-queue)). The client enqueues nothing and stores nothing for it.
- **The client holds no processing position.** Where core has got to is nobody's — core does not
  hold one ([core.md](core.md#the-queue)) and neither does the client. Where the person has
  *scrolled* is a **scroll mark**: local view state, kept per shell to restore a view on reload,
  never synced and never a **position** in the domain sense ([CONTEXT.md](../../CONTEXT.md) reserves
  that word, and warns it is "never the frontend's idea of how far processing has got"). A scroll
  offset does not translate across devices or viewports, so nothing tries to carry it between them.
- **The list reorders under the reader, and that is sound.** There are three kinds of event
  ([core.md](core.md#the-queue)), and none of them moves an item, the key being capture time
  *(amended 2026-08-24)*. One **arrives** — a capture, or a revision, which is a capture — carrying
  a capture time of now, which places it at the newest end, ahead of a reader working the oldest.
  One **removes** an item — routing, archiving, being revised from — and a reader who had not
  reached it was never meant to see it. The third **returns** it, at the capture time it left with:
  an unarchive, or an abandoned delivery, which may land *behind* a reader who has already paged
  past that position. Fresh work therefore accumulates at the far end while the oldest drains, and
  returned work reappears where it was. An amendment is none of the three: it changes what a row
  says and never where it sits.
- **A returned item is the one case the client places itself.** Because it comes back at an
  unchanged capture time rather than at the newest end, the client inserts it by rank, and only
  inside the window a page has actually read — past that, the pool's own next page carries it. A
  client that appended to the end of its window would sort a returned or freshly captured item
  ahead of older work still to be read. It places by rank in whichever **order** the surface is
  being read, not in the default one.
- **Arriving at the queue reads it again** *(added 2026-09-08)*. A surface a reader returns to is
  not a surface that stopped changing while they were away: a trigger tag fires, another device
  processes something, and the queue then holds rows the pool no longer names. So entering the
  queue reads it from the first page and gives up the tail it had walked. **The feed does not**,
  and the asymmetry is the domain's rather than a convenience: the feed accumulates and nothing
  ever leaves it, so a long scroll there is worth more than a fresh page, where being right about
  what is left is the queue's whole job. A surface nobody has read yet is read for the first time
  either way. A read that fails changes nothing — what was walked is still drawn, with the failure
  beside it — because a read that did not answer is not a reason to hold less than before it was
  made.
- **Which end a reader starts from is the reader's**, on the queue as on the feed
  ([CONTEXT.md](../../CONTEXT.md)). Each surface has a default — oldest first for the queue, which
  is why it is a queue, newest first for the feed — and a read may name another. Naming an order
  the surface is not already in **turns it around and reads it again from the start**: a position
  belongs to the order that produced it, and two orders cannot be stitched into one list. The order
  a surface is in is part of what it reports, so a control can draw it.

### The action log

**Everything the pool has done is read, and none of it is held.** A client reads
`GET /v1/actions` a page at a time, taking an **order** and, where a reader has narrowed it, one
subject. It is not one of the surfaces: there is no held page, no projection to subscribe to and
no reconnect that reads it again. What has been walked belongs to whoever is looking at it, and
goes when they do.

- **A position, not a URL.** A read continues from a position in the domain's terms — the instant
  and the id of the last row the previous page handed out ([CONTEXT.md](../../CONTEXT.md)) — which
  the client reads out of the `next` link `/v1` answers rather than passing back. A client that
  hands its callers a URL has leaked the wire into the surface. The position is absent on the last
  page, which is what says it is the last.
- **It is not in the cache and not in the store.** The log is read for diagnosis rather than
  drained, so persisting it would grow what every client writes to disk for no offline gain, and a
  pool out of reach answers nothing rather than a stale page. Reading it does not seed the item
  cache either: the subjects it names are ids, not items.
- **A subject filter is never validated.** The log outlives the material it describes
  ([core.md](core.md#the-action-log)), so an id no item has is a filter matching nothing.
- A refusal and an unreachable pool are told apart here as they are everywhere else; the caller
  is the one that decides what to draw.

**The log is also how a client learns what it did not ask about** *(2026-09-03)*. `watch()` answers
what the pool has done since this client started looking, in the order it happened, so a delivery
that fails minutes after the decision is something a shell can say rather than something a person
has to go and find. It reads the same route on its own tempo and holds one thing: a **mark**, taken
from its first read.

- **The first read is the mark and says nothing.** Everything before a client started looking is
  history, and a shell that opens by announcing yesterday is worse than one that says nothing.
- **It asks only while the client is watched and the pool is answering**, and asks at once on
  regaining either. It cannot ride the reachability probe: an answered request pushes that probe
  out, so a client whose requests are being answered never sends one — which is exactly when
  somebody is here to be told something.
- **It answers a page, and says when there was more than a page.** A client that was away for a day
  gets what one read holds and a mark that there is more, which is the log's to show rather than
  this to enumerate. A reader that is told there was more is being told to go to the log, not handed
  a page to read out.
- **A read that fails says nothing.** Silence is not an event; reachability is what a person reads.
- **It is lazy.** A client nobody asks to watch never asks the pool anything on its own.

### The outbox

Every mutation a client makes is an **outbox operation**: applied to the client's cache at once,
so the interface never waits, and drained to the pool — immediately when the pool is reachable, on
reconnect when it is not. The online client is the offline client with a fast drain; there is one
mutation path, not two.

**The vocabulary is closed, and each operation answers for itself.** There are eight, listed below,
and the list is this spec's to change — not something that grows as routes are added. Each carries
what it knows in one place: which item it is about, what opposes it, how it applies to the cache and
how it reverses, and how it reaches the wire. An operation the vocabulary names but core does not
implement simply has no encoder and no apply, and the client refuses it — which is now only the two
suggestion decisions. The engine holds no
knowledge of any particular operation, and a kind declared without an answer fails the build rather
than throwing when someone reaches it.

**The vocabulary.** An operation is one of:

- `capture` — a new item;
- `edit` — a change to an item's content ([editing](#editing-and-the-hand-over-seal));
- `tag` / `untag` — classification;
- `archive` / `unarchive` — queue state;
- `accept-suggestion` / `reject-suggestion` — a decision on a suggestion.

**What is undrained is answered both ways** (2026-08-26). A shell draws two marks from the outbox
and they answer different questions, so the client answers both: how many operations have not
drained, for the one count in the chrome, and the set of items those operations are about, for the
mark on a row. A refused operation is in neither — waiting will not settle it, and it is shown and
dismissed rather than drained. Note that this is wider than the operation state also called
`pending`: an operation being sent, or left unreachable, is undrained too.

**A shut door is not a refusal** (2026-08-31). The daemon answers `401` where nobody is signed in
or a credential lapsed, and that is not the pool having weighed the work and said no — it never
looked at it. A `401` reads as `Unauthenticated` and parks the entry `unreachable`-shaped: the
optimistic state stands and it drains when someone signs in. Reading it as a refusal would be
terminal, so a session that expired while the shell was away would burn every capture queued behind
it, which is data loss wearing a refusal's clothes. It is kept apart from `Unreachable` because a
surface has to tell them apart: a daemon having trouble is waited out, a door is waited on by a
person. A `403` stays a refusal — an access token on a token route will not start working.

**Routing is not in it.** Marking an item processed by hand is routing to the user destination
([core.md](core.md#the-queue)), and routing is a decision that must reach the pool
([sync.md](sync.md), [ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)):
the outbox carries captures and classification, never deliveries. So a client that cannot reach
the pool can capture, tag, archive and edit — triage — but cannot route or mark an item processed.
This asymmetry is deliberate and the interface makes it visible: an archive is available offline; a
route or a marking is disabled until the pool is reachable, rather than queued into a promise the
outbox cannot keep.

**A preview and an output are reads that reach the pool, and neither is queued** (added
2026-09-04). Asking what a destination would write is a question only the pool can answer, and one
whose answer describes a moment — queuing it would mean asking later and drawing the answer as
though it were about now. Reading what a delivery produced is a fetch of bytes the pool holds, on
the same terms as an asset's. Both fail rather than waiting when the pool is out of reach, and
neither is kept: a preview is indicative and stale the instant anything changes
([core.md](core.md#routing)), and an output is read by someone who went looking for it.

**Editing destinations is the second exception, on the same terms** (added 2026-08-17,
[ADR 20](../adr/0020-destinations-are-pool-state.md)). Destinations are pool state and a client
reads them like anything else, cached for display. Creating, editing, retiring and deleting one are
not in the outbox: whether a root exists, and whether settings satisfy the kind registry the daemon
is actually running, are questions only the daemon can answer, so an offline edit would validate
against a cached schema and hand back an acceptance the pool may then refuse. The settings screen is
readable offline and its controls are disabled, like a route.

**The destinations cache is read two ways** *(2026-09-03)*. `all` is the observable a screen
renders from. `held` answers the same cache **now**, for the callers that are not a rendered screen
and have nowhere to hang a subscription — naming a destination inside a line of text is a question
with an answer rather than a thing to redraw. Both read one cache, so they cannot disagree, and
neither reaches the pool.

**Routing templates are cached on exactly those terms** (added 2026-09-07). They are pool state a
person configured, small enough to hold whole, and a composer offers them beside the destinations —
so `all` and `held` mean here what they mean there, and a client opened cold against an unreachable
pool still offers every template it last read. Editing one is **not** an outbox operation, for the
destination's reason unchanged: whether a pattern names a field this daemon declares, and whether
a trigger tag is free, are questions only the pool can answer, so an offline save would validate
against nothing and hand back an acceptance the pool may then refuse.

**What a template resolves to is asked, never cached.** `resolve` answers the expanded arguments
for one item, and the expansion is core's: a second implementation on this side would be a second
pattern table drifting from the first
([ADR 35](../adr/0035-a-templates-arguments-are-patterns-expanded-when-the-decision-is-made.md)).
So a composer offline can offer a template and cannot draw the filename it would produce, which is
the honest answer — the same shape `candidates` already takes. A template's **report** is asked
per row and cached by nothing, on `describe()`'s terms: whether a vault still has the folder is
somebody else's state.

**A trigger tag is an ordinary tag to this client.** `tag` is unchanged — one outbox operation, the
same optimistic application, the same drain — and what it does at the far end is the pool's. This
is what makes an offline tag fire: the operation that drains is a tag, so the daemon applies the
template as it arrives and nothing has to look afterwards for tags that ought to have routed. Two
consequences fall out and are accepted. A tag made offline **applies optimistically and may be
refused on drain**, where the template turns out to be stale, which is a refusal the outbox already
holds for a person; and the reservation it makes is not in the cache until some surface reads that
item again, on **arrival is not observed**'s own terms below.

**`untag` is where a trigger tag is not ordinary** *(added 2026-09-07)*. A tag that filed the item
cannot be removed while what it filed still stands, so `untag` may come back refused where no other
tag's would ([http-v1.md](http-v1.md)) — applied optimistically here like any other, and reconciled
by the refusal the outbox holds. The client neither knows nor guesses which tags those are: what an
item's records say is the pool's, and a client refusing a gesture the pool might allow would be
worse than the round trip.

**A routing record says which template it came from**, in `applied`, and whether the trigger tag
applied it. It is read like any other field of a record; it is what lets a shell offer a cancel for
the one kind of decision nobody pressed a button for.

**What a field could hold is asked, never cached** (added 2026-08-31). `describe()`'s capabilities
are read like any destination's, but a folder's contents, a note's existence, or the tags a vault
already uses are somebody else's state, stale the moment somebody else writes a file — answering a
folder listing from disk while offline would be the client claiming something it cannot know. So
`DestinationsApi.candidates()` is a bare passthrough that goes nowhere near the store, and whoever
asked holds the answer for exactly as long as they keep it, which in the shell is the life of an
open composer and no longer. Out of reach is out of reach: a refusal reads as unavailable rather
than broken, typing still works, and the decision stays a person's to make.

A recorded decision takes the item out of the queue, and **withdrawing one puts it back only if the
item holds no other**: processed is derived from holding no routing record ([core.md](core.md#the-queue)),
never stored, so a client that assumed a cancel always returns an item would show work that the pool
still considers done. The client asks rather than assumes.

**A decision is folded into the held item's routing summary as well.** The pool answers the record
it wrote, so the cached copy is brought up to what a re-read would say at that moment — one more
record, one more pending where the delivery has not landed, the place it names added if it is new.
Without it the item stays in the feed drawn as though it had been nowhere until something happened
to re-read it, which is exactly the row a person just acted on.

**Arrival is not observed.** A record that answered pending and lands later leaves the pool's
summary at `pending: 0` and the client's saying otherwise, until some surface reads that item again.
The client neither polls nor is told: delivery is the host's work and nothing on the wire announces
it. So a row can say a delivery is outstanding after it has arrived, and no row ever claims an
arrival that did not happen — which is the direction to be wrong in.

**The tags in use are a read cache, on the destinations' terms.** A client holds what
`GET /v1/tags` last answered and completes from it, so completion costs nothing per keystroke and
survives the pool going out of reach **and the session ending**. It is not an outbox operation and it is
not a vocabulary: classification drains offline as it always did, and a tag nobody has used yet is
written by typing it. The list is read again once classification reaches the pool — a tag or an
untag, since either changes what is in use — **once per drain rather than once per operation**, so a
backlog of eight tags asks one question. The pool having just answered is what says it is reachable.

**The sources in use are not cached at all** *(2026-09-07)*. `sources.inUse()` is a plain read of
`GET /v1/sources` every time, answering nothing when the pool is out of reach. It is the one read
where a remembered answer would be worse than none: what a settings screen asks it for is whether
a source has gone quiet, and a list from an hour ago cannot say.

**The read caches are read back on start** (2026-08-25, extended 2026-09-07). The store holds the
tags, the destinations and the routing templates as it holds the items and the outbox, written
whole as each list is answered, so a client opened cold against an unreachable pool completes from
what it last read, can still name where things go, and can still offer the templates that file
things there ([the ports](#the-ports--the-seam-for-offline)).

**The outbox is read back on start, and drains on its own.** A client reads its store into memory
before anything is allowed to touch what was read — **hydration** — and everything that touches
state, a mutation, a surface read or a drain, waits for it. Pending operations are **not
re-applied**: the cache was persisted with their effects already in it, so replaying them would
apply each one twice. A crash between the two writes is the cost of that, and it leaves one effect
missing until the operation drains. The drain runs as soon as hydration lands, so work made in a
previous session reaches the pool without the person doing anything, and a **refused** operation
read back stays refused: it is not re-sent and it waits for a person, which is what a refusal is.

**An operation read back as `sending` is attempted again.** `sending` is a claim about a process,
and the process it was claimed in is gone; a drain picks up only what is pending or unreachable, so
without this an operation the tab was closed on top of would sit in the outbox forever, never sent
and never settled. Every operation is idempotent under an id minted before it was first sent, which
is what makes the second attempt safe — the pool answers the first one's identity either way. The
cost is that an operation whose request did land, and whose answer was lost with the process, is
sent twice; the pool's answer to the second is the same as to the first.

**A store that cannot be read leaves a cold client, not a dead one, and says so.** Each collection
is read on its own, so a cache that fails does not also cost the outbox — the one thing whose loss
costs a person work. What could not be read comes up empty and is **reported** rather than
swallowed, through a seam the shell wires (`onError`); nothing is written over a collection that
failed to read, so the next successful start finds it intact. The same seam carries a cache write
that did not land, which is still dropped rather than allowed to stop the writes after it.

**A refusal with nothing to reverse is settled from the pool** (2026-08-25,
[ADR 24](../adr/0024-a-refusal-after-a-restart-is-settled-from-the-pool.md)). A reversal is a
closure made when the operation was applied, and an operation read back from the store has none. So
where a refusal cannot be rolled back the client re-reads the item and folds the pool's answer over
whatever was drawn for it — an item the pool does not have is forgotten, which is what a refused
capture needs. The re-read is safe because a refusal means the pool answered, so it is reachable
exactly when it is needed.

**Draining and reconciliation.** An operation is applied optimistically, then confirmed against the
pool's answer:

- On success the client replaces its optimistic state with what the pool returned. The pool is
  authoritative; the optimistic copy was a guess held only until the truth arrived. **A guess the
  pool answered differently is reversed first** (added 2026-08-17): an `edit` is drawn as an
  amendment, and where the pool recorded a revision the amendment is undone before the revision
  takes its place — otherwise the original would keep content it never carried.
- On a **refusal** ([http-v1.md](http-v1.md#errors)) the client rolls the operation back and
  surfaces the refusal. Core reports facts, not sentences; rendering the message is the client's.
- Operations against one item drain **in order**, so a `tag` never overtakes the `capture` that
  created its item.

**Ordering opposing operations.** Most classification is commutative — adding two tags in either
order gives both tags — and needs no clock. Only opposing operations on one target (a `tag` and an
`untag` of the same tag, an `archive` and an `unarchive`) need one, and the pool resolves them
last-write-wins. **The order is client operation-time**: each operation is stamped with the
client's clock at the moment the person acted, and that stamp is the last-write-wins key; arrival
at the pool breaks only exact ties. Arrival-time as the key would make every offline decision lose
to any later-synced online one regardless of what the person intended, which defeats offline
triage. The cost is client clock skew, accepted because a pool is one person's, its clients their
own devices, and the clocks ordinarily agreed. *This pins [sync.md](sync.md)'s open question about
the last-write-wins clock; the wire that carries the stamp is that spec's to define.*

### Editing and the hand-over seal

A capture is the client's own until it reaches the pool, and immutable once it does
([core.md](core.md#editing)). The client draws the line exactly where core does:

- **Before hand-over the draft is the shell's** *(amended 2026-08-17)*. The person edits it freely
  and may discard it, and nothing ever happened — but it is a **draft in the compose surface**,
  not a `capture` operation waiting in the outbox. This clause used to place that window in the
  outbox, and there is no such window: every mutation drains, so a capture is claimed and sent in
  the turn it is enqueued. Nor does being offline make one, since an attempt that failed at the
  socket cannot be told from a lost response — which is the very case the seal exists for. So the
  outbox never holds a capture that may still be rewritten, and the client offers no free edit of
  one.
- **Hand-over seals it.** The moment the operation is sent — the `POST`, not the `201` — the
  capture must be treated as accepted, even before the response arrives
  ([core.md](core.md#editing)). A capture is id-addressed and idempotent, so a dropped *response*
  may hide a capture the pool already holds; re-sending an edited body under the same id is
  refused `capture-id-conflict` ([http-v1.md](http-v1.md#errors)). Editing after hand-over is
  therefore unsafe, and the client does not offer it as a free edit.
- **After the seal, an edit is a domain edit.** The client sends an `edit` and lets the pool
  decide its shape: an in-place amendment while the item is unprocessed, a revision once it is
  routed, archived or revised
  ([ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md)). *Amended 2026-08-24*: the
  client can now usually predict which it will get, since `archived`, `routing` and `revisedInto`
  all ride on the item it holds, but another client may have routed that item since the last read.
  So it still treats amend-versus-revise as the pool's call and reconciles to whatever the ack
  recorded. The optimistic view may show an amendment and settle into a revision; the client shows
  the reconciled result, not its guess.
- **An edit carries a source identity**, as a capture does, and the same one on every retry of
  that edit. This is what makes a retried edit idempotent: the pool matches a revision for replay
  exactly as it matches a capture, so a lost response costs a duplicate revision only if the client
  mints a fresh id for the resend. The **source is the channel the new words came in through** —
  the caller's, named per edit, the same vocabulary its captures use — rather than the source of
  the item being edited, which did not make this edit. Nothing about an edit needs a channel of its
  own: what distinguishes one source from another is the policy attached to it, and a rewrite
  through a given channel wants the policy that channel already has. That it was an edit is
  `revisionOf`, which says so without spending an identity on it. Its own id for the edit is minted
  with the operation and carried on it, and survives a reload with the operation (2026-08-25), so a
  retry after a restart claims the identity the first attempt did and the pool answers one revision.

### Source identity

Every capture carries a **source** and the source's own id for it ([core.md](core.md#intake-and-sync)).
A client stamps the source as the **capture channel**, which may be finer than the shell: a phone
that captures typed text, a voice memo and a shared-in link stamps three different sources, not
one. Per-source policy is what makes this matter — a voice-memo source may auto-request
transcription while a typed note does not ([core.md](core.md#enrichment)) — and a source per shell
would collapse that distinction. The web capture page's hardcoded `web` is the coarse end of the
same rule.

A client that mints its own capture id supplies that value as `sourceItemId` too
([http-v1.md](http-v1.md#captures)); the two identities have one answer for a client that mints at
the moment of capture.

### An attachment made offline

**The client mints the asset id and holds the bytes**, so an envelope naming a picture is complete
before anything is sent. Attaching is a store write, not a request: it costs no round trip and
nothing about it needs the pool to be there ([ADR 22](../adr/0022-the-uploader-mints-the-asset-id.md)).

**The drain sends the pair**: the bytes under the id the envelope already names, then the envelope.
The `edit` handler does the same, a revision being an ordinary capture whose payload may name an
asset the pool has never seen. Both requests are idempotent under ids minted before either was
sent, so **a failure between them retries the pair** — the upload the pool already holds answers
with the asset it holds rather than making a second one, and one capture lands.

**An asset resolves to the store's own bytes while it holds them, and through the transport
otherwise.** One rule, and the shell asks the question it always asked: what an item's pictures
are. The URL is the store's answer rather than the client's, for the same reason `assetUrl` is the
transport's — a browser adapter mints an object URL and owns revoking it.

**The bytes are released when the operation that named them leaves the outbox** — landing, or being
dismissed after a refusal — **and nothing still queued names them too**. A capture and an edit of it
hold the same asset, and whichever lands first would otherwise strand the other; an `edit` that
names bytes no capture ever did releases them itself, since nothing else will.

**A local failure is not a refusal, and an unreadable one is not a retry.** A store that could not
answer for an asset is a hiccup the next drain may not have, so the operation stays where it is; but
bytes the store hands over and cannot produce will not read on the tenth attempt either, and that
refuses the operation and waits for a person. The bytes are therefore **read rather than streamed**
into the upload, which is what tells the two apart at all — a body that fails mid-stream is
indistinguishable from a socket that closed.

**The bytes are copied when they are attached** rather than referenced. A file a picker hands over
is a pointer at something on disk, and a capture that has not drained may outlive it by days; a file
that has moved fails at the moment it is attached, in front of the person who knows what happened,
rather than at a drain that is nobody's business to watch.

**Attaching without capturing leaves bytes nothing will claim.** A shell that mints one and then
loses interest is holding bytes with no operation behind them, and nothing sweeps them; the
compose row therefore attaches and captures in the same gesture. A shell that wants a longer-lived
draft needs an answer to this, and does not have one.

**Closing a client does not revoke the URLs it minted.** They go when the bytes do, and a page that
goes away takes its own with it — so the leak is bounded by one session. A shell that builds a
second client over one store, which is what a reload is outside a browser, leaks the first one's
set; that is worth knowing before a shell starts doing it often.

### The ports — the seam for offline

The client is written against two ports the shell supplies, so that reaching the outside world is
the platform's business and the state logic over it is shared. This is core's ports-and-adapters
discipline ([ADR 8](../adr/0008-adapters-are-in-process-and-wired-by-the-host.md)) one layer up.

- **`Transport`** — how the client reaches `/v1`. A same-origin `fetch` in the web SPA; whatever a
  native shell binds. The client speaks the HTTP surface through it and knows nothing of the
  origin, the proxy, or a credential a shell might one day carry. **Including where an asset's bytes
  are**: an `<img>` fetches for itself and carries no header the transport would add, so the URL is
  the port's answer rather than one the client concatenates. A shell that is not a browser on the
  pool's origin — a native build, or a browser pointed at an authenticated remote daemon — answers it
  differently, and that is the whole reason it sits here.
- **`ClientStore`** — where the outbox and the cache live. A web shell backs it with the browser's
  own storage; a native shell with a file or a database. The client reads and writes through it and
  never names a storage engine.

A third, optional, is not a port so much as a drain: **`onError`**, where a failure with no caller
waiting on it goes — a collection that could not be read, a cache write that did not land. Unwired,
these are swallowed as they always were; what a shell does with one is the shell's.

**The store answers for every collection the client holds** (2026-08-25), one typed method per
concern rather than one opaque blob: the outbox an operation at a time, the cached items in
batches, the tags in use and the destinations each replaced whole as the pool answers them, the
**pool identity** the cache describes, and an asset's blob. **The local URL for a blob is the
store's answer, not the client's** — the same reason `assetUrl` sits on the transport. A browser
adapter mints an object URL and owns revoking it; a shell that is not a browser answers
differently. Every method is asynchronous even where an in-memory adapter answers instantly, so a
durable one is a drop-in.

**The store follows the cache, written as the cache changes**, rather than something each
path that touches an item remembers to write. Those writes are ordered, and one that fails does not
stop the ones after it — what it was following is a cache, and losing it costs a re-read, though it
is reported rather than dropped in silence. **The outbox is not followed**: it is written by the
operation that changes it and waited on, because it is the person's un-landed work rather than a
copy of something the pool holds.

**The web shell wires the browser's own storage** (2026-08-25) and the client reads it back on
start. *Amended 2026-08-26*: the attachment landed with it — bytes held in the store for a capture
that has not drained, and resolved in place of a URL ([below](#an-attachment-made-offline)). The
surfaces and reachability are described above.

**The cache's shape**, so the port serves the working set rather than an arbitrary blob: the
**queue is the offline working set**, cached as the local source of truth a person triages against;
a **window of the feed** accompanies it; and **asset blobs are cached lazily**, only for items in
the queue window, because a voice memo cannot be processed offline without its audio
([sync.md](sync.md)). What is kept and what is dropped is
[what the cache keeps](#what-the-cache-keeps). Bytes a capture of this client's own has not landed
yet are not that: they are the person's un-landed work, like the outbox, and go when it lands.

### Surfaces drawn from the cache

A page is a **position** the pool handed back, and a client that has not read the pool has none. So
a surface holding no rows the pool gave it is **drawn from the cache** instead of being empty:

- **The queue is what the client can see is unprocessed** — no routing records, not archived,
  nothing revised from it — which is the same three anti-joins the pool's own queue read makes,
  asked of the rows the client holds. **The feed is everything it holds.** Both rank by capture
  time, in whichever order the surface is being read.
- **A cache-drawn surface is marked as one.** A shell that drew it as the pool's reading would tell
  a person that three rows means they are nearly done, so the state carries the claim and what a
  shell draws from it is [shell.md](shell.md)'s. *(Amended 2026-08-26: it draws nothing above the
  rows, and reads the claim to keep an unanswered surface from being drawn as an empty pool.)*
- **Turning a surface around does not make it the client's own.** A turn throws away the position
  and the rows, and reads the new order from the start — but the surface keeps its claim on the
  pool's answer while that read is in flight, so an ordinary reorder shows an empty loading list
  rather than flashing the whole cache and snapping back. It gives the claim up only if the read
  **fails**, which is the honest reading of a surface that now holds nothing the pool gave it: it
  falls back to the cache, in the order it was turned to, and reports the failure beside it.
- **The first page the pool answers replaces it.** A cache-drawn surface holds no position, and
  stitching one onto a page the pool positioned would be two orders in one list. It is a
  replacement rather than an extension, and thereafter the surface is the pool's page as it always
  was.
- **A read that fails leaves the surface on the cache** and reports the failure beside it. The
  surface is still the client's own, because nothing replaced it.
- **A failure says which kind it is** *(added 2026-08-26)*: the pool refused the read, or the pool
  did not answer it — the same line `Unreachable` and `Refused` already draw for a mutation
  ([the outbox](#the-outbox)). They have different lifetimes. A refusal is the pool having decided,
  and it stands until something asks again; not being answered is over the moment the pool answers,
  which is why the surface stops reporting it on its own (below). A shell that drew them the same
  would leave one of them on screen after it stopped being true.
- Nothing places an item into a cache-drawn surface. Placement by rank is for a page with a window
  ([the queue](#the-queue)); a cache-drawn surface reads the cache itself, so an arrival is in it
  by being cached at all.

### What the cache keeps

The cache is a copy and never an authority, so what it holds is bounded by usefulness rather than
by anything owed to a person:

- **The working set stays, whatever its size.** Everything the client can see is unprocessed is
  what a person triages against with the pool out of reach, and capping it would cap the offline
  queue.
- **Feed history is capped**, oldest touched first out. It is the part that only ever answers a
  scroll backwards, and re-reading it costs one request.
- **An item an undrained operation is about is never evicted**, and neither is one a surface is
  currently drawing. The first is work that has not landed; the second would vanish under the
  reader.
- **So the cap bounds history the client is not drawing, and not the cache as a whole.** A page
  accumulates ids as it is walked and nothing trims it, so a person who pages a long way holds
  every row they paged — which is what the exemption above says, stated as the bound it actually
  is. The two ends coincide: the feed is read newest-first, and the rows deepest in a long scroll
  are the least recently touched, which is exactly what eviction would take. Bounding a surface
  that is being drawn is a real question and an unanswered one ([todo](../todo.md)); what is
  settled here is that the answer is not "evict it under the reader".
- The store follows the cache, so an eviction reaches it. Including one made while reading the
  store back, which is what stops it growing a session at a time.
- **A cached item carries what it answers**, so an item with attachments now costs its resolved
  `assets` as well — a filename, a media type, a blob name and a size per attachment. Bytes are
  not in it; this is what the pool said the attachments are, which is what lets an offline surface
  tell a picture from a recording without reaching for either.

Nothing warms the cache. It fills from what surfaces actually read, so an offline working set is as
large as the person's reading made it.

**A preview and a delivery's output are not in it.** The first is indicative and belongs to the
moment it was asked in; the second is bytes a person went looking for, which nothing offline can
use. A record's `note` and media type *are* cached, being fields of a record the client already
holds — what is not cached is the content behind them.

**Nor is a template's resolution or its report.** Both are about a moment: what a pattern expands
to is core's to say, and whether a vault still has the folder is the vault's. The templates
themselves are held whole, as the destinations are, and are not capped — a person configures a
handful.

### Reachability, and a pool that is not the one we cached

**Reachability is the client's, not the transport's.** Every request the client makes is evidence —
the pool answering is the only proof of reach there is — and a **probe of `GET /v1/health`** sits
behind them. A 5xx is not evidence of reach, because the client reads one as the pool failing to
decide rather than as an answer ([http-v1.md](http-v1.md#errors)).

**The probe runs in both states, ten seconds apart** *(amended 2026-08-26; it used to run only while
the pool was out of reach, on a backoff capped at thirty seconds)*. Out of reach it still doubles
from a second, capped now at ten: a pool that comes back is drained by the probe that finds it, and
half a minute of holding work that could have been sent is the cost the cap was quietly charging.
In reach it ticks at ten seconds, because the argument that a client whose requests are answered
has better evidence than a poll is an argument about a client being *used* — a shell left open and
read is asking nothing, so nothing notices the daemon go away, and the mark stays wrong until
someone acts on it. Every answered request pushes the probe out by its interval, so the used client
still sends none: the probe fires only when nothing else has spoken for ten seconds.

**The mark says when it was last answered, not only whether** *(added 2026-09-02)*. Every answered
request settles it, so the time is one a client being used carries without ever having sent a probe;
a duration is carried only where the probe was what asked, because nothing else measures its own
round trip. Before anything has answered the mark carries no time at all — the client starts
optimistic, and optimism is not evidence. A surface reading only *whether* the pool answers must not
be redrawn by a stamp that moved, which is the shell's to arrange and not the client's.

**The probe pauses while nobody is watching.** A client is told whether anyone is looking at what it
draws ([CONTEXT.md](../../CONTEXT.md)); unwatched it asks nothing, and it asks once when it is
watched again rather than waiting out the interval. So the cost is one request every ten seconds per
shell being read, not per shell left open. The signal is the shell's to give — a web shell has the
page's visibility, a native one has its own — and the cadence stays in the client.

**A pool that comes back drains the outbox**, with no mutation to prod it and nothing for a shell to
remember. Reachability is exposed for a shell to draw; the browser's `online` event is a weaker
signal — a network exists says nothing about the daemon — and a shell may still use it as a second
no, or as a hint to drain sooner than the backoff would.

**A return that arrives inside a drain rides it** *(added 2026-08-26)*. A drain's own requests are
evidence like any other, so an operation that sends two of them and fails on the second reports the
pool as back and then gone again — and starting a drain for that would send the pair again at once,
and go on doing so for as long as the pool half-answers. So a return found by a drain does not start
another: it waits for the one already running and **reads the surfaces after it**, which is the half
nothing else would do. A drain often notices the pool is back before the probe's next tick would, and
nothing else is coming to read the surfaces on its behalf.

**And then reads the surfaces again** *(added 2026-08-26)*, after the drain rather than beside it,
so the page the pool answers already holds what was waiting to be sent. Which surfaces, and how far,
is not the same question for all of them:

- One **drawn from the cache** is read again from the start. It holds no position to continue from,
  and the pool's first page replaces what was drawn
  ([surfaces drawn from the cache](#surfaces-drawn-from-the-cache)).
- One that **walked real pages** keeps them, and loses only a failure the pool never made. Throwing
  away a long scroll to answer a reconnect costs the reader more than it is worth, and the next page
  is theirs to ask for.
- One **nobody has read** stays cold. Coming back into reach is not a reason to read something for
  the first time; the client warms nothing ([what the cache keeps](#what-the-cache-keeps)).

Without this a shell has no reconnect path of its own: a page walks forward from the position it
holds, so nothing it can call would clear a failure or replace rows it never got. Which surface is
in front of a person is the shell's business and the client cannot see it, so "was it ever asked
for" stands in for it.

**The client caches the pool identity and checks it.** The same probe answers which pool this is
([mirror.md](mirror.md)). An identity that does not match what the store holds means the pool was
rebuilt, or the shell is pointed somewhere else; either way what the cache holds describes somewhere
that no longer exists. **Detection happens when the probe runs** — on start, and on coming back
from being out of reach — because the probe is the only thing that reads `/v1/health`. In practice
that covers it, a rebuild being something that takes the daemon away; a daemon replaced fast enough
to answer every request the client made would go unnoticed for the session. The cached items and the
surfaces drawn from them are dropped, the **outbox is kept** — it is the person's un-landed work and replays idempotently into whichever pool receives
it — and the change is reported through `onError`
([ADR 23](../adr/0023-a-changed-pool-identity-drops-the-cache-and-keeps-the-outbox.md)). What a
client should *resync* after that is [sync.md](sync.md)'s and needs a wire that does not exist.

### Reactivity

The client **owns its state** — the optimistic cache, the outbox and their derived surfaces — and
exposes it as minimal observables: a `subscribe(fn)` contract the shell reads, plus imperative
methods that enqueue outbox operations. A Svelte shell consumes the observable directly; another
framework adapts it. The client depends on no reactivity library and no framework, so the state
that is hard to get right — optimistic application, draining, reconciliation — lives in the shared
package rather than being rebuilt in each shell. A shell that held the reactive state would drag
that logic out of the one place it is meant to live.

---

## Constraints

- **The client holds no domain logic core does not.** It projects surfaces, applies mutations and
  reconciles; it invents no rules, and where a decision is core's it defers to core's answer rather
  than predicting it past the optimistic moment.
- **Same-origin, no credential.** A client reaches the daemon on its own origin and the daemon
  sends no CORS headers ([security.md](security.md)); this is load-bearing, not incidental. The web
  SPA is served by the daemon in production and proxies `/v1` to it in development
  ([http-v1.md](http-v1.md#transport)), so both are same-origin. A shell that cannot be — a native
  build, or a browser build talking to a remote daemon — is outside what `/v1` defends and reopens
  authentication ([security.md](security.md)).
- **One mutation path.** Online and offline are the same path with a different drain speed. A
  feature that exists only online, or only offline, is a smell.
- **The shared client is framework-agnostic.** It imports no UI framework; the shell adapts. A
  reactivity library is allowed where it is tied to no framework — the seam is RxJS, whose
  observables Svelte reads with `$` and any other framework adapts in a few lines. What is *not*
  allowed is a surface a shell can end: the subject stays private, and what leaves is an
  `Observable`, which has no `error` or `complete` to call. An ended surface never emits again, and
  a refusal is a value the client records, never a stream failure.
- **Every mutation carries a client operation-time.** The outbox stamps it whether or not the pool
  needs it yet, so the last-write-wins key exists before the sync slice that consumes it.

---

## Prior decisions

- **Online-complete, offline seam only** (2026-08-17): this spec settles the online contract fully
  and designs the ports and outbox the offline slice plugs into, but does not specify the sync
  protocol — its wire does not exist in `/v1` yet, and specifying a contract against an undrawn wire
  is what [sync.md](sync.md) already declines to do.
- **The queue is a scrollable list, not a walked cursor** (2026-08-17): the person scrolls a list
  of everything unprocessed and picks what to process; the interface nudges oldest-first. There is
  no skip operation and no client-held processing position — only a local, per-device scroll mark.
- **The outbox carries triage, never delivery** (2026-08-17,
  [ADR 3](../adr/0003-clients-hold-an-outbox-pools-do-not-replicate.md),
  [ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)): capture, edit,
  classification and archive replay from the outbox; routing does not, so offline is triage without
  delivery, and the interface disables what it cannot queue rather than promising it.
- **Outbox-first and optimistic** (2026-08-17): every mutation is an outbox operation applied at
  once and reconciled with the pool, so there is one mutation path and offline adds persistence
  rather than a parallel one.
- **Free edits end at hand-over, not ack** (2026-08-17, [core.md](core.md#editing)): a capture is
  edited in place only before it is handed over; the `POST` seals it, because a dropped response can
  hide a capture the pool already holds and re-sending an edited body is refused. *Amended
  2026-08-17*: the pre-hand-over draft lives in the shell rather than in the outbox, because an
  eager drain leaves no window there and a failed attempt is indistinguishable from a lost
  response. The decision is unchanged; where the draft sits is not.
- **Last-write-wins is ordered by client operation-time** (2026-08-17): the stamp the person's
  device made when they acted is the key, so an offline decision is not clobbered merely for syncing
  late. Pins [sync.md](sync.md)'s open question.
- **Source is the capture channel** (2026-08-17, [core.md](core.md#enrichment)): finer than the
  shell, so per-source auto-request policy stays meaningful.
- **Hydration gates everything, and re-applies nothing** (2026-08-25): the store is read back
  before any path may touch what was read, and the operations in it are not replayed against the
  cache, which was persisted holding their effects. Gating reads as well as mutations costs a tick
  on a cold start and removes the whole class of question about what a half-read cache answers.
- **`sending` does not survive the process that claimed it** (2026-08-25): hydration reads such an
  operation back as pending, because a drain skips anything else and it would otherwise never be
  sent again. Idempotence under a client-minted id is what pays for the double send.
- **A failed read is reported, not swallowed** (2026-08-25): per collection, so a cache that cannot
  be read does not cost the outbox, and through a seam rather than a `console` the package chose on
  a shell's behalf.
- **A refusal with nothing to reverse is settled from the pool** (2026-08-25,
  [ADR 24](../adr/0024-a-refusal-after-a-restart-is-settled-from-the-pool.md)): re-read the item
  rather than persisting a before-snapshot per operation or declaring an inverse per kind. One rule
  for every kind, nothing extra persisted, and the cache converges on the authority rather than on
  a client's memory of it.
- **A surface the pool has not answered for is the cache, not an empty list** (2026-08-26): the
  alternative was to keep the surfaces empty until a read lands, which is what made a durable store
  invisible to the person holding it. The cost is that a surface changes shape when the first page
  arrives. *Amended 2026-08-26*: the shell used to name that in the register and no longer does —
  the chrome's offline mark carries it, and what the surface holds is not by itself a thing worth
  saying out loud ([shell.md](shell.md)).
- **Reachability is the client's, not the transport's** (2026-08-26): the plan for this work put it
  on the `Transport` port, on the grounds that a native shell may know it from the platform. It sits
  in the client instead — every request already passes through the client's own api layer, which is
  the only place that distinguishes a pool that said no from one that said nothing, and the probe is
  a `/v1` route the client has typed. One implementation and one backoff, rather than one per
  adapter. The argument for the port was never that a shell *could* compute it too — it is that a
  native platform signal answers **without a round trip**, where the probe costs a request per
  backoff tick. That is the condition to revisit under, and nothing else is. *Amended 2026-08-26*:
  that cost is now six requests a minute while a shell is being read, which makes the condition
  worth watching rather than merely worth stating. It is paid to a daemon on the same machine or
  the same network, and it buys a mark that is right without being asked.
- **The cache is capped and the working set is not** (2026-08-26): a browser may evict the database
  under storage pressure anyway, so the cache is treated as a cache. What is capped is history,
  because it is the part a re-read replaces for free.
- **A changed pool identity drops the cache and keeps the outbox** (2026-08-26,
  [ADR 23](../adr/0023-a-changed-pool-identity-drops-the-cache-and-keeps-the-outbox.md)): a rebuilt
  pool has lost its tombstones, so a cached copy of something purged before it could never be
  contradicted. The outbox is the one thing whose loss would cost work and the one thing that
  replays safely regardless.
- **The client owns state and exposes observables** (2026-08-17): the hard state logic lives in the
  shared package behind a `subscribe(fn)` seam, not in each shell.

---

## Open questions

- [ ] 2026-08-17 — Whether the shared client is one package or splits — a headless core and a
      Svelte-binding layer — once a second shell (Tauri) actually exists. Not decided while there is
      one shell; the seam is designed so the split is cheap if wanted.
- [x] 2026-08-17 — The `Transport` port's shape in detail, settled with the code that first
      implements it. *Answered 2026-08-26*: it is what it was. `ClientStore` was settled on
      2026-08-25 by the durable adapter that first implemented it, and reachability — the one thing
      still thought to be owed here — turned out to belong to the client rather than to the port
      (above). The transport stays a way to reach `/v1` and to say where an asset's bytes are.
- [ ] 2026-08-17 — Whether a shell should surface the outbox to the person — pending, draining,
      refused — as a visible list, or keep it invisible until something fails. The offline slice,
      where a drain can be long, is what forces the question.
- [x] 2026-08-17 — How an `edit` operation still in the outbox coalesces with a later `edit` of the
      same item, once edits can queue offline. *Answered 2026-08-26*: it does not. Two edits of one
      item are two operations, drained in order, and the pool decides what each one is — the second
      may amend what the first amended, or revise what it revised. Coalescing would mint one
      identity for words written twice and lose whichever answer the pool gave the first, and
      nothing about a queue that drains slowly makes that better.
- [x] 2026-08-17 — **How a client reads its store back on start.** *Answered 2026-08-25*: hydration
      runs before anything may touch what it reads, re-applies nothing, and drains as soon as it
      lands; a refusal with no reversal to run is settled by re-reading the item
      ([ADR 24](../adr/0024-a-refusal-after-a-restart-is-settled-from-the-pool.md)).
- [ ] 2026-08-17 — **What a non-browser shell puts behind `Transport.assetUrl`.** The port asks the
      shell where an asset's bytes are, which is the seam; what a native shell answers with — a custom
      protocol, an object URL and the lifetime that implies, a local cache path — is for the shell that
      first needs one. The web answer is a URL on the pool's own origin.

---

## Acceptance criteria

- A mutation is reflected in the interface before the pool answers, and settles to the pool's
  result once it does; a refusal rolls it back and is shown.
- The queue renders as one oldest-first scrollable list; scrolling past an item enqueues nothing
  and changes nothing, and a processed item leaves the list.
- Reloading a shell restores roughly where the person had scrolled, and that mark is never sent to
  the pool or shared with another device.
- Capturing while the pool is unreachable leaves the item in the outbox, applied to the local view;
  it reaches the pool on reconnect, exactly once, under the id it was given.
- A draft can be edited and discarded before it is captured; once it is, the same edit is offered
  only as a domain edit and the interface never re-sends a changed body under the original id.
- A tag added to an item appears before the pool answers and leaves the item where it was in the
  queue; a tag and its own untag still resolve by client operation-time.
- An edit of an item that turns out to have been processed since is shown as a revision, matching
  what the pool recorded, not as the in-place amendment the client optimistically drew.
- An amended item stays where it was drawn in the queue, and an edit retried after a lost response
  leaves one revision rather than two — **within a session**, until the outbox survives a reload.
- Archiving is available with the pool unreachable; routing and marking-processed-by-hand are not,
  and the interface says why rather than queuing them.
- A tag added on one device and the same tag removed on another resolve to whichever the person did
  later by their own clock, not to whichever synced last.
- A tag field completes from what the pool carries, offers a tag used a moment earlier without a
  reload, goes on completing from the last list it read once the pool becomes unreachable, and still
  accepts a tag that is on no list at all. A client opened cold with no pool completes from nothing,
  which is the unread store rather than this.
- Eight tags drained together read the tags in use once.
- A client opened cold against an unreachable pool offers every routing template it last read, and
  can draw none of their expanded places — the resolution is asked, and asking fails.
- Editing a template with the pool unreachable is refused rather than queued, as editing a
  destination is.
- A trigger tag added with the daemon down applies its template when the outbox drains, and one
  whose template has gone stale comes back as a refused operation the person is shown.
- Removing a trigger tag whose routing still stands comes back refused in the same way, saying that
  cancelling the routing is what takes the tag back.
- An item routed from a surface says where it went on that surface's own row, without a further
  read.
- A typed note, a voice memo and a shared link captured from one shell carry three different
  sources.
- A picture captured with the daemon down is drawn from the bytes the client holds, survives the
  client being built again over the same store, and lands as one asset and one item — including
  when the capture failed after the upload and went again.
- A client opened with the daemon down draws the queue and the feed from what it holds, marked as
  what it holds, and the first page the pool answers replaces that rather than being appended to it.
- A routed, an archived and a revised-from item are all absent from a cache-drawn queue and all
  present in a cache-drawn feed.
- An outbox filled with the daemon down drains when the daemon comes back, with nothing done to
  prod it, and the client does not poll while the daemon is answering.
- A daemon answering a different pool identity from the one the store holds leaves the client with
  no cached items, the outbox intact, and something reported.
- Cached history past the cap is evicted oldest-touched-first, and an item that is unprocessed or
  has an undrained operation is not evicted whatever the cap says.
- The shared client builds and runs with no UI framework imported, and a shell observes its state
  through the subscribe contract alone.
