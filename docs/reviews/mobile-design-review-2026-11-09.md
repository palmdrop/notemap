# Notemap mobile redesign: review

**Date**: 2026-11-09
**Status**: Resolved. What was decided from it is in [DECISIONS.md](../design/mobile/DECISIONS.md), and the design in [docs/design/mobile/](../design/mobile/) follows it.
**Scope**: the design repo at d8a4c79
**Plan**: [mobile-first-rethink](../plans/mobile-first-rethink.md)

> Converted from the published artifact, http://palmdesk:3006/projects/notemap/?f=2026-11-09-2056-notemap-design-review/, without its shots. The shots it refers to are there;
> the design as it now stands is shot in [docs/design/mobile/shots/](../design/mobile/shots/).
> Finding names (Q1, I2, …) are the review's own.

---


2026-11-09. Subject: `~/repos/notemap-design` at `d8a4c79`, every page shot at 390×844 (2×, touch) in headless Chromium. Checked against `docs/specs/shell.md`, `CONTEXT.md`, the app source in `apps/ui/src` and the earlier rethink rounds. Alternatives are drafted on a copy in alt/, turned on with `?alt=`.

**Not inspected live:** the current app. The saved session answered `authenticated: false` on 4800, 4806 and 4803, so per the stage rules I did not sign in. The "app" column uses the 2026-10-30 audit's shots (v0.15.0), and everything after v0.15.0 (batch marking, search, undo window, save as template) was checked from source and spec only.

## 1. Summary

This is the best-looking round so far. The bands, the faint rules and the by-day register work on a phone, and the route steps finally end on something. The problems are in what the screens don't say. The design shows a pool that is always reachable and a delivery that never waits. It draws state as icons and dots without words. And the morph shape now stands for four different things. Ranked by importance:

1. [blocker] **Offline exists only in settings.** The queue, the item and the route page have no out-of-reach state. Route and Done stay live, and nothing says what will wait. The spec's main promise ("legible about which of two conditions it is in") has nowhere to live, because the status line was dropped and nothing replaced it. Fix drafted.
2. [major] **The undo window is not modelled.** The quick route says "Routed by Todo" the moment it is made. A destination's refusal arrives 1.5 s later, which can't happen inside a 5 s window, and as a modal popup over whatever you are doing. Fix drafted.
3. [major] **"Refused" means three things.** It covers the pool rejecting a capture (correct), a destination check failing ("Cloud refuses") and a delivery failing ("Refused by Cloud", "not routed"). `CONTEXT.md` reserves it for the first. Related drift: "Done, by hand" as a state, "All done" for the drained queue, "Pictures only", and the folder mode "Refuse".
4. [major] **States are icons without words.** A delivery that was never made shows as a red route glyph and "!". A pending item is an unlabelled 7 px dot. A routing item is a spinner and a glyph in the time column. A first-time reader can't tell any of them apart. Fix drafted.
5. [major] **Edits are lost silently.** Cancel or back in the item editor throws the words away without asking. The settings forms in the same design do ask. Fix drafted.
6. [major] **Accessibility debt is structural, not cosmetic.** Rows are `li` click targets, so a keyboard or screen reader can't open an item. The item view is not modal. There is no reduced-motion handling, and the 1.04:1 "current" green is effectively invisible to the eye. Targets are below 44 px: prev/next 34×28, tag × 18×18, "+ tag" 52×24.
7. [major] **The morph shape is overloaded.** It is used for toggles, for action bars that put Delete beside Check and Withdraw beside Open, for breadcrumbs, and for quick-sheet answers that look like toggles but route on tap. It also overflows at 390 (the "under" headings run to 408 px), and a floating bar hides the field you are typing in. Fixes drafted.
8. [major] **Parity gaps with the app.** Missing: batch marking, save as template (decided on 2026-11-01 and missing everywhere), the trigger tag's questions when tagging, attach while editing, the feed's state/destination/source filters and processed-at order, sign-in, and the dark theme. The queue also defaults to _newest first_, which contradicts CONTEXT ("oldest first is the default and the reason it is a queue").

**Top recommendations.** (1) Add a conditional bottom status line: _offline · routing Todo 4s · 2 pending_, shown only while one of them is true, with notices as a bell with a red count. (2) Give every state words, in one box component on the item and one line under the text on a row. (3) Model the window: "Routing… 5s Undo", then "Routed". A failure after the window is a red strip plus a line on the row, with no popup. (4) Keep the morph for toggles and for bars of one kind, and move destructive actions out of bars into a separate band. (5) At the check step, the bar becomes Back + Route and the facts become tappable rows. (6) Make one wording pass against CONTEXT, listed in findings.

## 2. Side by side

Every pair is the same state at 390 px. Left: the design as it is (port 5190). Right: the alternative (the copy, `alt/`, with the `?alt=` named). Where the current app does something better, it is shown first. Click any image for full size.

### A. The queue's header and a status line (`queue.html?alt=status&offline`)

> shot: **App (v0.15): the status line** Always at the foot. Says _offline_, _routing 15s cancel_, pending.
> shot: **Design: pills, no status** queue.html. Offline looks identical to online.
> shot: **Alternative: icons + conditional status line** queue.html?alt=status&offline
Changed: Filter and Notices become 44 px icon buttons. The bell carries the red count of things that went wrong, and the filter carries a black count of filters on. A bottom line appears only while something is true: _offline_, a route in flight with its countdown, _N pending_. Tapping it opens notices. The + lifts above it. Why: the design has nowhere to say offline or in flight. A black "Notices (2)" pill reads as the screen's primary action, and both pills are 36 px tall. The line is the spec's status line, kept to its two facts that matter on a phone.

