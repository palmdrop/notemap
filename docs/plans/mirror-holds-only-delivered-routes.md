# The mirror holds only delivered routes

**Date**: 2026-10-15
**Status**: Done <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/mirror.md`
**Closed**: 2026-10-16

---

## Goal

An item's mirror record cannot carry a routing record that has not been
delivered — not by convention, but because the type says so and the reader
refuses a file that claims otherwise.

Done means: `projectMirrorRecord` can only produce delivered routes without a
cast, `parseMirrorRecord` rejects a file whose item names a `pending` one, and
the mutant that deletes the reader's check dies.

---

## Context

`docs/specs/mirror.md` settles what belongs in the record: an item's **delivered**
routing records, because one still pending is a reservation rather than durable
state, and a rebuild that restored it would restore a promise no job exists to
keep ([ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)).

The code is looser than its own spec in two places:

- `packages/core/src/types/domain/mirror.ts` types the field as
  `readonly RoutingRecord[]`, so `state` is the full two-value union and the
  spec's sentence survives only as prose and a `.filter()` in `record.ts`.
- `packages/core/src/mirror/codec.ts` reads `pending` back without complaint.
  Its comment argues the right thing — salvaging a file that says `pending`
  would invent an arrival — and then stops one step short of refusing it.

Mutation testing is what surfaced this: the mutant that removes the reader's
check cannot be killed, because no writer has ever produced the file it would
reject.

---

## Tasks

### 1. The type says it

Depends on nothing.

- [x] Branch `agent/mirror-holds-only-delivered-routes`
- [x] Give the mirror's item record a routing entry whose state can only be
      `delivered`, named in `types/domain/mirror.ts` beside the record it
      belongs to
- [x] Let `record.ts`'s projection narrow as it filters, so the filter proves
      the type rather than sitting beside it, and the comment there is no longer
      the only thing saying why
- [x] `git commit`

Verify: `pnpm --filter @notemap/core typecheck` passes with no cast at the
projection, and `pnpm -r --no-sort --silent test` is green. The existing test at
`mirror.test.ts` that projects a delivered and a pending record and expects only
the delivered one back should still pass untouched.

### 2. The reader refuses one

Depends on phase 1: the reader's return type is what phase 1 narrowed.

Landed in phase 1's commit: narrowing the field fails typecheck at the reader
until it refuses a `pending` state, so the two phases could not be committed
apart.

- [x] Reject a `pending` state where a record is read, with the same refusal the
      codec gives every other malformed field — refusing a file loudly beats
      dropping a route silently
- [x] Rewrite the test that currently pins the lenient read
      (`packages/core/src/mirror/mirror.test.ts`, the case that hand-builds a
      record whose `routing[0].state` is `"pending"`) to expect the refusal
- [x] Check the codec's comment still says something true once the behaviour has
      changed, and cut it if the code now says it
- [x] `git commit`

Verify: `pnpm --filter @notemap/core test` green, and
`pnpm --filter @notemap/core mutation` no longer reports a survivor at the state
reader. Core's covered score should rise from 93.53%.

### 3. The spec records what landed

Depends on phases 1 and 2.

- [x] Add a dated `Shipped:` entry to `docs/specs/mirror.md` saying the rule it
      already states is now enforced on both sides, linking this plan
- [x] Confirm no other wording in that spec implied the reader was lenient
- [x] `git commit`

Verify: `pnpm lint` green, and the spec's own words need no correction — if they
do, that is a sign the behaviour changed rather than caught up, and worth
raising before landing.

---

## Unknowns

- **Whether the narrowing stays inside core.** Searched before writing this:
  `ItemMirrorRecord` is used by `mirror-fs`'s writer, paths, frontmatter and
  renderers, and none of them reads `.routing` at all — only core's projection
  and codec do, plus fixtures in `mirror-fs` and `tests/integration`. So the
  change should touch core, one adapter fixture and some tests. Fallback if it
  spreads further than that: keep the field as it is, do phase 2 alone, and say
  in the `Shipped:` entry that the invariant is enforced at the boundary rather
  than in the type.
  _Outcome_: it stayed inside core, and no adapter fixture needed changing.
- **Whether a refusal is right for a file written by a future notemap.** A
  reader that refuses is a reader that cannot be made lenient again without a
  format decision. The spec's reasoning says a pending route is not durable
  state at all, so there should be nothing to be lenient about — but if this is
  the wrong bet, the fallback is to skip the entry and log, which needs a
  decision about what a mirror reader may silently drop, and that is an ADR
  rather than a line of code.
  _Outcome_: the refusal was taken. The spec's rule that the reader reports
  rather than skips backs it.
- **Whether `verify` compares records in a way this changes.** The mirror's
  verify path compares a stored record against a projected one. Narrowing a type
  changes nothing at runtime, but if verify reads `state` to decide equality, a
  file holding a pending route stops being comparable and starts being a
  refusal. Check before phase 2 lands.
  _Outcome_: nothing to check yet, because verify is not built.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests
already exist.

The refusal needs a test of its own; the projection already has one. Neither
phase should add a test that pins the shape of the refusal message.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
