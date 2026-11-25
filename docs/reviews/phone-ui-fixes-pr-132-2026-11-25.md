# Review: Phone UI fixes (PR #132)

**Date**: 2026-11-25
**Status**: Resolved
**Scope**: `git diff origin/main...origin/agent/phone-ui-fixes` — `apps/ui/src/components/{item/Row,capture/Capture,tags/FilterPanel,queue/Queue,settings/Appearance,primitives/controls/TagSet,primitives/register/Body}.svelte`, `apps/ui/src/lib/{swiped,hand}.svelte.ts`, `apps/ui/src/routes/+layout.svelte`, `apps/ui/src/styles/utilities.css`, tests, `docs/specs/shell.md`
**Plan**: `docs/plans/phone-ui-fixes.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

The PR does what the plan asks, and the spec moves with the code. Typecheck, lint and
`pnpm -r --no-sort --silent test` all exit 0. The most important finding is #1: `f` on a fresh
page load opens the filter panel without the caret on Find a tag. The new test that should catch
this passes only because the test before it happens to install the modality listeners. The second
is #3, a design call for the developer. The caret is now gated on "last input was a key", not on
"this is a phone", so a desktop mouse click on Filter no longer puts the caret in the line either.
The swipe handling in `Row.svelte` is sound on the paths the brief asked about: vertical scroll,
tap-through, cancel and click-through. The one leak is #2.

---

## Bugs

### 1. The first `f` of a page load does not focus Find a tag

`apps/ui/src/components/tags/FilterPanel.svelte:218`, `apps/ui/src/lib/modality.svelte.ts:11`. The
`modality` getter installs its `keydown`/`pointerdown` listeners on its first read. The only other
readers are `Row.svelte:507` and `Index.svelte:153`, and both short-circuit unless rows are being
marked. On an ordinary page load nothing reads `modality.keys` before `show()` does:

```
load → press f → keydown seen by nobody → show() reads modality.keys
  → listeners installed now, keys = false → line not focused
