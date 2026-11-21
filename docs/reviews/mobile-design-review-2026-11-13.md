# Notemap mobile redesign: second review

**Date**: 2026-11-13
**Status**: Resolved. What was decided from it is in [DECISIONS.md](../design/mobile/DECISIONS.md), and the design in [docs/design/mobile/](../design/mobile/) follows it.
**Scope**: the design repo at 57657a6
**Plan**: [mobile-first-rethink](../plans/mobile-first-rethink.md)

> Converted from the published artifact, http://palmdesk:3006/projects/notemap/?f=2026-11-13-1125-notemap-design-review-2/, without its shots. The shots it refers to are there;
> the design as it now stands is shot in [docs/design/mobile/shots/](../design/mobile/shots/).
> Finding names (Q1, I2, …) are the review's own.

---


2026-11-13. Subject: `~/repos/notemap-design` at 57657a6 (blocks look, status line at the foot, wide queue draft). Every page shot at 390×844 (2×, touch) in headless Chromium; the wide queue at 1440×900 and 1000×800; forms with the mock keyboard in the phone frame. Checked against DECISIONS.md, `docs/specs/shell.md`, `core.md`, CONTEXT.md, the first review (2026-11-09) and `apps/ui/src`.

**Not inspected live: the current app.** No stage answered on 4800, 4803 or 4806, and the saved session file is gone, so per the stage rules I did not sign in. App parity is from source and spec. The three-column comparisons reuse the first review's app shots (v0.15.0); the behaviour shown there is unchanged in source.

## 1. Summary

The redesign has settled. The blocks look reads as one system on most screens. The route page is now short and legible, the record page says what it is, and states are in words. Settings is close to buildable as drawn. What is left is mostly at the joins: the status line, which is the one place the shell speaks; what happens around a route's window; batch; and how wide grows out of the phone. Ten findings matter most:

1. [major]The status line shows one thing at a time. Offline becomes an icon, the waiting count disappears, and passing messages are hidden behind any route in flight. ›
2. [major]Cancel is offered offline, on the line and on the row. Cancelling needs the pool. ›
3. [major]A trigger tag added in the item or the capture page asks nothing and starts nothing. Todo cannot apply without its list. The app already asks. ›
4. [major]System back during an edit loses the changes. Close, Esc and Cancel ask; back does not. ›
5. [major]Batch Route opens a one-item route page. A batch can only be routed by a template's trigger tag. Tag is not drawn. ›
6. [major]A route in its window has two drawings: a tag's route keeps its row, a hand route leaves at once. ›
7. [major]Oldest first puts a new capture at the end, out of sight, and nothing says it landed. The same on wide, where the box is at the top. ›
8. [major]Wide at 900 to 1199: the opened item covers the list, cutting rows mid-word and hiding the filter, notices and Cancel. ›
9. [major]The blocks look is not applied everywhere. About ten controls are still chip-grey pills, and the design has five near-greys where three surfaces would do. ›
10. [major]The withdrawn record throws, so Reinstate is never drawn. Back after routing reopens the check with Route live. ›

**Top recommendations.** (1) Split the status line: the left says what is happening, the right counts in words, and there is no Cancel offline. (2) Draw one route-in-window state: the row stays with _Routing by X, 4s, Cancel_ until the window closes. (3) Trigger tags ask in the quick sheet's shape, everywhere a tag can be added. (4) Batch Route means a template by its trigger tag, confirmed once. (5) Three surfaces, and the base pill beige. (6) Split _rejected_: a check is _unavailable_, a delivery the destination turned down is _rejected_ (core already uses that word), and a delivery given up on is _abandoned_. (7) Write the superseding ADR for 46, 52 and 54 before the plan. Alternatives are drafted for (1) to (5) and for most of the wording.

**Ready to plan:** the row, the item view, the route steps, the record, settings and forms, bars and choices. **Not ready:** the status line, the window, batch, the wide frame beyond the queue, and the surfaces. See Readiness.

## 2. The first review's findings, now

| First review | Now | Note |
|---|---|---|
| Offline only in settings (blocker) | [partly] | The status line and the item view say it now. The word drops to an icon when anything else is shown, and Cancel is offered offline (Q1, Q2). |
| Undo window not modelled | [fixed] | The window counts on the line, rows show it, and a rejection arrives after the window. Remaining: the static rows do not count, and the being-attempted step is missing (N3). |
| Refused means three things | [partly] | Refused is now the pool's word only. Rejected took over the other two: still open in DECISIONS. |
| States as icons without words | [fixed] | State lines and boxes in words. Left: the pending dot (decided), the template list's bare !, and the offline icon (Q1). |
| Edits lost silently | [partly] | Close, Esc and Cancel ask. System back does not (I1). |
| Accessibility debt | [open] | Out of scope by decision. aria-pressed misuse is fixed. Briefly listed in G7. |
| Morph shape overloaded | [fixed] | Replaced by blocks. The morph is left only on Newer and Older. The blocks are not yet applied everywhere (G1). |
| Parity gaps | [partly] | Batch, save as template, and the drained queue's words are drawn. The feed filter, trigger questions, attach in edit, sign-in and dark are not. |
| Queue opens newest first | [fixed] | Oldest first. This exposes Q4. |
| Swipe-to-route only way to quick sheet | [open] | Q6. |
| Batch marking missing | [partly] | Drawn. Route and Tag undefined (Q5). |
| Counts disagree | [open] | Q8. |
| Trigger tag drawn three ways | [partly] | The row and the item agree. The offer list, template list and template page do not (c-trigger). |
| Link rows mostly link | [open] | Q10. |
| Drawer: decorative cards | [open] | Q11. |
| Search: Nothing matches the filter | [open] | Q12. |
| Edit hidden; double tap | [decided] | Kept in ⋯ (decided). DECISIONS says tap, the mock does double tap (I5). |
| Editing lacks attach; trigger tags don't ask | [open] | I2, I4. |
| Never-delivered line says nothing | [fixed] | A box in words with the reason, opening the record. |
| Small targets | [open] | I8 (out of scope). |
| Done, by hand as a state | [fixed] | Manual: processed by hand. |
| Feed's item view is the queue's | [open] | F3. |
| Capture placeholder | [open] | C1. |
| Save grey when empty | [open] | C2; now a heavier grey block. |
| Check step crumbs | [fixed] | Header step count, Back and Route, tappable facts. |
| Morph toggles overflow; field under bar | [fixed] | Radio rows, docked bars. Checked with the mock keyboard: fields stay clear. |
| File names old rule | [open] | R3. |
| Rewrite labelled Edit | [decided] | Kept, with a hint under it. Not re-litigated. |
| Pictures only, Refuse | [fixed] | Attachments only, Must exist. One Refuse left in an item sample (RC3). |
| Done and Discard in route list leave without undo | [open] | R5. |
| Template row behaves differently in two lists | [fixed] | The where list uses a chevron for every row, and the quick sheet says Route. Each is consistent within itself. |
| Open in Vault can't work | [decided] | Kept as Open in …. The mock still draws it on a vault (RC2). |
| Save as template and way to item missing | [fixed] | On the record and after routing. |
| Records that don't exist | [open] | RC3. |
| One icon for undo, withdraw, reinstate | [partly] | Unlink and link glyphs. The link glyph is undefined, so the withdrawn page throws (RC1). |
| Abandoned record contradicts itself | [open] | RC3. |
| Feed filter lacks bands | [open] | F1. |
| Record lines cut at the end | [open] | F2. |
| History hamburger; log search and + | [fixed] | Back arrow on history; search and + gone from the log. |
| routed by hand | [open] | L2. |
| Refusal popups | [fixed] | The red strip at the top, once. The row and the notices keep it. |
| Copied is a notice | [open] | N2. |
| On its way lacks counts and kinds | [partly] | A waiting-to-send group. No countdowns. |
| Destructive actions inside the pill | [fixed] | Bands with a line each. Access's Revoke is the exception (S6). |
| refused for a destination check | [partly] | Now rejected (S1). |
| Disabled Save gives no reason; Make it twice | [open] | S4. |
| Out of reach in red | [open] | S2. |
| Design-panel choices in Appearance | [fixed] | Theme only. Dark not drawn (S8). |
| Template list {file} and ! | [open] | S3. |
| Wording vs CONTEXT | [partly] | Most fixed. The remaining conflicts are G5. |
| Signal green overloaded | [partly] | G4. |
| Two danger and confirm idioms | [partly] | Red text in bars and bands, a red fill in dialogs. Leftover grey pills (G1). |
| Back model inconsistent | [partly] | Mostly consistent. Back after routing reopens the check (R1). |
| Rows not operable without a pointer; motion; contrast | [open] | Out of scope (G7). |
| aria-pressed misuse | [fixed] | Labels carry the counts. |
| Superseding ADR for 46, 52, 54 | [open] | No new ADR in docs/adr. Needed before the plan (Readiness). |

