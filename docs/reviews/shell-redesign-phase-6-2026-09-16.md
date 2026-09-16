# Review: Shell redesign, phase 6 — settings

**Date**: 2026-09-16
**Status**: Partially addressed
**Scope**: `apps/ui/src/components/settings/`, `apps/ui/src/routes/settings/`, `apps/ui/src/lib/breakpoint.ts`, `packages/client/src/pool/reachability.ts`, `docs/specs/shell.md` (Settings)
**Plan**: `docs/plans/shell-redesign.md` (phase 6)
**Spec**: `docs/specs/shell.md`

---

## Overall

The surface matches the drawing: register grid, menu on the rail, five routes with a wide
redirect and a phone menu, facts grid, words for marks, hidden disabled, the ask in the actions
line, version carried on the mark. Typecheck, tests and lint are green on `agent/shell-redesign-6`.
The `Shipped:` entry and the retired prior decision are in place.

Two things stand out. Moving the forms' labels from `<label>` to `<span>` on the facts grid
opened a hole in the row's click-to-open: a click on a label or the whitespace of an in-place form
now collapses the row and throws the edit away (1). And the spec rewrite deleted a page of
template-form behaviour that is still built and still tested, leaving the spec saying less than
the code does (3). Template deletion is in a three-way disagreement between plan, spec and code (2).

---

## Bugs

### 1. A click on a form's label or gap collapses the row and discards the edit

`apps/ui/src/components/settings/Destination.svelte:112` and `Template.svelte:100` — the row's
wrapper takes `onclick={pickable(onopen)}` and renders `children` (the in-place form) inside it.
`pickable` only yields to `a, button, input, textarea, select, label, [role='button']`. On `main`
the form's fields were wrapped in `<label>` blocks, which shielded them; on the facts grid the
labels are `<span>`s, and the description `<p>`, the unfamiliar-root warning, the `route/` prefix,
the folder-mode notes and the grid's gaps are all plain elements.

```
click "NAME" span in the edit form → not inside() → onopen()
  → Destinations.svelte: opened = undefined; editing = undefined
  → form unmounts, typed values gone
```

Same for the ask line: a click on `Delete Vault?` closes the row.

Fix: stop the row's pick at the form and the ask — wrap `children` and the ask in an element with
`onclick={(e) => e.stopPropagation()}`, or teach `pickable` that a click inside a `form` is the
form's.

---

## Design

### 2. Template deletion: plan, spec and code say three different things

`apps/ui/src/components/settings/Templates.svelte:151` — a `role="dialog"` block with a sentence
(*Records made from it keep resolving; its tag stops filing anything.*) and `delete anyway`, drawn
after the whole list. The plan's decision says *a template asks the same way* as a destination —
in the actions line, in alarm, no sentence. The spec's former line, *Deleting a template asks
nothing and refuses nothing*, was deleted in this PR and nothing replaced it, so the spec is now
silent. The task note says this was flagged and left, but leaving it made the docs disagree with
each other rather than with the code. Pick one — the plan's line-ask is the smallest change and is
what the drawing (`settings.html:164`) implies — and land doc and code together.

### 3. The spec rewrite dropped behaviour that is still built

`docs/specs/shell.md`, `Templates` — reduced to *unchanged in what it draws and how it asks*.
Gone with it: the place read off the arguments; patterns not expanded on this page; the arguments
form built from `argumentsSchema` with refusals drawn on the field; a fixed field chosen not typed;
the lasting (`durable`) name read back as its label; the schema-driven browser for an askable field
and why not the kind's own control; the folder mode only where the capability has folders, chosen
with a line each; editing draws the form alone; per-row report asking; the folder check reading
the literal prefix; *unreachable is not an alarm*. All of that is in `TemplateForm.svelte` and
`Template.svelte` and covered by ~25 tests in `templates.test.ts`. The project rule is that docs
and code agree; a behaviour the spec no longer states is one the next rewrite is free to drop.
Restore these — condensed is fine — under `Templates`, or move them to a section of their own.

### 4. Section heads lost their heading semantics

`apps/ui/src/components/settings/Section.svelte:35` — `<section><h2>` became `<div><span>`. The
five sections and the two sub-heads are now unreachable by heading navigation and no longer form
landmarks. Nothing in the drawing needs that: an `h2` (`h3` for `sub`) with the same classes
draws identically.

---

## Minor

### 5. The pool's refusal says `retire` beside a button that says `disable`

`Destination.svelte:150` — the refusal line is the pool's text verbatim (`…retire it instead`,
per `Destinations.test.ts:514`), and `disable instead` sits beside it. The phase's word decision
leaks at exactly the moment it matters. Either substitute the wire's word in the line or say in
the spec that a refusal is quoted as the pool said it.

### 6. A destination disabled this session still reads `available`

`Destination.svelte:85` — `status` lets a held probe win over `disabled`. A destination probed
`ready` and then disabled keeps `probed`, so when the list's `show` reveals it the word is
`available`. Let `disabled` win, or drop `probed`/`described` on `retire`.

### 7. `narrow()` and the CSS breakpoint can flip at different widths

`apps/ui/src/lib/breakpoint.ts:6` — `44 * 16` assumes the browser's default font is 16px; `rem`
in a media query follows the user's default, which is settable. At a non-default size there is a
band where the script redirects and the CSS draws the other layout. Harmless as built (the section
page still draws `← settings` when CSS thinks it is narrow), but the comment claims the two are
the same value and they are not. `matchMedia("(max-width: 44rem)")` would make them one thing.

### 8. Two tests the plan named are missing

`Destinations.test.ts` — the plan lists *`keep` turns it back* and *the edit form replaces the
actions and `cancel` restores them*. Neither is there; the existing test stops at the refusal.

### 9. `text-ink` is a no-op now

`DestinationForm.svelte:209` — the span was contrast against muted ink, which no longer exists.

### 10. Inline `import("svelte").Snippet`

`Destination.svelte:41`, `Template.svelte:44` — pre-existing, but `Section.svelte` in the same
folder imports the type; match it.

---

## Non-issues

- **`/settings` redirect in `onMount` rather than a `+page.ts`** — `ssr = false` for the whole
  app, so there is no server hop to lose and `window.innerWidth` is available where the decision is
  made.
- **Menu's bottom rule under the last item** — the drawing rules every item (`settings.html:79`).
- **`version` carried forward on an ordinary answer** — deliberate, tested in `pool.test.ts`; the
  probe is the only thing that reads `/v1/health`.
- **`api / reference ↗` as two grid cells** — that is how the drawing draws `API reference ↗`.
- **Shots not re-taken** — `notemap-shoot-app` does not visit `/settings`; called out in the plan.

---

## Resolution

1. **Fixed.** The row's pick is a no-op while its form or its ask is open (`Destination.svelte`
   `pick()`, `Template.svelte` `pick()`): a row closes through `cancel`, `save`, `keep`, or by
   opening another row. Tests added for the held form, the held ask, and `cancel`/`keep`
   restoring the actions — which also covers finding 8.
9. **Fixed.** `text-ink` dropped.
10. **Fixed.** `import type { Snippet }` in both rows.

Also on the developer's look, outside the numbered findings: the opened row is a box; a field's
`description` is not drawn; the blank enum option is named `default (<value>)`; `sign out` and
`revoke` sit at the row's right. Spec amended with each.