### B. Row states in words (`queue.html?alt=status`)

> shot: **Design: icon + "!" in the time column** queue.html, scrolled to 11:07
> shot: **Alternative: a line under the text** queue.html?alt=status
Changed: routing and not-delivered become one line under the words, in the feed's own record-line idiom: _Routing by Todo · 12s [Undo]_ and _Not delivered to Vault · projects/street/_. The pending dot stays, moved under the time, and the status line's _● 2 pending_ is its legend. A trigger tag is drawn one way, as the route glyph and the name in small caps (TODO), never as `#route/todo`. Why: the time column is 52 px and can't hold a state. The red glyph and "!" mean nothing until learned. The feed already draws records as lines, so the queue should too.

### C. Item view: what is happening, in words (`?alt=status,item`)

> shot: **Design: icon, "!", truncated path** Tap the 11:07 row
> shot: **Alternative: says it, says why** Same, ?alt=status,item
Changed: a never-delivered record is a box that leads with _Not delivered to Vault_ and the destination's reason, and opens the record. The header gets 44 px prev and next, and a pencil (Edit) beside ⋯. Why: the old line names a path and leaves the reader to infer what went wrong. Edit was two taps deep, or a double tap nobody would guess.

### D. A routing item: the trigger tag can't be removed while it files (`?alt=status,item`)

> shot: **App: routing 15s cancel on the status line**
> shot: **Design: #route/todo has an ×** Tap the 12:40 row
> shot: **Alternative: locked TODO tag, Undo** ?alt=status,item
Changed: the trigger tag shows a lock instead of an ×, titled "undo the route to take it off". The box says _Undo_ and counts the window. Why: CONTEXT says a trigger tag that filed an item can't be taken off while its record stands, and the window's word is _undo_, not cancel. The design offers an × that would silently do something undefined.

### E. An item while the pool is out of reach (`?alt=status,item&offline`)

> shot: **Design: no offline state; Edit behind ⋯** Tap the 22:40 row, open ⋯
> shot: **Alternative: says what waits** ?alt=status,item&offline
Changed: Route and Done go grey. One line says _Route and Done wait for the pool; Discard, Edit and tags work and are sent later._ Why: the spec keeps capture, tagging, editing and discarding live offline because they replay from the outbox, while routing and marking manual need the pool. The design has no way to say either.

### F. Leaving an edit with changes (`?alt=status,item`, edit, change, Cancel)

> shot: **App: asks before dropping**
> shot: **Design: Cancel drops silently** Open an item, ⋯ → Edit
> shot: **Alternative: asks** Pencil, change the words, Cancel
Changed: Cancel (and back) with unsaved words asks _drop your changes?_ with Keep editing and Drop them. Why: this is data loss. The settings forms in the same design already ask, so the item editor is the odd one out.

### G. The undo window after a quick route (`queue.html?alt=status,undo`, swipe 22:40 left → Todo → Next)

> shot: **Design: "Routed by Todo, Next" at once** Swipe a row left, Todo, Next
> shot: **Alternative: "Routing by Todo, list Next · 4s"** Same, ?alt=status,undo
Changed: during the window the strip says _Routing_ and counts down. When it closes, it says _Routed to Vault · todo.md_ with no Undo. The answer reads as a label and a value (_list Next_), not _Todo, Next_, which looks like a template name. Why: ADR 69 and the spec say a route claims no landing until it lands, and undo exists only inside the window.

### H. A delivery that fails after the window (`?alt=status,undo`, swipe → To the cloud)

> shot: **Design: modal popup, 1.5 s later** Swipe a row left, To the cloud
> shot: **Alternative: red strip, row keeps a line** Same, ?alt=status,undo, after 5 s
Changed: no popup. The strip turns red and says _Not delivered to Cloud: seeded/ is read-only_ with _Open_. The row comes back with its red line, and the notice counts on the bell. Why: in real use the failure arrives after the window, while the person is on another item or another app. A modal there blocks work they didn't ask to stop, and it duplicates the notice. The strip and the row line are enough, and both persist.

### I. The route's check step (`route.html?alt=check`, Vault → place → check)

> shot: **App: one surface, sections**
> shot: **Design: five crumbs: "New …", "seed… a sen…"** route.html, Vault, place, check
> shot: **Alternative: Back + Route; tap a fact to change it** route.html?alt=check
Changed: at the check step the bar is just _Back_ and _Route_. Each fact row gets a chevron and opens its step. The rewrite is _Reword for this route_, below the preview, where it no longer covers the first line. Why: five crumbs in 342 px truncate to nothing. The check table already says everything the crumbs tried to. And "Edit" is the item's word for changing the capture, while CONTEXT keeps rewrite and edit apart.

### J. Check after a template that asks (`route.html?alt=check&template=Project%20note`)

> shot: **Design** Project note, notemap, Ideas
> shot: **Alternative** Same, ?alt=check
Changed: the facts a question answered (file, heading) and the template itself are tappable, and the rest are not. The folder mode reads _Make it once, then must exist_. Why: it shows which parts of a template decision are open, which the spec calls asked arguments.

### K. Place step, appending to a note (`route.html?alt=check`, Vault → Append → todo.md)

> shot: **Design: "under" overflows to 408 px; folder mode shown for an existing note** route.html, Vault, Append, place, todo.md
> shot: **Alternative: radio rows, no folder mode** ?alt=check
Changed: the headings are a list of radio rows, like the template's question step. The folder-missing choice is gone when appending to a note that is there. Why: a morph shape can't wrap, so any option set longer than about 340 px is cut off. And "if the folder is missing" can't apply to a note you just picked.