16 fixed, 13 partly, 24 open, 3 decided against or differently. Fixes that introduced a new problem: oldest first (Q4), the status line's single slot (Q1), the unlink and link glyphs (RC1), and _rejected_ replacing _refused_ (S1).

## 3. Side by side

Each comparison shows the same state. **Design** is port 5190, as it is. **Alternative** is the copy in `alt/` with the `?alt=` named (thick border). **App** is shown where the current app does it better (dashed border). Click any image for full size.

### Status line: say every state in words, and never offer Cancel offline

> shot: **App (v0.15.0)** the app says offline as a word, at the right
> shot: **Design** offline + a route in its window: a struck cloud, no word, and Cancel `queue.html?offline`
> shot: **Alternative** left: what is happening; right: counts in words; no Cancel `queue.html?offline&alt=status`
**Changed.** The line has two parts. The left says the one thing happening (a route in its window, or a passing message). The right counts what is true, in words: _2 waiting_, _Offline_. Cancel is not offered while offline, on the line or on the row.

**Why.** In the design the line shows one thing at a time. When anything else is on it, offline shrinks to an icon, the waiting count disappears, and a passing message is hidden behind any route in flight. Cancelling a reservation needs the pool, and the outbox carries no deliveries (CONTEXT, Outbox), so a Cancel offered offline cannot work.

### A hand route in its window: name the answer as a label and a value

> shot: **Design** Routing by Todo, Next 4s `queue.html: swipe 13:58 left, Todo, Next`
> shot: **Alternative** Routing by Todo list Next 4s, and 2 waiting stays visible `&alt=status`
**Changed.** The answer reads as label and value (_list Next_), as the spec's status line does. The waiting count stays at the right while the route counts down.

**Why.** _Todo, Next_ reads as two template names. This was finding G in the first review and is still open.

### Where a capture lands when the queue is oldest first

> shot: **Design** after Save: back at the top, nothing says where it went `capture.html: write, Save`
> shot: **Alternative** the line says it is at the end of the queue, with Show `capture.html?alt=land,status`
**Changed.** After Save, the status line says _Captured, at the end of the queue_ with _Show_, which scrolls to it. The row lands at the end of the newest day.

**Why.** With oldest first, a new capture lands at the bottom of the list, out of sight. The + returns you to the top, and nothing confirms that the capture arrived. The mock prepends it to the top of the newest day, which is also wrong for oldest first. The same thing happens on wide (W2).

### System back during an edit asks, as Close and Cancel do

> shot: **App (v0.15.0)** the app asks before dropping
> shot: **Design** edit, change the words, press back: the edit is gone `queue.html: open 13:58, More, Edit, change, back`
> shot: **Alternative** back asks: Keep editing / Lose changes `&alt=edit`
**Changed.** The `popstate` handler checks for changes and asks first. If you choose Keep editing, the history entry is pushed back.

**Why.** Close, Esc and Cancel ask. Android back and the iOS edge swipe, the most common ways out on a phone, still drop the changes silently (`item.js`, popstate calls `edit(false)`). DECISIONS says the same rule holds everywhere.

### A trigger tag asks what its template asks, then locks

> shot: **App (v0.15.0)** the app asks Todo's list on the row
> shot: **Design** adding #route/todo: nothing asked, nothing routing, the tag removable `queue.html: open 13:58, + tag, route/t, pick todo`
> shot: **Alternative** Todo asks Which list? in the quick sheet's shape `&alt=ask,status`
> shot: **Alternative** after Next: Routing by Todo list Next, the tag locked
**Changed.** Picking a trigger tag whose template asks something opens the question as rows, in the quick sheet's shape. The answer lands the tag, starts the window, and locks the tag, as DECISIONS asks.

**Why.** The spec has done this since 2026-10-19 (ADR 63), and the app does it. In the design the tag lands with nothing asked, so Todo cannot apply: it has no default for its list. The capture page has the same gap.

### Batch Route: a template, by its trigger tag, confirmed once

> shot: **Design** Route on two selected rows opens the full route page for one item `queue.html: hold 13:58, tap 22:40, Route`
> shot: **Alternative** only templates with a tag; Route 2 `&alt=batch,blocks`
> shot: **Alternative** the spec's confirmation: route 2 with Todo, list Next?
> shot: **Alternative** one line counts the batch down, with one Cancel
**Changed.** Route in the batch bar opens a template sheet: only templates with a trigger tag, no More options. A question is asked once for all the rows. The spec's confirmation follows. Then one status line counts the batch down with one Cancel.

