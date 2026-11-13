# Notemap shell, audited for a phone

**Date**: 2026-10-30
**Status**: Resolved. What was decided from it is in [DECISIONS.md](../design/mobile/DECISIONS.md), and the design in [docs/design/mobile/](../design/mobile/) follows it.
**Scope**: the web shell as of v0.15.0, every route at 390 and 1440
**Plan**: [mobile-first-rethink](../plans/mobile-first-rethink.md)

> Converted from the published artifact, http://palmdesk:3006/projects/notemap/?f=2026-10-30-1356-notemap-mobile-rethink/audit.html, without its shots. The shots it refers to are there;
> the design as it now stands is shot in [docs/design/mobile/shots/](../design/mobile/shots/).
> Finding names (Q1, I2, …) are the review's own.

---


Every route and every state I could reach in the web shell, shot at 390 and 1440 against the stage of `main` (v0.15.0) on 2026-10-30, signed in, with the stage's seed plus a few captures of my own. For each route: the shots, then what a person on a phone has to read, remember, reach or scroll past, then options and a recommendation. The Builder works from the recommendations. Where one departs from ADR 46, 52 or 54 it says so in red.

The 390 shots are taken with touch and mobile emulation at a 2x pixel ratio. Emulation draws no on-screen keyboard, so whatever a keyboard covers is described in the text and not visible in the shots. Full-page shots grow the viewport to the page's height, which pins the status line to the foot of the image. Click a shot for the full size.

## Summary

1. **The process surface shows the whole decision before any of it is made.** On opening, a phone shows five section labels, three band labels and eleven entries. Destination, place, tags and preview are all drawn, empty, with nothing saying which comes first. Recommendation: on a phone, routing becomes three steps, each filling the screen: _where_, _place_, _check_. At a desk, the same order on one surface, with each section appearing once the one before it is settled.
2. **One list, two behaviours.** In the destination list, a template or a destination is a choice that waits for `route`. `manual` and `discard` act at once and jump to the next item. Nothing but the red of `discard` warns that two of the entries are different. Recommendation: take both out of the list and put them in the item's action bar, beside `route`.
3. **After `route` nothing visibly ends.** The surface stays on the same item with the empty destination list drawn again. A notice says `routed Vault`, and moving on takes `next →`. Manual, discard and a template's tag advance instead, so there are two rules to learn. Recommendation: a _done_ state that names where the item went, with `next item` as the primary action, `route again` and `undo` beside it.
4. **Templates hide behind an 8-pixel `+`.** The fastest way to route by template, four taps from the queue, goes through the tag chooser. That only works if the reader remembers that a template is a tag. The `+` is 8×23 px. Recommendation: templates drawn by name, as buttons, on the opened item and as the first entries of _where_. The trigger tag stays the mechanism and stops being the interface.
5. **Nothing a thumb touches meets 44 px.** Quick-tier words, list-head menus and the bar's links are 23 px tall. The tag `+` and the status line's `▴` are 8 px wide. The things used most, `capture` and the bar, sit at the top of the screen, the hardest place to reach one-handed. Recommendation: on a phone, a bottom bar for navigation and a bottom action bar on every full-screen step, every control at least 44 px tall.
6. **A phone screen holds about one and a half items.** At 390×844 the first screen is the capture box and one item and a half. Link-preview cards are about 110 px tall, and every row holds about 70 px of empty line for tags it does not have. Recommendation: on the list, a link preview becomes one line, rows clamp at three lines, and the empty tag line goes.
7. **No visible way back.** On the process surface, `esc` is the only back, and the `leave`/`stay` prompt is reachable only from a keyboard. Tapping `queue` in the bar drops a half-made decision without asking. Recommendation: a visible back control top-left on every full-screen view, and each step pushed onto the browser's history, so the system back gesture moves back one step instead of fighting it.
8. **The phone's status line says almost nothing.** Below `narrow` the queue count is not drawn, so the line holds a lone `▴` for most of a session and costs 44 px of height. Recommendation: on a phone it merges into the bottom bar. The queue count becomes a number on `queue`, and the message line rises above the bar only while a notice is live or a route is in flight. Departs from ADR 54.

## The three core tasks, counted

Walked at 390 on the stage. A tap is a press on a control. A keystroke is a character typed. A scroll is a gesture needed to bring a control into view, counted without the on-screen keyboard and then said again with it. _Read_ is what the person has to take in to choose. _Remember_ is what they must bring with them because the screen does not say it.

| Task | Path | Steps | Taps | Keys | Scrolls | Read | Remember |
|---|---|---|---|---|---|---|---|
| a. Capture a note | queue → box → `capture` | 3 | 2 | text | 0 | nothing | nothing |
| a′. … with a tag | + `+`, pick or type | 5 | 4 | text + tag | 0 | the offer list | the tag's name if it is not offered |
| b1. Route by template, from the row | row → `+` → `route/todo → Todo` → `## Next` | 4 | 4 | 0 | ≥1 to find the row | 4 offers, each a tag in small caps, an arrow and a template name; headings in markdown | that a template is a tag and lives under `+`; that it leaves in 15 s |
| b2. … at capture | box → text → `+` → offer → heading → `capture` | 6 | 5 | text | 0 | as b1 | as b1 |
| b3. … on the process surface | row → `process` → `Todo` → `## Next` → `route` → `next →` | 6 | 6 | 0 | 0 (1–2 with keyboard) | 3 bands, 11 entries; then `1 routed last today`, `todo.md`, `LIST`, preview | that `Todo` under TEMPLATES differs from `Vault` under DESTINATIONS; that route does not move on |
| c. Route by hand to a destination and place | row → `process` → `Vault` → place → `seeded/` → type → `route` → `next →` | 8 | 7 (+1 to drop the keyboard on a real phone) | 12 (`bike-rack.md`) | 0 (1–2 with keyboard) | 3 bands; the tree; the preview's path | the folder; the file-name convention, `.md` included |
| c′. … accepting the proposed place | row → `process` → `Vault` → `route` | 4 | 4 | 0 | 0 | the proposed name, `idea- a bike rack that folds flat into the hallway wall.md` | nothing, but the place is decided without being looked at |