```

The second `f` works. Run alone, the PR's own test fails:
`pnpm exec vitest run src/components/tags/tags.test.ts -t "opened by f"` reports that
`document.activeElement` is not the combobox. It passes in the full file only because the "opened
by a tap" test runs first and installs the listeners.

Fix: install the listeners eagerly, at module load or from the layout, rather than on first read. A
test that runs on its own will hold that in place.

### 2. An open shelf outlives the gesture that should have closed it

`apps/ui/src/components/item/Row.svelte:248-252`, `apps/ui/src/lib/swiped.svelte.ts`. `swiped.id`
is cleared only by a tap on the row, a scroll, another row's pointerdown, or a shelf button. Two
paths leave it set:

- **Holding an open row.** The hold selects the row and starts marking. `swipes` goes false, so
  the shelf disappears, but `swiped.id` stays set and the window scroll listener stays attached.
  If nothing scrolls before marking ends with ×, the row comes back open on Manual and Discard.
- **Leaving through the +, the menu or the header.** None of them touches a row. If the
  navigation does not scroll, the row is drawn open when the person comes back.

Fix: `holdFrom`'s timer shuts `swiped`, and the queue shuts it when it unmounts.

---

## Design

### 3. The caret rule is keyed to the last input, not to the phone

`FilterPanel.svelte:218`; spec, Tagging ("opened by a tap, nothing takes the caret"). The plan and
the spec give one reason: "so a phone keeps its keyboard down". `modality.keys` is false after any
pointer press, including a mouse click. On a wide window, clicking Filter now opens the panel with
no caret, and the person has to click into Find a tag before typing. Before this PR they could type
straight away. This is a desktop behaviour change that the plan never decided. If only phones
should change, gate on the pointer type (touch or pen) or on `!width.wide`, and have the spec say
"a tap on a phone".

### 4. On the capture page the offer will usually open upward, over the words

`styles/utilities.css` `@utility offer`; spec, Tagging. On the capture page the tag line sits at
the foot of the scroller, just above the bar. With the keyboard up, the side above the line is
nearly always the roomier one. `most-height` will then open the offer upward over the field. That
is the behaviour the developer's 2026-11-24 visual pass removed ("the tag offer opening downward").
The spec's parenthetical records the history honestly. It does not say that the objection returns
in this PR's main case. The developer approved the plan, so this may be the intended trade.
Confirm it on the device, and say it in the spec if it stays.

### 5. Without `position-try-order` the phone offer gets no help at all

`TagSet.svelte` (the `scrollIntoView` effect is removed), `utilities.css:142`. The scroll that gave
the offer room below the line was removed for every engine. The replacement sits behind
`@supports (position-try-order: most-height)`. An engine with anchors but no `position-try-order`
falls back to `top: anchor(bottom)`. An engine with neither falls back to `top: 100%`. Either way,
on a phone the offer opens downward with nothing making room for it: under the keyboard, or into
the capture page's inner scroller where it has to be scrolled to. Firefox for Android is the engine
to check. The spec states the new behaviour without a condition. Keep the scroll as the fallback
for engines without `position-try-order`, or have the spec name the degraded case.

### 6. A refused Manual on the phone shelf is a dimmed button with no reason

`Row.svelte:422-437`. The reason lives only in `title`, which a touch screen never shows. On the
queue the reachable refusal is Manual while the pool is out of reach. The shelf stays open and the
tap does nothing. The wide hover boxes show the reason as a tooltip. The item's own bar
(`ItemBar.svelte:119-127`) behaves the same way on a phone, so this is consistent, but nothing
says it. To the brief's question: undo is reachable from both buttons. `$lib/quick` raises `undo`
on the status line, which the queue draws, and the + lifts clear of it. A refusal does not show on
a phone.

---

## Minor

### 7. The widened aside may still be too narrow, and it costs every wide queue row

`primitives/register/Body.svelte:47`. Estimated widths: two icon-only Boxes of about 48px each, a
Route Box of about 95px, and two 4px gaps, about 200px against `w-48` (192px). With
`justify-end`, the overflow spills left toward the words. `<meta name="text-scale">` lets the
user's font size grow "Route", which widens the spill. Check this in a browser. The column is also
held on every wide queue row, hovered or not, so the words lose 96px at every wide width. The spec
says this is deliberate.

### 8. `/capture` on a wide window loses its reading measure

`routes/+layout.svelte:105,222`. `fills` now covers `/capture`, and the layout passes it into
`Column`'s `list`, so the page drops `max-w-measure` and runs the full width of the pane. `/capture`
is reachable when wide by URL, and after PR #131 as the share target of an installed desktop shell.
Holding the bar at the foot when wide is arguably better. The full-width field probably is not.

### 9. Stale comments on `fills`

`primitives/frame/Column.svelte:5` says "`fills` is the process surface". `Sheet.svelte:6` names
only the process surface. Both now cover the capture page as well.

### 10. One long drag from an open shelf can open the route

`Row.svelte:277`. `dx` is clamped above (`SHELF`) and not below. A leftward drag of 256px or more,
starting on an open row, ends at `dx <= -80` and calls `onprocess`. On a 390px screen this is
possible, though unlikely.

### 11. A tap on another row while one stands open opens that row

`Row.svelte:266`. The other row's pointerdown shuts the shelf, and its click then opens the item.
The spec lists tap-on-this-row, scroll and swipe-another as the ways to close and says nothing
about a tap elsewhere. Many swipe-shelf UIs swallow that first tap. Decide which, and say it.

### 12. Test gaps

There is no test that a feed row swiped right does nothing, although the plan's decision "Swipes
right only on the queue" depends on it. Also untested:

- pointercancel mid-swipe;
- a hold on an open row (#2);
- the route underlay turning ink at `ENOUGH`;
- Manual and Discard on a *selected* wide row (the test checks only Route there).

"the + stands on the side of the hand chosen, and nothing else moves" checks only the +.

### 13. Names

`lib/processing.ts` already exports `HAND` (the Manual and Discard pair) and `ByHand`, and
`Row.svelte` has `byHand()`. `lib/hand.svelte.ts` now adds `hand`, `Hand` and `HANDS` for
handedness, so `Row.svelte` and `Queue.svelte` sit one import apart with "hand" meaning two things.
`handedness` or `side` would avoid that. In `Row.svelte`, `lastSeen` and `lastOpened` name the
same mark. The spec and the store say "last opened".

---

## Non-issues

- **`commandsFor` labels Manual "Done"** (`lib/command/item.ts:86`): confirmed. It is unchanged
  from `origin/main`, untouched by this PR, and against CONTEXT.md's _Avoid: done_. Every string
  this PR adds says Manual.
- **Conflict with PR #131**: confirmed only in `docs/specs/shell.md`'s Shipped header
  (`git merge-tree`). `TagSet.svelte`, `Capture.svelte`, `+layout.svelte` and the capture page
  auto-merge.
- **Vertical scroll against horizontal swipe**: `touch-pan-y` leaves the pan to the browser, and
  the `pointercancel` it sends resets `swipe` and the hold. Touch pointers are captured implicitly,
  so `pointerup` reaches the row.
- **A tap after a swipe**: a swipe past the tap slop sends no click. A tap on an open row reopens
  it on `pointerup`, then the capture-phase click shuts it. The net result is closed.
- **Clicks through an open shelf**: `stopPropagation` in the row's capture phase also keeps the
  click from Svelte's delegated root listener, so Rail, Body and Stamp see nothing.
  `preventDefault` stops links. The shelf is a sibling of the row, so its buttons are unaffected.
- **`inert` on the shelf during a drag**: correct. It is interactive only once settled open.
- **The right-translated row making the page scroll sideways**: `Sheet`'s `overflow-x-clip` stops
  it.
- **Keyboard and screen-reader access to swipe actions**: the shelf is gesture-only. The same three
  actions are on the item's bar and on `p` / `m` / `D`. The wide hover boxes carry `sr-only` names.
- **`theme(--breakpoint-wide)` inside `@media` in `@utility`**: it compiles. The build emits
  `@media not all and (width>=900px)`.
- **A fixed, anchored offer and the keyboard**: `app.html` sets
  `interactive-widget=resizes-content`, so the containing block shrinks with the keyboard. The
  phone paths that use the offer have no transformed ancestor. `Sheet`'s `-translate-x-1/2` is
  wide-only.
- **`hand.svelte.ts` reading `localStorage` at module load**: this is the same pattern as
  `theme.svelte.ts`.
- **Shipped trail**: the plan is Done, and `docs/specs/shell.md` has a dated 2026-11-25 Shipped
  entry linking to it.

---

## Resolution

1. Fixed. `modality` listens from module load; a test imports it fresh and presses a key before
   reading. The "opened by f" test passes run alone.
2. Fixed. The hold shuts `swiped`, and the queue shuts it when it unmounts. Both tested.
3. Fixed. The caret is taken when wide, or from the keys; only a phone tapped open leaves it. The
   spec says "on a phone opened by a tap".
4. Kept, by the developer's call. The spec now says the offer covers the words with the keyboard up,
   and that this is what was given up on 2026-11-24, as the price of the line staying in sight.
5. Fixed. Without `position-try-order` the line scrolls to the top as before; tested both ways. The
   spec names the older way.
6. Not changed. The developer holds that Manual should never be refused; whether Manual can be held
   offline is a client change raised with them separately.
7. Fixed. Measured in Chromium: 198px of buttons in 192px. The column is `w-52` (208px); at 125%
   text the buttons take 244px of 260px. On a window wide enough for the full measure the words
   lose nothing.
8. Fixed. The capture page fills but keeps its measure: only the process surface runs the pane's
   width.
9. Fixed.
10. Fixed. From an open row a drag left stops at closed; tested.
11. Decided: the tap only puts the open row back. Tested; the spec says so.
12. Tests added for each listed gap: a feed row swiped right, a cancel midway, a hold on an open
    row, the underlay turning ink, a selected wide row's three buttons. Also a long drag from an
    open row, a tap on another row, and leaving the queue. The hand test still checks only the +.
13. Fixed. The setting is `handedness` (`lib/handedness.svelte.ts`, `Handedness`, `SIDES`); its
    label stays "Hand". `lastSeen` is `isLastOpened`.
