# Spec: The web shell

**Status**: Implemented
**Last updated**: 2026-09-15
**Shipped**:

- 2026-09-15 — **A round of minor changes after a working session.** The row keeps its foot's
  height and its box's edges, so selecting shifts nothing, and reads its routing line short; the
  queue holds the selected row after a decision until the selection leaves it; the composer draws a
  taken template's place read-only, bolds the trail it names, heads its preview with the full path,
  and stays after a route for a second place; the tag chooser is an overlay that marks its match
  once typed into, offers a `new ·` row, removes on a second press, and draws a filed trigger tag
  inert; a typed line break is drawn as one. See
  [shell-minor-changes](../plans/shell-minor-changes.md).
- 2026-09-14 — **The log on the register.** Phase 5b of
  [shell-redesign](../plans/shell-redesign.md): the kind under the stamp in the rail, as words; one
  fact per row and never an id; the record block under a routing kind; the views as tabs on the
  head's rule; `history` above a log narrowed to one item; the half-day gap; no count.
- 2026-09-14 — **The item as a register, and the record as a block.** Phase 5a of
  [shell-redesign](../plans/shell-redesign.md): the item draws its routing records as rows under
  one rule, each a block that reads as the file it became — destination and place as a path, what
  was done and the template that did it, what was sent exactly as sent, the item's attachments
  above it — with `arguments`, `open`, `cancel` and `undo` in its foot; the record's own address is the
  same register narrowed to one; notes and outputs are rendered as CommonMark by one renderer;
  `history` on the item leads to the log narrowed to it; `unarchive` is `undiscard`.

- 2026-09-14 — **The first version, looked at.** After the review of
  [shell-redesign](../plans/shell-redesign.md): the page narrows to 56rem and the process surface
  alone keeps 72rem; paragraphs are set apart by a blank line; the selected row's foot is ruled
  on four sides and `edit` on a row draws the capture box's shape; the feed says where an item
  went in a line and in no word; the log loses its lede and its source and draws the kind
  inverted. A decision on the process surface advances to the row after the item rather than the
  top of the queue, a quick decision on the queue moves the selection to the row that took the
  place, and coming back with a row selected leaves the caret out of the capture field.
- 2026-09-14 — **Processing is a surface.** `/items/{id}/process` replaces the modal composer:
  the capture at a fixed head, editable in place for this delivery alone; ruled sections —
  `destination` narrowing three bands, `place`, `tags`, `preview` asked for as soon as the place
  is settled — in a scrolling middle; `route` and `previous · next` in a fixed foot. Two columns
  from 64rem, stacked below. A decision advances to the next item in the queue and returns to the
  queue when none is left; `esc` returns with the item selected. Phase 4 of
  [shell-redesign](../plans/shell-redesign.md); the first version of the redesign is complete.
- 2026-09-14 — **The queue row and the quick tier.** The register is two columns and one rule; a
  selected row is a box with its actions as the foot — `process · manual · discard` left, `edit ·
  copy · open` right — and `manual` and `discard` act from the row at once with `undo` in the
  corner. No state word on the queue; a trigger tag is small caps of its name; `+` only on the
  selected row. The capture box replaces the capture row, the furl goes, an index view joins the
  timeline in a list head of its own, the drained queue is one line, and `j k ⏎ p m d + esc` work
  the list. Phase 3 of [shell-redesign](../plans/shell-redesign.md); processing still opens the
  modal.
- 2026-09-14 — **One face, one size, ink on white.** The shell is set in Bricolage Grotesque at
  15px throughout, black on white with one red for failure and destruction, the dark theme its
  inversion. The bar is `queue · feed · log · settings` and one status glyph; the order control
  moved into the head of each list, the palette into settings. Every retired role — the second
  face, the second size, muted ink, green, the accent — is gone from the tokens and gated out.
  Phase 2 of [shell-redesign](../plans/shell-redesign.md); the row and the composer are still the
  old ones.

- 2026-09-13 — **The log is narrowed to a view.** Five words under the lede — `everything`,
  `routing`, `captures`, `classification`, `pool` — each a fixed set of kinds the pool is asked for,
  carried on the URL as `kind=`.
- 2026-09-13 — **A name is found by a word in the middle of it.** Every line that narrows a list —
  the flat browse, the place line's segments, the tag chooser, the destination line, the places
  used before — matches by the head of a name first and anywhere in it second, where it matched
  the head alone. `⇥` and a committed line still go by the head matches alone. One rule in one
  place, so the next algorithm is one change.

- 2026-09-11 — **One tag chooser, on the row and in the composer.** The row's field beside a
  browser datalist and the composer's row of every tag in use are both gone; both places draw one
  chooser. What the item carries is a row of pressed words, each taken off by pressing it; `+`
  opens a line with the pool's offer in a **panel beneath it**, drawn in flow, narrowed as the line is typed into.
  `⇥` completes what was typed and walks the offer once there is nothing left to complete, `↑↓`
  walk it, `⏎` takes the one walked to or what was typed, and `esc` or leaving the line puts it
  away and takes nothing. The composer's row reads the client's held copy of the item rather than
  the item it opened on, so a tag taken there draws taken at once without the row keeping its own
  account.

- 2026-09-10 — **The composer can rewrite the words one delivery carries, and a record says which
  words went.** A `words` row in the right column, directly above `would write`, drawing the
  capture; `rewrite` opens it for typing and `keep the capture's` puts it back. The words survive a
  change of destination, never survive the composer, clear the preview when they change, and carry
  nothing where nobody changed them. A record that carried its own words draws them above what was
  sent. `rewrite` is one delivery where the row's `edit` is the item.
  ([routing-edits](../plans/routing-edits.md),
  [ADR 45](../adr/0045-a-delivery-may-carry-its-own-content.md))

- 2026-09-09 — **A channel reads as its title everywhere a decision is drawn.** The template form's
  line, the settings template list, a routing record and a row's routing line all say `Reading`
  where they said `12345`. Names are **remembered** in the browser so a list draws them without a
  round trip each and says them while the account is asleep — a cache and not a record, possibly
  months out of date, and a stale title says which channel where an id says nothing. Typing a
  **slug** now resolves to the lasting form for a channel outside the answered page too, a slug
  being the name that is in a channel's own URL.
  ([ADR 44](../adr/0044-naming-a-value-is-a-second-question-a-destination-answers.md))

- 2026-09-09 — **A lasting name is read back as the name a person knows, however many channels the
  account has.** Where a field may hold only what the destination already has, the line reads the
  entry's label while the field keeps the value — so a template browsed into an are.na channel says
  `Reading` rather than `12345`, which is what taking the lasting form cost when it landed. The
  browse's own page answers it where it can, and where it cannot the destination is **asked what
  that one value is called** — a page is capped, and the channel a template is pinned to is as
  likely to be outside it as in it.
  ([ADR 44](../adr/0044-naming-a-value-is-a-second-question-a-destination-answers.md))

- 2026-09-09 — **The `⇥` walk reaches every answer, the log keeps an oldest-first walk, and a
  subject says the capture's own words wherever a surface has only its id.** The walk completed
  again on every press, so past the second answer it put the shared prefix back and the third was
  unreachable; completion is the first press alone now. A burst larger than one read reset the page
  whichever way it was being read, where the rule it was written for is newest-first only. The
  narrowed log's own heading says what the rows say. A field's `default` reads the way a value
  arriving from the other direction reads, scalars included.

- 2026-09-09 — **A note that is there is not drawn as one to be made.** The typed line drew the
  note under the folder it lands in with a `+` whether or not it was there, so appending to a note
  showed the note and a `+` copy of it beneath — a promise of a second file, which is `⇧⏎`'s job
  and not what committing would do. The `+` is now the tail that is genuinely missing; the note's
  own row wears the accent instead, as the row the line names.

- 2026-09-09 — **A template applied is a template tagged, and a field starts where its destination
  says.** However a template is reached, the item ends up carrying its trigger tag: taking one from
  the `where` list routes and then applies the tag, which the pool absorbs as classification rather
  than firing a second copy, so the tag says why the item went where it went whichever way it was
  filed. The other direction closes: a **trigger tag taken in the composer's own tag row files the
  item**, so the composer closes on it rather than leaving a second decision half-made beside a
  route already on its way. A field's `default` is drawn — a suggestion the person types over, never
  written into a template's own arguments — and `⇥` in the schema-driven browse **walks what still
  matches** once there is nothing left to complete.

- 2026-09-08 — **A template browsed into a channel is rename-proof, and is offered no advice that
  cannot work.** A candidate may answer under two names — the one a person reads and the one that
  survives a rename — and the surface takes the half it needs: the composer the readable one, since
  its decision lands now and its record is read back, and the **template form the lasting one**,
  since a template fires on a tag for months and a name that rots takes the template with it. A
  field may also say it holds only something the destination already has, and the template form
  draws no pattern vocabulary beside one: a channel is joined rather than made, so `{{captured_at}}`
  expanded into it could only ever name a channel nobody has.
  ([plan](../plans/arena-destination.md),
  [ADR 42](../adr/0042-a-candidate-carries-both-its-readable-name-and-its-lasting-one.md))

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
  composer's `where` list, above the destinations and reached by the same typed match:
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

