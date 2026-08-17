# Review: Editing and classification

**Date**: 2026-08-17
**Status**: Partially addressed <!-- Open | Partially addressed | Resolved -->
**Scope**: PR #15 — `packages/core/src/pool/{edit,tags,payload}.ts`, `packages/adapters/store-sqlite`, `apps/daemon/src/routes/{edit,tags}.ts`, `packages/client/src/outbox`, `apps/ui/src/components/queue`
**Plan**: `docs/plans/editing-and-classification.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`

---

## Overall

Core and the store are the strong half and they are the half that mattered: the amend-versus-revise
decision reads exactly as `core.md` states it, the revision's carry-over rules are carried out
literally, and the chain key (`root_id`, `revision_depth`) is the right answer to ordering a revision
against its original by the link — stated, argued, and paid for once at write time rather than per
read. `/v1` and its spec landed together, the refusal table is complete, and the `Shipped:` trail is
in all three specs the plan names.

The weak seam is the client's reconciliation now that supersession exists. `settle` was written when
nothing could supersede an item, and it still puts any non-archived item the pool answers with back
into the queue — so an operation settling against a superseded original resurrects it beside its own
revision. The same trace loses a tag: an operation enqueued against an item the pool then revises is
sent against the dead original, and core has nothing to refuse it with, because `TagRefusal` never
grew the `item-superseded` that `EditRefusal` did. Findings 1–3 are one story with three fixes.

Nothing here is in core's transaction logic, and nothing threatens data in the pool.

---

## Bugs

### 1. `settle` puts a superseded item back into the queue

`packages/client/src/state/state.ts:183` — the settlement asks one question of the item the pool
returned:

```ts
const ids = item.archived
  ? without(state.queue.ids, item.id)
  : intoQueue(state.queue, item.id, items);
```

Being superseded is the other way an item leaves the queue — the store says so directly
(`pool-store.ts:107`, `QUEUED` excludes any item a revision points at) — and `settle` does not ask.
So any operation that settles against an original the pool has already revised re-inserts it:

```
edit A → pool revises → revised() drops A from the queue
tag A settles → settle() sees archived === undefined → intoQueue() puts A back
→ the queue shows the superseded original and its revision side by side
```

The item the pool answers with carries `supersededBy` (`generated.d.ts:1635`), so the client already
has the fact it needs.

Fix: drop from the queue on `item.supersededBy !== undefined` as well as `item.archived`.

### 2. An operation enqueued against an item the pool then revises is applied to the dead original

`packages/client/src/outbox/kinds/edit.ts:37`, `packages/client/src/outbox/outbox.ts:143` — operations
against one item drain in order on `targetOf(operation)`, which is the item id the caller named. That
ordering is what opens the window: a `tag` enqueued while an `edit` is in flight waits for the edit,
and by the time it is sent the pool may have answered `revised`.

```
tag A queued behind edit A → edit answers { kind: "revised", revision: R }
→ R was built before the tag existed, so it does not carry it
→ tag A is sent against A, which is now superseded
→ core does not refuse it (finding 3), so the tag lands on the item nobody sees
```

The person tagged what was on screen and the tag ends up on the superseded original — and, via
finding 1, drags that original back into the queue to show for it. The tag is not lost from the
pool, but it is attached to the wrong item and invisible where it was asked for.

Fix: two halves. Core refusing a superseded subject (finding 3) turns this from a silent
mis-attachment into a refusal the person sees. Making it right rather than merely visible means the
`revised` settlement re-targeting the operations still queued against the original onto the revision
— which is a decision for `client.md`, not something to slip in.

---

## Design

### 3. `TagRefusal` never grew `item-superseded`, though `EditRefusal` did

`packages/core/src/types/api/refusal.ts:49` — an edit against a superseded item is refused, with the
argument written beside it in `edit.ts:29`: edits go to the end of the chain, and forking it leaves
two live revisions with nothing saying which is current. Classification has exactly the same problem
and no refusal: `TagRefusal = SubjectRefusal`, and `tags.ts` reads the item, finds it, and tags it.

A tag on a superseded item is not a fork, so it is not the same severity — but it is the same
mistake, and it is one the caller cannot detect. The revision does not inherit tags added to its
original after the revision was made, so the tag is simply somewhere nobody looks.

This is a spec question before it is a code one: `core.md`'s classification section says nothing
about a superseded subject either way. Deciding it needs a line there and a row in `http-v1.md`'s
refusal table (`409`, as editing's is), not just a case in `tags.ts`.

### 4. An operation's undo is a whole-item snapshot, replayed at settle time

`packages/client/src/outbox/kinds/edit.ts:31` and `outbox.ts:96` — every `undo` restores the item
object as it stood when the operation was applied:

```ts
undo: (current) => ({ ...current, items: cached(current, [previous]) })
```

Rolling back on a refusal, that is right: nothing else has touched the item, because the outbox holds
the only mutation path. The `Settlement` this PR adds changes that — `revert` is now invoked on a
*successful* answer, arbitrarily long after the apply, and anything optimistically applied to the
same item in between is discarded with it. In the finding-2 trace the tag disappears from the view at
this point, before the wire ever gets involved.

It self-heals today only because the discarded operation is still in the outbox and will settle with
the pool's copy. That is luck, not design: the undo is a snapshot where a targeted reversal (undo
*this* change to the item, leave the rest) is what a settle-time revert needs.

Not urgent — one operation currently reverts on success — but `Settlement` is the seam that makes it
reachable, and the next kind with a two-shaped answer inherits it.

---

## Minor

