# Spec: The client

**Status**: Draft — the online contract is settled; the offline protocol is a designed seam, unbuilt
**Last updated**: 2026-08-17
**Shipped**:

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
  shell's. This spec names surfaces and behaviour, never markup.
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
- **The queue** — the pool read as unprocessed, unarchived items, oldest first. Presented as **one
  scrollable list** (see [the queue](#the-queue)).
- **An item** — its payload, tags, enrichment state, suggestions and routing records, and the
  actions that process it.

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
- **The list reorders under the reader, and that is sound.** Every event that moves an item gives
  it a content time of now, placing it at the newest end, ahead of a reader working the oldest;
  every event that removes one hides it ([core.md](core.md#the-queue)). Fresh and resurfaced work
  therefore accumulates at the far end while the oldest drains, and the client renders that
  without special handling.

### The outbox

Every mutation a client makes is an **outbox operation**: applied to the client's cache at once,
so the interface never waits, and drained to the pool — immediately when the pool is reachable, on
reconnect when it is not. The online client is the offline client with a fast drain; there is one
mutation path, not two.

**The vocabulary.** An operation is one of:

- `capture` — a new item;
- `edit` — a change to an item's content ([editing](#editing-and-the-hand-over-seal));
- `tag` / `untag` — classification;
- `archive` / `unarchive` — queue state;
- `accept-suggestion` / `reject-suggestion` — a decision on a suggestion.

**Routing is not in it.** Marking an item processed by hand is routing to the user destination
([core.md](core.md#the-queue)), and routing is a decision that must reach the pool
([sync.md](sync.md), [ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)):
the outbox carries captures and classification, never deliveries. So a client that cannot reach
the pool can capture, tag, archive and edit — triage — but cannot route or mark an item done. This
asymmetry is deliberate and the interface makes it visible: an archive is available offline; a
route or a mark-done is disabled until the pool is reachable, rather than queued into a promise the
outbox cannot keep.

**Draining and reconciliation.** An operation is applied optimistically, then confirmed against the
pool's answer:

- On success the client replaces its optimistic state with what the pool returned. The pool is
  authoritative; the optimistic copy was a guess held only until the truth arrived.
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

- **Before hand-over** — while the `capture` operation still sits un-sent in the outbox — the
  person edits it freely, in place, and the edits coalesce. It is not in the pool, so there is no
  revision and nothing to reconcile. The person may also discard it, and nothing ever happened.
- **Hand-over seals it.** The moment the operation is sent — the `POST`, not the `201` — the
  capture must be treated as accepted, even before the response arrives
  ([core.md](core.md#editing)). A capture is id-addressed and idempotent, so a dropped *response*
  may hide a capture the pool already holds; re-sending an edited body under the same id is
  refused `capture-id-conflict` ([http-v1.md](http-v1.md#errors)). Editing after hand-over is
  therefore unsafe, and the client does not offer it as a free edit.
- **After the seal, an edit is a domain edit.** The client sends an `edit` and lets the pool
  decide its shape: an in-place amendment if the item is still the unprocessed head, a revision
  otherwise. A client cannot know whether it still holds the head, so it treats amend-versus-revise
  as the pool's call and reconciles to whatever the pool recorded on the operation's ack
  ([ADR 11](../adr/0011-in-place-amendment-of-the-head.md)). The optimistic view may show an
  amendment and settle into a revision; the client shows the reconciled result, not its guess.

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

### The ports — the seam for offline

The client is written against two ports the shell supplies, so that reaching the outside world is
the platform's business and the state logic over it is shared. This is core's ports-and-adapters
discipline ([ADR 8](../adr/0008-adapters-are-in-process-and-wired-by-the-host.md)) one layer up.

- **`Transport`** — how the client reaches `/v1`. A same-origin `fetch` in the web SPA; whatever a
  native shell binds. The client speaks the HTTP surface through it and knows nothing of the
  origin, the proxy, or a credential a shell might one day carry.
- **`ClientStore`** — where the outbox and the cache live. A web shell backs it with the browser's
  own storage; a native shell with a file or a database. The client reads and writes the outbox and
  the cache through it and never names a storage engine.

**Today the online client wires a trivial pair** — a direct `fetch` transport and an in-memory
store — and drains the outbox as fast as the network answers. **The offline slice supplies durable
adapters**, not a new client: a store that persists across a restart, and a transport that reports
reachability so the outbox drains on reconnect. Because the seam is here from the first line,
offline is a matter of wiring, not a rewrite.

**The cache's shape**, so the port serves the working set rather than an arbitrary blob: the
**queue is the offline working set**, cached as the local source of truth a person triages against;
a **window of the feed** accompanies it; and **asset blobs are cached lazily**, only for items in
the queue window, because a voice memo cannot be processed offline without its audio
([sync.md](sync.md)). Retention and eviction are the offline slice's to fix; the direction is
fixed here so the port is designed for it.

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
- **The shared client is framework-agnostic.** It imports no UI framework and no reactivity
  library; the shell adapts.
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
- **Free edits end at hand-over, not ack** (2026-08-17, [core.md](core.md#editing)): a pending
  capture is edited in place only while un-sent; the `POST` seals it, because a dropped response can
  hide a capture the pool already holds and re-sending an edited body is refused.
- **Last-write-wins is ordered by client operation-time** (2026-08-17): the stamp the person's
  device made when they acted is the key, so an offline decision is not clobbered merely for syncing
  late. Pins [sync.md](sync.md)'s open question.
- **Source is the capture channel** (2026-08-17, [core.md](core.md#enrichment)): finer than the
  shell, so per-source auto-request policy stays meaningful.
- **The client owns state and exposes observables** (2026-08-17): the hard state logic lives in the
  shared package behind a `subscribe(fn)` seam, not in each shell.

---

## Open questions

- [ ] 2026-08-17 — Whether the shared client is one package or splits — a headless core and a
      Svelte-binding layer — once a second shell (Tauri) actually exists. Not decided while there is
      one shell; the seam is designed so the split is cheap if wanted.
- [ ] 2026-08-17 — The `ClientStore` and `Transport` port shapes in detail, settled with the code
      that first implements the durable pair rather than guessed here.
- [ ] 2026-08-17 — Whether a shell should surface the outbox to the person — pending, draining,
      refused — as a visible list, or keep it invisible until something fails. The offline slice,
      where a drain can be long, is what forces the question.
- [ ] 2026-08-17 — How an `edit` operation still in the outbox coalesces with a later `edit` of the
      same item, once edits can queue offline. Trivial while the drain is immediate; a real question
      once it is not.

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
- A pending capture can be edited in place and discarded before it is sent; after it is sent, the
  same edit is offered only as a domain edit and the interface never re-sends a changed body under
  the original id.
- An edit of an item that turns out no longer to be the head is shown as a revision, matching what
  the pool recorded, not as the in-place amendment the client optimistically drew.
- Archiving is available with the pool unreachable; routing and marking-processed-by-hand are not,
  and the interface says why rather than queuing them.
- A tag added on one device and the same tag removed on another resolve to whichever the person did
  later by their own clock, not to whichever synced last.
- A typed note, a voice memo and a shared link captured from one shell carry three different
  sources.
- The shared client builds and runs with no UI framework imported, and a shell observes its state
  through the subscribe contract alone.
