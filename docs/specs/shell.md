# Spec: The web shell

**Status**: Implemented
**Last updated**: 2026-09-08
**Shipped**:

- 2026-09-08 — **The browse becomes a line, and one capability stops being a question.** The
  schema-driven control is now the shape the typed line already had: one field, what the
  destination offers under it, **narrowed to what is typed**, `⇥` to finish a name and `↑↓⏎` to
  take one — so an account of two hundred are.na channels is typed at rather than scrolled
  through. It completes to the **value** and matches on the label as well, because the two need not
  be the same string: a channel is read by its title and filed under its slug. Descent stays, being
  the one thing the line has no use for. A long answer draws as a handful with the rest a press
  away, what a destination last said is drawn while it says it again, and a title named exactly
  resolves to the value it stands for — while anything unrecognised is left as written and still
  routes, an answer being one page of what a destination holds. And a destination declaring **one**
  capability has it settled rather than asked: `do` is drawn only where there is something to pick
  among. ([plan](../plans/arena-destination.md))

- 2026-09-08 — **A field the schema fixes is chosen wherever it appears.** The destination form and
  the composer read a schema's `enum` the way the template form already did, so an enum setting or
  argument is a row of options rather than a box typed from memory — which is also what stops
  `folder` being typed from memory in the composer. Taking the option already taken gives it back,
  absent being a value of its own for a field that means *inherit*. A record says what a delivery
  did in bare verbs — `Created`, `Appended` — the destination being named on the line beside it.
  ([plan](../plans/arena-destination.md))

- 2026-09-07 — **One tag files it where it goes.** Routing templates are a third band in the
  composer's `where` list, above the destinations and reached by the same typed prefix match:
  taking one draws what it resolved to and leaves it editable, a template being where a decision
  starts rather than a form. A **Templates** section in settings holds them, each row asking its own
  report as the page draws, a stranded one repointed by an ordinary edit. A tag that a template
  declared is **marked as one**, naming the template, everywhere a tag is offered — and putting one
  on an item gives the corner `routing · research` with a real `cancel` while the window is open —
  said by the shell that tagged as soon as it can name the record, the log being polled more slowly
  than the window lasts, and drawn as news rather than as an alarm —
  then `routed · research` once it lands.
  ([plan](../plans/routing-templates.md),
  [ADR 34](../adr/0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md),
  [37](../adr/0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md))

- 2026-09-07 — **Every capture is a `note`, and settings says where things come from.** The shell
  still stamps two sources — `web-manual` and `web-image` — but there is one payload type, so what
  it draws as a picture is decided by each attachment's media type. Settings grows a fifth section:
  every source the pool has seen, what it captured and how long ago the last of them was, counted
  up while the page is open. It is how a relay left running is seen to still be running.
  ([plan](../plans/memos-relay.md))

- 2026-09-05 — **One way out of the queue.** `route`, `done` and `archive` were three controls of
  unclear rank; they are one, `process`, which opens the composer and never closes. What differed
  between them is the composer's first step, where a band below a rule holds the two answers no
  destination gives — `manual`, which asks where it went and offers to take the text, and
  `discard`, which acts when it is taken and is offered back from the corner. The composer opens
  with the pool out of reach, drawing what cannot be taken as unavailable, so a queue can still be
  drained offline. `unarchive` stays beside `process` on the rows that have it, all four actions
  fit one line, and `esc` gives a step back before it gives up the composer.
  ([plan](../plans/one-way-to-process.md))

- 2026-09-04 — **The shell's second pass.** One row serves the queue and the feed, opening in place
  on both, and a double click on either goes to the item's own surface. An open row is one band
  rather than two lit panels, carries only the facts that answer something, and offers its actions
  as two aligned lines by what they do — leaving the queue, then working with the item. `done` asks
  where it went and is not offered twice; `copy` takes the capture's text and says so in the
  corner; a decision made by hand can be taken back. A record reads as its destination and the
  place it landed rather than as the capability that carried it. The composer splits into two
  columns once a destination is taken — the line, the word and the tree on one, everything
  consulted or settled after it on the other — and stops moving while it is typed. The shell draws
  its own choosers, the drained queue says one quiet thing, the capture row commits on `⇧⏎` and
  shows the picture it holds. ([plan](../plans/shell-second-pass.md))

- 2026-09-04 — **The composer asks what would be written, and the record shows what went.** A
  `preview` beside `route`, asked for and never volunteered, drawing what this destination would
  write now with the sentence saying that is what it is. A destination that offers no preview and
  one that could not be reached are drawn as the ordinary conditions they are, with routing still
  live. The record view draws the destination's note about what it could not carry, reads the
  output on arrival, and makes the pointer a link where the destination offered one to follow.
  ([plan](../plans/delivery-output-and-preview.md))

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
- **Settings**: the destinations a pool can reach, what each can do, the **routing templates** that
  file to them, and whether the daemon answers.
- **The row**: one design serving both the list and an item being processed, in a collapsed and an
  opened state.
- **An item at an address**, and one of its **routing records** at an address under it: what an
  item is and what became of it, and what one decision was — where it went, what it was given, and
  where it landed.
- **The chrome**: navigation over three surfaces, the reachability indicator, and where a refused
  operation goes.
- The **token roles** — colour, type, spacing, named by role — that every component is written
  against, and the rule that no component names a colour directly.
- Rendering a note as CommonMark, and drawing a payload type this shell does not know.

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
add to it at the top of it. **The field takes the caret when the queue is drawn** *(added
2026-09-04)*, as the composer's own first control does: the surface exists to be typed into, and a
click before the first keystroke is a click nothing asked for.

**`⇧⏎` commits it** *(2026-09-04)*, from inside the field it is written in. `⏎` there is a new
line, which prose wants; the modifier is what the composer's line already uses for the gesture that
means *and do it*.

**An attached picture is drawn before it is committed**, beside its name and with a way to drop it.
The bytes go up with the capture and cannot be taken back once they have, so the one moment to look
at what was picked is before the button, not afterwards in the feed.

**Every capture is a `note`** *(amended 2026-09-07)* — prose, an attachment, or both — because
there is one payload type. What the shell still varies is the **source**: `web-manual` for a typed
note and `web-image` for one with a picture, which is what a source is for and is where policy
about the two can differ. The shell draws an attachment as a picture by its **media type**, never
by the payload's, so a note carrying a recording is not drawn as a broken image.

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

