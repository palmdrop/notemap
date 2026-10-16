# Review: The mirror holds only delivered routes

**Date**: 2026-10-16
**Status**: Resolved <!-- Open | Partially addressed | Resolved -->
**Scope**: `git diff main...agent/mirror-holds-only-delivered-routes` (e6841c95, f2bcdb97)
**Plan**: `docs/plans/mirror-holds-only-delivered-routes.md`
**Spec**: `docs/specs/mirror.md`

---

## Overall

The branch does what the plan set out to do. `ItemMirrorRecord.routing` cannot hold a pending
record, the projection narrows without a cast, and the reader refuses `pending` through the
codec's usual `reject`. Typecheck, the full test run, eslint and prettier are all green. A scoped
Stryker run over `codec.ts` and `record.ts` found no survivor at `readState` or `deliveredRouting`.
The survivors it did find (`codec.ts:49–50, 350, 361`, `record.ts:166`) are outside this diff.
There are no bugs. What remains is wording: one comment argues with a rejected alternative, one
refusal message breaks the codec's phrasing, and the plan's Unknowns were never closed out.

---

## Bugs

None.

---

## Design

None.

---

## Minor

### 1. The comment on `deliveredRouting` explains a rejected alternative

`packages/core/src/mirror/record.ts:146`: "`state` is the narrowed field rather than a literal, so
the check is what the type rests on." AGENTS.md says not to explain rejected alternatives, and
"rather than a literal" is one. The question a reader actually has is why `state: entry.state`
repeats a field the spread already copies. The answer is that the spread alone leaves `state` as
the wide union. The comment only hints at this. Either reword it to answer that question ("The
spread keeps `state` wide; taking it from the check is what narrows it"), or drop it. A
`state: "delivered"` literal inside the same ternary would be just as correct at runtime. The only
thing it would lose is a compile error when someone mutates the condition, and that matters to
Stryker more than to a reader.

### 2. `deliveredRouting` no longer says it canonicalises

`packages/core/src/mirror/record.ts:147`: the function it replaced was `canonicalRouting`, and
`canonicalArtifact` still sits beside it. The new name says what it filters on and hides that it
also rewrites `at` through `instant`. It is small and a reader finds out in one line. Still, the
sibling helpers are named for the canonicalisation, and this one now isn't.

### 3. The refusal message breaks the codec's phrasing

`packages/core/src/mirror/codec.ts:289`: `reject(at, "delivered")` produces
`routing[0].state is not delivered`. Every other `expected` argument is a noun phrase naming what
was wanted ("a folder mode", "a routing record state", "a timestamp"). Here it reads as a claim
about the route, not about the field. Stryker excludes string literals and the tests no longer pin
the message, but a person reads it in a verify finding. Something like `"\`delivered\`"` or
`"a delivered state"` would match the rest.

### 4. The plan's Unknowns are left unanswered

`docs/plans/mirror-holds-only-delivered-routes.md:101–125`: the plan is marked Done, but none of
its three Unknowns records how it turned out.

- The first predicted an adapter fixture change, and none was needed.
- The second was a bet that refusing beats skipping, and it was taken.
- The third asked whether verify reads `state`. Verify has no implementation yet, so the answer is
  "nothing to check", but the plan doesn't say so.

A one-line outcome under each would keep the plan honest as rationale.

---

## Non-issues

- **The `readState` comment, kept** (`codec.ts:286`). Now that the return type is the single
  literal, "why read a field that can only be one value?" is exactly what a reader asks. "Salvaging
  a file that says `pending` would invent an arrival" answers it, and the code cannot. It is still
  true after the change.
- **The JSDoc on `DeliveredRoutingRecord`** (`types/domain/mirror.ts:41`). It says why the type
  exists, which the code cannot say, and it replaced the inline comment the projection used to
  carry rather than duplicating it.
- **The names.** "Routing record", "delivered" and "reservation" are all CONTEXT.md terms, and the
  glossary already defines a record that is not pending as one whose bytes reached somewhere. No
  glossary change is owed.
- **The arbitraries still generate `pending`** (`arbitraries.ts:208`). They model pool state, not
  mirror state, and `poolState` is projected before the round trip. So generating pending entries
  is what exercises the filter. Changing them would weaken the property.
- **`recordsFor` skips a file holding a pending route** (`mirror-fs/src/writer.ts:148–151`). Such
  a file can now no longer be parsed, so a removal leaves it behind. The writer's docblock already
  accepts that ("leaving debris for verify to report"), and no notemap writer has produced one
  since the filter landed in 69cba6f2. Records from before that commit carry no `state` and were
  already refused. Nothing regresses.
- **Refusing the whole item record rather than skipping the entry.** This is the plan's second
  Unknown, and the spec backs it: "The reader enumerates, and reports rather than skips". The only
  source of such a file is an external edit, and a malformed folder mode or timestamp is refused on
  the same terms. The pool-setting skip is a different case: an unknown setting *name* is forward
  compatibility, while a pending route is a state the format says cannot occur.
- **The two refusal tests now cover one branch** (`mirror.test.ts:722, 742`). They pin different
  inputs: an unknown spelling, and the real state that is not durable. Matching on the field path
  alone follows the plan's "no test pins the shape of the refusal message", even though the
  neighbouring tests pin theirs.
- **`delivery.test.ts:122` asserts `state` is `"delivered"`.** The type now guarantees that, but
  the assertion still checks at runtime that exactly one entry was mirrored from a parsed file.
- **The Shipped trail.** `docs/specs/mirror.md:7–10` has a dated entry that links the plan and
  states the change accurately. "On both sides" is true of the type and of the reader, and no other
  wording in the spec said the reader was lenient.
- **Phases 1 and 2 in one commit.** The plan notes it, and the reason holds: narrowing the field
  breaks typecheck at the reader until the reader refuses `pending`.

---

## Resolution

1. **Fixed.** Reworded to answer the question a reader actually has: the spread keeps `state`
   wide, and taking it from the check is what narrows it.
2. **Fixed.** Renamed to `canonicalDeliveredRouting`.
3. **Fixed.** The refusal now reads `… is not a delivered state`.
4. **Fixed.** Each Unknown in the plan now ends with its outcome.