Capture is already short. What costs on capture is reach: the box and `capture` sit at y≈75–185, and a touch does not focus the box on its own, so every capture starts with a tap at the top of the screen. Routing by template is short only for someone who knows the trick. The hand route's count is fine. Its problem is reading: eleven entries in three bands, then a tree, then a preview, all on one scroll.

### a. Capture

> shot: walk-a1-open · 390
> shot: walk-a2-typed · 390
> shot: walk-a3-captured · 390

### b. By template, from the row

> shot: walk-b1-selected · 390
> shot: walk-b2-offers · 390
> shot: walk-b3-asking · 390
> shot: walk-b4-firing · 390
> shot: walk-b5-landed · 390
After the fourth tap the row stays put and reads `→ Vault todo.md, task, Next`, while the status line counts `routing 14s cancel`. When it lands, the row says `→ Vault todo.md` and the line says `routed Todo`. Three names for one decision: the tag `#TODO`, the template `Todo`, the destination `Vault`.

### c. By hand

> shot: walk-c1-process · 390
> shot: walk-c2-destination · 390
> shot: walk-c3-place · 390
> shot: walk-c4-routed · 390
The last shot is the surface after `route`: the same item, its routing line added under the stamp, and the destination list empty again.

## Queue and capture `/`

> shot: queue · 390
> shot: queue · 1440
> shot: queue, first screen · 390
> shot: queue, first screen · 1440

#### The capture box

> shot: capture, tag offer · 390
> shot: capture, tag offer · 1440
> shot: capture, template asks for its list · 390
> shot: capture, template asks for its list · 1440
> shot: capture, a picture and a file attached · 390
> shot: capture, a picture and a file attached · 1440
> shot: a file dragged over the page · 390
> shot: a file dragged over the page · 1440

#### The list head

> shot: view menu · 390
> shot: view menu · 1440
> shot: index view · 390
> shot: index view · 1440
> shot: filter panel · 390
> shot: filter panel · 1440
> shot: order menu · 390
> shot: order menu · 1440

#### A selected row: the quick tier

> shot: selected row · 390
> shot: selected row · 1440
> shot: tag chooser on the row · 390
> shot: tag chooser on the row · 1440
> shot: template asks, on the row · 390
> shot: template asks, on the row · 1440
> shot: editing the capture in place · 390
> shot: editing the capture in place · 1440

#### Q1. Capture starts at the top of the screen

Problem. The box is the first thing on the queue, at y≈75 px, and `capture` is at its top right (60×34 px). On a phone held in one hand that is the furthest point from the thumb. A touch does not focus the box by itself, so every capture costs a reach to the top before typing.

Options. (A) Keep the box at the head and add a `capture` button in a bar that rides above the keyboard while the box has focus. Cheap, and the box still opens the queue. (B) On a phone, the app opens on a capture screen: a box filling the screen, keyboard up, `capture` above the keyboard, the queue one tap away. Fastest to capture. It changes what the app is on first sight and wants a native shell to raise the keyboard on launch. (C) A `+ capture` button in the bottom bar opens a capture sheet focused inside the same tap, which is what lets a browser raise the keyboard.

Recommendation: C in the web shell, B in an app. The box at the head of the queue stays at a desk.

#### Q2. One and a half items per screen

Problem. Each link preview card is about 110 px tall on the list. Each row holds an empty line for tags it does not have, which adds about 70 px of white. The list head's date collides with three menus. On the first screen at 390×844 a person reads the capture box, one item and half of the next. The queue is supposed to drain; a reader triaging it scrolls past cards to see words.

Options. (A) On the list, a link preview is one line, site and title, and the card is drawn on the opened item. (B) Clamp a row to three lines with `more`, which already exists for long captures as `+ 5 lines`. (C) Drop previews from the list altogether. Fewest pixels, and loses the one cue that a bare URL item is about something.

Recommendation: A and B together. Drop the held tag line on rows without tags; the reason it is held (selection does not shift the row) goes away once selecting on a phone opens the item full-screen.

#### Q3. Targets are 23 px tall, some 8 px wide

Problem. Measured at 390: `process`, `manual`, `discard`, `edit`, `copy`, `open` are each 23 px tall, spaced 12–20 px apart. The tag `+` on a row is 8×23 px; on the capture box 8×34 px. `timeline ▾ filter ▾ oldest ▾` are 23 px. The status line's `▴` is 8 px wide. A mis-tap next to `discard` discards.

Options. (A) Grow hit areas invisibly with padding, keeping the look. (B) Move actions into bars with 44 px cells. (C) Both.

Recommendation: C. The look of one size and plain words survives; the hit area does not have to be the glyph.

#### Q4. The quick tier is a row of small words, and templates are not in it

Problem. A selected row's foot holds six or seven words in one line, decisions left and work right. On the item page it wraps into two lines and the second sits on the box's bottom rule (see `item-unprocessed`, `item-discarded`). Templates, the fastest route, are absent: they are reached through `+`, which reads as "add a tag". ADR 46 put them there because a template is a tag. True for the pool. On a phone it is something to remember.

Options. (A) Keep the row's foot and add a line of template names under it. Stays in the list, as ADR 46 wants, and makes the row taller. (B) On a phone, tapping a row opens the item full-screen with an action bar at the bottom (`discard`, `manual`, `route`) and the templates as named buttons above it. One tap more to discard from the list; everything else gets room. (C) Swipe a row to reveal actions. App only, and destructive swipes are easy to set off by accident.

Recommendation: B on a phone, A at a desk. Departs from ADR 46's "nobody leaves the list" for the quick tier on a phone. The list stays for scanning; the decision moves to the opened item, which is what the developer asked for.

