# Status line

**Date**: 2026-09-30
**Status**: In progress
**Spec**: `docs/specs/shell.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`
**ADR**: [54](../adr/0054-the-shell-speaks-from-a-status-line.md)

---

## Goal

> A status line fixed to the bottom of every surface replaces the corner and the bar's glyph. The
> newest notice is on the left. Counts and work in flight are on the right: open firings with a
> countdown and `cancel`, pending work, what stands to be cleared, the queue's size, and
> reachability. A panel opens above the line with this session's notices and everything in flight.

Built without supervision, to be iterated on with the developer's design notes once the shape is
there. Stacked on `agent/abandoned-notice-keeps-its-reason` (#87).

---

## Tasks

### Phase 1 — the pool counts its queue

- [x] Branch `agent/status-line`, from the fix branch.
- [x] Core: `Counts = { queue: number }`, `PoolReads.counts()`, `ViewsApi.counts()`.
- [x] SQLite: one `COUNT(*)` over the queue's own predicate.
- [x] Daemon: `GET /v1/counts`, schema, OpenAPI definition. Regenerate `openapi.json` and the
      client's `generated.d.ts`.
- [x] Client: `client.counts` with `queue: Observable<number | undefined>` and `load()`. Read
      again after a drain that sent something, after the log shows the pool did something, after
      the pool returns, and after a route, a mark or a cancel.
- [x] Tests: the store count, the route, the client's reads and refreshes.
- [x] Specs: http-v1 `### Counts`, client.md.

### Phase 2 — a fired template says when its window closes

- [x] Core: `template-fired` detail carries `until`, the job's `notBefore`.
- [x] Shell: a store of open firings, keyed by record: the name, the item, `until`. Opened by the
      tag's quick path and by the log's `template-fired`. Closed by `routed`, `delivery-failed`,
      `work-abandoned` and `delivery-cancelled` for the record, and by a successful cancel.
- [x] The quick path reads `until` from the item's log once it has found the record.
- [x] `noticeOf` no longer raises `template-fired`, and nothing names `only: FIRED`: a run of
      attempts at a record is one notice by record, fired or not.
- [x] Tests: opening and closing from each entry, the countdown's arithmetic, the quick path.

### Phase 3 — notices keep a history

- [x] `notices`: `shown` is every live notice with no cap, `latest` is the message line's, and
      `history` holds this session's notices (capped at 100), each marked live or gone. Trimming
      goes. Hold and release stay.
- [x] Tests: history across linger and dismiss, offers only while live, `only` replacement, hold.

### Phase 4 — the status line

- [x] `StatusLine`: fixed bottom, ruled, in the column, safe-area padded. It holds the message,
      the counts and the toggle, and the log watcher moves here from `Corner`.
- [x] `Panel`: notices oldest first, then firings, pending operations and refusals. Closes on
      `esc` and on a press outside. `n` toggles it.
- [x] Below `narrow`: numbers and marks, no words. The panel is full width.
- [x] Remove `Corner`, `Alarm` and the bar's `Status`. `Refusals` moves into the panel.
- [x] `Sheet`: the page's foot clears the line, and the process surface fills the viewport less
      the line. The list's foot keeps saying what offline costs it, which the line cannot.
- [x] Tests: the line, the panel, the counts, the countdown, dismissal, hold, and the layout.

### Phase 5 — docs

- [x] shell.md: `### The status line` replaces the corner. Amend the shape of the shell, the
      chrome, reachable/pending/refused, the foot, the fired-template paragraphs, and the log's
      "what happened while nobody was asking". Add a changelog line.
- [x] CONTEXT.md: **Status line**, and **Notice** says where it is said.
- [x] todo.md: tick the three status-bar items and "no good way to see pending operations".

### Phase 6 — verify and open

- [x] Typecheck, lint, `pnpm -r --silent test`, and `pnpm test:stack` (a new route and a client
      read).
- [x] PR against the fix branch (#88).

### Phase 7 — review and design notes

Added once the PR was open, from the developer's design notes and
[the review](../reviews/status-line-2026-10-01.md).

- [x] The tag offer is anchored to its line, follows it onto a new row, and stays put as it closes.
- [x] A route the pool will retry stays in flight; a long absence still closes the routes that
      ended.
- [x] A failure restated by the pool is read back and counted once.
- [x] The open panel sees what arrives; a signed-out line has no panel to open.
- [x] The counts are read once when the pool comes into reach.
- [x] A refused capture is held until it is edited back into the capture box or deleted.
- [x] Selecting a tag, and opening its line, move nothing beside it.

---

## Open for the developer

- The words: `to clear`, `in queue`, `pending`, `offline`.
- Whether `cancel` belongs on the line itself, or only in the panel.
- A key for cancelling the newest firing.
- A `delivering` count (records the pool has not delivered) is one more field on `GET /v1/counts`
  and would say what `retrying` rows say, on every surface.
- Live update (todo) would say `N new` on the line.