### 5. An amendment reorders the pool's queue but not the client's

`packages/client/src/outbox/kinds/edit.ts:22` sets `contentUpdatedAt` on the cached item but touches
no list, and the settlement's `intoQueue` (`state.ts:72`) returns early for an id the page already
holds. The pool moves the amended item to the newest end — deliberately, and tested
(`tests/integration/src/edit.test.ts`, "moves the amended item in the queue") — so the two disagree
about queue order until a reload. `client.md`'s observable list says an amendment "keeps it in
place", which reads as being about the item's identity rather than its rank, so this may be the
intent; if so it is worth one clause there saying which.

### 6. An unconfigured payload type makes an edit skip every payload check

`packages/core/src/pool/edit.ts:57` — `unknown-payload-type` is dropped from `checkPayload`'s answer,
and the comment argues the case for the schema: a host that has since dropped the type leaves nothing
to check against. But `checkPayload` returns on the first problem, so a dropped type also skips the
required-slot check, which does not depend on the schema and could still be enforced. The window is
narrow (config edited between capture and edit) and the outcome is permissive rather than wrong.

### 7. A whitespace-only tag is accepted

`apps/daemon/src/schemas/tags.ts:11` — `z.string().min(1)` refuses `""` and admits `"   "`, which
becomes a tag rendered as an empty chip. The shell trims before calling (`Tags.svelte:15`), so this
is only reachable by a direct request. `core.md` does not say what a tag name may be; if it should,
that is the place, and the route can follow it.

---

## Non-issues

- **`root_id` and `revision_depth` are derived and stored anyway** — the migration argues it, and the
  argument holds: the link is written once and never rewritten, so unlike `superseded` or
  `processed` there is no later state for the column to fall out of step with.
- **Editing an archived item produces an unarchived revision, quietly returning it to the queue** —
  `core.md` says archive state stays behind, and it is tested. Not reachable from the shell, which
  offers editing on queue rows only.
- **`amendItem` throws rather than refuses on a missing row** — core reads the item inside the same
  transaction first, so it is unreachable; a throw is the right shape for a store invariant.
- **The tag routes carry no agent** — argued in `tags.ts` and in `http-v1.md`: with no
  authentication there is nobody for a client to be, matching archiving and routing.
- **`revise` records one action against the original rather than one per item** — the `revised`
  action carries the revision's id in its detail, which is the whole fact.
- **Row-value comparison in `feedKeyset`** — `(a, b, c) < (?, ?, ?)` needs SQLite 3.15+, comfortably
  below what `node:sqlite` bundles.

---

## Resolution

Reconciled with the PR review on 2026-08-15..17 and worked in the same round. The developer's own
findings are recorded below the numbered ones, since they had no entry above.

1. **Fixed.** `settle` drops an item from the queue on `supersededBy` as well as `archived`, so an
   operation settling against a revised original no longer resurrects it. Covered by a client test
   that tags an original after the pool has superseded it.
2. **Deferred, planned.** Re-targeting operations still queued against an original onto its
   revision is a `client.md` decision and its own slice:
   [client-follows-supersession.md](../plans/client-follows-supersession.md). Finding 3 makes the
   case visible in the meantime — the queued operation is refused rather than silently applied to
   an item nobody reads — and the refusal carries the revision's id, which is what that plan
   recovers from.
3. **Fixed.** `TagRefusal` gained `item-superseded`, both halves refuse it, `409` in the refusal
   table, and `core.md`'s classification section states the rule.
4. **Fixed.** The `edit` and tag undos restore only the fields they wrote, rather than the whole
   item as it stood — a settlement reverts long after its apply, and what reached the item since
   is not the guess's to discard.
5. **Fixed.** `settle` re-ranks rather than leaving the item where it was drawn, so an amended item
   takes the content time the pool gave it and leaves a window that no longer reaches it.
   `client.md`'s observable list says so.
6. **Won't fix — the finding is wrong.** The required-slot list comes from the payload-type
   descriptor, so when the type is unconfigured there is no slot list to check against either.
   Nothing is skipped that could be checked.
7. **Fixed, in core rather than at the route.** Core trims the name and refuses one that trims to
   nothing (`tag-invalid`, `422`); the route no longer polices it. Normalising at the wire would
   have left the absorb behaviour broken off-wire, since core decides idempotency by comparing the
   name against what is stored. A capture's tags are trimmed on the same path, and a blank one is
   dropped rather than costing the whole capture.

From the PR review:

8. **Fixed.** `untag` takes the agent that removed the tag, rather than core asserting that only a
   person ever untags. `core.md` records the reasoning; the route still supplies an anonymous
   person, since the wire carries no agent.
9. **Fixed.** The comment on `tagHandler` is gone, along with a sweep of the rest of the slice —
   restatement, spec duplication and rationale that belongs in the docs.
10. **Answered, no change.** `toPayload` is a 1-to-1 map because each field is branded or narrowed:
    `parsed as Payload` does not compile, and neither does a spread casting only the branded
    fields. The only shorter form is `as unknown as Payload`, which stops checking shape entirely.
11. **Fixed, the other way.** `generated.d.ts` stays committed — codegen is manual and wired into
    nothing, so ignoring it breaks a fresh clone's typecheck — and a test now regenerates it from
    `openapi.json` and fails on drift, which is how `openapi.json` itself is already guarded.

12. **Fixed.** `items.edit` takes the agent that made the edit, in both `amend` and `revise` —
    the same shape finding 8 rejected in `untag`, raised separately because it changed a signature
    the developer had not seen, and confirmed. `core.md`'s editing section records it.
