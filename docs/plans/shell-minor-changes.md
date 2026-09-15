# Shell: a round of minor changes after use

**Date**: 2026-09-15
**Status**: In progress <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/shell.md`, `docs/specs/core.md`, `docs/specs/http-v1.md`
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

---

## Tasks

1. Core and wire
   - [x] Branch `agent/shell-minor-changes` _(2026-09-15)_
   - [ ] `cancelDelivery` lets a record whose target is the user through whatever its state
   - [ ] `RoutingSummary` gains `templates`: the distinct templates whose records stand
   - [ ] openapi, client types, integration tests
   - [ ] `core.md`, `http-v1.md` amended; commit
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

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
