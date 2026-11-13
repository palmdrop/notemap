# A batch in the log

**Date**: 2026-11-12
**Status**: Done
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`
**Closed**: 2026-11-12

---

## Goal

The log draws a batch as one collapsed row that counts what came of it in the notice's own words
and opens to every entry it caused, wherever those entries fell in time. A batch's notice links
to the log read by that batch, where the refused and skipped items are named.

Closes `todo.md`'s "Group a batch's entries in the log", and the open task in
[batch-processing](batch-processing.md): "Which items failed or were refused, readable from the
result".

---

## Settled

- **Every entry a batch's reservation causes carries the batch id.** Core takes it from the
  record's `applied.batch`, and puts it on `routed`, `delivery-failed`, `work-abandoned`,
  `delivery-cancelled`, and the `untagged` entry that gives a trigger tag back. Withdrawing and
  reinstating are later gestures of their own and carry none. This goes in ADR 67 as a dated
  amendment, not a new ADR.
- **`GET /v1/actions?batch=`** narrows the read to one batch. Like `item`, it is not validated:
  an id no batch wrote answers an empty page. It composes with `item` and `kind`.
- **One batch is drawn as one row, where its first entry falls in reading order.** Newest-first,
  that is the batch's latest activity, so a late failure brings the batch back to the head.
  Batch entries further down the walk are not drawn again.
- **A drawn group completes itself** by reading `?batch=` without the reading's kinds, page by
  page until there are no more. Its count is then right whichever page or day its entries fell
  on. Opened, it draws only those of its entries that the reading's kinds hold.
- **A reading narrowed to one item stays flat**: a batch touches an item once.
- **The batch reading** is `/log?batch=`, drawn flat. Its head says `BATCH`, then the batch's
  count, then `all of the log`, as `history` does.
- **Refused and skipped items come from the client, not the pool.** Core writes nothing for a
  refusal or a skip. While this client holds the batch's answer in `client.batches`, the batch
  reading draws a row for each refused and skipped item, and every count of that batch includes
  them. Elsewhere, and after a reload, a batch counts only what the log holds.
- **The count is the notice's.** The group row and the batch reading reuse `resultOf`'s words:
  `3 notes routed`, the template bold, then `1 failed, 1 refused`, in the accent where anything
  failed or was refused. **No middle dot** (`·`) anywhere, between counts or anywhere else. The
  separators are the notice's own: space, and a comma between counts.
- **The notice links to the batch reading** via its `href`.
- **Batches from before this change are left as they are.** Their deliveries carry no batch id,
  so their group holds only the tag, untag, archive and unarchive entries, and the deliveries
  draw as ordinary rows.

---

## Unknowns

- **A page that adds no visible row.** A page made up only of a drawn batch's entries draws
  nothing new, so `More`'s foot may stay in view without asking again. Fallback: the log walks
  on by itself while a page it read added no visible row and there is more to read.
  _Answered: `More` asks again whenever a read ends with its foot still in view._
- **Working out the batch's action from the log alone.** Where the client no longer holds the
  batch, the action is read from its entries: a `tagged`, `untagged`, `archived` or `unarchived`
  with no `record` in its detail. A `template-fired` names the template. A batch whose own
  entries all fell outside the walk is still counted, because completion reads it whole.
  Fallback, should no such entry exist (a batch that changed nothing): the row says what the
  log holds, by kind, in the same comma-separated form.
- **A watcher arrival moves a group.** An entry arriving for a batch that is already drawn takes
  the group to the head. Moving a whole row could read as motion about nothing. Fallback: the
  group moves without sliding, and only its count changes in place.
  _Taken: a group never slides._
- **The index on `actions(batch)`.** ADR 67 says grouping might want one. Add it in the
  migration: it costs one column index, and without it the read is a scan per drawn batch.

---

## Tasks

### Phase 1: core puts the batch on delivery entries

- [x] Branch `agent/batch-in-the-log`. _(2026-11-12)_
- [x] Core: one helper beside `templateDetail` (`packages/core/src/pool/routing/delivery.ts`)
      answers a record's batch. `routed` and `delivery-failed`/`work-abandoned`
      (`packages/core/src/pool/work.ts`), `delivery-cancelled`
      (`packages/core/src/pool/routing/route.ts`), and `releaseTriggerTag`'s `untagged`
      (`packages/core/src/pool/templates/fire.ts`) carry it.
- [x] Tests in core: a batch's reservation that lands, fails and is given up on, and one that is
      cancelled. Each entry carries the batch. A reservation made by a single tag carries none,
      and neither do withdrawing and reinstating.
- [x] core.md: the entries a batch's reservation writes. ADR 67: a dated amendment.
- [x] Verify: `pnpm --filter @notemap/core test`, typecheck, lint.
- [x] Commit.

### Phase 2: read the log by batch

Depends on nothing in phase 1. Verified against it.

- [x] Core's `ActionQuery` takes `batch`. The SQLite store filters on it, and a migration indexes
      `actions(batch)`.
- [x] Daemon: `batch` on `GET /v1/actions`, carried on `next`. OpenAPI written again, and the
      client's types regenerated from it.
- [x] Client: `ActionsRequest.batch`.
- [x] Tests: the daemon route over the SQLite store (batch, batch with item and kinds, `next`),
      client query string.
- [x] http-v1.md: the parameter, and the line "Nothing reads by it yet" goes. client.md: the
      read.
- [x] Verify: tests, typecheck, lint, `pnpm test:stack` (crosses the HTTP surface).
- [x] Commit.

### Phase 3: the shell draws a batch as one row

Depends on phase 2.

- [x] `batching.ts`: the batch's count from its log entries, with the client's answer folded in
      where held, through `resultOf`.
- [x] `log.svelte.ts`: the `batch` reading, read from and written to the URL (`logHref`). The
      groups derived from what the walk holds, the completion read per drawn batch, kept per
      walk and dropped on a restart, sign-out or race. Arrivals join their group.
- [x] A group row in `components/log/`: stamp and `BATCH` in the rail, the count in the body,
      and a press opening it to its entries as ordinary rows. In the accent where anything failed
      or was refused. The count is not a link: shell.md says a row of the log offers no
      narrowing, so the batch reading is reached from the notice.
- [x] The batch reading's head, and its refused and skipped rows drawn from `client.batches`.
- [x] The batch notice's `href` to the batch reading (`tallies.ts`).
- [x] shell.md: the log section (the group, the batch reading) and the batch notice's link.
- [x] Tests: grouping across pages and out of time order, a group's count once complete, kinds
      narrowing what an opened group draws but not its count, the item reading flat, an arrival
      joining its group, refused and skipped rows only while the client holds the batch, the
      notice's href, no `·` in what a group says.
- [x] Tick `todo.md`'s "Group a batch's entries in the log", "batch processing" and "batch
      processing by tag", and batch-processing.md's open result task.
- [x] Verify: tests, typecheck, lint.
- [x] Commit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
