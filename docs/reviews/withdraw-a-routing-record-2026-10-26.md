# Review: Withdrawing a routing record

**Date**: 2026-10-26
**Status**: Resolved
**Scope**: `git diff main...HEAD` on `agent/withdraw-a-routing-record` (6 commits)
**Plan**: `docs/plans/withdraw-a-routing-record.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/shell.md`, `docs/specs/mirror.md`, `docs/specs/client.md`

---

## Overall

The implementation matches the plan and ADR 66. Every SQL reader of `routing_records` that
decides an item's routing now filters on `withdrawn_at IS NULL`: `ROUTED`, `QUEUED`,
`routedTo`, `reprocess`, `rememberedPlaces`, the template fired count, and the hydrated
summary. `namedBy` (destination deletion) and `namedAsOutput` (blob GC) correctly keep counting
withdrawn records. Core's `sealed()` and `alreadyApplied` skip them. Typecheck, tests and lint are
green. The main problem is that restore never asks whether the same template has already
decided again. A re-applied trigger tag followed by a restore leaves two standing decisions from
one template, which is the duplicate delivery the ADR's no-fire restore was meant to prevent.

---

## Bugs

### 1. Restore after a re-applied trigger tag leaves two standing decisions from one template

`packages/core/src/pool/routing/withdraw.ts:40-66`. Restore checks only `withdrawnAt` and the
edit time. It never checks `alreadyApplied`.

```
R1 fired by #research, delivered → withdraw R1 (tag comes off)
→ person tags #research again → R2 reserved (alreadyApplied ignores R1)
→ restore R1: tag already present, so returnTriggerTag does nothing, and R1 stands again
→ R2's window closes and it delivers → two copies in the vault, both standing
→ withdraw R2 later: releaseTriggerTag removes the tag while R1 still stands from that template
```

The integration test "leaves the tag alone on restore where the item already holds it again"
(`tests/integration/src/withdraw.test.ts:345`) runs this exact sequence and asserts only on the
`tagged` entry. It never looks at R2, which is still pending and will deliver.

Fix: inside restore's transaction, refuse with a new refusal kind such as
`applied-again` when `alreadyApplied(tx, item, record.applied.template)` returns another record.
Cancelling R2 instead would be a second, silent decision. Either way, ADR 66 and core.md should
name the case.

### 2. A successful withdraw or restore reads as failed if the follow-up reread fails

`packages/client/src/client.ts:758-762`. The `settled` dep calls `reread(item)`, which throws
when the item fetch fails. The routing `reread` dep just below catches that error and `settled`
does not. `client.routing.withdraw` then rejects after the POST has succeeded. Block.svelte
shows the error, does not set `changed` and offers no `restore`, but the pool has already
withdrawn the record. A second press is then answered `already-withdrawn`.

Fix: once the POST has answered, swallow a failed reread, or report it separately, as `reread`
already does.

---

## Design

### 3. "Restore" is a term CONTEXT.md lists to avoid

`CONTEXT.md:169` (Rebuild) and `CONTEXT.md:598` (Hydration) both list _restore_ under _Avoid_.
The new **Withdraw** entry (`CONTEXT.md:494`) now uses **Restoring** as the name of its inverse,
and the code exposes `restore`, `delivery-restored`, `RestoreRefusal` and `/restore`. Either give
restoring a withdrawal its own glossary entry and narrow the two _Avoid_ lists, or pick another
word. Separately, "withdraw" already means pulling a job in the code (`tx.withdrawWork`,
`WorkWithdrawal`, used by `cancelDelivery`). Before this branch, the client's `withdrawn` dep
also meant cancel. That dep was renamed, but `withdrawWork` sits next to `withdraw` in the same
port.

### 4. Restore's edit check misses an edit in the same millisecond as the withdrawal

`packages/core/src/pool/routing/withdraw.ts:56`. It compares
`Date.parse(contentUpdatedAt) > Date.parse(withdrawnAt)`, so an amend stamped in the same
millisecond as the withdrawal passes, and so would one under a frozen test clock. A person
cannot hit this, but an API caller can. A monotonic signal would make the check exact, for
example an amend recorded after the `delivery-withdrawn` action, or `>=` together with the
withdrawal's own timestamp. As written, the check depends on clock resolution.

### 5. The block's `changed` override never lets go

`apps/ui/src/components/record/Block.svelte:247-258`. Once this view has withdrawn or restored,
`changed` overrides `record.withdrawnAt` for that id for the life of the component, even after
`onundone` rereads. In the log, where `onundone` is not wired, the "routed" row and the
"delivery-withdrawn" row for the same record also disagree until reopened. If another device
restores or withdraws meanwhile, this block keeps showing the stale state. Clearing `changed`
whenever the incoming `record.withdrawnAt` agrees with it would bound the override to the gap it
exists for. The recordId reset effect (`:265-272`) also leaves `failed` and `looking` alone.

### 6. The item view now reads records for every item

`apps/ui/src/components/item/Item.svelte:54`. A never-routed item now costs a
`GET /v1/routing/{item}` on every item view, so that a wholly withdrawn item can show its
history. Item summaries no longer distinguish "never routed" from "only withdrawn", so the extra
request has no cheaper alternative here. The cost is worth naming in shell.md, or the summary
could carry a `withdrawn` count, which would let the view skip the read.

