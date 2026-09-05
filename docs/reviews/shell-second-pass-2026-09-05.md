# Review: The shell's second pass

**Date**: 2026-09-05
**Status**: Resolved
**Scope**: `apps/ui/src/`, `docs/design/`, `docs/specs/shell.md` — branch `agent/shell-second-pass` against `main`
**Plan**: `docs/plans/shell-second-pass.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

Every phase in the plan is built, the spec carries a dated `Shipped:` entry for it, and typecheck,
`pnpm -r --silent test` and `pnpm lint` are all green. The row unification is the strongest part of
the change: `FeedRow` was a subset of `QueueRow` and deleting it removed a real fork. The composer's
split, the field ground and the tree's floor all land where the plan said they would.

Three things are wrong in the built behaviour rather than in the design. `copy` is offered on a
connection where it cannot work, which is the finding this review was asked to start from; the note
typed into `where it went` is thrown away when the pool refuses it; and double-clicking to select a
word in a capture's prose now navigates away from the surface. The rest is structural: the composer
hands an index between two components that each recompute the list it indexes, and the new
`Chooser` claims an ARIA shape it does not have.

---

## Bugs

### 1. `copy` is offered where `navigator.clipboard` does not exist

`apps/ui/src/components/item/Actions.svelte:115` and `:148`, and
`apps/ui/src/components/settings/Tokens.svelte:86` and `:127`.

`navigator.clipboard` is only defined in a secure context. Reached over plain HTTP at a LAN
address — the stated way a phone reaches a self-hosted daemon — the property is `undefined`, so:

```
click copy → navigator.clipboard is undefined → TypeError → caught → said = saidBy(TypeError)
```

The row prints a client-side type error under a control that could never have worked. The token
panel is quieter — it swallows the failure and leaves the button reading `Copy` — but it still
offers a gesture that does nothing on that connection.

Fix: check for the capability and do not draw the control without it. Both call sites want the
same one-line predicate, which belongs beside the other `$lib` capability helpers rather than
inlined twice. The token panel keeps its `select-all` string, which is why it can lose the button
without losing the affordance.

This one does not land alone: `shell.md:594–600` states in decided language that `copy` relies on
`navigator.clipboard` and that a deployment without a secure context "cannot copy, and that is a
later change rather than a fallback built now". Hiding the control **is** that later change for the
control, if not for the fallback, and `shell.md:87` says the token is "shown once with a way to copy
it". Both passages change in the same commit as the code.

### 2. The note typed into `where it went` is lost when the pool refuses

`apps/ui/src/components/item/Actions.svelte:86-107`.

```
markDone() → note read → where = undefined → await markProcessed → throws
           → said = "…refused" → the field is gone and so is what was typed