**One row serves both surfaces** *(2026-09-04)*. The queue's and the feed's differed in what they
offered and never in what they were, so there is one of them, and what a surface hands it is what
differs: the queue offers a place to depart from, since a row that leaves it has to be watched out,
and the feed offers none, keeping every row it holds. Both offer a composer. **The feed's row opens
in place**, with the facts the queue's has and one more.

**In the feed, a row says what became of it.** The feed is the pool read completely, so routed and
archived items are in it. The state is an inverted word in the left column, under the time —
`routed`, `archived` — and a routed row carries a `routing` line naming the places it went and
what has not landed yet, which is what the item's routing summary holds
([core.md](core.md#routing)). The time belongs to a record, so it is the opened row's, not the
feed's: naming it per row would be a read per row. That is the one fact a feed row carries that a
queue row does not — **where it went**, read off the records the row asks for when it opens, on
whichever surface it is. Tags stay editable on every row in the feed, including an archived one,
which also offers `unarchive` among an opened row's actions. A finished row's prose is muted, so
live captures stand out while scrolling.

**Opened, a row is for triage.** It adds the item's **routing records**, the facts about it the
rail holds back while scanning, and the actions — process, copy, edit, open. Everything there
is cheap and reversible. *Amended 2026-08-24*: the **last touch** is one of the additions. It no
longer orders the queue ([ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md)), so it
stopped being the thing that explains where a row sits and became a fact like any other.

**A whole cell opens the row it belongs to**, both of them, which is the reach a rail carrying tags
and a body carrying prose both want. A control inside one — a tag, an action, a field — is worth
clicking for its own sake and is not that click. The stamp stays a button, and is what says a row
opens at all.

**Double-clicking one goes to the item's own surface**, from either register *(2026-09-04)*.
Opening is a toggle, so a naive double would open the row, shut it, and then navigate — a flicker
nobody asked for. A click carries how many of them it is and the row takes only the first, so the
gesture reads: open, nothing, go. The single click costs no delay, which is what waiting to find
out whether a second one is coming would have cost.

**A double the browser has already spent goes nowhere** *(amended 2026-09-05)*. Double-clicking a
word selects it, which is how anybody takes text out of a page and is exactly what a person reaching
into a capture is doing; leaving the surface out from under a selection they just made is not what
they asked for. So the row goes only where the double selected nothing — which is most of it, the
gutter, the marks and the space around the prose — and the body's words stay the browser's.

**Processing is not one of those, and it does not happen in the row.** It is the only act in the
shell that composes an object rather than selecting a value: where, then what to do there, then
exactly where and how, each step depending on the last. A row of controls asserts those are
siblings when they are a chain. So `process` opens a **composer** *(amended 2026-09-05: it was
`route`)*. *Amended 2026-08-24*: it is a **modal over the surface** rather than a panel beside the
row. It names the capture it is about, since the row is behind it, and the veil and the cross put
it away — as does `esc`, once there is no step left to give back
([below](#the-composer-is-for-processing)). Nothing in the register reserves width or height for it, which is what the
panel cost everywhere it was not open.

The composer is stepped, not flat: **where** (destinations, with an unavailable one saying so
rather than disappearing), then the arguments the capability's schema asks for. A settled step
stays visible with its choice marked, so the decision reads back as it is built.

**An argument the schema fixes is chosen here too** *(2026-09-08)*, on the same terms as the
template form and the settings page: a value from an enumeration is offered as the options it is,
and anything else is a box. Taking the option already taken **gives it back**, an absent argument
being a value of its own — for a field whose absence means *inherit what the destination says*,
there has to be a way back to it.

#### The composer is for processing

*(2026-09-05.)* The `where` step answers *what became of this item*, and a configured destination is
only the commonest answer. Two more sit in a **second band of the same list, below a rule**:

- **`manual`** — the person carried it onward themselves. In the domain this is already a
  destination, routing whose target is the user
  ([core.md](core.md#the-queue)), so it belongs in this list more than it belonged on the row.
- **`discard`** — not worth keeping. This is `archive`, under the word the glossary reserves for
  meaning *this is noise* ([CONTEXT.md](../../CONTEXT.md)). It is not a destination, and the band
  is what says so without a label claiming the two have something in common.

Neither is in `GET /v1/destinations`; both are entries the shell invents. **The typed line reaches
them like anything else** — the same prefix match, the same `⏎` on an only match, the same refusal
to guess between several — because a second way of taking a choice, for two of the choices, is a
second idiom to learn for no gain.

**`discard` acts when it is taken, and nothing else in the list does.** It needs no arguments and
no second step, and making the queue's cheapest, most frequent gesture wait for a commit press
would spend three gestures on emptying a row where the row used to spend one. The inconsistency is
real — taking `vault` advances and taking `discard` acts — and it is paid for rather than denied:

**The corner says `discarded` and carries `undo`.** It **stands** rather than lingering, since it
is something a person may act on, which is the rule confirmations already follow; and there is
**one at a time**, a new discard replacing the last, so working a queue down does not stack four
standing notices in a corner that is meant to be quiet. An earlier discard loses its undo silently
and is reached in the feed, where `unarchive` is. This is the one place `undo` does not sit on the
record it cancels, and the reason is that archiving makes none: the rule below holds wherever there
is a record to put it on.

**A decision made by hand can be taken back.** `undo` sits on the record it cancels, and only
there: a delivery is the pool's and has already happened somewhere else, while marking processed is
a person saying so and is theirs to unsay. Cancelling reads the records again, the one drawn being
out of date the moment it goes.

**`manual` advances to a step of its own**, in one column — there is no place line to consult
anything beside. It holds the optional note of **where it went**, the tag chooser, and a
`copy text` beside them. Copying is **offered and never automatic**: taking `manual` says the
thought was carried onward, which may have happened yesterday or by acting rather than pasting, and
the clipboard is shared state that nothing should overwrite unasked. It is absent where the browser
gives no clipboard at all, on the same terms as [the row's `copy`](#actions). The commit sends the
note, written or empty — the field being the only thing the pool is told beyond the fact itself.

**Routing templates are a third band, above the destinations** *(added 2026-09-07)*. A template is
a decision somebody already made — a place, a filename, a folder — and offering it above the
destinations puts the shortest route to a finished decision first. It is reached exactly as
everything else in the list is: the same typed prefix match, the same `⏎` on an only match. Three
bands under one idiom, and no third way of taking a choice.

**Taking one draws what it resolved to and leaves it editable.** The destination appears in the
chrome and the expanded place on the line — `research/2026-09-07.md`, not
`research/{{captured_at}}.md` — asked of the pool, which owns the expander
([ADR 35](../adr/0035-a-templates-arguments-are-patterns-expanded-when-the-decision-is-made.md)).
The line then behaves as it always does. **A template is where a decision starts, not a form that
refuses to be corrected**: a person who took `research` and wants this one note in `reading/` types
it, and what commits is the decision it became — the template where nothing was touched, the
destination and arguments where something was. Which of the two went is not a thing the person
chooses; it is read off whether they changed anything.

**A template that cannot apply is drawn with its reason and not removed**, on the rule below. The
reasons are a stranded template, a destination that cannot be used, and a capability no longer
declared. **Never a pattern**: expansion is statically total, so a template that saved will expand
against every item and there is no such reason to draw
([core.md](core.md#routing-templates)).

The chrome reads `process · research` — the template's name, where a destination would give its own
— and the commit reads `route`, because it is a route either way.

**An entry that cannot apply is drawn with its reason, not removed** — the `where` list's existing
idiom for an unavailable destination, now doing one more job. `manual` says so on an item whose
routing summary already names the person, asking twice being a second record of one decision; that
is a rule about the summary, which every row holds, and not about the records, which only an open
row has read. `discard` says so on an item already archived. A list that changes shape according to
what has happened to the item is one a person cannot learn.

**The composer opens with the pool out of reach** *(reversing the rule that it did not)*. Once
`process` is the only way out of the queue, a composer that refuses to open offline is a queue that
cannot be drained offline — and archiving is precisely the gesture that survived, replaying from
the outbox. So the modal opens whatever the pool is doing: every destination and `manual` are drawn
unavailable with the reason, and `discard` is live. Routing and marking processed still reach the
pool or do not happen ([client.md](client.md#the-outbox)); what changed is where the shell says so.

**The composer says `process` until something is decided, and the true verb after.** The chrome
reads `process`, then `process · vault` or `process · manual`; the commit reads `route` for a
destination and `done` for `manual`. **`done` is a verb here and nothing else** *(amended
2026-09-05)*: the glossary keeps the word off the *state*, an item being **processed** rather than
done, and spends it on the gesture — what a person presses to say they carried this onward
themselves, beside `route` ([CONTEXT.md](../../CONTEXT.md)). One door, and the specific word at the
moment there is one to say — which is the same instinct that makes a record read as its destination rather than
as the capability that carried it.

**Taking a destination puts the composer in two columns** *(2026-09-04)*, where the place is a line
you type (below): the line, the word it reads off and the tree on the left; everything **consulted
or settled after it** on the right — what was used before, what sits beside the line, the tags, and
the commit that ends it. Untaken there is one column — the destination line, the `where` list, the
commit — because there is nothing to consult yet: the split is a consequence of the decision rather
than a frame waiting for it, and once the chrome carries the destination the list it was taken from
is what `⌫` at the head of an empty line gives back — and the schema-driven browser gives it back
the same way, being a line as well. What that kind keeps is its one column: there is no hierarchy
beside it to consult.

**The composer takes a measure of its own** — `--spacing-composer` — and **the modal grows when it
gains its second column**, which is the one moment it is allowed to change size: a decision was
just made. `--spacing-modal` stays 30rem, for the untaken composer and for the confirm that shares
it. Below the register's own narrow breakpoint the two columns stack in reading order rather than
earning a second breakpoint to keep in step.

**A typed field is a faint ground and carries no rule**, which leaves a rule meaning one thing: a
division between bands. There are two of them *(amended 2026-09-05)* — the chrome's, and the one
inside the `where` list separating the destinations from `manual` and `discard`. The second is the
same rule doing the same job, not an exception to it.

**The composer does not move while it is being typed** *(2026-09-04)*. Two things moved it: the
tree gaining and losing a whole level as a segment is typed, which shifted everything under it, and
the modal being vertically centred, which shifted the line and the state word *upward* as the tree
grew — the worse of the two, the control being typed into moving under the caret. So the modal
takes a **fixed distance from the top** instead of being centred, and the tree keeps a **floor**
under it, the room four or five levels need, so a shallow answer leaves space rather than
collapsing the column. A destination that cannot be asked draws no tree and needs no floor: nothing
there moves. This is a different thing from the modal growing when it gains its second column,
which is a decision having been made rather than a line being typed.

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
completes the segment under the caret as far as the matches agree — and **does nothing where there
is nothing to complete** *(added 2026-09-04)*, rather than handing focus to whatever is next: the
line is what the composer is for, and leaving it is `⇧⇥` or the pointer — `⌫` at the end of a line
that ends in one pops the whole segment rather than one character of it, and `↑↓` move through
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
and nothing under a folder that is not there can be looked up at all. **The name a derived leaf
would get is not said beside the word** *(amended 2026-09-04)*: the tree draws it where the note
lands, which is where the eye already is, and saying it twice made the state word a sentence. It is **drawn and never stored**: what is stored says *put this here*, and
the adapter decides again at delivery, when the answer is true
([ADR 31](../adr/0031-the-adapter-decides-create-or-append-at-delivery.md)). Because the word is
read rather than chosen, **`do` is not a step here**: the capability is settled, and the one escape
from it sits beside the state it overrides. `⇧⏎` says *make a new one beside it*, names what it
would be called, and stores the capability that refuses a taken name rather than writing into it —
appending to somebody's note when a new one was meant being the one place *nothing to choose* can
surprise. A blank leaf is not a gap: the name the note would get is shown before committing,
derived by the same code the adapter will run.

**Places routed to before are consulted beside the line** *(amended 2026-09-04: they used to sit
under it)*, above what the destination merely offers, under their own label, with **how often each
was used and when, beneath the path rather than beside it** — the path is the thing being read and
it never truncates to leave room for a count. They come from the pool rather than from the browser, so
they are not per-browser, not invisible to the mirror, and not a second copy of what the routing
records already hold; the pool answers the facts and the shell ranks, which keeps a change of mind
about most-used against most-recent a change here alone. The best of them is offered as a **greyed
continuation** after the caret, matched case-sensitively — the ghost is drawn as the text still to
come, so a match that only holds when case is ignored would draw a path over the one taking it
would write. The list beneath is not case-sensitive, `↑↓` reaching a place there replacing the line
outright. **`⇥` and `→` are different keys and stay different**: one completes a segment from what
the destination offered, the other takes the whole remembered continuation. A single key meaning either depending on invisible state is the failure mode being
avoided.

**A remembered place the listing does not hold is kept out of the ghost.** *Amended 2026-09-04*:
`gone` is no longer drawn anywhere — not beside the state word, and not where a date belongs in the
list, where it read as a fourth alarm for an ordinary condition. What the check is still for is the
half that was doing the work: the greyed continuation is the thing a person takes without reading,
so a place the vault no longer holds is never it, and stays in the list where `↑↓` reaches it
deliberately. Dropping the check as well would let the ghost offer a vanished folder, which is what
it was added to stop.

**A destination that cannot be asked refuses nothing.** No tree, no drawn word — there is nothing
to infer and nothing that needs inferring — but the line is still typed and `route` is still live,
the record being made and the delivery deferred, which is what `unreachable · best effort` says. A
kind that offers no listing at all draws the same plain line with its own word. Both are muted
lines rather than alarms, and both are distinct from an unreachable **pool**, which is a different
condition and one in which the composer opens with its destinations drawn unavailable
([above](#the-composer-is-for-processing)). Where a place has been routed to before it still
completes against either, because the pool holds those and is reachable whenever a place line is
drawn at all — a destination that cannot be taken has no line under it.

**The composer says a word, never a sentence.** A field's own `description` is a sentence written
for a schema and is not drawn here; what a field means is its label and its control. Where the line
draws the place it carries no label at all — `where` is the destination's step, one above — and
what sits beside it is a terse row rather than a step, as `tags` is. The caret is in the composer
from the moment it opens: the destination line has it, the place line takes it when a destination
is taken, and the destination line takes it back when the place is released.

**A field beside the line is drawn only where the composer does not know a new note is being
made** *(2026-09-04)*. The line is drawn for exactly one capability and the only field beside it is
the heading an append would use, which is nothing to a note that does not exist yet — so it goes
where the forecast says `create`, and stays where the forecast says `append` **or says nothing at
all**. An absent forecast is not knowing, and not knowing keeps the field. This needs no schema
hint: a second such capability, with a field that applies either way, is what would make one
necessary, and that is the moment to add it.

**Which control a field draws is a lookup keyed by destination kind**, and it decides on the kind
alone: what a field means is the kind's business, and a capability one kind shares with another
does not make their contents the same shape. That it is keyed on the *name* is the weak part — a
third filesystem-like kind needs a shell edit to get the tree — and `docs/todo.md` carries the
shape this should take instead, which is the schema saying it. A kind with no hierarchy in it draws no tree, and
keeps the schema-driven browser — but **that browser is a line too** *(amended 2026-09-08)*: one
field with what the destination offers under it, **narrowed to what is typed**, `⇥` completing,
`↑↓` walking and `⏎` taking the one walked to or committing where the walk has not moved. The same
gestures the typed line has, without the segments: there is one value rather than a path, so the
whole field is the filter. What it keeps that the line has no use for is **descent** — `back` to
the scope before, `use <label>` to take the scope stood in, `clear` at the top — since an entry may
be somewhere to look rather than something to hold, and this is the only control that can go there.

Matching is by **prefix over both the label and the value**, and `⇥` completes to the **value**.
The two need not be the same string — an are.na channel is browsed by its title and filed under
its slug — so completing to the label would leave the field holding something that cannot be
delivered, and matching the label alone would empty the list the moment `⇥` resolved one to the
other. A person types the title they know and the field ends up holding the slug it will be sent
with, which is also what shows them what they picked.

**A title named exactly resolves to its value**, at the two moments the line is done being typed:
committing from it, and leaving it. Never on a keystroke — "Reading" would become a channel while
"Reading Notes" was still being written — and never on a prefix or an ambiguous title. Anything it
does not recognise is **left exactly as written and still routes**: an answer is one page of what a
destination holds, so not being in it is not being wrong. A numeric are.na channel ID and a vault
folder that does not exist yet are the same case, and the composer refuses neither.

**A long answer is drawn as a handful**, eight of it, with the rest a press away and typing the way
through it. An account of two hundred channels is a wall of names nobody reads; the field above it
is the control, and the list is a sample of what is there rather than the whole of it. What the
walk reaches is what is drawn — a row the eye cannot see is nowhere to go. The destination having
held back more than it answered is its own limit and said separately.

**What a destination last answered is drawn while it answers again.** Kept for the life of the
page and never instead of asking, so a list is stale only for as long as the round trip it fills —
which is what the second visit to a composer spends staring at `loading…` otherwise. A browse that
fails with something held says so and keeps drawing it, the field being typed either way.

**A capability nothing can be chosen among is not a step** *(2026-09-08)*. Where a destination
declares exactly one, it is settled the moment the description lands and `do` is not drawn: a step
whose every path is the same step is one press spent saying yes. Two or more and it is asked, its
capabilities being its own and nothing here able to pick among them. This is the same reasoning the
typed line already settled `create-or-append` by, arrived at from the other side.

Both settle **only where nothing else has**. A template carries a capability and applies it in the
step the description lands in, so a template saved as `create` on a vault keeps `create` and draws
that capability's form rather than the line. Overwriting it made the commit read as a decision of
the person's own: the record did not name the template, and an `establish` template never learnt
its folder was there.

**A preview is asked for, never volunteered** (added 2026-09-04). `preview` sits beside `route` and
runs once the arguments are settled, because the conversion may reach the destination or a model —
the same reasoning that describes only the destination a person chose. What comes back says what it
is: **what this destination would write now**, not a promise about what will be written. The
delivery converts again when it runs
([ADR 33](../adr/0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md)), and
where the two differ that is a fact about the destination rather than a fault.

Changing any part of the decision **drops what was shown** rather than leaving it under the line: a
preview belongs to the arguments it was asked with, and a stale one reads as a promise about the
new ones. A kind that offers no preview, and a destination that could not be reached to give one,
are muted lines saying so — the same idiom the typed line uses for a vault it cannot list, and
neither ever blocks `route`. A delivery the destination says it would refuse is drawn as that, and where a kind can
say so it is the case a preview is worth most in — the refusal arriving before the decision rather
than after it. **Not every kind can.** A refusal a delivery only discovers by attempting the write
is one its preview cannot forecast without a request the delivery itself never makes; the webdav
kind's conditional `PUT` is exactly that, so it shows the note and the delivery that follows is
what refuses. A preview is indicative about refusals as it is about bytes.

The composer is still shaped for one thing it does not have: a slot above `where` for a decision
that arrived **pre-filled with an attribution**, which is the one shape a routing rule, a capture
template and an enrichment suggestion all produce. It does not exist yet; the composer leaves it
somewhere to land.

### An item has an address

**`/items/{id}` draws one item, and `/items/{id}/records/{recordId}` draws one of its routing
records** *(added 2026-09-03)*. Both are surfaces rather than modals: the modal idiom belongs to
the composer, which is a decision being made, and these are things being read.

**Triage is still the row, and nothing left it.** What an address adds is somewhere to read
deliberately. The register goes on drawing one line per record, because that is a summary and a
summary is what a row is for; what the line gains is the way into the record it summarises.

**On a row, a record reads as its destination and the place it landed** *(2026-09-04)* — the
pointer the destination handed back, or failing that the place the decision named. The capability
went with it, `create` being the adapter's vocabulary rather than a person's, and so did
`delivered`, which is what a record not saying otherwise already means. Those are the two words the
place needed. **A state is said only where it is not that**, muted and after the place, since a
record the pool has recorded and not carried out claims no landing. A decision made by hand reads
as `manual` with what the person wrote about it beside it, and carries the `undo` that cancels it.

**The way in is `open`** — last in the opened queue row's actions, and on every feed row, the feed
being read rather than worked. It is a link and not a button, so a new tab and a copied address
come with it. Making the row's body navigate was the rejected half: on the queue that click is
triage, and an address must not cost it.

**An item surface is not a register.** It offers no fold, remembers no order and holds no position
of its own — it is one entity rather than a list with an end to start from. The queue and the feed
remember theirs while they are drawn and stop while they are not, so leaving one to read an item
and coming back reads the same order at the same place.

**The actions are the row's**: process, copy, edit, and tagging, which is on every row
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

**A record is drawn in full**: what the delivery did, the destination by name, when the decision
was made, the arguments it was given, and the pointer to where it landed. The **state** is there
only where it is not `delivered` *(amended 2026-09-04)*, on the same reasoning as the row's line. Marking
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
record is what happened and the schema is only what is offered now.

The **pointer is a link where the record carries a URL**, and text everywhere else *(amended
2026-09-04)*: the shell never guesses whether a string is one, and it follows only `http` and
`https` — a `javascript:` URL in an `href` is script on this origin, and the string came from an
adapter rather than from a person. Neither kind that writes files offers one, so today the pointer
is always text; the field is there for the kind that has somewhere to point.

**What was sent is drawn where the pointer is** *(added 2026-09-04)*. The destination's **note**
about what it could not carry is on the record and is drawn at once, because it is the half a
person needs to know a conversion was lossy at all. The **output** is a fetch rather than something
the record carries — it may be long, and a page of records would otherwise drag every one of them
along — but **opening a record is the asking**: whoever came to this address came to see what was
sent, and a press between them and it is a step that answers nothing. So the fetch runs on arrival
and nothing waits on a button. What that costs is one request per record opened, which is the
narrowest place to pay it: nothing prefetches, and a record nobody opens is never read.

A read that fails says why and offers to go again, and **is not retried on its own** — a blob that
is gone stays gone, and a surface that kept asking would be a loop nobody asked for. A record whose
delivery kept no copy says so plainly and asks for nothing: that is ordinary, and a destination
posting to an API has nothing meaningful to keep. It is the component the composer's preview draws,
because a preview and an output are one shape and reading them is one act.

### Actions

An opened row's actions are not six of a kind and are not drawn as six of a kind.

- **Tags sit close behind processing.** They are processing, not decoration, and their control
  converges with routing's (below).
- **Edit** is an affordance on the content, not an entry in a list of actions.

**Two lines on a grid, by what they do** *(2026-09-04)*. One line is how an item leaves the queue;
`copy edit open` is working with the one in front of you, and reads muted. Nothing is hidden and no
control is added: the split is the one the queue is about. **Every cell takes the same inline
padding** — the padding the accent fill needs — so the words align down the columns and not merely
the boxes, and a line with fewer of them closes up rather than leaving a hole where one would have
been.

*Amended 2026-09-05*: **one line.** The split was what a set of six of unclear rank needed, and
there is one way out of the queue now (below) — so the leaving line is a single control, and a
second line drawn for three quiet ones said more about the layout than about the row. What the
grid carried survives the flattening: the distinction is still there, spent as **muted ink on the
controls themselves** rather than as a line of their own, and every action still takes the same
inline padding. What goes with the columns is aligning down them, there being one row to align.

#### One way out of the queue

*(2026-09-05.)* **`process` is the only way out of the queue.** It was three — `route`,
`done`, `archive` — presented as siblings a person chose between, when what a person has is one
question with several answers: *this item is finished with, and here is what became of it*. Three
controls of unclear rank asked them to know the shell's vocabulary before they could act on their
own intent. So the three become one, in the accent, and what differed between them becomes the
composer's first step ([below](#the-composer-is-for-processing)).

**`copy edit open` do not fold in.** They stay exactly as they are, beside it and muted: none of
them is a way out of the queue, and putting them behind `process` would make the word mean *do
something with this*, which is not a decision anybody makes.

**`unarchive` stays a bare action beside `process`**, on the archived rows only the feed has.
Processing is what sends an item away; unarchiving brings it back, and a door that means both means
neither. One lone control on a rare row is the cost, and it is smaller than the ambiguity.

**An item may still be processed more than once.** The first step takes one answer, so an item both
carried onward by hand and then discarded is two visits — which is what it is, two decisions. The
pool refuses neither ([http-v1.md](http-v1.md#marking-an-item-processed)).

**`copy` is the one action that has to say so.** It takes the capture's text, and everything else
here either changes the row or takes you somewhere — this puts nothing on the screen at all. So it
speaks in the corner, naming what it took rather than saying *copied* into the air, which is the
one place [the rule about subjects leaving the screen](#the-corner-says-what-happened) is answered
by a subject that never appears. It uses `navigator.clipboard` and nothing else, which needs a
secure context: HTTPS, or `localhost`. **Where that is missing the action is not drawn** *(amended
2026-09-05)*: reached over plain HTTP at a LAN address — a plausible way to reach a self-hosted
daemon from a phone — the browser hands over no clipboard at all, and a control that can only fail
is worse than an absent one. There is still no fallback, and building one is still a later change;
what changed is that the shell stops offering what it cannot do. **Nor is it drawn where there is
nothing to take**: a note captured with a picture and no prose says nothing, and copying it would
put an empty string on the clipboard and then claim in the corner to have taken something.

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
thought and making the person close one surface to finish the other splits it. *Amended
2026-09-05*: the reason it cost nothing used to be that the composer only opened when the pool was
reachable, so its chooser existed exactly when routing did. The composer opens offline now
([above](#the-composer-is-for-processing)), so the composer's chooser is an outbox gesture like the
row's, and drawn whatever the pool is doing — a person discarding an item offline may say what it
was on the way. The **collapsed row's chooser stays where it is** for the reason it was put there:
tagging is worth doing while scanning, without opening anything.

**A trigger tag that filed an item cannot be taken off** while what it filed still stands
([core.md](core.md#classification)) *(added 2026-09-07)*. The pool is what refuses it, and the
refusal reaches the corner the way every refused outbox operation does, saying what the way back is:
cancelling the routing, which gives the tag with it. The chooser does not draw the tag as
unremovable, because whether anything it filed still stands is a question about the item's records
rather than about the tag, and this shell would have to go and ask per tag to answer it.

The two drain apart. A tag taken in the composer is the same outbox operation the row makes, and
it lands whatever becomes of the route beside it — a route that fails leaves the tags applied,
which is the honest outcome: the person said what the item was, and that was true independently of
where it was going.

**A trigger tag is marked as one, everywhere a tag is offered** *(added 2026-09-07)*. Tagging is no
longer free of consequence: a tag a routing template declared **files the item** when it is applied
([core.md](core.md#classification)), and a chooser that drew it like any other name is how somebody
sends a note to a vault by pressing the wrong row. The mark **names the template** — `route/research
→ research` — rather than only saying there is one, because `route/` is a namespace and a namespace
is not a decision: a tag under it that no template claims does nothing, and marking it would be a
warning about nothing. It is drawn in the composer's chooser, on the collapsed row's, on the tags an
item already carries, and in the completion offered while typing. The mark is quiet, in muted ink
and never the accent: this is a fact about the tag, not something wrong.

**A declared trigger tag is offered before it has ever filed anything** *(added 2026-09-07)*. The
chooser completes from the tags **in use**, which is what the pool has seen on an item — and a
template set up this morning has never been applied, so its tag would be missing from the one list
that exists to save somebody typing it, on exactly the day nobody has typed it yet. So the tags a
template declares are offered beside those in use, marked as what they are.

**The mark is what the pool says, and it goes when the pool says so.** It is read from the templates
the client holds, so a chooser opened offline marks what it last knew — and a trigger tag declared
on another device since is drawn unmarked until the templates are read again. Drawing a tag as inert
that turns out to file something is the wrong direction to be wrong in, and the honest fix is
reading the list rather than guessing; nothing here pretends to know more than it read.

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

The rule is about the subject rather than the gesture, so **the same gesture is silent on the item
surface** *(2026-09-04)*: `/items/{id}` keeps what it is about, and the decision is drawn there in
the routing summary a moment later. What such a gesture does instead is **remember the record**, so
that the log — read on its own tempo, and holding the pool's own account of the same decision —
does not report it back minutes later as news.

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

**A fired template is the corner's one notice about something that has not happened yet** *(added
2026-09-07)*. Putting a trigger tag on an item reserves a delivery and waits a configured window
before attempting it, precisely so there is something to call off
([ADR 37](../adr/0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md)).
So the corner reads **`routing · research`** while the window is open and carries **`cancel`**;
when the record resolves it reads **`routed · research`** and carries only the way to dismiss it.
Both name the **template**, not the destination, because the template's name is what the person
pressed.

**That is the whole of the window's visibility**: no countdown and no bar. A notice claiming a
progress it is not measuring would be inventing one, and the only fact worth drawing is whether
there is still something to cancel.

It **stands** rather than lingering, and there is **one at a time**, the newer replacing the older —
the rule `discard` already follows, and for the same reason: a tag files an item in one keystroke,
so a corner stacking four of them while a queue is worked is not the quiet thing it is meant to be.

**Everything that ends the firing takes its place** *(added 2026-09-07)*: the landing, a delivery
that failed, one given up on, and a cancellation. One decision reads as one notice from beginning
to end, and the alternative is a corner contradicting itself — `routing · research` still saying
the item is on its way, beside `given up`, offering a cancel that would now refuse.

**It stands without being an alarm** *(added 2026-09-07)*. Standing and alarming are one thing
almost everywhere in the corner, because what stands is usually what went wrong; this is the
exception, and it may not be drawn in the accent. It is there because its cancel must not time out
under somebody's hands, and nothing has gone wrong at all — a notice that shouts at somebody for
filing an item where they said to file it is the shell disagreeing with them.

**The log says it, and the shell says it first** *(amended 2026-09-07)*. Both notices are written
from the log ([ADR 32](../adr/0032-a-shell-learns-what-happened-by-reading-the-log.md)), which is
how a firing on another device, or one drained from an outbox on a daemon nobody is watching, still
reaches the corner. But the log is polled on the reachability probe's own tempo, which is **longer
than the window a fired template waits out** — so a corner that only ever waited for it would offer
the cancel with most of the window already spent, and sometimes after it had closed. So the shell
that did the tagging raises the same notice as soon as it can name the record, which it asks the
pool for; the log's own entry arrives under the same name and adds nothing. This is the shell
speaking about what it just did, which is what the corner is for; it is not the shell deciding
what happened, and nothing here writes.

**A tag that fired nothing says nothing**, and a tag whose template could not route is a **refusal**
rather than a notice: nothing happened, the tag is not on the item, and a refusal is what the corner
already holds for a person to act on. It reads as what it is — that tag files somewhere, and its
template cannot — which is a thing to go and fix in settings.

**Signing out leaves nothing standing.** The corner is emptied with the rest of what the door
shuts on: a failure about a delivery nobody can now look up would outlive the session that raised
it.

**The row is watched out rather than vanishing.** A row that has been processed holds its place for
one beat wearing the word for what became of it, then goes — `routed` where a destination has it,
`retrying` where the pool recorded a decision it has not carried out, `manual` where the person
carried it onward, `discarded` where it was noise *(amended 2026-09-05)*. **The word is what the
record reads as and not what its state says**: a mark by hand is born delivered, having nothing to
reach, so a word chosen off the state alone would name a carrier there never was. It is the
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

**A notice leads to where the whole of it can be read**: the item it happened to, or the log plain
where the work was about no item. The item surface is the better address for the question a notice
raises — what happened to this capture — because it draws the record itself rather than the log's
line about it *(amended 2026-09-04, once there was an item to lead to)*.

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
toward**, not as a grey apology — and *(amended 2026-09-04)* what that turned out to want is
less, not more. Reaching the end is what the queue is for, so it is said the way the shell says
everything else it has done: **once, quietly, in the rail**, and in no other idiom. No paragraph
explaining it, and no `zero` — a state word says what became of a *thing*, and an empty list is
not one.

The reader's **order control** is in the bar and acts on whichever surface is being read; settings
has no end to start from and it says nothing there. **It is the shell's own chooser** *(2026-09-04)*
— a word, a mark, and a panel of marked options, the idiom `where` already uses — and not the
browser's `select`, which draws in the system's face and colours and cannot be brought into this
one. Leaving the control shuts it, whichever way a person leaves; `esc` shuts it too, choosing
nothing — and *(added 2026-09-05)* **pointing at the panel moves no caret into it**, the same
default the place line prevents for the same reason: leaving is what shuts this, so a pointer that
took the focus on its way in would shut it out from under the click that was choosing. What it
draws is **a named group of marked buttons and not a `listbox`**, which would promise options
nothing here renders. Which end a reader starts from is the reader's,
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

Six sections *(two when this was written; the door brought two more, then routing templates and
sources)*. **Destinations** says
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

**A settings field the kind published values for is chosen, not typed** *(2026-09-02, widened
2026-09-08)*. A webdav destination's account is one of the accounts the daemon declares, drawn as a
list; so is a field the schema **fixes** to an enumeration, which the template form already drew
that way and this brings here. The two are told apart by the schema and never by name — suggested
values and allowed ones read the same, and what differs is only whether typing something else
would be refused. A field with nothing published stays a box, so a daemon declaring no accounts
does not trap a person behind an empty one. A value the destination already holds that the daemon
no longer declares is offered too, marked as such — opening the form must not quietly move a
destination somewhere else. **Blank leads the list where nothing is held**, because for an
optional field absent is a value of its own: it is what a destination that never said has, and
what a person has to be able to go back to.

**Templates** *(added 2026-09-07)* sits under Destinations, on the same three levels and for the
same reason it comes second: a template names a destination, so the thing it names is above it. One
line per template with its name, the place it files to, the destination, and what it last answered.
Opening one adds the arguments, the folder mode, the trigger tag, **when it last fired**, and the
ways to edit and delete it.

**The place is read off the arguments**, never off the capability: every string they hold, in the
order the destination declared them, which is what a routing record's place already does. This page
draws from pool state and has asked no destination what its fields mean, so a template filing to
`reading · {{captured_at}}` on a board reads as well as one filing to a path.

**When it last fired is a derived field the pool computes beside the row**, on the terms an item's
routing summary is already derived ([core.md](core.md#routing-templates)) — so the page asks nothing
extra for it and a list of ten templates is still one read.

**What a pattern reads as is not drawn.** Saying what `{{captured_at}}` comes out as needs an item
to expand against, and there is no item on a settings page; inventing one would be a second expander
on this side, which is the drift the one expander exists to prevent. The patterns are shown as
written, which is what a template *is*.

**The arguments are a form built from the same `argumentsSchema` the composer builds from**, with an
open field typed as text — a place field here holds a pattern, not a path, so the composer's typed
line and its tree would be answering a question nobody asked. A pattern naming a field or a format
nobody declared is refused when it is saved, and **the refusal is drawn where it belongs**: on the
field that carries it, while the person is still looking at it.

**A field the schema fixes is chosen instead of typed**, and the two are told apart by the schema
rather than by the field's name: a value from an enumeration is offered as the options it is, and
anything else is a box. This is what makes a destination whose places are a **fixed set** — a
board's columns, a mailbox, a webhook — usable without the shell being taught about it, and it
follows from what a pattern is: a pattern is in no enumeration, so a fixed field never holds one and
an open field is exactly the one that might.

**A field the destination can be asked about is browsed here too.** Where the places are neither a
path nor a fixed set — a list only the account can answer, picked from rather than created — the
form asks and offers what came back, through the same schema-driven browser the composer gives a
kind it knows nothing else about. Deliberately that browser and **not** the kind's own control: a
typed path line forecasts create-against-append for a concrete path, and what a template holds is a
pattern. The browser carries the field's own input, so a place that has to be picked from what is
there and one that has to be written are one field rather than two — and a destination that cannot
be reached says so and leaves the field typable, which is what keeps a template editable against a
sleeping account.

**The folder mode is drawn only where the capability has folders.** A kind that files to a column
declares no folder field, and offering `create · require · establish` there would be a control whose
every setting the pool refuses. Nothing here knows which capabilities those are; it reads what the
chosen one published. The three modes are **chosen**, each with a line saying what it means — a
remark beside an option and the reason an option cannot be taken read alike and are not the same
thing, and a control that explains itself with the second is a control nobody can use.

**Editing draws the form alone** *(added 2026-09-07)*. What the template says and what it is being
changed to are the same fields twice, and the settled copy is the one to go: a row reading `create`
above an input reading `require` reads as the template having refused the edit. The row's own line
stays, so it is clear which template is open.

**Each row asks its own report as the page draws**, per row, exactly as a destination's is asked —
so the first template whose destination has to go and look does not hold up a list already drawn
from pool state. A settled answer is not asked again; one that could not be reached is asked when
the pool comes back, that being the moment worth re-asking on.

**A stranded template — one whose destination was deleted — leads with that**, and is deleted or
**repointed**. Repointing is an ordinary edit of its destination field, followed by the report
saying whether the capability and the arguments still fit where it now points; there is no special
repair, because there is nothing to repair beyond the one field that is wrong.

**The folder check reads the literal prefix of the path** — the part with no pattern in it, which is
exactly the part that moves when somebody renames a folder — asked through `candidates` like any
other look at a destination. Which field that is comes from the capability's own schema
([core.md](core.md#routing-templates)), so a template against a destination with no paths has no
such check rather than a check that quietly does nothing.

**Unreachable is not an alarm.** A destination that cannot be asked says so quietly and draws no
accent, the accent being for what a person has to act on and a sleeping vault being neither wrong
nor theirs to fix. This is the `gone` mark removed from the composer on 2026-09-04, not made again.

**Deleting a template asks nothing and refuses nothing**, unlike deleting a destination. A template
names nothing that outlives it, and the records it made carry what they routed as and keep
resolving without it — so there is no conflict for the pool to report and nothing for the asking to
offer instead. Deleting the **destination** is where the warning lives, naming the templates it
would strand.

**Sources** *(added 2026-09-07)* says how many the pool has seen, then one line per source: its
id, how many items it captured, and how long ago the last of them was — counted up while the page
is open, as the daemon's own reading is. It is how a program feeding the pool from outside is seen
to still be feeding it: a source whose figure keeps growing is one that has stopped. Read fresh
each time the pool comes back into reach and held nowhere, since a remembered figure would say the
opposite of what this section is for.

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
than a navigation. **Selectable is what carries the weight**: the way to copy it goes where the
browser hands over no clipboard *(amended 2026-09-05, on the same reasoning as
[`copy` on a row](#actions))*, and the string being on the screen to select is why it can go
without anything said in its place.

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

A **note** renders as CommonMark, collapsed and opened — that is what
[standards.md](../standards.md#payload-types) says a note is, and the shell currently shows its
asterisks. Its attachments are drawn above it, in slot order, each by its own media type.

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
item's facts under them rather than changing what the column is for.
*Amended 2026-09-04*: **a fact is drawn only where it answers something**. `payload` went, the
capture itself being right there and saying what it is; `edited` is absent where there is none,
rather than spending three words to say nothing happened — an absent fact already reads as no.
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

**An open row is one fill, not two panels** *(2026-09-04)*. The rail's ground runs across the
gutter to meet the body's, so the row a person is working reads as a single band, and the accent
edge sits at the **head of the row** rather than on the seam between the columns — the seam being
the one place the design has spent a whole amendment removing. With the rail furled there is no
head but the body's, and the edge goes there.

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

- **One way out of the queue.** *2026-09-05.* `route`, `done` and `archive` were three controls of
  unclear rank, drawn as siblings, which asked a person to know the shell's vocabulary before they
  could act on an intent that is single: *this is finished with, and here is what became of it*.
  Collapsing them puts the vocabulary where the decision is being made instead — the composer's
  first step, which already asks exactly that question.
  What it cost, and what was accepted in exchange:
  - **A gesture.** Discarding noise was one press and is now two. It is paid for by `discard`
    acting when it is taken, and by an `undo` in the corner for the accident that buys.
  - **An invariant.** The composer had to start opening with the pool out of reach, or the queue
    would have had no way to drain offline — archiving being the gesture that survived. The
    reasoning that the composer's tag chooser "exists exactly when routing does" went with it.
  - **A consistency.** One list in which taking most entries advances and taking one acts. The
    alternative was three gestures for the queue's commonest act, which is worse on the surface
    this shell is designed at.
  Rejected: folding `copy`, `edit` and `open` in as well, which would make `process` mean *do
  something with this* rather than naming a decision; and drawing `unarchive` as a `restore` entry
  inside the composer, which would make one door mean both leaving the queue and returning to it.
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
- The composer is dismissable without reaching for the mouse, and nothing in the register moves when
  it opens or closes; `esc` on a settled composer gives the step back rather than closing it, and
  a control that consumes `esc` for itself does not also step the decision back.
- A queue row can be told at a glance to be a revision, to be archived, or to have work not yet
  drained, without opening it and with the rail furled or not.
- A row's capture time is the first thing read on it.
- A text capture containing a heading or a list renders as a heading or a list, not as its
  characters.
- A capture whose payload type the shell does not know is visible, names its type, and can still be
  tagged, discarded and routed.
- A surface drawn from the client's cache is drawn as itself, with nothing above the rows to say so;
  a queue holding three cached rows does not read as a queue nearly drained.
- With the pool out of reach, a surface with more to read offers no `load more` and says in its foot
  why, and offers it again once the pool answers.
- A picture captured with the pool out of reach draws the picture, and the same row after the drain
  draws the pool's copy.
- With the daemon unreachable: the chrome says so once, no row and no surface repeats it, capture
  and tagging and editing remain operable, `process` opens and discarding works from it, and its
  destinations and `manual` read as unavailable rather than as broken.
- A refused operation is distinguishable from a pending one without reading either, and only the
  refused one offers a dismissal.
- Routing a queued item is reachable in two choices from the opened row when the capability needs
  no argument fields, and the modal says which capture it is about.
- Every way an item leaves the queue is behind one control, and `copy`, `edit`, `open` and
  `unarchive` are not behind it; all of them are drawn on one line.
- Discarding a queued item costs two gestures, says so in the corner, and is put back by one press
  on what the corner says — and the corner holds one such offer however many rows were discarded.
- `manual` is offered once: an item whose routing summary names the person still draws the entry,
  with the reason it cannot be taken, on every surface that draws a row.
- The composer is dismissable and every entry in `where` is reachable from the keyboard alone,
  including the two the shell invents and the templates above them.
- Taking a template fills the place line with what it expanded to, leaves it editable, and commits
  as the template where nothing was touched and as a plain decision where something was.
- A template whose destination was deleted is drawn in `where` with that as its reason, not removed.
- A tag a template declared is drawn with the template's name beside it wherever tags are offered,
  and a tag under `route/` that no template claims is drawn like any other.
- Putting a trigger tag on an item leaves the corner reading `routing · <template>` with a working
  `cancel`, and reading `routed · <template>` once the delivery lands — one such notice at a time,
  standing until it is dismissed.
- A trigger tag whose template cannot route reaches the person as a refusal, and the item is left
  carrying neither the tag nor a pending record.
- The Templates section draws from pool state at once, each row asking its own report; a template
  whose destination is merely unreachable draws no accent.
- A template form for a capability whose field the schema fixes offers those values to choose from
  and no box to mistype one in, while a field the schema leaves open stays typed.
- A capability that declares no folder mode is offered none, and saving against it sends `create`.
- A folder mode chosen in the form is what gets saved; opening a template to edit it draws the form
  in place of what the template settles.
- A template filing somewhere that is not a path draws its place from its arguments, with no field
  name the shell had to be taught.
- A template form for a capability the destination can be asked about offers what came back and
  fills the field with what was taken, and the field goes on accepting a pattern typed into it.
  A destination that cannot be reached leaves it typable and says so.
- A place drawn on a row holds nothing but what the destination named: a folder mode is drawn where
  it is set and never beside the path.
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
