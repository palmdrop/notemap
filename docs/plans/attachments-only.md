# Attachments only

**Date**: 2026-10-08
**Status**: In progress
**Spec**: `docs/specs/core.md`, `docs/specs/shell.md`, `CONTEXT.md`
**Closed**:

---

## Goal

A capture that carries attachments can be routed to a `filesystem` or `webdav` destination as its
attachments alone: every asset lands in the named folder under its uploaded filename, numbered where
another file already holds that name, and no note is written. The process surface reaches this
through an `attachments only` toggle, and a routing template can carry it.

---

## Decisions taken

- **A fourth capability, `place-assets`, not an argument on the other three.** Its arguments are a
  `directory` marked `x-notemap-path: "folders"` and the folder mode. Nothing else applies: there is
  no note to name, append under, or give frontmatter, hashtags or trigger tags. `filesystem` and
  `webdav` declare it. `arena` does not (see the are.na entry in `docs/todo.md`).
- **The capability says what it is through an annotation, not its name.** `x-notemap-carries:
  "assets"` sits at the root of its arguments schema, the same move ADR 55 made for path fields.
  The shell reads the annotation and never knows `place-assets` by name. Putting it at the schema
  root rather than on core's `Capability` type changes no core type and no wire shape.
- **Every attachment goes.** No per-delivery subset.
- **Filenames are the uploaded name, with no digest.** `paper.pdf` lands as `paper.pdf`. Where that
  name is taken, the adapter walks `paper-1.pdf`, `paper-2.pdf`, …: the first name holding these
  bytes counts as landed, and the first free name is written. A retry walks the same chain and finds
  what the last attempt wrote, so it never writes a second copy. Two attachments in one capture that
  share a name go through the same walk. "These bytes" is the asset's blob digest, compared against
  the SHA-256 of the file already there, and the sizes are compared first so only a size match is
  read in full.
- **The pointer is the folder**, `library/`, the path the marked field names. `PATH_FIELD` already
  promises the pointer is that path as it landed.
- **The output is the placed paths**, one per line, `text/plain`, so the record says which files
  went and under what names. Its note names the files already there, and nothing else: leaving out
  the words and tags is what the person asked for. A preview is the same list as the walk would
  answer now, which is indicative (ADR 33). This is the per-file forecast; the place section draws
  none of its own *(changed while implementing: the preview already draws the attachments around
  what would be written, and a second forecast beside the line would say the same thing)*.
- **The pointer at the root is absent.** The root names no folder.
- **A capture with no attachments is rejected at delivery**, and its preview is refused the same
  way. Core does not refuse it at decision time. A trigger tag that fires on such a capture gets its
  tag back through ADR 37.
- **The shell gesture is an `attachments only` toggle in `place`.** It is drawn only where the
  destination declares a capability carrying `assets` and the item has attachments. Turning it on
  takes that capability, and the line becomes a folder line. While it is on, `edit` in the head is
  unavailable: a rewrite carries words, and this delivery carries none.
- **The schema lives in `@notemap/output-markdown`** beside the other three file capabilities,
  although it renders no markdown. In practice that package is the file kinds' shared vocabulary.
- **A new ADR, 0056**, records the capability, the annotation, the naming walk and the pointer.

---

## Unknowns

- ~~**Does the line draw for a capability whose only path field is `folders`?**~~ Resolved while
  surveying: a capability the surface does not settle draws each field through `browserFor`,
  which gives any path-marked field the typed line.
- **WebDAV has no byte read or size.** `Dav.get` answers a string, and `look` answers no size.
  Phase 4 has `look` ask for `getcontentlength` and adds a streamed GET. If a server answers no
  size, the walk falls back to hashing every file whose name collides.
- **Does `schema-ajv` accept a root-level `x-notemap-carries`?** The field-level `x-notemap-*`
  keywords pass today. If strict mode refuses the root, register the keyword in the validator.

---

## Tasks

### Phase 0

- [x] Branch `agent/attachments-only` _(2026-10-08)_

### Phase 1 — docs, for review before any code

Depends on nothing. Every later phase codes against it.