#### Q5. Three menus in the list head

Problem. `timeline ▾`, `filter ▾` and `oldest ▾` are three dropdowns on one line, each a small popover. On a phone they are reading preferences touched rarely, and they sit where the eye goes first. The filter panel on the queue at 390 opens over the first row with an empty rule at its top and `No tags.`

Options. (A) One `view` button opening a bottom sheet holding order, timeline/index and filters, with big rows. (B) Keep them and enlarge. (C) Move all three to Appearance. Wrong for filters, which ADR-wise belong to the moment, not the device.

Recommendation: A on a phone; keep the three at a desk. A filter in force still shows in the head, as `filter 1` does now.

#### Q6. Tags and templates in the capture box

Problem. The offer opens as a small popover over the list, entries as `ROUTE/TODO → Todo`. The asked argument then opens as a sheet at the foot of the screen, which is the right place and is the best-shaped phone control in the shell today. The reader still has to know that tagging `route/todo` files the item.

Options. (A) Under the box, a row of chips: the templates by name and the most used tags. Tapping a template chip asks its argument in the same bottom sheet. (B) Keep the chooser and draw templates by name only. (C) No tagging at capture on a phone; route afterwards.

Recommendation: A. The chooser stays for typing a tag nobody has used yet.

#### Q7. Editing in place works and is cramped

Problem. `edit` turns the row into a field with `close`, `attach` and `save` under it. The field scrolls inside the row; with the keyboard up, little of it is visible. `edit` here edits the capture. On the process surface the same word edits only this delivery's words.

Recommendation: on a phone, edit opens the item's words full-screen with `save` in the bottom bar. See W2 for the label.

## Process surface `/items/{id}/process`

> shot: on opening · 390
> shot: on opening · 1440
> shot: destination line narrowed by typing "cl" · 390
> shot: destination line narrowed by typing "cl" · 1440
> shot: a template that asks: Todo · 390
> shot: a template that asks: Todo · 1440
> shot: Todo, list chosen, preview · 390
> shot: Todo, list chosen, preview · 1440
> shot: Vault chosen by hand, place proposed · 390
> shot: Vault chosen by hand, place proposed · 1440
> shot: place browsed and typed · 390
> shot: place browsed and typed · 1440
> shot: Board, a channel as place · 390
> shot: Board, a channel as place · 1440
> shot: an item with a picture · 390
> shot: an item with a picture · 1440
> shot: Cloud: the output band appears · 390
> shot: Cloud: the output band appears · 1440
> shot: rewriting this delivery's words · 390
> shot: rewriting this delivery's words · 1440
> shot: tags band · 390
> shot: tags band · 1440
> shot: a long capture · 390
> shot: a long capture · 1440
> shot: manual taken: committed and moved on · 390
> shot: manual taken: committed and moved on · 1440
> shot: leave prompt, reached only by esc · 390
> shot: leave prompt, reached only by esc · 1440

#### P1. The whole decision on one screen

Problem. On opening: `DESTINATION` with an empty line, then `TEMPLATES` (4), `DESTINATIONS` (3), `OTHERWISE` (`manual` with `processed by hand`, `discard`), then `PLACE`, `TAGS`, `PREVIEW` drawn empty, then `← previous next → route`. The reader reads eighteen labels to find the first thing to do. With a few more templates and destinations the list alone fills the screen.

Options. (A) Steps on a phone. _Where_: templates and destinations as one list of big rows, templates first by name. _Place_: the folder or channel, skipped when a template fixes it and asks nothing. _Check_: preview, the words, output, and `route`. A header names the steps and lets the reader jump back. (B) One screen with progressive disclosure: only _where_ until something is chosen, then it folds to one line and _place_ opens, and so on. (C) Keep the layout and hide empty sections.

Recommendation: A on a phone, B at a desk. Both put the sections in the same order, so the two read as one design.

#### P2. Two entries in the list act, the rest choose

Problem. Tapping `Vault` or `Todo` chooses; nothing happens until `route`. Tapping `manual` or `discard` marks the item at once and goes to the next one (`process-manual`). The reader has to remember which kind each entry is. The spec names this inconsistency itself.

Options. (A) Move `manual` and `discard` out of the list into the item's action bar. (B) Make them choices too, with the bottom button reading `discard` or `mark done`. Consistent, one tap slower. (C) Keep them and mark them with a word such as `now`.

Recommendation: A. They are decisions about the item, not places; next to `route` is where they read as alternatives to it.

#### P3. After route, the item stays and the list comes back

Problem. `route` leaves the surface on the same item, clears the decision, and draws the destination list again (`walk-c4-routed`). Only the notice and a small routing line under the stamp say it worked. Manual, discard and a template's tag advance. The reason for staying is real: an item may go to two places.

Options. (A) A done state on the same screen: _Routed to Vault / seeded/bike-rack.md_, with `next item` as the primary at the bottom, `route again` and `undo` beside it. Swiping to the next item works from here too. (B) Always advance, and route a second time from the item page. Simplest; the second place costs a detour. (C) Keep it and make the notice bigger.

Recommendation: A, at both widths. It also gives `save as template` a natural home later.

#### P4. No way back you can tap

Problem. Back is the `back` command on `esc`. On a phone there is no key, so the way out is the bar's `queue` link, which drops a chosen destination without the `go back to the queue? stay leave` prompt; that prompt answers `esc` only. Browser back returns to the queue, also silently.

Options. (A) A `‹ queue` control top-left on the full-screen item and on each step. (B) Push a history entry per step so the browser's back, including its edge swipe, goes back one step, and ask before leaving the item with a decision half made. (C) Both.

Recommendation: C.

#### P5. The foot mixes walking and deciding