- 2026-09-08 — **The queue stops lying about what is left.** Arriving at it reads it again, and
  the action log the shell already watches takes a row off it the moment something else processes
  the item — a trigger tag, or another device. The feed is unchanged, nothing ever leaving it.
  ([plan](../plans/held-row-and-a-fresh-queue.md))

- 2026-09-08 — **The row is held, not watched out.** Processing leaves the row open at its own rank,
  drawn as any processed row is and offering `process` again, so a second destination is one more
  gesture rather than a hunt through the feed. It goes when the reader closes it, opens another row
  or presses `esc`; the one-beat linger and its timer are gone. A row's word now tells `routed`,
  `retrying`, `manual` and `discarded` apart on the feed as well as on the queue.
  ([plan](../plans/held-row-and-a-fresh-queue.md))

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

Navigation names **four** surfaces — `queue · feed · log · settings` — as four equals at the
bar's left, the current one bold. *Amended 2026-09-14*: the log and settings joined the two; the
wordmark, the theme toggle, the order control and the waiting count left. Capture is not a
surface: it is the head of the queue. Sign-in is drawn in the same system, with the word `notemap`
where the surfaces would be.

The chrome carries what is true of the shell rather than of any item, and says it in **one glyph**
at the bar's right: `●` the pool answers, `○` it does not, `◐` this device holds work the pool has
not seen — with the count and the word in its title. The order control is a reading preference
and sits in the head of each list that has one; the palette is a preference and sits in
settings. A refusal goes to the corner.

### Capture is the head of the queue

*Redrawn 2026-09-14.* The capture box sits above the list, spanning the page: a ruled box — the
one thing on the queue boxed on four sides besides a selected row — with the field inside it and a
foot along its bottom rule carrying `attach` at the left and a bold `capture` at the right behind
a rule of its own. **No placeholder and no stamp**: the box is the invitation, and the capture is
stamped when it is sent. It is no longer a row of the register, and says nothing until it fails.

