# A capture filed as a task, under a heading picked from the note

**Date**: 2026-10-14
**Status**: In progress
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/shell.md`

---

## Goal

A person can route a capture to an fs or webdav note as `- [ ] …`. The heading is picked from the
headings that note actually has, or typed when the picker cannot answer. The entry lands at the end
of that heading's section without loosening the list it joins. An fs note edited by someone else
between notemap's read and its write is never overwritten.

Decisions: [ADR 61](../adr/0061-a-conversion-is-a-named-argument-a-kind-publishes.md) (conversion
as a published argument), [ADR 62](../adr/0062-a-candidates-request-carries-the-arguments-a-field-depends-on.md)
(`given` on a candidates request).

---

## Tasks

### Phase 0: before anything

- [x] Branch `agent/task-conversion` _(2026-10-14)_
- [x] ADR 61 and ADR 62 set to Accepted _(2026-10-14)_

### Phase 1: fs append refuses to overwrite a file that changed under it

Depends on nothing.

- [x] The fs append records the file's `mtimeMs` and size when it reads the file, and checks both
      again before the rename. A mismatch answers `unreachable`, so the delivery is retried
      against the file as it now is. A file that did not exist at the read and exists at the write
      is a mismatch too.
- [x] `create-or-append` gets the guard through `append`. `create` already refuses a taken name
      through `link`.
- [x] Test: compose an append, change the file, then write. The write answers `unreachable`, the
      file holds the other edit, and a retry lands the entry.
- [x] `packages/adapters/destination-fs/README.md` says what the guard catches and what it does
      not: an edit that keeps both mtime and size within the filesystem's timestamp resolution.
- [x] Verify: `pnpm -r --silent test`, typecheck, lint. Commit. _(2026-10-14)_

### Phase 2: the `conversion` argument

Depends on nothing. Phase 1 can go before or after it.

- [x] `output-markdown` publishes `conversion` (`block` | `list-item` | `task`, default `block`) on
      `create`, `append` and `create-or-append`, with a typed reader beside the others. Absent
      reads as `block`.
- [x] The conversion runs on the rendered body inside `renderNote`, so `deliver` and `preview`
      share it. `list-item` and `task`: the first line becomes the item, the rest of the body is
      indented beneath it as continuation, and hashtags (where asked for) go at the end of the
      item's first line instead of in the foot.
- [x] `frontmatter` carries `x-notemap-when: [{ field: "conversion", is: ["block"] }]`, and the
      kinds read it as `none` for any other conversion, whatever the record holds.
- [x] Both markdown kinds pass the argument through; webdav and fs behave identically.
- [x] A record naming a value the kind does not publish is `rejected` at delivery.
- [x] Specs: core.md (routing: a conversion is a named argument the kind publishes, with a link to
      ADR 61) and CONTEXT.md (**Conversion**: named, and selected per delivery).
- [x] Tests: each conversion on a one-line body, a multi-paragraph body, a body with pictures, with
      and without hashtags; a `task` into a fresh note with `frontmatter: full` on the record writes
      none; preview equals the delivered output; a `block` record made before this
      writes byte-identical output.
- [x] Verify: `pnpm -r --silent test`, typecheck, lint. Commit. _(2026-10-14)_

### Phase 3: an item joins the list next to it

Depends on phase 2.

- [x] `insertUnder` takes the list-item fragment into account. Where the section's last block is a
      list, a list-item fragment is joined with one newline when that list is tight (`spread` is
      false) and a blank line when it is loose. Everything else is unchanged.
- [x] Tests: a tight list stays tight; a loose list stays loose; a section ending in prose gets
      the item as a new list after a blank line; a list inside a fenced block is not a list; a
      `block` fragment after a list is unchanged from today.
- [x] Verify: `pnpm -r --silent test`, typecheck, lint. Commit. _(2026-10-14)_

### Phase 4: `given` on a candidates request

Depends on nothing. Phase 5 needs it.

- [x] Core: `CandidatesRequest.given` and the `x-notemap-candidates-given` annotation, registered
      with the validator. Core passes `given` through; the route checks it, as it checks the
      capability and the field.
- [x] HTTP: `given[<field>]` query parameters, `given-missing` and `given-undeclared` checked before
      the destination is asked, on `GET /v1/destinations/{id}/candidates`, both
      `422`s, the OpenAPI document regenerated, and the client's types regenerated with `codegen`.
- [-] Client: the candidates cache keys on `given`. _(moved to phase 6: the cache is the shell's,
      `$lib/candidate-cache`; the client keeps nothing)_
- [x] Specs: core.md (candidates) and http-v1.md (`/candidates`: parameters, the two codes, an
      example).
- [x] Tests: route parsing and both refusals; the client sends `given[path]`.
- [x] Verify: `pnpm -r --silent test`, typecheck, lint, `pnpm test:stack` (this changes the HTTP
      surface and the client's transport). Commit. _(2026-10-14)_

### Phase 5: the markdown kinds answer headings

Depends on phase 4.

- [x] `heading` on `append` and `create-or-append` is marked askable, with `given: ["path"]`.
- [x] fs and webdav answer one entry per distinct heading text in the note `path` names, with
      `value` set and no `scope`, in document order, capped and `truncated` like any other answer.
      A note that is not there, or a `create-or-append` path ending in `/`, answers with no
      entries.
- [x] The heading text an entry carries is the text `insertUnder` matches on, from the same
      function. A picked heading must always be found by the splice.
- [x] Tests on both kinds: ATX and setext headings, emphasis in a heading, a `#` inside a fence,
      duplicates listed once, a missing note, a folder path.
