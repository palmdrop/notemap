# Review: Shell minor changes after use — `agent/shell-minor-changes`

**Date**: 2026-09-15
**Status**: Resolved — 1–11 and 13 addressed on the branch the same day (the queue foot test now
tells the selected foot from the cells; the preview-place-undefined and the block-`undo` fold cases
in 13 were left); 12 partly.
**Scope**: `packages/core/src/pool/routing/route.ts`, `packages/adapters/store-sqlite/src/mapping.ts`,
`packages/client/src/state/state.ts`, `apps/ui/src/components/{item,record,process,routing,primitives}/`,
`docs/specs/{shell,core,http-v1,client}.md`
**Plan**: `docs/plans/shell-minor-changes.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

**Mergeable after the fixes below.** Five commits on `main`; typecheck, lint and
`pnpm -r --silent test` are green at `4277185`. Core and wire are right: a hand-made mark is
cancelled through the one path, owes the mirror, and the summary's `templates` folds the same
way in sqlite and in the client. Rows, the record block, the composer's read-only place and the
preview head do what the plan says.

The tag chooser is where it falls short. The `moved` guard the plan said to replace is still
there, so the first `↓` — and the first `⇥` once nothing completes — is a dead press (finding 1),
and `controls.test.ts` was edited to assert that dead press rather than catch it. Separately,
the first row is marked with nothing typed, so `+` then `⏎` adds the most-used tag; the plan's
decision says the mark appears "as soon as the line is typed into", and the spec was written to
the code rather than to the decision (finding 2). Both are in one function and one test.

Everything else is polish, plus the `Shipped:` entries, which are present and accurate but not in
the format the four files use.

---

## Bugs

### 1. The first `↓`, and the first `⇥` after completion, do nothing

`apps/ui/src/components/primitives/controls/TagSet.svelte:138-146` — `walk()` still branches on
`moved`, which was written for a panel with nothing marked: the first step *lands* on row 0.
Now row 0 is marked from the start, so the first step lands where the mark already is.

```
open → at=0 marked, moved=false → ↓ → walk(1) → at = 0 (not moved) → moved=true → ↓ → at=1
```

The same after `⇥` completes: the effect at `:106-112` resets `moved`, so the next `⇥` "walks"
to row 0 again and the one after that reaches row 1. `controls.test.ts:210-241` asserts exactly
this — two `⇥` after `rea` to reach `reasoning`, with `reading` still selected between them —
so the test was changed to pass rather than to say what `⇥` should do. The pointer has the same
hole: `onhover` sets `at` (`:272`) without setting `moved`, so hovering row 3 then pressing `↓`
jumps to row 0.

Fix: delete `moved`. `walk` is `at = (at + step + rows.length) % rows.length`. `⇥` tries
`completed()` and walks when it returns `undefined` — that is already the case once the draft
holds the completion, so the guard buys nothing. Rewrite the `⇥` test to reach `reasoning` on
the second press, and add one each for `↓` from a fresh panel landing on row 1 and for hover then
`↓` landing on the row after the hovered one. See finding 2 for what an empty line does.

### 2. `+` then `⏎` adds the most-used tag

`TagSet.svelte:95-104`, `:173-178` — `rows` is `shown` whenever the panel is drawn, `at` is 0,
and `⏎` takes `rows[at]`. With nothing typed that is the pool's most-used tag. Before this
branch `⏎` on an empty line took `""` and closed. The plan's decision reads "the first match is
marked **as soon as the line is typed into**"; `shell.md:1159` says "the moment the panel is
drawn", which is the code, not the decision. A reflex `⏎` after `+` is now a classification the
pool records under the person's name.

Fix: mark nothing while `draft.trim() === ""` — `at` starts at `-1`, `active` is `undefined`,
`⏎` closes the line as before — and let `⇥`/`↓` start the walk from row 0, `↑` from the last.
With finding 1 this is one `walk` with no special cases, and the existing "tab with nothing typed
walks the offer from the top" test stays true as written. Amend the `shell.md` sentence to the
decision's wording. If the developer prefers the mark from the start, say so in the plan's
decisions and leave the spec — but the behaviour deserves a deliberate yes.

---

## Design

### 3. A selected row still moves by one pixel

`apps/ui/src/components/item/Row.svelte:111-128` reserves the foot's 36px on every row and the
selected foot's `border` sits inside `h-9` (border-box), so that half is right. But
`primitives/register/Rail.svelte:44-45` and `Body.svelte:34-35` add `border-t` only when
selected, so the box's head still grows the row by 1px and everything below it settles by that
much. `shell.md:521-523` claims "shifts nothing above or below it".

Fix: draw the top edge on every row and colour it only when selected — `border-t
border-transparent` on both cells, `border-ink` when selected — or say in the spec that the
head's rule is the one pixel that moves.

### 4. The read-only place hides the fields beside the line

`apps/ui/src/components/process/Process.svelte:957-989` — the `placing` branch draws the
`PathLine` and `beside`; the read-only branch draws the line's value alone. A template resolving
to a `heading` or any other non-line argument shows nothing of it until `edit` is pressed. The
commit is unaffected (an untouched template goes as the template), but the person reads a decision
that says less than it does.

Fix: draw `beside` under the read-only line too, as plain `labelled` fields, or as read-only
`name · value` pairs in the same face.

### 5. The preview head re-derives the leaf the forecast already derives

`Process.svelte:257-262` `placeFor` is `forecastOf`'s first three lines
(`apps/ui/src/lib/forecast.ts:43-45`). Two places that must agree on how a blank leaf is named
now exist, and the comment at `:245` promises they are "the same code" — they are the same
functions, called twice. Export a `leafOf(value, said)` from `lib/forecast.ts` and call it from
both.

While there: both derive the name from `item.payload.content`, and a delivery that carries a
rewrite names the file from the rewrite (`packages/output-markdown/src/filename.ts:9`). So with
`words` set and a folder-only line, the head and the forecast name a file the delivery will not
write. Pre-existing for the forecast; the new head repeats it. Pass `carried()`'s content where
there is one.

### 6. `target` is written to the cancelled action and read by nothing

`packages/core/src/pool/routing/route.ts:319` adds `target: record.target.kind` to
`delivery-cancelled`, and the integration test checks it, but `apps/ui/src/lib/action-log.ts:129`
and `LogRow.svelte:105` still word every cancellation as "routing cancelled" / called off. An
undone mark reads in the log and the corner as a cancelled routing. Either read the field —
`mark undone` where `target === "user"` — or drop it and the test line, since core's
`routed` action carries the same `target` already and the record's own kind is a read away.

---

## Minor

### 7. `Shipped:` entries are in the wrong shape, and `Last updated` did not move

`docs/specs/shell.md:5-9`, `core.md:5-7`, `http-v1.md:6-8`, `client.md:5-7` — the four files list
shipments as `- YYYY-MM-DD — **Title.** …` items under `**Shipped**:`; this branch writes a
sentence inline after the colon and leaves the list beneath it. Move each into a first list item
in that form. `**Last updated**` stays at 2026-09-13/14 in all four while every amendment is dated
2026-09-15.

### 8. A comment that argues with the version it replaced

`TagSet.svelte:256-259` — "Absolute rather than in flow: a panel this size still extends the
process surface's scrolling middle" is the old comment's rejected alternative, reversed. The
claim itself is true (an absolutely positioned descendant extends its scroll container's
overflow) and nobody reading `absolute top-full` asks why. Cut it to the mousedown sentence,
which does answer a question.

### 9. The `×` outlives the row

`TagSet.svelte:133-136`, `:203-232` — `chosen` clears on `esc`, on opening the line and on
pressing another tag, which is what `shell.md:1150-1153` says. It does not clear when the row is
deselected or the pointer goes to another row, so a `×` stays drawn on a row nobody is on. The
plan's decision said "leaving" as well. Clear it when `addable` goes false (the row is the only
caller that toggles it), or say in the spec that it stays.

### 10. The inert tag loses its name for a screen reader

`TagSet.svelte:195-201` — the `<button>` carried `aria-label="route/research, routes to
research"`; the `<span>` carries `title` and the text `research`. A reader hears an ordinary
word `research` with no namespace and no reason. Give the span the same `aria-label` and keep
the `title` for the pointer.

