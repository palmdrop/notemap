# One place line everywhere, and `⏎` that never routes

**Date**: 2026-10-16
**Status**: In progress
**Spec**: `docs/specs/shell.md`
**Closed**:

---

## Goal

The template form picks a path with the same typed line the composer uses, and in both the line
and the schema-driven browser `⏎` only takes or completes. Routing happens on `⌘/ctrl+⏎` alone.

---

## Background

Found driving the shell headlessly against a throwaway pool on 2026-10-16.

**The template form.** `TemplateForm.svelte` draws `CandidateBrowser` for every askable field,
path fields included, while the composer draws `PathLine` for them through `browserFor`. On a path
field the browser:

- completes `pro` to `projects` on `⇥`, without the `/`
- opens `projects/` and then filters its children by the line's own text (`projects`), so the
  folder reads `nothing here matches`
- appends what is typed inside a folder to the whole line (`projectsno`)
- never offers `use <folder>`, because a folder entry carries no value for a path field, so a
  folder cannot be picked at all
- writes nothing to the line while folders are clicked through, only when a file is clicked
- shares `id="candidate-entries"` with the `under` browser on the same form

The form's comment says the line was left out because it forecasts create-against-append, which a
pattern cannot answer. The line only forecasts when it is given `said`, so leaving that out is
enough to switch the forecast off.

**`⏎` in the composer.** `⏎` routes from the line unless `↑↓` moved first (shell.md, *The place is
one line you type*). Typing `proj` and pressing `⏎` created a file named `proj`, with no extension,
at the vault root. On the next item, `proj` and `⇥` completed nothing, because `proj` and
`projects/` now both matched, and `⏎` appended that item to the stray file. `ctrl+⏎` also routes,
but only because the line handles `Enter` without checking modifiers. The surface's `route` command
(`whileWriting`) already fires on `⌘/ctrl+⏎` from any field, so the line does not need to commit
anything itself.

---

## Decisions to confirm

- **`⏎` in the line, with no walk:** completes the segment under the caret, the same as `⇥`, and
  does nothing where there is nothing to complete. It never routes.
- **`⇧⏎` (*make a new one beside it*):** it commits too, so it becomes `⌘/ctrl+⇧⏎`.
  *Recommended.* The other option is to keep `⇧⏎`, which leaves an accidental commit one modifier
  away. The beside button's label changes to match.
- **`⏎` in the schema-driven browser, with no walk:** settles what was typed, the same as leaving
  the field, and never commits. The `under` field is where a reflexive `⏎` currently routes
  straight past the heading.
- **The template form's line:** takes no `said` and no remembered `places`, so it draws the tree,
  `⇥`, `↑↓` and taking, with no forecast and no greyed continuation.

---

## Tasks

### Phase 0: branch and todo notes

- [x] Create branch `agent/path-picking-and-enter` _(2026-10-16)_
- [x] `docs/todo.md`: re-point the folder-picking entry at the template form, where its bullets
      were observed, and keep the empty-space bullet, which applies to both forms
- [x] `docs/todo.md`: add *a picker for a destination's root*, worth considering rather than
      planned. It needs something that lists folders before a destination exists, through an
      account for WebDAV or on the daemon's own host for the filesystem kind. Listing the host lets
      any session enumerate its tree, which the container limits to `/var/lib/notemap/vaults` and a
      bare install does not.
- [x] `docs/todo.md`: add the composer findings this plan leaves alone:
  - a half-typed heading in `under` resolves to the heading it prefixes, with nothing said
  - `↑↓` after opening a folder starts at the top of the tree, not inside that folder
  - `append` alone does not read as the action that will be taken
- [x] `git commit` _(2026-10-16)_

### Phase 1: the template form draws the typed line

Depends on nothing.

- [ ] `PathLine` takes the caret only when asked, so a form whose first field is `NAME` keeps it there.
      The composer keeps asking for it.
- [ ] `TemplateForm` picks its control through `browserFor`, without `said` or `places`. Delete the
      comment that justified the browser.
- [ ] Each instance of `CandidateBrowser` and `PathLine` gets its own listbox id (`$props.id()`, as
      `TagSet` does), so two on one form no longer collide
- [ ] Confirm `under` still asks for headings once the line names a note, since its `given` now
      reads from the line
- [ ] shell.md, *Templates* in settings: a path field draws the typed line, without a forecast or
      a remembered continuation. Add a dated amendment note.
- [ ] Tests in `templates.test.ts`:
  - a path field draws the line
  - `⇥` completes a folder with its `/`
  - taking a folder writes it to the line
  - a non-path askable field still draws the browser
- [ ] `git commit`

### Phase 2: `⏎` takes or completes, and only `⌘/ctrl+⏎` routes

Depends on nothing. Independent of phase 1, though the form inherits it once both land.

- [ ] `PathLine`:
  - `⏎` with a walk takes the row
  - `⏎` without one completes as `⇥` does
  - `⏎` with `⌘/ctrl` is left alone so the surface's `route` command fires
  - `⇧⏎` per the decision above
- [ ] `CandidateBrowser`:
  - `⏎` with a walk opens or takes the row
  - `⏎` without one settles
  - `⏎` with `⌘/ctrl` is left alone
- [ ] Remove `onsubmit` from `BrowserProps` and both controls if nothing commits through it any
      more. If beside still does, keep it for that alone.
- [ ] The beside button's label names the new chord
- [ ] shell.md, as amendments with today's date:
  - *The keyboard on the surface* (already says `⌘/ctrl+⏎`, so check it still holds)
  - *The place is one line you type*: `⏎, left alone, routes`, and the `⇧⏎` paragraph
  - the browser paragraph: `⏎ … committing where the walk has not moved`
  - ADR 31 names `⇧⏎`. Add a superseding note if the chord changes; do not edit the decision.
- [ ] Tests:
  - `PathLine.test.ts`: `⏎` on a partial name completes it and never calls submit, and `⏎` with
    nothing to complete does nothing
  - `composer.test.ts` / `Process.test.ts`: `⌘/ctrl+⏎` from the line and from `under` routes, and a
    bare `⏎` from either does not
- [ ] `git commit`

### Phase 3: verify

Depends on phases 1 and 2.

- [ ] `pnpm typecheck`, `pnpm -r --no-sort --silent test`, `pnpm lint`
- [ ] Re-run the headless scenarios against a throwaway pool:
  - `proj` + `⏎` completes to `projects/` and writes nothing to the vault
  - `⌘/ctrl+⏎` routes
  - in the template form, `pro` `⇥` `no` `⇥` gives `projects/notemap/`, and clicking folders
    writes the line
- [ ] `git commit` any fixes

---

## Unknowns

- **Pattern segments in the line.** A template's place holds `{{item}}.md` or `{{date}}/`, and the
  line asks for candidates once per segment, so it will ask about a scope named `{{date}}`. The
  spec treats a scope that answers nothing as a folder still being typed, and only the root's
  refusal is drawn, so this should be quiet. If an adapter refuses such a scope noisily, or the
  tree draws `+` rows for it, fall back to not asking past the first segment that holds `{{`.
- **`⌘/ctrl+⏎` reaching the surface.** The command is published with `whileWriting`, but the line
  calls `preventDefault` on every `Enter` today. Whether leaving the modified press alone is
  enough, or the window handler also checks `defaultPrevented`, is found out in phase 2. The test
  above covers it either way.
- **A form-level `⏎`.** The template form is a `<form>`. Once the controls stop handling a bare
  `⏎` in every case, check that a press with nothing to complete does not submit or save it.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
