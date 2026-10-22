# A routing record is one line until it is opened

**Date**: 2026-10-22
**Status**: Done
**Spec**: `docs/specs/shell.md`
**Closed**: 2026-10-22

---

## Goal

On an item's page and in the log, every routing record is drawn as one line. The line reads destination / place and what was done, and nothing about the record is read from the pool until the line is opened. A pending record keeps `cancel` on that line. Opening it shows the block as it is drawn today, and the record's own address still draws the block open.

---

## Decisions already made

These were settled when the pitch was accepted (2026-10-22). They are not open questions.

- **One component, two surfaces.** The item page (`apps/ui/src/components/item/Item.svelte:167`) and the log (`apps/ui/src/components/log/LogRow.svelte:172`) both draw the folded form of `Block`. `/items/{id}/records/{recordId}` draws it open.
- **Always folded for now.** No default opening, no remembered state. The developer will try it and decide later.
- **The folded line offers `cancel` and nothing else.** `undo` and `arguments` are reached once the block is open.
- **In the log, the row is the line.** A routing kind's body reads `excerpt → destination / place`, and the block no longer sits under it. Opening the line shows the block. The excerpt stays the way to the item, and that link needs no change.
- **The folded line reads destination / place and what was done.** `via <template>` and a manual record's note are left off it and shown once the block is open (2026-10-22, after the sketch).
- **In the log, the folded row's right side says what was done** for `routed`. Failed and cancelled rows keep their fact there.
- **The block drops `item` from its foot in the log.** The excerpt on the row already links to the item, so the foot has nothing left and is not drawn.
- **Nothing is separated with `·`.** The sketch used one, and that was wrong: shell.md has said so since 2026-10-01.
- **Attachment thumbnails appear only when open.**
- **The output is read when the block is opened.** Today it is read as soon as the block is drawn (`apps/ui/src/components/record/Block.svelte:156`). The rule that each output is read once a page stays: a record opened a second time is not asked for again.
- **Out of scope:** the height animation seen when navigating from a log row to the item. It sits in a different place (`following` on the row, `apps/ui/src/components/item/Row.svelte:192`) and its cause is not known yet. It gets its own diagnosis.

---

## Open questions