```

The field is cleared before the request rather than after it succeeds, so a refusal leaves the
person the failure and nothing to retry with. Everything else the row does is either replayed from
the outbox or has no typed input behind it; this is the one gesture that can lose work.

Fix: clear `where` in the success path, or restore it in the `catch`. The spec already says the
field is "the only thing the pool is told beyond the fact itself" — losing it is not the row saying
nothing.

### 3. Double-clicking to select a word in a capture navigates away

`apps/ui/src/components/primitives/register/Body.svelte:27`, `apps/ui/src/lib/pick.ts:22-27`.

`doubled()` exempts only the controls in `CONTROLS`. The capture's prose is not a control, so
double-clicking a word in the body — the ordinary way to select one, and the obvious first move
before copying by hand — leaves the surface. The gesture the spec asked for and the gesture the
browser has always had for text collide, and the new one wins.

Fix: ignore the double where it landed in selectable prose, or where `window.getSelection()` comes
back non-empty. The rail, which carries marks rather than prose, is where the gesture reads as
intended and can keep it unqualified.

---

## Design

### 4. `picked` is an index into a list computed twice

`apps/ui/src/components/routing/PathLine.svelte:120` computes `continuing(value, places)`;
`apps/ui/src/components/routing/UsedBefore.svelte:31` computes `continuing(value, places)` again;
`RoutingComposer.svelte` carries the integer between them via `onwalk`/`chosen`.

They agree today because they are the same call on the same inputs. Nothing holds them to it: give
either side a filter the other does not have — a `gone` place dropped from the drawn list, say,
which is exactly the kind of change this pass already made once — and the walk highlights the wrong
row with no test failing, because both components are individually correct.

Either the composer computes the list once and hands the same array to both, or the line reports
the place's `value` rather than its position. The second is cheaper and makes the coupling
impossible to get wrong.

### 5. The line's active option lives outside the listbox it says it controls

`apps/ui/src/components/routing/PathLine.svelte:328-335` and `:376`.

The input carries `aria-controls="path-line-places"` while `aria-activedescendant` names
`used-before-place-N` half the time — an id inside `UsedBefore`'s separate `used-before-places`
listbox. "Two lists the keyboard walks as one" is the right interaction and the honest way to say
it in ARIA is `aria-controls` naming both ids, which the attribute takes as a space-separated list.
As it stands a screen reader is told the active option is somewhere it was told not to look.

### 6. `Chooser`'s panel is a listbox without options

`apps/ui/src/components/primitives/controls/Chooser.svelte:64-77`.

The panel is `role="listbox"`, its children are `Option`, and `Option` renders
`<button aria-pressed>`. A listbox's children have to be options; a button inside one is content a
screen reader may not enumerate at all. `Option` is right for `where`, where it sits in a `Group`
and is a button among buttons — it is the popup that adds the claim the markup does not keep.
Either the panel drops `role="listbox"` and stays a menu of buttons, or `Option` learns to render
as an option where it is one.

Dismissal is the other half: `Chooser` rests on `onfocusout`, while `PathLine` and `UsedBefore`
both take their picks on `onmousedown` with `preventDefault` for exactly this reason. Safari does
not focus a button on click, so the trigger may never hold focus and the panel may never see the
focusout that shuts it. The codebase has an idiom for this already and the new control does not use
it.

### 7. `⇧⏎` builds an event to satisfy a signature

`apps/ui/src/components/capture/CaptureRow.svelte:112-118` calls
`submit(new SubmitEvent("submit"))`. The event is never dispatched, so the `preventDefault()` at
the top of `submit` is a no-op on it, and the object exists only because the handler's parameter is
typed `SubmitEvent`. `form.requestSubmit()` does the real thing, or the commit splits out of the
form handler and both callers reach it directly. The second reads better: the handler becomes
`event.preventDefault(); void commit()`.

---

## Minor

### 8. A dangling doc comment

`apps/ui/src/components/item/Item.test.ts:248-250` — two doc comments stack, and the first ("What a
gesture on this surface is answered with…") described `MARKED` before `BY_HAND` was inserted above
it. It now reads as a second sentence about the wrong constant.

### 9. `unarchive` is the one action with no catch

`apps/ui/src/components/item/Actions.svelte:139` — `void client.unarchive(item.id)` where every
sibling in the file routes its failure into `said`. Carried over verbatim from the deleted
`FeedRow`, so it is not new, but it is now the odd one out in a file where the pattern is
established. A rejection here is an unhandled one.

### 10. `copy` on a picture with no caption says it took something

`client.says` answers `""` for a payload with no text, so `copy` writes an empty string and raises
`copied` naming an excerpt that is not there. The action that exists to say what it took has
nothing to say in that one case.

---

## Non-issues

- **`pending` drawn as a muted aside rather than a state word** — `shell.md:500-507` decides this
  deliberately, and `pending`/`delivered` are the only two states the schema has, so the aside is
  never carrying a failure.
- **The feed's opened row not re-reading its records after a decision** — `routing.route` and
  `markProcessed` both run `processed()` over the client state, which replaces the item; the row's
  `item` prop changes and `recordsOf`'s effect re-runs on it.
- **`done` staying hidden after an `undo`** — `cancel` runs `withdrawn()` with the pool's remaining
  records, which rewrites the summary the `marked` derivation reads.
- **Tags no longer offered before a destination is taken** — the spec's account of the untaken
  composer is "the destination line, the `where` list, the commit", so this is the shape it asks
  for.
- **`ActionGrid` hardcoding three columns** — both lines have at most three cells and the subgrid
  is what makes the words align; a fourth is a change to the design before it is a change to the
  grid.
- **The `Shipped:` trail** — the plan is Done and `shell.md` carries a dated 2026-09-04 entry
  covering it. Nothing missing.

---

## Resolution

Landed on `agent/shell-second-pass` after it was rebased onto the delivery-output-and-preview work.

1. **Fixed.** `$lib/clipboard.ts` answers whether the browser hands over a clipboard at all, and
   both callers draw no copy without one — the row's action line closing up rather than gapping,
   the token panel keeping the selectable string it already had. `shell.md` says so in both places
   it decided otherwise.
2. **Fixed.** The field is put away by the pool's answer rather than by the keystroke, so a refusal
   leaves what was written to retry with. It outlives the request now, so `marking` keeps a second
   `⏎` from being a second decision.
3. **Fixed.** `doubled()` stands down where the double selected a word, which is the browser's own
   gesture on prose and what a person reaching into a capture is doing. `lib/pick.test.ts` is new
   and covers both halves of the module.
4. **Fixed.** The walk names a place by where it sits in `places` — the array both components are
   handed — rather than by where either narrowed it to. Neither has to filter like the other now.
5. **Fixed.** `aria-controls` names both lists.
6. **Fixed.** The panel is a named `group` of marked buttons, which is what it draws, and it
   prevents the pointer's default so choosing survives a browser that gives a clicked button no
   focus. Same idiom as the place line.
7. **Fixed.** `capture()` is the commit and the form handler is two lines around it; no event is
   built to satisfy a signature.
8. **Fixed.** The comment sits back on `MARKED`.
9. **Fixed.** `unarchive` routes its failure into `said` like every sibling.
10. **Fixed.** `copy` is not offered where the capture says nothing, on the same terms as 1.

**Left open, and not a finding above.** The rebase put main's `preview` in the composer's right
column, which is `--spacing-consult` at 17rem — too narrow to read a note in. It is where the spec
puts what is consulted after a decision, so the conflict was resolved by the letter of it; whether
the preview earns the width instead is a design question worth its own change.
