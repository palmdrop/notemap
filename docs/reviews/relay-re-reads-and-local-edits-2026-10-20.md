# Review: Relay re-reads and local edits

**Date**: 2026-10-20
**Status**: Resolved
**Scope**: `main...agent/relay-re-reads-and-local-edits`. Mainly `packages/core/src/pool/{capture,edit,lines,payload}.ts`,
`packages/relay/src/{relay.ts,pool/pool.ts}`, `packages/adapters/{store-sqlite,mirror-fs}`,
`packages/core/src/mirror/`, `apps/daemon/src/{schemas,errors}`, `packages/client`, and the tests
in `tests/integration/src/rereads.test.ts` and `tests/full-stack/src/relay.test.ts`
**Plan**: `docs/plans/relay-re-reads-and-local-edits.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/mirror.md`

---

## Overall

The fix works for the reported bug and for the cases the plan names. A re-read of unchanged
upstream after a local edit is a replay, a source's own edits chain, and a divergence continues.
Typecheck, lint and `pnpm -r --no-sort --silent test` pass. The `Shipped:` trail is complete: all
three specs have a dated entry linking the plan. The most important finding is that the line is only
kept linear while every edit goes to the head. An edit to an item *behind* the head (a sealed holder
that already has a revision, or an item that already has a continuation) forks the line. The head
then moves to the fork, its source's word is out of date, and the relay asks for a continuation
under an identity that an earlier edit already uses. The pool refuses that capture, and the relay
then fails on the item on every poll. I reproduced both paths with a throwaway integration test. The
other significant finding is that a continuation fires trigger tags again. A revision no longer
does.

---

## Bugs

### 1. An edit behind the head forks the line, and the relay then fails on the item every poll (should-fix)

`packages/core/src/pool/edit.ts:33-37`, `packages/core/src/pool/lines.ts:8-19`,
`packages/relay/src/relay.ts:48` — `edit` revises whichever item it is given. `keptWord` takes the
source's word from *that* item and not from the line's head. `headOf` follows the latest revision
before the continuation. Nothing stops a person revising an item that is not the head, so two paths
fork the line:

```
A: H sealed → relay revises H at v2 → R (identity u@v2)
   → person edits H (still sealed) → sibling R2, sourceWord = v1 (H's payload)
   → headOf(H) = R2 (latest) → re-read of unchanged v2: R2 says "mine", word v1
   → source-item-diverged naming R2      (upstream did not change)
   → relay captures u@v2 continues R2 → identity held by R, continues differs
   → source-item-changed naming R → relay throws "continuing R2 answered changed"

B: X edited by hand → upstream v2 → continuation C (u@v2) → X routed (sealed)
   → person edits X → revision R of X → headOf(H) = R, C is skipped
   → re-read of v2: diverged naming R → capture u@v2 continues R → held by C
   → source-item-changed → relay throws
```

Both were confirmed against sqlite. Each poll counts the item as `failed` and logs a warning until
upstream changes again. Path A also breaks "the person's edit stays exactly where they made it":
the relay is asking to file a duplicate of content the pool already holds in R. This contradicts
ADR 64's "a line has at most one continuation per item" and its "no branching" driver. The shell
only offers `edit` on unprocessed rows, so a person reaches this through the API or through an edit
that crosses a seal in transit. The relay is still wedged for that item.

Fix: either make an edit to a non-head item of a line take its source's word from the head, and
give a revision of a continued item no say over the head, or refuse such an edit. Separately, the
continuation should not share the `<id>@<version>` namespace that the relay's edits mint.

---

## Design

### 2. A continuation fires the upstream trigger tags again (should-fix)

`packages/relay/src/relay.ts:51` — the continuation is captured with `tags: one.tags`. With
`hashtags` on, a memo carrying `#route/…` filed the original, and its continuation files itself
again by the same template. The person's version and the upstream version are then both delivered,
without anyone deciding. This contradicts ADR 64's "a conflict produces something a person can see
and decide about". It is also inconsistent with the same change's rule that a revision drops
trigger tags: an upstream edit to a filed item lands unfiled, while an upstream edit that diverged
lands filed. Decide this explicitly. Dropping `route/` tags on a continuation matches the revision
rule.

### 3. A changed fixed field is answered `source-item-changed` naming the holder, and the relay then amends the person's edit away (nit)

`packages/core/src/pool/capture.ts:283-287` — a mismatch on `capturedAt`/`utcOffset`/`continues`
answers `source-item-changed` naming the **holder**, not the head. The relay cannot tell this from
an upstream edit, so it edits the holder. That edit comes from the line's own source, so `keptWord`
clears the word and the person's amendment is overwritten. This is the original bug's path, now
reachable only through a changed upstream creation time. The edit cannot cure a fixed-field
mismatch either, so the relay repeats it on every poll. It is rare enough to leave as is, but the
spec should say that a fixed-field change is not an upstream edit, or it should get its own refusal.

### 4. `amendItem`'s optional `sourceWord` clears on omission (nit)

`packages/core/src/types/api/ports.ts:423-432` — "an absent one clears it". If a future caller
forgets the argument, the source's word is wiped silently and the type checker does not object.
Make the parameter `sourceWord: Payload | undefined`, required.

### 5. `continues` validation does not tie the continuation to the diverged identity (nit)

`packages/core/src/pool/capture.ts:210-222` — the check is "a head, of a line from this source".
A source can continue any head of its own, under any `sourceItemId`, including one unrelated to
the identity it was told diverged. The relay never does this, but the pool does not enforce it, and
the spec's wording ("the head it continues") reads as if it did.

---

## Minor

### 6. CONTEXT.md **Trigger tag** contradicts the change, and `revise` drops more than trigger tags (should-fix)