These were drawn this way in the sketch ([artifact](http://palmdesk:3006/projects/notemap/?f=2026-10-22-1401-collapsed-routing-records/)), and the developer did not object. Phase 1 builds them as drawn.

1. **What a person presses to open the line.** The destination's name is a button with `aria-expanded`, and the rest of the line can be clicked too. This is the settings idiom, where the name in a collapsed template row opens it (`apps/ui/src/components/settings/Template.svelte:155-168`). When open, the block takes the bordered box it has today, and the name in its head folds it again.
2. **`open ↗` on the folded line.** No. It goes with the block, consistent with "only `cancel`". The place on the folded line is text, not a link.

---

## Unknowns

- **The log's failed and cancelled rows.** Folding moves the failure's own words behind the press. The rail already says `delivery failed` in alarm, and the row keeps its fact (the refusal's code) at the right. *Fallback:* if hiding the failure's words reads wrong in use, draw `delivery-failed` open. This is a one-line rule in `LogRow`, not a change to `Block`.
- **The excerpt link next to the button that opens the line.** In the log these sit on one line, and interactive elements must not nest. *Fallback:* if the line cannot be clickable as a whole without nesting, only the destination's name opens it in the log, and the whole line still opens it on the item page.
- **Folded rows in the log that arrived from the watcher (`heard`).** These already follow their own height (`apps/ui/src/components/log/LogRow.svelte:130`), and opening a block inside one adds a second animation that follows height. `following` skips a change when a box inside it is already growing (`growingWithin`, `apps/ui/src/lib/motion.ts`), which should cover this case. *Fallback:* `Unfolding` (`apps/ui/src/components/primitives/motion/Unfolding.svelte`) takes the motion, and the row's `following` leaves it alone.

---

## Tasks

- [x] Create branch `agent/collapsed-routing-records` _(2026-10-22)_

### Phase 1: `Block` folds, and the item page draws it folded

Depends on nothing.

- [x] `shell.md`, *An item has an address*: amend the register paragraph (~1754). Each record row's body is the record as one line, opened in place into the block. On the record's own address it is drawn open. _(2026-10-22)_
- [x] `shell.md`, *Under the head, what was written* (~1778): "looking at the record is the asking" becomes "opening the record is the asking". Date the amendment, and keep the once-a-page rule. _(2026-10-22)_
- [x] `shell.md`, *The foot holds the presses* (~1795): `cancel` is on the folded line as well as in the foot, and `undo` is in the foot only. _(2026-10-22)_
- [x] `Block.svelte`: a folded form drawn from the head's existing values (`destination`, `place`, `did`), plus `cancel` on a pending record. No `via`, and no manual note. No output read, no thumbnails, no `arguments` and no link while folded. Opening it draws the block exactly as it is today. _(2026-10-22)_
- [x] `Item.svelte`: draw records folded, and open where `only` is set. _(2026-10-22)_
- [x] Tests: see *Testing*. _(2026-10-22)_
- [x] Typecheck, lint, `pnpm -r --no-sort --silent test` _(2026-10-22)_
- [-] `git commit` — `feat(ui): an item's routing records are one line until opened` _(dropped — phases 1 and 2 landed as one commit: removing `inLog` touches both surfaces at once)_

**Verify:** `pnpm --filter ui test` is green. On a staged branch (`agent stage agent/collapsed-routing-records`), an item routed three times shows three lines and no frontmatter, and the network panel shows no output request until a line is opened. `/items/{id}/records/{recordId}` shows the block open.

### Phase 2: the log row is the line

Depends on phase 1.

- [x] `shell.md`, *The log* (~2724, ~2756): "A routing kind draws the record" becomes a routing kind's row reading `excerpt → destination / place`, with what was done at the right, and opening into the block. Move the once-a-page read to the opening, and the asking mark to the opened block. Drop "`item` in the block's foot is the way to the capture". _(2026-10-22)_
- [x] `shell.md`, *The foot holds the presses* (~1795): drop "In the log alone the foot also offers `item`". _(2026-10-22)_
- [x] `LogRow.svelte`: for `routed`, `delivery-failed` and `delivery-cancelled`, draw the excerpt with `Block`'s folded line beside it, in place of the excerpt line plus the block. A `routed` row says what was done at the right. Failed and cancelled rows keep their fact. The excerpt shortens before the destination does. _(2026-10-22)_
- [x] `Block.svelte`: remove `inLog` and the `item` press. A foot with nothing in it is not drawn. _(2026-10-22)_
- [x] Tests: see *Testing*. _(2026-10-22)_
- [x] Typecheck, lint, `pnpm -r --no-sort --silent test` _(2026-10-22)_
- [x] `git commit` — `feat(ui): a routing record is one line until it is opened`, phases 1 and 2 together _(2026-10-22)_

**Verify:** the ui tests are green. On staging, `/log` filtered to routing shows one line per row, `excerpt → destination / place`, and pressing the excerpt still goes to the item. Opening a row shows the block with its output.

### Phase 3: close out

Depends on phase 2.

- [x] `docs/todo.md`: remove the two *Shell — layout and interaction* lines this closes. _(2026-10-22)_
- [x] `shell.md`: add a `Shipped:` entry dated the day it lands, linking this plan. Bump **Last updated**. _(2026-10-22)_
- [-] `pnpm test:stack`: skip. Nothing here crosses the HTTP surface or the client's transport.
- [x] `git commit` — `docs: close collapsed-routing-records` _(2026-10-22)_

**Verify:** `grep -n "more compact routing record" docs/todo.md` prints nothing.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

`Block.test.ts`:
- Folded is the default, and draws the destination, the place and `did`. `via` and a manual note appear only when open.
- Folded makes no `client.routing.output` call. Opening makes one, and closing then reopening does not make another.
- Folded draws no thumbnails and no `arguments`.
- `cancel` is on a folded pending record. `undo` is absent from a folded manual record and present when it is open.
- Drawn open, it reads the output when drawn, as it does today.

`Item.test.ts`:
- Records are drawn folded.
- With `only`, the one record is drawn open.

`log.test.ts`:
- A `routed` row reads the excerpt and the destination on one line, with no output read until it is opened.
- A `routed` row says what was done at the right, and its opened block has no `item`.
- A `delivery-failed` row keeps its fact in alarm while folded.

Existing tests that assert on output, notes or presses without opening the block need an "open it" step. They should not be deleted.

---

## Notes

The folded line uses `Block`'s own head values rather than `Routing.svelte`'s `wentTo` line. The head already reads the place through `placeIn` (`apps/ui/src/lib/routing.ts:203`) and names the template, so a second composition would only drift from it.

The log never offers `cancel`. A `routed` row is delivered, and failed and cancelled rows carry a `said`, so the folded `cancel` only ever appears on the item page. That is expected, not a gap.

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