### L. A field under the keyboard (`route.html?alt=check`, place, focus File name)

> shot: **Design: the crumbs bar covers the field** Design panel: phone frame + keyboard
> shot: **Alternative: the field scrolls clear** ?alt=check
Changed: focusing a field scrolls it to the centre, with scroll padding the height of the floating bar. The folder mode says _Must exist_. Why: floating bars sit above the keyboard, so with the field at the bottom they cover exactly what is being typed.

### M. A failed route on the route page (`route.html?alt=check`, Cloud)

> shot: **Design: popup over a page that already says it** route.html, Cloud, check, Route
> shot: **Alternative: the page says it, once** ?alt=check, after the window
Changed: no dialog. The heading is _not delivered_, and a red box gives the destination's reason and says the item is back in the queue. The failure arrives after the 5 s window, as it would. Why: the page already shows what happened, and saying it twice in two shapes teaches people to dismiss both.

### N. After routing: what next (`route.html?alt=check`, Route)

> shot: **Design: Undo / Next item** route.html, Vault, check, Route
> shot: **Alternative: + route elsewhere, save as template, open item** ?alt=check
Changed: three plain rows under the facts: _Route it somewhere else too_, _Save this as a template_ (only for a route made by hand), _Open the item_. Why: save as template was decided on 2026-11-01 (features plan T3) and is missing from the design. And an item may go to two places, which is why the spec's route doesn't advance.

### O. The record's actions (`record.html?alt=ways`)

> shot: **App: withdraw inside the block**
> shot: **Design: Withdraw beside "Open in Vault"** record.html
> shot: **Alternative: Item + Save as template; Withdraw apart** record.html?alt=ways
Changed: the bar holds _Item_ and _Save as template_. _Open in Vault_ is gone, because file kinds never carry a URL (CONTEXT, Routing record), and _Open on are.na_ appears only for a board. Withdraw moves to its own band, _if it is no longer there_, with an unlink icon and one line saying what it does. The capture at the top links to its item. Why: the destructive action sat in the same pill as the primary, and Withdraw, Reinstate and Undo all used the same undo arrow, though CONTEXT says withdrawing is never undo.

### P. A destination's actions (`settings.html?alt=danger#destinations/cloud`)

> shot: **Design: Check · Edit · Disable · Delete in one shape** settings.html#destinations/cloud
> shot: **Alternative: Check again · Edit; disable/delete apart** ?alt=danger
Changed: the floating bar keeps the two everyday actions. Disable (pause icon, not ×) and Delete get a band with a line each on what they do. _Refused_ becomes _Unavailable_. Why: Delete was one thumb-width from Check. × means close everywhere else. And "refused" is the pool's word for an outbox operation.

### Q. Settings out of reach (`settings.html?alt=danger&offline#destinations`)

> shot: **Design: stale statuses read as live** settings.html?offline#destinations
> shot: **Alternative: "as of 12:31"** ?alt=danger&offline
Changed: each status says when it was true, and "out of reach" on the settings menu is no longer red. Why: the spec says offline is never dressed as a failure, and a stale "available" is a claim the shell can't make while it can't ask.

### R. Marking rows for a batch (`queue.html?alt=status,mark`)

> shot: **Design: no batch** queue.html
> shot: **Alternative: marked mode** ?alt=status,mark
Drafted: in marking mode the header is _3 marked_, Tag, Discard and ⋯ (all, untag, undiscard). Each row gets a check circle under its time, and the + hides. Enter it from a "Select" item in the header's ⋯, with long press as an accelerator. Why: the app shipped batch marking on 2026-10-30 (spec, Marking rows for a batch). On a phone it is how a queue of 40 gets drained. The quick sheet handles one row at a time.

### S. Template form: defaults and places (`settings.html?alt=form#templates/todo/edit`)

> shot: **Design: implied default looks chosen; path chips** settings.html#templates/todo/edit
> shot: **Alternative: "default (raw)" option; one picker row** ?alt=form
Changed: a choice field gets a first option, _default (raw)_, selected while unset, with a hint that the destination's own value applies. A path field is one row, _todo.md · Browse Vault ›_, that would open the route's place picker in a sheet. Why: an unset value inherits and changes with the destination, so drawing it as chosen hides that. The chips were a second, weaker browser for something the route step already does.

### T. Morph edge contrast (`settings.html?alt=edge#appearance`)

> shot: **Design: edge #a9a9a9, 2.35:1** settings.html#appearance
> shot: **Alternative: edge #767676, 4.5:1** ?alt=edge
Changed: only the stroke. Why: an unselected segment is beige (1.25:1 against white), so the edge is the only boundary, and WCAG 1.4.11 asks 3:1 for it. The darker stroke keeps the look.

### U. The drained queue (`queue.html?alt=status&empty`)

> shot: **Design: "All done"** queue.html?empty
> shot: **Alternative: "Queue is empty."** ?alt=status&empty
Changed: the spec's words, plus one line saying where new captures land and whether anything is still on its way. Why: _done_ is the manual gesture's word, and a drained queue can still have deliveries in flight.

## 3. Findings by area

Severity: blocker stops the design from being built as drawn; major hurts a core task or contradicts spec/CONTEXT; minor is a local problem; polish is taste. Every URL is on `http://127.0.0.1:5190` unless it says `?alt=`.

### Queue & rows

#### [major] The queue opens newest first

The filter sheet's order defaults to _Newest first_, and the item view's arrows are labelled Newer/Older. CONTEXT: "Oldest first is the default and the reason it is a queue". The spec says the queue starts at the oldest.

**Fix.** Default the queue to oldest first and the feed to newest. If newest-first is a deliberate change, change CONTEXT and the spec first, not just the mock.

