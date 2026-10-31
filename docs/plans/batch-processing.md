# Batch processing

**Date**: 2026-10-30
**Status**: In progress
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`

---

## Goal

In the queue and the feed a person can mark several rows, apply one routing template or archive
all of them in a single gesture after a confirm step, call the whole batch off with one cancel
while its window is open, and read one notification saying how the batch went. The batch reaches
the pool as one request; each item in it may land or be refused on its own.

Closes `todo.md`'s "batch processing" entry and its "batch processing by tag" sub-entry.

---

## Settled

- **A daemon route, looping over core.** One bulk endpoint in the daemon calls core's existing
  per-item `tag` and `archive` for each item and answers per item. Some may land while others are
  refused. Core's only change is to record a batch id ([below](#the-batch-id)), so core.md's
  "batching and processing rituals belong to the host or client" still holds.
- **Templates only.** A batch routes by applying a template's trigger tag to each item. A one-off
  composer route across many items is out.
- **The queue and the feed both batch.** In the feed the batch may include processed items, so the
  feed's batch is always behind the confirm step.
- **An item the template already filed is skipped, not filed again.** A trigger tag on such an item
  classifies and fires nothing (core.md, 2026-10-29). The confirm step counts these items as
  skipped, and the result names them. Whether a trigger tag should be able to fire twice is a
  separate question, outside this plan.
- **Confirm before commit.** Every batch has a confirm step naming:
  - the count;
  - the template, or archive;
  - how many items will be skipped;
  - how many are already processed elsewhere and would be filed again.
- **One cancel per batch.** While the window is open the status line offers one cancel for the
  whole batch, not one per item.
- **One result per batch.** Once every item in the batch has settled — delivered, failed, refused,
  skipped or cancelled — the status line says so once, in aggregate: "3 filed, 1 failed". The
  failed and refused items can be read from it.
- **Selection is a mode.**
  - Holding `cmd` or `shift` while clicking or moving enters it. `cmd`-click toggles a row.
    `shift`-click marks the range from the anchor to the clicked row. `shift` with `↑↓` or `j`/`k`
    marks the rows it moves across.
  - `space` or `cmd`+`space` on the selected row toggles it.
  - While the mode is on, a plain click or `space` toggles a row without clearing the others.
  - A visible `clear` leaves the mode, and so does `esc`.
  - Outside the mode, a plain click selects one row, as it does today.
  - The surface publishes these commands, and the bindings name their keys
    ([ADR 47](../adr/0047-a-command-is-published-by-the-surface-and-a-binding-names-its-key.md)).
- **Offline: queued.** A batch made offline goes into the outbox as one operation and lands when
  the pool answers.

---

## The batch id

**The client creates a batch id, and the log keeps it.** Grouping a batch's entries in the log can
come later, but only batches that were recorded with an id can ever be grouped. So the id is
written from the first batch, and nothing reads it yet.

- The client creates the id when the batch is made, before it enters the outbox. Replaying the
  batch from the outbox carries the same id, the same way the uploader creates an asset id
  ([ADR 22](../adr/0022-the-uploader-mints-the-asset-id.md)).
- Core's `tag` and `archive` take an optional batch id. Every action-log entry they write while
  doing so carries it, as an optional `batch` field on `Action`, beside `subject`
  (`packages/core/src/types/domain/action-log.ts:44`). Today that means `tagged`,
  `template-fired` and `archived`. Core never makes a batch, never checks one, and never reads one
  back. The daemon's loop is still the only thing that makes a batch, so core.md's "batching …
  belong[s] to the host or client" still holds. Core only records which batch an action belonged
  to.
- The bulk endpoint answers each item with the reservation it made or the reason it was refused.
  The client holds the batch: its id, its item ids and their record ids.
- The single cancel is a bulk cancel over those record ids, using the existing
  `POST /v1/routing/{record}/cancel` rule for each one.
- The aggregate result comes from the client's own log watch, grouped by the batch id.
- Before it drains, a queued batch is withdrawn from the outbox like any other operation.
- No shell draws log entries grouped yet. The log and the activity view still show N entries.

This changes the action log's shape, which ADR 12 and ADR 29 describe, so it gets an ADR of its
own.

---

## Unknowns

- **Archiving an item that is already routed.** Whether `archive` refuses it, accepts it, or does
  nothing is unchecked. Each item's answer is reported either way, so this changes only the
  confirm step's wording.
- **A batch larger than one page.** "Everything the filter holds" means the rows already read, not
  everything the pool would match. Fallback: the confirm step names the count it actually holds.
  A batch over the pool's whole match is out of scope.
- **The trigger window across N items.** Each reservation waits out the window from its own
  firing. A single request fires them all within moments of each other, so one countdown should be
  honest. If it is not, the cancel shows the latest one.
- **Offline confirm counts.** Offline, "already processed" and "skipped" are counted from the
  cache, which can be stale. Fallback: the confirm step marks those counts as the client's view,
  as a cache-drawn surface already is (client.md § surfaces drawn from the cache). The per-item
  answer on drain is what the result reports.

---

## Tasks

### Phase 1 — the log records a batch

- [x] Branch `agent/batch-processing`
- [x] ADR: a batch id the client creates, kept on the action log, which core records and never
      interprets.
- [x] core.md § the action log: the optional `batch` field, and which entries carry it.
- [x] `batch` on `Action`. `tag` and `archive` take it and pass it on. The store keeps it as a
      column. The log route answers it.
- [x] Tests in core: each of `tagged`, `template-fired` and `archived` carries the batch id it was
      given, and carries none when given none.
- [x] Verify: tests, typecheck and lint pass.
- [x] Commit

### Phase 2 — the daemon answers a batch

Depends on phase 1.

- [x] http-v1.md: the bulk endpoint and the bulk cancel. The batch id goes in the request.
  - The bulk endpoint takes item ids plus either a template or archive.
  - It answers per item: a reservation's record id, archived, skipped, or a refusal with its reason.
  - Regenerate `openapi` and `packages/client/src/api/generated.d.ts`.
- [x] Routes in `apps/daemon/src/routes/`, beside `tags.ts`, `archive.ts` and `routing.ts`, with
      schemas. Each one loops over core's per-item operations.
- [x] Tests in the daemon routes:
  - a mixed batch where some items land and some are refused;
  - an item the template already filed comes back skipped;
  - a bulk cancel gives every trigger tag back.
- [x] Verify: `pnpm -r --no-sort --silent test`, typecheck and lint pass; `pnpm test:stack`
      passes, since this changes the HTTP surface.
- [x] Commit

### Phase 3 — the client holds a batch

Depends on phase 2.

- [x] client.md:
  - the batch operation;
  - how the outbox holds it;
  - how a partly refused batch reaches the caller;
  - the batch cancel;
  - the aggregate result taken from the log watch.
- [x] Outbox kind `batch` in `packages/client/src/outbox/kinds/`, beside `tags.ts` and
      `archive.ts`. Register it, and make it update the surfaces optimistically the way a single
      tag and archive do (`packages/client/src/client.ts:667`, `:676`).
- [x] `batch()`, the batch cancel and the batch's result on the client's public surface.
- [x] Tests:
  - queued offline, then drained;
  - partly refused;
  - cancelled before and after it drains;
  - the result settles only once every item has;
  - retention keeps every item the batch names (`packages/client/src/state/retention.ts:17`).
- [x] Verify: tests, typecheck and lint pass.
- [x] Commit

### Phase 4 — marking rows

Depends on nothing; can run beside phases 1–3.

- [x] shell.md: the selection mode, its keys and its `clear`.
- [x] A selection state shared by the queue and the feed, beside the single `selected` each holds
      today (`apps/ui/src/components/queue/Queue.svelte:53`,
      `apps/ui/src/components/feed/Feed.svelte:52`), drawn on the register's rows.
- [x] Commands and bindings in `apps/ui/src/lib/command/` for toggle, range and clear. Check
      `space` against `keys.ts:52`, which answers `space` for a control reached by tab.
- [x] Tests:
  - entering and leaving the mode;
  - toggling;
  - a range, by click and by key;
  - a plain click outside the mode still selects one row.
- [x] Verify: UI tests, typecheck and lint pass.
- [ ] Stage the branch with `agent stage agent/batch-processing` and try it by hand.
- [x] Commit

### Phase 5 — the batch action, confirm, cancel and result

Depends on phases 3 and 4.

- [x] shell.md: the batch action (a template, or archive), the confirm step's wording, the single
      cancel, and the aggregate result in the status line.
- [x] The batch action, offered on the marked rows in the queue and the feed.
- [x] The confirm step: the count, what will happen, skipped, and already processed elsewhere.
- [x] One cancel for the batch in the status line, beside the per-item firings
      (`apps/ui/src/components/status/Firing.svelte`, `apps/ui/src/lib/firings.svelte.ts`).
- [x] The aggregate result, counted: filed, failed, cancelled, already filed, refused.
- [ ] Which items failed or were refused, readable from the result. Today it counts them and
      names none.
- [x] Tests:
  - confirm, then commit;
  - confirm, then back out;
  - cancel the batch;
  - a partly refused batch reads as one result.
- [x] Verify: tests, typecheck and lint pass; `pnpm test:stack` passes.
- [ ] Stage the branch and try it by hand.
- [x] Commit

### Phase 6 — tags for the whole batch, and one box style

Settled 2026-10-30, reviewing the first pass:

- **The mode ends when nothing is marked**, as well as on `esc` and `clear`.
- **A marked row is drawn as the selected row's box.** In the mode there is no single selection
  and no row foot. `process`, `edit`, `copy`, `open` and `manual` cannot be reached. The keyboard
  cursor is the row whose stamp is underlined.
- **A batch is tags, not templates.** Actions are `tag`, `untag`, `archive` and `unarchive`. A
  template is applied by its trigger tag, which asks its questions once and gives every item the
  same values.
- **The head keeps the batch's actions.**
  - The tag field shows every tag any marked item carries, with a count where not all of them do.
  - Adding a tag adds it to every marked item that lacks it, and removing one takes it off every
    item that has it.
  - `discard` is offered only where something marked is not discarded, and `undiscard` only where
    something marked is.
- **Only what processes items is confirmed**: a trigger tag, a discard. An ordinary tag, untag or
  undiscard is applied at once.

- [x] Core: `untag` and `unarchive` take the batch id too. ADR 67 and core.md name all four.
- [x] Daemon: action kinds `tag`, `untag`, `archive`, `unarchive`, with outcomes `reserved`,
      `tagged`, `untagged`, `archived`, `unarchived`, `skipped`, `refused`. http-v1.md.
- [x] Client: the four kinds, drawn as each item's own operation would be. client.md.
- [x] Shell: the mode ends when nothing is marked; marked rows boxed; the cursor; the tag field,
      `discard` and `undiscard` in the head; confirmation only for what processes. shell.md.
- [x] Tests at each layer; typecheck, lint, tests, `pnpm test:stack`.
- [x] Commit

### Phase 7 — tags on the rows, a gutter, and a cursor rather than a selection

Settled 2026-10-31, after phase 6 was tried. The box on a marked row, with its empty foot, read as
the single selection, and a tag field in the head was a step away from the rows it changed.

- **A marked row's tags change every marked row.** Adding a tag on one adds it to every marked row,
  and removing one removes it from every marked row that has it. An unmarked row's tags are fixed
  while marking.
- **A gutter bar marks a row**: solid for marked, an outline for the cursor. There is no box in the
  mode.
- **The cursor is not a selection.** The keys move it. It is not in the batch unless marked, and
  becomes the selected row when the mode ends.
- **The head holds the count, `discard`, `undiscard`, `all` and `clear`.** No tag field.

- [x] Shell: tags mirrored from marked rows, fixed on the others; `t` on a marked cursor row; the
      gutter; no box or stamp marks in the mode; the head without tags. shell.md, CONTEXT.md.
- [x] Tests; typecheck, lint, tests.
- [x] Commit

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Run mutation testing on the client's batch logic (`pnpm --filter @notemap/client mutation`, if the
client has opted in) once phase 3 settles. That logic decides when a batch has settled and what
its result says.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