Problem. The fixed foot holds `← previous`, `next →` and `route`. `route` is in the right place for a thumb, and at 390 it overruns the column by about 9 px. While a place is typed the keyboard covers the foot, so routing needs a tap to drop the keyboard first. When opened by URL rather than from the queue, previous and next are greyed with no reason given.

Options. (A) The bottom bar holds the step's one primary (`next step`, then `route`) and `back`; previous and next item move to a swipe on the item and two small controls at the top. (B) Keep the foot and pin it above the keyboard using the visual viewport. (C) Both.

Recommendation: C.

#### P6. The place is decided before it is looked at

Problem. Choosing `Vault` proposes a file named from the words, `+ idea- a bike rack that folds flat into the hallway wall.md`, and enables `route` at once. A person in a hurry routes to a file with that name. The tree under the place line mixes folders and files with the proposal underlined among them. On Board the place is a channel list; on a template it is `todo.md` with an `edit`.

Options. (A) The place step opens on the proposal written as a path, _Vault / idea-a-bike-rack.md_, with `change folder` and `rename`; the tree is one tap further. (B) No proposal; the reader picks. Slower, and the proposal is right often enough to keep. (C) Keep, with a cleaner slug.

Recommendation: A, and a cleaner slug, which is the destination's to make and outside the shell.

#### P7. A template's question is asked in markdown

Problem. Todo asks `LIST` and offers `## Inbox`, `## Next`, `## Waiting on`, `## Someday`, raw heading marks included, under a field with no visible box. After a choice the list collapses to `clear` and the one chosen.

Recommendation: ask it as its own step, or as the bottom sheet the row already uses: the template's label as a question (_Which list?_), the headings without marks, big rows. Same at a desk, inline.

#### P8. Rewrite, tags, output and usage counts compete for attention

Problem. `edit` at the head's right rewrites only this delivery, with `restore` and `done`; the same word edits the capture on the row. The tags band applies a tag to the pool the moment it is taken, unlike every other band, which waits for `route`; at 390 it opened with nothing offered. `1 routed last today` beside a chosen destination is usage data, read and not acted on. Output (`everything` / `attachments only`) appears only when it matters, which is right.

Options. (A) Put rewrite and output in the _check_ step, next to the preview they change; move tags to the opened item, outside routing; drop usage counts on a phone. (B) Keep all and collapse them behind `more`. (C) Keep.

Recommendation: A.

#### P9. A long capture scrolls in a box inside a page that also scrolls

Problem. The head is capped at about a third of the screen below `narrow` and scrolls on its own; the middle scrolls separately. A long capture is cut mid-line (`process-long`). Two scroll regions on 844 px, plus a keyboard, is a lot to steer with one thumb.

Recommendation: the opened item shows the capture whole; the routing steps show a two-line summary of it with `show all`.

#### P10. At a desk the left column is mostly empty

Problem. At 1440 the capture takes the left two-fifths and usually fills a few lines of it. The right column is where the work is, and it is the same list as on a phone.

Recommendation: keep two columns; apply P1 B, P2, P3 and P7. The desk does not need steps.

## Item and record `/items/{id}`, `/items/{id}/records/{rid}`

> shot: unprocessed item · 390
> shot: unprocessed item · 1440
> shot: editing an unprocessed item · 390
> shot: editing an unprocessed item · 1440
> shot: routed by a template, records folded · 390
> shot: routed by a template, records folded · 1440
> shot: a record unfolded · 390
> shot: a record unfolded · 1440
> shot: routed by an asking template · 390
> shot: routed by an asking template · 1440
> shot: routed by hand to todo.md · 390
> shot: routed by hand to todo.md · 1440
> shot: marked manual · 390
> shot: marked manual · 1440
> shot: discarded · 390
> shot: discarded · 1440
> shot: an item with a picture · 390
> shot: an item with a picture · 1440
> shot: a record's own address · 390
> shot: a record's own address · 1440
> shot: withdraw, asked · 390
> shot: withdraw, asked · 1440

#### I1. The item page is a selected row with records under it

Problem. It draws the item as the queue draws a selected row, box and foot, then each record as one folded line: `Vault / seeded/0198f0c2-…`, `created`, `delivered`. Unfolded, a record shows the output, then `FOLDER`, `FILENAME`, `SIZE`, long ids wrapping over three lines at 390. The quick tier wraps over the box rule (Q4). There is no back control.

Options. (A) On a phone the item page is the same full-screen item a tap on the queue opens: capture whole, tags as chips, a _sent to_ list of records (destination and place on one line, state as a word), the action bar at the bottom. A record opens as its own screen. (B) Keep the shape, fix the wrap and enlarge targets.

Recommendation: A. One item screen, whether reached from the queue, the feed, a link or a notice.

#### I2. Reinstate is gone once you leave

Problem. `withdraw` asks, with `withdraw` in red next to `keep`; the two are 23 px tall and close together. After a withdrawal, `reinstate` is offered in that block until the view is left. After a reload the withdrawn record is drawn on neither the item page nor the record's own address, and the log draws its block without `reinstate`. This is what the spec says (`reinstate` is offered only where the withdrawal was made). On a phone, with a mis-tap one row away, a withdrawal the person did not mean cannot be taken back in the shell once they navigate. I did exactly that while shooting, and had to reinstate through the HTTP API.

Options. (A) Draw withdrawn records on the item, struck through, with `reinstate`. (B) Keep reinstate where it is and say `undo` on the status line for the usual few seconds. (C) Both.

Recommendation: C. This one is a behaviour change to the spec and wants the developer's call.

#### I3. Processed items cannot be edited from the shell

Problem. `edit` is offered only while an item is unprocessed. The glossary describes revisions made by editing a sealed item; the shell offers no way to make one, so the feed's `[+]` revision mark and `revised` state come only from relays. I note it because the no-feature table has nothing to place for it, not as a phone problem.

## Feed `/feed`

