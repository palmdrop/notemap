# Spec: The web shell

**Status**: Implemented
**Last updated**: 2026-09-03
**Shipped**:

- 2026-09-03 — **The corner says what happened, not only what was refused.** A gesture that empties
  a row says where it went, names the capture it was about, and says `retrying` where the pool
  recorded a decision it has not carried out; the row lingers wearing what became of it rather than
  vanishing; and the shell learns of a delivery that failed, or was given up on, minutes later by
  reading the action log on its own tempo. Confirmations go on their own, failures hold until they
  are cleared, and every notice leads to where the whole of it can be read.
  ([plan](../plans/notices-as-they-happen.md),
  [ADR 32](../adr/0032-a-shell-learns-what-happened-by-reading-the-log.md))

- 2026-09-03 — **An item has an address, and a routing record can be read.** `/items/{id}` draws
  one item as a surface of its own and `/items/{id}/records/{recordId}` draws one record in full —
  the destination by name, the capability, the state, when the decision was made, the arguments it
  was given against the capability's own schema, and the pointer, as text. Triage is untouched:
  the row still opens in place, keeps its one line per record, and gains `open` and the way into a
  record as links. An item surface is not a register — no fold, no order, no position — and the
  two surfaces that are keep theirs while a person reads one item. It is also the one surface that
  says what it was drawn from, having no count to mislead and being where a person looks to find
  out what happened. A record says what the delivery did rather than the capability that did it,
  every address in the shell is a route the compiler checks, and the rail sheds the source and the
  id on every surface that drew them. ([plan](../plans/item-route-and-record-view.md))

- 2026-09-03 — **Both kinds that write files draw the typed line.** The webdav kind answers
  `candidates`, so a Nextcloud vault completes the way a folder does rather than falling back to a
  plain field. ([plan](../plans/typed-routing-composer.md))

- 2026-09-02 — **A routing composer you can type.** The place is one monospace line with the
  hierarchy drawn beneath it rather than walked through, what will happen read off it and said in
  one word, and the folders that are not there named before anything is committed. Places routed to
  before rank into the completion list and the best is offered as a greyed continuation, taken by
  its own key; one that has since vanished is marked rather than silently re-made. The destination
  is taken by typing as well as by pointing, and leaves the line once it is. `do` stops being a
  step where the line draws the place, tags are offered beside it, and a destination that cannot be
  asked refuses nothing.
  ([plan](../plans/typed-routing-composer.md),
  [ADR 31](../adr/0031-the-adapter-decides-create-or-append-at-delivery.md))

- 2026-09-02 — **Settings stops waiting to be asked.** The daemon row draws from the client's own
  reachability rather than knocking with a destination read, and says how long ago the pool last
  answered; every offered destination is asked what it can do and whether it is really there as the
  page draws, per row. A webdav destination's account is chosen from what the daemon declares
  instead of typed. ([plan](../plans/destination-checks-and-accounts.md))

- 2026-09-02 — **The action log is a surface of this shell.** `/log` is a route of the app rather
  than a page the daemon serves: the same register, the kind wearing the state mark, `detail`
  flattened generically into pairs rather than stringified, and the accent spent on the three kinds
  that are failures and on the failure code beside them. Its rail takes a measure of its own, and
  the order and the subject filter live on the URL. The count of what is shown, and a refusal in
  its place, sit in the chrome.
  ([plan](../plans/log-in-the-shell.md), [ADR 29](../adr/0029-the-action-log-is-a-shell-surface.md))

- 2026-09-01 — **A required field left blank is sent blank, not dropped.** Both forms built from a
  schema — the composer's arguments and a destination's settings — omitted every empty field, so a
  filesystem destination's `directory`, which is required and means the root when it is empty, was
  refused as missing. Routing into a vault's own root was a thing the form described and could not
  do. An optional field left blank is still absent, which is what optional means.
  ([plan](../plans/destination-webdav.md))

- 2026-08-31 — **The composer walks what a field could hold.** A field carrying
  `x-notemap-candidates` draws a browser in the `Group`/`Option` idiom `where` and `do` already
  use — entries at the current scope, `back`, `use <label>` where the scope stood in is something
  the field may hold, and `clear` at the top — beside its free-text input rather than instead of
  it. An entry may be somewhere to look without being something to take, which is how browsing for
  a note descends through folders. A refusal to browse reads as the ordinary
  condition, never an alarm. The control is chosen through a lookup keyed by destination kind,
  falling back to the schema-driven browser for every kind that registers nothing; none does yet.
  ([plan](../plans/destination-targets.md))

- 2026-09-01 — **Settings holds the access tokens.** What exists, when each was last used, a name
  to mint one under, and the string shown once with a way to copy it — because the daemon kept a
  hash and has nothing to answer with afterwards. Beside the destinations, in the same one-column
  measure, and drawn only for a session: the routes are a session's alone, so a token-carrying
  shell is not offered a section it would only be refused.
  ([plan](../plans/login-and-access-tokens.md))

- 2026-08-31 — **The shell draws a login, and nothing behind it.** Where a password is set and
  nobody is signed in, the chrome draws one surface and no pool material — cached or not — because
  drawing it because it happens to be local would make signing out mean nothing. It goes on saying
  how much unsent work it holds, which is the person's. Settings gains the way back out.
  ([plan](../plans/login-and-access-tokens.md))

- 2026-08-26 — **Offline is said twice, not three times.** The register entry that named a surface
  drawn from the cache is gone from the queue and the feed; the chrome's mark and a row's `pending`
  already carried it. In its place the foot of a surface with more to read says the pool is out of
  reach and offers no page it cannot fetch. A read the pool refused keeps its entry, in the accent.
  ([plan](../plans/quieter-offline-marks.md))
- 2026-08-26 — **A capture made yesterday no longer looks like one the pool has.** A row says
  `pending` in the rail while this client's outbox still holds work about it, muted rather than
  inverted: what became of an item in the pool and what has not been sent yet are different claims,
  and an archived row that has not drained carries both. A surface drawn from the cache says so
  once, in the register, so three rows do not read as a queue nearly done. The read failure beside
  it is the refused one alone — unreachable was already stated in the chrome, and a surface repeats
  it nowhere. A picture draws the bytes the client is holding until the pool has them.
  ([plan](../plans/shell-offline-marks.md))
- 2026-08-26 — **The end a reader starts from survives a reload.** The order control's choice is
  named on the URL and remembered per surface, so a read reloads as the one that was being read and
  a shared link opens at the end it was shared at. The queue and the feed keep their own, having
  different ends to start from. ([plan](../plans/reconnect-and-remembered-order.md))
- 2026-08-25 — **The action log is a register.** `/log` stopped being a second visual language —
  rounded cards, a system sans, a weight nothing else uses — and became the same two columns as
  the queue and the feed, with the shell's bar on top. It still loads nothing but the daemon, so
  the roles are restated in the page and a test holds that copy to `styles/tokens.css`. `/docs`
  stays as it is. ([plan](../plans/queue-two-column-rail.md))
  *Superseded 2026-09-02*: drawing the register in two places was the cost this carried, and it
  came due. The page is deleted rather than repaired, and the copied palette and its test go with
  it ([ADR 29](../adr/0029-the-action-log-is-a-shell-surface.md)).
