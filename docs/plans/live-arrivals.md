# Live arrivals on the queue and the feed

**Date**: 2026-10-09
**Status**: Done
**Spec**: `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`
**Closed**: 2026-10-09

---

## Goal

A capture made elsewhere (a relay, Raycast, another device) shows up on an open queue or feed
within one watcher tempo (10s). The same goes for an item that comes back from elsewhere: an
unarchive, a cancelled or abandoned delivery. Each is placed by rank inside the window the page has
read. The reader's scroll does not move, and a notice says what arrived.

---

## Settled with the developer (2026-10-09)

- **Placement is by rank, inside the walked window only**, the existing rule
  ([client.md](../specs/client.md#the-queue)). On the newest-first feed an arrival lands at the
  head. On the oldest-first queue it is appended only when the page is exhausted; otherwise the
  pool's next page carries it. No "N new" marker.
- **The reader's scroll does not move.** A notice says what arrived instead.
- **A filtered page takes an arrival only if it carries the filter's tags.** The whole page kept
  beside a filtered one takes it as well, so clearing or changing the filter shows it at once.
- **The tempo stays the watcher's 10s.** No websocket, no second tempo.
- **Several items are read in one request**, through a new route, not one `GET /v1/items/:id` per
  arrival.

---

## What exists, and what is missing

The watcher already reads `captured`, `revised`, `unarchived`, `delivery-cancelled` and
`work-abandoned`. `caughtUp` (`packages/client/src/state/state.ts`) takes processed rows off the
queue and applies tag changes. `rerouted` re-reads the held items whose routing changed.
`reread` → `settle` → `reconciled` already places a held item by rank on every page, filtered
pages included, through `belongs` and `intoPage`.

What is missing:

- **Items the client does not hold.** `rerouted` skips any subject not in `state.items`, and
  client.md says so deliberately ("Nothing is put back this way that the client does not hold").
  That rule is what changes here.
- **`unarchived` on a held item.** It is not in `REROUTING`, so a held copy stays archived until
  something else reads it.
- **The arrival's id on `revised`.** It is `detail.revision`, not the subject. The subject is the
  item it came from, which `caughtUp` already takes off the queue.

---

## Interface (confirmed 2026-10-09)

- **`GET /v1/items?id=<id>&id=<id>…`** answers `200 { "values": Item[] }`, in the order the ids
  were asked, each `Item` exactly as `GET /v1/items/:id` answers it.
  - `id` is repeated, as `tag` and the log's `kind` are.
  - An id the pool does not hold is left out rather than refused. Reads do not refuse, and a capture
    purged between the log entry and the read is ordinary.
  - The same id twice is answered once.
  - Above 100 ids: `422 limit-too-large` carrying `limit` and `max`, refused rather than clamped,
    as the feed refuses. The watcher reads 25 actions a page, so the client does not normally go
    near the cap, but it splits into chunks of 100 rather than trusting that.
  - No `id`: `422 id-required`. A bare `GET /v1/items` answering an empty list reads like a listing
    that found nothing.
  - Backed by a new `PoolReads.items(ids)` in core. The rows are read in one transaction, so
    `routing` and `assets` are derived as consistently as the single read derives them.
- **The client works out which ids to read** from one pure function over state and actions,
  beside `rerouted` and replacing it:
  - `captured` → subject
  - `revised` → `detail.revision`
  - `unarchived` → subject
  - the existing `REROUTING` kinds → subject

  Ids with an operation still to send stay skipped, as today. Held or not, every id is read in one
  request and then settled through `settle` → `reconciled`, so placement keeps one path. An id
  missing from the answer is forgotten, as `reread` forgets one the pool answered `no-such-item`
  for.
- **`ActionsSince` gains `arrived: readonly ItemId[]`**: the `captured` and `revised` ids this
  client did not hold when it heard them. This is how the shell tells another device's capture from
  its own (its own is already held, applied by the outbox), without the shell reaching into the
  cache. Returns are left out: `work-abandoned` and a final `delivery-failed` already raise "back in
  the queue", and an unarchive from elsewhere is a return, not news.
- **One notice per watcher read, not one per arrival.** A relay draining forty captures says one
  thing. Wording follows the status line's short form:
  - one arrival: `captured` with the capture's excerpt, linking to the item
  - several: `<n> captured`, linking to the feed

  A success, so it stays four seconds and has no accent. A revision reads `revised`, or counts
  toward `<n> captured` when it arrives beside others.
- A `more` read (the long-absence case) raises no arrival notice. The existing "N or more things
  happened" notice covers it, and the surfaces are corrected by arriving at them.

---

## Phase 1 — reading several items at once

Depends on: interface confirmed.

- [x] Create branch `agent/live-arrivals`
- [x] Core: `PoolReads.items(ids)`, implemented in the store adapter(s), tested beside `item`
- [x] Daemon: the route in `apps/daemon/src/routes/definitions.ts` and `items.ts`, with route tests
      for order, duplicates, unknown ids, the cap and a missing `id`
- [x] Regenerate the OpenAPI document (`pnpm --filter daemon openapi`) and the client's types
      (`pnpm --filter client codegen`)
- [x] Amend http-v1.md (Items, and the errors table) _(2026-10-09; core.md lists no pool reads, so it is untouched)_
- [x] Typecheck, lint, `pnpm -r --silent test`, then `pnpm test:stack`, since this changes the
      HTTP surface
- [x] Commit: `feat(daemon): read several items in one request`

**Verify:** route tests green. `curl '…/v1/items?id=<a>&id=<unknown>&id=<b>'` answers `a` and `b`
in that order. 101 ids answer `422 limit-too-large`.

## Phase 2 — client places what it does not hold

Depends on: Phase 1.

- [x] Replace `rerouted` with the read-set function above; drop the held-only guard
- [x] Read the set through the new route, in chunks of the cap, settling each answered item and
      forgetting each missing one
- [x] Add `unarchived` to what is read
- [x] Carry `arrived` on `ActionsSince` (`packages/client/src/actions/watching.ts`); the client
      works it out in `applied`, before anything is reported
- [x] Tests in `packages/client/src/actions/catching-up.test.ts` and `client.test.ts`:
  - an unheld capture lands at the feed's head
  - it lands at the queue's end only when that page is exhausted, otherwise not at all
  - a filtered page takes it only when the tags match, and the whole page beside it takes it
  - a revision's new id is read and the item it came from leaves the queue
  - a held, archived item unarchived elsewhere goes back on the queue
  - an item with an unsent operation is not read
  - several arrivals in one watcher read cost one request
  - an id the batch answer leaves out is forgotten
  - an own capture is not in `arrived`
  - a capture whose template fired in the same transaction lands on the feed and not the queue
- [x] Amend client.md: the action log section ("Nothing is put back…" becomes what is read and
      placed), and the queue's "A row also leaves without a read" bullet gains its counterpart
- [x] Typecheck, lint, `pnpm -r --silent test`
- [x] Commit: `feat(client): place items heard from the action log that the client does not hold`

**Verify:** client tests green. Placement goes through `reconciled`, so the rank rule is covered by
the tests that already exist.

## Phase 3 — the shell says it and holds still

Depends on: Phase 2.

- [x] Status line: raise the arrival notice from `since.arrived` (`StatusLine.svelte`,
      `lib/action-log.ts`). Keep the logic in `lib/` so it can be tested without the component
- [x] Make sure a row landing above the viewport does not move what the reader is looking at (see
      Unknowns) _(2026-10-09: Chromium's native anchoring holds it, measured with a scratch daemon;
      no code needed there. Safari unchecked)_
- [x] Tests:
  - notice wording for one, several and a revision
  - no notice for an own capture
  - no notice on a `more` read
- [x] Amend shell.md:
  - "What happened while nobody was asking": a sixth thing is said, and it is an arrival, not a
    kind
  - the motion paragraph: a row arriving out of sight does not move the page
- [x] Typecheck, lint, `pnpm -r --silent test`
- [x] Commit: `feat(ui): say what arrived from elsewhere, and keep the reader where they are`

**Verify:** shell tests green. By hand: with the shell open and scrolled into the feed, post a
capture with `curl` to the daemon. Within 10s a notice appears and the row under the reader stays
put. Scroll to the top: the capture is the head row. On the queue, walked to its end, it appears at
the foot. Filtered by a tag it doesn't carry, it does not appear, and clearing the filter shows it.

## Phase 4 — across the stack

Depends on: Phase 3. Watcher behaviour crosses client transport and daemon, so the stack suite earns
a case here.

- [x] Stack test: two clients on one daemon. One captures; the other, watching, holds the item on
      its feed after an `ask()`
- [x] `pnpm test:stack`
- [x] Tick the todo line in `docs/todo.md`
- [x] Commit: `test(stack): a capture from one client reaches another's feed`

**Verify:** `pnpm test:stack` green.

---

## Unknowns

- **Scroll anchoring on Safari** — *still open after implementation.* The page scrolls the document, and Chrome and Firefox anchor it
  natively (`overflow-anchor: auto`). I don't know which Safari versions do, and the phone is
  mostly Safari. Rows also slide in by animating their height, so anchoring has to hold through
  every frame. Fallback: a row placed while out of view arrives still rather than sliding, and the
  shell corrects the scroll offset once from the first visible row's position before and after.
  Check it on a real phone in Phase 3 before writing any of that.
- **The selected or held row.** An arrival placed above the selected row on the queue must not
  move the selection or the open process surface. That should hold, since selection is by id, but
  test it.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