- [x] ADR 0056: the `place-assets` capability, the `x-notemap-carries` annotation, the naming walk,
      the folder as pointer. Weighed and rejected: a flag on `create-or-append`, and an empty
      rewrite.
- [x] `docs/specs/core.md`: the fourth file capability, its arguments, the naming walk, the
      rejection of a capture with no attachments, and the output.
- [x] `CONTEXT.md`: **Capability** names placing a capture's assets alone beside create and append.
- [x] `docs/specs/shell.md`, process surface: the toggle and when it is drawn, the folder line,
      `edit` unavailable while it is on, the preview listing the paths with a note for those
      already there, the routing line reading the folder, and a template carrying it.
- [x] The file kinds' READMEs: the capability and the naming walk, as each kind's retry promise.
- [x] Verify: the developer confirms the docs _(2026-10-08)_
- [x] Commit _(2026-10-08)_

### Phase 2 — the shared vocabulary

Depends on Phase 1.

- [x] `packages/core/src/pool/destinations/vocabulary.ts`: the `x-notemap-carries` constant and its
      one value.
- [x] `@notemap/output-markdown`: `place-assets` in `capabilitiesFor`, its arguments reader, and a
      plain asset name without the digest, made from the same sanitising `assetName` uses.
- [x] The naming walk as a pure function over a "what holds this name" lookup, shared by both
      kinds.
- [x] Tests beside each: the schema validates through `schema-ajv`, and the walk handles free,
      same-bytes, different-bytes and a two-step chain.
- [x] Verify: `pnpm --filter @notemap/core --filter @notemap/output-markdown --filter @notemap/schema-ajv test`
- [x] Commit _(2026-10-08)_

### Phase 3 — the filesystem kind

Depends on Phase 2.

- [x] `destination-fs`: compose and deliver `place-assets` through the walk, honouring the folder
      mode and the reserved-path check. Preview answers the walk without writing. A capture with no
      assets is `rejected`.
- [x] Tests: lands under the plain name; same bytes count as landed; different bytes give `-1`; a
      retry after a partial write lands nothing twice; `require` with a missing folder is rejected;
      no assets is rejected; the pointer is the folder; the output lists the placed paths.
- [x] Verify: `pnpm --filter @notemap/destination-fs test`
- [x] Commit _(2026-10-08)_

### Phase 4 — the WebDAV kind

Depends on Phase 2. Independent of Phase 3.

- [x] `Dav`: `look` answers a size, and a streamed GET for hashing.
- [x] `destination-webdav`: the same capability on the same terms as Phase 3.
- [x] Tests mirroring Phase 3's, plus a listing that answers no size.
- [x] Verify: `pnpm --filter @notemap/destination-webdav test`
- [x] Commit _(2026-10-08)_

### Phase 5 — the shell

Depends on Phases 1 and 2. It codes against the annotation, not a kind.

- [x] Process surface: the toggle in `place`, drawn per the spec, taking and releasing the
      capability.
- [x] The folder line for the taken capability, carrying the folder across the toggle.
- [x] `edit` unavailable while the toggle is on, with the reason drawn.
- [x] Preview: the attachments drawn around the placed paths. No change needed: the preview already draws an output's text between the pictures and the file lines.
- [x] The routing line and the record view read a folder pointer, and the block says `placed`. Folder pointers already read as `…/library/` (`routing.test.ts`); only `placed` was added.
- [x] The template form offers `place-assets` like any other capability. Already generic, listing the description's capabilities; no test added.
- [x] Tests beside the components and state that changed.
- [ ] Verify: `pnpm --filter ui test` passes; still to do by hand against a local vault: attach a PDF, toggle
      on, route to `library/`, and see `library/paper.pdf` land with no note beside it.
- [x] Commit _(2026-10-08)_

### Phase 6 — finishing

- [x] Typecheck, lint, `pnpm -r --silent test`.
- [x] `pnpm test:stack`: the description a destination answers changes shape.
- [x] Add a `Shipped:` entry to `core.md` and `shell.md`, and set this plan's status. Left `In progress`: the by-hand check in Phase 5 is not done.
- [x] Commit _(2026-10-08)_

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
