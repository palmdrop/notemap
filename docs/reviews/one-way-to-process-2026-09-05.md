# Review: One way out of the queue

**Date**: 2026-09-05
**Status**: Open
**Scope**: `agent/one-way-to-process` vs `main` — `apps/ui/src/`, `docs/specs/shell.md`, `CONTEXT.md`
**Plan**: `docs/plans/one-way-to-process.md`
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`

---

## Overall

The branch does what the plan said: three controls of unclear rank became `process`, the two
answers no destination gives sit in a band below a rule, `discard` acts and is offered back from
the corner, and the composer opens with the pool out of reach. Typecheck, `pnpm -r --silent test`
and `pnpm lint` are all green, and the composer's own suite covers the new behaviour thoroughly —
the keyboard path, the offline path, the disabled reasons, the `esc` step back.

One real defect: a row marked `manual` from the queue now lingers wearing **`routed`**, a word this
same branch spent effort taking away from it. Beyond that the findings are documentation — the
follow-up commit changed two things the spec still describes the old way, which is the one thing
`AGENTS.md` says is not loose.

---

## Bugs

### 1. A row marked `manual` is watched out as `routed`

`apps/ui/src/components/queue/Queue.svelte:118` — `went()` derives the lingering word from the
record's state alone:

```ts
const word = record.state === "delivered" ? "routed" : "retrying";
```

A mark-processed record is *born* delivered — `packages/core/src/pool/routing/records.ts:25`,
"there is nothing to reach, so the record is born delivered" — so every `manual` decision made from
the queue leaves the row saying `routed`.

```
mark() → onrouted(record) → went() → state "delivered" → word "routed"
```

Before this branch `Actions.markDone` passed `went("done")` explicitly, so the word was right.
Worse, the branch decided the opposite everywhere else: `lib/routing.ts:18` and `:35` were changed
*here* to say `manual` for a record naming no destination, and `saidOf` raises `marked processed`
in the corner. So one gesture produces three words, and the one on the row is the false one — it
claims a destination carried the item.

No test caught it: `Queue.test.ts` asserts the corner's `marked processed` but never the word the
row wears afterwards, and `"a routed row is watched out from where it stood"` only exercises a real
destination.

Fix: branch on `record.target.kind` in `went()` — `manual` where the target is the user, the
delivered/retrying pair only where it is a destination — and add the missing assertion.

---

## Design

### 2. The spec says the `manual` commit reads `mark processed`; it reads `done`

`docs/specs/shell.md:439` — "the commit reads `route` for a destination and `mark processed` for
`manual`" — against `ProcessingComposer.svelte:654`, which renders `done`.

The follow-up commit `7204658` made this call deliberately and recorded it in `CONTEXT.md` (`done`
is spent on the gesture, a verb beside `route`) and in the plan's *Followed up* section. The spec
was not amended, so the sentence that names the word is now the one place stating the word that is
not used. Fix: amend that paragraph the way the rest of the file amends itself, dated.

### 3. The spec still describes the deleted `ActionGrid`

`docs/specs/shell.md:702` — "**Two lines on a grid, by what they do** *(2026-09-04)*. One line is
how an item leaves the queue; `copy edit open` is working with the one in front of you… so the
words align down the columns and not merely the boxes" — describes `ActionGrid.svelte`, which this
branch deleted for `ActionLine.svelte`, one flex line.

The same file already says otherwise in two places: the `Shipped:` entry at `:14` ("all four
actions fit one line") and the acceptance criterion at `:1331` ("all of them are drawn on one
line"). The `#### One way out of the queue` section under it also keeps the two-lane language —
"the only control on the **leaving line**", "they are **the other lane**" — which no longer
describes anything on screen. Fix: amend the paragraph and the two phrases in the same pass.

---

## Minor

### 4. The typed line still calls itself a destination line to a screen reader

`apps/ui/src/components/routing/DestinationLine.svelte:80,91` — `aria-label="which destination"` on
the input and `aria-label="destinations"` on the listbox, while the component's own doc comment
three lines up says "the line does not care which is which" and it now carries `manual` and
`discard`. Somebody typing `disc` is answering a question the shell asks as "which destination".
`id="destination-line-matches"` is internal and can stay.

### 5. `standing` names two different things in the notices store

`apps/ui/src/lib/notices.svelte.ts:116` — `let standing = held;` holds *what survives a
supersession*, while `Notice.standing` two dozen lines above means *held until a person clears it*.
Reading `raise` means holding both. `kept` or `left` would cost nothing.

### 6. The ambiguity case the plan called out has no test

`docs/plans/one-way-to-process.md` — "A destination named such that `discard` or `manual` is an
ambiguous prefix. Not a defect… Worth one test so it stays that way." `"an ambiguous prefix takes
nothing"` (`ProcessingComposer.test.ts:746`) uses two real destinations, so nothing holds the
synthetic entries to the same rule.

### 7. A behaviour lost its only test in the move

`Actions.test.ts` dropped `"keeps what was written when the pool refuses the decision"` and
`ProcessingComposer.test.ts` gained no successor. The behaviour survives — `mark()` never clears
`went` — but the note surviving a refusal was worth a test on the row and is worth one in the
composer.

### 8. A one-word line left by the reflow

`docs/specs/client.md:426` — `This` alone on its own line after "cannot route or mark an item
processed."

---

## Non-issues

- **`mark()` setting `busy = false` after `onclose()`** — the `finally` runs against an unmounting
  component, exactly as the pre-existing `send()` does. Harmless in Svelte 5.
- **The feed passes no `ondiscarded`** — the feed keeps every row it holds; only the queue watches
  one out.
- **The item surface passes no `ondiscarded` either** — it draws `client.held(id)`, so an archive
  marks it in place at once.
- **`Chooser` and `ComposerTags` calling `stopPropagation` to beat `Modal`'s `esc`** — `Modal`
  listens on `svelte:window`, which is last in the bubble path, so a handler below it does stop the
  step-back. Tested at `ProcessingComposer.test.ts:1582`.
- **`esc` in the `where it went` field drops the half-typed note and steps back** — the note is
  part of the step being released, unlike a half-typed tag, which is a control of its own.
- **`discard()` reading `item.id` and `aboutItem(item)` before `onclose()`** — deliberate; closing
  unmounts the component and a prop read after that is nobody's. Recorded in the plan.
- **`client.md` touched without a `Shipped:` entry** — a word, not a behaviour, and the plan says
  so; the spec it lists, `shell.md`, has its dated entry.

---

## Resolution

<!-- Findings are open until this section exists and Status is flipped. -->
