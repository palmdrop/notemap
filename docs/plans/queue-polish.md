# Queue polish: the held row, the offer, motion and a sticky head

**Date**: 2026-10-01
**Status**: In progress
**Spec**: `docs/specs/shell.md`
**Closed**:

---

## Goal

On the queue and the feed, a tag taken with the mouse keeps the row selected (and held). The
chooser's offer puts trigger tags after the others. Rows and day headings slide in and out
again. The list head stays at the top while the list scrolls, holding `timeline ▾`, `tags ▾` and
the order on its right, with a stuck day heading on its left when reading by day.

Unchanged on purpose: a route a trigger tag made keeps the item off the queue while it waits. The
pool's reservation takes it off, the status line holds the countdown and `cancel`, and the held
row covers looking at it and adding more tags.

---

## Tasks

### Phase 0: branch

- [x] Branch `agent/queue-polish` from `main` _(2026-10-01)_

### Phase 1: a mouse take keeps the row

A row in the tag offer is a `role="option"` that takes on `mousedown`. The `click` after it bubbles
up to the rail or body cell, which counts it as a click on the row and toggles the selection off.
On a trigger tag that releases the held row, so the row disappears.

- [x] `pickable`/`doubled` (`lib/pick.ts`) treat `[role='option']` as a control _(2026-10-01)_
- [x] Test in `lib/pick.test.ts`, and a row-level test: taking a tag from the offer by mouse leaves the row selected
- [x] Commit _(2026-10-01)_

Verify: on the queue, select a row, take a trigger tag with the mouse, and the row stays drawn and selected. The tests are green.

### Phase 2: trigger tags apart in the offer

Depends on nothing.

- [x] While the line is empty the offer is the eight most-used ordinary tags, then a separator line, then every trigger tag (declared or in use), each with its template as now
- [x] Once typed into, there is no separator, the order is the match order, and `new · <name>` stays last
- [x] `↑↓`/`⇥` walk over the separator as if it were absent, and the separator is not an option to assistive technology
- [x] Amend `shell.md` § Tagging (the "eight most used" sentence)
- [x] Tests beside `TagSet`/`offerable`
- [x] Commit _(2026-10-01)_

Verify: open `+` on a row with templates declared and the triggers sit below a rule. Type `r` and the rule is gone.

### Phase 3: motion back on the register

Since 09212f64 (by day), `<Row>` and the index line sit inside `{#if one.kind === "day"} … {:else}`
within the `{#each}`. Svelte 5 transitions are local, so they play only when that `{#if}` branch
changes, not when a list item comes or goes.

- [x] Render the row, the day heading and the index line through a `{@render}` rather than an `{#if}`, which is transparent to local transitions; `|global` was rejected, since it would also play outros on a view switch and on navigation _(2026-10-01)_
- [x] Check queue and feed, both views, by day and rail: a capture slides in, a decision released slides out, a page read or an order turned draws still, and arriving at a surface draws still
- [x] A test that a row added to a mounted register runs its transition (or the nearest observable the test setup allows)
- [x] Commit _(2026-10-01)_

Verify: capture into the queue and the row slides in. Discard a row and `j`, and it slides out. Turning the order moves nothing.

### Phase 4: the head sticks, and the view is a dropdown

Depends on phase 3 only in that both touch `Day.svelte`.

- [ ] `ViewToggle` becomes a `Chooser` (`timeline ▾` / `index ▾`), as `OrderSelector` is
- [ ] The head lays all three controls on the right, in the order `view ▾  tags ▾  order ▾`, with the left side empty
- [ ] The head is sticky at the top, as tall as a day heading, with ground behind its controls only. Spanning the screen when stuck is the same treatment as a day heading's
- [ ] By day, a day heading sticks into the head's left, with a short vertical separator between the date and the controls, and the next day's heading still slides over the last under them
- [ ] Below `narrow`, the heading drops the weekday
- [ ] Whatever clears a stuck heading clears the head too: a row walked to by `j`/`k`, `Day`'s stuck measure, and the panels of `tags ▾`, the order and the view drawn above day headings
- [ ] `v` toggles the view on the queue and the feed (`lib/command/bindings.ts`, published beside `filter`)
- [ ] Amend `shell.md`: the index paragraph (`timeline · index` → a dropdown, `v`), § Tags and a filter (where the control sits), § Rows by day (the heading in the head's bar, no weekday below `narrow`), and the register keyboard paragraph (`v`)
- [ ] Tests: the view chooser and `v` change the view and the URL. Existing `Queue`/`Feed` tests are updated for the chooser
- [ ] Commit

Verify: at 375px and at desktop width, scroll a long queue by day and in rail mode. The head stays put and the dates pass under it. `j` down the list never hides the selected row under the head. Each panel opens over the rows.

---

## Unknowns

- **Width at 375px.** Without the weekday, the bar reads `2026-09-13 | timeline ▾ tags 2 ▾ newest ▾`, which should fit about 343px. If it wraps, drop the year below `narrow` (`09-13`) rather than let the bar grow a line.
- **The look of the slide.** This phase restores the motion the spec already describes (grow with a fade). Whether it should read as sliding down from the top is left to iterating once it is visible again.
- **Separator vs label.** The filter panel sets trigger tags apart under a `templates` label, and the chooser gets a bare rule, as asked. Whether the two should match is for after seeing it.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

`pnpm test:stack` is not needed: nothing here crosses into the HTTP surface or the client's transport.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
