# Review: Collapsed routing records

**Date**: 2026-10-22
**Status**: Resolved — every finding taken in `474e8217` but 3, kept by the developer (the line and the head both name the destination); the pre-existing narrow overflow fixed with them
**Scope**: `agent/collapsed-routing-records` against `main` (34192f3c, b1ccd1c0, 6c3647a2) — `apps/ui/src/components/record/Block.svelte`, `apps/ui/src/components/item/Item.svelte`, `apps/ui/src/components/log/LogRow.svelte`, their tests, `docs/specs/shell.md`, `docs/todo.md`
**Plan**: `docs/plans/collapsed-routing-records.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

The branch does what the plan asks. Every decision the plan records holds in the code: one component on both surfaces, always folded, `cancel` is the only press on the line, no `via`/note/thumbnails/link while folded, the place is text, `item` is gone from the foot, an empty foot is not drawn, and the output is read on opening and once a page. The record's own address draws the block open and it does not fold. The `Shipped:` entry and the acceptance criterion are present, and typecheck, lint and tests are green. One layout bug: below `narrow`, a log row whose place is long drops what was done onto a third line (seen on staging). The main design finding is motion. Wrapping every `Block` in `following` makes the output landing grow on log rows that were not heard and on the record's own address, and two shell.md paragraphs that were not amended say that change stands still.

---

## Bugs

### 1. Below `narrow`, what was done drops onto a line of its own

`apps/ui/src/components/record/Block.svelte:309-347`: with a `lead`, the folded line is `max-narrow:flex-wrap`. Flex wrapping breaks lines on each item's hypothetical main size, which is max-content here: the name/place group is `whitespace-nowrap` with `flex-basis: auto`. When the place is long, the group fills the second line by itself and only then shrinks to truncate. The end group (`did`, or the fact) wraps onto a third line.

```
long place → name/place group's max-content > line → group alone on line 2, truncated → `created` on line 3
```

On staging at 390px, the `Cloud / seeded/0198f0c2-0…` and `Vault / seeded/…` rows read as three lines, and the short-place rows read as two. shell.md (*The log*) says that below `narrow` "they take a line of their own, the record's under them", which means one line for the record. No test covers it, because jsdom does no layout.

Fix: only the lead should wrap. For example, give the name/place group `max-narrow:basis-0 grow`, or put the name/place group and the end group in one non-wrapping flex so the place truncates against `did`.

---

## Design

### 2. `following` on every block contradicts the log's "a read stands still"

`Block.svelte:302` wraps the root in `following` without conditions. Two changes follow that the amended spec does not describe:

- **Log, a row that was not heard**: opening grows line→block, which the spec now names. Then the output read lands a moment later and grows the row a second time. shell.md ~2480 ("On the log only a heard row grows: what a read brought, and what it goes on to fill in, stands still") and ~2797 ("so does all it fills in afterwards, what was sent included") were not amended, and they say the opposite.
- **The record's own address** (`folds={false}`): the block is drawn open on a page read, and the output arriving now grows it. On `main` it stood still, the same as any read-brought change.

The read is caused by the press, so a growth on the log may be the right call. Either way the spec and the code disagree. Decide, then amend those two paragraphs, or attach `following` only where `folds` is true and drop the growth when the output lands.

### 3. `lead` changes more than what is drawn ahead of the line

`Block.svelte:73-77, 304-305, 352-356`: a `lead` decides three things: what precedes the line, whether the line stays when the block opens, and the line's width (`max-w-read` vs full) and the block's top margin. Nothing about a "lead" says the line stays. Two consequences:

- When a log row is open there are two toggle buttons with the same name, both `aria-expanded="true"`: the line's and the head's (confirmed on staging; the test at `Block.test.ts` "with a lead…" asserts 2). A screen-reader user hears the same control twice. Seen with eyes, the line and the head repeat destination / place / what was done one above the other (staging, first routed row opened).
- With a lead, if the record were ever cancellable, `cancel` would be drawn on the line and in the foot together. It cannot fire today, because the log never has a pending record without `said`. It is a trap for the next caller.

A separate prop for "the line stays when open", or drawing the head's name as plain text when the line stays, would make the coupling explicit. The spec text ("the name in the block's head folds it again") was written for the item page, and on the log the line already does that.

---

## Minor

### 4. Test gaps

- `cancel` pressed on the folded line is not tested: neither the success path (`notices`, `onundone` → `records.reread()` on the item) nor a failure, which draws `failed` under the line (`Block.svelte:350-352`), a branch nothing renders. The existing cancel test uses `folds: false`.
- A press on the `Says` link inside the log's line should go to the item without toggling the row. That depends on `pickable`'s control check and is not asserted.
- No test that the line itself does not offer `cancel` in the log (`delivery-failed` with `said`). The "called off" test only checks the opened block.
- Item.test's "draws each record folded" asserts that `[data-folded]` exists and that no output was read. It does not assert that more than one record is folded, and it does not open one.

### 5. A long fact at narrow width has no cap

`LogRow.svelte:131-145`: `max-narrow:max-w-full` resolves against the end group, which is `shrink-0` and sized by its content, so below `narrow` the fact can never truncate. Today's facts (failure codes, tags) are short, so this probably won't fire.

### 6. Comments

- `Block.svelte:300-301`: "The box moves, the content inside it is what is measured…" restates `following`'s own docstring. The thing a reader would ask about, why there is an extra `flow-root` wrapper (so the child margins `mt-2.5`/`mt-1` are inside the measured height), is not said.
- `Block.svelte:316-317`: "Below narrow it has a line of its own" restates `max-narrow:basis-full`. The first sentence earns its place, the second does not.
- `Block.svelte:41-42`: the docblock lists its callers ("Drawn folded on the item and as a routing kind's row in the log…"), and that goes stale the moment a caller changes. The pattern was there before this branch, which kept it.
- `LogRow.svelte:180-182`: `{#if fact !== undefined}` around `{@render factLine()}`, which checks `fact` itself.

### 7. The plan's Goal contradicts its own decision

`docs/plans/collapsed-routing-records.md:12`: the Goal says the line reads "destination / place, what was done and `via <template>`". *Decisions already made* removed `via` from the line, and the code follows the decision. The plan is Done, so the stale sentence is the only record that contradicts the decision.

### 8. Known issue made more visible: `Says`'s rule past an ellipsis

This was already reported. Because the excerpt now gives way first at desktop width too, rows with a long place truncate their excerpt, and the `border-b` running past the `…` shows on ordinary log rows (staging: the `Cloud` and `Vault / seeded/…` rows). The bug is not new. The branch makes it more frequent.

---

## Non-issues

- **`svelte-ignore` a11y on the clickable line**: the keyboard path is the name's `<button aria-expanded>`, and the same idiom is in `Body.svelte` and `Rail.svelte`. The `div` has no role, so the `Says` link and `cancel` inside it are not interactive content nested in interactive content. `pickable` ignores clicks from controls, so pressing the name does not toggle twice.
- **`opened` is not reset when `record` changes**: `Log.svelte` keys rows by `action.id` and `Item.svelte` keys by record id, and the record's address is its own route, which remounts. The reset effect only ever sees a new object for the same record (`records.reread()`).
- **The read-on-open effect and the reset effect**: folded, nothing is read. Closing during a read lets it land and caches it. Reopening draws from the instance state with no second request (tested). A blind manual record is `none` from the start. A failed read cleared by `reread()` retries while open, which is unchanged from `main`.
- **Animation on first draw**: `following` ignores the observer's first callback, so a block drawn open is not grown into.
- **Nested `following` on heard log rows**: `growingWithin` skips the row's own growth once the block's growth is running. If the row's observer happens to run first in the same frame, both animate from the same height to the same height on the same curve. The plan's `Unfolding` fallback remains if this turns out wrong in use.
- **A folded pending record says what was done (`created`) before it is done**: the rail's state word says `pending`, the same as the open head did before.
- **No `cancel` ever on a log line**: `routed` is delivered, and failed or cancelled rows carry `said`. The plan expects this.
- **Non-routing log rows overflow at 390px** (staging: "the whiteboard, before anyone rubb" cut at the edge with no ellipsis): `items-baseline` in the `max-narrow:flex-col` row keeps the span from stretching, so `truncate` has no width. The classes are unchanged from `main`, so the bug predates this branch. Worth its own entry.

---