**Why.** In the domain, a batch is tag, untag, archive or unarchive (CONTEXT, Batch). A template reaches a batch only through its trigger tag (shell.md, Marking rows for a batch). A hand route of many items to one place does not exist. The design's Route goes to a route page built for one item.

### The item view speaks on a line, not a black toast

> shot: **Design** Discard: a black floating toast with a white Undo, over the tag line `queue.html: open 22:40, Discard`
> shot: **Alternative** the same words on a ruled line over the bar; Undo underlined; tags move up `&alt=strip`
**Changed.** The item view's feedback uses the status line's idiom: a ruled white line docked over the action bar, with Undo as underlined text. The tag line moves up while it shows.

**Why.** The design has three voices: the status line (queue, feed, log), the red strip (a delivery turned down), and this black toast, which appears only in the item view. The toast hides the tag line. Its green drain bar is a fourth use of the signal green.

### Blocks, applied everywhere: no chip grey left

> shot: **Design** notices: Cancel, Route again, Edit, Delete as grey pills
> shot: **Alternative** the same as beige boxes `&alt=blocks`
> shot: **Design** Sign out and Revoke: grey pills `settings.html#access`
> shot: **Alternative** beige boxes, Revoke red text
**Changed.** The base `.pill` becomes beige with the off line. That covers All, Clear filter, All of the log, Sign out, Revoke, the composer's Attach, the wide row's Route, the notices' ways and the dialog's Keep editing. The dialog's destructive confirm stays red-filled, the one place red fill is allowed.