---

## Minor

### 7. The WebDAV `folderAt` probe runs after every failed append

`packages/adapters/destination-webdav/src/notes.ts:275`. The catch wraps the whole append loop,
so a weak ETag, contention exhausted, a failed `placeAssets`, or a network error each costs an
extra PROPFIND. It cannot mask a real failure: the original error is kept unless the path is
confirmed to be a collection, and an aborted signal makes `look` reject and the original error
stand. It can, however, add one more round-trip to an unreachable server, up to the signal's
bound. Separately, `placeAssets` (`:220`) runs before a folder is recognised, so assets are
uploaded beside the folder path and orphaned before the refusal. That is the same exposure as
before for any failed append, so it is not new.

### 8. Arena's `blocksOf` accepts an empty pointer as block 0

`packages/adapters/destination-arena/src/locate.ts:53`. `Number("")` is `0`, which is a safe
integer, so an empty pointer asks for `/v3/blocks/0/connections` and answers `absent` instead of
`unknown`. No current delivery writes an empty pointer.

### 9. "files" in the multi-thing wording cannot occur

`apps/ui/src/lib/presence.ts:16-17`. Only Arena answers `of > 1`, so the `files` branch is dead.
Harmless.

### 10. Comment drift

- `packages/client/src/routing/routing.ts:94`: "processed is derived from holding none" should
  now say holding none that stands.
- `apps/ui/src/lib/action-log.ts:198`: a JSDoc block attached to an `if` statement. Make it a
  line comment, or drop it, since the `withdrawnKey` doc in `lib/routing.ts` already says the
  same.

### 11. Test gaps

- No test that a withdrawn record still blocks deleting its destination. `namedBy` is right
  today because it was left alone, and nothing pins it.
- No test that untagging a trigger tag is allowed once its record is withdrawn, which is the
  `alreadyApplied` path through `tags.ts`.
- No store-level test of `pointers` round-tripping through SQLite, or of
  `setRoutingRecordWithdrawn` throwing on a missing record. The mirror arbitraries cover the
  codec only.
- Nothing covers Finding 1 (restore while a newer reservation from the same template is
  pending).
- Nothing covers Finding 2 (a client withdraw whose reread fails).

---

## Non-issues

- **`namedBy` and `namedAsOutput` count withdrawn records.** A withdrawn record still names its
  destination (foreign key) and its output blob, so it must keep both alive.
- **`rememberedPlaces` excludes withdrawn records.** The spec says a withdrawn record no longer
  counts toward a destination's usage.
- **`setRoutingRecordWithdrawn` touches `modified_at` and reprocesses.** That is what carries the
  change through the delta stream, which answers the plan's third unknown.
- **The migration appends `pointers, withdrawn_at` at the end of `ROUTING_COLUMNS`.** The column
  order, the 19 insert placeholders, `routingRecordParams` and `TABLE_COLUMNS` all agree.
- **Withdraw racing a delivery.** Only `delivered` records can be withdrawn, inside the store's
  write transaction, so no in-flight job remains to race.
- **Restore racing an edit.** Both run under the write lock, and `sealed()` is read inside the
  edit's own transaction.
- **`locate` reads outside a transaction.** This is deliberate, so no lock is held across a
  network call, and the answer is advisory.
- **fs `locate` follows symlinks with `stat`.** `contain` has already resolved the deepest
  existing path and refused one that leaves the root.
- **`releaseTriggerTag` on withdraw also removes a tag the composer wrote after applying the
  template.** This matches cancel's existing "one act either way" rule.

---

## Resolution

Resolved 2026-10-26, on the same branch.

1. Fixed. Reinstating is refused as `superseded`, naming the record that stands, where the template
   has decided on the item again. The integration test now covers this and lets the newer decision
   deliver. ADR 66, core.md and http-v1.md say so.
2. Fixed. `settled` swallows a failed reread, as `reread` does. A client test serves the reread as
   a `503`.
3. Restore is renamed **reinstate** everywhere: the method, the route, `delivery-reinstated`,
   `ReinstateRefusal` and the shell's button. CONTEXT.md's Withdraw entry adds _restore_ to its
   _Avoid_ list. The `withdrawWork` clash is a todo.md entry rather than a rename here.
4. Fixed: `>=`. An edit in the same millisecond is refused, and a test covers it.
5. Fixed. `changed` lets go once the record it was handed agrees, and the reset clears `failed` and
   `looking` too. A Block test covers the case.
6. Moot. The item view no longer draws a record read withdrawn, so it reads records only where the
   item reads as routed again, or where a record it drew has been withdrawn in this view.
7. Left as is: it cannot mask an error, and the asset exposure predates this branch.
8. Fixed. A pointer must be all digits; a test covers it.
9. Fixed. The count wording is Arena's alone.
10. Fixed, both.
11. Added: destination deletion under a withdrawn record, the `pointers` round-trip,
    `setRoutingRecordWithdrawn` on a missing record, and findings 1 and 2. Untagging while only a
    withdrawn record holds the tag is not reachable: the withdrawal takes the tag off, and putting
    it back fires again.
