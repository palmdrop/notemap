# Spec: The web shell

**Status**: Draft — designed, not built
**Last updated**: 2026-08-19
**Shipped**:

---

## Outcome

A person opens notemap on a phone or at a desk, captures a thought in one gesture, watches it land,
and works the queue down to nothing. The interface is legible about which of two conditions it is
in — the pool within reach or out of it — and never dresses the ordinary one as a failure.

This spec is the shell's half of what [client.md](client.md) deliberately leaves out: "component
trees, styling, layout and the choice of UI framework are the shell's." It names the surfaces'
shape, the vocabulary the components are written against, and the token roles the visual direction
fills in. It does not name a colour or a font; those come out of the design session and land in
`apps/ui/src/routes/layout.css`.

---

## Scope

### In scope

- Two surfaces: **the queue**, which carries capture as its first row, and **the feed**.
- **The row**: one design serving both the list and an item being processed, in a collapsed and an
  opened state.
- **The chrome**: navigation over three surfaces, the reachability indicator, and where a refused
  operation goes.
- The **token roles** — colour, type, spacing, named by role — that every component is written
  against, and the rule that no component names a colour directly.
- Rendering a text payload as CommonMark, and drawing a payload type this shell does not know.

### Out of scope

- **Settings and destinations.** The surface exists and works; it inherits the tokens and nothing
  else this iteration.
- **An archive surface.** `/v1/archived` exists and no shell surface reads it. Archived items are
  marked where they appear in the feed; nothing lists them.
- **A standalone item route.** Processing happens in the row (below), so `/items/:id` is not a
  surface this shell draws.
- **The daemon's own pages.** `/log` and `/docs` are rendered by the daemon, in its own markup.
  They will not match this design until someone restyles them there.
- **Enrichment.** Suggestions and artifacts are not on the wire — `Item` carries no enrichment
  field and the two suggestion operations have no encoder — so there is nothing to draw and no
  slot is guessed at.
- **New client behaviour**, with one named exception: the reader's order control is drawn here and
  built in the port, because the client hardcodes the order per surface today.

---

## Behavior

### The shape of the shell

One column, designed at 375px and given air on a wider screen. There is no second layout: no
two-pane desktop, no bottom bar, no sheet.

Navigation names **two** surfaces — the queue and the feed. Capture is not one of them: it is the
first row of the queue. Settings holds the destination list and the exits to the daemon's `/log`
and `/docs`, which are not app surfaces and do not sit beside them as equals.

The chrome also carries the two things that are true of the shell rather than of any item: whether
the pool is reachable, and whether any operation has been refused.

### Capture is the first row of the queue

The compose field is the register's first row, in the same two columns as everything under it: the
current date and time on the left, the field on the right, `capture` and `attach` where a row's
actions sit. **The compose field is the row it is about to become**, and the date it shows is the
one the capture will keep.

A capture asks nothing — text, an optional attachment, send. Uploading an attachment is the one
unavoidable wait, because the pool mints the asset id the capture then references; the compose row
says so while it happens rather than appearing stuck.

The queue is therefore where notemap opens: the surface you are meant to empty, with the way to
add to it at the top of it.

### The row

