# Review: PR #130, the phone-first shell as it stands

**Date**: 2026-11-24
**Status**: Resolved, but #12
**Scope**: `git diff origin/main...agent/mobile-first-rethink` at 011b85a3 (96 commits, 501 files):
`apps/ui/src`, the small daemon/client/core/store changes behind it, `CONTEXT.md`, `docs/specs/`
**Plan**: `docs/plans/phone-first-shell.md` (Done), `docs/plans/mobile-first-rethink.md` (In progress),
`docs/plans/features-from-the-mobile-rethink.md` (Done, already on main)
**Spec**: `docs/specs/shell.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `CONTEXT.md`

---

## Overall

The redesign holds up. Every control and state of the old shell still has a place (table below), and
the open points of the 2026-11-18 review are taken. Checks are clean: `pnpm check` reports 0 errors and
0 warnings, eslint reports nothing, and `pnpm -r --no-sort --silent test` exits 0. What is wrong is
mostly behaviour around moving between items, plus a large amount of old design left in the tree. Four
of the bugs below were reproduced in a browser against the dev server on 5191.

- **Discard on the item view drops the reader into the feed** instead of the next queue item (#1).
  It is the most common action in the redesign's core flow, and nothing tests it.
- **Close on the route page goes back to the previous item's route page** after `[` or `]` (#2).
- **A row walked to with `k` ends up under the header and the day band** (#3).
- **The stuck-band fix from the last review is inert** (#4).

A separate problem is that `shell.md` now contradicts itself in text written for this redesign, and
the work of 11-19 to 11-23 has no `Shipped:` entries anywhere.

Method: code and diff first. The browser was used only to confirm #1–#5 and to rule out two other
suspicions (see Non-issues). The scratch daemon's data was restored after each probe that discarded
something.

---

## Bugs

### 1. Discard on the item view goes to the feed, not the next item

`components/item/Item.svelte:119-128` wraps `discard` with `moveOn()`, and `moveOn` reads
`walk.next` (`walk.svelte.ts:18-24`). `discard()` updates the held queue synchronously.

```
Discard → the item leaves client.queue at once
       → walkOf no longer finds it in the queue, falls back to the feed's list (home = "/feed")
       → at === -1 there, so next is undefined
       → goto(walk.home) = /feed
