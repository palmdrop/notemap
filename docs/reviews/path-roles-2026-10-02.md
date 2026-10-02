# Review: Path roles

**Date**: 2026-10-02
**Status**: Resolved
**Scope**: `main..agent/path-roles` — `packages/core/src/pool/{destinations/vocabulary,templates/report}.ts`, `packages/output-markdown/src/capabilities.ts`, `apps/ui/src/lib/{routing,schema-form,candidate-browsers,templates}.ts`, `apps/ui/src/components/{process/Process,settings/Template}.svelte`
**Plan**: `docs/plans/path-roles.md`
**Spec**: `docs/specs/core.md`, `docs/specs/shell.md`

---

## Overall

The branch does what the plan and ADR 55 say. A `create` template with `folder = "require"` now
checks the deepest folder, a pending `create` reads `…/a.md` or `…/2026/`, and the browse control
follows the field's mark instead of the kind's name. Both specs have a dated `Shipped:` entry
that links the plan. Tests, typecheck, lint and `pnpm test:stack` all pass. The main finding is
that core and the shell each decide what a set of path marks means, and they disagree on
malformed combinations.

---

## Bugs

None.

---

## Design

### 1. The shell and core read the path marks by different rules

`apps/ui/src/lib/routing.ts:51` and `:57` compared with
`packages/core/src/pool/destinations/vocabulary.ts:127`. Core treats a capability as having **no
path** when it marks two fields with one role, a whole path beside a split one, or a leaf with no
folders field. The shell does not follow that rule:

- `splitOf` accepts one `"folders"` field even when a `true` field sits beside it, and core
  rejects that combination.
- `pathed` is true when any field carries any mark. That includes a lone `"leaf"` and every
  combination core reads as pathless.

```
capability marks { path: true, directory: "folders" }
  → core: no path, so no folder check and no pointer-is-a-path promise
  → shell: pathed, split on directory, so it prefers the pointer and composes from directory
```

No shipped adapter does this, so nothing breaks today. But the same definition now lives in two
places with two answers, and the UI cannot import core to share it. Fix: make `readingOf` follow
core's rule exactly (a `pathed` that is false wherever `pathFields` would return `undefined`, and
the same `split`), and add the malformed cases to `routing.test.ts` to match
`vocabulary.test.ts`.

---

## Minor

### 2. Core exports names nothing outside core uses

`packages/core/src/pool/index.ts:19-21`: `pathFields`, `PathFields` and `PathRole` are
re-exported, but only `report.ts` and the core tests use them. The shell has its own `PathRole`.
The plan's task said "whatever the shell or adapters now need", and they need none of these. Drop
the exports or keep them on purpose.

### 3. `settles` asks the control for an answer the field already has

`apps/ui/src/components/process/Process.svelte:205`:
`browserFor(field) !== CandidateBrowser` stands in for "the line field is marked as a path".
`field.path !== undefined` states that directly. As written, which composer settles is coupled to
which component `browserFor` happens to return.

### 4. Stale test name

`apps/ui/src/components/process/Process.test.ts:1044`: "an unregistered kind gets the
schema-driven control". The registry no longer exists, and the case is now a field that carries no
path mark.

### 5. Comment says "which one" when there are now two

`packages/output-markdown/src/capabilities.ts:42`: "The field this is *about* is marked with
`PATH_FIELD` below, so whatever has to check a folder reads which one it is". On `create`, two
fields are now marked, and the reader decides from their roles rather than from a single field.

---

## Non-issues

- **`x-notemap-path: false` is now rejected by the validator.** It was a boolean, so `false` used
  to pass. Nothing declares `false`, and ADR 55 says anything outside the three roles is rejected.
- **`Process.test.ts` swaps `CREATE_OR_APPEND` for `APPEND` in the template-summary test.** The
  fixture's `create-or-append` now carries its path mark, so it would settle. The swap keeps the
  test about choosing between two capabilities.
- **The askable-control snippet no longer checks `destinationKind !== undefined`.** The choice no
  longer depends on the kind.
- **`placeShort("2026/")` returns `2026/` without `…/`.** Nothing comes before it to elide.
- **The report never checks the leaf.** `output-markdown` reduces a filename to one segment
  (`names.ts`), so a leaf cannot hide a folder.
- **`placeNamed` puts the composed path where the first path field appears in `args`.** `joined`
  looks fields up by name, so argument order does not change the path.

---

## Resolution

1. **Fixed.** `readingOf` now uses core's rule. A malformed set of marks is not `pathed` and
   has no `split`. `routing.test.ts` covers the same five malformed cases as
   `vocabulary.test.ts`.
2. **Fixed.** Removed the `pathFields`, `PathFields` and `PathRole` re-exports from core's pool
   index.
3. **Fixed.** `settles` checks `field.path !== undefined`. Removed the `CandidateBrowser` import
   that this left unused.
4. **Fixed.** Renamed the test to "a field marked as no path gets the schema-driven control".
5. **Fixed.** The comment now says the fields are marked, each with its part of the path.