**Processing happens in the row, opened in place.** The queue is one scrollable list a person works
freely ([client.md](client.md#the-queue)), and leaving it to process an item costs the reader their
place. So the row has two states and there is no separate item surface. **One row is open at a
time.**

**Collapsed, a row is for picking.** It carries:

- The **capture time**, prominently — the row reads as a dated entry, not as a card with a caption.
- The payload, rendered (below). Text clamps only when it is genuinely long — on the order of ten
  lines — with a visible cue that there is more. An image is large enough to recognise and bounded
  so it cannot swallow the list.
- **Tags**, always, and addable here. Tagging replays from the outbox, which makes it the one
  processing gesture that survives an unreachable pool, and it is cheap enough to do while
  scanning.
- **Revision lineage** — that this is a revision of something, or that it has been replaced — and
  **archived**, where either applies. Without these the feed shows the same note three times and
  explains nothing. Where a revision *sorts* is not settled here; see
  [todo.md](../todo.md).
- A **pending** mark when an outbox operation about this item has not yet drained.
- On the queue only, the **last touch** when it differs from the capture time, because that is the
  key the queue is ordered by and an item revised last night sits at the newest end for no visible
  reason otherwise.

**In the feed, a row says what became of it.** The feed is the pool read completely, so routed and
archived items are in it. The state is an inverted word in the left column, under the time —
`routed`, `archived` — and a routed row carries a `sent` line naming the destination, the
capability and when. Tags stay editable on every row in the feed, including an archived one, which
also offers `unarchive`. A finished row's prose is muted, so live captures stand out while
scrolling.

**Opened, a row is for triage.** It adds when the item was last **edited**, its **routing
records**, and the actions — route, mark done, archive, edit. Everything there is cheap and
reversible.

**Routing is not one of those, and it does not happen in the row.** It is the only act in the shell
that composes an object rather than selecting a value: where, then what to do there, then exactly
where and how, each step depending on the last. A row of controls asserts those are siblings when
they are a chain. So `route` opens a **composer**, positioned beside the row it belongs to — its
first line level with the note's, an arrow across the spine connecting them — and below 56rem it
becomes a block inside the row instead, so the item stays readable above the decision.

The composer is stepped, not flat: **where** (destinations, with an unavailable one saying so
rather than disappearing), **do** (that destination's capabilities), then the target its schema
asks for. A settled step stays visible with its choice marked, so the decision reads back as it is
built.

It is shaped for what routing is about to become. A folder tree, a preview of the converted bytes,
and a slot above `where` for a decision that arrived **pre-filled with an attribution** — which is
the one shape a routing rule, a capture template and an enrichment suggestion all produce. None of
those exist yet and none is drawn except the tree; the composer leaves them somewhere to land.

### Actions

An opened row's actions are not five of a kind and are not drawn as five of a kind.

- **Route leads.** Items are supposed to leave; the interface says so.
- **Tags sit close behind it.** They are processing, not decoration, and their control converges
  with routing's (below).
- **Mark done** and **archive** group together as the other two ways an item leaves — marking
  processed being, in the domain's words, routing whose destination is the user.
- **Edit** is an affordance on the content, not an entry in a list of actions.

### Tagging

Tagging is a **chooser over known names with free entry**, not a bare text field. It sits on the
collapsed row, because it replays from the outbox and is therefore the one processing gesture that
survives an unreachable pool.

Where the known tag names come from is open (below). The control is designed as though they exist.

Describing a destination is I/O that can hang on an unmounted drive, so **only the chosen one is
ever described** — which is why the composer's capabilities are a second step and not a flattened
destination×capability list.

### Reachable, pending, refused

Three conditions, and the current shell paints two of them the same colour.

- **Unreachable** is stated **once**, in the chrome, as a small persistent mark. It is not repeated
  on every row. Actions that need the daemon are visibly unavailable and read as unavailable, not
  as broken. Capture, tagging, editing and archiving stay live, because they replay from the
  outbox.
- **Pending** is quiet: the chrome, plus a mark on the row it is about. It is the ordinary state of
  a mutation and it heals itself.
- **Refused** is loud. It gets a real place carrying what was refused, why, and a way to dismiss
  it, because it is the only one of the three that will not resolve without a person. It is not
  drawn in the same shape as pending work.

### Draining

The queue's job is to reach zero and the API gives no count — `ItemSlice` carries values and an
optional `next` link, nothing more. So the shell claims no number. `Load more` is the honest
statement that more exists, and **the empty state is designed as the thing you were working
toward**, not as a grey apology.

Both surfaces draw the reader's **order control**. Which end a reader starts from is the reader's,
for the queue as for the feed ([CONTEXT.md](../../CONTEXT.md)); the client hardcodes it today, and
closing that is the port's work.

### Content

A **text** payload renders as CommonMark, collapsed and opened — that is what
[standards.md](../standards.md#payload-types) says a text payload is, and the shell currently shows
its asterisks.

A payload type this shell cannot draw **says so by name** and stays taggable, archivable and
routable, since none of those need to understand the content. An item never becomes an invisible
row, and adding a renderer later is additive.

### Tokens and themes

Every colour, type step and spacing step is named by **role**. Components name roles; no component
names a colour. Both a light and a dark palette are defined against those roles, and the design is
drawn in one of them — the other follows from the definitions rather than from a second design
pass.

This is what makes the port mechanical: a block of `@theme` in `layout.css`, and components that
stop carrying forty inline `dark:` variants.

### Visual direction

*Settled 2026-08-19, in the design session, against the references in
[docs/inspiration/](../inspiration/).*

**Industrial bones, paper skin.** Technical rather than terminal: strict structure and countable
alignment on a warm ground rather than a cold grey one.

**Every surface is a register.** Not a list of cards — an index, in the sense the references all
share: a fixed column of times, a wide column of content, and a margin carrying marks. The row
reads as a dated entry in a ledger, which is why the capture time is its title.

**Two columns do the work that type hierarchy usually does.** A fixed left column names what a
thing is; a wide right column holds it. Collapsed, the left column carries the date over the time.
Opened, that same column becomes the field-name column — `tags`, `edited`, `routing`. One system,
reused, and nothing is distinguished by being bigger.

**The grid is drawn, and it is rules rather than boxes.** Nothing is ever boxed or given a border
on four sides. There is **one line weight**. A separator between captures begins where the content
column begins — clear of the timestamps — and runs right until it meets the spine, so every capture
makes one T-junction against it.

**The spine is on the right.** A vertical rule runs down the outer edge of the register. When a
routing composer is open it is also the divider between the register and the composer, and a small
arrow interrupts it at the row being routed.

**Lines are ink. Red means a warning or an action, and nothing else** — the route action, the
connector marking a routing in play, a refused operation, a link under the cursor. Red is never
structure and never body text, so it appears only where something is being done or has gone wrong.

**Type: two faces, one size each.** A serif for what a person wrote, monospace for everything the
interface says — the bar, timestamps, field names, values, tags, actions. The wordmark is the serif
in small caps.

**The faces are the browser's own** — the generic `serif` and `monospace` families, no webfont.
A shell that needs a font server to look right is not offline-friendly
([standards.md](../standards.md) #1), and the design is carried by the columns, the single line
weight and the two sizes rather than by a particular typeface. Alegreya and Courier Prime are what
the design was drawn in, after
[the-proportional-web](https://owickstrom.github.io/the-proportional-web/), and remain the
reference if self-hosted faces are ever wanted.

Every monospace element is the same size; prose is one step larger, because it is the only thing on
the page a person actually reads. Three-character indents on successive paragraphs are kept.

---

## Constraints

- SvelteKit, Svelte 5 and Tailwind v4, static build, served by the daemon from its own origin. No
  new framework, no CSS-in-JS, no component library.
- **The shell holds no domain logic.** Anything this design implies that the client does not expose
  is a change to `@notemap/client`, made deliberately, not a rule smuggled into a component.
- Tokens live in `apps/ui/src/routes/layout.css` as `@theme`.
- The queue is one scrollable, paginated list. Nothing navigates away to process an item.
- Only the chosen destination is described; `describe()` may hang.
- There is no count of the queue and none is invented.
- Tests live beside components and assert what the shell draws, enables and disables — the existing
  suite in `apps/ui` is the floor, not the ceiling.

---

## Prior decisions

- **The item surface is the row, opened.** The queue is specified as one list a reader works
  freely, and an item route would cost them their place on every item. One design serves the list
  and the processing surface, and routing records and lineage get somewhere to live without the
  collapsed row accreting controls.
- **Routing escalates out of the row into a composer.** Routing is composition, not selection, and
  a flat control set hides the dependency between its parts. It is also the only irreversible act
  in the shell, so it is the one that earns a deliberate surface — which is what "fast capture,
  deliberate processing" already asks for. The composer sits beside its row rather than over it, so
  the item never leaves the screen.
- **Red is spent on action and alarm, not on structure.** An earlier version made red the
  line-work. At five separators plus a spine it stopped meaning anything; ink carries structure and
  red is reserved for what a person must do or attend to.
- **Unreachability is stated once.** Forty rows repeating one global fact is noise; the fact is
  true of the shell, so it lives in the chrome.
- **Pending and refused are drawn differently.** They currently share a red row and a shape.
  Pending is self-healing and ordinary; refused is terminal until a person acts. Painting them
  alike teaches the reader to ignore both.
- **No counts.** The API has no total to give, and a number meaning "how much I fetched" will be
  read as "how much is left".
- **Semantic tokens, one theme mocked.** A second full palette is a second design pass; role names
  make it a definition instead.
- **Capture time is the row's title.** It makes the list read as dated entries and gives the row a
  hierarchy that five equal grey lines do not.
- **Unknown payload types are named, not hidden.** A watched folder or another client can put any
  payload type in the pool; an item that renders as an empty row is worse than one that says what
  it is.

---

## Open questions

- [ ] 2026-08-19 — **Where known tag names come from.** There is no `/v1/tags`, so the tag chooser
      has no source of truth. Either a route that reads the tags in use — a change to
      [http-v1.md](http-v1.md) — or a derivation from the client's cache, which is right only for
      items that happen to be loaded. Until one lands, the chooser offers nothing to choose.
- [ ] 2026-08-19 — **Which markdown library, and whether captured markdown is sanitised before
      rendering.** A library choice is the developer's. `@tailwindcss/typography` is already a
      dependency and unused.
- [ ] 2026-08-19 — **The order control needs a client change.** `reads.ts` fixes the order per
      surface and `loadFeed` / `loadQueue` take no arguments. The design draws the control; the
      port either carries that parameter and amends [client.md](client.md), or ships a stub.
- [ ] 2026-08-19 — **`/log` and `/docs` remain in the daemon's own visual language.** Restyling
      them is the daemon's work and nobody has claimed it.
- [ ] 2026-08-19 — **Nothing can enumerate a destination's folders.** The composer draws a folder
      tree; `describe()` returns capabilities and a `targetSchema` and that is the whole vocabulary.
      Either the adapter publishes an enum it refreshes at describe time, or the destination port
      gains a method for asking — which is the same seam [todo.md](../todo.md) predicts for preview,
      so it would have two callers.
- [ ] 2026-08-20 — **Settings has no way in.** Navigation is two surfaces and settings is neither.
      It needs a place in the bar, or somewhere else deliberate.
- [ ] 2026-08-19 — **A pending operation has no visible mark.** The spine's markers were removed as
      clutter, and pending was the visible half of the offline story. Candidates: inverting the
      row's timestamp, or a word in the row's left column.

---

## Acceptance criteria

- The whole design is legible and operable in a 375px-wide column, and no surface requires a
  second layout to be usable at a desk.
- A queue row can be told at a glance to be a revision, to be archived, or to have work not yet
  drained, without opening it.
- A row's capture time is the first thing read on it.
- A text capture containing a heading or a list renders as a heading or a list, not as its
  characters.
- A capture whose payload type the shell does not know is visible, names its type, and can still be
  tagged, archived and routed.
- With the daemon unreachable: the chrome says so once, no row repeats it, capture and tagging and
  editing and archiving remain operable, and routing and mark-done read as unavailable rather than
  as broken.
- A refused operation is distinguishable from a pending one without reading either, and only the
  refused one offers a dismissal.
- Routing a queued item is reachable in two choices from the opened row when the capability needs
  no target fields.
- Choosing a destination describes that destination and no other.
- An unavailable destination reports its reason rather than failing silently or appearing routable.
- The queue's empty state is a designed surface, not a sentence.
- No component in `apps/ui` names a colour; every colour comes from a token role defined in
  `layout.css`, and switching the palette requires no change to a component.