### 11. `new · <name>` is offered for a tag the item already carries

`TagSet.svelte:100-103` — `known` is checked against `entries`, which excludes what the item
carries, so typing a carried tag's name draws `new · reading` and `⏎` takes it into
`take()`, which discards it at `:130`. Harmless; check `names` as well and draw nothing.

### 12. Tests that read classes

`Queue.test.ts:614-625` counts `.h-9`; `Block.test.ts:304-323` asserts `divide-y` and the absence
of `.border-t, .border-b`. Both say what the markup is rather than what it does, which is the
house style for layout (`shell-redesign` review, "asserted as the classes that make them") — but
the queue one would pass with the foot slot empty on the selected row too. Assert instead that
the selected row's foot and an unselected row's foot are the same element kind at the same
index, or leave it and accept the coverage is thin.

### 13. Missing cases

- `Process.test.ts` — `edit` pressed, nothing changed, `route`: still commits as the template
  (`requestFor`'s `untouched`). The plan asked for this ("an untouched decision still commits as
  the template") and nothing checks it across the new state.
- `Process.test.ts` — `previewPlace` for a kind without a line whose arguments are empty:
  `placeNamed` answers `undefined` and the head must not read `Vault / undefined`. It cannot
  today (`:254`), but a test pins it.
- `controls.test.ts` — the pointer case (`:353-361`) hovers then presses `⏎`; it does not press
  `↓` after hovering, which is where finding 1 hides.
- `Item.test.ts` / `Block.test.ts` — `undo` on a hand-made record now succeeds at the pool; the
  block's `undo` still only asserts presence. One case that the row leaves the item unprocessed
  after `undo` answers `204` would say the client's `withdrawn` fold is reached from the block.

---

## Non-issues

- **`withdrawWork` on a record that never had a job** — `jobs.ts:329-335` answers `withdrawn`
  when nothing is outstanding, so a hand-made record passes the lease check without one.
- **`releaseTriggerTag` on a user-targeted record** — returns at `fire.ts:149` on `applied ===
  undefined`, which `markProcessed` never sets. No tag is touched.
- **The mirror write on undo** — right: `markProcessed` mirrored the item with the record in it
  (`records.ts:30`), a reservation never is, so only the hand-made path owes one. Integration
  test `routing.test.ts:551-575` drains it and reads the record back empty.
- **`templates` order** — sqlite reads records `ORDER BY at, id` into a `Set`; the client's
  `applied()` appends in record order; both are "distinct, in the order made". The state test
  checks fold against `summarise` for the duplicate case.
- **`divide-y` with conditional children** — Tailwind's rule is `> :not(:last-child)`; Svelte's
  block anchors are not elements, so an absent middle draws one rule and a present one draws two.
  No child uses `hidden`, which is the case that would break it.
- **The overlay panel and the scrolling middle** — the `relative` wrapper is inside the
  process surface's `overflow-auto` div and nothing between them clips, so the panel extends the
  scroll and can be reached. `z-30` clears the next row, which creates no stacking context.
- **The read-only line's `placing` during `take()`** — `release()` and `choose()` set it true,
  `take()` sets it false after `describe` lands, all in one synchronous run after the await, so
  the `PathLine` never flashes.
- **`held` matches the pool's refusal** — `tags.ts:141-161` refuses on `applied.template ===
  template` whatever `firedByTag` says; the shell reads `templates`, which is the same set.

---

## Resolution

<!-- Add once findings are addressed, and flip **Status** above. -->
