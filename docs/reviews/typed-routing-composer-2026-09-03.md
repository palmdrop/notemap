# Review: A routing composer you can type (PR #40)

**Date**: 2026-09-03
**Status**: Open <!-- Open | Partially addressed | Resolved -->
**Scope**: `git diff origin/main` — 8 commits, `452135a..3b0dfda`
**Plan**: `docs/plans/typed-routing-composer.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`

---

## Overall

The shape is right and it is well tested where it is testable: `path-line.ts`, `forecast.ts`,
`place.ts` and the two adapters carry real evidence, the `Shipped:` trail is complete across all
four specs, and everything passes — `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, and
`pnpm test:stack` (43 tests, 11 files).

Two things need answering before this merges. **ADR 30's stated reason for keeping
`append-to-file` is contradicted by the code it describes** — both adapters create a note that is
not there, and the ADR itself says so three paragraphs above the claim (finding 1). And **the
composer that shipped is not the page `docs/design/README.md` now asserts it agrees with**
(finding 5): the line sits inside a `Group` labelled `Where` beneath another labelled `where`,
`under` is a full step called `Heading`, and two sentence-long schema descriptions sit where the
plan says copy is "a word or a mark, never a sentence". Phase 8 is the phase that was supposed to
catch exactly this, and its own README says the two now agree.

Beneath those, one real correctness bug in the forecast (2), one in the ghost (3), and the line
nobody can type into without reaching for the mouse first (4).

---

## Bugs

### 1. `append-to-file` does not require the note to exist, and the ADR is built on saying it does

`docs/adr/0030-...md`, `docs/specs/core.md:850` — the ADR's *Decision outcome* keeps
`append-to-file` on this ground:

> `append-to-file` is the only way to say *this must already exist*, which is what a rule aimed at
> a daily note wants: silently making `2026-09-02.md` in the wrong vault is worse than failing.

It does not say that. `packages/adapters/destination-fs/src/destination.ts:264` and
`packages/adapters/destination-webdav/src/notes.ts:158` both create the note when `existing ===
undefined`, and the webdav docstring at `notes.ts:113` states it as the intended behaviour: "A note
that is not there is written". The ADR's own *Decision drivers* section says it too — "it already
makes exactly this call — `append-to-file` creates a note that is not there" — so the document
contradicts itself within a page. `docs/specs/core.md` then repeats the false version in the new
*Prior decisions* entry and in the `Shipped:` line ("*this must already exist* are promises a rule
can want").

```
adapter: append creates a missing note
  → ADR: "append-to-file is the only way to say this must already exist"
  → core.md repeats it as the reason the capability was kept
  → a rule author aimed at a daily note gets silent creation, which the ADR says is worse than failing
```

The consequence is not cosmetic: it makes `append-to-file` and `create-or-append-file`
behaviourally identical on both kinds bar path derivation, which weakens the case for the third
capability rather than strengthening it. The honest differences are the trailing-slash derivation
and the name.

Fix: decide which is true and land both halves together. Either the ADR loses that paragraph and
`create-file` alone carries the "three different promises" argument, or `append-to-file` gains the
refusal the doc claims for it — in both adapters, with a test each.

### 2. The forecast claims folders are missing when the level simply has not answered

`apps/ui/src/lib/forecast.ts:46` — `making` reads an unanswered level as an empty listing:

```ts
const making = segments.filter(
  (segment, depth) =>
    !(levels[depth]?.entries ?? []).some(...),
);
```

`levels[depth]` is `undefined` while a scope is in flight, and `{ scope, refusal }` when that one
level was refused. Both collapse to `[]`, so every segment past the first is reported as a folder
about to be made, `making.length > 0` forces `holding` to `undefined`, and the word is `create`
even where the note is plainly there.

```
root answers, "projects" is still in flight
  → making = ["projects", "notemap"]  → "+ projects/ + notemap/" in the accent
  → holding = undefined → taken = [] → word = "create"
  → the answer arrives 120ms later and the whole row changes
```

This is the opposite of the rule `marked`/`absent` follows deliberately in the same slice — "past
the last level that answered there is no evidence, and no claim is made"
(`path-line.ts:221-239`), which has a test for exactly this case. The forecast should hold the
same line. `forecastOf`'s only guard is `levels[0]?.entries === undefined`, which catches nothing
below the root.

Fix: treat an unanswered or refused level the way `absent` does — stop at the deepest level that
answered and forecast nothing past it, rather than reading silence as absence.

### 3. `→` takes a remembered continuation that can name a different file

`apps/ui/src/lib/path-line.ts:247` — `ghostFor` matches case-insensitively but slices the
remembered value by the *typed* length, so the typed prefix keeps its own casing and the tail keeps
the remembered one:

```
typed "Proj", remembered "projects/notemap/notes/"
  → ghost = "ects/notemap/notes/"
  → PathLine.svelte:246  onchange(value + ghost)
  → "Projects/notemap/notes/", which is not the folder that was routed to 41 times
