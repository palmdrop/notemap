# Shell: a round of minor changes after use

**Date**: 2026-09-15
**Status**: In progress <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/shell.md`, `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`
**Closed**:

---

## Goal

> Every item on the list below is resolved in the shell, with the two that need the pool — undoing
> a manual mark, and knowing which trigger tag filed an item — settled in core and on the wire.

The list, as written after working a queue with the redesigned shell:

- Queue and feed: selecting a row must not shift the layout; a routed row's line must not wrap
  many times on a long path.
- Composer: a template taken draws its resolved place read-only with `edit`; the trail the line
  names is bold all the way down; templates show no pattern in the band; the preview says the full
  path above the content.
- Routing: a manual record's block draws a doubled rule; undoing a manual mark is refused by the
  pool; `manual` and `discard` notices are drawn as alarms.
- Tagging: the panel has no ground and shifts the flow; it offers everything at once; the match
  `⏎` would take is not marked; `⇥` twice to select; `qu` + `⏎` creates `qu` over `quote`;
  removing a tag is one press; a trigger tag that filed the item flickers off and on; the pointer
  does not mark rows.

## Decisions taken

- **Undo manual**: `cancelDelivery` lets a record whose target is the user through whatever its
  state. No new operation. *(Landed in phase 1.)*
- **Locked trigger tags**: `RoutingSummary.templates` names the distinct templates whose records
  stand, so the row knows without reading records. *(Landed in phase 1.)* The shell draws a trigger
  tag whose template is in `item.routing.templates` as inert, with a title saying why; the spec
  paragraph saying the chooser does not draw it unremovable is reversed.
- **Routing line on a row**: destination name + last path segment — `Obsidian vault · …/2026-09-13.md`
  — with the full place in the element's `title`. Not name-only.
- **New tags**: the first match is marked as soon as the line is typed into; `⏎` takes the marked
  row; a final `new · <typed>` row in the panel is how a name no offer holds is created, and is the
  only row — so marked — when nothing matches. `⇧⏎` is not used.
- **Removing a tag**: press to select it, a `×` appears beside it, press that to remove. `esc`,
  leaving, or pressing another tag deselects.
- **Composer templates**: taking a template draws the destination section as now (template name
  bold, `change`) and the `place` section as one read-only line holding the expanded place, with
  `edit` at the right. `edit` draws the `PathLine` with the resolved value, as taking a destination
  does today. Nothing else about the template flow changes: an untouched decision still commits as
  the template.
- **Notices**: `marked manual` and `discarded` stand (so `undo` does not time out under somebody's
  hands) but are not alarms — `alarm: false`, the fired-template precedent.

---

## Tasks

1. Core and wire _(done 2026-09-15, commit f3b9edd)_
   - [x] Branch `agent/shell-minor-changes`
   - [x] `cancelDelivery` lets a record whose target is the user through whatever its state
   - [x] `RoutingSummary` gains `templates`: the distinct templates whose records stand
   - [x] openapi, client types and state fold, integration and daemon tests
   - [x] `core.md`, `http-v1.md`, `client.md` amended; commit
2. Rows
   - [ ] A constant foot slot under every row, filled by the selected row's actions
   - [ ] Routing line reads name + last segment, full place in the title
   - [ ] Manual record block draws one rule between head and foot
   - [ ] `manual` and `discard` notices stand without the alarm; commit
3. Composer
   - [ ] A template taken draws its place read-only with `edit`; templates show no pattern in the band
   - [ ] The trail the line names is bold down to the note
   - [ ] The preview's head says destination and full path; commit
4. Tagging
   - [ ] Panel is an overlay with a ground; eight most used until typing narrows it
   - [ ] First match marked; `⏎` takes the marked row; `new · name` is the last row; pointer marks
   - [ ] Removing a tag is press then `×`; a trigger tag that filed the item is inert with a title
   - [ ] `shell.md` amended; commit

## Where each task lands

All paths under `apps/ui/src/`. Tests live beside what they test; the ones named exist already.

**2. Rows**

- Foot slot: `components/item/Row.svelte` draws the selected foot as a `col-span-full` `h-9` div
  after the cells. Draw an empty `h-9` spanning div when not selected so the row keeps its height;
  the selected one keeps its border and `Actions`. `components/primitives/register/Rail.svelte`
  and `Body.svelte` need no change. Check `Queue.test.ts`/`Feed.test.ts` for anything counting
  rows by structure.
- Routing line: `lib/routing.ts` `wentTo` builds `said` as `${name} · ${place}`. Add a
  `placeShort`/tail helper (last `/`-segment, prefixed `…/` where the place has more than one) and
  have `wentTo` answer both the short `said` and a `title` carrying the full place; the row's
  `components/item/Routing.svelte` sets `title` on the span/link. `lib/routing.test.ts` covers
  `wentTo`.
- Manual block: `components/record/Block.svelte` — the head has `border-b`, the foot `border-t`;
  with no middle (a manual record with no note) the two rules touch and read as one thick rule.
  Use `divide-y divide-ink` on the container and drop the per-child `border-b`/`border-t` (the
  `failed` and `named` blocks included). `Record.test.ts` / `Block.test.ts` exist.
- Notices: `lib/quick.ts` — `discard` and `manual` both raise with `standing: true`; add
  `alarm: false` to each. `Corner.test.ts` / `notices.svelte.test.ts` — add a case that the two
  are drawn `role="status"` rather than `alert` (`Notice.svelte` picks the role off `alarm ?? standing`).

**3. Composer**

- `components/process/Process.svelte`:
  - Band: `Entry` for templates passes `aside={patternOf(one)}` — drop it, and the now-unused
    `patternOf` import.
  - Template place: a new state `placing: boolean` (or reuse a name that reads well), `false`
    when a template is taken, `true` when a destination is chosen directly or when `edit` is
    pressed. In the `place` section, where `lined && !placing`, draw one line: the expanded
    `args[line.name]` in the shell face with an `edit` button at the right (the same idiom as the
    head's `edit`). Pressing it sets `placing = true` and the `PathLine` takes over with the same
    value. `release()` resets it. `Process.test.ts` has template cases — extend them: taking a
    template draws the place and no combobox; `edit` draws the combobox holding the resolved place.
  - Preview head: `Preview.svelte` takes an optional `place: string` and draws it as the first
    line inside the ruled block, bold, above the `<pre>`, with a rule under it. `Process.svelte`
    computes it from `nameOf(chosen)` + `placeOf(args[LINE_FIELD])` from
    `@notemap/output-markdown/naming` (directory + `filename ?? filenameFrom(content, item.id)`),
    where `lined`; for a kind without the line, `placeNamed(args)` from `lib/routing.ts` as the
    record page does. Say `Obsidian vault / research/2026-09-13.md`.
- Bold trail: `lib/path-line.ts` rows carry `onPath`; `components/routing/PathLine.svelte` does not
  draw it. Give `Walked.svelte` an `along?: boolean` prop drawn `font-semibold` (independent of
  `on`, which is the walk cursor with `aria-selected`) and pass `along={row.onPath || row.made || row.held}`.
  `controls.test.ts`/`PathLine.test.ts` — one case that the trail's rows are bold.

**4. Tagging** — all in `components/primitives/controls/TagSet.svelte`, tests in `controls.test.ts`.

- Overlay: the wrapper `div` around the input becomes `relative`; the panel `absolute top-full left-0 z-30` with `bg-ground`
  (it has it; the in-flow comment about the process surface's scroll goes — an absolute descendant
  still extends a scroll container's overflow, so it is reachable).
- Cap: a `SHOWN = 8` constant; `shown` is `narrowed(entries, draft)` sliced to `SHOWN` while
  `draft.trim() === ""`, the whole narrowed list otherwise. `offered` is already most-used first
  (the pool orders `GET /v1/tags` by count).
- Marking and `⏎`: replace the `moved` guard. The walk index `at` starts at 0 and the row at
  `at` is always marked (`on`) whenever the panel is drawn; `⏎` takes `rows[at]`. Rows are
  `shown` plus, where `draft.trim() !== ""` and no offered name equals it (case-insensitive), a
  last row `{ label: draft, fresh: true }` drawn as `new · <draft>`. Pointer: `Walked` gets an
  `onhover` (`mouseenter`) that sets `at`. `⇥` keeps completing the shared prefix; once nothing
  completes it walks. Update the existing tests that press `⇥` twice or rely on `⏎` creating what
  was typed over a match.
- Removing: a `chosen: string | undefined` state. Pressing a carried tag sets it (or clears it if
  already chosen); a chosen tag is drawn with a `×` button after it (`aria-label="remove <name>"`)
  whose press calls `onremove`. `esc` on the row, opening the line, or pressing another tag
  clears it. The existing "removed by pressing its word" test becomes press then `×`.
- Inert trigger tag: `TagSet` takes `held?: (name: string) => boolean`; a carried tag it answers
  true for is a `<span>` (not a button) with `title="filed the item — cancel the routing to take it off"`
  and the trigger style. `components/item/Tags.svelte` and `components/routing/ComposerTags.svelte`
  pass `held={(name) => { const t = triggeredBy(name); return t !== undefined && (item.routing?.templates ?? []).includes(t.id); }}`
  — `ComposerTags` currently takes `item: string` and `names`; give it the summary too, or the
  `held` function from `Process.svelte`, which has `$held ?? item`.

**Spec** — `docs/specs/shell.md`, amended in place with dated notes, the way the file already does:

- *The row*: the foot slot (the box's foot is always reserved); the routing line's short form.
- *Actions*: `manual`/`discard` notices stand without the alarm.
- *The process surface*: templates band shows names only; a taken template draws its place
  read-only with `edit`; the trail bold; the preview's head line.
- *Tagging*: overlay, eight offered, marked match, `new ·` row, press-then-`×`, pointer marks; the
  paragraph "The chooser does not draw the tag as unremovable" is reversed — it does now, from
  the summary's `templates`.
- *An item has an address* / record block: one rule.
- Add a `Shipped:` entry naming this plan when done.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Run `pnpm typecheck`, `pnpm -r --silent test`, `pnpm lint` before each commit. `pnpm test:stack`
once at the end: phase 1 crossed the layers.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
