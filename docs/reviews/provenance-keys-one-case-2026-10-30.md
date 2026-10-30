# Review: Provenance keys in one case (PR #124)

**Date**: 2026-10-30
**Status**: Open
**Scope**: `main..agent/provenance-keys-one-case` — `packages/output-markdown/src/frontmatter.ts`,
`packages/adapters/mirror-fs/src/frontmatter.ts`, their tests, `docs/standards.md`,
`docs/specs/core.md`, `docs/specs/mirror.md`, `docs/running.md`
**Plan**: `docs/plans/provenance-keys-one-case.md`
**Spec**: `docs/specs/core.md`, `docs/specs/mirror.md`

---

## Overall

The code matches the plan. Both `frontmatter.ts` files write snake_case only, `wasAttributedTo` is
gone from routed notes, are.na block metadata and mirror renderings, and `git grep` over `packages`
and `apps` finds the old keys only in the new tests. Typecheck, the affected packages' tests,
eslint and prettier pass; CI `stack` passes. The docs are where this falls short. The standards.md
amendment says something false about revisions (2), is scoped wider than what it describes (3), and
mirror.md still calls the rendering's keys an interop contract, the claim this PR removed from the
code (1). The `Shipped:` trail is complete: both specs carry a dated entry linking the plan.

---

## Bugs

None.

---

## Design

### 1. mirror.md still calls the rendering's keys an interop contract

`docs/specs/mirror.md:180-181` — "Neither of the two is in the frontmatter of the rendering, whose
keys are an interop contract, so the `.json` alone carries them". The PR deleted the same claim
from `mirror-fs/src/frontmatter.ts` because it contradicts standards.md's Conformance section and
mirror.md's own Out of scope (`:159`, "nothing builds against it"). Code and spec now disagree.
The plan's "wherever it names the rendering's keys" task missed this sentence because it describes
the keys without naming any.

Fix: drop "whose keys are an interop contract".

### 2. The amendment gives a revision two timestamps it does not have

`docs/standards.md:100-101` — "A revision's two timestamps are written `captured_at` and
`updated_at`." This maps the old wording at `:95-96` ("the original `created` plus an `updated`
timestamp") onto file keys. That wording was superseded on 2026-08-24 by ADR 21 (`:68`: a revision
"mints its own id, its own capture time of now") and by CONTEXT.md's **Revision** ("carrying its
own capture time"). On a revision, `captured_at` is the revision's own capture time, not the
original's. `updated_at` is `contentUpdatedAt`, which only an amendment sets and which says nothing
about revising. A reader of the amendment will take `captured_at` on a revision to be the
original's time.

```
standards :95 (stale since ADR 21) → amendment names file keys for it → standard states a model the pool does not implement
```

Fix: say that a revision carries its own `captured_at` and a `revision_of` link, and mark `:95-96`
as superseded by ADR 21 instead of building on it. The plan's task told the implementer to "name
those", so the plan has the same error.

### 3. The amendment's rule covers more than the files it means

`docs/standards.md:98-103`. Three claims are broader than what is true:

- "A key written to a file … is snake_case." The mirror's `.json` is a file notemap writes, and
  its keys are camelCase (`revisionOf`, `contentUpdatedAt`, `withdrawnAt`, a tag's `by`). Keys a
  renderer adds are not constrained either, and `note.test.ts:134` now asserts that a renderer can
  write `wasAttributedTo` into a note. The parenthetical (routed note, mirror rendering) shows the
  intent is frontmatter. The rule also leaves out the one non-file place the vocabulary lands:
  are.na block metadata, which `provenanceOf` copies from `fixedFrontmatter`.
- "nothing that leaves the pool yet has an agent other than its source". Every tag in the mirror
  `.json` carries its **Agent**: a person, a provider. True of frontmatter and block metadata, false
  of the mirror.
- "the pool and the envelope use them". The pool's names are `revisionOf`, `source` and `Agent`.
  It uses the relations, not their PROV spellings. "Envelope" is not a CONTEXT.md term.

Fix: scope the rule to "a key notemap itself writes into frontmatter or a block's metadata", and
state the attribution claim about those. Reword "use them" to "model these relations" or similar.

---

## Minor

### 4. The lead-in still says "as frontmatter keys"

`docs/standards.md:89` — "the three W3C PROV relations, as frontmatter keys". The amendment at
`:98` reverses this, but the reader meets the unqualified claim and four camelCase names first.
Other amendments in this file mark the sentence they change. Add "*amended 2026-10-30, below*" after
"as frontmatter keys" and keep the original text. ("three" above a list of four was already wrong.)

### 5. Line 169 reads as an item field

`docs/standards.md:168-169` — "Each provider … is named on the item via `wasAttributedTo`." Leaving
it was right: it describes the pool. In the pool, though, the provider is the **Agent** on the tag,
artifact or suggestion it produced (CONTEXT.md, `types/domain/agent.ts`). No item-level attribution
exists. Next to an amendment that says attribution has no file key, a backticked key "on the item"
reads like a field. Suggested wording: "and is the agent on what it produces (PROV
`wasAttributedTo`)".

### 6. The routed-note test checks one spelling, not what its title says

`packages/output-markdown/src/note.test.ts:119-132` — "names its origin and not its source a second
time" asserts `not.toContain("wasAttributedTo")`. If the source came back under another key
(`attributed_to: 'scratchpad'`), the test would still pass. No output-markdown test pins the full
fixed block. Block metadata changed in this PR without any arena test noticing:
`destination-arena/src/blocks.test.ts:162` compares against `fixedFrontmatter` itself, so it passes
however the key set changes. Assert the exact frontmatter block for a `full` delivery, as
`mirror-fs/src/writer.test.ts:190` does. That pins routed notes and block metadata both.

### 7. No mirror test that a renderer's old-named key gets through

`packages/adapters/mirror-fs/src/writer.test.ts:225` checks shadowing with `id` only. Nothing shows
that `wasAttributedTo` or `wasRevisionOf` from a renderer now reaches the rendering. The only
regression such a test catches is someone adding a name back to `FIXED_KEYS` by hand, since the list
is derived from `KEYS`. Optional, low value.

### 8. The routed vocabulary bullet disagrees with the keys directly above it

`docs/standards.md:105-108` lists `source_id`, which routed notes do not write, and omits `id`,
`payload_type` and `updated_at`, which they do. This predates the PR. The amendment now names
`updated_at` as a file key three lines earlier, and the plan's goal was for standards.md to say once
which names go in a file. Either align the list or leave it as a known gap for a later change.

### 9. Plan checks off removing a todo item that never existed

`docs/plans/provenance-keys-one-case.md` Phase 3 — "Remove the todo.md item …" is checked. That text
appears in no version of `docs/todo.md` (`git log -S` finds it only in the plan). Harmless, but the
plan should say there was nothing to remove.

---

## Non-issues

- **are.na block metadata loses `wasAttributedTo` implicitly** — intended. `provenanceOf` copies
  `fixedFrontmatter` so that a note and a block use the same words. The arena README (`:69-70`) never
  listed the key. Blocks already routed keep it, and nothing reads block metadata back (`blocks.ts`
  doc comment).
- **Renderings already on disk keep `wasRevisionOf`** — no source file parses YAML frontmatter, and
  rebuild reads the `.json`.
- **ADR 6 and plans/reviews/exploration still say `wasAttributedTo`** — historical, or about the
  pool. The plan excludes them on purpose.
- **The mirror `KEYS` comment lost "stable across a rename on the domain side"** — that guarantee only
  existed to serve the interop claim, which is gone.
- **`note.test.ts:134` uses `wasAttributedTo` as a renderer key** — on purpose. It shows the name is
  no longer reserved.
- **core.md got only a `Shipped:` entry** — it lists no routed keys. `:2034-2040` refers to
  standards.md's vocabulary and still holds.
- **`running.md:350`** — the example now matches what `fixedFrontmatter` writes.
