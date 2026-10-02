# 55. A path field says which part of the path it holds

**Date**: 2026-10-02
**Status**: Accepted. Amends the path annotation that [core.md](../specs/core.md) settled on
2026-09-07 beside [ADR 36](0036-a-folder-is-created-required-or-established-once.md), and the
browse-control lookup [ADR 26](0026-a-destination-can-be-asked-what-an-argument-could-hold.md)
left keyed by destination kind. Both ADRs otherwise stand.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

`x-notemap-path: true` marks the one field a capability's path is held in, and core reads it as
*a `/`-separated place whose last segment is the leaf*. That is true of `append`'s `path` and
`create-or-append`'s, and false of `create`'s `directory`, whose last segment is a folder and whose
leaf is a second field, `filename`. Two things read the mark as a whole path and go wrong on
`create`:

- **The template report's folder check** drops the last segment as the leaf, so a `create`
  template with `folder = "require"` never checks its deepest folder. The adapters check it at
  delivery; the report says `fits` for a template whose delivery will be rejected.
- **The shell's place** joins every argument with `, ` and cuts at the last `/`, so a pending
  `create` record reads `…/2026, a-rather-l…` rather than `…/a-rather-long-filename.md`.

A third reading leans on the same gap: the shell picks the typed line or the flat browser by
destination kind name, because nothing in a schema says an askable field is `/`-separated.

How does a capability say which part of a path each of its fields holds?

---

## Decision drivers

- **Core holds no list of capabilities.** Whatever is said, the adapter says it in its own schema.
- **The words must be true of the field they are on.** A definition of the mark that `directory`
  does not meet is the bug, not a detail.
- **A record is pending mostly because the destination could not be reached.** Anything that needs
  the destination to answer, to read a pending row, fails exactly when it is needed.
- **The pointer promise** (core.md, amended 2026-10-01: a marked field says the pointer is that
  path) and ADR 36's adapter-side check must hold whatever is chosen.

---

## Considered options

1. **A role on `x-notemap-path`**: `true` the whole path, `"folders"` a field every segment of
   which is a folder, `"leaf"` the segment completing the folders field.
2. **A second annotation, `x-notemap-leaf`**, beside `x-notemap-path: true` on `directory`.
3. **The destination answers the pointer at decision time**, so the shell never composes a place.
4. **The shell joins every argument with `/`**, leaving the schema as it is.

---

## Decision outcome

Chosen: **Option 1**.

`x-notemap-path` takes `true`, `"folders"` or `"leaf"`, and a validator rejects anything else.
Core reads it as one answer: the path is held whole in one field, or split into a folders field
and an optional leaf. Two fields of one role, a whole path beside a split one, or a leaf with no
folders field reads as no path, as two marked fields always have.

The folder check reads the role. Every literal segment of a `"folders"` field is a folder; all but
the last of a whole path are. A segment a `{{` pattern cuts into is not a whole folder in either
role and is not checked.

The shell composes the place by role: the folders and the leaf joined with `/`, a folders field
with no leaf ending in `/` until the pointer says what the file was called, every other field after
`, ` as before.

**The browse control follows the mark.** An askable field carrying any path role is
`/`-separated and draws the typed line; one carrying none draws the flat browser. The lookup keyed
by kind name goes, and `x-notemap-candidates` stays a flag: the shape the todo wanted on it
(`"path" | "flat"`) is what the path role already says.

The pointer promise holds for either role: on a split path the pointer is the folders and the leaf
as they landed. The adapters' own `require` check already looked at the composed note's folder,
the deepest one included, so only the report was wrong.

### Consequences

- **Good**: a `create` template that requires a folder is checked against all of it.
- **Good**: a pending `create` reads as a path, `…/2026/a.md` or `…/2026/`.
- **Good**: a third filesystem-like kind gets the typed line by marking its fields, with no shell
  edit.
- **Bad**: an annotation that has shipped changes meaning for one capability. Greenfield; nothing
  outside this repository reads it.
- **Neutral**: `heading` on `append` still follows after `, `. It is a place inside a note, not a
  segment of the path.

---

## Pros and cons of the options

### Option 1: a role on `x-notemap-path`

- **Good**: one word, and its definition is true of every field carrying it.
- **Good**: says enough for the shell to choose a browse control, which retires the kind lookup.
- **Bad**: a boolean becomes an enum, so every reader of it changes.

### Option 2: `x-notemap-leaf`

- **Good**: `true` keeps its type.
- **Bad**: `directory` would still carry a mark whose definition — a place whose last segment is
  the leaf — is not true of it. The folder check would have to know that a path field beside a
  leaf field means something else.

### Option 3: the destination answers the pointer at decision time

- **Good**: exact. The place is the destination's own word.
- **Bad**: a record is pending mostly because the destination was out of reach, which is exactly
  when it cannot answer. A port change for what is a row's reading.
- **Bad**: answers nothing for the folder check.

### Option 4: join every argument with `/`

- **Good**: no schema change.
- **Bad**: wrong for `append`'s heading and for every kind with fields that are not a path.
- **Bad**: answers nothing for the folder check.

---

## More information

- Plan: [path-roles](../plans/path-roles.md).
- Spec: [core.md](../specs/core.md), [shell.md](../specs/shell.md).
- Todo: *The shell picks a browse control by destination kind name.*

Revisit if a kind needs a path split three ways — a notebook, a section and a page in separate
fields — or an askable `/`-separated field that is not a place. Either needs a role these three
cannot say.
