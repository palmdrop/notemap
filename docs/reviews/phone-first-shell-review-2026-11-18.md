# Review: the phone-first shell, as built

**Date**: 2026-11-18
**Status**: Resolved (2026-11-18)
**Scope**: `apps/ui/src` on `agent/mobile-first-rethink` at 8253318c (PR #130), driven in a browser
**Plan**: [phone-first-shell](../plans/phone-first-shell.md)
**Spec**: [shell.md](../specs/shell.md), amended through 2026-11-18

> Shots and the side-by-side with the design: http://palmdesk:3006/projects/notemap/?f=2026-11-18-1220-phone-first-review/
> Shot names below are files in that artifact's `app/` folder. Design shots are the repo's
> `docs/design/mobile/shots/`.

---

## Overall

The frame is right: the header, drawer, menu column and rail, day bands, the route page on a
phone, settings as pages, the record page and the status line all read as the design. What lets
the build down is the set of pieces the redesign never reached. They still draw ADR 46's
register inside the new frame:

- the tag chooser;
- the selected row's strip;
- the item view, which is still a selected row with log rows under it;
- the log;
- the notices.

Each of those is a place the developer touches several times a session, so the shell reads as
half-converted. The worst behaviour bugs are around the route's window. A quick route drops its
row at once. A reload forgets the window, so nothing offers Cancel. Closing the routed state
pushes history, so Back reopens the route page for an item just routed. A tablet held wide cannot
select a batch at all.

Method: every surface shot at 390, 1000 and 1440 against a scratch daemon, in light and dark,
online and offline (`context.setOffline`). Phone gestures were driven with CDP touch events. Each
behaviour bug below was reproduced at least twice. 390 shots show a 15px scrollbar gutter: that is
headless Chromium, not the app.

---

## Broken

### 1. The tag chooser is the old one, and on the capture page it opens over the bar

Every surface that adds a tag draws ADR 46's chooser: the capture page, the capture box, the item
and a row's `+ tag`. It is a square box with an ink-black edge and 20px rows of plain words.
Trigger tags appear as `route/todo → Todo`, which uses the `→` and the `route/` prefix that
DECISIONS drops ("drawn as the route icon and the name, without `#route/`, everywhere"). On the
capture page at 390 the list opens below the field. It covers the docked Save bar and runs off the
bottom of the screen (`cap-tag-390`).
Shots: `cap-tag-390`, `box-tag-1440`, `item-tag-add-390`. Design: `24-item-tag-offer`.
Fix: one chooser in the blocks register: rows at least 44px, beige where pressable, trigger tags
as icon and name, opening upward or as a sheet on a phone.

### 2. A route's window is forgotten on reload: no row, no line, no Cancel

Repro at 390: open an item, then Route, More options, Vault, Next, Next, Route. The routed state
says "Routing to Vault, 29s to cancel". Reload `/` inside the window. The row is gone, there is no
status line, and the notices say "No notices." Nothing offers Cancel, though the window still
runs. A phone browser or a wrapped app reloads whenever the OS evicts it, so this will happen.
Shots: `route-routed-now-390`, then `q-window-390` (after the reload) and `route-routed-390` (its
notices).
Fix: rebuild the open windows from the pool on load. The pending record and its `until` are
there. Then draw them on the row and the line as usual.

### 3. × on the routed state pushes the queue; Back reopens the route page

Repro at 390: open an item, then Route, More options, Vault, Next, Next, Route. Press × on the
routed state. That lands on `/`. Press the system Back: it lands on `/items/{id}/process`, at
"where 1 of 4", offering every template again for an item already in its window
(`flow-hand-back-390`). DECISIONS: "Routing replaces the check in history: back leaves for where
the route began."
Fix: × on the routed state should go back to the entry before the route page (`history.back()`,
or a `replaceState` to the origin), not push `/`.

### 4. A wide touch screen cannot select for a batch

`Row.svelte:194`: `holdFrom` returns when `width.wide`. The circle is drawn only on hover
(`pointed && width.wide`). Repro at 1000 with touch: hold a row, and it opens the item
(`q-touch-wide-1000`). Ctrl-click and `space` need a keyboard. ADR 76 says the breakpoint is width
and that "a tablet held wide gets the wide form". So that tablet has no way into a batch.
Fix: allow the hold for `pointerType` touch or pen at any width, or always draw the circle when
the pointer is coarse.

---

## Wrong

### 5. A quick route drops its row at once

Repro at 1440: hover a row, then Route, then To the vault, then Route. The row leaves straight
away and only the status line counts down (`flow-quick2-b-1440`). ADR 72 and DECISIONS say the
row stays, saying "Routing by Todo, list Next", the seconds and Cancel, and slides out when the
window closes. The design shows it after a quick route (`11-queue-window`). On a phone, a route by
hand does keep its row, but only because the row is still selected (#6).
Fix: keep any row whose route is in its window, however the route started.

### 6. Selecting a row brings back ADR 46's strip

Pressing `j`, `k` or the row's time when wide, or coming back from a route by hand on a phone,
selects the row. It then gets a beige strip of six boxes under it: Route, Done, Discard, Edit, Copy,
Open. The row's tint is the band grey (`Row.svelte:424-431`). ADR 72 supersedes "the row's ruled
strip". The amendment says the time "selects it in place for the keys", with no strip. On the
phone the selected row also stays after its window has closed, together with the strip and an
old-style record line (`Vault block ⟳ cancel`). That line duplicates the row's state box.
Shots: `focus-j-1440`, `q-time-select-1440`, `flow-hand-queue-390`, `flow-hand-390`.
Fix: drop the strip. Draw a selected row as selected (see #20), with the keys and the hover Route
as its only actions.

### 7. The item view is still a selected row

On both widths the item has a time column that repeats the header's time. Its records are log rows
under day bands, laid out as `08:35 Vault / todo.md   created   delivered`. A record line unfolds
the old Block inline, with ink edges and `Filename` labels (`record-click-390`). The record's own
page is reached only through the record's time stamp (`Item.svelte:167`). A tag's × appears only
after the tag is tapped. Previous and Next are a plain split pill, not the morph shape DECISIONS
keeps. Opened by URL, the walk says `1/1`.
The design's item has the words at body size with no time column, record lines as a box of rows
with chevrons that open the record page, and × on every tag.
Shots: `item-390`, `item-1440`, `item-feed-390`, `item-feed-1440`, `record-click-390`.
Design: `20-item`, `53-feed-item`.
Fix: redraw `Item.svelte` as the design's view rather than `Row surface="item"`.

### 8. Done and Discard on the item say the wrong things, several times

- A routed item in the feed still offers Discard and Done beside Route again (`item-feed-1440`).
  The design offers only Route again.
- Done on a phone stays on the item. It draws the manual mark as a record (`by hand`, `marked
  processed`, `delivered`) and a line `marked manual … undo` (`item-done-390`). DECISIONS: "Manual:
  processed by hand", with Undo in its box. The design moves on to the next item and says "Done:
  …" with Undo (`28-item-manual`).
- Discard when wide says it three times: a "Discarded / Undiscard" box, a `discarded … undo` line,
  and `discarded` in the row. Two undos do one thing, and Done is still offered
  (`item-discarded-1440`).

Fix: one state box per state, worded as DECISIONS has it. Offer only the actions that apply to
the item's state.

### 9. A batch's actions are not in the head

Wide: Discard, Tag and Route sit in a beige bar under the capture box. "2 selected" is a small
line under it, with `All` and `Clear` as underlined words (`q-select-three-1440`). ADR 76: "the
batch's actions in the head, beside the count" (`w06-batch-in-head`).
Phone: the header stays "queue". "3 selected" is a small line over the bar, and the + floats over
that line (`q-hold-three-390`). The design swaps the header for "× 3 selected   All"
(`14-batch`).
The batch route sheet's title says "route 2 notes". CONTEXT says to avoid *note*.
Fix: the head carries the count, ×, All and, when wide, the actions. Hide the + while selecting.

### 10. The log was not redrawn

Every log row is ADR 46's:

- the item's words underlined as a link;
- `→ Vault / path`;
- the verb under the time, in the time column;
- an outcome word in a column that stops 144px short of the edge (`Body.svelte:34`, `wide:pr-36`).

The outcome words are outside the one vocabulary: `created or appended`, `created`, `appended`.
A manual mark reads `routed → by hand   marked processed`. Bands have no day count. A blank 40px
gap opens under a band (the old `gap-time`, `Body.svelte:36`), although the band has already said
the day changed. At 390 the verb collides with the words: `discarded` over "read it, kept
nothing" (`z-log-discarded-390`). At 1000 both the words and the path truncate while 144px stay
empty (`log-1000`). The opened record is the old Block with ink edges.
Shots: `log-1440`, `log-1000`, `log-full-390`, `z-log-390`, `log-open-1440`. Design: `w21-log`,
`54-log`.
Fix: redraw the log's row in the queue's register, with a record line like the feed's, and the
outcome in the route's words.

### 11. Internal names and patterns leak into what is read

- The window line says "Routing by Vault, block". `block` is the target's `conversion`, which the
  check called "raw" (`flow-hand-queue-390`, notices too).
- The quick sheet and the templates list show `seeded, {{item}}.md` (`item-quick-390`,
  `set-templates-390`).
- The status line shows `seeded, 019a3000-0000-7000-8000-000000000000.md`
  (`flow-quick2-b-1440`). A template that names files by id is the seed's choice, but the line
  only needs the template's name and an answer.
- The place on the check is "place" on a phone, "Note" when wide (`route-question-1440`), and
  "file" in the design. The template form says "Note" and "as" where the route says "shape"
  (`set-template-edit-390`).
- The account form labels a field `baseUrl` (`set-account-new-390`). The log and record Block
  label `Folder` and `Filename` in capitals beside lowercase `size`.

Fix: name each argument once, in the route's vocabulary (action, shape, place), and resolve
patterns before showing them, or show them as "named from the item".

### 12. A trigger tag's question shows markdown and words-as-buttons

Adding `route/todo` on the item asks "list" with answers `## Inbox`, `## Next` and so on, each
with an underlined `Route` (`item-trigger-390`). When wide it is a popover under the tag line
(`item-trigger-1440`). The route page asks the same question cleanly ("Inbox", with a chevron).
Design: `25-item-trigger-ask`.
Fix: use the route page's answer rows in the sheet.

### 13. The capture page's Save is live with nothing to send

At 390 Save is a filled ink block on an empty page (`capture-390`). DECISIONS: a main action that
cannot be taken yet stays dashed, with the reason above the bar. The settings forms already do
this. The header has the menu where the design has ×, there is no Camera, and Tag in the bar
duplicates the `+ tag` above it.
Design: `31-capture`.

### 14. The queue's filter is short a band, and one of its counts is wrong

- No templates band (DECISIONS: "The queue's has a templates band").
- The source count says `web 15` with 8 rows in the queue. It counts the pool, not the queue.
  The tag counts in the same panel are right. Repro: `f` on the queue and compare with the
  drawer's count.
- No Reset, and Show has no count (the design has "Reset" and "Show 13").
- `source`, `state` and `destination` are lowercase beside `Order`, `View` and `Tags`.

Shots: `queue-filter-1440`, `queue-filter-390`, `feed-filter-390`. Design: `w08-filter-panel`,
`05-filter`.

### 15. When wide, a form's Save is at the foot of a long form

The template form (new or edit) has Cancel and Save after its last band, below the fold at 900px
tall (`set-template-edit-1000`, `set-template-new-1440`). A destination's page puts its actions
in a toolbar at the head (`set-destination-1440`), which is ADR 76's rule for a docked bar.
Fix: a head toolbar for forms too, with the reason line beside a dashed Save.

### 16. Offline says less than DECISIONS asks

- The destinations list still says `available` offline, with no "as of 12:31"
  (`off-settings-390`).
- The status line says only "Offline", with no time the pool last answered.
- Wide, the menu's foot wraps to two lines each ("offline, last / answered 12:17", "no password /
  set") and no longer lines up with the status line (`off-queue-1440`).

---

## Rough

### 17. When wide, the capture box is not on the rows' column

The box's words, Attach and `+ tag` start at x=252, while every row's words start at x=304
(`queue-1440`). The design puts them on the words' column (`w01-queue-1440`). The button says
`capture` in lowercase, beside `Attach` and `Save`.

### 18. Route on a hovered row sits at the window's edge

At 1440, Route sits at x≈1320–1413, about 700px from short words (`queue-hover-1440`). DECISIONS:
"Rows keep a readable measure, and Route stays beside the words rather than at the window's
edge."
Fix: give the row's body a measure and put Route at its end.

### 19. One tint means three things

Hover, the row last opened and a row selected for a batch are all `bg-tag`. The row selected for
the keys is `bg-band`, the headings' grey (`Row.svelte:424-431`). With a batch under way, the
hovered row looks selected (`q-select-three-1440`). A selected row reads as a band.
Fix: give the batch its tick and a stronger tint, keep hover lightest, and do not use `band` on a
row.

### 20. The focus ring shows after a tap or a click, round the time cell only

After a touch tap, a ctrl-click or `j`, the 2px ink outline wraps the time column, not the row,
and touches the words (`q-hold-three-390`, `q-select-three-1440`, `focus-tab-1440`). The ring
probably follows a programmatic `focus()` after a pointer press.
Fix: put the ring on the row, and only for keyboard focus.

### 21. The feed's rows keep old marks

- A revision is drawn as a literal `[+]`, with its word only for screen readers
  (`Row.svelte:350`).
- Record lines lose the place: `Vault` alone, where DECISIONS keeps "the end of a path
  (`…/name.md`)".
- A manual mark is drawn with the route icon and the word `manual`.
- `revised` is a bare word.

Shots: `feed-full-390`, `q-scrolled-390`. Design: `50-feed`.

### 22. The notices use old words and an empty column

- Each notice is indented under a time column with nothing in it.
- `open` and `save as template` are lowercase.
- Cancel is a beige box, where DECISIONS asks for an underlined word.

Shots: `flow-quick-notices-1440`, `flow-hand-notices-390`.

### 23. A search that finds nothing offers to "clear filters"

The button is a square with an ink edge, in lowercase. It says filters when only a search is
active. The search field's × is the browser's own, in blue (`queue-search-390`,
`queue-search-none-1440`). Design: `08-search-nothing`.

### 24. The check's preview is ruled in ink

On the phone's check, the "as it will be written" box has a black edge and a black rule under its
title (`route-check-full-390`). The design and the record page use the grey rounded box
(`40-route-check`, `record-390`).

### 25. The place step has no label and buries its proposal

The place field is an empty grey box with no placeholder (the design has "Find a folder in
Vault"). The proposed new note is the last row, truncated, and files such as `pixel-….png` are
offered as places (`route-place-390`, `route-hand-full-1440`).

### 26. Stuck bands stack and double the rule

- On a phone, after returning to a scrolled queue, the previous day's band shows half its height
  under the header, above the current one (`flow-hand-queue-390`).
- In the feed and the log, the header's rule and a stuck band's top rule meet as one 2px rule
  (`z-feed-rule-1440`). The spec's amendment says they must not. The queue, with the box between,
  is fine (`z-queue-rule-1440`).

### 27. A template's asked field is two inputs and a row of patterns

Under "list": a boxed input with the label, an "Ask each time" toggle, an underlined second input
for the default, "no default", and `{{captured_at}} {{item}} …` as plain words
(`set-template-edit-390`). The audit's S2 ("speaks in patterns") is still open here.

### 28. Wide: the box takes the caret, so the advertised keys type into it *(developer's call)*

On load at 900px and wider the capture field has focus. `f`, `n` and `j` type "fnj" into it
(`z-keys-1440`), while the icons' tooltips say "Filter (f)". It is as the spec has it ("the field
takes the caret when the queue is drawn"). With the search, filter and notices now icons in a
wide header, though, the first key most people press is one of theirs.
Suggestion: take the caret only on a phone-sized window, or only after the box is pressed.

---

## Polish

### 29. Accessibility, carried over from the plan's phase 12

- Control edges are `off-line` (#e9e6df mixed 25% with ink, about 2.2:1 on white). Input borders
  are `rule` (#a9a9a9, about 2.35:1). The `+ tag` dashed edge is `tag-line` (about 1.5:1). All are
  under 3:1.
- Targets under 44px at 390: tags 24px, `+ tag` 24px, a row's time 19px, segmented rows 36px,
  Previous and Next 44×36.
- Every tag chip has `aria-pressed="true"` (`TagSet.svelte:455`).
- A tag's × appears only after a tap.

### 30. Dark: pressable and heading lose their difference *(developer's call; dark is rough by decision)*

Beige becomes #2b2924 and the band #242424. On the route page and in settings the action bar, the
bands and the box grey read as one dark grey (`dark-route-1440`, `dark-settings-1440`). The main
action turns into a white block, which works. ADR 71 asked to revisit this.

### 31. Settings when wide is three columns *(developer's call)*

Menu, sections and page sit side by side, with about 420px empty to the right
(`set-destination-1440`). The 2026-11-18 amendment moved the item off three columns for this
reason.

### 32. Small words

- "1 times, last 2026-11-16" on a template.
- "where the assets lives" in Storage.
- `Show` in Storage is an underlined word.
- "are.na" as a destination kind but "arena" as an account band.
- Task boxes in an item's words show as a literal `[ ]`.
- The quick sheet's quote starts with "11-02 23:02:".

---

## Non-issues

- **The route page takes the whole window when wide, without the menu.** ADR 76's amendment
  keeps it.
- **"Hold a row to select several."** on every fresh load. The shots used fresh storage each time.
  The hint is said once per device.
- **The 15px strip at the right of every shot.** Headless Chromium's scrollbar gutter. Overlay
  scrollbars on a phone take no room.
- **An empty square above the rail at 1000.** The design draws it too.
- **The status line runs under the list only, not the menu.** As ADR 76 has it, and the two
  rules line up at 1440.


---

## Resolution

Every finding was taken on `agent/mobile-first-rethink`, 7b32a40a..85b308ec; shell.md and ADR 76
carry the amendments. The three developer's calls went with the suggestion:

- **28.** The box takes the caret only when pressed, or reached by `k` from the first row.
- **30.** Dark's beige is warmer and lighter than its band, so pressable and heading differ.
- **31.** At full width settings' sections hang under settings in the menu, and a section takes
  the window beside it. At the rail's widths they keep their own column.

Two findings changed more than the shell: **14**'s source count needed `unprocessed` on
`GET /v1/sources` (store, schema, OpenAPI and client), and **2** reads the log for windows still
open on start.
