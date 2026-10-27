# Withdrawing a routing record

**Date**: 2026-10-26
**Status**: Done
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/shell.md`, `docs/specs/mirror.md`
**Closed**: 2026-10-26 — `todo.md`'s routing record invalidation and the WebDAV ETag error

---

## Goal

A person can **withdraw** a delivered routing record from the record view or the log, after a
confirm step that says, where the destination can tell, whether what the record points at is still
there. The record stays, marked withdrawn, and the log carries the withdrawal. The item returns to
the queue, reads as unrouted everywhere, and is editable in place unless something else seals it.
A trigger tag that made the record comes off with it. The withdrawal can be undone. Separately,
routing a note onto a path that is a WebDAV folder is refused with a message that says so.

Decision: [ADR 66](../adr/0066-a-delivered-record-may-be-withdrawn.md).

---

## Settled

- **Only a delivered record from a destination can be withdrawn.** A pending one is cancelled. A
  manual mark keeps its own quick cancel, which removes it. Withdrawing a record that is already
  withdrawn, pending, or names the user is refused.
- **The record stays.** It gains `withdrawnAt`. Nothing is removed, so the append-only rule holds:
  the log gains a fact and loses none. The action log gets `delivery-withdrawn`, naming the
  destination and capability as `delivery-cancelled` does.
- **A withdrawn record does not count.** It is left out of processed, `processedAt`, the `routed`
  state filter, the destination filter, a destination's usage facts and the item's `routing`
  summary. The log and the item's records still show it.
- **Withdrawal unseals.** A withdrawn record seals nothing. The item is sealed again only by what
  sealed it before: another delivered record, an archive, a revision. CONTEXT.md's "every sealed
  item is processed" survives unchanged. What changes is that a delivered record no longer seals
  for as long as it stays withdrawn.
- **Undo exists in core.** `reinstate` clears `withdrawnAt` and appends `delivery-reinstated`. It is
  refused once the item has been edited since the withdrawal. The shell offers it only right after
  a withdrawal, in the view where it was made, and stops offering it when the person leaves that
  view or starts an edit.
- **A trigger tag goes with the record.** If the record was fired by its tag, withdrawing removes
  that tag, so applying it again routes again. Reinstating puts it back only if the item does not
  already hold it, through a new tagging option that adds a tag **without firing** its template.
- **`locate`, an optional adapter method**, answers `present`, `absent` or `unknown`, plus a count
  where a record names several things. fs and webdav answer for the note a record points at,
  whether the delivery created it or appended to it. A record that placed assets points at a
  folder and answers `unknown`. Arena checks each block. A kind without `locate`, a record with no
  pointer, or a destination that cannot be reached answers `unknown`.
- **The confirm step makes no claim about content.** "The file `<name>` is still there. Withdraw
  anyway?" "3 of 5 blocks are still there. Withdraw anyway?" On `absent` or `unknown`, a plain
  "Withdraw?".
- **Arena keeps every block id on the record.** It is an optional list beside `pointer`, written by
  the adapter and mirrored. A multi-block record made before this answers `unknown`. Amends
  ADR 59.

---

## Tasks

### Phase 0: before anything

- [x] Branch `agent/withdraw-a-routing-record` _(2026-10-26)_
- [x] ADR 66 via `/adr`: a delivered record may be withdrawn and reinstated. It covers the record
      staying (and why that keeps the append-only rule), unsealing, the trigger tag coming off and
      going back on without firing, and `locate` being advisory and never enforced by core. It
      names ADR 59 as amended and ADR 37 as extended. _(2026-10-26)_
- [-] Reproduce the WebDAV error on staging (`agent stage`): route with `create` onto a path that is
      a folder, then with `append`. Write down which branch of `notes.ts` trips and what the server
      answered. Fallback if it does not reproduce: ask for the exact gesture before phase 5.
      _(moved into phase 5, which reproduces it against the adapter's own test server first)_
- [x] Commit. _(2026-10-26)_

### Phase 1: withdrawal in core and the store

Depends on phase 0.

- [x] `RoutingRecord` gains `withdrawnAt?`. The sqlite store gets a migration and the mapping.
      The mirror record carries it. _(2026-10-26)_
- [x] `routing.withdraw(record)` and `routing.reinstate(record)` on `RoutingApi`, each with
      its refusal union. Each runs in one transaction, appends its action, recomputes the stored
      `processedAt` and enqueues the item's mirror write. _(2026-10-26)_
- [x] Withdrawn records are excluded from: processed and the queue's anti-join, `processedAt`, the
      `routed` state filter, the destination filter, destination usage, the item's `routing`
      summary, a template's fired count, `alreadyApplied`, and `sealed()` in `pool/edit.ts`. _(2026-10-26)_
- [x] Tagging gains a no-fire path, used by `reinstate` and not exposed over HTTP. Withdraw removes
      a fired record's trigger tag in the same transaction. Reinstate re-adds it, unfired, only if it
      is absent. _(2026-10-26: `returnTriggerTag` beside `releaseTriggerTag`, inside reinstate's own
      transaction, rather than an option on `items.tag`, which opens a transaction of its own)_
- [x] Rebuild: nothing to build, since rebuild does not exist. mirror.md says the field is carried. _(2026-10-26)_
- [x] Specs: core.md (routing: withdrawal and reinstate, what stops counting, sealed, tag), CONTEXT.md
      (**Withdraw**, plus amendments to **Sealed** and **Processed**), mirror.md. _(2026-10-26)_
- [x] Tests in `tests/integration/src/withdraw.test.ts`, where every pool test lives: withdraw returns the item to the queue and moves `processedAt` back,
      an edit after withdrawal amends in place, a second delivered record keeps it sealed, each
      refusal fires, a fired record's tag comes off and goes back on without a new reservation,
      reinstate leaves an already-present tag alone, and every filter leaves out the withdrawn
      record. _(2026-10-26)_
- [x] Verify: typecheck, `pnpm -r --no-sort --silent test`, lint. Commit. _(2026-10-26)_
- [-] `pnpm --filter @notemap/core mutation` _(dropped: core's own tests do not reach the pool's
      routing, so every mutant in withdraw, reinstate and sealed reads no-coverage; the integration
      suite is what covers them)_

### Phase 2: `locate` on the port and the adapters

Depends on phase 1 only for the record shape. Can run beside phase 3.

- [x] `locate?(destination, record, signal)` on `DestinationKindAdapter`, and `locate` on
      `Destinations`, answering `unknown` where a kind has none. Core reads it as
      `routing.locate(record)`. _(2026-10-26)_
- [x] fs: stat the pointer, but never follow it out of the root. webdav: `PROPFIND` depth 0 on the
      pointer. Both answer `unknown` for a folder pointer (placed assets). _(2026-10-26)_
- [x] Arena: `DeliveryLanding` and the outcome gain the optional block-id list. The adapter writes
      it for every multi-block delivery and checks each id. A single-block record checks its
      pointer. An older multi-block record answers `unknown`. _(2026-10-26: checks each block's
      connections for the record's channel, since a block taken out of a channel goes on existing)_
- [x] Each adapter's README says what `locate` answers and what it cannot know. _(2026-10-26)_
- [x] Tests: present, absent and unknown per kind, a partial count on Arena, and a pointer escaping
      the root answering `unknown` on fs. _(2026-10-26)_
- [x] Verify: typecheck, tests, lint. Commit. _(2026-10-26)_

### Phase 3: HTTP and the client

Depends on phase 1, and on phase 2 for `locate`.

- [x] `POST /v1/routing/{record}/withdraw` and `/reinstate`, answering the record. Their refusals go
      into `errors/refusals.ts`. _(2026-10-26)_
- [x] `GET /v1/routing/{record}/presence`, answering `present` / `absent` / `unknown` with an
      `{ found, of }` on `present`, bounded by the request's own signal as a preview is. _(2026-10-26)_
- [x] The record schema carries `withdrawnAt`. Regenerate the client types. _(2026-10-26)_
- [x] The client gets withdraw, reinstate and presence, and its cache treats a withdrawn record as not
      routing the item. Withdraw and reinstate read the item again and place it, since its routing,
      tags and processed-at move together. _(2026-10-26)_
- [x] http-v1.md and client.md updated. _(2026-10-26)_
- [x] Verify: typecheck, tests, lint, then `pnpm test:stack`, since this crosses the HTTP surface.
      Commit. _(2026-10-26)_

### Phase 4: the shell

Depends on phase 3.

- [x] `withdraw` on a delivered record in `record/Record.svelte` and on its line in the log. A
      manual mark keeps `cancel`. _(2026-10-26: in the open block's foot, which is the same
      component on the item, the record's address and the log)_
- [x] The confirm step asks for presence and shows the soft wording above, plus a plain
      "Withdraw?" when presence is unknown, and "is not there any more" when absent. The confirming
      press can be taken while presence is still being asked. _(2026-10-26)_
- [x] After a withdrawal, the same view offers `reinstate`. Leaving the view or starting an edit
      drops the offer. _(2026-10-26)_
- [x] A withdrawn record reads as withdrawn (struck, with its time) in the record view and the log.
      The row and the queue read as unrouted. The item view now reads records for every item, so a
      wholly withdrawn item still shows its history. _(2026-10-26)_
- [x] shell.md updated. No command published: withdraw acts on a record, and commands act on
      items. _(2026-10-26)_
- [x] Component tests beside the components. Verify, commit. _(2026-10-26)_

### Phase 5: WebDAV routing onto a folder

Depends on phase 0's reproduction and nothing else. Can go first.

- [x] Detect that the note path is a collection, on every capability that writes a note, and
      refuse with `rejected`: "`<path>` is a folder, not a note". _(2026-10-26: looked for only
      once a write has failed, rather than before every write. Not reproduced on a real server —
      none here — but the test server answering a folder's `GET` with a listing and no `ETag`, as
      rclone does, gives the exact message the todo described.)_
- [x] Check fs for the same case (`EISDIR` on create and on append) and give it the same wording.
- [x] Tests: a folder path refused on both kinds, for `create`, `append` and `create-or-append`.
- [x] Verify, commit. Tick todo.md line 125. _(2026-10-26: removed rather than ticked)_

### Phase 6: close

- [x] Remove todo.md line 127. _(2026-10-26)_
- [x] Shipped entries and status. _(2026-10-26)_
- [x] Open the PR. _(2026-10-26: #118)_

### Phase 7: review

- [x] Address [the review](../reviews/withdraw-a-routing-record-2026-10-26.md). _(2026-10-26)_
- [x] Restore is renamed **reinstate**, _restore_ being a rebuild's word. _(2026-10-26)_
- [x] The item view leaves out a record read withdrawn, drawing one only while the view it was
      withdrawn in is open. _(2026-10-26)_

---

## Unknowns

- **What the WebDAV error actually is.** The guess is a `GET` on a collection coming back without a
  usable ETag, reaching `notes.ts:210`. If it is something else, phase 5 changes shape but not
  size.
- **Whether Arena's API answers a deleted block with a 404.** If it answers in a way that can't be
  told apart from no access, Arena's `locate` answers `unknown` for those, rather than `absent`.
- **The client cache and sync deltas.** A record's `withdrawnAt` changing has to reach a client the
  way an item change does. If the delta stream carries records only on creation, phase 3 grows a
  task.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
