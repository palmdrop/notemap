# Review: Editable until processed

**Date**: 2026-08-24
**Status**: Resolved
**Scope**: PR #23, `agent/editable-until-processed-build` against `main`
**Plan**: `docs/plans/editable-until-processed.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/sync.md`, `docs/specs/mirror.md`, `docs/specs/shell.md`

---

## Overall

The plan is built, all six phases, and the shape it argued for holds up: the seal is a decision
about the item, a revision is an ordinary capture, and collapsing the feed, the queue and the
archive onto `created_at, id` is a genuine simplification rather than a rename. All six specs carry
dated `Shipped:` entries. `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`,
`pnpm format:check` are green here and `openapi.json` regenerates to no diff.

Two things need fixing before merge. Dropping `items_one_revision_each` took away the only index on
`revision_of`, and that index was carrying two hot lookups besides the uniqueness it was named for —
the queue's revision anti-join and the `revisedInto` hydrate both fall to a full table scan. And the
edit's replay match is not, despite what two specs say, the one a capture gets: it ignores the
payload, so an edit resent under a taken identity with different words is answered `200` with the
old revision and the new words are dropped.

---

## Bugs

### 1. Nothing indexes `revision_of` any more

`packages/adapters/store-sqlite/src/migrations.ts:577` — `items_one_revision_each` was
`ON items (revision_of) WHERE revision_of IS NOT NULL`, and dropping it is right for the rule it
enforced. It was also the only index on that column, and two lookups were riding on it: the queue's
revision anti-join (`pool-store.ts:113`) and the `revisedInto` hydrate (`pool-store.ts:396`), which
runs on every feed page, every queue page and every single-item read.

`EXPLAIN QUERY PLAN` over the migration list, before and after the last entry:

```
before                                             after
SCAN item USING INDEX items_queue                  SCAN item USING INDEX items_queue
  SEARCH revision USING COVERING INDEX               SCAN revision
    items_one_revision_each (revision_of=?)
  SEARCH routed USING COVERING INDEX                 SEARCH routed USING COVERING INDEX
    routing_records_item (item_id=?)                   routing_records_item (item_id=?)

hydrate: SEARCH items USING INDEX                  hydrate: SCAN items USING INDEX items_feed
  items_one_revision_each (revision_of=?)
```

So a queue page is now a scan of `items` per candidate row, and a hydrate is a scan of `items` per
call. core.md:470 states the opposite as a requirement — "an anti-join per queue page, which the
store is expected to index for rather than denormalise around" — and `routing_records_item` exists
in `migrations.ts:322` for exactly this, with a comment saying so. The revision clause is the one
the plan said now "carries weight rather than agreeing with the routing clause by coincidence", so
it is the wrong one to leave unindexed.

Fix: replace it in the same migration rather than only dropping it —
`CREATE INDEX items_revision_of ON items (revision_of) WHERE revision_of IS NOT NULL`. Both plans
go back to `SEARCH ... USING COVERING INDEX items_revision_of`; confirmed by running the same
`EXPLAIN QUERY PLAN` with it added.

### 2. A replayed edit ignores the payload, where a replayed capture does not

`packages/core/src/pool/edit.ts:99` — the replay match is `replayed.revisionOf === item.id` and
nothing else. `capture.ts:62` runs `isReplayOf`, which compares source, source item id, capture
time and the canonical payload, and refuses `source-item-changed` when they differ.

```
edit(A, {web-edit, S1, "first words"})   → revision R
edit(A, {web-edit, S1, "second words"})  → 200 { revised, revision: R }
```

The second call is answered as a replay of the first. `R` still says "first words", the new words
are never written, and the caller is told it succeeded — where the same mistake on a capture is a
`409`. core.md:277 and http-v1.md:509 both say a revision "is matched for replay exactly as a
capture is", so this is code and spec disagreeing, not an undocumented choice.

Fix: compare the payload too and refuse `source-item-changed` when it differs, which makes the
specs' word "exactly" true. If identity alone is wanted instead, both spec lines have to stop
claiming capture's rule.

---

## Design

### 3. `arrived()` puts every arrival at the head of the feed whatever order it is being read in

`packages/client/src/state/state.ts:271` — the feed insert is
`[item.id, ...state.feed.ids]`, unconditionally. `loadFeed(order)` supports `oldest-first`
(`client.ts:128`, `reads.ts:80`), where the newest arrival belongs at the far end and only if the
page has read that far. The queue gets this right two lines down, through `intoQueue` and
`loaded()`; the feed has no equivalent.

Pre-existing for captures, but this PR routes revisions through the same function. The `revised()`
it replaced placed the revision at an index it computed, so for an oldest-first feed this is a
regression rather than an inherited quirk.

### 4. No surface offers the gesture that makes a revision

`apps/ui/src/components/queue/QueueRow.svelte:128` hides `edit` on a processed item, and
`FeedRow.svelte` has never offered one. The queue only ever holds unprocessed items, so between
them the shell cannot deliberately revise anything — the whole revision path, the envelope, the
`sourceItemId` and `revised()` included, is reachable only when another device processes an item
between the draw and the send.

