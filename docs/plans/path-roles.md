# Path roles

**Date**: 2026-10-02
**Status**: Done
**Spec**: `docs/specs/core.md`, `docs/specs/shell.md`
**Closed**: 2026-10-02

---

## Goal

> `x-notemap-path` says what part of a path a field holds — `true` the whole path, `"folders"` its
> folders, `"leaf"` its last segment — so a pending `create` record's line reads
> `…/a-rather-long-filename-for-the-day.md` (or `…/2026/` with no filename), and a `require`
> template's folder report checks every folder of a `create`'s `directory`, the deepest included.

---

## Context

Settled in conversation on 2026-10-02:

- **The mark carries a role rather than a flag.** `true` keeps meaning the whole path (`append`'s
  `path`); `"folders"` is a field every segment of which is a folder (`create`'s `directory`);
  `"leaf"` is the segment that completes the folders field (`create`'s `filename`). Adapter-declared,
  core-uninterpreted beyond this, as every other annotation is.
- **The role is on the existing word**, not a new `x-notemap-leaf` beside it: a second word would
  leave `directory` described by a definition — "a `/`-separated place whose last segment is the
  leaf" — that is not true of it.
- **A `create` with no `filename` reads as its folder with a trailing slash**, `…/2026/`, until the
  pointer says what the file was called.
- **`heading` on `append` is out of scope.** It stays after `, ` as it does today.
- **Not chosen:** the destination answering the pointer at decision time. Exact, but a record is
  pending mostly because the destination could not be reached — exactly when it could not answer —
  and it is a port change for what is a row's reading.

What is wrong today, and why this is more than cosmetic: `literalFolders` in
`packages/core/src/pool/templates/report.ts` drops the last segment of the path field as the leaf.
On `create` the marked field is `directory`, whose last segment is a folder, so `folder = "require"`
on a `create` template never checks the deepest folder. The definition fits `append` and not
`create`.

The one place on the shell that composes a place from arguments, `placeNamed` in
`apps/ui/src/lib/routing.ts`, joins every argument with `, ` and `placeShort` then cuts at the last
`/` of the joined string — `…/2026, a-rather-l…`. Its callers: the routing line (`wentTo`), the
record block's head (`Block.svelte`), the composer's place (`Process.svelte`) and the templates
list (`lib/templates.ts`).

---

## Tasks

### Phase 0 — Branch

- [x] Create branch `agent/path-roles` from `main`.

### Phase 1 — The vocabulary and the folder check (core)

Depends on nothing. Leaves every adapter as it is: `true` is still valid.

- [x] Write the ADR: *a path field says which part of the path it holds*. Context: the boolean,
      the `create`/`require` gap, the pending line. Options weighed: a role on `x-notemap-path`; a
      second annotation `x-notemap-leaf`; the destination answering the pointer at decision time;
      the shell joining every argument with `/`. Note that ADR 36's folder check and the
      2026-10-01 amendment to core.md (a marked field promises the pointer is that path) both
      hold for either role.
- [x] `vocabulary.ts`: `PATH_FIELD`'s declared value becomes `true | "folders" | "leaf"` in
      `ANNOTATIONS`, so `schema-ajv` accepts the roles and still rejects anything else. Rewrite
      the doc comment to define each role.
- [x] Replace `pathField` with one answer naming the path's fields by role (the whole field, or
      folders plus an optional leaf). A capability marking two of one role, or a leaf with no
      folders field, has said nothing meaningful and reads as no path, as two marked fields do
      today.
- [x] `report.ts`: the folder check reads the role. Every literal segment of a `"folders"` field
      is a folder; all but the last of a `true` field are. A segment cut by a `{{` pattern is not
      a whole folder in either role and is not checked.
- [x] Re-export from `packages/core/src/pool/index.ts` whatever the shell or adapters now need.
- [x] core.md: amend *A capability says which of its fields is a path* (dated) with the roles, and
      the acceptance line about folder-checking.
- [x] Commit.

**Verify:** a core test, written first and failing on `main`, where a `create`-shaped capability
with `directory: "folders"` and `folder = "require"` reports the deepest folder missing; the
existing folder-report tests pass unchanged for a `true` field; a schema carrying
`x-notemap-path: "leaf"` validates and one carrying `"leaves"` does not. `pnpm -r --silent test`,
typecheck, lint.

### Phase 2 — The markdown capabilities declare roles

Depends on phase 1.

- [x] `packages/output-markdown/src/capabilities.ts`: `create`'s `directory` is `"folders"`, its
      `filename` `"leaf"`. `append` and `create-or-append` keep `path: true`.
- [x] Check that `destination-fs` and `destination-webdav` (both built on these capabilities) need
      nothing else, and that `destination-arena` marks nothing.
- [x] Grep the adapter specs and `docs/standards.md` for the `create` schema's annotations and
      amend any that describe them.
- [x] Commit.

**Verify:** output-markdown, destination-fs and destination-webdav tests pass; the daemon's
`GET /v1/destinations/{id}/description` for a filesystem destination shows the two roles;
`pnpm test:stack` (this crosses the HTTP surface).

### Phase 3 — The shell composes the place by role

Depends on phase 1 for the vocabulary; reads correctly only once phase 2 has landed.

- [x] `schema-form.ts`: a field's `path` becomes its role, or nothing.
- [x] `routing.ts`: `placeNamed` joins the folders field and the leaf with `/`, the leaf absent
      giving the folders with a trailing `/`; every other field still follows after `, `. `pathed`
      means any role is marked. `placeShort` cuts a trailing-slash place to its last folder,
      `…/2026/`, rather than to an empty segment.
- [x] Callers read the composed place unchanged: the routing line, the record block's head, the
      composer's place, the templates list. Check each draws `projects/research/2026/a.md` where
      it drew `projects/research/2026, a.md`.
- [x] shell.md: amend *On a row, a record reads as its destination and the place it landed*
      (dated) with how a place is composed from a path's parts.
- [x] Commit.

**Verify:** `routing.test.ts` covers folders + leaf, folders with no leaf, a whole-path field with
a `heading` after it, and a capability marking nothing; `Routing.test.ts` / `Block.test.ts` draw
the composed place. In a browser against a throwaway daemon, a template-fired pending record on a
filesystem destination reads `→ Vault` / `…/a.md ◰`.

### Phase 4 — The browse control follows the mark (separable)

Depends on phase 1. Closes the todo *The shell picks a browse control by destination kind name*,
whose fix was a shape on `x-notemap-candidates` (`"path" | "flat"`). Path roles already say that: an
askable field carrying `x-notemap-path` is `/`-separated, and one carrying none is flat. Drop this
phase if the ADR should stay about places alone.

- [x] Fold the decision into the phase-1 ADR: an askable field marked with a path role draws the
      typed line, any other the flat browser. `x-notemap-candidates` stays a flag.
- [x] `candidate-browsers.ts`: choose by the field's mark, not the kind's name; the registry
      keyed on `filesystem` / `webdav` goes.
- [x] shell.md: amend where it says which kinds get the typed line. Tick the todo item.
- [x] Commit.

**Verify:** a component test where a made-up kind with a path-marked askable field gets
`PathLine`, and an are.na-shaped field gets `CandidateBrowser`; filesystem and webdav composers
unchanged by eye.

---

## Unknowns

- **Whether the adapter's own `require` check has the same gap as the report.** ADR 36 puts the
  delivery-time check in the adapter. If it also treats `directory`'s last segment as a leaf, fix it
  in phase 2 with a test; if it already checks the whole directory, only the report was wrong.
  *Resolved*: both `destination-fs` and `destination-webdav` check the folder of the composed note,
  the deepest included. Only the report was wrong.
- **Whether a client holds a description across sessions.** shell.md says a description is asked
  once a session; if anything persists one, a stale `true` on `directory` reads as a whole path
  until it is asked again. Greenfield: acceptable, but confirm rather than assume.
  *Resolved*: nothing persists one. The client asks and keeps nothing; the shell holds it in memory.
- **Patterns in a leaf.** A template's `filename: "{{date}}.md"` composes to
  `…/{{date}}.md` in the templates list. That is today's behaviour with a different separator; if
  it reads worse, it is the templates list's to expand, not this plan's.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