_(image: shots/design/queue-filter.png)_Filter: Newest first pressed

#### [major] States drawn as unlabelled marks

Pending is a 7 px black dot at the row's top right. Routing is a spinner and a route glyph under the time. Never delivered is a red glyph and "!". None is labelled, and two sit in a column 52 px wide. The developer's "pending gets a dot" works only with a legend.

**Fix.** Put state lines under the text. Keep the dot under the time and let the status line be its legend. See comparison.

_(image: shots/design/queue.png)_queue.html

#### [major] Swipe-to-route starts at the right edge

The quick sheet (one-tap templates) can only be reached by swiping a row left more than 90 px (`quick.js` THRESHOLD). On Android with gesture navigation, a swipe that starts at the right edge is Back. On desktop, a mouse drag selects text instead. The item's Route button goes to the full route page, not to the quick sheet, so the one-tap templates have no visible way in.

**Fix.** Make the item's Route open the quick sheet first, with _More options_ leading to the full route page, so swipe becomes an accelerator for a button that exists. Ignore swipes that start within 24 px of either edge.

_(image: shots/design/swipe-mid.png)_Mid-swipe_(image: shots/design/quick-sheet-ask.png)_Quick sheet

#### [major] Batch marking missing

The app can mark many rows and tag, untag, discard or undiscard them at once (spec 2026-10-30, `components/batch/`). The design has nothing.

**Fix.** Draft drawn. See comparison.

#### [minor] Counts disagree

The drawer says the queue holds 9, the filter's Show button says 12, and the day bands count 7+2+3. Small, but counts are the one thing a draining tool must get right.

**Fix.** Derive every count from one source in the mock.

_(image: shots/design/queue-drawer.png)_Drawer: 9_(image: shots/design/queue-filter.png)_Show 12

#### [minor] Trigger tag drawn three ways

Queue row: `#route/todo` with a black border. Item: route glyph plus `#route/todo`. Templates list: route glyph plus `#todo`. The spec: the name after `route/`, in bold small caps.

**Fix.** One rendering everywhere: glyph plus TODO in small caps, with the full name in the title. See comparison.

_(image: shots/design/queue.png)_row_(image: shots/design/item-routing.png)_item_(image: shots/design/full-settings-templates.png)_settings

#### [minor] Link rows are mostly link

On a row with a link preview, the preview is an anchor that fills most of the row, and `item.js` ignores taps on anchors. So tapping the row usually opens the link (href="#" here), not the item.

**Fix.** Make the preview a non-link block on the row and keep the link in the item view. Or open the item on a tap outside the URL text.

#### [minor] Drawer: decorative cards, no state

The cards say _November 3_ and _Captured today 4_. The first is a calendar. The second is a number nobody acts on. Meanwhile the drawer foot's _online_ is the only reachability fact in the queue, and it is behind the hamburger.

**Fix.** Use the cards for _in queue_ and _on its way_, or drop them. Reachability belongs on the screen, not in the drawer.

_(image: shots/design/queue-drawer.png)_Drawer

#### [polish] Search: "Nothing matches the filter"

Search with no hits says "filter". The spec says `Nothing matches “bike rack”.`, naming the words.

**Fix.** Name what was searched.

_(image: shots/design/queue-search-none.png)_Search: zebra

### Item view

#### [major] Edits are dropped without asking

`item.js`: Cancel calls `edit(false)`, and so does a popstate (back), both silently. The spec asks before leaving an edit with changes, and the design's own settings forms do too.

**Fix.** Ask, as in the drafted dialog. See comparison.

_(image: shots/design/item-edit.png)_Edit mode

#### [major] Edit is hidden, and double tap collides

Edit is in ⋯ or a double tap on the words. On a phone, double tap also selects a word and, on iOS without `touch-action: manipulation`, zooms. Neither is discoverable.

**Fix.** Put a pencil in the header. Keep double tap as an accelerator, and set `touch-action: manipulation` on the page. See comparison.

_(image: shots/design/item-more.png)_⋯ menu

#### [major] Editing lacks attach; trigger tags don't ask

The editor can remove attachments but not add them. The spec's edit foot has `attach`. Adding a trigger tag (item or capture) whose template asks something, such as Todo's list, just adds the tag: no question, no countdown, no routing state. The spec has the chooser ask each asked field before the tag lands.

**Fix.** Add Attach to the edit bar. When a trigger tag with asked fields is picked, open the same question sheet the quick route uses, then show the routing state.

_(image: shots/design/kb-item-tag.png)_Tag chooser, typing "ro"

#### [major] The never-delivered line says nothing

The red box at the top of an item is a route glyph, "!", the destination and a path cut at the end ("projects/street/still here, on the wall by th…"). It doesn't say "not delivered" or why.

**Fix.** Words and the reason. See comparison.

_(image: shots/design/item-abandoned.png)_11:07 item

#### [minor] Small targets in the header and tags

Prev/next: 34×28. Tag ×: 18×18. "+ tag": 52×24. All below 44 px, and the × sits beside the tag it removes.

**Fix.** 44 px hit areas. Drafted in ?alt=item. See comparison.

#### [minor] "Done, by hand" as a state

CONTEXT spends _done_ on the gesture and _manual_ on the state ("Avoid: done as a name for the state"). The feed says _Done_ for the state too.

**Fix.** Button _Done_, state _Manual_ ("processed by hand").

#### [minor] Feed's item view is the queue's, copied

Opened from the feed, back is labelled "Back to the queue". The only action is "Route again", even for an unprocessed item. Discarded items show Undiscard in the status box, which is good. These come from generating feed.html from queue.html.