- 2026-08-24 — **Settings is legible.** One column at a reading measure, no rail and nothing to
  furl, with the hierarchy carried by capitals, tracking and rules rather than by a second type
  size. Destinations open in place to what they can do and the four things that can be done to
  them; the daemon section says where this shell is talking to and whether it answers, timed, on
  request. Deleting asks first and offers retiring instead, and the pool's refusal lands inside the
  asking. A **`--color-good`** role joins the four: green is a result and never an intention.
  ([plan](../plans/queue-two-column-rail.md))
- 2026-08-24 — **The register is two columns, and routing is a modal over them.** The left column
  became a **metadata rail** carrying the stamp, the state word, the tags and where the item went on
  every row, and the item's facts on the one that is open; the right column carries the capture and
  nothing else. Both surfaces are one grid, so the columns stay in register down the page. The rail
  **furls** from the bar and takes the stamp into the body with it, so a furled rail never costs a
  row its way open. Routing left the register for a **modal**, which is what let the spine, the
  separators, the connector and the panel the page had to widen for all go. The bar gained the furl
  toggle, the order control, and `N waiting` — the outbox count that answers the pending mark this
  spec had been carrying as an open question. **Not shipped**: `record` beside `capture`, nothing
  capturing audio. ([plan](../plans/queue-two-column-rail.md))
- 2026-08-24 — **A row says it was revised, and offers the edit only where there is one to make.**
  The word on the older row is `revised` rather than `superseded`, since a revision does not replace
  what it names, and the edit action is drawn from `archived`, `routing` and `revisedInto` on the
  row itself. The last touch stopped being described as what the queue is ordered by and reads as
  what it is: the only record that an unprocessed note was rewritten. **Not shipped**: any way to
  ask for a revision — the queue offers the edit and holds unprocessed items only, and the feed
  offers none, so a revision is something this shell can read and not something it can make.
  ([plan](../plans/editable-until-processed.md),
  [ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md))
- 2026-08-20 — **The designed shell is built.** `apps/ui` draws the queue and the feed as one
  register: two columns, one line weight, ink structure, and the accent reserved for action and
  alarm. Every colour, face, size and measure is a role defined once in `styles/tokens.css`, and the
  three Tailwind namespaces are cleared so a component naming its own colour does not compile — a
  test over `src/components`, `src/routes` and `src/styles` is the second gate. The queue is the root route and
  carries capture as its first row; a row opens in place on its own stamp, one at a time, and
  routing escalates into a composer beside it that steps through where, what to do, and the
  arguments the schema asks for. The feed says what became of a row and keeps tags editable on every one of
  them. A refusal has the bottom-left corner to itself; work merely waiting for the daemon is left
  to the one mark in the bar. Settings enters at the bar's right end and holds the exits to the
  daemon's own pages. **Not shipped**: CommonMark, the renderer being unchosen; and a visible mark
  for pending work.
  ([plan](../plans/shell-design-port.md))
