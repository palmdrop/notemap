# Provenance keys in one case

**Date**: 2026-10-30
**Status**: Done
**Spec**: `docs/specs/core.md`, `docs/specs/mirror.md`
**Closed**: 2026-10-30

---

## Goal

Every key notemap writes to a file, routed note or mirror rendering, is snake_case. Neither one
writes `wasAttributedTo`, and standards.md says once which names belong to the pool and which to a
file.

---

## Context

- `wasAttributedTo` is written with `item.source` / `delivery.source`, the same value as
  `capture_source`. It carries nothing new, and an inbox is not the agent standards.md:93 defines.
  Nothing routed today has an agent other than its source, so the key goes rather than being
  renamed. When enrichment routes something with a real agent, that change picks its key, likely
  Dublin Core `creator`, which the routed vocabulary already lists.
- The mirror mixes cases too (`wasRevisionOf`, `wasAttributedTo` beside `captured_at`). Its
  comment calls the keys "an interop contract", which contradicts standards.md:153–155 (the mirror
  is write-only and nothing builds against it). The comment is corrected, not the standard.
- No migration. The pool stores domain fields (`source`, `revisionOf`), not key names, which are
  picked only in the two `frontmatter.ts` files. Notes already in a vault keep their old keys, and
  so does a routing record's stored output, because that is what landed. Old mirror renderings
  keep theirs until their item is amended, and nothing reads them: rebuild reads only the `.json`.
  Once verify and repair are built, repair rewrites any rendering verify reports as divergent.
  Outside notemap nothing reads these keys either, since Lapptäcke has no code yet.

---

## Tasks

### Phase 1: Standard and routed output

- [x] Create branch `agent/provenance-keys-one-case`
- [x] standards.md 89–101: dated amendment. PROV relation names are concepts, used in the pool and
  the envelope. Anything written to a file uses snake_case: `wasDerivedFrom` → `derived_from`,
  `wasRevisionOf` → `revision_of`, `wasGeneratedBy` → `generated_by` once a file carries it, and
  attribution gets no file key until an agent other than the source exists. Lines 94–96 say a
  revision carries `created` and `updated`; the files write `captured_at` and `updated_at`, so the
  amendment names those. Check that line 162 still reads true at pool level. *Corrected in review*: ADR
  21 gives a revision its own capture time, so the amendment marks lines 94–96 superseded instead.
- [x] `packages/output-markdown/src/frontmatter.ts`: drop `attribution` from `PROVENANCE`, along
  with its entry in `fixedFrontmatter`. `FIXED_KEYS` follows.
- [x] Tests, in `output-markdown/src/note.test.ts`: a routed note's frontmatter has no
  `wasAttributedTo`, and a renderer key named `wasAttributedTo` is no longer dropped as a shadow
  (`note.ts:97`). No output-markdown test asserts the fixed keys today, and none of the
  `destination-fs`, `destination-webdav` or `destination-arena` tests mention `wasAttributedTo`
  (checked 2026-10-30), so those stay as they are.
- [x] `docs/running.md:350`: remove the line from the example.
- [x] core.md: wherever it lists the routed frontmatter keys, make it match.
- [x] `git commit`: `feat(output-markdown): routed frontmatter drops wasAttributedTo`

**Verify**: `pnpm -r typecheck`, `pnpm -r --no-sort --silent test`, lint; then
`grep -rn wasAttributedTo packages/output-markdown packages/adapters/destination-*` is empty.

### Phase 2: Mirror

Depends on phase 1 for the standards wording it follows.

- [x] `packages/adapters/mirror-fs/src/frontmatter.ts`: drop `wasAttributedTo` from `FIXED_KEYS`
  and `fixedFrontmatter`, and rename `wasRevisionOf` → `revision_of`. Rewrite the `KEYS` comment so
  it stops calling the keys an interop contract.
- [x] `mirror-fs/src/writer.test.ts:197,202`: update the expectations.
- [x] mirror.md: wherever it names the rendering's keys, make it match.
- [x] `git commit`: `feat(mirror-fs): mirror frontmatter is snake_case throughout`.

**Verify**: typecheck, tests, lint; `git grep -n "wasAttributedTo\|wasRevisionOf" -- packages apps`
is empty. `git grep`, not `grep -r`: the gitignored `apps/daemon/dist/main.js` holds the old keys
until the daemon is rebuilt.

### Phase 3: Close out

- [x] Remove the todo.md item "The provenance keys a routed note carries are named two ways".
  It was never committed, so removing it was discarding the working-tree edit.
- [x] `pnpm test:stack`: routed output is the HTTP-visible surface the full-stack suite reads.
- [x] Spec `Shipped:` entries, plan status.
- [x] `git commit`: `docs: provenance keys in one case`.

---

## Unknowns

- **Does a mirror reader exist that keys on `wasRevisionOf`?** Rebuild does not exist yet
  (todo.md, "Rebuild restores pool settings"), and rebuild reads the `.json`, not the frontmatter.
  Expected: nothing. Fallback: if something turns up, rename it in the same phase.
- **Should a routed note also carry Dublin Core `created`?** Lapptäcke adopts notemap's routed
  vocabulary but uses `created` for when the text was written, because tools outside the family
  read `created` and not `captured_at`. Today Lapptäcke's adopt step maps `captured_at` → `created`.
  Not decided, and out of scope here. If notemap takes it on, it is additive (a new key beside
  `captured_at`) and does not belong in this plan.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Plans, reviews and exploration docs that mention `wasAttributedTo` are historical and stay as
written. So does ADR 6, which is about the pool.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
