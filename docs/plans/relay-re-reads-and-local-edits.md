# Relay re-reads and local edits

**Date**: 2026-10-20
**Status**: Done
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/mirror.md`
**Closed**: 2026-10-20

---

## Goal

A relay re-reading an upstream item that a person has edited in notemap changes nothing when
upstream has not changed, and pushes a new capture when both sides have. Later upstream edits
follow that capture. Upstream edits to a processed item chain instead of making sibling
revisions. A revision never wears a trigger tag that did not file it.

### Why

A memos item was amended in the shell and then routed by a trigger tag. The relay's next poll
re-captured it under its old identity. `isReplayOf` (`packages/core/src/pool/capture.ts`) compares
against what the item says now, so the amended item read as an upstream edit, and the relay
sent the upstream words back as an edit. The item was sealed, so the edit became a revision. It
held the pre-edit words and inherited the inert trigger tag, and it sat in the queue. If the poll
lands before routing instead, the same path amends the person's edit away without saying so. The
two failing tests in `tests/full-stack/src/relay.test.ts` cover both cases.

### Shape (to confirm before Phase 1)

- **The source's word.** Each item keeps a digest of the payload its source last sent for it. A
  capture sets it, and so does an edit arriving from the item's own source. An edit from anywhere
  else leaves it alone. A revision made by another source inherits it from the item it revises,
  so the word belongs to the **line** (the identity holder, its revisions, and its continuation),
  not to one row.
- **Resolving a re-capture.** A re-capture under a held identity resolves to the **head** of the
  line: follow the latest revision, then the continuation, until neither exists. It is then
  compared with the head:
  - it matches what the head says, or the line's source word → `already-captured`
  - it differs, and the head still says the source's word → `409 source-item-changed`, naming the
    head (today's path, aimed at the head instead of the identity holder)
  - it differs, and the head says something else too → `409 source-item-diverged`, naming the head
- **Continuation.** On `source-item-diverged` the relay captures afresh under
  `<sourceItemId>@<version>`, with the envelope naming the head it continues. The pool records the
  link on the new item. That item becomes the line's head, so later re-reads resolve to it. It is
  an ordinary capture: not a revision, and it does not process the item it continues.
- **Trigger tags stay behind.** A revision inherits every tag except those in the trigger
  namespace.

---

## Tasks

### Phase 0 — Decide

- [x] Create branch `agent/relay-re-reads-and-local-edits`
- [x] Confirm the shape above with the developer, including the names (`source word`, `line`,
      `continues`) and whether they go into CONTEXT.md
- [x] Write the ADR: the source's word, divergence makes a continuation, and upstream edits chain on
      the head. It amends ADR 39's "each change upstream makes its own independent revision" and
      ADR 34's "a revision carrying the tag fires nothing". Mark both ADRs as amended.
- [x] Commit

### Phase 1 — Replay against the source's word

Depends on Phase 0. Fixes the reported bug and the silent revert on its own.

- [x] Store: a source-word column on `items` and the port write it needs _(2026-10-20: the whole
      payload rather than a digest, kept only while it differs, so nothing is backfilled — see
      Notes)_
- [x] Core capture: a re-capture matching the source's word is `already-captured`
- [x] Core edit: amend and revise set or inherit the source's word as described above
- [x] Mirror: the item record carries the source's word. Update the codec, the arbitraries and
      mirror.md _(2026-10-20: in the `.json` only, not the frontmatter)_
- [x] core.md (editing, capture identity) and CONTEXT.md, in the same change
- [x] Tests: core unit tests for the replay and for which edits move the word, an integration test
      over sqlite, and both failing full-stack tests in `relay.test.ts` passing
- [x] Commit

Verify: `pnpm -r --no-sort --silent test`, and
`pnpm --filter @notemap/full-stack-tests test:stack -- relay`.

### Phase 2 — Revisions leave trigger tags behind

Independent of Phase 1. Depends on Phase 0.

- [x] Core `revise` drops tags in the trigger namespace
- [x] core.md (tags carry over to a revision), CONTEXT.md if **Revision** says so
- [x] Tests: a revision of a trigger-filed item carries its other tags and not the trigger tag, and
      re-adding the trigger tag to the revision fires
- [x] Commit

Verify: `pnpm -r --no-sort --silent test`.

### Phase 3 — Upstream edits chain on the head

Depends on Phase 1, which defines the line's source word.

- [x] Core: a re-capture resolves its identity to the line's head, and `source-item-changed` names
      the head
- [x] Store: whatever index finding the head needs (latest revision of an item)
- [x] Relay: no change expected; it already edits whatever `existing` names. Confirm
- [x] core.md and http-v1.md (`existing` names the head), CONTEXT.md **Revision** ("independent of
      each other" no longer holds for a source's edits)
- [x] Tests: two upstream edits to a processed item give a chain of two revisions, and re-runs add
      nothing (full-stack, replacing the sibling expectation in ADR 39's terms)
- [x] Commit

Verify: `pnpm -r --no-sort --silent test`, `pnpm test:stack`.

### Phase 4 — Divergence makes a continuation

Depends on Phase 3.

- [x] Core: `source-item-diverged` refusal, and an optional `continues` on the capture envelope,
      validated (the item exists and is the head of a line from the same source)
- [x] Store: a `continues` column, mirrored, and the head resolution following it
- [x] Daemon: schema and openapi for the refusal and the envelope field, plus regenerated client types
- [x] Client: `source-item-diverged` gets a message in `errors.ts`, read as a refusal like
      `source-item-changed`
- [x] Relay: on `diverged`, capture under `<sourceItemId>@<version>` continuing `existing`, and
      answer a new `Landed` kind (`continued`)
- [x] relay-memos and relay-arena log lines for the new kind
- [x] http-v1.md (errors table, envelope), core.md, mirror.md, CONTEXT.md
- [x] Tests:
  - full-stack: a local edit plus an upstream edit gives a new capture holding the upstream words
  - re-runs answer `already-captured`
  - a further upstream edit amends or revises the continuation, not the original
  - core unit tests for each resolution branch
- [x] Commit

Verify: `pnpm -r --no-sort --silent test`, `pnpm test:stack`.

### Phase 5 — Close

- [x] docs/todo.md: remove the revise-then-route bug, and reword the relays entry (an upstream edit
      to a processed item) to match the chain
- [x] Typecheck, lint, tests, `pnpm test:stack`
- [x] `pnpm --filter @notemap/core mutation`, since capture's decisions changed. Read the survivors
      in capture and edit _(core's own tests barely reach capture and edit — the decisions are
      tested from `tests/integration`, so the survivors there are no-coverage)_
- [x] `Shipped:` entries in core.md, http-v1.md and mirror.md
- [x] Commit

---

## Unknowns

- **Backfill.** Existing items get today's payload as their source word, so an item amended
  before the migration still reads its amendment as the source's word. The first re-read of an
  unchanged upstream item would then look like an upstream edit, which is today's bug, once per
  item. Fallback: no live users, so accept it. Or backfill from the oldest `captured`/source-made
  revision where the action log can tell. It can't for an amend, which keeps no payload.
- **The shell's own captures.** A shell resends under its own id and never re-reads, so its lines
  never diverge. Check that a shell resend with changed words still gets `source-item-changed`
  rather than `source-item-diverged`. If it doesn't, limit divergence to an identity whose
  holder's payload differs from its source's word.
- **Sibling revisions already in a pool.** "Latest revision" picks one. The others stay as they
  are. Fallback: none needed while there are no live users.
- **Rebuild does not exist.** The mirror carries the digest and `continues`, but nothing reads
  them back yet. The rebuild todo should name both fields.
- **Head resolution cost.** It walks per re-capture, and every relay poll re-captures everything.
  If a walk per item shows up in a poll's time, store the head on the identity holder rather than
  deriving it.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The two full-stack tests added while diagnosing (`relay.test.ts`, "keeps a person's edit…" and
"makes no revision of an item edited by hand…") are the acceptance tests for Phase 1, and they
fail today.

---

## Notes

**Where it departed from the shape above** (2026-10-20). The source's word is stored as the whole
payload, not a digest: core has no hashing, and a payload compares exactly as the existing replay
check does. It is kept only while it differs from what the item says, so an absent one means "the
item says what its source said", and that is also why there is no backfill. The Unknowns' first
item holds as written. The phases landed as one code commit, not one per phase, because
`edit.ts` and `capture.ts` carry pieces of three of them.


DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