`CONTEXT.md:494` still says "a revision carrying one fires nothing". `CONTEXT.md:497-498` says "A
`route/` tag naming no template is an ordinary tag". `packages/core/src/pool/edit.ts:138-140`
nevertheless drops every `route/`-prefixed tag, declared or not. core.md:556 says "except trigger
tags". Either filter on declared trigger tags, or say in CONTEXT.md and core.md that the whole
namespace stays behind, and fix the stale clause.

### 7. http-v1.md still calls revisions independent (nit)

`docs/specs/http-v1.md:1087` — "The revisions are independent captures sharing an ancestor; neither
is the current one". core.md:565 was amended for a source's own chain, but this line was not.
`http-v1.md:1012` ("Tags carry over to a revision") also lacks the trigger-tag exception.

### 8. A retried continuation capture fails once the continuation has moved on (nit)

`packages/relay/src/relay.ts:56-63` — a resend of `<id>@<v>` with `continues` after the continuation
has been amended or revised by its source gets `source-item-changed`, and the relay throws. A resend
only happens after a lost response, and the next poll self-heals. The throw is a plain `Error`, so
it counts as one item's failure, which is right.

### 9. The source's word holds asset references nothing else counts (nit)

`packages/adapters/store-sqlite/src/mapping.ts:233-235`. The word is stored as JSON and its
`assets` are not in `item_assets`. If a person's edit drops an attachment, the sweep may take an
asset that only the word names, and the mirror record's asset list does not carry it. A re-read
still compares by id, so dedup survives. A rebuild, or a reader of `Item.sourceWord`, gets a
dangling ref.

### 10. Decisions in `lines.ts` and the refused-continuation path have no direct tests (nit)

`keptWord` is pure and untested on its own. `rereads.test.ts` does not cover:

- a fixed-field mismatch naming the holder
- a source-made revision clearing the word
- a revision of a revision carrying the word
- a resend of a continuation after a person edited it
- the shell's id replay after an edit (the plan's own unknown)
- an edit behind the head (finding 1)

No relay test covers `relay.ts:56-63`. The plan ticks "core unit tests for each resolution branch",
but there are none in `packages/core`. The integration file covers the branches, so the tick
overstates what exists.

### 11. `headOf`'s doc comment does not parse (nit)

`packages/core/src/pool/lines.ts:7` — "Where a re-read of the identity `item` belongs to lands".

### 12. `continues-not-head` message covers only one of its causes (nit)

`packages/client/src/errors.ts:157` — "that capture was continued, or revised, since". The refusal
is also returned for a missing item and for a head from another source.

---

## Non-issues

- **Race on `continues`.** The sqlite store serialises writes behind one write lock, so the
  head check and the insert cannot interleave. The partial unique index is a backstop, not the
  guard.
- **`continuationOf` cost.** `WHERE continues = ?` can use the partial index (`continues IS NOT
  NULL` is implied). An unedited relayed item costs one extra indexed lookup per poll. A walk only
  happens on lines with history.
- **`revisedInto` order.** Ordered `created_at, id`, and a revision's `created_at` is the clock at
  revise time, so "latest" is the most recent edit. Sibling revisions already in a pool resolve to
  the last one, as the plan accepts.
- **`fixedByItem` now compares `continues`.** The client and raycast never send it, so an id replay
  is unchanged for them. A continuation's own resend matches it.
- **Non-relay sources.** The shell and raycast capture with an `id` and hit the id branch, which is
  unchanged. A source's resend after somebody else edited its item now answers `already-captured`
  rather than `source-item-changed`, which is the intended change.
- **No backfill of the source's word.** Accepted in the ADR as a one-time misread per pre-existing
  amended item.
- **Frontmatter carries neither field.** Deliberate (mirror.md). `FIXED_KEYS` filters the nulls.
- **openapi, daemon schemas and generated client types agree.** `CAPTURE_STATUS` maps both new
  refusals to `409`, and the errors table in http-v1.md matches.
- **relay-memos full-stack expectation moved from `revised=1` to `amended=1`.** A reading that
  differs only by `hashtags` now edits the unprocessed head revision instead of making a sibling.
  This is the chain working.

---

## Resolution

All twelve resolved on 2026-10-20, with the developer's decisions on 1 and 3.

1. **Only the head of a line is revised.** An edit that would revise an item already revised or
   continued is refused `409 not-head`, naming the head; an amendment is not. Both paths are
   tests in `rereads.test.ts`, and the line holds after each. The continuation's identity is
   `<id>@<version>/continued`, apart from the relay's edits. ADR 64, core.md, http-v1.md,
   client.md and CONTEXT.md say so, and ADR 21 is marked amended.
2. A capture naming `continues` drops the trigger tags a template declares and fires none, in the
   pool rather than the relay, so any source gets it.
3. A re-read under a source identity is decided on the payload alone; a changed capture time or
   offset is ignored and the first kept.
4. `amendItem` takes `sourceWord: Payload | undefined`, required.
5. `continues` must name a head that keeps a source's word, so only a head somebody else edited
   can be continued.
6. A revision drops only the `route/` tags a template declares. CONTEXT.md's **Trigger tag** no
   longer says a revision carrying one fires nothing.
7. http-v1.md's independence line and tag-count line are amended.
8. Left throwing, as the review judged right, and now covered by `packages/relay/src/relay.test.ts`.
9. Stated in core.md and ADR 64: the word is only compared, its asset ids hold no bytes, and a
   source re-uploads what it names.
10. Unit tests for `headOf`, `lineSourceOf` and `keptWord` in `packages/core/src/pool/lines.test.ts`;
    the listed edge cases in `rereads.test.ts`; the refused continuation in `relay.test.ts`. The
    plan's tick is annotated.
11. The comment parses.
12. The message covers all three causes.