- 2026-08-20 — **A row says where it went, and a tag field completes.** `Item` carries a routing
  summary ([core.md](core.md#routing)), so the feed draws `routed` and a `routing` line naming the
  destinations and what is still pending, without a read per row; the records themselves are still
  what an opened row reads, and it no longer asks for them where the summary says there are none.
  The tag chooser completes from `GET /v1/tags` and still takes a name that is on no list.

---

## Outcome

A person opens notemap on a phone or at a desk, captures a thought in one gesture, watches it land,
and works the queue down to nothing. The interface is legible about which of two conditions it is
in — the pool within reach or out of it — and never dresses the ordinary one as a failure.

This spec is the shell's half of what [client.md](client.md) deliberately leaves out: "component
trees, styling, layout and the choice of UI framework are the shell's." It names the surfaces'
shape, the vocabulary the components are written against, and the token roles the visual direction
fills in. It does not name a colour or a font; those come out of the design session and land in
`apps/ui/src/styles/tokens.css`.

---

## Scope

### In scope

- Two surfaces: **the queue**, which carries capture as its first row, and **the feed**, plus
  **settings**, which is chrome's own page rather than one of the two.
- **Settings**: the destinations a pool can reach, what each can do, and whether the daemon
  answers.
- **The row**: one design serving both the list and an item being processed, in a collapsed and an
  opened state.
- **An item at an address**, and one of its **routing records** at an address under it: what an
  item is and what became of it, and what one decision was — where it went, what it was given, and
  where it landed.
- **The chrome**: navigation over three surfaces, the reachability indicator, and where a refused
  operation goes.
- The **token roles** — colour, type, spacing, named by role — that every component is written
  against, and the rule that no component names a colour directly.
- Rendering a text payload as CommonMark, and drawing a payload type this shell does not know.

### Out of scope

- **An enrichment surface.** Suggestions and artifacts are not on the wire (below), so settings
  holds destinations and the daemon's pages and nothing about enrichment.
- **An archive surface.** `/v1/archived` exists and no shell surface reads it. Archived items are
  marked where they appear in the feed; nothing lists them.
- **A standalone item route.** Processing happens in the row (below), so `/items/:id` is not a
  surface this shell draws.
  *Superseded 2026-09-03*: it is one. Triage never left the row, but a routing record carries an
  argument object, a pointer and shortly the whole content that was delivered, none of which fits
  in a register row and none of which anyone reads at a glance
  ([below](#an-item-has-an-address)).
- **`/docs`.** The playground is a vendored Swagger UI, and restyling somebody else's application
  is not this design's job. `/log` left this list on 2026-08-25, being drawn in this language while
  still the daemon's markup, and is a surface of this shell outright since 2026-09-02 (below).
- **Enrichment.** Suggestions and artifacts are not on the wire — `Item` carries no enrichment
  field and the two suggestion operations have no encoder — so there is nothing to draw and no
  slot is guessed at.
- **New client behaviour**, with one named exception: the reader's order control, drawn here and
  built in the port, which carried the parameter into `@notemap/client`.

---

## Behavior

### The shape of the shell

Two columns, designed at 375px and given air on a wider screen. There is no second layout: no
two-pane desktop, no bottom bar, no sheet. *Amended 2026-08-24*: the second column is the metadata
rail, and it survives a phone rather than collapsing into the first.

Navigation names **two** surfaces — the queue and the feed. Capture is not one of them: it is the
first row of the queue. The log is not one either: it is a surface of this shell and reached from
settings, being what a person opens when something has gone wrong rather than part of the round
they make. Settings holds the destination list, the way to the log, and the exit to the daemon's
`/docs`, none of which sit beside the two as equals. **Settings sits at
the bar's right end**, after the reachability mark, with the other thing that is true of the shell
rather than of a surface — not beside the two surfaces as a third.

The chrome carries what is true of the shell rather than of any item: whether the pool is
reachable, how much the outbox is still holding, whether any operation has been refused, and which
end the surface is read from. *Amended 2026-08-24*: the order control moved here from the surface,
being a reading preference. The furl did not: it belongs on the edge it moves.

### Capture is the first row of the queue

The compose field is the register's first row, in the same two columns as everything under it: the
current date and time on the left, the field on the right, `capture` and `attach` where a row's
actions sit. **The compose field is the row it is about to become**, and the date it shows is the
one the capture will keep.

A capture asks nothing — text, an optional attachment, send. *Amended 2026-08-26*: nothing waits on
the pool any more. The client mints the asset id and holds the bytes, which go up with the capture
when it drains ([client.md](client.md#an-attachment-made-offline)), so a picture is captured in the
turn the button is pressed whether or not the daemon is there — and the row attaches and captures
in one gesture, bytes with no capture behind them being bytes nothing will claim.

The queue is therefore where notemap opens: the surface you are meant to empty, with the way to
add to it at the top of it.

### The row

**Processing happens in the row, opened in place.** The queue is one scrollable list a person works
freely ([client.md](client.md#the-queue)), and leaving it to process an item costs the reader their
place. So the row has two states, and triage never leaves them. **One row is open at a time.**
*Amended 2026-09-03*: there is an item surface as well ([below](#an-item-has-an-address)), and it
took nothing from the row — it is where what a row cannot hold is read, and the queue keeps its
place while a person is there.

**Collapsed, a row is for picking.** It carries:

- The **capture time**, prominently — the row reads as a dated entry, not as a card with a caption.
- The payload, rendered (below). Text clamps only when it is genuinely long — on the order of ten
  lines — with a visible cue that there is more. An image is large enough to recognise and bounded
  so it cannot swallow the list. A picture whose capture has not drained draws the bytes the client
  is holding, so the row looks the same before the upload as after it.
- **Tags**, always, and addable here. Tagging replays from the outbox, which makes it the one
  processing gesture that survives an unreachable pool, and it is cheap enough to do while
  scanning.
- **Revision lineage** — that this is a revision of something, or that something was revised from
  it — and **archived**, where either applies. Without these the feed shows the same note three
  times and explains nothing. *Amended 2026-08-24*: a revision no longer replaces what it names, so
  the word on the older row says it was revised rather than that it is stale
  ([ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md)), and an item may have been
  revised more than once. Where a revision **sorts** is settled: at its own capture time, like any
  capture. Drawing it beside what it came from is this shell's to choose, by grouping on the link.
- A **pending** mark when an outbox operation about this item has not yet drained. *Amended
  2026-08-26*: it is a word in the rail, muted, below the state word rather than in its idiom.
- The **last touch** when it differs from the capture time. *Amended 2026-08-24*: it no longer
  orders the queue ([ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md)), so it
  stops explaining where a row sits and becomes a plain fact about the note — worth more now that
  an unprocessed item can be edited in place any number of times with nothing else recording that
  it changed, and read among the facts a row opens with rather than on every collapsed one.

**In the feed, a row says what became of it.** The feed is the pool read completely, so routed and
archived items are in it. The state is an inverted word in the left column, under the time —
`routed`, `archived` — and a routed row carries a `routing` line naming the places it went and
what has not landed yet, which is what the item's routing summary holds
([core.md](core.md#routing)). The capability and the time belong to a record, so they are the
opened row's, not the feed's: naming them per row would be a read per row. Tags stay editable on
every row in the feed, including an archived one, which
also offers `unarchive`. A finished row's prose is muted, so live captures stand out while
scrolling.

**Opened, a row is for triage.** It adds the item's **routing records**, the facts about it the
rail holds back while scanning, and the actions — route, mark done, archive, edit. Everything there
is cheap and reversible. *Amended 2026-08-24*: the **last touch** is one of the additions. It no
longer orders the queue ([ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md)), so it
stopped being the thing that explains where a row sits and became a fact like any other.

**A whole cell opens the row it belongs to**, both of them, which is the reach a rail carrying tags
and a body carrying prose both want. A control inside one — a tag, an action, a field — is worth
clicking for its own sake and is not that click. The stamp stays a button, and is what says a row
opens at all.

**Routing is not one of those, and it does not happen in the row.** It is the only act in the shell
that composes an object rather than selecting a value: where, then what to do there, then exactly
where and how, each step depending on the last. A row of controls asserts those are siblings when
they are a chain. So `route` opens a **composer**. *Amended 2026-08-24*: it is a **modal over the
surface** rather than a panel beside the row. It names the capture it is about, since the row is
behind it, and the veil, the cross and Escape all put it away. Nothing in the register reserves
width or height for it, which is what the panel cost everywhere it was not open.

The composer is stepped, not flat: **where** (destinations, with an unavailable one saying so
rather than disappearing), then the arguments the capability's schema asks for. A settled step
stays visible with its choice marked, so the decision reads back as it is built.

**A destination is taken by typing its name as well as by pointing at it** (added 2026-09-02).
Typing narrows the list and the only match is taken by `⏎` or `⇥`; an ambiguous prefix takes
nothing and says how many matched, because taking one of several would be a guess. Taken, the
destination **leaves the line and reads in the modal's own chrome**, so what is typed after it is
nothing but the place — which is why a name holding a space or a slash needs no escaping and no
rule. The list stays exactly as it was: typing is an accelerator, and it is the way in for a
pointer and for somebody who does not know the names. Backspacing past the head of an empty place
line gives the destination back, a wrong one not being a reason to close the composer.

#### The place is one line you type

**For a destination whose kind holds a filesystem, the place is one monospace line** (added
2026-09-02, replacing the browser described here on 2026-08-31 — that control is what every other
kind still draws). Typing filters the entries at the deepest settled scope, `/` descends, `⇥`
completes the segment under the caret as far as the matches agree, `⌫` at the end of a line that
ends in one pops the whole segment rather than one character of it, and `↑↓` move through
everything the tree drew — every row the pointer could take, in the order it is drawn — while `⏎`,
left alone, routes. **The line is the value**: there is no second input beside it holding the same
string, which is what the browser-and-input pair did and neither half could see the other.

**The hierarchy is shown, not walked**: the levels along the typed path are drawn beneath the line,
each with its siblings, indented — so the context around a choice is there rather than replaced at
every step. **Taking one is going to it**, not adding its name to what is typed: an entry carries
its own path from the root, so a folder two levels up drills the line down to exactly that folder
and a note sets the line to the note. Anything else makes folders nobody meant. **Only the level
the caret is in is narrowed** by what is being typed — not the deepest that happened to answer,
which inside a folder that is not there yet is the folder above, and matching a half-typed note
against its contents empties the trail exactly while a folder is being made. `⇥` completes from
that same level and no other, so it can never finish a name into a folder that never offered it. One `candidates` call per level, debounced, every answer but the newest dropped. A
scope that answers nothing is a folder still being typed and not a failure of anything; only the
root's answer says whether the destination can be asked at all. A cut-short answer says so, since
a scope past the adapter's cap cannot be filtered into completeness client-side.

**What will happen is read off the line and said in one word** — `create` where the folder does not
hold that name, `append` where it does — and the folders that will be made are drawn **in the tree
beneath it**, in the accent as `+ drafts/`, under the deepest one that is there and with the note
itself under those. Where they will be, rather than named off to one side. The word is said only
where there is something to read it off: a level that has not answered is no evidence either way,
and nothing under a folder that is not there can be looked up at all. It is **drawn and never stored**: what is stored says *put this here*, and
the adapter decides again at delivery, when the answer is true
([ADR 31](../adr/0031-the-adapter-decides-create-or-append-at-delivery.md)). Because the word is
read rather than chosen, **`do` is not a step here**: the capability is settled, and the one escape
from it sits beside the state it overrides. `⇧⏎` says *make a new one beside it*, names what it
would be called, and stores the capability that refuses a taken name rather than writing into it —
appending to somebody's note when a new one was meant being the one place *nothing to choose* can
surprise. A blank leaf is not a gap: the name the note would get is shown before committing,
derived by the same code the adapter will run.

**Places routed to before rank into the completion list**, above what the destination merely
offers, with how often each was used. They come from the pool rather than from the browser, so
they are not per-browser, not invisible to the mirror, and not a second copy of what the routing
records already hold; the pool answers the facts and the shell ranks, which keeps a change of mind
about most-used against most-recent a change here alone. The best of them is offered as a **greyed
continuation** after the caret, matched case-sensitively — the ghost is drawn as the text still to
come, so a match that only holds when case is ignored would draw a path over the one taking it
would write. The list beneath is not case-sensitive, `↑↓` reaching a place there replacing the line
outright. **`⇥` and `→` are different keys and stay different**: one completes a segment from what
the destination offered, the other takes the whole remembered continuation. A single key meaning either depending on invisible state is the failure mode being
avoided.

**A remembered place the listing does not hold is said, not silently re-created.** A folder routed
to twelve times and now absent is not a new folder somebody meant to make — it is a sign the vault
was restructured, and this is the last moment anything can say so. It is marked `gone`, and it is
**never the greyed continuation**: the ghost is the thing a person takes without reading, so a
discrepancy stays in the list where `↑↓` reaches it deliberately. `gone` is an ordinary condition
and not one of the [three alarms](#reachable-pending-refused).

**A destination that cannot be asked refuses nothing.** No tree, no drawn word — there is nothing
to infer and nothing that needs inferring — but the line is still typed and `route` is still live,
the record being made and the delivery deferred, which is what `unreachable · best effort` says. A
kind that offers no listing at all draws the same plain line with its own word. Both are muted
lines rather than alarms, and both are distinct from an unreachable **pool**, which is a different
condition and one in which the composer never opens, the row's own `route` being disabled. Where a
place has been routed to before it still completes against either, because the pool holds those
and the pool is reachable whenever the composer is open.

**The composer says a word, never a sentence.** A field's own `description` is a sentence written
for a schema and is not drawn here; what a field means is its label and its control. Where the line
draws the place it carries no label at all — `where` is the destination's step, one above — and
what sits beside it is a terse row rather than a step, as `tags` is. The caret is in the composer
from the moment it opens: the destination line has it, the place line takes it when a destination
is taken, and the destination line takes it back when the place is released.

**Which control a field draws is a lookup keyed by destination kind**, and it decides on the kind
alone: what a field means is the kind's business, and a capability one kind shares with another
does not make their contents the same shape. A kind that cannot enumerate what it holds draws neither line nor
tree and keeps the schema-driven browser — the entries at the current scope as marked options,
`back` to the scope before it, `use <label>` to take the scope stood in, `clear` at the top — the
same `Group`/`Option` idiom `where` already uses, with free entry beside it, and `do` still a step,
its capabilities being its own and nothing here able to pick among them.

It is shaped for what routing is about to become. A preview of the converted bytes, and a slot
above `where` for a decision that arrived **pre-filled with an attribution** — which is the one
shape a routing rule, a capture template and an enrichment suggestion all produce. Neither exists
yet; the composer leaves them somewhere to land.

### An item has an address

**`/items/{id}` draws one item, and `/items/{id}/records/{recordId}` draws one of its routing
records** *(added 2026-09-03)*. Both are surfaces rather than modals: the modal idiom belongs to
the composer, which is a decision being made, and these are things being read.

**Triage is still the row, and nothing left it.** What an address adds is somewhere to read
deliberately. The register goes on drawing one line per record, because that is a summary and a
summary is what a row is for; what the line gains is the way into the record it summarises.

**The way in is `open`** — last in the opened queue row's actions, and on every feed row, the feed
being read rather than worked. It is a link and not a button, so a new tab and a copied address
come with it. Making the row's body navigate was the rejected half: on the queue that click is
triage, and an address must not cost it.

**An item surface is not a register.** It offers no fold, remembers no order and holds no position
of its own — it is one entity rather than a list with an end to start from. The queue and the feed
remember theirs while they are drawn and stop while they are not, so leaving one to read an item
and coming back reads the same order at the same place.

**The actions are the row's**: route, mark done, archive, edit, and tagging, which is on every row
in this shell. A surface that could only be read would be the one place a tag cannot be added. The
overlap with the opened row is real and is being watched rather than resolved; nothing that fits
on a row has moved off it.

**It says what it was drawn from, and it is the only surface that does.** Every other one says
nothing (above), because the chrome and the row already say it twice and a third sentence over
three cached rows reads as a queue nearly drained. Neither holds for one item: there is no count
to mislead, and nothing else on the surface is saying it. An item view is exactly where a person
looks to find out what happened, so it is the worst place to imply the pool has answered. The mark
is `from cache`, in the rail, in `pending`'s muted idiom rather than the inverted one — what this
client holds is not what became of the item.

**An item the pool does not have is said plainly, and is not a failure.** A link outlives the item
it names.

**Records are the pool's or they are nothing.** Nothing caches one, so a surface drawing records
says out of reach as out of reach, muted and offering nothing, while the item beside it goes on
drawing from whatever the client holds — one surface, two answers about freshness, which is what
the three conditions are for.

**A record is drawn in full**: what the delivery did, the destination by name, the state, when the
decision was made, the arguments it was given, and the pointer to where it landed. Marking
processed is routing whose destination is the person, so it reads as one, with its note where the
arguments would be, and `none` where there is no note.

**What it did is said, not the capability that did it.** A capability name is what a destination
advertises and what a rule is written against ([CONTEXT.md](../../CONTEXT.md)), and a person
reading one record wants what happened: `Created a note`, `Appended to a note`, `Created or
appended to a note` for the one that is both until the adapter reaches the vault
([ADR 31](../adr/0031-the-adapter-decides-create-or-append-at-delivery.md)). The word is the
shell's, since nothing on the wire carries a readable one; a capability this shell has never heard
of is said by its name, which is worse than a sentence and better than silence. It is not labelled
`action`, that being an entry in the pool's log and a word the glossary tells a capability not to
borrow. The **arguments are drawn against the capability's own schema** where the
destination can be described, so a person reads `Directory` rather than `directory`; where it
cannot be described they are drawn by their own keys, which is the honest fallback and not a
failure. Anything the record carries that the schema does not name is drawn all the same: the
record is what happened and the schema is only what is offered now. The **pointer is text**. It
becomes a link once a destination has somewhere to put one; the shell never guesses whether a
string is a URL.

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

The known names are the **tags in use**, read from `GET /v1/tags` when the shell starts and again
whenever classification drains ([client.md](client.md#the-outbox)), and filtered locally as the
person types. They are an offer and never a limit: a name that is on no list is written by typing
it, and the chooser stays useful once the pool goes out of reach, which is the whole reason tagging
sits on the collapsed row.

**Tagging is offered in two places, and they are not redundant** (added 2026-09-02). The composer
offers the same chooser beside the place being routed to, because classifying and filing are one
thought and making the person close one surface to finish the other splits it. This costs nothing:
routing is never an outbox operation and the composer only opens when the pool is reachable, so
the composer's chooser is a convenience that exists exactly when routing does. The **collapsed
row's chooser is the one that survives an unreachable pool**, and that is why it stays where it is
rather than moving into the composer.

The two drain apart. A tag taken in the composer is the same outbox operation the row makes, and
it lands whatever becomes of the route beside it — a route that fails leaves the tags applied,
which is the honest outcome: the person said what the item was, and that was true independently of
where it was going.

Describing a destination is I/O that can hang on an unmounted drive, so **only the chosen one is
ever described** — which is why a destination is settled before anything is asked of it, rather
than a flattened destination×capability list being offered up front.

### Reachable, pending, refused

Three conditions, and each of them is drawn as itself. *(Amended 2026-08-26: it used to paint two
of them the same colour.)*

- **Unreachable** is stated **once**, in the chrome, as a small persistent mark. It is not repeated
  on every row, and no surface repeats it either: a read that never reached the pool draws no
  failure, and the only other place it is said at all is the foot of a surface with more to read,
  which is where a page would have been offered (below). Actions that need the daemon
  are visibly unavailable and read as unavailable, not as broken. Capture, tagging, editing and
  archiving stay live, because they replay from the outbox.
- **Pending** is quiet, and it is two marks answering two questions *(amended 2026-08-26)*. The
  bar's `N waiting` answers whether anything at all is outstanding, including for rows nobody is
  looking at, and says nothing while there is nothing. A row's own `pending` mark answers whether
  *this* row is, and sits in the metadata rail — muted, and deliberately not in the inverted idiom
  `routed`, `archived` and `revised` use: those say what became of the item in the pool, this says
  what this client has not sent, and an archived row that has not drained carries both without
  either shouting over the other. Pending is the ordinary state of a mutation and it heals itself,
  so neither mark is drawn in the shape a refusal is.
- **Refused** is loud. It gets a fixed place in the bottom-left corner carrying what was refused,
  why, and a way to dismiss it — the left corner because the right is where a composer lives, because it is the only one of the three that will not resolve without a person. It is not
  drawn in the same shape as pending work.

**A surface says nothing about what it is drawn from** *(amended 2026-08-26)*. It used to: while the
pool had not answered for the queue or the feed, the surface named itself in the register and said
that this was what the client holds. That entry is gone. Between the chrome's `offline` mark and a
row's `pending` mark the condition is already stated twice, and a third sentence above the rows was
the loudest of the three about the quietest thing. What replaces it is the **foot**: a surface with
more to read says, where `Load more` would be, that the pool is out of reach and that nothing more
can be fetched — muted, in the foot's own place, with no action offered. It is drawn from
reachability rather than from what the surface holds, because a surface drawn from the cache while
the pool answers is one whose read is about to land and it has nothing to say. A surface read to
the end says nothing either: there is no next page to be denied.

*Amended 2026-09-03*: one surface does say it — an item at its own address, which draws one thing
and has no count to mislead ([above](#an-item-has-an-address)).

A read the pool **refused** keeps the register entry, in the accent, being the one read failure that
will not resolve without a person; it does not go to the corner, which belongs to the outbox — an
operation, with an id, that a person dismisses — and a failed read has neither. A read the pool
never answered still draws no failure at all.

### The corner says what happened

*(2026-09-03.)* The corner a refusal has always had is where the shell says anything at all in its
own voice, and a refusal is one of the things it says rather than the whole of it. A **notice** is
work that has already happened, reported to somebody who did not ask: an item routed and where it
went, a delivery that failed, a delivery given up on. **One place, with gradations** — a second
corner would be a reader learning where to look to learn nothing more.

**A confirmation goes on its own and a failure holds.** Anything a person may have to act on stays
until they clear it, which is the rule the refusal already followed; a success is a glance and
leaves after a few seconds. The accent is spent on the second kind and on nothing else, as it is in
the log.

**The refusals sit at the bottom of the stack**, being the ones that will not clear themselves, and
the bottom of the corner is its reachable end. Above them the newest notice sits nearest, and the
corner holds four: past that the oldest confirmations go, and standing notices never do. Neither
does the one just raised — a corner full of failures that swallowed the confirmation of what
somebody has this second done would be hiding the one thing they are waiting for. What there is
still no room for is counted, with a way through to the log.

**A gesture speaks when its subject leaves the screen.** Routing, marking done and archiving take
the row away and therefore say where it went; tagging and editing leave it in front of you and say
nothing, because the row is its own evidence and a notice per tag is noise. A failure at a control
that is still on screen is said **at the control** — the composer keeps its modal open on a refusal,
a row keeps its own line — and the corner is for what has nowhere else to be said.

**A routing says only what the record says.** A decision the pool recorded and delivered names
where it landed; one it recorded and has not carried out reads as **retrying**, and claims no
landing. The difference is not a nicety: a pending record is one whose delivery was attempted and
did not go, and the shell saying `routed` there would be inventing the one fact only the delivery
can establish. What it landed as is said later, by the corner, when the pool writes it.

**A notice names the capture, not only the place** *(2026-09-03)*. Three lines: what happened and
where, the path a copy went to, and — muted under both — the stamp the row was read by and the
capture's own first words. A place and a path say where something went; only the excerpt says
*what* went, and by the time a notice is read the row it names has left the register. Where the
notice came from the log rather than from a gesture, the item is read for it, because the log names
an id and nobody recognises a note by its id.

This is the one place the shell's **copy is more than a word or a mark**. Everything else it says
sits beside the thing it is about, and a notice does not: it is read on its own, about a row that
has gone, possibly minutes later. `retrying · Vault` over `not delivered yet · notes/daily.md` is
three facts a person can act on; `deferred` was one word nobody could act on, which is what the
brevity cost here *(amended 2026-09-03, after reading it in use)*.

**Signing out leaves nothing standing.** The corner is emptied with the rest of what the door
shuts on: a failure about a delivery nobody can now look up would outlive the session that raised
it.

**The row is watched out rather than vanishing.** A row that has been routed, marked done or
archived holds its place for one beat wearing the word for what became of it, then goes. It is the
shell drawing what it has just done and nothing about what the pool holds, so it takes no handler:
it cannot be opened and its actions are gone with it. A reader who has asked for less movement is
shown none — the row goes at once rather than lingering more briefly.

### What happened while nobody was asking

*(2026-09-03.)* A delivery is deferred and carried out later, so the interesting half of a routing
happens when nobody is looking at it. The shell **reads the action log on its own tempo**
([client.md](client.md#the-action-log)) and says what it finds, so a failure minutes after the
decision reaches the person who made it without anybody opening `/log`.

**Four kinds are said out loud and no others**: `routed`, `delivery-failed`, `work-failed`,
`work-abandoned` — the three the log already spends the accent on, and the landing. Everything else
the log holds stays in the log, which is what it is for. That set and the log's accent set are the
same set, deliberately, and are stated together so they cannot drift.

**Nothing is said twice.** A notice is keyed by the **routing record** rather than by the log entry:
a delivery retried four times is one thing that went wrong, and a landing this shell already
reported when the decision was made is the same fact arriving a second time.

**A delivery given up on says the item is back in the queue**, because it is — giving up removes the
reservation, and the row returns on its own. That is the one condition nothing else in the shell
could ever explain, and it is why this exists.

**A notice leads to where the whole of it can be read**: the log narrowed to the item, or the log
plain where the work was about no item. The link carries no order — coming from outside the log
there is none to carry, and the URL is the more specific statement about a read.

**A catch-up is bounded, and a long one is not read out at all.** A shell that has been away a
moment is told each thing that happened. One that has been away long enough for the read not to
reach back to its mark is told only how many, standing, with a way through to the log — a page of
failures nobody may dismiss is not a report of a day. There is one such mark at a time: a second
long absence replaces the first rather than stacking on it.

### Draining

The queue's job is to reach zero and the API gives no count — `ItemSlice` carries values and an
optional `next` link, nothing more. So the shell claims no number. `Load more` is the honest
statement that more exists — and while the pool is out of reach the foot says that instead of
offering a page it cannot fetch. **The empty state is designed as the thing you were working
toward**, not as a grey apology.

The reader's **order control** is in the bar and acts on whichever surface is being read; settings
has no end to start from and it says nothing there. Which end a reader starts from is the reader's,
for the queue as for the feed ([CONTEXT.md](../../CONTEXT.md)). Turning a surface around reads it
again from that end ([client.md](client.md#the-queue)) — a position belongs to the order that made
it — so the control is a choice of order, not a re-sort of what is on screen.

**The choice is the reader's to keep** *(amended 2026-08-26)*. The order is named on the URL, so a
read reloads as the one that was being read and travels as the one that was shared; and it is
remembered, so a fresh visit opens where the last one left off. **Per surface**: the queue starts at
the oldest, which is why it is a queue, and the feed at the newest, so one preference over both
would have to overrule one of them. The URL wins over what was remembered — being the more specific
statement about the read in front of you — and an order named there that is not one falls through to
what was remembered rather than failing. Turning a surface **replaces** the URL rather than pushing
it: which end you read from is not a place to go back to.

### Settings

Settings is not a register and is not drawn as one. It is read rather than scanned, so it takes a
**narrower measure** than the two surfaces — which is itself the signal that it is a different kind
of page — in **one column**, with no rail and nothing to furl.

**One type size, and the hierarchy comes from capitals and rules.** Three levels, meant to be
countable: a **section** is muted ink at the widest tracking with a full-weight rule under it; a
**destination** is full ink at tighter tracking with a mark in the margin; a **field** is lower
case, muted, in a column of its own. Nothing is bigger and nothing is bold.

Four sections *(two when this was written, and the door brought the others)*. **Destinations** says
how many are offered and how many retired, then one line per destination: a mark for offered or
retired, its name, its kind, and what it last answered. Opening one adds what it can do, the
settings its kind asked for, its id, and the four things that can be done to it — check, edit,
retire, delete — with the rule and the distance separating what can be undone from what cannot.

**Each one is asked what it can do, and whether it is really there, as the page draws**
*(2026-09-02)*, without waiting to be told to. Asked **per row**, so the first kind that has to go
and look leaves one line saying it is asking rather than holding up a list that is already drawn
from pool state. A **retired** one is not asked — it is offered to nothing new — and keeps the
control for a person who wants to know anyway. A **settled** answer is not asked again: what it can
do once it has said, and whether it is there once that is `ready`, `rejected` or a kind that cannot
be asked. One that could not be reached *is* asked again when the pool comes back into reach, since
that is the moment worth re-asking on.

**What it answered about being there is what the row leads with**, because it is the stronger fact:
`reached` in green, and a refusal in the accent, which is the colour for a thing a person has to
act on. A destination whose kind cannot be probed says nothing at all and looks exactly as it did
before probing existed. What could not be *described* still wins over both, an unusable destination
being a bigger fact than an unreachable one.

**A settings field the kind published values for is chosen, not typed** *(2026-09-02)*. A webdav
destination's account is one of the accounts the daemon declares, drawn as a list; a field with
nothing published stays a box, so a daemon declaring no accounts does not trap a person behind an
empty one. A value the destination already holds that the daemon no longer declares is offered too,
marked as such — opening the form must not quietly move a destination somewhere else.

**Daemon** says where this shell is talking to, and carries the way to `/log` and the exit to the
daemon's `/docs` — one of this shell's own routes and one the browser leaves for, marked apart. Its
first row is the one fact on the page that is about *now* rather than about configuration: whether
the daemon answers, when it last did, and — where the probe was what asked — how long it took.
**Nothing is pressed to find out** *(2026-09-02)*: the client probes on its own while anyone is
watching and every answered request settles the same mark, so the row is drawn from what the client
already knows rather than from a second, manual notion of reach. The control beside it asks again,
out of the probe's turn, for a person who would rather not wait for the next one.

**Session** says whether this browser holds one and offers the way out, or — on a daemon nobody has
set a password on — says the door is open and names the command that shuts it.

**Access tokens** is what something that is not a browser carries, and is drawn **only for a
session**: the routes behind it are a session's alone, so a token-carrying shell is not offered a
section it would only be refused. One line per token, with when it was made and when it was last
used, which is what says whether one is safe to revoke. Minting takes a name and answers with the
string **once** — the daemon kept a hash and has nothing to answer with a second time — so it is
shown in the accent, selectable, with a way to copy it, and dismissing it is a deliberate act rather
than a navigation.

**Deleting is the one thing on this page that cannot be undone, so it is the one thing that asks**,
and the asking offers retiring instead. Only the pool knows whether a record has ever named a
destination, so its refusal is the answer — and the refusal lands *in the asking*, where the
alternative it leaves is already on screen.

### The log

`/log` is the same register: a rail carrying the stamp and who did it, a body carrying what
happened, what it was about and the detail, one rule across the top of every cell. It is a surface
of this shell like any other *(2026-09-02; it was the daemon's markup, drawn in this language,
until then)*, so there is no leaving the app and coming back, and no second copy of anything to
hold in step.

**The kind is what the row is**, and it wears the register's state mark rather than reading as body
text. **The accent is spent on `delivery-failed`, `work-failed` and `work-abandoned`**, which are
the same three the corner says out loud, and on the failure code beside them — not on `purged`,
`destination-deleted` or `actions-cleared`, which are facts rather than warnings. A log where half
the rows are red says nothing.

**`detail` is flattened generically, never per kind**: dotted keys, strings unquoted, arrays
joined, nested objects flattened. `ActionKind` has twenty-seven members and will gain more, so a
renderer per kind is that many places to drift from a shape nobody updates — and a kind nobody has
written yet reads correctly for free.

**A subject is shortened to its head and tail and links to the log narrowed to it.** The
destination on a `routed` row stays an id: the action recorded one, and resolving it to a name is a
second read and a cache. The order and the filter both live on the URL, so a reload and a shared
link come back to the same reading.

**The rail takes a measure of its own**, narrower than the register's — it holds a stamp and one
short word where the register's holds a row's whole account — and `2026-09-02` fits on one line at
every width. Below the breakpoint the stamp stacks and a `detail` pair stacks, so a path takes the
measure rather than what is left beside its key.

The count of what is shown sits in the chrome, and a refusal takes its place there, in accent. A
pool that never answered is not one: the reachability mark already says *offline* once, for the
whole shell, and no surface repeats it.

`/docs` is the daemon's own page, a vendored Swagger UI, and is left alone: restyling somebody
else's application is not this design's job. Settings marks the two apart — one of this shell's
routes, and one the browser leaves for.

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

This is what makes the port mechanical: a block of `@theme` in `styles/tokens.css`, and components that
stop carrying forty inline `dark:` variants.

**Which palette is on is the reader's**, and one small control in the **bottom-right corner** cycles
`auto`, `light`, `dark`. `auto` is the browser's own answer and the default, because it is the only
one that can be right before a person has said anything. The choice is remembered and applied
**before first paint**, or the page shows one palette and corrects itself in front of the reader.
It is the only chrome outside the bar: the bar carries facts about the shell, and this is a
preference. The right corner because the left one belongs to a refusal.

### Visual direction

*Settled 2026-08-19, in the design session, against a set of visual references held outside the
repository. What they settled is below; the directory itself is not tracked, so nothing here rests
on being able to open it.*

**Industrial bones, paper skin.** Technical rather than terminal: strict structure and countable
alignment on a warm ground rather than a cold grey one.

**Every surface is a register.** Not a list of cards — an index, in the sense the references all
share: a fixed column of times, a wide column of content, and a margin carrying marks. The row
reads as a dated entry in a ledger, which is why the capture time is its title.

**Two columns do the work that type hierarchy usually does.** *Amended 2026-08-24.* The left
column is a **metadata rail**, and it carries the same things whether a row is open or shut: the
stamp, the state word where there is one, the tags, and where the item went. Opening a row adds the
item's facts under them — payload type, edited — rather than changing what the column is for.
*Amended 2026-09-03*: the source and the id left that list. They are notemap's bookkeeping rather
than the item, an id is in the address of the surface that has one, and a rail carrying four facts
where two are unreadable is what made the column look like a debug pane. The right column holds nothing but what was captured, and its actions once the row is open.
One system, reused, and nothing is distinguished by being bigger.

**The rail can be furled.** An arrow rides the seam the rail's edge makes, in its own strip above
the register, and takes the left column to nothing — which gives the prose the whole measure
without hiding a row or changing what a row can do. It sits on the edge it moves rather than in the
bar, where a word for it was further from the thing it was about. The rail holds the button that
opens a row, so a furled rail hands the stamp to the body rather than taking it away. *Amended
2026-08-26*: the state word and the pending mark are handed over with it, since what a row became
and what has not drained are what the acceptance criteria ask to be legible at a glance, and a
reading preference is not a reason to lose either. Tags, routing and the opened row's facts stay
behind, being what the reader asked for the measure back from. The reader's answer is remembered,
like the palette.

**A surface that is a register without being a list of captures does not offer the fold.** Settings
is the one, and there is nothing in it worth reading without its left column.

**Both surfaces are one grid.** Each item drops two cells into it — a rail cell and a body cell —
so the columns stay in register down the whole page without either one being told how tall the
other is.

**A phone keeps both columns.** *Amended 2026-08-24.* An earlier version collapsed to one below
34rem. It does not: below 44rem the rail narrows to the width of a stacked date and time, the facts
put their values under their names, and the two columns survive, because the rail is what says what
a thing is.

**The grid is drawn, and it is rules rather than boxes.** Nothing is ever boxed or given a border
on four sides. A rule runs across the top of every cell, lighter than the bar's own, and stops at
the gap between the columns — so a row reads as two entries side by side rather than as a band
across the page. *Amended 2026-08-24*: the separator that ran into the spine, and the spine itself,
are gone. Nothing needs a vertical rule now that the second column is real.

**The frame has a measure.** The page is capped short of a desktop's width and nothing widens it,
routing having left the register for a modal.

**Green means a result, and only a result.** *Added 2026-08-24.* Something was asked and the answer
was yes: a destination that answered, a daemon that is reachable. It is never spent on an intention
— `add a destination` is ink, because nothing has happened yet and the reply to it is what earns a
colour. Its opposite is the accent, which on settings reads as the thing that went wrong or the
thing that cannot be undone. Each says so twice, in a mark and in a word, so the colour is never
the only thing carrying it.

**Lines are ink. Red means a warning or an action, and nothing else** — the route action, the
arrow marking where an item went, the edge of the row being processed, a refused operation, a link
under the cursor. Red is never structure and never body text, so it appears only where something is
being done or has gone wrong.

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
- Tokens live in `apps/ui/src/styles/tokens.css` as `@theme`. The global stylesheets sit together
  under `apps/ui/src/styles/` — the roles, the shared `@utility` patterns, and the base layer — and
  `routes/layout.css` is the import list that pulls them in. `tokens.css` is the one file allowed to
  name a value, and the gate exempts it by that path.
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
  *Amended 2026-09-03.* There is an item surface now, and the reasoning above is what shaped it
  rather than what it overturned: the row is unchanged, the way in is an action rather than the
  row's own body, and the place a reader had is kept by both surfaces while they are away from it.
  What the row cannot hold is what earned the address — an argument object, a pointer, and the
  delivered content that is coming — none of it triage.
- **Settings is not a register.** *2026-08-24.* It inherited the two-column layout because
  everything did, and paid for it: a label gutter down a page whose content is already
  label-and-value, and a fold control on a page with nothing worth reading without its left column.
  One column at a narrower measure says "different kind of page" without a second type size.
- **Green is a result, never an intention.** *2026-08-24.* The first draft put green on
  `add a destination` and red on `delete`, which made red mean danger here and *the action* on the
  queue, where `capture` and `route` wear it. Spending green on what came back instead leaves the
  accent doing one job on every surface, and leaves the creating affordance in ink — which is
  honest, since pressing it has produced nothing yet.
- **The destination list is the connectivity probe.** *2026-08-24.* `/v1` has no route whose only
  job is to answer yes, and adding one to learn what a read already proves is a route to keep
  forever. Reading the destinations answers both questions at once and refreshes the page while it
  is at it.
  *Superseded 2026-09-02.* `/v1/health` is that route and has been since
  [client-minted-assets-and-health](../plans/client-minted-assets-and-health.md); the client has
  been probing it every ten seconds all along. The row was holding a second notion of reachability
  and drawing "unasked" beside a chrome that already knew, which is the cost this reasoning did not
  foresee: the objection was to *adding* a route, and by the time it was written one existed.
- **The rail is one column, not two jobs.** *2026-08-24.* The left column used to be a stamp
  collapsed and a label gutter opened, which made it dead space on every row a reader was only
  scanning. Carrying the same metadata whether a row is open or shut costs nothing at a desk, gives
  the reader something to scan by, and makes opening a row an addition rather than a change of
  subject. Furling is the answer to the reader who wants the prose instead, and is cheaper than a
  second layout.
- **Routing is a modal, not a panel beside the row.** *2026-08-24.* The panel was answering "the
  item must stay on screen", and it charged the whole shell for it: the register reserved a second
  column, the row reserved a measured height, and the page widened whenever one opened. A modal
  names the capture it is about instead, which is the part of the row the decision actually needs.
  What is lost is the item being readable beside the choice; what is bought is that nothing in the
  register has to know a composer exists.
- **Routing escalates out of the row into a composer.** Routing is composition, not selection, and
  a flat control set hides the dependency between its parts. It is also the only irreversible act
  in the shell, so it is the one that earns a deliberate surface — which is what "fast capture,
  deliberate processing" already asks for. The composer sits beside its row rather than over it, so
  the item never leaves the screen. **The row's height is the contract**: the panel is out of the
  row's flow, so the row reserves the measured height and the register's second column reserves the
  width. A composer wider than one panel, or open on two rows at once, is outside what that
  arrangement holds.
- **Red is spent on action and alarm, not on structure.** An earlier version made red the
  line-work. At five separators plus a spine it stopped meaning anything; ink carries structure and
  red is reserved for what a person must do or attend to.
- **Unreachability is stated once.** Forty rows repeating one global fact is noise; the fact is
  true of the shell, so it lives in the chrome.
- **Pending and refused are drawn differently.** They shared a red row and a shape until
  2026-08-26; pending is self-healing and ordinary, refused is terminal until a person acts, and
  painting them alike teaches the reader to ignore both. Pending is now muted ink in the rail and a
  refusal keeps the accent.
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

- [x] 2026-08-19 — **Where known tag names come from.** Answered 2026-08-20: `GET /v1/tags` reads
      the tags in use ([http-v1.md](http-v1.md#the-tags-in-use)), the client holds the whole set,
      and the chooser filters it as the person types. The derivation from the client's cache was
      the rejected half: it is right only for the items that happen to be loaded.
- [ ] 2026-08-19 — **Which markdown library, and whether captured markdown is sanitised before
      rendering.** A library choice is the developer's. `@tailwindcss/typography` is already a
      dependency and unused.
- [x] 2026-08-19 — **`/log` and `/docs` remain in the daemon's own visual language.** Answered
      2026-08-25 for half of it: `/log` is drawn in this language, restated in the page because it
      loads nothing from anywhere but the daemon, with a test holding the copy to `tokens.css`.
      `/docs` is a vendored Swagger UI and stays as it is. **Answered again 2026-09-02**, the other
      way: `/log` is not the daemon's page at all any more, so there is no copy to hold and no
      second language to keep in step. `/docs` is unchanged, and the answer for it is the original
      one ([ADR 29](../adr/0029-the-action-log-is-a-shell-surface.md)).
- [x] 2026-08-19 — **Nothing can enumerate a destination's folders.** Answered 2026-08-31: the
      destination port gained `candidates`, asked about a field rather than a path
      ([ADR 26](../adr/0026-a-destination-can-be-asked-what-an-argument-could-hold.md)), and the
      composer draws a browser for any field whose schema carries `x-notemap-candidates`, one scope
      at a time rather than as a refreshed enum.
- [x] 2026-08-19 — **A pending operation has no visible mark.** Answered 2026-08-24: the bar says
      `N waiting`, counting the outbox operations that have not drained and never a refusal, which
      has the corner to itself. It says nothing while there is nothing, since pending is ordinary
      and heals itself. Per-row was the rejected half: the fact is about the outbox, and forty rows
      repeating it is the noise unreachability was already spared. *Amended 2026-08-26*: the row
      gets one after all, in the quieter idiom. The noise argument holds for a fact true of the whole
      shell, which unreachability is and this is not: `N waiting` and the row's mark answer different
      questions, and neither answers the other's.

---

## Acceptance criteria

- The whole design is legible and operable at 375px wide, with the rail intact, and no surface
  requires a second layout to be usable at a desk.
- Furling the rail leaves every row still openable and every action still reachable.
- Routing is dismissable without reaching for the mouse, and nothing in the register moves when it
  opens or closes.
- A queue row can be told at a glance to be a revision, to be archived, or to have work not yet
  drained, without opening it and with the rail furled or not.
- A row's capture time is the first thing read on it.
- A text capture containing a heading or a list renders as a heading or a list, not as its
  characters.
- A capture whose payload type the shell does not know is visible, names its type, and can still be
  tagged, archived and routed.
- A surface drawn from the client's cache is drawn as itself, with nothing above the rows to say so;
  a queue holding three cached rows does not read as a queue nearly drained.
- With the pool out of reach, a surface with more to read offers no `load more` and says in its foot
  why, and offers it again once the pool answers.
- A picture captured with the pool out of reach draws the picture, and the same row after the drain
  draws the pool's copy.
- With the daemon unreachable: the chrome says so once, no row and no surface repeats it, capture
  and tagging and editing and archiving remain operable, and routing and mark-done read as
  unavailable rather than as broken.
- A refused operation is distinguishable from a pending one without reading either, and only the
  refused one offers a dismissal.
- Routing a queued item is reachable in two choices from the opened row when the capability needs
  no argument fields, and the modal says which capture it is about.
- Choosing a destination describes that destination and no other.
- A feed row that has been routed says so and names where it went, and drawing a page of them costs
  one read; opening a queue row that has been nowhere costs none.
- The tag field offers what the pool already carries, offers a tag used a moment ago without a
  reload, and still accepts one that is on no list.
- An unavailable destination reports its reason rather than failing silently or appearing routable.
- The queue's empty state is a designed surface, not a sentence.
- Settings is legible at one type size: a reader can tell a section from a destination from a field
  without any of them being larger than the others.
- Deleting a destination cannot happen in one press, and the reason the pool gives for refusing it
  is readable without dismissing anything.
- The daemon section reports reachable, unreachable and unasked as three distinguishable states,
  and asking costs one request that the page needed anyway.
- `/log` is reached without leaving the app, draws the same register as the queue and the feed, and
  reads what it draws through `@notemap/client`.
- A `detail` of a kind nobody has written a renderer for is still readable, and the accent falls on
  the three kinds that are failures and on nothing else.
- The log's rail holds `2026-09-02` on one line at every width.
- An item opened at its own address draws what the opened row draws, and one followed with the
  pool out of reach draws what the client holds and says that is what it is.
- Leaving the queue or the feed to read one item and coming back reads the same order at the same
  place, and the row still opens in place.
- A routing record's arguments are readable as the destination names them, and still readable as
  keys when it cannot be described; its pointer is never a link.
- A routing record says what happened to the item in a sentence, and says it by the capability's
  name only where this shell has no sentence for it.
- No surface draws an item's id or its source, and no label in a rail runs under the value beside
  it however long the label is.
- Every address this shell builds is a route id checked against the route tree, so a path that no
  longer exists fails `pnpm -r typecheck` rather than a click.
- No component in `apps/ui` names a colour; every colour comes from a token role defined in
  `styles/tokens.css`, and switching the palette requires no change to a component.