- [x] Verify: `pnpm -r --silent test`, typecheck, lint. Commit. _(2026-10-14)_

### Phase 6: the shell

Depends on phases 2 and 5.

- [ ] The shell's candidate cache (`$lib/candidate-cache`) keys on `given`, so one note's headings
      never answer for another.
- [ ] The composer and the template form draw `conversion` as they draw other enums, and hide
      `frontmatter` for any conversion other than `block`. That follows from the `x-notemap-when`
      added in phase 2; a test confirms it, including `trigger tags` still showing through
      `hashtags` while `frontmatter` is hidden.
- [ ] The `heading` field offers the destination's headings once `path` is filled, and accepts
      free text always: a heading that does not exist yet, or a destination that cannot answer.
      Changing `path` drops the offered list.
- [ ] Spec: shell.md (the routing composer and the template form).
- [ ] Tests: the picker is not offered before `path` is filled; picking fills the field; free text
      survives `unreachable` and `not-offered`.
- [ ] Verify: `pnpm -r --silent test`, typecheck, lint, `pnpm test:stack`. Commit.

### Phase 7: close out

- [ ] `docs/todo.md`: narrow the **Conversion** and **Routing auto-processing** entries to what is
      still open (automatic and model-driven conversions, folds), and the **Output** in-file edits
      entry to what is left (full-file backups).
- [ ] `Shipped:` entries in the specs listed above. Commit.

---

## Unknowns

- **Where the composer draws arguments beyond the path.** The typed line (`PathLine.svelte`) owns
  `path`; it is not yet confirmed where `heading`, `frontmatter` and friends are drawn today, or
  whether `CandidateBrowser` can be pointed at a field other than the path. Fallback: the heading
  picker is a plain list under the heading input rather than the browser, with the same request
  underneath.
- [x] **Whether `@hono/zod-openapi` can describe a `given.<field>` family of query parameters.**
  Answered 2026-10-14: `deepObject` (`given[path]=…`) is what OpenAPI describes and what
  openapi-fetch already sends for an object, so that is the shape. ADR 62 carries an amendment.
- **A body that does not open with a line of prose**: a fence, a picture, a heading. A heading's
  markers are stripped and its text becomes the item. For a fence or a picture, the fallback is an
  item with no text of its own and the whole body as its continuation. Decide during phase 2 with
  the output in front of you.
- **mtime resolution on the filesystems people actually mount** (network mounts, FAT on a stick).
  Coarse timestamps widen the window the guard misses. Accepted and documented; not worked around.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