**Why.** DECISIONS: off is beige, never white. The base pill was never changed. About ten controls still draw the old chip grey (#dedede with a #a9a9a9 edge), and they sit next to beige ones on the same screens.

### Three surfaces: beige for what is pressed, grey for headings, white for what is read

> shot: **Design** the window's state box in a fourth grey (#f1f1f1) `queue.html: open 12:40`
> shot: **Alternative** white with a rule `&alt=blocks`
> shot: **Design** record: state box and preview in the box grey `record.html?state=pending`
> shot: **Alternative** white with a rule
**Changed.** State boxes and previews become white with a rule. Beige means you can press it. Grey means a heading band. White means content.

**Why.** The design has five near-greys: band #e4e4e4, chip #dedede, box and tag #f1f1f1, beige #e9e6df, and the preview. Beige against the band is 1.02:1, so the two differ only in hue. A reader cannot learn which surface means what. The previous review flagged the overloaded morph for the same reason.

### A main action that cannot be taken yet

> shot: **Design** empty capture: Save is a mid-grey filled block, and the placeholder says Your notes… `capture.html`
> shot: **Alternative** Save drawn as a dashed beige block; no placeholder `&alt=blocks,words`
**Changed.** A disabled main block is beige with a dashed edge and muted text. Pressed, it should say what is missing: _nothing to capture_ here, and the missing field on a form.

**Why.** Black at 40% opacity gives a grey block that looks heavier than the enabled secondary buttons beside it, with 3.0:1 text. It appears on capture, route Next, new destination and new template.

### One drawing for a trigger tag, everywhere

> shot: **Design** offer list: #route/todo with a small Todo `queue.html: open 13:58, + tag, ro`
> shot: **Alternative** the tag as it will be drawn, and what it routes by `&alt=trigger`
> shot: **Design** templates: #todo; Project note {file}; a bare red ! `settings.html#templates`
> shot: **Alternative** todo; asked each time; Cloud unavailable `&alt=trigger,words`
> shot: **Design** template page: #route/todo `settings.html#templates/todo`
> shot: **Alternative** the drawn tag, with the full name under it `&alt=trigger`
**Changed.** Everywhere: the route icon and the name. The full `#route/todo` appears only on the template's own page, under the drawn tag.

**Why.** DECISIONS settled this drawing, and the row and the item use it. The tag offer list, the templates list and the template page still use three older forms.

### A failed destination check is unavailable, not rejected

> shot: **Design** Cloud: check rejected `settings.html`
> shot: **Alternative** Cloud unavailable `&alt=words`
> shot: **Design** Rejected: the password was not accepted `settings.html#destinations/cloud`
> shot: **Alternative** Unavailable: the password was not accepted
**Changed.** The check says _available_ or _unavailable_, the spec's words, and the destination's reason follows the colon.

**Why.** A check does not reject anything. It finds the destination unreachable or misconfigured. See the recommendation on DECISIONS' open item.

### Offline is not a failure, and a stale state says when it was true

> shot: **Design** server offline: a red box, red out of reach `settings.html?offline#server`
> shot: **Alternative** plain, with the last answer `&alt=words`
> shot: **Design** destinations offline: available, as if live `settings.html?offline#destinations`
> shot: **Alternative** each state says as of 12:31
**Changed.** Offline is drawn in ink, with the time of the last answer. A state read before the pool went out of reach carries _as of_.

**Why.** The spec's outcome sentence: never dress the ordinary condition as a failure. The first review flagged both points, and both are still open.

### A record that has no URL does not offer Open; a withdrawn record offers Reinstate

> shot: **Design** Open in Vault as the main block on a markdown-folder record; old file name `record.html`
> shot: **Alternative** Copy path; the file name by ADR 68 `&alt=words`
> shot: **Design** withdrawn: the page throws, and there is no bar and no Reinstate `record.html?state=withdrawn`
> shot: **Alternative** Reinstate drawn (the missing glyph supplied) `&alt=words`
**Changed.** Draw _Open in …_ only when the record carries a URL (are.na). Otherwise the main block is _Copy path_. In the mock, `glyph.link` is undefined, so the withdrawn state throws before its bar is drawn.

**Why.** CONTEXT, Routing record: neither kind that writes files ever offers a URL. DECISIONS keeps _Open in …_, which is right for a board. The plan needs to know when it is drawn.

### Derived file names follow ADR 68

> shot: **Design** seeded/idea- a bike rack that folds flat into the hallway wall.md `route.html: Vault, New note, place, check`
> shot: **Alternative** seeded/idea-a-bike-rack-that-folds-flat-into.md `&alt=words`
**Changed.** A short slug. A taken derived name becomes `-1` and is never appended to.

**Why.** The mock still uses the rule from before ADR 68. A plan written from the mock would copy it.

### An empty search names the words

> shot: **Design** Nothing matches the filter `queue.html: search zebra`
> shot: **Alternative** Nothing matches “zebra”. `&alt=words`
**Changed.** The spec's sentence.

**Why.** First-review polish item, still open.

### Wide, 900 to 1199: an opened item gets a column; the menu shrinks to icons

> shot: **Design** the item covers the list: rows cut mid-word, filter and notices hidden, Cancel hidden `queue.html?frame=full at 1000, open 13:58`
> shot: **Alternative** rail, list, item: nothing covered `&alt=wide`
**Changed.** Between 900 and 1199 the grid has three columns, as it does from 1200: an icon rail (3.5rem), the list, and the item (24 to 30rem).

**Why.** The overlay leaves about 215px of list, cut through the middle of words. It hides the header's filter and notices and the status line's Cancel. The list and the item are both things you work in, so neither should cover the other.

### Wide, 1440: Route at the end of the text, a batch bar that fits

> shot: **Design** hover Route at the window's edge, about 1000px from the words `queue.html?frame=full at 1440, hover`
> shot: **Alternative** Route at the end of the measure `&alt=wide`
> shot: **Design** batch bar: the main block runs past the window's edge
> shot: **Alternative** the main block keeps its size
**Changed.** The row's third grid column is `max-content`, packed to the start. The batch bar is not wider than its area, and its main block is capped. The drawer's cards are gone from the column.

**Why.** On a desk, the pointer travels from the words to the action. A bar that overflows the window is a bug, and it is the first thing a person sees when selecting on wide.

## 4. Findings by area

Severity: **blocker** stops the design from being built as drawn; **major** hurts a core task or contradicts the spec or CONTEXT; **minor** is a local problem; **polish** is taste. No blockers this round. URLs are on `http://127.0.0.1:5190`.

### Queue and rows

#### [major]Q1. The status line shows one thing at a time

When a route is in flight, offline shrinks to an icon (`queue.js` drops the word when anything else is shown), the waiting count disappears, and passing messages such as _Routed to Vault_ or a batch's _3 discarded, Undo_ are hidden behind the flight. The mock always has a flight (12:40), so the passing messages never show on the queue. The pending dot's only legend is the waiting count, and that is the part hidden most often.

> shot: **Design** offline + routing: icon only `queue.html?offline`
> shot: **Design** 5s after a quick route: the landing message lost behind the 12:40 flight
**Fix.**Left: the newest thing said or happening. Right: counts in words, in a fixed order (_● 2 waiting_, _Offline_). Drafted: comparison.

#### [major]Q2. Cancel is offered while offline

The status line and the row both offer Cancel on a route in its window while the pool is out of reach. Cancelling a reservation is a request to the pool, and the outbox never carries deliveries.

> shot: **Design** Cancel at the right, offline at the left `queue.html?offline`
**Fix.**Offline: no Cancel on the line or the row. The line says Offline. The window will close without the person, and that is the truth. Drafted with Q1.

#### [major]Q3. One state, two drawings: a route in its window

A trigger tag's route keeps its row in the queue with _Routing by Todo, Cancel_. A hand route from the quick sheet takes the row away at once and is only on the status line. Both are reservations in their window, so the drawing should be the same. The spec holds a decided row in place, from the client's copy, until the selection leaves it.

> shot: **Design** 12:40 (trigger tag) keeps its row
> shot: **Design** 13:58 (hand route) is gone from the list; the line counts 4s
**Fix.**Pick one. Mine: the row stays, with its state line and the countdown, and slides out when the window closes. That matches DECISIONS (_A row in its window says Routing by Todo_), the spec's held row, and a Cancel next to what it cancels.

#### [major]Q4. A capture lands out of sight

Oldest first, which is right, puts a new capture at the end. The + sends you back to the top, and nothing says that the capture landed or where. On wide, the composer is at the top and the mock scrolls the list to the bottom.

> shot: **Design** after Save: the list's top, no word
> shot: **Design** wide: the list scrolled away from the box to the new row
**Fix.**A passing line: _Captured, at the end of the queue_ with _Show_. Do not scroll on wide. Drafted: comparison.

#### [major]Q5. Batch Route and Tag have no defined meaning

Route in the batch bar opens the one-item route page. Tag says _not drawn yet_. The domain has no hand route for a batch. A template reaches a batch through its trigger tag, asked once and confirmed (shell.md, Marking rows for a batch). The feed's batch bar offers Discard and Route, with no Undiscard.

> shot: **Design** 2 selected: Discard, Tag, Route
**Fix.**Route opens the templates that have a tag, asks once, and confirms with the spec's question. One line counts the batch down. Tag opens a tag sheet, which has no drawing yet. The feed's bar gets Undiscard. Drafted: comparison.

#### [minor]Q6. The one-tap quick route is reachable only by swiping on a phone

The item's Route opens the full route page. On a phone, the quick sheet with its one-tap templates opens only from a swipe that starts at the row's right side, where Android's back gesture lives. There is still no edge guard in `quick.js`. Wide gets a hover Route.

> shot: **Design** mid-swipe
> shot: **Design** quick sheet
**Fix.**Keep the swipe as the accelerator, but give it a visible way in: the item's Route opens the quick sheet, with More options leading to the page. Ignore swipes that start within 24px of either edge.

#### [minor]Q7. Holding a row has no hint, and on iOS it selects text

Selecting starts by holding a row (decided). Nothing on a phone hints at it. Rows set no `-webkit-touch-callout: none` or `user-select: none`, so on iOS a 550ms hold on the words also selects a word and raises the callout.

**Fix.**Suppress callout and selection on the row while a hold is pending. Say it once where a person will look: the empty filter result, or the first batch-able moment (three or more rows).

#### [minor]Q8. Counts still disagree

The drawer says 9, the filter's Show says 12, and the item view says 1/12. The day bands are internally consistent.

> shot: **Design** drawer: 9
> shot: **Design** Show 12
**Fix.**Derive every count from the same rows in the mock, so the plan is not written from a wrong number.

#### [minor]Q9. Newer and Older label the wrong direction

The item view's arrows have the aria-labels Newer and Older. With oldest first, the left arrow goes to an older item.

**Fix.**Previous and Next, or labels that follow the order.

#### [minor]Q10. A link preview row is mostly a link

The unfurl block on a row is an anchor that fills most of the row, and `item.js` ignores taps on anchors, so tapping the row there follows the link. Unchanged since the first review.

**Fix.**On the row, draw the preview as a block that is not a link. Keep the link in the item view.

#### [polish]Q11. Drawer cards

_November 3_ and _Captured today 4_ say nothing a person acts on. On wide they take a fixed share of the menu column.

> shot: **Design** drawer
**Fix.**Drop them, or use them for what the status line counts (waiting, in flight). Drafted removal on wide.

#### [polish]Q12. Empty search says filter

_Nothing matches the filter_ for a word search.

> shot: **Design** zebra
**Fix.**_Nothing matches “zebra”._ Drafted.

### Item view

#### [major]I1. System back drops an edit without asking

See comparison. Close, Esc and Cancel ask; popstate does not.

**Fix.**Ask on popstate too. Drafted.

#### [major]I2. A trigger tag added in the item (or the capture page) asks nothing and starts nothing

Adding `#route/todo` lands a plain-looking tag that can be removed. Nothing asks the list, nothing counts down, and nothing locks. Todo cannot apply without its list.

> shot: **Design** the offer: #route/todo
> shot: **Design** added: no question, no window, an ×
**Fix.**Ask in the quick sheet's shape, then show the window and lock the tag. Drafted: comparison. The capture page needs the same, before Save.

#### [minor]I3. A third voice: the black toast

Discard and Done in the item view report in a black floating toast with a white Undo and a green drain bar, over the tag line.

> shot: **Design** after Discard
**Fix.**The status line's idiom, docked over the bar. Drafted: comparison.

#### [minor]I4. Edit cannot attach

The edit bar has Cancel and Save. The spec's edit foot has attach, and the app's edit does too.

> shot: **Design** edit mode
**Fix.**Attach as an icon-over-word in the edit bar, left of Cancel.

#### [minor]I5. DECISIONS and the mock disagree on how to start an edit

DECISIONS: _Edit stays in the ⋯ menu and on a tap on the words_. `item.js`: a double tap. A single tap on words that hold links would fight every link.

**Fix.**Double tap, and write that in DECISIONS. Set `touch-action: manipulation` on the page so iOS does not zoom.

#### [minor]I6. Manual has no way back on the item

The state box says _Manual: processed by hand_ with no action. The spec offers undo of a manual mark on the item. The queue's Done offers Undo only for a few seconds.

**Fix.**Undo in the box, as Discarded has Undiscard.

#### [minor]I7. The edit field has no edge

In edit mode the words sit on white with no box. Only the bar tells you that you are editing.

> shot: **Design** edit
**Fix.**A ruled box around the field, as the capture page's field has none but the composer on wide does. Pick one and use it for both.

#### [polish]I8. Small targets in the header and tags

Previous and next 34×28, tag × 18×18, + tag 52×24 (measured). Accessibility depth is out of scope, but these are touch targets on the main working screen.

**Fix.**44px hit areas, without changing what is drawn.

### Capture

#### [minor]C1. Placeholder and stamp

_Your notes…_ (the spec says no placeholder, and CONTEXT avoids _note_ for an item) and a live clock in the header (the spec says no stamp: the capture is stamped when it is sent).

> shot: **Design** empty
**Fix.**No placeholder. The header says what the page is (_capture_), not the time. Drafted: comparison.

#### [minor]C2. Disabled Save is the heaviest thing on the bar

See comparison.

**Fix.**Beige with a dashed edge, and _nothing to capture_ on press.

#### [minor]C3. Closing with words in the box says nothing

× with words written goes straight back to the queue. The draft is kept in sessionStorage, which is the spec's behaviour (and better than asking), but nothing tells the person.

**Fix.**When the page opens with a draft, say _Draft kept from 11:15_ at the field's top, with Clear.

### Route

#### [major]R1. Back after routing reopens the check with Route live

`done()` pushes a history entry. Back returns to the check step with the rewrite kept and Route enabled, so a second delivery is one tap away. The first review flagged this and it is still open.

> shot: **Design** routed
> shot: **Design** back: check, Route live
**Fix.**Replace the history entry when routing, so that back returns to where the route started. Cancel inside the window is the only way to step back.

#### [minor]R2. Three phrasings for a route in its window

_Routing by Todo_ (row, line, item), _On its way, 5s to cancel_ on a green band (routed page), and _On its way, waiting for Vault_ (record, also used for retrying).

> shot: **Design** routed page
> shot: **Design** record pending
**Fix.**In its window: _Routing by X, 4s, Cancel_ everywhere. Being attempted: _Sending to Vault_, with nothing to offer. Retrying: _Waiting for Vault, Cancel_. That is the spec's three steps. No green for any of them.

#### [minor]R3. Derived file names use the old rule

See comparison. A taken name still offers _Append to it_, which ADR 68 forbids for a derived name.

**Fix.**Slug, `-1`, and no append for derived names.

#### [minor]R4. The folder mode is drawn two ways, and offered where it cannot apply

The route page offers _Make it / Must exist_ as a segmented row. The template form offers three radio rows, adding _Make it once, then must exist_. Both are offered when appending to a note that is already there.

> shot: **Design** append to todo.md: if the folder is missing
**Fix.**One drawing (radio rows with a line each, as the template form has), and only when the place is a new file in a folder.

#### [minor]R5. Done and Discard in the route list leave without the window

They navigate straight to the queue, with no Undo or Cancel line.

> shot: **Design** where: other
**Fix.**Same feedback as the item view's Done and Discard.

#### [minor]R6. Template answers are radio rows that act on tap

A tap advances immediately, while a disabled Next waits under it. A radio says select, then confirm.

> shot: **Design** which list?
**Fix.**Tap advances: use a chevron end (as the where list does) and drop Next on question steps. Or keep the radios and make Next the step. Mine: tap advances.

#### [polish]R7. One choice, three vocabularies

The route page says _create_ (New note, Append) and _shape_ (Raw, List, Task). The template form says _action_ and _as_. The record says _how: New note, raw_. _create: Append_ also contradicts itself.

**Fix.**One pair of labels across route, template and record. Mine: _action_ (new note, append, new block) and _shape_.

#### [polish]R8. Headings on one page drawn three ways

On the place step, _under_ is a grey band, while _if the folder is missing_ and _File name_ are plain headings in two sizes.

> shot: **Design** place
**Fix.**Bands for groups of rows, plain labels for single fields.

### Record

#### [major]RC1. The withdrawn record throws and offers no Reinstate

`glyph.link` is undefined, so `record.html?state=withdrawn` throws (_Cannot read properties of undefined (reading 'startsWith')_) before its bar is drawn. The one way back from a withdrawal is missing.

> shot: **Design** no bar
**Fix.**Add the link glyph. Drafted in the alt (any `?alt=`).

#### [major]RC2. Open in Vault on a record that has no URL

See comparison. The rule for when _Open in …_ is drawn has to be in the plan.

**Fix.**Only with a URL. Otherwise Copy path is the main block.

#### [minor]RC3. Abandoned and cancelled drawn as records

CONTEXT: a reservation whose delivery is abandoned or cancelled is removed. A record that is not pending means bytes reached somewhere. The page for these has to be built from the log's action. The abandoned sample also contradicts itself: _must exist_ in the reason, _Make it_ in the facts. The item's sample still says _Refuse_.

> shot: **Design** abandoned
**Fix.**Title it as an attempt (_tried_), source it from the log, and fix the sample.

#### [minor]RC4. Red twice on a rejected route

The routed page after a rejection has a red box and a red _state_ row saying the same thing.

> shot: **Design** rejected
**Fix.**Red once, in the box.

### Feed

#### [major]F1. The feed's filter is the queue's

Order and tags only. The spec and the app also have state, destination and source bands, and processed-at as an order key (ADR 65). The design has an obvious place for them: the filter sheet.

> shot: **Design** feed filter
**Fix.**Bands of any-number boxes for state, destination and source. A third order: _Processed, newest first_.

#### [minor]F2. Record lines cut off the file name

_seeded/the light in the stairwell at 9- almo…_. The spec cuts to the last segment, prefixed `…/`.

> shot: **Design** feed
**Fix.**_…/the light in the stairwell….md_, or a middle cut that keeps the extension.

#### [minor]F3. The feed's item view offers only Route again

Even for a discarded item, and with no Edit, Done or Undo of a manual mark. Editing a sealed item makes a **revision**, and nothing on the page says so.

> shot: **Design** routed item
> shot: **Design** discarded item
**Fix.**Per state: discarded offers Undiscard and Route. Manual offers Undo. Edit on a sealed item says _Saving makes a revision_ before it starts.

### Log

#### [major]L1. A batch is one row in the log, and the design has no such row

Shipped yesterday (#129): a batch is one log row, counted in its notice's words, opening to every entry it wrote. The batch's notice opens the log read by that batch. The design's log has neither the row nor a way to read the log by batch.

> shot: **Design** log
> shot: **Design** log filter: views only
**Fix.**A row like _TAGGED 4 items #home_ that opens in place to its entries. A _this batch_ reading, drawn like history (back arrow, _All of the log_).

#### [minor]L2. by hand, and a grey pill

A route without a template says _by hand_, which the shell already spends on manual. _All of the log_ is a chip-grey pill.

> shot: **Design** history
**Fix.**Leave the fact empty when there is no template. Make the pill a beige box (Blocks).

### Notices and status line

#### [major]N1. See Q1 and Q2

The line's content and Cancel offline.

**Fix.**Drafted.

#### [minor]N2. The notices sheet repeats itself

Each waiting row says _Waiting to send_ under a heading that already says it. _Since you last looked_ keeps its title after you have looked. _Copied_ is still listed as a notice, though the person asked for it. Entries in their window have no countdown.

> shot: **Design** notices
**Fix.**Rows under a heading say only the time and the words. Title the session's list _this session_. Copied goes to the line only. Add the countdown.

#### [minor]N3. Retrying and in-window look the same

Both are a spinner with Cancel. The spec has three steps (window: cancel; being attempted: nothing; retrying: cancel), and the design draws only the first and the last, identically.

**Fix.**Words differ (see R2). The being-attempted step offers nothing.

#### [minor]N4. A spinner where the spec has marks

The design uses a ring spinner for routing, retrying and on its way, and a plain dot for pending. The spec has three stepping squares for _asking_ and a quartered square for _pending_, and says pending is never drawn as movement that reads as asking.

**Fix.**Decide which. If the spinner stays, the spec's Asking and Pending paragraphs change.

### Settings and forms

#### [major]S1. Rejected for a destination check

See comparison and the recommendation on DECISIONS' open item.

**Fix.**Unavailable, with the reason.

#### [minor]S2. Offline in red; stale states read as live

See comparison.

**Fix.**Ink, and _as of_.

#### [minor]S3. Template list: {file}, a bare !, #todo

See comparison.

**Fix.**Drafted.

#### [minor]S4. Make it, disabled, with no reason

A new destination's and a new template's main block says _Make it_ (the same words as a folder mode on the same form) and stays grey with no line saying what is missing.

> shot: **Design** new template
> shot: **Design** new destination
**Fix.**_Save_, and under the bar or the field: _Name it to save_, _Pick a destination_.

#### [minor]S5. The destination choice is a segmented row

In the template form, destinations are an open list drawn as a segmented row. Four already fill 380px, and a fifth runs off the edge. DECISIONS says long choices are rows.

> shot: **Design** template form
**Fix.**Radio rows with the kind's icon, as the route's where step draws them.

#### [minor]S6. Revoke inline, Sign out inline

Access puts Revoke on each token's row as a grey pill with red text, and Sign out in the status box. DECISIONS puts destructive ways in bands of their own.

> shot: **Design** access
**Fix.**Either a token page with a Revoke band (consistent), or keep Revoke inline but as a beige box (Blocks), and accept the exception. Mine: inline is fine for a list of revocable things. Say so in DECISIONS.

#### [minor]S7. A lone secondary action alone in a bar

Server's _Check again_ and Storage's _Reclaim 3.1 MB_ sit at the left of an otherwise empty beige bar. _Check again_ uses the search icon, the same one the queue's header uses. It stays live offline.

> shot: **Design** server
> shot: **Design** storage
**Fix.**A lone action in a page is a beige box (DECISIONS). Use a refresh glyph, and disable it offline.

#### [polish]S8. Dark is offered and not drawn

Appearance offers dark. No CSS draws it.

> shot: **Design** appearance
**Fix.**Draw it before the plan, or leave it out of the mock.

### Wide queue (draft)

#### [major]W1. 900 to 1199: the item covers the list

See comparison.

**Fix.**Three columns with an icon rail. Drafted.

#### [major]W2. The box at the top, the capture at the bottom

See Q4. The mock scrolls the list away from the box to the new row, so writing two captures in a row means scrolling back up.

**Fix.**No scroll. Say it on the line with Show.

#### [minor]W3. Route far from the words; the batch bar overflows

See comparison.

**Fix.**Drafted.

#### [minor]W4. Keys stop at moving and opening

j, k, Enter, r, / and c are bound. The spec's marking keys (space, J, K, shift-click, mod-click), `n` for notices, `t` to tag, discard, manual and edit are not. There is no visible key hint except Ctrl+Enter.

**Fix.**Take the spec's binding table as the starting point. It is already written.

#### [minor]W5. What the wide queue implies for the other surfaces

**Feed**: the same frame, without the box. **Log**: the list, with history (one item) as the pane. **Settings**: the menu as the list and the page as the pane, which the hash routes already map to. **Route**: a pane or a dialog over the list, not a page, so the list keeps its place. Its steps fit a 30rem pane as drawn. **Record**: the pane, replacing the item, with back to the item. **Capture**: the box replaces the page entirely. Every pane needs the item view's bar at its foot, and Close (×) instead of Back.

**Fix.**Draw the feed and settings in the frame before the plan, because they test the rail and the pane widths.

### Global patterns

#### [major]G1. The blocks look is not applied everywhere

See comparison. The base pill is still chip grey.

**Fix.**One rule. Drafted.

#### [minor]G2. Five greys

See comparison.

**Fix.**Three surfaces.

#### [minor]G3. Destination and place written four ways

_Vault / todo.md_ (quick sheet, where list), _todo.md in Vault_ (templates), _Vault todo.md_ (feed record lines), _Rejected by Vault in projects/street/_. The slash reads as a path.

**Fix.**Prose: _todo.md in Vault_. Record lines: **Vault** todo.md (bold and plain, as the spec says).

#### [minor]G4. Green still means three things

Delivered, Available, and a route in its window on the routed page. The item's toast also drains in green.

**Fix.**Green for nothing (check and words), or for delivered and available only. Never for something that has not happened yet.

#### [minor]G5. Wording against CONTEXT

_Cancel_ for the window (CONTEXT's word is Undo). _n selected_ (CONTEXT: marked; avoid selected). _waiting to send_ (CONTEXT: pending). _rejected_ (reserved for suggestions). _Refuse_ left in an item sample. _Your notes…_. Each is either a decision to record in CONTEXT, or a word to change. See Decisions.

**Fix.**Carry the decided ones into CONTEXT in the same change as the code.

#### [polish]G6. No dots found

No middle dots or bullets are used as separators anywhere in the HTML or JS. The decision is fully applied.

**Fix.**None.

#### [polish]G7. Accessibility, briefly

Rows are still click targets and cannot be focused. There is no `prefers-reduced-motion` and no focus style. The off line is 2.24:1 against white (WCAG asks 3:1 for a control's edge). Out of scope for the mock. List it in the plan so it is built in, not added later.

**Fix.**A plan section, not a design round.

### Spec and app parity

DECISIONS defers parity to the proper design. What matters for the plan is the difference between a gap the design already has a place for and one it has no place for. The second kind needs a drawing before it can be planned.

| Kind | Gap |
|---|---|
| **No place yet** | Sign-in, and the open daemon (no credential) in Access. |
| **No place yet** | The batch tag/untag sheet, and the batch's row and reading in the log (L1). |
| **No place yet** | A refused capture on the queue. It exists only in the notices. The spec keeps it until edited or deleted, so it needs a row. |
| **No place yet** | Tags while routing (the process surface's tags section). |
| **No place yet** | Correcting a taken template's fixed place on the check (only asked fields are tappable). |
| **No place yet** | Load more, and the out-of-reach foot of a list (Draining). |
| **No place yet** | An unusable destination (a kind the daemon does not have) and a stranded template. |
| **No place yet** | Editing a sealed item makes a revision (F3). |
| **No place yet** | The index view (one line per item). It probably belongs to wide only. |
| **No place yet** | Dropping and pasting files: no phone place needed; the wide box is the place, not drawn. |
| Obvious place | Feed filter bands and processed-at order (F1); the templates band in the tag filter. |
| Obvious place | Attach in edit (I4), trigger questions (I2, drafted), Undo of manual on the item (I6). |
| Obvious place | Search highlight (#128) on rows; the countdown in notices; Withdraw asking the destination first (ADR 66) in its dialog. |
| Obvious place | Copy hidden where the browser has no clipboard (the ⋯ menu). |
| Obvious place | An icon per destination kind (TODO.md): from the kind, with a plain fallback. Yes. |

## 5. DECISIONS.md's open items

### “Rejected” for a failed destination check and a turned-down delivery

**Split it.** A destination **check** is _unavailable_, with the destination's reason: _Cloud unavailable_, _Unavailable: the password was not accepted_. These are the spec's words, and a check rejects nothing. A **delivery** the destination turned down is _Rejected by Vault_, as the design has it.

The reason to keep _rejected_ for the delivery: core.md already uses it there. The filesystem adapter reports **rejected** (a traversal, a taken name, malformed arguments), _which is abandoned at once_, as opposed to **unreachable**, which is retried. So the shell word matches an outcome core already names. A delivery given up after retries is a different case and should not be called rejected: _Not delivered: Cloud did not answer for 3 days_, with **abandoned** as its state word on the record.

**CONTEXT change**, in the same change as the code. Under **Delivery**, add: _rejected_, said of a delivery the destination turned down, which is abandoned at once; _abandoned_, said of one given up on. Under **Accept / Reject**, note that _rejected_ is also a delivery's outcome. Under **Refused**, change the avoid note from _(reserved for suggestions)_ to _(a destination's answer, not the pool's)_. The cost: when suggestions get a surface, _rejected_ appears in the log in two senses. They never describe the same object, and the log's kinds disambiguate them.

### The display face (Syne, upright)

**Close it: Syne upright, for headings, bands and titles only.** It gives the bands and headings a voice that the text face does not have, and it reads well lowercase. Two cautions. Syne is wide, so band labels such as _if the folder is missing_ and _disable or delete_ use most of 390px; keep band labels to a few words. And remove the other eight faces from the design panel before the plan, so nothing else gets built against them.

This needs the superseding ADR: ADR 46 says one face and one size, and the spec names Bricolage Grotesque.

The _For the plan_ note on `default (none)` is right, and so is its stated cost (going back to the default pins it). One addition: say on the form, under a pinned field, _set to the default_, so a pinned value and an unset one can still be told apart when reading the form back.

## 6. Readiness for the plan

### Settled enough to plan now

- The queue row: time column, words, pictures, tags, one state line in words, the pending dot. Day bands with counts.
- The item view: header (back, day and time, position, Newer and Older, ⋯), status box, record lines, the bar (Discard, Done, Route), edit mode with Lose changes / Keep editing (once back asks too, I1).
- The route page: steps one per screen, header step count, Back and Next, the check with tappable facts, Edit (rewrite) under the preview, after routing: Cancel, Next item and the follow-up rows.
- The record page: state box, facts, as written, the withdraw band, the bar.
- Settings: the menu, list pages, detail pages with bands for destructive ways, forms with Browse rows and Ask each time, an unset choice drawn as its default.
- Header icons with counts, the filter and notices sheets, the drawer as navigation, the red strip for a delivery turned down.
- Bars, segmented choices and any-number boxes in blocks (with G1 applied).
- Offline in the item view (Route and Done off, a line saying what still works).

### Needs a decision first

- What the status line says, and in what order (Q1), and whether Cancel is offered offline (Q2).
- Rejected (DECISIONS open item), and the CONTEXT entries for Cancel, selected and waiting to send (G5).
- One drawing for a route in its window, hand or tag (Q3), and where a capture lands (Q4).
- What batch Route and Tag do (Q5). Tag needs a drawing.
- The surfaces: retire the chip grey and the box grey (G1, G2), and what green means (G4).
- Spinner or the spec's marks (N4).
- The wide frame for the other surfaces (W5). Only the queue is drawn, so a plan for wide now would be a plan for one surface.

### Spec, CONTEXT and ADR changes the plan must carry

| Where | Change |
|---|---|
| ADR (new) | A superseding ADR for 46 (one face, one size, ink on white, no grey or green, processing is a surface), 52 (by day as a choice) and 54 (the status line's shape). It states blocks, beige and bands, two faces, sizes, bottom bars, sheets, the drawer, the full-screen item, the route as steps, and what green and red mean. Write it before the plan; the plan cites it. |
| shell.md, The shape of the shell | Bottom bars, sheets, a drawer, a full-screen item view. Navigation is the drawer, not four words in the bar. |
| shell.md, Capture is the head of the queue | On a phone, the + and a capture page. The box at the top only on wide. No stamp, no placeholder (keep). |
| shell.md, The row; Marking rows for a batch | Hold to select, round checks in the time column, the batch bar. What Route and Tag do (Q5). |
| shell.md, The status line | Only on queue, feed and log, only while something is true. No always-there _notices ▴_ (the bell replaces it). Counts as decided (Q1). Cancel, not undo. No queue count. |
| shell.md, Reachable, pending, refused | The pending mark is a dot, and the waiting count's word. Asking and pending marks if the spinner stays (N4). |
| shell.md, Settings | The `default (none)` option (already in DECISIONS). Destructive ways in bands. Unavailable for a failed check. |
| shell.md, process surface | Steps instead of one surface. The preview is shown on the check, not asked for. The tags section, if it is dropped, is dropped explicitly. |
| shell.md, Visual direction; Tokens | The new tokens by role: off (beige), band, the three surfaces, signal, danger. |
| CONTEXT.md | Undo → Cancel as the shell's word for a route in its window (rewrite the Undo entry; keep Undo for a manual mark and a discard just made). Marked: the shell says _selected_ (if decided). Pending: the shell says _waiting to send_, as discard stands for archive. Rejected (see the open item). Status line: at the foot of the queue, the feed and the log, not every surface. |

Suggested order: the ADR, then CONTEXT, then shell.md by section, then the code, one surface at a time starting with the queue and the item view. The wide frame is its own later plan.

## 7. Decisions needed

| # | Decision | Options | My pick |
|---|---|---|---|
| 1 | Rejected | (a) rejected for both; (b) unavailable for a check, rejected for a delivery the destination turned down, abandoned for one given up on; (c) not delivered everywhere | (b), with the CONTEXT entries above |
| 2 | What the status line says | (a) one thing at a time (now); (b) left: the newest thing said or happening; right: counts in words | (b), drafted |
| 3 | Cancel while offline | (a) offered (now); (b) hidden, the line says Offline; (c) queued in the outbox (needs a core change: the outbox carries no deliveries) | (b) |
| 4 | A route in its window, on the queue | (a) a tag's route keeps its row, a hand route leaves at once (now); (b) both keep the row until the window closes; (c) both leave at once | (b) |
| 5 | Where a capture lands, oldest first | (a) silently at the end (now); (b) a passing line with Show; (c) scroll to it | (b), drafted |
| 6 | Batch Route | (a) the route page (now, undefined); (b) templates with a tag, asked once, confirmed; (c) no Route in the batch bar, tag only | (b), drafted. (c) if (b) feels like a second way to do one thing |
| 7 | Marked or selected | (a) say marked; (b) say selected, amend CONTEXT, and call the wide cursor's row the current row | (b). Everyone says selected on a phone |
| 8 | Pending or waiting to send | (a) pending; (b) waiting to send, recorded in CONTEXT as the shell's word | (b): the developer's word already, short form _N waiting_ on the line |
| 9 | Surfaces | (a) as now (five greys); (b) three: beige pressed, grey band heading, white with a rule for content | (b), drafted |
| 10 | Green | (a) delivered, available, in window (now); (b) delivered and available only; (c) none, check and words | (b). (c) if the spec's no-green rule is kept |
| 11 | Spinner or the spec's marks | (a) spinner and dot, and change the spec; (b) the spec's squares | (a) for the window (it is a countdown, not asking); squares for asking |
| 12 | Starting an edit | (a) tap on the words (DECISIONS); (b) double tap (the mock) | (b), and fix DECISIONS |
| 13 | Wide 900 to 1199 | (a) the item over the list (now); (b) three columns with an icon rail | (b), drafted |
| 14 | A record with no URL | (a) Open in … anyway; (b) Copy path as the main block; (c) Item as the main block | (b) |
| 15 | The superseding ADR | (a) after the plan; (b) now, before the plan | (b): the plan has nothing to cite without it |
| 16 | The display face | Syne upright, or keep comparing | Syne upright, headings only, and remove the others from the panel |

## 8. Viewing the alternatives

From this artifact's directory: `node alt/server.mjs 5191`, then open any page with `?alt=` set to one or more of `status`, `edit`, `strip`, `ask`, `blocks`, `trigger`, `words`, `batch`, `land`, `wide` (comma-separated). Query strings go before the hash: `settings.html?offline&alt=words#server`. Without `?alt=` every page is the design unchanged (any `?alt=` also supplies the missing link glyph). The changes are in `alt/js/alt-flags.js`, `alt/css/alt.css`, and branches calling `alt(…)` in `queue.js`, `quick.js`, `item.js`, `tags.js`, `record.js`, `route.js`, `capture.js` and `settings.js`. Neither repo was modified.

Measured: beige against white 1.25:1, beige against the band 1.02:1, the off line against white 2.24:1 and against beige 1.80:1; muted text on beige 5.37:1, danger on beige 4.68:1; disabled main block text 3.03:1. Targets: item Newer and Older 34×28, tag × 18×18, + tag 52×24; bars and rows pass. No middle dots or bullets as separators anywhere. One page error: `record.html?state=withdrawn`.