> shot: feed · 390
> shot: feed · 1440
> shot: feed, first screen · 390
> shot: feed, first screen · 1440
> shot: a routed row, selected · 390
> shot: a routed row, selected · 1440
> shot: a row marked manual, selected · 390
> shot: a row marked manual, selected · 1440
> shot: a discarded row, selected · 390
> shot: a discarded row, selected · 1440
> shot: filter: state, destination, source, templates · 390
> shot: filter: state, destination, source, templates · 1440
> shot: order: newest, oldest, by processed at · 390
> shot: order: newest, oldest, by processed at · 1440
> shot: index view · 390
> shot: index view · 1440

#### F1. The feed inherits the queue's density, plus routing lines

Problem. Each row adds a trigger tag (`#CLOUD`) and a routing line (`→ Cloud …/0198f0c2-0000-7000-8000-0000…`), with ids cut mid-way. A routed row's foot offers `process manual discard` again, which is right (an item can go to more places) and reads as if the item were still undecided.

Recommendation: the same row as the queue (Q2), with the routing line as destination names only, and the place on the item screen. Tapping opens the item screen (I1); its action bar says `route again` rather than `process` for a routed item.

#### F2. Filters are a long dropdown in small caps

Problem. The feed's filter panel lists STATE, DESTINATION, SOURCE and TEMPLATES in one popover; templates appear as small-caps tag stems (`BOARD`, `CLOUD`) rather than their names.

Recommendation: the same bottom sheet as Q5, filters as chips in groups, templates by name.

## Log `/log`

> shot: everything · 390
> shot: everything · 1440
> shot: views menu · 390
> shot: views menu · 1440
> shot: routing · 390
> shot: routing · 1440
> shot: captures · 390
> shot: captures · 1440
> shot: classification · 390
> shot: classification · 1440
> shot: pool · 390
> shot: pool · 1440
> shot: history of one item · 390
> shot: history of one item · 1440

#### L1. At 390 the rail takes the row

Problem. The rail holds date, time and the kind in capitals on up to four lines (`DELIVERY / WITHDRAWN`). The body column gets the item's first words cut at about twenty characters (`check whether the sweeper ra…`) and a tag stem at the right. The thing a reader traces by, which item, is the part cut shortest.

Options. (A) One column on a phone: _14:08 · withdrawn · Vault_ on one line, the item's words on the next, full width; days as headings as the register does by day. (B) Keep the rail and shrink the kind to one line. (C) Hide the log on a phone.

Recommendation: A. The log is for tracing and is mostly a desk task, but a person checking why something did not land will do it from a phone.

#### L2. Views are a multi-select dropdown

Problem. `views ▾` opens a list of four, any number held, with `everything` to clear. The brief drew a tab row; the code is a dropdown. On a phone it is one more small menu.

Recommendation: a row of chips under the bar, scrolling sideways if it must, `routing` first.

## Settings and the phone menu `/settings`, `/settings/{section}`

Below `narrow`, `/settings` is a menu of sections and each section has a `← settings` link. From `narrow` up, `/settings` lands on Destinations with the menu as a rail, so the 1440 shot of the menu is Destinations.

> shot: the phone menu (1440 lands on Destinations) · 390
> shot: the phone menu (1440 lands on Destinations) · 1440
> shot: Destinations · 390
> shot: Destinations · 1440
> shot: a destination opened · 390
> shot: a destination opened · 1440
> shot: a destination being edited · 390
> shot: a destination being edited · 1440
> shot: adding a destination · 390
> shot: adding a destination · 1440
> shot: Accounts · 390
> shot: Accounts · 1440
> shot: Templates · 390
> shot: Templates · 1440
> shot: a template opened · 390
> shot: a template opened · 1440
> shot: a template being edited · 390
> shot: a template being edited · 1440
> shot: delete, asked · 390
> shot: delete, asked · 1440
> shot: adding a template · 390
> shot: adding a template · 1440
> shot: Access: session and tokens · 390
> shot: Access: session and tokens · 1440
> shot: adding a token (not submitted) · 390
> shot: adding a token (not submitted) · 1440
> shot: Server · 390
> shot: Server · 1440
> shot: Storage · 390
> shot: Storage · 1440
> shot: Appearance · 390
> shot: Appearance · 1440
> shot: Pool settings · 390
> shot: Pool settings · 1440

#### S1. The phone menu already works

The menu page and `← settings` are the one place in the shell that already behaves like a phone app: a list, then a screen, then back. Use it as the pattern for the item and the process steps. It needs bigger rows and a back control in the same place as everywhere else.

#### S2. The template form is long and speaks in patterns

Problem. Editing Todo at 390 is about 1,900 px of form: name, trigger tag, destination, output, action (`create-or-append`, `create`, `append`), note path with `ask`, list with `ask`, pattern tokens (`{{captured_at:month}}`, `{{item}}`), `AS`, `HASHTAGS`, `IF MISSING` (`create`, `require`, `establish`). Writing this on a phone is unlikely.

Options. (A) Make a template from a route: the done state (P3) offers `save as template`, which takes the decision just made and asks only for a name, a trigger tag, and which fields to ask each time. (B) Group the form into steps on a phone. (C) Leave the form as it is and treat it as a desk task.

Recommendation: A at both widths, C for the full form. A phone can still read, rename and delete a template.

#### S3. Sign out lives under Access

Problem. `sign out` is the second line of `Access`, beside `this browser holds a session`. A person looking for it scans the menu for "account" and finds `Accounts`, which are someone else's servers.

Recommendation: keep it in Access and name the section's first group _this browser_, or move `sign out` to the foot of the menu.

## Status line

> shot: panel, nothing said yet · 390
> shot: panel, nothing said yet · 1440
> shot: a trigger tag counting down · 390
> shot: a trigger tag counting down · 1440
> shot: panel with a route in flight · 390
> shot: panel with a route in flight · 1440
> shot: cancelled · 390
> shot: cancelled · 1440
> shot: panel after cancelling · 390
> shot: panel after cancelling · 1440