```

On a case-sensitive vault that is a new folder made beside the real one; the ghost's whole purpose
is to be taken without reading. `completionOf` gets this right — `⇥` replaces what was typed rather
than appending to it.

Fix: `→` should replace the line with `best.value`, not append the tail to what was typed.

### 4. Nothing focuses the line, so the composer you can type needs a click first

`apps/ui/src/components/primitives/composer/Modal.svelte:19` focuses the panel, not a control.
Neither `DestinationLine`'s input nor `PathLine`'s is autofocused, and no handoff happens at either
transition:

- Open the composer → focus is on the modal panel. `obs` goes nowhere.
- Type a destination name and press `⏎` → `choose()` runs, `DestinationLine` unmounts, `PathLine`
  mounts, focus falls to `<body>`.
- `⌫` at the head of an empty line → `release()` runs, `PathLine` unmounts, focus falls to
  `<body>`, and the destination cannot be re-typed.

`PathLine` even exports `focus()` (`PathLine.svelte:113`) for this, and nothing calls it — a
consumer would need an instance binding, which `browserFor` returning `Component<BrowserProps>`
makes impossible. It is dead code standing in for the wiring that is missing.

Fix: focus the destination line when the composer opens and when `release()` fires, and the path
line when a destination is taken.

---

## Design

### 5. The shipped composer is not the page the README says it agrees with

`docs/design/README.md:20` now asserts "**These agree with the code as of 2026-09-02**", and lists
only two corrections made to `composer.html`. Several visible disagreements survive, all on the
code's side:

| `composer.html` | what ships |
|---|---|
| the line sits bare under the subject | inside `Group name="Where"` (`capabilities.ts:34`), directly under `Group name="where"` — **two adjacent group labels differing only in case** |
| `under`, as a `labelled` row beside `tags` | `Group name="Heading"`, a full step, with a `Labelled` `tags` row after it |
| no prose in the modal | two sentence-long schema `description`s rendered at `RoutingComposer.svelte:225` |
| `⏎ route · ⇥ complete · ⌫ up · esc` in the commit row | no key hints anywhere |
| the tree draws `+ drafts/` and `+ picker.md` inline (`node made`) | folders to be made appear only in the status row; the tree draws answered entries alone |

The plan is explicit that "**the page wins** — it is the thing an implementation is compared
against", and phase 8's task was to check the two and correct one or the other. The two `where`
labels and the two descriptions also read against phase 3's own rule that copy is "a word or a
mark, never a sentence".

The `heading` field being a step rather than a row is the one with a cause worth naming: it falls
out of `RoutingComposer` rendering one `Group` per schema field, so any second field on a
line-driven capability becomes a step. That is the thing to change, not the label.

### 6. The design's `where` case cannot be produced by the code

`docs/design/composer.html:47` draws `1 match` beneath the single matching destination.
`DestinationLine.svelte:83` shows that line only when `matching.length > 1`, so with one match
nothing is drawn, and with three it says `3 match`. This line was edited *in this branch* (from
"two do not match"), so it is a fresh disagreement rather than an inherited one.

### 7. Tags in the composer are not filtered as you type

Phase 4's first task — "the pool's tags in use as spaced words, **filtered as you type**, free
entry beside them" — is checked off, and `ComposerTags.svelte` has no filter. `draft` feeds only
`add()`; `shown` is `applied` plus every offered name regardless of what is typed. Everything else
in the phase landed. Either implement it or uncheck it and say why it was dropped.

### 8. The path line's overlay does not scroll with the input

`PathLine.svelte:301` draws the visible text in an `absolute inset-0 overflow-hidden` div beneath a
transparent input. Once a path is longer than the box, the input scrolls horizontally and the
overlay does not — the caret ends up over text that is not the text under it. Deep vault paths are
the motivating case for this whole control, so this is not an unlikely state.

### 9. `settles` is decided by comparing component identity against the fallback

`RoutingComposer.svelte:80` — `browserFor(destinationKind) !== CandidateBrowser` asks "is this kind
*not* the default?" to answer "does this kind's control settle the capability?". Two different
questions that happen to have the same answer today; a second specialised browser that does not
settle would silently hide the `do` step. The registry is the right place to say it.

---

## Minor

### 10. A doc comment was orphaned from what it documents

`packages/adapters/store-sqlite/src/pool-store.ts:152` — `REMEMBERED_LIMIT` and `RememberedRow`
were inserted between `/** A position in the store's own units. */` and the `Bound` type it
describes, leaving the comment sitting above the limit.

### 11. `json_extract` builds a JSON path by concatenation

`pool-store.ts:389` — `json_extract(r.arguments, '$.' || ?)`. A field named `my-field` yields
`$.my-field`, which SQLite reads as no match rather than an error, so the route answers "no places"
for a field that has plenty. A field named `a.b` traverses into a nested object. Only simple names
exist today (`path`, `directory`, `filename`, `heading`), so this is latent; quoting the segment
(`'$."' || ? || '"'`) closes it.

### 12. `⇧⏎` on a free name swallows the key

`PathLine.svelte:265` — with no `beside` the branch returns having called `preventDefault()`, so
the keypress does nothing at all. Routing is what the person wanted and it is already what
`create-or-append-file` would do; falling through to `onsubmit?.()` costs nothing.

### 13. `⇧⏎` silently drops a typed heading

`RoutingComposer.svelte:118` — `freshFile` builds `create-file` arguments from the path alone.
`create-file` has no `heading`, so this is inherent, but a heading the person typed disappears
without a word.

### 14. `role="listbox"` holds non-option children

`PathLine.svelte:362` — the listbox contains an `<hr>` separator and the `more than this shows`
`<p>` alongside its `role="option"` children.

### 15. The spec overstates what `⌫` does

`docs/specs/shell.md` — "`⌫` at a segment's head pops the whole level". `PathLine.svelte:280`
additionally requires `selectionStart === value.length`, so it pops only at the end of a line that
ends in a slash; at a segment head mid-line, backspace deletes a character as usual. Either
narrow the sentence or drop the caret condition.

### 16. Nothing in `tests/full-stack` exercises `/remembered`

Phase 5 crosses every layer and names `pnpm test:stack` in its verify step. The suite passes, but
it does not touch the new route or the new capability — the coverage is the daemon's in-process
`app.request` and the client's mock transport. Worth a case, given the phase's own reasoning for
requiring the suite.

### 17. Untagging in the composer is not optimistic, tagging is

`ComposerTags.svelte:39` — `toggle` removes from `taken`, but a name that came from `names` stays
in `applied` until the pool reads back, so the button remains pressed after a click that did
something.

### 18. `whenOf` measures days in UTC

`apps/ui/src/lib/when.ts:96` — `startOfDay` floors on the UTC epoch, so "today" and "yesterday" are
UTC days. In a non-UTC zone, something routed an hour ago can read as yesterday. Coarse on purpose,
but the two words this affects are the two exact ones.

---

## Non-issues

- **`create-or-append-file` is first in `capabilitiesFor`** — the ordering changed for every
  filesystem-shaped destination, and nothing picks a capability by index; `RoutingComposer` picks
  by name and `settles` forces it directly.
- **The remembered handler does not validate its query params** — `capability` and `field` fall
  back to `""` rather than answering 400, which is exactly what `destinationCandidatesHandler` does
  one function above. Consistent, and the route is documented as answering "no places" for a
  capability nothing was routed with.
- **Remembered places are empty for any existing pool** — records made before this branch use
  `create-file`/`append-to-file`, and the composer asks about `create-or-append-file`. Greenfield,
  no live users, and the plan is explicit that migrations are not owed.
- **`create-file` and `append-to-file` are unreachable from the composer on a filesystem kind** —
  `settles` hides the `do` step. Deliberate: they are for rules, and `⇧⏎` is the one escape the
  design asks for.
- **`createOrAppendToNote` delegates entirely to `append`** — composing rather than reimplementing
  is what the plan asked for, and `append` already makes missing folders and creates a missing
  note.
- **A synchronous `throw` from `createNote`/`appendToNote` now that they are not `async`** — both
  `carryOut` calls sit inside the `try` in `deliver`, so the outcome is unchanged.
- **The candidates effect re-asks every level on each keystroke** — debounced at 120ms with every
  answer but the newest dropped, which is what the plan specified; the extra asks are cheap
  relative to the race it avoids.

---

## Resolution

<!--
Add once findings are addressed, and flip **Status** above. One numbered entry per finding,
mirroring its number. Mark each: Fixed / Mitigated / Won't fix (reason).
Until this section exists and **Status** is updated, the findings count as open.
-->
