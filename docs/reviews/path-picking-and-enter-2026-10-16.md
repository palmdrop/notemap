# Review: one place line everywhere, and `⏎` that never routes

**Date**: 2026-10-16
**Status**: Open
**Scope**: `git diff main...agent/path-picking-and-enter`: `apps/ui` (`PathLine`, `CandidateBrowser`, `TemplateForm`, `candidate-browsers.ts`, `Process` comments and tests), `docs/specs/shell.md`, ADR 31, `docs/todo.md`
**Plan**: `docs/plans/path-picking-and-enter.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

The branch matches the plan and has no bugs. `⏎` no longer routes from either control. `⌘/ctrl+⏎`
reaches the surface's `route` exactly once and carries the settled value. The template form draws
the typed line with no forecast. Typecheck, lint and tests are green. The nine new or changed
tests that carry the behaviour all fail when run against `main`'s versions of `PathLine`,
`CandidateBrowser`, `TemplateForm` and `candidate-browsers.ts`, so none of them passes vacuously.
That includes the 50 ms sleep. The open item that matters is the beside button's label (2). The
rest is stale wording the chord change left in other paragraphs and a few test gaps.

---

## Bugs

None.

---

## Design

### 1. Nothing in the template form takes the caret

`apps/ui/src/components/settings/TemplateForm.svelte:327`, `:357`. Both controls now pass
`claims={false}`, and the amended spec says neither takes the caret, "the form's first field being
its name". Nothing focuses `name` either, so opening *add a template* leaves the caret nowhere.
Before this branch it landed in the first askable control. This doesn't break anything, but the
spec's reason implies a focus the form never gives. The developer should decide whether `name`
should take the caret. If it should, that is one `autofocus`-style effect, and the test at
`templates.test.ts:1153` should then assert focus *on* `name` rather than *not on* the place line.

### 2. The beside button's label

`apps/ui/src/components/routing/PathLine.svelte:439`: `⌘/ctrl+⇧⏎ {forecast.beside}`. This is the
only chord the UI shows anywhere, so there is no convention in the shell to follow. The spec spells
the same chord `mod+⏎` in *The keyboard* section (shell.md:1790) and `⌘/ctrl+⏎` in the process
section (shell.md:1244). `docs/todo.md:71` already calls the old, shorter `⇧⏎ todo-1.md`
cryptic, and the new label is longer still and states both platforms on each one. One option is
to show the glyph for the platform the shell is running on (`⌘⇧⏎` or `ctrl+⇧⏎`). Another is a
word (`new todo-1.md`) with the chord in `title`. The developer should choose. Either way, update
todo.md:71 to match.

---

## Minor

### 3. The `commits()` predicate already exists

`apps/ui/src/components/routing/PathLine.svelte:337`. `(event.metaKey || event.ctrlKey) &&
!event.shiftKey` is exactly `commits(event)` in `apps/ui/src/lib/command/keys.ts:37`. But that
function's doc says the field "keeps the press", and here the field gives it up. Either reuse the
function and widen its doc to "the chord that commits from inside a field, whoever handles it", or
leave the duplicate and accept it knowingly.

### 4. Wording left stale by the chord change

- `apps/ui/src/lib/command/dispatch.ts:17` and `docs/specs/shell.md:1809–1810`: "a line that
  committed on `⏎`". No line commits on a bare `⏎` any more. The case that still applies is a line
  that took `⌘/ctrl+⇧⏎`.
- `docs/specs/shell.md:1297`: "which is what `⇧⏎` is for". This was not amended along with
  :1304.
- `docs/specs/shell.md:1304–1305`: "(was `⇧⏎` until 2026-10-16, the one bare `⏎` left that
  committed)". `⇧⏎` is not a bare `⏎`, so the parenthetical misreads. Something like "the last
  `⏎` without `⌘/ctrl` that committed" would be accurate.
- `docs/specs/shell.md:1268` runs well past the column the surrounding paragraph wraps at.

### 5. `⇧⏎` alone is undocumented

`PathLine.svelte:338–350`, `CandidateBrowser.svelte:446–456`. A bare `⇧⏎` now falls through to
the plain-`⏎` path: it takes or completes in the line, and settles in the browser. That is a
reasonable result, but the spec doesn't say so, and `PathLine.test.ts` ("shift-enter alone commits
nothing") only asserts what doesn't happen.

### 6. Two comments explain history rather than the code

`PathLine.svelte:347` ("Never a route: a reflex `⏎` on a half-typed name would make a file of it")
and `CandidateBrowser.svelte:452` describe the behaviour that was removed. Under AGENTS.md that
reasoning belongs in the spec amendment, which already carries it. The `⌘/ctrl+⏎ is the surface's
route` comments just above them answer a real "why here" and should stay.

### 7. Test gaps

- `Process.test.ts:1875`: the 50 ms sleep is not vacuous today. Against `main` the route POST lands
  inside it and the test fails. It is still a timing assertion, though. Asserting the press's
  `defaultPrevented` or the field's value after the bare `⏎`, as `PathLine.test.ts` does, would
  make it deterministic.
- `Process.test.ts:1338–1341`: `not.toContain(route)` runs with no wait, so on its own it proves
  nothing. The `line.value` assertion just before it carries the test.
- No test covers `claims={false}` on `CandidateBrowser` in the form (a non-path askable field). No
  test covers the plan's task "confirm `under` still asks for headings once the line names a note"
  either. That task was checked off with no test behind it.
- `templates.test.ts` "the line holds a pattern, and saves it as typed" also passes on `main`. It
  is a regression guard, not evidence for the change, which is fine as long as it is understood
  that way.

### 8. `docs/todo.md`

`docs/todo.md:64` says the `⏎` entry is "Addressed" but leaves it `[ ]`. Presumably that waits on
the manual test, so tick it once that passes.

---

## Non-issues

- **`⌘/ctrl+⏎` from `CandidateBrowser` routes the settled value.** `settle()` → `took()` →
  `onchange` is synchronous, and Process's `args` assignment is visible to `send()` in the same
  task. The window handler runs after the input's handler as the event bubbles, and `ready` is a
  `$derived` read lazily when `dispatch` calls the publish thunk. `naming` never reaches the
  composer: `BrowserProps` has no `naming`, and only `TemplateForm` passes it, where nothing is
  published on `mod+enter`.
- **No double route.** The line leaves `⌘/ctrl+⏎` unprevented, so `route` fires once.
  `⌘/ctrl+⇧⏎` is `preventDefault`ed, so `dispatch` skips it, and `send()` also returns early while
  `busy`. In the browser, `⌘/ctrl+⇧⏎` settles and goes on to `mod+shift+enter`, which nothing binds.
- **No implicit form submission.** The template `<form>` has no submit button (`Action` defaults to
  `type="button"`) and more than one text input, so HTML's implicit-submission step does nothing,
  with or without a modifier. A bare `⏎` is `preventDefault`ed in both controls in any case.
- **`{{pattern}}` segments are quiet.** Without `said` there is no forecast, so `drawn` is
  `rowsOf(levels, path)` with no pending `+` rows. Only `levels[0]`'s refusal is drawn, and both
  `destination-fs` and `destination-webdav` answer a scope that isn't there with nothing. The only
  cost is one extra candidates request per pattern segment, debounced to one round per 120 ms.
- **`⌘/ctrl+⏎` with a `↑↓` walk routes the typed value, not the walked row.** The old line took the
  row on `ctrl+⏎` only because it ignored modifiers. Routing the typed value matches the spec.
- **`onsubmit` still passed to every `Browser`** (`Process.svelte:972`). `CandidateBrowser` no
  longer declares it, and through `Component<BrowserProps>` the prop is silently dropped. That is
  harmless, and `PathLine` drawn through `browserFor` still needs it for `⌘/ctrl+⇧⏎`.
- **Old fixed ids.** Nothing in `apps/ui` still refers to `path-line-places`, `path-line-place-*`,
  `candidate-entries` or `candidate-*`.
- **ADR 31's inline dated annotation** rather than a superseding note. The ADR decides which
  capability is stored. The chord is incidental to that decision, and the annotation leaves the
  original wording intact.
- **`Shipped:` trail.** The plan is Done, and shell.md has the matching 2026-10-16 entry.

---

## Resolution

## Resolution

2026-10-16, on the same branch. (1) The form now focuses `name`. (2) The beside button is gone, and
`⌘/ctrl+⇧⏎` writes the free name into the line instead of committing. (3)–(8) are fixed as
suggested. (5) is now specified: `⇧⏎` is `⏎`.