```

Reproduced at 390 and 1440: open the first queue item ("1/3"), press Discard, and you land on
`/feed`. Done is unaffected only because `manual()` is async and the item is still queued when
`moveOn` reads it. The only "moves on" test (`Item.test.ts:764`) covers Done.

Fix: capture `walk.next` and `walk.home` before running the command, not after. Add the Discard
test.

### 2. Close on the route page walks back through every item stepped to with `[` `]`

`components/process/Process.svelte:1288-1290` steps with `goto(processHref(id))`, which pushes.
`back()` (`:1278`) is `history.back()` whenever `within.yes`. Reproduced at 390: open item A, then
Route, More options, `]` (now on B's route page), then Close. You land on A's route page, not the
item.

There is a second problem. `lib/within.svelte.ts` is "the shell has navigated at least once this
session", not "the entry before this one is the shell's". So on a route page opened by URL, one `]`
and then two Closes leave the app. DECISIONS: "back leaves for where the route began".

Fix: step with `replaceState: true`, as `ItemHead` and `advance()` already do. Replace the global
`within` flag with what the item header does locally (#13), or remember the entry the route began
from.

### 3. A row walked to from below is scrolled under the header and the day band

`Row.svelte:415` and `Index.svelte:172` use `scroll-mt-day-head`, which is `--spacing-day-head:
2.25rem`. That is the old register's token, from when nothing above the list was sticky. The header
is now `--spacing-bar` (3.5rem, sticky) with a sticky band under it, so about 92px are covered and
36px are allowed for. Reproduced at 1440×600 on `/feed` with `j`×9 then `k`×6: the selected row's
top is at y=36 under a 56px header, and only its `+ tag` and last line are visible.
`styles/base.css:8` has the same problem at the bottom: `scroll-padding-bottom` uses
`--spacing-status` (2.25rem, old), while the line is now `--spacing-foot` (2.75rem).

Fix: a scroll margin of bar plus band, and `--spacing-foot` at the foot. Then retire the old tokens
(#7).

### 4. `data-stuck` is never set, so the 11-18 "hide a band held under a later one" fix does nothing

`register/stuck.svelte.ts:21` treats a band as stuck when `top < height && bottom > 0`. That was
right when the band held at `top: 0`. It now holds at `--spacing-stuck` (55px), and 55 is never
below its own 36px height. Measured at 390 and 1440 while scrolling `/feed`: three bands pinned at
top=55, every one `data-stuck=false`, every one visible. So `buried` in `Day.svelte` never applies,
and review #26 (2026-11-18) is not actually fixed. Its test passes on mocked rects.

Fix: compare against the band's computed `top` (the sticky offset), not 0.

### 5. Esc with the item's ⋯ menu open leaves the item

`ItemHead.svelte:114-138` draws a `role="menu"` with no key handling, no outside-press close and no
focus move. `ItemHead` publishes `back` on `escape` (`:44`), so Esc meant to close the menu runs
`back()`. Reproduced at 390: open an item, ⋯, Esc, and you land on `/`. The menu also stays open
after a press elsewhere and across Previous and Next.

Fix: the menu takes Esc and outside presses while open, and focus moves into it. Or draw it with
the `Sheet`/`Dialog` primitives the shell already has.

---

## Design

### 6. The item's bar says whatever notice is newest, about any item

`ItemBar.svelte:53-56` reads `notices.latest` whenever it has an offer. It is not tied to this item
or to the decision that moved here. For up to 10s, opening item B shows "Routed: …  Save as
template", a batch's "3 items discarded  Undo", or a refusal, all on an unrelated item's bar. The
design's line is about the item just left.

Fix: key the said line to the notice raised by the Done or Discard that moved here, for example by
passing its id through `moveOn`.

### 7. The old design is still in the tree: dead components, utilities and tokens

These became unreachable on this branch:

- `components/record/Block.svelte` (637 lines) is imported by nothing but its own 926-line
  `Block.test.ts`, which still passes and so hides that it is dead.
- `primitives/motion/Unfolding.svelte` had 4 users on main and has none now.
- `primitives/composer/Option.svelte` had 6 users on main and has none now.
- `ActionBar`'s `at="head"` and `plain` branches are drawn only by `Pieces.fixture.svelte`, since
  bars dock at the foot at every width (11-19).
- `Routing.svelte:102,375` keeps an `"undo"` offer label that `offerOf` can no longer return.
- `StateWord`'s `inverted` and `failed` props have no caller that sets them.
- `marks/Turning.svelte` is now just `<Spinner>`.
- The `inverted` and `rule-right` utilities (`styles/utilities.css:6,19`) have no users.

In `tokens.css:118-128`, `--spacing-rail`, `-rail-narrow`, `-rail-time`, `-day-head`, `-gap-time`
and `--spacing-status` sit under "The old register's, until its rows are drawn by day". They are
drawn by day now. Two of these tokens are still read, with wrong values (#3).

`ActionRow.svelte` was already dead on main.

### 8. `e` on a selected row draws ADR 46's edit foot

`Row.svelte:503-505` still opens `EditFoot.svelte`: lowercase `close`, `revert`, `attach` and a
bold `save`, drawn in the old `controls/Action.svelte`. That primitive is now used by this one
component and its fixture. The queue and the feed publish `edit` for the selected row
(`Queue.svelte:380`), so `j` then `e` when wide shows the old register. Meanwhile the item view's
edit bar is `Attach`, `Cancel`, `Save` (`ItemBar.svelte:96-124`). That leaves two edit footers in
two designs.

Fix: route `e` on a list row to the item view's edit, or reuse `ItemBar`'s editing bar. Then
`EditFoot` and `Action` can go.

### 9. The status line still speaks the old words for Done and Discard

`lib/quick.ts:27,58` raise `what: "discarded"` and `what: "marked manual"`. `Message.svelte` draws
`what` and `subject` but not `about`. So on the queue the line reads `marked manual  Undo` or
`discarded  Undo`. DECISIONS and the design (`notemap-design/js/queue.js:233`) say
`Done: **words**` and `Discarded: **words**`. Only the item bar translates, through a local `WORDS`
map (`ItemBar.svelte:59-62`). "Marked" is also the word CONTEXT now keeps out of what the shell
prints.

Fix: raise the new words at the source and drop the map. `StatusLine.test.ts:1029` and
`Item.test.ts:387` pin the old ones.

### 10. `shell.md` contradicts itself in text written for this redesign

The "kept where it still holds" approach is declared and fine. These, though, are new or amended
paragraphs that the code and later amendments contradict:

- `shell.md:1071-1073` (The row, 2026-11-13). It says a selected row "is drawn on the band, its
  actions as a beige strip under its words. *(Until the item view is redrawn, a tap selects the
  row…)*". There is no strip, the tint is `picked`, and a tap opens the item. Line 10 (Shipped) and
  2414 say the opposite.
- `shell.md:3165-3167` and `:3208` (Settings, 11-18). These say "A form's Cancel and Save are at its
  head when wide" and "a page's toolbar at its head when wide is drawn without the bar's beige".
  They were reversed on 11-19 (`:3200`, ADR 76's amendment) but never struck.
- `--breakpoint-narrow` and "below `narrow`" are still used as live rules at `:1544`, `:2564`,
  `:2656`, `:3215`, `:3224`, `:3517`, `:3524` and `:4096`. That breakpoint is gone (`:3741`).
- Templates (`~:3290`) still draws a trigger tag as "bold small-caps". Server (`:3344`) still folds
  sources under `show`/`hide`, and Storage (`:3371`) still has `PATHS show`. The 11-18 and 11-19
  amendments above them say otherwise.
- The register keyboard paragraph (`:1243-1256`) says "a control that is not drawn has no key
  either", and that the index is chosen in the list head with `timeline ▾`. Rows no longer draw
  their actions, and the view is in the filter.
- `DECISIONS.md` lists "`j` `k` and the arrows walk the rows… Enter opens". No arrow keys are bound,
  and `enter` opens the quick route (as `shell.md:1245` says). Its wide table row 4 still says "a
  toolbar at the head of the pane", which ADR 76 has since reversed.

### 11. The `Shipped:` trail stops at 11-18, and the API changes have none

- `shell.md`'s **Last updated** is 2026-11-18, and it has no Shipped entry for 11-19 to 11-23.
  That work includes skeletons (which supersede a recorded "no skeletons" decision, `:3889`), the
  captured-today squares, the batch's tag line, the place line's folders, and bars docked at every
  width.
- `http-v1.md` (Last updated 11-12) amends `GET /v1/counts?since`, `422 bad-since` and `unprocessed`
  on `GET /v1/sources` inline, with no Shipped entry.
- `client.md` amends the tags re-read after a capture, edit or batch inline, with no Shipped entry.
  `counts.capturedToday` is not in it at all.
- `mobile-first-rethink.md` is still **In progress**, though its goal ("the follow-up plans are
  written") was met by `phone-first-shell`.

### 12. `Process.svelte` is 1991 lines

It was 1388 on main. This branch adds the step machine, the routed state, the wide two-pane layout
and the check to the same file. AGENTS asks for small files grouped by concern. The steps
(`where`, `how`, `place`, `check`, `routed`) are already separate snippets and would split along
those seams.

### 13. Two "did we come from inside the shell" mechanisms

`lib/within.svelte.ts` is global and set by the layout. `ItemHead.svelte:30-33` keeps a local copy
fed by its own `afterNavigate`. The global one has the wrong meaning (#2). Pick one: the local
per-mount form is the correct one.

### 14. Tests missing for changed behaviour

- Discard moving on (#1).
- Close after stepping on the route page (#2).
- `Strip.svelte`: the red strip, Show, ×. It has no test of its own.
- `Drawer.svelte`: open, close, waiting count.
- `Header.svelte`: the phone search takeover, the filter badge, the selection head. Its only test
  is the breadcrumb.
- `walk.svelte.ts`: which list, home.
- The ⋯ menu (#5).

---

## Minor

### 15. "Captured today" counts revisions

`pool-store.ts:622` counts every `items` row with `created_at >= since`. An edit of a sealed item
creates a revision with `createdAt = at` (`core/pool/edit.ts:145`), so revising three routed items
reads as three captures. The spec says "every item captured at or after". Separately, `Glance`
ticks the date every minute but the count only on a counts reload, so just after midnight
yesterday's count can sit under today's date.

### 16. Stale and orphaned comments

These break the comment rule: a false comment is worse than none.

- `Queue.svelte:133-139`: two JSDoc blocks in a row. The first ("A decision takes the selected row
  off the queue…") has lost its subject.
- `PathLine.svelte:149-153`: "The typed tail that is not there yet…" now sits over `placeable`.
- `session.svelte.ts:56-57`: "Only where there is a door to come back out of" was left above `who`,
  and `canSignOut` lost it.
- `Row.svelte:438-439`: "for the keys and the strip". There is no strip.
- `TagSet.svelte:12-15`: "taken off by pressing it once to select it — bold — and again on the ×".
  The × is always drawn now.
- `Capture.svelte:46-50`: `focus` is documented for "the way back from processing". The queue
  always passes `false`, and only the page uses the default.

### 17. Words against CONTEXT

- `Stamp.svelte:69` reads ", marked" to screen readers. CONTEXT: the shell says *selected* and
  never prints *marked*.
- `lib/batching.ts:10`: `notes()` returns "N items". The name is the avoided word.
- `Discarding.svelte:9` asks "Go back to the queue?" even when the route began from the feed or an
  item ("Route again").
- Form labels mix cases: `AccountForm` has `kind` beside `Name` and `Secret`, while other forms are
  all lowercase.

### 18. The quick sheet

`Quick.svelte:31-37` filters templates only by `retired`. A template on an unusable (stranded)
destination is offered and then refused by the pool. `Process.svelte:878` already computes
`unusable`. With no templates the sheet shows only More options, with no words. A typed answer's
button says Next even on the last question, where it routes.

### 19. The log's filter re-implements `Toggle`

`log/Views.svelte:41-64` copies `Toggle`'s classes into a local `BOX` and uses `aria-pressed`.
`FilterPanel` draws the same "boxes that can all be on" as a multiselect `listbox`. That is one
widget in two shapes, with two semantics.

### 20. Accessibility leftovers

- `Box`, the selection head's `All`, `Toggle` and `Dialog`'s ways are `min-h-9` (36px) on a phone,
  under the plan's 44px.
- `Segmented` is a set of `aria-pressed` buttons rather than a radio group.
- The trigger tag's question (`TagSet.svelte:589-592`) is a fixed `div` over a veil. It has no
  `role="dialog"`, and the line a typed answer goes into stays behind the veil.

### 21. Small things

- `Queue.svelte:10`'s module-level `seen` map is never pruned.
- `asked` (`:148`) is a `SvelteSet` only because lint wants it, which re-runs its own effect. An
  item whose read failed is never asked again.
- Syne ships as a 78KB `.ttf` (`static/fonts/syne/`), preloaded with `font-display: block`. Arimo
  is subset `woff2`. The daemon gained a `.ttf` MIME type just for it.
- `spoken("shift+tab")` is `Shift+tab`, and the test pins it.
- `ItemHead`'s button is titled "Back (Esc)" when wide, where its icon and label say Close.
- `lib/lasting.svelte.ts` is surprising: a page receives the next route's `data` before it is torn
  down, which suggests a `|global` outro keeping the old page mounted. It is patched route by route
  (`items/[id]`, `process`, `records`). Finding the transition would fix it once.

---

## Nothing lost from the old design

Every control in the audit's table (`mobile-rethink-audit-2026-10-30.md`, "No feature lost") and
every keyboard binding was checked against the branch:

| Old control or state | On the branch |
|---|---|
| queue, feed, log, settings | Drawer, menu column or rail (`frame/Menu.svelte`) |
| Capture field, attach, picker, held files with ×, drop and paste | `/capture` page on a phone, the box when wide. A phone's queue takes no drop (spec'd, `shell.md:983`) |
| Tag the capture, asked argument | TagSet with the question sheet. "Routes by … once it is sent" |
| `capture` and mod+enter | Save or Capture, and `capture` while the box is selected |
| View (timeline / index), order, filters, clear | Filter sheet or panel: order, view, tags, templates, state, destination, source. Reset, Show N, `ClearFilters` |
| Load more and endless scroll | `More` |
| Select a row, enter, j/k, `esc` | Tap opens the item. The time selects when wide. Keys unchanged |
| process, manual, discard, undiscard | Route, Done, Discard, Undiscard in the item bar. `p m D u` everywhere |
| edit (close, attach, revert, save, keep editing) | Item: Attach, Cancel, Save. Leaving asks "lose your changes?" (revert dropped deliberately). The queue row's `e` is the old foot (#8) |
| copy, open/history | Item's ⋯ menu (Copy, History, Edit). `c o e` |
| Tag an item, trigger tag | Tags with ×, `+ tag`, the question sheet, locked while it counts |
| Process: destination line, bands, change, capability, output, place line and tree, asked args, rewrite edit/restore, tags band, preview, route, `[` `]`, back with stay/leave, usage beside a destination | All on the route page (`usedBefore` kept). `[` `]` push history (#2) |
| Record: output and "read it", args, assets, cancel, undo, withdraw, reinstate, own address | Record page: Written ("Read it again"), facts, Withdraw band and dialog, Reinstate |
| Log views, order, history, all of the log, item link | Log filter (#19), "this item" or "this batch" with All of the log |
| Notices (n), message offers, firing countdown and cancel, pending count, offline, queue count | Bell and line. Windowed on the row and item. "n waiting". Offline with "last answered". Queue count in the menu |
| Refused capture: edit, delete, copy | `RefusedRow` at the queue's end, and the panel |
| Settings: every section, every action (check again, edit, disable/enable, delete, add, remove, sign out, token add/copy/done/revoke, reclaim, API reference, link previews) | Present. Sources and paths are always shown rather than folded (spec'd 11-18 and 11-19). Appearance `rows` removed by ADR 73 |
| Sign in: name, password, errors, throttle | SignIn page |
| States: offline, cached, pending, refused, error, empty, drained, filtered-empty, not-found item, unreachable | Present (`Cached`, `Pending` dot, `Refused`, `NO_ITEM_OFFLINE`, `NO_SUCH_ITEM`, `QUEUE_EMPTY`, `nothingMatches`, `NOTHING_CAPTURED`, skeletons) |

Nothing went missing silently. The deliberate removals are: revert in the item's edit bar, the
`rows` setting, show/hide on sources and paths, drop on a phone's queue, and the row's strip.

---

## Non-issues

- **No status line on the item, route, capture, record or settings pages.** ADR 74 and CONTEXT say
  so. Notices still open with `n`.
- **Same-folder `$components/…` imports in `item/`, `settings/`, `queue/`.** This is the files'
  existing style on main. The new lines follow it.
- **`[` `]` type into the destination line on the wide route page.** The line takes the caret on
  arrival, as it did on main.
- **A capture's draft, refused rows and the window surviving a reload** are all present. 11-18 #2,
  #3 (except #2 above), #4, #5, #6, #9 and #14 are fixed.
- **The status line's hold surviving a navigation from under the pointer.** Suspected, because the
  line is now unmounted on non-list pages. Not reproduced: Chromium releases it.
- **The phone's batch bar covering the last row.** Checked on `/feed` at 390 scrolled to the end:
  the last row clears the bar.
- **SvelteKit's bare "500 Internal Error" when an unloaded route chunk is navigated to while the
  server is out of reach.** Seen in dev with the context offline. It comes from route
  code-splitting on main, not from this branch. It is worth a look for "offline-friendly",
  separately.

---

## Resolution (2026-11-24)

Everything above is fixed on the branch except **#12**, which is left for a design conversation
because splitting the route page decides a module's shape.

- **#1, #2, #13**: one `lib/trail` replaces both "came from inside the shell" mechanisms. Previous,
  Next, `[` and `]` are history entries, so back walks them as the developer expected. Close goes
  back past all of them. Where a decision moves on to is settled before it is sent.
- **#4**: the stuck check measures against the band's own sticky top.
- **#9**: the developer chose **Manual** over Done throughout: the bar, the route page, the record
  line and the status line.
- **#18**: the claim that stranded templates are offered did not hold. The quick sheet already
  dropped deleted and disabled destinations, as the route page does. What was added: the empty
  state, the offline state, and Route on the last question.
- **#19**: the log's filter reuses `Toggle`. FilterPanel keeps its listboxes, because a combobox
  walks them there.
- **#21**: no `|global` outro is mounted on the pages that use `lasting()`, so the guard stays.
  Syne is now a Latin woff2 subset of 20KB.

The developer's visual pass added these, also fixed:

- no empty tag line on a phone;
- the trigger question's own field, and its sheet sliding back down;
- the tag offer opening downward;
- sheets held to the visual viewport, so they stand on the keyboard;
- settings' menu foot, and Save measured with the fields;
- dark's beige lifted.