#### SL1. On a phone the line is a lone triangle

Problem. Below `narrow` the line drops `notices` to `▴` and does not draw the queue count, per the spec. Between events it holds an 8 px glyph and costs a 44 px band at the foot, the best-reached strip of the screen. A route in flight is drawn well: `routing 15s cancel`, and the panel says `routing To the vault 15s open cancel`. `cancel` is 23 px tall during a 15 s window, which is when it matters.

Options. (A) Merge the line into a bottom navigation bar on a phone: the queue count as a number on `queue`, a notices mark when there is something unread, and the message line rising above the bar as a strip while a notice is live or a route is in flight. (B) Keep the line and show the queue count. (C) Keep as is.

Recommendation: A. Departs from ADR 54, which made the status line its own ruled line on every surface. At a desk the line stays as it is.

## Sign-in, offline, empty, errors

> shot: sign-in (fresh browser, nothing submitted) · 390
> shot: sign-in (fresh browser, nothing submitted) · 1440
> shot: offline · 390
> shot: offline · 1440
> shot: offline, a row selected · 390
> shot: offline, a row selected · 1440
> shot: drained, under a filter · 390
> shot: drained, under a filter · 1440
> shot: an item that does not exist · 390
> shot: an item that does not exist · 1440
> shot: a settings section that does not exist · 390
> shot: a settings section that does not exist · 1440

#### D1. Offline says why only on hover

Problem. Offline, the line says `offline` and `manual` is drawn inert. Why it is inert is in a `title`, which a phone never shows. Capture still works and the row stays, which is the point of the outbox and is right.

Recommendation: an inert action on a phone says its reason in words when tapped, in the message line.

#### D2. A missing section is SvelteKit's page

Problem. `/settings/nope` draws `404 no such settings section` with no way back but the bar. An item that does not exist draws a good sentence in the register.

Recommendation: one not-found screen in the register with `‹ back`. Low priority.

#### D3. Sign-in is fine

One field, one button, `sign in` inert until a password is typed. On a phone it wants a bigger button and `autocomplete` hints so a password manager fills it. Nothing else.

## Cross-cutting

### Navigation model

Today the shell is pages under a top bar, and the quick decisions happen in place on a list. On a phone the developer asked for something else: an item that fills the screen, steps that follow one another, actions at the bottom. Put together, the model I recommend for a phone is three levels and no more.

1. **Lists**: queue, feed, log, settings. A bottom bar switches between them: `queue` (with its count), `feed`, `+ capture` in the middle, `log`, `settings`. The top bar goes on a phone. Departs from ADR 46's bar.
2. **An item**, full-screen, reached by tapping a row anywhere (queue, feed, log, a notice, a link). Top: `‹ back`, the item's position (_3 of 8_) with previous and next. Middle: the capture whole, tags as chips, templates as named buttons, where it has been sent. Bottom: `discard`, `manual`, `route`. Swiping sideways on the item moves to the previous or next item in the list it was opened from.
3. **Steps** of a route: _where_, _place_ (skipped when nothing is left to choose), _check_, then _done_. A header names the steps; tapping one goes back to it. Swiping sideways moves between steps. The bottom bar holds the one thing to do next.

Every level pushes a history entry, so the browser's back and the system back gesture go back one level or one step. That is the answer to the edge-swipe conflict: rather than compete with the browser's back gesture, the shell makes back mean what the person expects. At a desk, the levels stay as they are today: lists with the quick tier, and the process surface as one screen with the order of P1 B.

### Where actions live

On a phone, every primary action goes in a bar at the bottom, right side for the one most used (`route`, `capture`, `next item`), destructive ones (`discard`) at the left, apart from it. Nothing that commits sits at the top. Secondary work actions (`copy`, `edit`, `history`, `open`) go behind a `more` in the item's top bar. Every bar cell is 44 px or taller and the bar honours the safe area. A bar sits above the keyboard while a field has focus (visual viewport), so `route` and `capture` never hide under it.

### Density

The shell's register is right for a desk and too airy for a phone list: one size, generous leading, and white held for things that are not there. Recommended for the phone list only: link previews as one line, rows clamped at three lines, no held tag line, the day heading without the three menus beside it. The full-screen item keeps today's air.

### ADR 46, 52 and 54

| Decision | What it says | This audit |
|---|---|---|
| ADR 46, driver | One layout, 375 px first, both columns (amended by ADR 52) | Departs. A phone gets its own views: bottom navigation, a full-screen item, routing in steps. The desk keeps today's layout, with the process surface reordered. |
| ADR 46, two tiers | Quick decisions on the row; nobody leaves the list for them | Departs on a phone. The quick tier moves to the full-screen item. Discarding from the list costs one more tap. At a desk the row keeps it. |
| ADR 46, templates through `tag` | A template is reached through tagging because it is a tag | Departs in presentation. Templates are drawn as named buttons; tagging still fires them. |
| ADR 46, chrome | The bar is `queue · feed · log · settings` at the top | Departs on a phone. The bar moves to the bottom and gains `+ capture`. |
| ADR 46, routing advances | Routing advances to the next item (shell.md amended 2026-09-15 to stay) | Neither: a done state with `next item` as its primary. Closer to ADR 46 than to the amendment. |
| ADR 52, by day | Rows by day below `narrow`, slim rail holding the time | Departs on a phone list. The rail goes; the time sits on the row's first line. If adopted, the `rows: rail` choice on a phone is unused, which ADR 52 names as the reason to revisit. |
| ADR 54, status line | One ruled line at the foot of every surface | Departs on a phone. Merged into the bottom bar; the message strip appears only while it has something to say. The desk keeps the line. |

## Gestures