That may well be the intent, and the row comment argues it ("the queue is not where to do" it). But
shell.md's new entry says the edit is offered "only where there is one to make", which reads as a
narrowing rather than as *the shell cannot revise at all*. Either the feed row grows the action or
shell.md should say plainly that revising is not yet a shell gesture.

### 5. One refusal code, two causes, and the message now fits only the new one

`packages/client/src/errors.ts:88` — "that capture already exists, with different content" became
"something else in the pool already claims that id". For the edit case that is right. For the
capture case (`capture.ts:64`) the refusal means the caller's *own* capture is already there under
that identity, with different words, and the new message neither says that nor suggests what to do.

---

## Minor

### 6. Two test names are swapped

`tests/integration/src/edit.test.ts:369` is called "makes an unrevised item a person's to edit
again" and revises the item before cancelling, then asserts a second `revised` — which is the other
test's claim. `:385` is called "leaves an item something was revised from sealed" and revises
nothing, asserting `amended`. Both behaviours are covered; the names point at each other.

### 7. A comment above the edit describes machinery that does not exist

`packages/client/src/client.ts:171` — "the outbox rewrites an un-sent capture in place and sends a
domain edit once it cannot". `opposes()` pairs operations only through `Handler.opposedBy`, and
`capture` declares none, so an edit never touches a pending capture. Pre-existing, but it sits
directly on top of the lines this PR rewrote.

### 8. The dated entries still page the queue from a content time

`docs/specs/http-v1.md:61` and `docs/specs/core.md:78` say the queue and the archive read "from a
content-time position", and both carry an inline `*(reversed 2026-08-17: ...)*` note for the
`order` change in the same sentence — so the convention is to annotate a reversal where it lands,
and this reversal was not. `http-v1.md:146` is worse: "Settled here, and what is still stub" reads
as current scope, and it says content-time with no date attached to the claim.

### 9. Two filters or three

`docs/specs/core.md:449` — "the queue and the feed are one ordering read through two filters".
There are three surfaces; http-v1.md:359, the migration comment and `byCaptureTime` all say three.

---

## Non-issues

- **A retry that crosses the seal can still make a revision holding content already applied.** An
  edit that amended, then a route, then a resend: the seal genuinely fell in between, and nothing
  claims at-most-once across it.
- **The migration failing outright on a pool whose revisions share an identity.** Deliberate, ADR 9,
  and pinned by `migrations.test.ts:433`. `migrate()` wraps each entry in `BEGIN IMMEDIATE` and
  rolls back, so the failure is clean.
- **`revisedInto` always on the wire where `archived` and `routing` stay absent.** Decided, and
  http-v1.md:284 carries the amendment that says why.
- **`EditEnvelope` carrying no tags.** A revision inherits the item's, with their attribution,
  in `revise()`.
- **`mayEdit` gating the open editor as well as the action** (`QueueRow.svelte:87`). The form
  vanishes rather than going read-only, but `editing` is row-local and the row is redrawn from what
  the pool answered.
- **`itemBySourceIdentity` losing its `revision_of IS NULL` carve-out.** The unique index is global
  now, so the lookup matches at most one row on its own — and the port comment says exactly that.

---

## Resolution

Reconciled with the author's own review on 2026-08-25 and worked on the same branch, after a rebase
onto `main` picked up #22.

1. **Fixed.** `items_revision_of`, a plain partial index on `revision_of`, replaces the uniqueness
   that was dropped. `schema.test.ts` pins the plan with `EXPLAIN QUERY PLAN` rather than trusting
   the index to stay.
2. **Fixed.** `revise()` compares the canonical payload as well as the link, so an identity resent
   with different words is `source-item-changed` instead of a success carrying the earlier
   revision. `canonical` moved from `capture.ts` to `payload.ts` as `canonicalPayload`, shared by
   both matches. core.md and http-v1.md say the payload is part of the match.
3. **Fixed.** `arrived()` places on both surfaces through `intoPage` — `intoQueue` renamed, since it
   is no longer the queue's alone — and `loaded()` answers an unread page by its order: an arrival
   is at the boundary reading newest-first and past the far end reading oldest-first.
4. **Won't fix, recorded.** Growing an edit on the feed row is a feature, not a review fix. shell.md
   now says outright that a revision is something this shell reads and cannot make, and `docs/todo.md`
   carries the choice.
5. **Fixed.** The message says what both causes have in common — something else was captured under
   that id, saying something different.
6. **Fixed.** The two names now sit on the bodies that earn them.
7. **Fixed.** The comment is gone.
8. **Fixed.** Both dated entries carry a `(reversed 2026-08-24: ...)` note, and the scope list says
   capture time.
9. **Fixed.** Three surfaces, three filters.

The author's own findings landed in the same pass: `client.edit` takes the source per call, the
shell passes `TYPED`, and `ClientConfig.source` and `web-edit` are gone — a rewrite through a
channel wants that channel's policy, which is the only thing a separate source would buy, and
`revisionOf` already records that it was an edit. The daemon keeps `{kind: "person"}`. Comments that
restated their own code were cut.