**Fix.** See the open question on generated copies.

### Capture

#### [minor] Placeholder "Your notes…"

The spec says no placeholder ("the box is the invitation"). CONTEXT also avoids _note_ for an item.

**Fix.** Drop it, or use "Write, or attach".

_(image: shots/design/capture.png)_capture.html

#### [polish] Save is grey when empty

Disabled Save is a mid-grey (#a9a9a9) segment, louder than the enabled beige ones. Pressing it says nothing, where the spec says _nothing to capture_.

**Fix.** Keep it enabled-looking but quiet, and say "nothing to capture" on press.

_(image: shots/design/capture.png)_Empty_(image: shots/design/kb-capture.png)_With keyboard

### Route

#### [major] Check step crumbs are unreadable

Five segments in 342 px: "New …", "seed… a sen…". The crumbs are the navigation, so they can't simply be shortened.

**Fix.** Back + Route at check, with tappable facts. See comparison.

_(image: shots/design/full-route-check.png)_check

#### [major] Morph toggles overflow; a field hides under the bar

The "under" headings measure 408 px in a 390 px screen and are clipped. With the keyboard up, the floating crumbs cover the focused File name field.

**Fix.** Radio rows for any list that can grow, and scroll the focused field clear. See comparison.

_(image: shots/design/full-route-place-append.png)_under_(image: shots/design/kb-route-place.png)_keyboard

#### [major] File names use the old rule

Derived names read `idea- a bike rack that folds flat into the hallway wall.md`, and a taken one becomes `… 2.md`. Decided on 2026-11-01 (N1 = A, ADR 68): a short slug, `idea-a-bike-rack-that-folds-flat-into.md`, with a taken derived name becoming `-1` and never appended to. The design offers "Append to it" for a taken derived name, which ADR 68 forbids.

**Fix.** Use the shipped rule in the mock, and offer only the free name for a derived one.

_(image: shots/design/full-route-check.png)_check

#### [major] Rewrite labelled "Edit"

On the check step, the button over the preview says Edit. On the item, Edit changes the capture forever. CONTEXT keeps rewrite (this delivery only) and edit (the capture) apart. The button also overlaps the preview's first line.

**Fix.** "Reword for this route", below the preview. See comparison.

_(image: shots/design/route-check-rewrite.png)_after Edit

#### [minor] "Pictures only", "Refuse"

The capability is _attachments only_ (any file), and the spec's shell word for it is `output`. The folder mode _Refuse_ reuses the pool's word. The Board's "how" step offers one option, so it is a step with nothing to decide.

**Fix.** Send: Everything / Attachments only. If missing: Make it / Must exist / Make it once, then must exist. Skip a step with one option.

_(image: shots/design/route-how.png)_how

#### [minor] Done and Discard in the route list leave without undo

Under _other_, Done and Discard navigate straight to the queue, with no strip and no undo. Everywhere else they offer undo.

**Fix.** Same strip as the item view.

_(image: shots/design/route-where.png)_where

#### [minor] Template row behaves differently in two lists

In the quick sheet a template without questions routes on tap. In route.html's _where_ step the same row goes to check. They are drawn alike.

**Fix.** Keep the quick sheet's "Route" end label (it does say so), and say "Check first" in where, or route there too.

_(image: shots/design/quick-sheet.png)_quick sheet_(image: shots/design/route-where.png)_where

### Record

#### [major] Open in Vault can't work

CONTEXT, Routing record: "neither kind that writes files ever does" offer a URL. The button is a no-op by design, not by mock.

**Fix.** Drop it for file kinds. Show "Open on are.na" when the record has a URL. Offer "Copy path" for files. See comparison.

_(image: shots/design/full-record-delivered.png)_record.html

#### [major] Save as template and a way to the item are missing

No record, routed page or notice offers save as template (decided T3: the record's block and the landing notice). The record page doesn't link to its item.

**Fix.** Item and Save as template on the bar. See comparison.

#### [minor] Records that don't exist

`record.html?state=abandoned` and `?state=cancelled` draw a record. CONTEXT: a reservation whose delivery is abandoned or cancelled is removed, because nothing happened to record. The page has to be built from the log's action, as the spec's log does. The cancelled state is also a dead end with no actions.

**Fix.** Title it "what was tried" and source it from the log. Give cancelled a way back to the item.

_(image: shots/design/record-abandoned.png)_abandoned_(image: shots/design/record-cancelled.png)_cancelled

#### [minor] One icon for undo, withdraw and reinstate

All three use ↶. CONTEXT: "Withdrawing is never called undo."

**Fix.** Unlink for withdraw, link for reinstate. See comparison.

_(image: shots/design/record-withdrawn.png)_withdrawn

#### [polish] Abandoned record contradicts itself

The reason says "the route said it must exist", while _if missing_ reads "Make it". A mock data slip, but it shows the row matters.

**Fix.** Fix the sample.

### Feed

#### [major] Filter lacks state, destination, source and processed order

The feed's sheet is the queue's: order and tags. The spec (2026-10-20/21) gives the feed state, destination and source bands, and _processed_ as an order key.

**Fix.** Add the bands. They are short lists, so toggles fit.

_(image: shots/design/feed.png)_feed.html

#### [minor] Record lines cut at the end

"seeded/the light in the stairwell at 9- almo…" loses the file name. The spec cuts to the last segment with `…/`.

**Fix.** `…/the light in the stairwell….md`, or middle truncation keeping the extension.

_(image: shots/design/feed.png)_feed

### Log

#### [minor] History has a hamburger, not a back arrow

Reached from an item's History, the page shows the drawer's menu. Back is the browser's. The log also carries search (the spec has none on the log) and the + capture button.

**Fix.** Back arrow on history. Drop search and + from the log.

_(image: shots/design/log-item.png)_history_(image: shots/design/log.png)_log

#### [minor] "routed by hand"

The log's fact for a route made without a template reads _by hand_. The shell already spends "by hand" on manual, so a route by hand reads as both.

**Fix.** "chosen", or leave the fact empty and name the template when there is one.

### Notices

#### [major] Refusal popups for async failures

See comparison H. The popup also fires on the route page, which already shows the failure.

**Fix.** No popup. Strip, row line, notice. See comparison.

_(image: shots/design/quick-refused-popup.png)_popup

#### [minor] "Copied" is not a notice

A notice is "something the shell says … to somebody who did not ask". Copy is asked for, and its feedback belongs in the strip, not in _since you last looked_.

**Fix.** Strip only.

_(image: shots/design/full-notices.png)_notices

#### [minor] On its way lacks counts and kinds

"Routing by Todo" has no countdown, and the "Waiting for Cloud … tried again" entry is a retrying delivery with Cancel, which is right. But nothing pending from the outbox (captures, tags) is listed, where the spec's panel lists both.

**Fix.** Add the countdown and a _not yet sent_ group.

_(image: shots/design/queue-notices.png)_sheet

### Settings & forms

#### [major] Destructive actions inside the action pill

Destination: Check · Edit · Disable · Delete in one morph. Template: Edit · Delete. Disable uses ×.

**Fix.** Everyday actions on the bar, disable/delete apart. See comparison.

_(image: shots/design/settings-destinations-vault.png)_vault

#### [major] "refused" / "refuses" for a destination check

The settings menu says _Cloud refuses_ and the list says _refused_. The spec's words for this are _available_/_unavailable_, and CONTEXT reserves refused for the pool.

**Fix.** Unavailable. See comparison.

_(image: shots/design/settings.png)_settings_(image: shots/design/full-settings-destinations.png)_destinations

#### [minor] Disabled Save gives no reason; "Make it" twice

A new template's Save stays grey until name, destination and required fields are filled, with no line saying which. The spec: _a template needs a name_. The button is labelled "Make it", the same words as the folder mode option on the same form.

**Fix.** Say what is missing under the field. Label the button Save. See comparison.

_(image: shots/design/full-settings-templates-new.png)_new template

#### [minor] Out of reach in red

The settings menu shows Server _out of reach_ in red, and the server page's box is red. The spec says offline is never dressed as a failure.

**Fix.** Plain text. See comparison.

_(image: shots/design/settings-offline.png)_offline

#### [minor] Design-panel choices leaked into Appearance

Appearance offers _undo notice: bottom/top_ (a design-panel experiment) and _rows: auto/by day/rail_, and then says the rail does nothing on a phone. Theme offers dark, which no CSS draws.

**Fix.** Pick bottom and remove the option. Hide rows below narrow. Draw dark or hide it.

_(image: shots/design/full-settings-appearance.png)_appearance

#### [minor] Template list: "{file}" and a bare "!"

An asked field shows as `{file}`, which looks like a pattern, while the spec says the line ends _asks each time_. A red "!" beside To the cloud has no words.

**Fix.** "projects/ · asks each time" and "Cloud unavailable".

_(image: shots/design/full-settings-templates.png)_templates

### Global patterns and wording

#### [major] Wording that contradicts CONTEXT.md

| Design says | Where | CONTEXT / spec | Use |
|---|---|---|---|
| Refused by Cloud / not routed / Cloud refused it | quick.js, route.js | Refused = pool rejects an outbox op. A route is a decision; the delivery failed. | Not delivered to Cloud: _reason_ |
| Cloud refuses / refused | settings | available / unavailable | Unavailable |
| Routed by Todo (inside the window) | strip | Claims no landing while pending | Routing by Todo · 5s |
| Done, by hand / Done (state) | item, feed | Done is the gesture; state is manual | Manual |
| All done | queue?empty | Queue is empty. | Queue is empty. |
| Pictures only / Include | route how | attachments only / output | Send: Attachments only |
| Refuse (folder mode) | route, templates | require; refused is taken | Must exist |
| Waiting to send | drawer, item | Pending | pending (or add "waiting to send" to CONTEXT as the shell's word, like discard) |
| Edit (on the preview) | route check | rewrite ≠ edit | Reword for this route |
| Your notes… | capture | item, not note; no placeholder | none |
| Cancel (pending record, window open) | record | undo inside the window; cancel once retrying | Undo, then Cancel |

**Fix.** One pass. Most are a word each.

#### [major] The morph shape means four things

A toggle (one pressed, black). An action bar (one primary, black). Breadcrumbs (current in green). Quick-sheet answers (look like a toggle, route on tap). Within one bar, a destructive segment (red text) shares the shape with benign ones. Disabled primary is grey, and "current" is #e1f2a6 on #e9e6df, 1.04:1. The pinch reads well for toggles and badly for an actions bar with a danger action in it.

**Fix.** Keep morph for toggles and for bars whose segments are peers. No destructive segment in a bar. Answers that act at once become rows with a "Route" end, like the template rows above them. Current step: ink text on paper with a 2 px ink underline or edge, not a 1.04:1 tint. See comparison.

_(image: shots/design/quick-sheet-ask.png)_answers_(image: shots/design/settings-destinations-vault.png)_actions_(image: shots/design/route-how.png)_steps

#### [minor] The signal green is overloaded

The same faint green marks the current step, _Available_, _Delivered_, _On its way_ on the routed page, and the undo strip's progress bar. The developer reserved it for "current".

**Fix.** Current only. Delivered and available take a check and plain text.

_(image: shots/design/route-routed.png)_on its way_(image: shots/design/settings-destinations-vault.png)_available

#### [minor] Two danger idioms, two confirm idioms

Danger is red text in a beige pill (Discard, Revoke), a red segment in a morph (Delete), and a red pill in dialogs. Confirmation is a modal (delete refused capture, withdraw, delete destination), while the spec has inline confirmation in settings. Pick one per level.

**Fix.** Red text for a destructive choice. A red filled button only inside a dialog's confirm.

#### [minor] Back model is inconsistent

The item view pushes a history entry (back closes it). Route steps push entries (back steps back). Capture and settings forms use × (close), and the history page has a hamburger. Back from the routed page goes to the check step and offers a route again, so a second Route after delivery is one back away.

**Fix.** After a route, replace the history entry so back returns to the item, not to check.

### Accessibility

#### [major] Rows are not operable without a pointer

Tabbing the queue reaches Menu, Filter, Notices, Search, the one link in a row, and the + button, then wraps. No row can be focused or opened. The item view is a `section` over the queue, not a dialog, so Tab leaves it into the queue behind (measured).

**Fix.** Make each row's time a link or button to the item, as the app's stamp is. Mark the item view `role=dialog aria-modal`, or make it its own page, and trap focus in sheets and the drawer.

#### [major] No reduced motion, no focus styles

No `prefers-reduced-motion` anywhere in css/. The spinner spins, the strip slides, the press flickers. Focus relies on the browser's default ring, which the beige morph segments wash out.

**Fix.** Zero durations under reduced motion, as the app's tokens do. A 2 px ink focus ring on pills and rows.

#### [minor] Contrast below 3:1 on control boundaries

Morph edge #a9a9a9 on white: 2.35:1. The "+ tag" dashed border #d2d2d2: 1.51:1. Future breadcrumb steps at 40% opacity: 2.76:1. The current-step tint against its neighbours: 1.04:1. Text tokens pass: muted 6.69:1, danger on beige 4.68:1.

**Fix.** Edge #767676. Future steps at full ink with a dashed edge, instead of fading the text. See comparison.

#### [minor] aria-pressed on things that aren't toggles

The Notices and Filter pills set `aria-pressed` to show "has something". A screen reader announces a pressed toggle button.

**Fix.** aria-label carrying the count, as drafted.

### Spec and app parity

#### [major] Features in the app and spec the design lacks

| Feature | Spec / app | Design |
|---|---|---|
| Status line: offline, pending, in flight with countdown, queue count | shell.md, The status line; components/status | none outside settings |
| Batch marking | Marking rows for a batch; components/batch | none |
| Save as template | features plan T3; settings ?item&record | none |
| Trigger tag asks its questions when tagged | Tagging, ADR 63 | quick sheet only |
| Attach in an edit; drop/paste | The row, Dropping and pasting | remove only |
| Feed filter: state, destination, source; order by processed | A filter by state…; ADR 65 | tags + order |
| Tag filter's templates band | Tags, and a filter | trigger tags not offered |
| Index view (one line per item) | The index | none; reasonable to defer on a phone |
| Draining: load more, out-of-reach foot | Draining | none |
| Withdraw asks the destination first | ADR 66 | asks the person only |
| Copy hidden where no clipboard (HTTP on LAN) | Actions | shown, fails with a message |
| Sign-in page; open daemon state | Settings, Access | signed-in only |
| Dark theme | Tokens and themes | offered, not drawn |
| Stranded/unusable templates and destinations | Settings | not drawn |
| Correcting a taken template's fixed place | The process surface | only asked fields |
| Tags while routing | process surface, tags section | not in the route flow |

**Fix.** Not all belong on a phone now. Status line, batch, save as template, trigger questions and the feed filter do.

#### [minor] Spec rules the design breaks on purpose (say so)

Bottom bars, sheets, icons, several sizes, two faces, colour beyond one red, cards in the drawer. ADR 46 and ADR 54 rule these out. The plan says a superseding ADR comes in phase 4. Until then, readers of the spec will flag every screen.

**Fix.** Write the superseding ADR once the direction settles, listing which of ADR 46, 52 and 54 fall.

## 4. Open questions

| Question | Recommendation |
|---|---|
| Should queue rows put attachments above text, like the item view? | No. Rows keep words first; the item view keeps pictures first. |
| A row is for recognising, and the words identify an item faster than a thumbnail. The time aligns with the first line of words, and a picture first pushes it down a 72 px block. Picture-only rows already lead with pictures. The spec's "first two pictures above the words" was written for a desk register, so change it for the phone row and keep it for the item. Cap row thumbnails at two plus "+2". |  |
| How should the item view show routing status? | One box at the top, the same component for every state, always in words with its one action. |
| Pending ("not yet sent"), routing ("Routing by Todo · 12s, Undo"), retrying ("Waiting for Cloud, Cancel"), not delivered ("Not delivered to Vault: reason ›"), discarded (Undiscard), manual (Undo), offline. Delivered records stay as the compact lines under it, each opening its record. Never an icon alone. Drafted in C, D and E. |  |
| Should refused and not delivered look different (both red now)? | Same colour, different words and icon. |
| Both need a person, so both earn the red. They differ in what is at stake. Refused means your device holds something the pool turned down (it is kept here until you edit or delete it), so use a device or cloud-off glyph. Not delivered means a destination turned down a delivery and the item is back in the queue, so use the route glyph. Then keep red off everything else: offline, retrying, a stale check. |  |
| The route check step is cramped. | At check, the bar is Back + Route; facts are tappable rows. |
| Drafted in I and J. Crumbs stay for where/how/place, where there are at most four. |  |
| "Open in Vault" is a no-op. | Remove it for file kinds; show "Open on are.na" when the record has a URL; offer Copy path for files. |
| Per CONTEXT, file kinds never hand back a URL, so this can't become real. An `obsidian://` link would be a new feature, and a vault-specific one. |  |
| Template-field suggestions: chips or a folder browser? | The route's place picker, opened from one row. |
| Chips show five paths out of a vault and can't descend. The route page already has a tree with search. The spec says one place line serves both the composer and the template form, so reuse it in a sheet. Drafted in S. |  |
| Pre-selecting defaults vs the app's implied (unset) marking? | Keep unset distinct: a first option "default (raw)", selected while unset. |
| An unset setting follows the destination and changes when the destination does (`x-notemap-inherits`). Drawing the default as chosen hides that, and saving it would pin a value nobody chose. The spec already names the blank option "default (none)". Drafted in S. |  |
| "rows: rail" means nothing on a phone. | Hide the option below narrow. |
| Also remove "undo notice: top/bottom" from Appearance, since that is the design panel's question, not the reader's. Choose bottom: the thumb is there, and the top competes with the header. |  |
| feed.html and log.html are generated copies of queue.html. | Stop generating. Render the shared chrome from one module. |
| They have already drifted. The feed's item says "Back to the queue" and offers only "Route again". The log has search, the + button and a hamburger on history. The feed's filter is the queue's. A small `chrome.js` that draws header, drawer, notices and filter from a per-surface config keeps them honest and removes `/tmp` scripts nobody else can run. |  |

## 5. Decisions needed

| # | Decision | Options | My pick |
|---|---|---|---|
| 1 | How the phone shell speaks about reachability and work in flight | (a) as now: notices pill + drawer count; (b) conditional bottom status line + bell badge; (c) the spec's always-on status line | (b) |
| 2 | Popups for delivery failures | (a) always (now); (b) only on the route page for that item; (c) never: strip + row line + notice | (c) |
| 3 | Queue default order | (a) oldest first, per CONTEXT and spec; (b) newest first, and change CONTEXT | (a) |
| 4 | Scope of the morph shape | (a) toggles + all floating bars (now); (b) toggles and bars of peers only, no destructive segment, answers as rows; (c) toggles only | (b) |
| 5 | Where Edit lives in the item view | (a) ⋯ + double tap (now); (b) pencil in the header + double tap | (b) |
| 6 | What the item's Route button opens | (a) the full route page (now); (b) the quick sheet, with More options to the page | (b): makes swipe an accelerator, not the only way |
| 7 | Undo window wording | (a) "Routed" at once (now); (b) "Routing… Ns, Undo", then "Routed" | (b): required by ADR 69 |
| 8 | Words for states | (a) icons and dots; (b) words everywhere, icons as support | (b), with the wording table in section 3 |
| 9 | "Waiting to send" vs "pending" | (a) pending, the glossary word; (b) add "waiting to send" to CONTEXT as the shell's word, like discard | (a): pending is short and already in the spec |
| 10 | How marking starts on a phone | (a) long press only; (b) "Select" in the header ⋯, long press as accelerator | (b): long press collides with text selection on iOS |
| 11 | Which parity gaps the phone design takes now | status line, batch, save as template, trigger-tag questions, feed filter bands, attach in edit, sign-in; defer index view and drop/paste | All but the deferred two |
| 12 | Destructive actions | (a) in the bar (now); (b) their own band below the facts, one line of consequence each | (b) |
| 13 | Template defaults | (a) show implied as chosen (now); (b) explicit "default (x)" option | (b) |
| 14 | Design-panel options in Appearance | keep / remove undo-notice placement and rows | Remove both on a phone |
| 15 | Mock file generation | keep the /tmp scripts / shared chrome module | Shared chrome |
| 16 | When to write the superseding ADR for 46/52/54 | now / after the next round | After decisions 1, 4 and 8, which are the ones the ADR has to state |

## 6. Measurements and how to view the alternatives

**Touch targets below 44 px** (measured at 390): header Filter 55×36 and Notices 95×36, Search 36×44, item prev/next 34×28, tag remove 18×18, "+ tag" 52×24, template-form pills 36 tall and path chips 24 tall, link text in rows 17 tall, record lines in the log 18 tall. Route, record and settings bars pass.

**Contrast**: muted on paper 6.69, muted on band 5.26, danger on beige 4.68, danger on #dedede 4.33, tag ink 7.85. Non-text: morph edge 2.35, tag-add border 1.51, disabled crumb text 2.76, signal vs beige 1.04, beige vs paper 1.25.

**Overflow**: the route's "under" toggle measures 408 px in 390. Nothing else overflowed on the pages measured.

**Keyboard**: queue rows can't be focused. The item view doesn't trap focus. The browser default ring is the only focus style.

**Viewing the alternatives**: `node alt/server.mjs 5191` from this artifact's directory, then open any page with `?alt=` set to one or more of `status`, `item`, `undo`, `check`, `ways`, `danger`, `mark`, `form`, `edge` (comma-separated), plus `&offline` where it says so. Without `?alt=` every page is the design unchanged. The changes are in `alt/js/alt-flags.js`, `alt/css/alt.css`, and branches marked `ALT` in `queue.js`, `item.js`, `tags.js`, `quick.js`, `route.js`, `record.js`, `settings.js` and `settings/forms.js`. Neither repo was modified.

**Screenshots**: shots/design/ (the design, port 5190), shots/alt/ (alternatives, plus a few originals shot from the copy), shots/app/ (the app at v0.15.0, from the 2026-10-30 audit).