iOS Safari takes a swipe from the left edge as back and from the right edge as forward; Chrome on Android uses the system back gesture from either edge, and pull-down at the top of a page reloads. A gesture marked **web** is safe in the browser shell. **App** needs an installed or native shell that owns the edges. **Both, with a fallback** works in both, in a reduced form in the browser. Every gesture has a visible equivalent.

| Gesture | Does | Where | Mark | Visible equivalent |
|---|---|---|---|---|
| Swipe sideways on the item, starting at least 24 px inside the screen's edges | Previous or next item in the list it was opened from | Full-screen item | Both, with a fallback: in the browser, edge starts are left to the browser; in an app, a swipe from the edge works too | `‹ previous` `next ›` in the item's top bar |
| Swipe sideways inside the step area | Previous or next step of a route | Routing steps | Both, with a fallback, as above | The step header (tap a step) and `back` / the primary in the bottom bar |
| System back (edge swipe, Android back, browser back) | Back one step, then back to the item, then to the list | Everywhere | Web; history entries per step make it work | `‹ back` top-left |
| Drag a bottom sheet down | Close it (notices panel, view and filter sheet, a template's question) | Sheets | Both, with a fallback: a drag on the sheet's handle only, so a page's pull-to-refresh is not triggered | `close` on the sheet |
| Pull down on the full-screen item | Close the item | Full-screen item | App: in the browser it competes with pull-to-refresh | `‹ back` |
| Swipe a row sideways to reveal `discard` / `manual` | Quick decision from the list | Queue list | App only, and optional. Not recommended in the web shell: easy to fire by accident while scrolling, and the row's own tap opens the item | The item's action bar |
| Long-press a row | Not recommended. Nothing in the shell needs it until batch selection exists | n/a | n/a | n/a |

The plan expects the prototype may run into the very conflict it is meant to expose. Starting a sideways swipe inside a 24 px gutter avoids iOS's back gesture in practice; Android's system gesture still takes the outermost pixels. Buttons stay the reliable path.

## Words

Button labels and microcopy, free to change. Domain terms are not touched here; see the next section.

| Today | Where | Problem | Proposed |
|---|---|---|---|
| `process` | Row foot | Says nothing about what happens; on a phone the row's tap opens the item anyway | Gone on a phone (the tap is the gesture); `route…` at a desk |
| `edit` (process head) | Process surface | Same word as editing the capture, different act | `reword for this route`; in _check_: `words: as captured · reworded` |
| `restore` | Rewrite | Restore what? | `use the captured words` |
| `OTHERWISE`, `processed by hand` | Destination bands | A band for two entries that are not destinations | Gone; the two move to the action bar |
| `TEMPLATES` / `DESTINATIONS` | Destination bands | The reader must know the difference to pick | One list in _where_: templates first, each with its destination beside it in regular weight (_Todo · Vault_) |
| `1 routed last today` | Chosen destination | Usage data, not a decision aid | Gone on a phone; at a desk, in the destination's settings |
| `## Next` | Asked heading | Markdown marks | _Next_ |
| `LIST` | Asked field label | A field name, not a question | The template's label as a question, _Which list?_ |
| `+` | Tags on a row and in the capture box | 8 px; reads as add, not as tag or template | `+ tag`, or chips with a `+` chip at the end |
| `ROUTE/TODO → Todo`, `#TODO` | Tag offer, row | Tag and template name together, or a stem | The template's name (_→ Todo_); the tag in the item's detail |
| `▴` | Status line below narrow | A glyph to discover | A number on `queue`; a dot on the bar when there is something unread |
| `previous` / `next` greyed with no word | Process foot | Inert without a reason | Hidden when there is nothing to walk |
| `go back to the queue? stay leave` | Leave prompt | Fine. Only reachable by `esc` | Same words, reachable from `‹ back` |
| `routed Vault`, `routed Todo` | Notice | Destination or template, depending on how | _Sent to Vault / seeded/bike-rack.md_ in the done state; the notice keeps its words |
| `this browser holds a session` | Access | Reads as status, holds sign out | _This browser_ as the group's heading, `sign out` beside it |

## Proposed renames of domain terms

Proposals only. `CONTEXT.md` is not edited by this audit and nothing below lands without the developer's word.

| Term | Proposed | Why |
|---|---|---|
| **manual** (the shell's word for processed by hand) | _done elsewhere_, or _handled_ | On a phone the button is read without its `processed by hand` aside. _Manual_ reads as "do it manually", the opposite of the act, which is saying it was already done somewhere else. CONTEXT.md settles `manual` as the UI word and spends `done` on the button ending the step, so this touches both. |
| **process** (the surface and the row's button) | Keep the surface's name in docs; drop the word from the phone UI | The word is the brief's, not CONTEXT's. On a phone the opened item replaces the button, so the word need not be read at all. |
| **place** | Keep | Considered _where in it_. _Place_ is short and the step header can say _Place in Vault_. |
| **template** (routing template) | Keep; possibly _shortcut_ in the phone UI | A phone user meets it as a button that sends the item somewhere in one tap. _Template_ suggests a document's shape, which CONTEXT says it is not (that is a conversion). Weak case; raised so the developer can dismiss it. |

## States not reached

- **A refused capture** in the panel under `refused` with `edit`, `delete`, `copy`. Needs the pool to refuse a capture; read from `Panel.svelte` and `Refused.svelte` only.
- **A failed, retrying or abandoned delivery**. The stage's destinations all answer. Not forced.
- **A revision** (`[+]`, `revised`). The shell offers no edit on a processed item (I3), so it cannot be made from the shell.
- **The queue truly empty**. Shown under a filter instead (`queue-drained-filtered`); emptying it would have consumed the Builder's items.
- **The drop prompt** (`Attach these files`, `attach` / `cancel`) in `dropping/Asking.svelte`. The page-wide drop overlay is shot; the prompt was not reached.
- **An unusable or unreachable destination**, and a template that no longer fits. All stage destinations are available.
- **A minted access token** and `revoke`. The form is shot; nothing was submitted.
- **Sign-in errors and the throttle**. Deliberately not attempted.
- **A pending outbox operation** (`◐ 3`, row `pending`). The offline shot was taken before any write while offline.
- **Preview's `more`** for a long output.

## No feature lost: every control, placed

Every control the shell draws today, from the components and the binding table, and where the recommendation puts it on a phone. At a desk everything stays where it is unless the row says otherwise. Keyboard bindings are kept at every width.

| Today | Where today | Phone, recommended |
|---|---|---|
| `queue` `feed` `log` `settings` | Top bar | Bottom bar |
| Capture field | Head of the queue | Capture sheet from `+ capture` in the bottom bar (app: capture screen on launch) |
| `attach`, file picker, held attachments with `×` | Capture box | Capture sheet, bottom bar of the sheet |
| Drop or paste files | Anywhere / capture box | Paste in the capture sheet; drop is a desk gesture and stays at a desk |
| Tag the capture (`+`, chooser, asked argument) | Capture box | Chips under the field: templates by name, tags in use, `+ tag`; asked argument in a bottom sheet |
| `capture` (and mod+enter) | Capture box | Primary of the capture sheet, above the keyboard |
| View: timeline / index | List head | View sheet |
| Filter: tags; feed also state, destination, source, templates; clear filters | List head | View sheet, as chips |
| Order: oldest / newest; feed by processed at | List head | View sheet |
| `load more`, endless scroll | List foot | Unchanged |
| Select a row (tap, enter, j/k) | Lists | Tap opens the full-screen item |
| Expand a long capture (`+ 5 lines`) | Row | Row (clamped at 3 lines); whole on the item |
| Link and link preview | Row | One line on the list; card on the item |
| `process` | Row foot | The tap that opens the item; `route` in its action bar |
| `manual` | Row foot; process list | Item's action bar |
| `discard`, `undiscard` | Row foot; process list | Item's action bar, left |
| `edit` the capture (`close`, `attach`, `revert`, `save`, `keep editing`) | Row, item | Item's `more`; opens the words full-screen with `save` at the bottom |
| `copy` | Row foot | Item's `more` |
| `open` / `history` | Row foot | The tap is open; `history` in the item's `more` |
| Tag an item (`+`, remove a tag), firing a template by its tag | Row | Item: tags as chips, `+ tag`; templates as named buttons |
| Destination line (type to narrow) | Process | Top of _where_ |
| Templates band, destinations band | Process | _where_, one list, templates first |
| `change` (release the destination) | Process | Step header: tap _where_ |
| Capability choice (create / append …) | Process, when a destination offers several | _place_ step |
| Output: everything / attachments only | Process | _check_ step |
| Place line, tree, candidates, `back`, `clear`, `edit place` | Process | _place_ step, proposal first, tree behind `change folder` |
| Asked arguments; other argument fields | Process | Asked: a question of its own; others: _place_ step |
| Rewrite (`edit`, `restore`, `done`) | Process head | _check_ step, `reword for this route` |
| Tags band | Process | Item screen, outside routing |
| Preview | Process | _check_ step, main content |
| `route` (mod+enter) | Process foot | Primary of _check_ |
| `← previous` `next →` ([ and ]) | Process foot | Item top bar, and sideways swipe |
| `back` (esc) and `stay` / `leave` | Process | `‹ back` top-left and system back; the prompt kept |
| Usage beside a destination (`1 routed last today`) | Process | Moved to the destination's settings, because it informs nobody's choice in the moment |
| Record: fold/unfold, output, arguments, assets line, `read it` | Item, record, log | Item's _sent to_ list; a record opens as its own screen with all of it |
| Record: `cancel` (pending), `undo` (manual) | Record block | Record screen's action bar; also the done state's `undo` |
| Record: `withdraw` (asked) and `reinstate` | Record block | Record screen; withdrawn records stay listed with `reinstate` (I2) |
| Record's own address | Stamp link on the item | Unchanged; the record screen |
| Log views (routing, captures, classification, pool; everything) | Log head | Chips under the bar |
| Log order | Log head | View sheet |
| History (log for one item), `all of the log`, item link in a log row | Log | Unchanged, one-column rows |
| `notices` panel (n), `close` | Status line | Bottom sheet from the bar's notices mark |
| Message line and its offer (`undo`, `open`) | Status line | Strip above the bottom bar while live |
| Firing countdown and `cancel` | Status line and panel | Strip above the bottom bar, 44 px `cancel` |
| Pending count, `offline` | Status line | Strip, and a mark on the bar |
| Queue count | Status line (desk only today) | Number on `queue` |
| Refused capture: `edit`, `delete`, `copy` | Panel | Notices sheet |
| Settings menu, `← settings` | Settings | Unchanged, with `‹ back` in the common place |
| Destinations: open, check, edit, disable / enable, add | Settings | Unchanged, larger rows |
| Accounts: edit, add | Settings | Unchanged |
| Templates: open, check again, edit, delete (asked, keep), add | Settings | Unchanged; full form treated as desk-first; `save as template` added to the done state |
| Access: `sign out`, add a token, copy, `done`, revoke | Settings | Unchanged; `sign out` under _This browser_ |
| Server: `check again`, API reference, sources `show` | Settings | Unchanged |
| Storage: `reclaim now`, stats and paths `show` | Settings | Unchanged |
| Appearance: theme, rows | Settings | Unchanged; `rows` applies to the desk list if the phone list drops the rail (ADR 52 row above) |
| Pool settings: show link previews | Settings | Unchanged |
| Sign-in: name, password, `sign in` | Sign-in | Unchanged, bigger button, autocomplete hints |
| Keyboard: j k enter esc p m D u e c o t f v n [ ] mod+enter | Everywhere | Kept at every width; a phone with a keyboard gets them too |

Shots: `shots/current/`. Scripts that took them: `scripts/` (they read a signed-in browser state from outside the artifact).