A capture asks nothing — text, an optional attachment, send. Nothing waits on the pool: the client
mints the asset id and holds the bytes, which go up with the capture when it drains
([client.md](client.md#an-attachment-made-offline)), so a picture is captured in the turn the
button is pressed whether or not the daemon is there — and the box attaches and captures in one
gesture, bytes with no capture behind them being bytes nothing will claim.

The queue is therefore where notemap opens: the surface you are meant to empty, with the way to
add to it at the top of it. **The field takes the caret when the queue is drawn**: the surface
exists to be typed into, and a click before the first keystroke is a click nothing asked for.
*Except on the way back from processing with a row still selected* *(amended 2026-09-14)*: the
keys are that row's then, and a caret in the field would swallow them.

**`⇧⏎` commits it**, from inside the field it is written in. `⏎` there is a new line, which prose
wants.

**An attached picture is drawn before it is committed**, inside the box above the text, beside its
name and with a way to drop it. The bytes go up with the capture and cannot be taken back once they
have, so the one moment to look at what was picked is before the button, not afterwards in the
feed.

**Every capture is a `note`** — prose, an attachment, or both — because there is one payload type.
What the shell still varies is the **source**: `web-manual` for a typed note and `web-image` for one
with a picture, which is what a source is for and is where policy about the two can differ. The
shell draws an attachment as a picture by its **media type**, never by the payload's, so a note
carrying a recording is not drawn as a broken image.

### The row

*Redrawn 2026-09-14 ([ADR 46](../adr/0046-the-shell-is-one-face-one-size-ink-on-white-and-processing-is-a-surface.md)).
What was here before — the open row as a fill with an accent edge, the facts it opened with, the
furlable rail — is superseded; the dated amendments it carried are folded in below where they
still hold.*

**Processing starts in the row.** The queue is one scrollable list a person works freely
([client.md](client.md#the-queue)), and leaving it costs the reader their place — so every
decision that needs no destination is taken from the row, and only the one that does leaves it,
for [the process surface](#the-process-surface). The row has two states, collapsed
and **selected**, and **one row is selected at a time**.

**Collapsed, a row is a stamp, tags and text.** In the left column — the **rail** — the capture
time as date and time on one line, tabular, and under it the tags as plain words in a wrapping
row. In the right column — the **body** — the capture, rendered, capped at the prose measure. An
image is large enough to recognise and bounded so it cannot swallow the list; a picture whose
capture has not drained draws the bytes the client is holding, so the row looks the same before
the upload as after it. Text clamps only when it is genuinely long, with a cue saying how many
lines more. **No state word on the queue**: every row on it is unrouted, and a word saying so on
each says nothing. A **pending** word stays, under the stamp, where an outbox operation about this
item has not drained. Nothing on the collapsed row is a control except the tags, which are taken
off by pressing them, and the stamp, which is the accessible way to select it.

**A trigger tag is drawn as the name after `route/`, in bold small caps** — `journal`, not
`route/journal → journal`. The style is what says the word files the item; the namespace is not a
decision and is not repeated on every row. The chooser's offer keeps the whole name, being what is
typed against, with the template it fires beside it.

**Selected, a row is a box.** One click anywhere on either cell, or `enter`, draws a rule around
both columns — the rail's own rule running through it — with the **actions as the box's foot**:
`process · manual · discard` on the left, `process` bold and `discard` in the alarm; `edit · copy
· open` on the right, ruled on all four sides so the foot is a strip of its own. Words only, no
marks. The box reaches a little outside the columns so the text inside it does not move when it
appears. **Nothing else changes**: no fill, no colour, no facts appear. `edit` on the row draws
the capture in the capture box's own shape — a ruled box with `cancel` and a bold `save` along its
foot — with no ring or colour from the browser: rewriting looks like writing. The one thing the selected row adds to the rail is a `+` after the last tag, which
opens the chooser in place ([Tagging](#tagging)) — and is how a template is applied, a template
being a tag. `esc` deselects.

**Every row reserves the foot's height and the box's edges, selected or not** *(amended
2026-09-15)*: the strip a selected row's actions sit in is drawn empty on every other row, with the
rail's rule running through it, and the box's edges are drawn on every row and coloured on the
selected one — so selecting one shifts nothing above, below or inside it, by so much as the pixel
a border is. The list a person is scanning does not resettle under them.

**One row serves both surfaces.** The queue's and the feed's differ in what they offer and never in
what they are, so there is one of them, and what a surface hands it is what differs: a processed
row leaves the queue and is seen on the feed, which offers nothing and keeps every row it holds.
**The selected row is held until the selection leaves it** *(amended 2026-09-15; it left at once
before, and a first trigger tag only seemed to hold it)*: a decision made on it — `manual`,
`discard`, a trigger tag, a route made on the surface and come back from — takes it off the queue
and leaves it drawn where it stood, from the client's own copy, with its state word and its routing
line, so the decision can be looked at and taken back from the row it was made on. `esc`, `j`/`k`
or selecting another row lets it go. So `d` `d` `d` no longer walks the list — `d` `j` `d` `j`
does — which is the price of being able to read what one just did.

**In the feed, a routed row says where it went, and no word repeats it** *(amended 2026-09-14; it
carried `routed`, `manual` and `retrying` as words over the line)*. The feed is the pool read
completely, so routed and discarded items are in it. A routed row carries a routing line — `→
Obsidian vault · …/2026-09-13.md`, `→ manual` — naming the places it went and, from the
summary, what has not landed yet as `· 1 pending` ([core.md](core.md#routing)). **The place is cut
to its last segment** *(amended 2026-09-15)*, prefixed `…/` where more than that came before it, so
a long path does not wrap the line into several — the full place is still in the element's own
`title`, a hover away. An unrouted row
carries nothing, the absence being the word. The only state words left are the ones no line
says: `discarded`, `revised`, `revision`. A delivery that failed is the log's and the corner's to
say, not the feed's. Where it went is read off the records the row asks for when it is selected,
on whichever surface it is. Tags stay editable on every row in the feed, including a discarded
one, which also offers `unarchive` among a selected row's actions. Nothing is muted: there is no
fainter ink.

**A whole cell selects the row it belongs to**, both of them, which is the reach a rail carrying
tags and a body carrying prose both want. A control inside one — a tag, an action, a field — is
worth clicking for its own sake and is not that click. The stamp stays a button, and is what says a
row can be selected at all.

**Double-clicking a row goes to process.** Selecting is a toggle, so a naive double would select
the row, deselect it, and then navigate — a flicker nobody asked for. A click carries how many of
them it is and the row takes only the first, so the gesture reads: select, nothing, go. The item's
own surface is reached by `open`. **A double the browser has already spent goes nowhere**: double-
clicking a word selects it, which is how anybody takes text out of a page, and leaving the surface
out from under a selection they just made is not what they asked for. So the row goes only where
the double selected nothing — the gutter, the marks and the space around the prose — and the
body's words stay the browser's.

**The keyboard on a register** is the same keyboard on the queue and on the feed, because a
register walks the same way whatever it holds. `j`/`k` walk the rows, moving the selection and
bringing it into view — and off a held row, which then goes; `enter` selects the first row where
none is, and opens process on the one that is; `esc` deselects. The selected row adds every command
its own actions draw ([below](#a-command-is-what-a-key-and-a-button-both-reach)): `p` process,
`m` manual, `D` discard, `u` undiscard, `e` edit, `c` copy, `o` open, `t` the tag chooser. So a key
reaches exactly what a button reaches, on either surface, and a control that is not drawn has no
key either.

**Discard is the one deed shift guards.** `D`, not `d`: it is the only key here that sends an item
away, and a capital is one deliberate press rather than a different gesture. Nothing else is
guarded, the corner's `undo` being what makes the rest cheap to take back.

**The index is a second view of the same list**, toggled in the list head beside the order
control — `timeline · index`, the current one bold — and carried on the URL as `view=index`,
remembered per surface the way the order is. One line per item: the stamp as `2026-09-13 07:02`,
the first words cut at a word with `…`, the tags at the right, dropped below the narrow
breakpoint. **Where more than half a day passed** between two items the list opens a gap of one
fixed size, the same whether a day or a month passed: time passing is read from the space. The
selected line is bold; `enter` on it goes to process; `j`/`k` walk it; a double click goes to
process. The feed has the same view.

#### The process surface

*Redrawn 2026-09-14 ([ADR 46](../adr/0046-the-shell-is-one-face-one-size-ink-on-white-and-processing-is-a-surface.md)).
What was here — the composer as a modal over the register, its chrome, its two columns and its
measure — is superseded; the rules that outlived the modal are folded in below.*

**Processing has two tiers.** The quick tier is on the row ([Actions](#actions)): `manual`,
`discard`, and a template by its tag, none of which needs a destination argument. The deep tier is
a **surface**, `/items/{id}/process`, reached from the row's `process`, from a double click on a
row, from the feed's `process`, and from the item's own surface. It is a page, not a modal: the
capture at a fixed head, the decision in a scrolling middle, `route` in a fixed foot.

**Three regions, in two columns from 64rem up and stacked below.** At a desk the head fills the
left column top to bottom with a rule to its right; the middle and the foot stack in the right
column. Below `wide` the head sits above the middle with a rule under it, capped at forty percent
of the height and scrolling within itself. Only the middle ever scrolls; the head and the foot are
always visible.

**The head is the capture, read-only until `edit`.** The stamp and the tags on one line with
`edit` at the right; under them the words, at the prose measure; a picture capture draws the
picture above them. `edit`, a double click on the words, or `e` opens editing: the words become a
ruled box with the caret in it, `keep the capture's` puts them back and a bold `done` closes the
box, `edit` being hidden meanwhile. **The edited words are this delivery's alone** — the record's
`content` exactly as the modal's rewrite was ([ADR 45](../adr/0045-a-delivery-may-carry-its-own-content.md)):
the item is never changed, words nobody changed carry nothing, and wanting the fix everywhere is
wanting the row's `edit`.

**The middle is ruled sections**, each a label column and a content column, the label in bold
capitals; below `narrow` the label stacks over the content. In order: `destination`, `place`,
`tags`, `preview`. **Sections after the first are drawn collapsed** — the label alone, opened by a
press or when the flow reaches them — except where they already hold something: an item with tags
draws its tags section open, and a preview that has answered draws open.

**`destination` is one field that narrows three bands** drawn under it as it is typed, each with
its own label and a rule between them: `templates` (name left, no pattern beside it — a decision
already made is not read as a pattern here *(amended 2026-09-15; the pattern used to sit to the
right)*), `destinations` (name left), and `otherwise` — `manual` with `processed by hand` beside it, and
`discard` in the alarm. The three narrow together by the one matching rule every line uses;
the one entry the line has narrowed to is drawn bold and `⏎` or `⇥` takes it, an ambiguous line
taking nothing. Typing is an accelerator: the bands are the way in for a pointer and for somebody
who does not know the names. **Taken, the destination leaves the line** and the section reads the
name in bold with what it has been routed to before beside it — `14 routed · last today`, read off
the places the pool remembers for it — and `change` at the right, which gives the bands back. So
does backspacing past the head of an empty place line. A destination is described only once it is
taken, describing being I/O that may hang.

**`manual` and `discard` in the `otherwise` band act at once**, as they do on the row: no note, no
second step, the corner saying `marked manual` or `discarded` with `undo`, and the surface moving
on. `manual` is drawn unavailable while the pool is out of reach or where the item is already
marked, `discard` where it is already discarded — each saying why and staying in its band, since a
list that changes shape according to what has happened to the item is one a person cannot learn.

**Routing templates are the first band.** A template is a decision somebody already made, and
offering it first puts the shortest route to a finished decision first. **Taking one draws what it
resolved to and leaves it editable**: the template's name where the destination's would be, and
the expanded place — `research/2026-09-07.md`, not `research/{{captured_at}}.md` — asked of the
pool, which owns the expander
([ADR 35](../adr/0035-a-templates-arguments-are-patterns-expanded-when-the-decision-is-made.md)).
**Where the place is the typed line, a taken template draws it read-only** *(amended 2026-09-15)*:
one line holding the expanded place with `edit` at its right, rather than the line itself — a
template is a decision already made, and opening the line for typing is asking to correct it.
`edit` draws the same typed line a destination chosen directly gets, holding the resolved value.
**A template is where a decision starts, not a form that refuses to be corrected**: what commits
is the decision it became — the template where nothing was touched, the destination and arguments
where something was. Which of the two went is read off whether anything changed. **A template
applied here carries its trigger tag onto the item**, after the route, so an item filed by a
template carries the same classification whichever way the template was reached; a decision the
person corrected is their own and takes no tag; cancelled, the tag comes back off. **A template
that cannot apply is drawn with its reason and not removed** — stranded, its destination unusable,
its capability no longer declared. Never a pattern: expansion is statically total.

**A trigger tag taken in the surface's own tags section files the item**, and the surface moves on
rather than leaving a second decision half-made beside a route already on its way. Said on the
press rather than on the pool's answer, so whoever is holding a half-made decision is told before
they can press it into a second copy.

**`preview` is asked for as soon as the destination and its required arguments are settled**, and
again whenever they or the words change, once the typing has settled. It is a ruled block holding
the first five lines of what the destination would write, `more ▾` at its foot expanding to all of
it; while the next answer is in flight the last one stays up, and one that resolves after the
decision moved on is dropped. A destination that offers no preview draws the block with `no preview
for this destination`; one that cannot be reached, `out of reach` — neither in the alarm, neither
being a failure of the decision. The label is `preview`, and nothing says who writes.

**The block's own head names the destination and the full place, bold** *(amended 2026-09-15)* —
`Obsidian vault / research/2026-09-13.md`, above the content and ruled under it: the preview says
what would be written, and the head line says where, so the two facts a person wants out of this
block sit together rather than one of them living only in the `place` section above.

**The foot** holds `← previous` and `next →` on the left, which walk the queue in its current
order without deciding anything, and a bold inverted `route` on the right, enabled exactly when
there is a destination and a capability to send.

**After manual, discard or a template tag the surface advances to the next unprocessed item** in
the queue's order, and returns to the queue when there is none. That is what a queue worked from
one end is; single-capture mode is not a separate feature. The queue is read a page at a time, so
where the item was the last row held the next page is read before the queue is declared empty,
and an item that was never on the queue — reached from the feed — goes on from its top. **A route
does not advance** *(amended 2026-09-15; it did, and an item bound for two places lost its surface
under the first)*: the decision is cleared and the surface stays, so a second destination is one
more decision away, and `next →` is what moves on. The corner says what happened as it always did,
with the way to the capture it was about. **`esc` returns to the queue with the item still
selected** — `?selected=<id>` on the queue's address, read once on arrival and taken off again —
and a processed item comes back held on the queue until the selection leaves it
([the row](#the-row)). From a field, the first `esc` leaves the field.

**The keyboard on the surface**: `e` edit, `esc` back, `⌘/ctrl+⏎` route, `[` and `]` previous and
next. Only `⌘/ctrl+⏎` fires while a field has the caret, the decision being finished there and
reaching for the mouse to send it being the gesture this surface exists to spare. `esc` in a field
leaves the field, and the next one leaves the surface.

**The surface opens with the pool out of reach.** A surface that refused to would be a queue that
cannot be drained offline, and discarding is precisely the gesture that survived, replaying from
the outbox. So every destination and `manual` are drawn unavailable with the reason, and `discard`
is live. Routing and marking processed still reach the pool or do not happen
([client.md](client.md#the-outbox)); what changed is where the shell says so.

#### The place is one line you type

**For a destination whose kind holds a filesystem, the place is one monospace line** (added
2026-09-02, replacing the browser described here on 2026-08-31 — that control is what every other
kind still draws). Typing filters the entries at the deepest settled scope, `/` descends, `⇥`
completes the segment under the caret as far as the matches agree — and **does nothing where there
is nothing to complete** *(added 2026-09-04)*, rather than handing focus to whatever is next: the
line is what the surface is for, and leaving it is `⇧⇥` or the pointer — `⌫` at the end of a line
that ends in one pops the whole segment rather than one character of it, and `↑↓` move through
everything the tree drew — every row the pointer could take, in the order it is drawn — while `⏎`,
left alone, routes. **The line is the value**: there is no second input beside it holding the same
string, which is what the browser-and-input pair did and neither half could see the other.

**The hierarchy is shown, not walked**: the levels along the typed path are drawn beneath the line,
each with its siblings, indented — so the context around a choice is there rather than replaced at
every step. **The trail the line names is bold all the way down** *(amended 2026-09-15)* — every
segment the typed path took, and the note or the folder still to be made at the end of it — apart
from the row a keyboard walk has landed on, which is bold for a different reason and carries
`aria-selected` besides. **Taking one is going to it**, not adding its name to what is typed: an
entry carries its own path from the root, so a folder two levels up drills the line down to exactly
that folder and a note sets the line to the note. Anything else makes folders nobody meant. **Only the level
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
lands, which is where the eye already is, and saying it twice made the state word a sentence.
**Nothing is drawn with a `+` where it is already there** *(amended 2026-09-09; the note was drawn
with one either way)*. A `+` says the delivery will make this, so a row for the note under the note
it is going into promises a second file beside it — which is what `⇧⏎` is for and the opposite of
what committing would do. Appending, the note's own row is the one the tree already holds, and it
takes the accent as **the row the line names**: the same mark every walked list uses for the row
whose value the field holds, and takeable as it always was. It is **drawn and never stored**: what is stored says *put this here*, and
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
would write. The list beneath narrows by the one rule every line narrows by — a place is found by a
segment in the middle of it — since `↑↓` reaching a place there replaces the line outright. **`⇥` and `→` are different keys and stay different**: one completes a segment from what
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
condition and one in which the surface opens with its destinations drawn unavailable
([above](#the-process-surface)). Where a place has been routed to before it still
completes against either, because the pool holds those and is reachable whenever a place line is
drawn at all — a destination that cannot be taken has no line under it.

**The surface says a word, never a sentence.** A field's own `description` is a sentence written
for a schema and is not drawn here; what a field means is its label and its control. The line
draws the place under the `place` label, and what sits beside it is a labelled row rather than a
section. The caret is on the surface from the moment it opens: the destination line has it, the
place line takes it when a destination is taken, and the destination line takes it back when the
place is released. *Amended 2026-09-14*: the places used before are no longer a list beside the
line — the count and the last time are said beside the destination's name — and the line's `↑↓`
walk the tree alone; the greyed continuation still completes from the best remembered place.

**A field beside the line is drawn only where the surface does not know a new note is being
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

**Matching is one rule, wherever a line narrows a list** *(amended 2026-09-13)*. Case is ignored,
and a name is found by its head first and by anything in it second: what is typed at the start of
a name lists ahead of what falls in the middle of one, so completing a name still finds it at the
top, and a channel is found by a word in its title. The tag chooser, the place line's segments,
the destination line and its bands narrow by the same rule, so there is one thing to learn and one
place it changes. Before this it was the head alone, everywhere.

**`⇥` completes from the head matches alone.** A name that holds the line in its middle has a head
the person never typed, so it cannot continue what they wrote; several head matches complete as
far as they agree, and a lone match of either kind completes outright. Committing a line resolves
it the same way: the whole of a title, or the head of one that no other begins with — never a title
that merely holds the line, since what was typed may be a slug for a channel the page did not list.

Matching is over **both the label and the value**, and `⇥` completes to the **value**.
The two need not be the same string — an are.na channel is browsed by its title and filed under
its slug — so completing to the label would leave the field holding something that cannot be
delivered, and matching the label alone would empty the list the moment `⇥` resolved one to the
other. A person types the title they know and the field ends up holding the slug it will be sent
with, which is also what shows them what they picked.

**Pressed again, `⇥` walks what still matches** *(added 2026-09-09)*. Completion stops where the
answers stop agreeing, which for a list of channels is usually after a word or two — and a name that
shares its first letters with four others is the ordinary case rather than the awkward one. So the
second press takes the first answer still matching, the third the next, and the last wraps to the
first. The walk is against **what was typed**, held aside for as long as it lasts: the field is
where the walk puts its answers, so matching against the field would be matching against its own
last answer and find one thing. Typing again ends the walk and the field is the filter once more.
`↑↓` still walk the list drawn beneath, and neither key learns the other's job.

**A title resolves to the value it names**, at the two moments the line is done being typed:
committing from it, and leaving it. The whole of a title, or enough of one that a single answer is
still matching — the same reach `⇥` has, and safe here for the reason it is not safe on a keystroke,
there being no half-written word left to take out of somebody's mouth. Never on an ambiguous
title. Anything it does not recognise is **left exactly as written and still routes**: an answer is
one page of what a destination holds, so not being in it is not being wrong. A group channel, a
numeric are.na channel ID and a vault folder that does not exist yet are the same case, and the
surface refuses none of them.

**Which of a candidate's two names is taken is the surface's own** *(2026-09-08)*. Where a
destination answers a `durable` form beside the value, the surface takes the value and the
**template form takes the durable one** — a decision made now wants a name that reads, and one
that fires for months wants a name that cannot rot. Matching and completion consider every name an
entry has, so a title, a slug and an ID all find the same channel and the row still marks as taken
whichever form the field ended up holding.

**Every surface that draws a decision draws the name** *(2026-09-09)*. A template's line is where
one is chosen; a template list, a routing record and a row's routing line are where one is read
back, and those three ask no destination anything — they draw pool state, and are read while a
destination is asleep as often as not. So what any of them learns about a value is **remembered in
the browser**, keyed by destination, capability, field and value, and every one of them reads it.

It is a cache and never a record. Nothing in the pool carries it, it may be months out of date, and
losing it costs an ask. That is the trade taken on purpose: where a decision is being *authored* the
name is asked for now, because a form is where a mistake gets saved; where one is being *read back*
a stale title still says which channel, and an id says nothing at all. What fills it is, in order:
what is remembered, then one browse — a page names most of an account in a single request — then an
ask per value for whatever is left.

**A name the page did not carry is asked for** *(2026-09-09)*. Reading a value back off the
browse's own answer works exactly as far as that answer reaches, and it is one page — are.na's is
one on purpose. So where nothing on the page answers for what the field holds, the destination is
asked what that value is called, through `/named`. Only then: a channel the browse already listed
costs no request at all. What comes back with no name is left exactly as it stands, which is what a
place typed by hand looks like and is the same thing the surface did before anyone asked.

**A slug settles to the lasting form, wherever the channel is** *(2026-09-09)*. Typing a title or a
slug for a channel the page carries has always landed on the form the surface keeps. For one it does
not carry, that used to leave only the numeric id working — which is the one name of the three that
is not written down anywhere a person can reach. Settling now asks, so a slug pasted out of a
channel's URL becomes the id that survives a rename. What nothing answers for still stands exactly
as typed.

**A field that holds only what was offered is typed in names** *(2026-09-09)*. Where the schema
says `x-notemap-offered-only`, the line reads the entry's label and the field keeps the value
underneath it — the one case the two come apart, and it is the case where the value is an id
nobody picked and nobody can read. What is typed narrows the list as it always did, and settles the
same two moments a title does; anything no entry answers for is kept exactly as written, a numeric
ID typed by hand included. Everywhere else the line **is** the value, which is what makes a path a
path.

**What narrows the list is what was typed, never what is read** *(2026-09-09)*. The two are one
string most of the time and the difference only shows where they come apart: `⇥` walking writes an
answer into the field while the typed stem goes on filtering, and a line reading a name has had
nothing typed into it at all. Narrowing by what is read would leave the list holding the one thing
already held — and the keyboard would walk a list the eye cannot see, which is the one thing the
drawn list and the walked list being one list exists to prevent.

**A long answer is drawn as a handful**, eight of it, with the rest a press away and typing the way
through it. An account of two hundred channels is a wall of names nobody reads; the field above it
is the control, and the list is a sample of what is there rather than the whole of it. What the
walk reaches is what is drawn — a row the eye cannot see is nowhere to go. The destination having
held back more than it answered is its own limit and said separately.

**What a destination last answered is drawn while it answers again.** Kept for the life of the
page and never instead of asking, so a list is stale only for as long as the round trip it fills —
which is what the second visit to the surface spends staring at `loading…` otherwise. A browse that
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

**The words a delivery carries sit above `would write`** *(added 2026-09-10,
[ADR 45](../adr/0045-a-delivery-may-carry-its-own-content.md))*. A `words` row in the right column,
directly above the preview, so what is being sent reads above what it becomes and rewriting and
previewing are one loop. It draws the capture, and `rewrite` opens those words for typing. A
`Labelled` rather than a `Group`: the right column is terse rows beside the decision, and the
decision is the line in the left one.

**`rewrite` is not `edit`, and the two words are the whole defence.** The row's `edit` rewrites the
capture in place, permanently, for the feed and every later route
([ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md)). `rewrite` is this delivery
and nothing else: the item still says what it said, and the routing record holds the words that
went. Two controls an aisle apart both called `edit` is how somebody permanently rewrites a capture
meaning to fix one delivery.

It is drawn only where a **real destination** is taken. `manual` and `discard` deliver nothing, so
there is nothing to rewrite.

**`keep the capture's` is the way back, and words nobody changed carry nothing.** Opening the field
is not a decision — a person who opens it, reads what is there and types nothing has rewritten
nothing, so a request whose words still say what the capture says carries no `content` at all. The
presence of content on a record is the claim that somebody rewrote it, and it is a claim this
surface only makes where it is true.

**The words survive a change of destination, where the arguments are cleared.** A place in one
vault means nothing in another; words are not about the destination at all, and clearing them would
make somebody re-type a typo fix for picking a different board. **Each route starts from the
capture**, though: a rewrite belongs to one delivery and is never sticky, and wanting the fix
everywhere is wanting `edit`. An empty rewrite is whatever the payload's own schema allows — a
capture carrying assets and no text is already legitimate, so no rule is invented here.

**A preview is asked for, never volunteered** (added 2026-09-04). `preview` sits beside `route` and
runs once the arguments are settled, because the conversion may reach the destination or a model —
the same reasoning that describes only the destination a person chose. What comes back says what it
is: **what this destination would write now**, not a promise about what will be written. The
delivery converts again when it runs
([ADR 33](../adr/0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md)), and
where the two differ that is a fact about the destination rather than a fault.

Changing any part of the decision **drops what was shown** rather than leaving it under the line: a
preview belongs to the arguments it was asked with, and a stale one reads as a promise about the new
ones. **The words are part of the decision** for this, so a keystroke in them clears the preview too
— a preview of words that have since changed is indistinguishable from a good one, which is the
exact failure ADR 33 names. A kind that offers no preview, and a destination that could not be
reached to give one, are muted lines saying so — the same idiom the typed line uses for a vault it
cannot list, and neither ever blocks `route`. A delivery the destination says it would refuse is
drawn as that, and where a kind can say so it is the case a preview is worth most in — the refusal
arriving before the decision rather than after it. **Not every kind can.** A refusal a delivery only
discovers by attempting the write is one its preview cannot forecast without a request the delivery
itself never makes; the webdav kind's conditional `PUT` is exactly that, so it shows the note and
the delivery that follows is what refuses. A preview is indicative about refusals as it is about
bytes.

The surface is still shaped for one thing it does not have: a slot above `destination` for a
decision that arrived **pre-filled with an attribution**, which is the one shape a routing rule, a
capture template and an enrichment suggestion all produce. It does not exist yet; the surface
leaves it somewhere to land.

### An item has an address

**`/items/{id}` draws one item, `/items/{id}/process` is where it is processed, and
`/items/{id}/records/{recordId}` draws one of its routing records.** All three are surfaces
*(amended 2026-09-14: the decision was a modal until then)*: the first and last are things being
read, the middle one a decision being made, and each has an address a person can come back to.

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

**The actions are the row's**: process, manual, discard, copy, edit, and tagging, which is on
every row in this shell. A surface that could only be read would be the one place a tag cannot be
added. The overlap with the opened row is real and is being watched rather than resolved; nothing
that fits on a row has moved off it. One thing is the item's alone: **`history`**, where the row
has `open` — the log narrowed to this item, since a person who has opened an item and wants to
know what became of it has the register of records in front of them and the log's account one
press away. A discarded item offers `undiscard` *(2026-09-14; the word was `unarchive`, the only
place the archive said its own name)*.

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

**The item is a register of what became of it** *(2026-09-14, after
[shell-redesign](../plans/shell-redesign.md) phase 5; until then the records were lines in the
rail and a record was a page of facts)*. The capture is the first row — stamp, state word and tags
in the rail, the payload and the actions in the body. Then one rule across both columns, the one
rule the surface has, and under it **one row per routing record**: the record's own stamp and its
state in the rail, and the record itself, as a block, in the body. The state is said on every
record row, `delivered` included: the rule that a state is said only where it is not that was a
rule for a summary line, and a row of its own is not a summary. The record's stamp is the way into
its own address, `/items/{id}/records/{recordId}`, which is the same register narrowed to that one
record; on it the stamp goes nowhere, the address bar already saying which. A record the item
does not have is said plainly there, and is not a failure. Records out of reach, or refused, are
said in the first record row's place, under the rule; nothing about the records is said at all
where the item was never routed, and the rule is not drawn.

**A record reads as the file it became.** The block is a ruled frame whose head is the
destination's name, bold, then `/`, then the place inside it — the pointer the destination handed
back, or failing that the place the decision named, with a handle read as the name it stands for
where anything has learned one. **One rule runs between whichever sections the block draws**
*(amended 2026-09-15)*: the head's own and the foot's used to be drawn separately, and with nothing
between them — a manual record with no note — they touched and read as one thick rule; the block
draws one `divide-y` between its sections instead. The place is a link where the record carries a URL and text
everywhere else: the shell never guesses whether a string is one, and follows only `http` and
`https`. At the head's right, **what was done** in plain words — `created`, `appended`, `created or
appended` for the one that is both until the adapter reaches the vault
([ADR 31](../adr/0031-the-adapter-decides-create-or-append-at-delivery.md)), `marked processed` —
and `via <template>` where a template applied it, by its name and never its id; a template since
deleted reads `via a template`. A capability this shell has never heard of is said by its name,
which is worse than a sentence and better than silence. Nothing says `routing record`, `where it
landed`, `what was sent`, `its tags did not go` or `the decision`, and no id is drawn anywhere.

**Under the head, what was written, exactly as it was sent.** The output is a fetch rather than
something the record carries, and looking at the record is the asking: the read runs on arrival,
once, and a read that fails says why and offers `read it`, never retrying on its own. What comes
back is drawn as it is — front matter, asterisks, image paths and all — in the one face,
pre-wrapped. *Not rendered (2026-09-14, after a first version that was)*: the file is the
destination's, and a path in it — `![](research/assets/whiteboard.jpg)` — resolves in the vault
and nowhere here, so rendering it drew a broken picture beside the real one. True to the output is
the honest reading; the capture itself is rendered where it is a capture, on the queue, the feed
and the item's own row. **The item's attachments are drawn above the words** as the preview of
what went with them; where the assets landed is not on the record and is not drawn. The
destination's **note** about what it could not carry is on the record and is drawn beneath. A
delivery that kept no copy says `nothing kept`, in two words, since that is ordinary; a delivery
that carried words of its own in place of the capture's
([ADR 45](../adr/0045-a-delivery-may-carry-its-own-content.md)) and kept nothing draws those words,
so what went is still on the page. A pending record's body is one line, `not yet delivered`.

**The foot holds the presses.** `arguments` shows what the delivery was given, named
against the capability's own schema where the destination can be described — `Directory` rather
than `directory` — and by their own keys where it cannot, with anything the record carries that
the schema does not name drawn all the same; it is offered only where there are any. `open ↗`
follows the record's URL where it carries one. On the right, `cancel`, in alarm, on a pending
record — a reservation whose delivery has not landed is the person's to take back — and `undo` on
a decision made by hand, which is the same call; both say so in the corner and the surface reads
its records again. In the log alone the foot also offers `item`, the way to the capture; on the
item's own surfaces the capture is the row above.

**Marking processed is routing whose destination is the person**, and reads as one: the head says
`by hand` and `marked processed`, the note the person wrote is the body, and nothing at all is
drawn where there is none.

### Actions

*Redrawn 2026-09-14.* A selected row's actions are the foot of the box it is drawn as, in two
groups, and are not six of a kind.

**The quick tier is on the left**: every decision that needs no destination. `process`, bold, is
the door to the one that does. `manual` calls the pool at once, with no note — the note is
offered on the process surface, not here — and the corner says `marked manual` with `undo`, which
cancels the record the mark made. `discard` calls the pool at once too, and the corner says
`discarded` with `undo`, which unarchives. **Neither notice is an alarm** *(amended 2026-09-15)*:
both stand, so their `undo` does not time out under somebody's hands, but nothing went wrong — the
fired-template notice's own precedent ([below](#the-corner-says-what-happened)). Both leave the row held in place as routing does, so the
decision can be looked at after it is made. `manual` is disabled while the pool is out of reach or
where the item is already marked, `discard` where the item is already discarded, each saying why
in its title and drawn in the one grey the shell admits for an inert control. `unarchive` sits in
this group on a discarded row: not processing — it puts the item back rather than sending it away.

**Working with the item is on the right**: `edit`, `copy`, `open`. None of them is a way out of the
queue, and putting them behind `process` would make the word mean *do something with this*, which
is not a decision anybody makes. `edit` is offered on an unprocessed item only, editing a processed
one being a revision, which the queue is not where to make. `open` goes to the item's own surface,
and is last, so the gesture that selects a row in place is never the one that leaves it.

**`copy` is the one action that has to say so.** It takes the capture's text, and everything else
here either changes the row or takes you somewhere — this puts nothing on the screen at all. So it
speaks in the corner, naming what it took rather than saying *copied* into the air. It uses
`navigator.clipboard` and nothing else, which needs a secure context: HTTPS, or `localhost`.
**Where that is missing the action is not drawn**: reached over plain HTTP at a LAN address — a
plausible way to reach a self-hosted daemon from a phone — the browser hands over no clipboard at
all, and a control that can only fail is worse than an absent one. **Nor is it drawn where there is
nothing to take**: a note captured with a picture and no prose says nothing, and copying it would
put an empty string on the clipboard and then claim in the corner to have taken something.

#### A command is what a key and a button both reach

*Added 2026-09-15.* Every deed above is a **command**: an id, the word a person reads, the deed
itself, and why it cannot be taken where it cannot. `Actions` draws the list; a **binding** names
one command's key; and both read the same definition, so a button and a key can never learn two
different answers about what a person may do.

**A surface publishes what it offers, and only while it is on screen.** A command closes over the
row that is selected, so there is no table of them anywhere — the queue and the feed publish a
register's four and the selected row's, the item's own surface publishes one item's, and the
process surface publishes its own five. A chord reaches the deepest surface that published one, so
the same key means the nearest thing: `esc` deselects a row on the queue and leaves the surface on
process, and neither has to know about the other.

**A key is spelled the way it is pressed.** A printable character *is* the binding — `D`, `+`, `[`
— and shift is never named beside it; only a named key takes a prefix, as `mod+enter`, where `mod`
is ⌘ or ctrl depending on the keyboard. **A command with a refusal has no key**, the same refusal
that greys its button.

**A field answers for its own entry.** No chord fires while a field has the caret unless its
command says otherwise, and `esc` in a field leaves the field rather than reaching anything. This
is what makes the queue's keyboard reachable at all: the capture box takes the caret on arrival, so
`esc` is the way from writing to working.

**What a command could not do is said in the corner**, never under the row. A deed a key took may
have no row on screen to draw a failure beneath — which is already why discarding and marking
manual speak there, and is now why a failed `copy` and a failed `undiscard` do too.

**The bindings are not configurable yet, and they are not printed anywhere.** A page for changing
them, and a palette that lists every command a surface published, are both the same seam read a
second way — neither exists.

#### One way out of the queue

**`process` is the door to the deep tier, and the quick tier sits beside it.** It was three —
`route`, `done`, `archive` — presented as siblings a person chose between, when what a person has
is one question with several answers: *this item is finished with, and here is what became of it*.
The answers that need no destination — `manual`, `discard` — are taken on the row at once; the one
that does, routing, is the process surface's ([above](#the-process-surface)), which is where `process`
goes. *Amended 2026-09-14*: it opened a modal composer before that.

**`edit copy open` do not fold in.** None of them is a way out of the queue, and putting them
behind `process` would make the word mean *do something with this*, which is not a decision anybody
makes.

**`unarchive` stays a bare action beside the decisions**, on the discarded rows only the feed has.
Processing is what sends an item away; unarchiving brings it back, and a door that means both means
neither.

**An item may still be processed more than once.** An item both carried onward by hand and then
discarded is two visits — which is what it is, two decisions. The pool refuses neither
([http-v1.md](http-v1.md#marking-an-item-processed)).

### Tagging

Tagging is a **chooser over known names with free entry**, not a bare text field. It sits on the
row, because it replays from the outbox and is therefore the one processing gesture that survives
an unreachable pool. *Amended 2026-09-14*: the tags a row carries are on every row and taken off
from any of them, but the `+` that opens the chooser is **the selected row's alone** — one press
away, and not a mark on every line of a list meant to read as a timeline. Where this section says
*the collapsed row's chooser*, read *the selected row's*; where it says *the composer*, read *the
process surface*, whose `tags` section is the same chooser.

The known names are the **tags in use**, read from `GET /v1/tags` when the shell starts and again
whenever classification drains ([client.md](client.md#the-outbox)), and filtered locally as the
person types. They are an offer and never a limit: a name that is on no list is written by typing
it, and the chooser stays useful once the pool goes out of reach, which is the whole reason tagging
sits on the collapsed row.

**The chooser is one control, wherever it is drawn** *(added 2026-09-11)*. What the item carries
is a row of pressed words, a trigger tag marked with the template it applies, each pressed to
select it and taken off on the `×` that then appears beside it *(amended 2026-09-15; a single
press used to remove it outright)*. `esc`, opening the line, pressing another tag, or the row
losing its selection clears the selection without taking anything off. `+` opens a line, an **absolute panel** beneath it —
*amended 2026-09-15: it used to sit in the flow, which shifted whatever was below the row; an
absolute panel still extends the process surface's scrolling middle, so it stays reachable there
too* — holding the pool's offer: the eight most used while the line is empty, the whole list the
line narrows to once it is typed into, minus what the item carries either way.

**The first match is marked as soon as the line is typed into, and stays marked as it narrows**
*(amended 2026-09-15; the match `⏎` was about to take used to be unmarked, so `⏎` on a half-typed
name that matched one created a second, unrelated tag instead of taking the match — `qu` then `⏎`
made `qu` over `quote`)*. Nothing is marked while the line is empty: a reflex `⏎` after `+` puts
the line away rather than classifying the item with whatever is most used. `⇥` completes what was
typed as far as the offer agrees, and once there is nothing left to complete walks the offer,
moving the mark; `↑↓` and the pointer walk it too, without moving the caret out of the line, and
the walk goes on from wherever the mark is — there is no dead press. `⏎` takes the marked row. A name no offer holds is the
panel's **last row**, `new · <name>` — how a fresh tag is made — and it is the only row, so the one
marked, exactly where nothing else matched at all. `esc` or leaving the line puts it away and takes
nothing: a name half-typed is not a decision, and a panel row is taken without the line ever losing
focus. The composer's row reads the client's held copy of the item, which is where a tag taken
through the outbox lands first, so it draws taken at once and drops the account of taken-and-dropped
it used to keep beside the item it opened on.

**Tagging is offered in two places, and they are not redundant** (added 2026-09-02). The composer
offers the same chooser beside the place being routed to, because classifying and filing are one
thought and making the person close one surface to finish the other splits it. *Amended
2026-09-05*: the reason it cost nothing used to be that the composer only opened when the pool was
reachable, so its chooser existed exactly when routing did. The composer opens offline now
([above](#the-process-surface)), so the composer's chooser is an outbox gesture like the
row's, and drawn whatever the pool is doing — a person discarding an item offline may say what it
was on the way. The **collapsed row's chooser stays where it is** for the reason it was put there:
tagging is worth doing while scanning, without opening anything.

**A trigger tag that filed an item cannot be taken off** while what it filed still stands
([core.md](core.md#classification)) *(added 2026-09-07)*. **The chooser now draws it as
unremovable** *(amended 2026-09-15; the paragraph here used to say the opposite, for the reason
given below, which the pool closed)*: `RoutingSummary.templates` names, per item, the distinct
templates whose records still stand, so a carried tag whose template is among them is drawn a
`<span>` rather than a button — the trigger style, and a `title` saying the routing has to be
cancelled to take it off. It is read from what the item's own summary says, so it costs no ask per
tag. Pressing it does nothing; the way back is still cancelling the routing, which gives the tag
with it, and the refusal that used to explain this reaches the corner only where something is asked
of the pool anyway — cancelling a routing it has already refused, say.

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

**The row is held rather than vanishing** *(rewritten 2026-09-08)*. Processing leaves the row
**open**, back at its own rank in the register, wearing the word for what became of it and keeping
everything an open row has — the routing line naming where it went, and the actions, `process`
among them. **A held row is a row.** It is the same component the feed draws a processed item with,
reading the client's own copy, so a second routing or a decision taken back reaches it without a
read of its own.

**It is held for as long as it is the open one**, and released by closing it, opening another row,
or `esc`. So there is at most one on the register and a drain session evicts each as the next is
reached for — which is the same rule as *one row open at a time* and not a second one. There is no
timer: a beat was long enough to see a departure and never long enough to act in.

**What it is for is the second destination.** An item may be processed more than once, and the row
that has just been processed is where the person is already looking, so routing the same capture
somewhere else is reaching for `process` again rather than finding the item in the feed.

**The word is what the record reads as and not what its state says**, which is the rule the
departing word already carried and now belongs to every row: `routed` where a destination has it,
`retrying` where the pool recorded a decision it has not carried out, `manual` where the person
carried it onward, `discarded` where it was noise. A mark by hand is born delivered, having nothing
to reach, so a word chosen off the state alone would name a carrier there never was. **The feed says
the same four** *(2026-09-08)*, having said `routed` for all three of them and `archived` for the
fourth — `discard` being the word this shell spends on hiding a capture
([CONTEXT.md](../../CONTEXT.md)).

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
line about it *(amended 2026-09-04, once there was an item to lead to)*. **However it was raised**
*(amended 2026-09-08)*: a decision the shell reports from the gesture that made it leads to the item
just as one read out of the log does. It is a statement and stays one — it says where to go and
never puts a row back on a surface, a held row being the shell's own answer to looking away too
soon.

**A catch-up is bounded, and a long one is not read out at all.** A shell that has been away a
moment is told each thing that happened. One that has been away long enough for the read not to
reach back to its mark is told only how many, standing, with a way through to the log — a page of
failures nobody may dismiss is not a report of a day. There is one such mark at a time: a second
long absence replaces the first rather than stacking on it.

### Draining

The queue's job is to reach zero and the API gives no count — `ItemSlice` carries values and an
optional `next` link, nothing more. So the shell claims no number. `load more` is the honest
statement that more exists — and while the pool is out of reach the foot says that instead of
offering a page it cannot fetch. **The drained queue is one line where the rows were** —
`Nothing left to process.` — in the body column's position, with no register drawn under it.
Reaching the end is what the queue is for, so it is said once and quietly: no paragraph, no
`zero`, and not as a notice.

The reader's **order control** sits in the head of each list — the queue's, the feed's, the log's
— beside the view toggle, and acts on the list it heads; settings and an item have no end to
start from and draw none. **It is the shell's own chooser** — a word, a mark, and a panel of
marked options — and not the browser's `select`, which draws in the system's face and colours and
cannot be brought into this one. Leaving the control shuts it, whichever way a person leaves; `esc`
shuts it too, choosing nothing — and **pointing at the panel moves no caret into it**: leaving is
what shuts this, so a pointer that took the focus on its way in would shut it out from under the
click that was choosing. What it draws is **a named group of marked buttons and not a `listbox`**,
which would promise options nothing here renders. Which end a reader starts from is the reader's,
for the queue as for the feed ([CONTEXT.md](../../CONTEXT.md)). Turning a surface around reads it
again from that end ([client.md](client.md#the-queue)) — a position belongs to the order that made
it — so the control is a choice of order, not a re-sort of what is on screen.

**The choice is the reader's to keep.** The order is named on the URL, so a read reloads as the one
that was being read and travels as the one that was shared; and it is remembered, so a fresh visit
opens where the last one left off. **Per surface**: the queue starts at the oldest, which is why it
is a queue, and the feed at the newest, so one preference over both would have to overrule one of
them. The URL wins over what was remembered — being the more specific statement about the read in
front of you — and an order named there that is not one falls through to what was remembered rather
than failing. Turning a surface **replaces** the URL rather than pushing it: which end you read
from is not a place to go back to. The view is kept the same way, and the plain address is the
timeline.

### Settings

Settings is not a register and is not drawn as one. It is read rather than scanned, so it takes a
**narrower measure** than the two surfaces — which is itself the signal that it is a different kind
of page — in **one column**, with no rail and nothing to furl. It has no lede *(2026-09-14)*: the
sections say what is on the page. Section headings are bold capitals over a rule.

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

**A lasting name is read back as the name it stands for** *(2026-09-09)*. The form takes the
`durable` form of a candidate, which for an are.na channel is a number — so the field reads the
label the destination answers under it while holding that number, and a template saved months ago
says which channel it files to rather than only that it files somewhere. Only where the field says
it holds nothing but what was offered: a path is its own name, and drawing something else over one
would hide what is about to be written.

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

`/log` is the register *(redrawn 2026-09-14, [shell-redesign](../plans/shell-redesign.md) phase
5b)*: the rail carries the stamp and, under it, **the kind**; the body carries what the action was
about and the one fact the kind is worth; and under a routing kind, the record itself as the block
the item draws. One vertical rule between the two, as on the queue and the feed, and no rule
between rows. It is a surface of this shell like any other *(2026-09-02; it was the daemon's
markup, drawn in this language, until then)*, so there is no leaving the app and coming back, and
no second copy of anything to hold in step.

**The kind is in the rail, in capitals, as words.** The pool's name is drawn with its hyphen as a
space — `DELIVERY FAILED` — and the archive is called what the UI calls it everywhere else:
`archived` reads `discarded`, `unarchived` reads `undiscarded`; the pool's own kinds are untouched.
*(Until 2026-09-14 the kind was inverted, ground on ink, as the body's heading.)* **The alarm is
spent on `delivery-failed`, `work-failed` and `work-abandoned`**, which are the same three the
corner says out loud — the kind is in alarm there, and so is the refusal's code beside the words —
not on `purged`, `destination-deleted` or `actions-cleared`, which are facts rather than warnings.
A log where half the rows are red says nothing.

**One fact per row.** Each kind names the one thing it is worth beside the words it is about: a
tag, drawn as the trigger it is where it is one; a template's name; a reason; the refusal's code.
An id is never a fact — where the detail carries one, the name it stands for is said, and a
template or destination since deleted is `a template` or `a destination`. `firedByTag`, `attempt`,
`record` and the rest are not drawn at all. *Retired 2026-09-14: "`detail` is flattened
generically, never per kind."* The table of facts is small and in one place, and a kind it has no
entry for still reads — its detail flattened as before, dotted keys and strings unquoted — so a
kind nobody has written yet is not lost, only plainer.

**A subject leads to the capture it is about** *(amended 2026-09-09; it led to the log narrowed to
that subject)*. An entry naming an id is an entry a person cannot connect to anything they wrote,
so the **capture's own first words** are drawn in place of the id wherever this shell already
holds it — never read for: what the cache has, or the shortened id it has instead. The words are
a link to the item, at the body's left; the fact is at its right, and stacks under the words below
`narrow`. *`only this` is gone (2026-09-14)*: the way into one item's history is `history` on the
item, and a row of the log offers nothing about narrowing.

**A routing kind draws the record.** `routed` draws the block under its row from what the action
says — destination, capability, place, template — with what was sent read by the record's id on
arrival, and a refusal saying the pool kept no copy read as `nothing kept` rather than as a
failure; `item` in the block's foot is the way to the capture. `delivery-failed` draws the head and
the failure's own words as the body, in alarm; `delivery-cancelled` the head and `called off`.
`template-fired` draws no block — its fact is the template's name, and the routing it began is a
row of its own. The block is the item's, drawn once and the same wherever a record is read.

**`history` is the log narrowed to one item**, reached from the item's actions, and says so above
the head: `HISTORY`, the item's first words as a link to it, and `all of the log`, which widens
while keeping the view. The order and the filter both live on the URL, so a reload and a shared
link come back to the same reading.

**The log is narrowed to a view** *(added 2026-09-13)*: `everything`, `routing`, `captures`,
`classification`, `pool`, drawn as **tabs on the head's rule** — the one being read bold and
boxed on three sides so it sits on the rule, the rest as links, the order control at the right of
the same rule. Below `narrow` the tabs scroll sideways rather than wrap. A view is a fixed set of
the pool's own kinds and the URL carries the kinds rather than the name — `?kind=routed,template-fired`
— so a link somebody writes by hand reads the same way as one of these, and a set that is not
exactly a view lights none of them. The pool does the narrowing: a page holds what it shows, where
a shell sifting the page after the read would page over rows it then threw away. What arrives at
the head is held to the same kinds. A view composes with a subject.

**What has happened since goes to the head of the page** *(added 2026-09-09)*. The shell already
reads the action log on its own tempo for the corner to speak from, and the log was the one surface
that did not listen to it: a page read on arriving stayed the photograph it was taken as, and
seeing anything new meant reloading. It listens now, and what arrives is put above what is drawn.
**Newest-first only** — read oldest-first the walk starts at the oldest entry and what just happened
belongs past the end of a walk nobody has finished, where the walk itself will bring it. More
happening between two asks than a page holds is not a head to add: the whole reading is stale, and
it is read again from the top — **on the same rule, and so newest-first only too**. Oldest-first
nothing went stale, the walk growing towards the news rather than away from it, and ten walked
pages are not the shell's to throw away for a burst at the far end.

**A gap opens where more than half a day passed** between a row and the one before it in reading
order — the index's gap, one fixed size whether a day or a month passed — so time passing is seen
without being read.

**No count.** *(2026-09-14; `N shown` sat in the head until then.)* A refusal is drawn in the head,
in alarm, since it is what the read has to report; a pool that never answered is not one: the
reachability mark already says *offline* once, for the whole shell, and no surface repeats it.

`/docs` is the daemon's own page, a vendored Swagger UI, and is left alone: restyling somebody
else's application is not this design's job. Settings marks the two apart — one of this shell's
routes, and one the browser leaves for.

### Content

A **note** renders as CommonMark, collapsed and opened — that is what
[standards.md](../standards.md#payload-types) says a note is. Its attachments are drawn above it,
in slot order, each by its own media type. **One renderer draws every note** *(2026-09-14; the shell
showed its asterisks until then)* — and no output, which is drawn as sent (`An item has an
address`): `micromark`, which is CommonMark and
nothing more. Every element is at the one size; a heading is bold; a list keeps its marks; a code
span is in the one face. Raw HTML in the source is escaped, never rendered — the words came from a
capture, a destination or a template and are never the shell's own — and a link is kept only where
its address is `http` or `https`, on the rule the record's pointer already follows: a
`javascript:` address in an `href` is script on this origin, and the renderer's own list of safe
protocols is longer than this shell's. An image in the source is drawn from wherever it points,
which is what a person wrote. **A line break typed is a line break drawn** *(added 2026-09-15)*:
CommonMark folds a soft break into the paragraph, so three short lines came out as one, which
nobody who pressed `enter` three times meant. The break is kept, without a paragraph's space —
`white-space: pre-line` on the paragraph — and a blank line still makes a paragraph.

A payload type this shell cannot draw **says so by name** and stays taggable, archivable and
routable, since none of those need to understand the content. An item never becomes an invisible
row, and adding a renderer later is additive.

### Tokens and themes

Every colour, face, size and spacing step is named by **role** in one `@theme` block in
`styles/tokens.css`. Components name roles; no component names a value, and the gate in
`tokens.test.ts` fails the build on one — a hex, a colour function, a `dark:` variant, a font
family, a Tailwind palette colour, or any of the roles the shell used to have and no longer does.

The roles, as of 2026-09-14: `ground`, `ink`, `alarm`, and `inert` for the one grey admitted where
nothing else can say a control is inert; `font-shell`, the one face; `text-shell`, the one size,
with its line height; `tracking-caps` for a label; `rail`, `rail-narrow`, `gutter`, `measure`, `measure-wide`,
`read`, `prose` and `gap-time` for the widths and the one gap; `narrow` and `wide` for the two
breakpoints. Ground and ink are `light-dark()` pairs and swap; the alarm does not. Dark is the
inversion of light, `#000` on `#fff` becoming `#fff` on `#000`, and nothing warmer.

**Which palette is on is the reader's**, chosen in settings under *Appearance* as a row of three
words, `auto · light · dark`, the chosen one bold. `auto` is the browser's own answer and the
default, because it is the only one that can be right before a person has said anything. The
choice is remembered and applied **before first paint**, or the page shows one palette and
corrects itself in front of the reader.

### Visual direction

*Settled 2026-09-14 in [ADR 46](../adr/0046-the-shell-is-one-face-one-size-ink-on-white-and-processing-is-a-surface.md),
against [the brief](../design/brief.md) and the drawings in `docs/design/redrawn/`. What they
settled is below. Where this section and the drawings disagree, the drawings win.*

**Printed and digital at once.** An index, a ledger, a running head — set on screen with nothing
that pretends to be paper. The references are one face, one weight or two, one size, black on
white, with columns and a few rules doing all the work. None of them use size for hierarchy.
None of them use grey.

**Colour.** Ground `#fff`, ink `#000`, and nothing between them by default. **One red**, for
failure and for destructive action only: a refused operation, a delivery that is retrying or
abandoned, `discard`. Never for a primary action, never for a link, never for structure. Primary
actions are ink — bold, or inverted. **Green went** on 2026-09-14: a destination that answered
says `reached` in words. **Grey went** with it; secondary is regular weight, primary is bold or
capitals, and the one grey the tokens hold is for a control that is genuinely inert and for
nothing else. Dark theme is the inversion, designed once, in light.

**Type.** One face, Bricolage Grotesque at 400 and 600, self-hosted from `static/fonts/` and
served by the daemon beside the app — a face on the same origin is exactly as offline as the app,
which is what the browser's-own-faces rule was for. **One size**, 15px on 22px, everywhere:
captured prose, timestamps, labels, actions, the bar. Hierarchy is weight, capitals or small-caps
with tracking for a label, and position. Tabular figures on the stamp and nowhere else. A link
under the cursor is underlined, never coloured.

**Grid.** Two idioms, and the rule for which is where. *Lists are open*: queue, feed and log rows
align on shared columns with no rule between rows; whitespace separates entries. *Rules mark a
change of region*: a 1px ink rule under the bar; a vertical rule between the date column and the
body, running the height of the list; a ruled box around the capture field; a ruled box around
the selected row with the actions as its foot; rules between sections of the process surface and
of settings; a ruled frame around a routing record. Nothing is ever boxed on four sides except the
capture field, a record block, a control, and the selected row.

**Every surface is a register.** A fixed column of times, a wide column of content: the row reads
as a dated entry in a ledger, which is why the capture time is its title. The left column is a
**metadata rail** — the stamp, the tags, and on the feed the state word and where the item went.
The right column holds nothing but what was captured. Both surfaces are one grid, each item
dropping two cells into it, so the columns stay in register down the whole page.

**A phone keeps both columns.** Below 44rem the rail narrows to the width of a stacked date and
time, and the two columns survive, because the rail is what says what a thing is.

**The measure.** The page and the bar are capped at 56rem *(amended 2026-09-14; the drawings
said 72rem, and at a desk the capture field and the bar read as wider than anything under them)*;
the process surface alone takes 72rem from `wide`, its two columns needing the room. **A paragraph
is capped at 38rem** — about seventy characters — inside the body column: the column keeps its
width, the prose stops early, as prose is set. Paragraphs are set apart by a blank line, never an
indent.

**Motion.** Few, structural, ~150–200ms, `prefers-reduced-motion` honoured. Nothing else moves.
*(Not yet built; phase 7 of the plan.)*

*What was here before* — industrial bones on paper skin, two faces at two sizes, muted ink, green
for a result and red for an action, the accent edge on the open row, the furlable rail — was the
direction of 2026-08-19 and is superseded. The furl went with the old row on 2026-09-14: the index
view is how a reader sees more at once.

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

- **A held row is released by selection, not by a clock.** *2026-09-08; retired 2026-09-14: the
  queue holds no processed row now that processing is a surface which moves on to the next item,
  and a processed item is seen on the feed.* A processed row used to
  hold its place for 1200ms, which is the length of a departure and no use for a decision: routing
  the same capture to a second place meant finding it again in the feed. Tying the hold to the row
  being open makes it exactly as long as somebody is looking, and costs nothing, the register
  already holding one open row at a time.
  Rejected: **a longer timer**, which is arbitrary against both jobs and reads as a row that will
  not leave; and **holding every processed row until the surface is left**, which draws a session's
  whole trail on a surface whose job is to reach zero, and would keep the drained queue from ever
  saying so. Also rejected, and further back: a **mode or filter** on the queue that includes
  processed items, which would make it something other than the pool read as the unprocessed ones
  ([core.md](core.md#the-queue)). At most one held row is transient shell state and no read claims
  it. What the queue cannot answer — *what did I process today* — is the log's question.
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
- **Routing is a modal, not a panel beside the row.** *2026-08-24; superseded 2026-09-14 by
  [ADR 46](../adr/0046-the-shell-is-one-face-one-size-ink-on-white-and-processing-is-a-surface.md):
  routing is a surface of its own.* The panel was answering "the
  item must stay on screen", and it charged the whole shell for it: the register reserved a second
  column, the row reserved a measured height, and the page widened whenever one opened. A modal
  names the capture it is about instead, which is the part of the row the decision actually needs.
  What is lost is the item being readable beside the choice; what is bought is that nothing in the
  register has to know a composer exists.
- **Routing escalates out of the row into a composer.** *Superseded in part 2026-09-14: the
  escalation holds, the panel beside the row does not.* Routing is composition, not selection, and
  a flat control set hides the dependency between its parts. It is also the only irreversible act
  in the shell, so it is the one that earns a deliberate surface — which is what "fast capture,
  deliberate processing" already asks for. The composer sits beside its row rather than over it, so
  the item never leaves the screen. **The row's height is the contract**: the panel is out of the
  row's flow, so the row reserves the measured height and the register's second column reserves the
  width. A composer wider than one panel, or open on two rows at once, is outside what that
  arrangement holds.
- **Red is spent on failure and destruction, not on structure.** *Narrowed 2026-09-14: it left the
  primary actions and the links too.* An earlier version made red the line-work. At five separators
  plus a spine it stopped meaning anything; ink carries structure and red is reserved for what has
  gone wrong or cannot be undone.
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
- [x] 2026-08-19 — **Which markdown library, and whether captured markdown is sanitised before
      rendering.** Answered 2026-09-14: `micromark`, chosen by the developer for being CommonMark
      exactly and small, with raw HTML escaped and links held to `http`/`https` (`Content`, above).
      `@tailwindcss/typography` is not used; every element is at the one size and the few rules
      are the shell's own.
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
