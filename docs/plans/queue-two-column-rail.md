# The queue is two columns, and routing is a modal over them

**Date**: 2026-08-24
**Status**: Done
**Spec**: `docs/specs/shell.md`
**Closed**: 2026-08-25

---

## Goal

`apps/ui` draws both surfaces as one grid of two real columns — a **metadata rail** the reader can
furl away, and the capture itself — with routing lifted out of the register into a **modal**, such
that the register no longer reserves width for a composer, no row carries a label gutter, and every
measure the new layout needs is a role in `styles/tokens.css`.

Extended in review: **settings stops being a register** and becomes a page that is read — one
column, one type size, hierarchy from capitals and rules.

---

## What changes, and why

The register used to be one column with a right-hand spine, where a row's left gutter held the
stamp collapsed and became a label column opened. Two things were wrong with it: the gutter was
dead space on a collapsed row, and the routing composer had to widen the whole page to have
somewhere to live.

v6 answers both. The left column becomes a **rail** that always carries metadata — stamp, tags,
where it went, and the item's facts once it is open — and the right column carries nothing but what
was captured. The rail can be furled from the bar, which gives the prose the whole width without
hiding the register. Routing goes into a modal over the surface, so nothing in the register has to
reserve room for it.

**Settled with the developer, 2026-08-24:**

- `N waiting` in the bar counts **outbox operations that have not drained** — which closes
  shell.md's open question about a pending mark. It is not a count of the queue; the API has none.
- **The feed gets the same rail.** One system, both surfaces.
- The bar keeps the **reachability mark**, the **settings link** and the **order selector**,
  alongside the furl toggle and the waiting count.
- **The spine and the separators go.** Structure is the two columns plus a rule across the top of
  every cell.

**Not taken from the sketch**: `record` beside `capture` and `attach`. Nothing captures audio.

---

## Tasks

### 1 — Tokens and the frame

- [x] Branch `agent/queue-two-column-rail`.
- [x] `styles/tokens.css`: `--spacing-rail`, `--spacing-fact`, `--spacing-modal`; `--spacing-measure`
      becomes the frame's cap rather than the register's; `--spacing-spine` and `--spacing-panel`
      go. One breakpoint, `--breakpoint-narrow: 44rem`, where the rail narrows; `--breakpoint-aside`
      goes with the composer that needed it.
- [x] `Column` loses `wide`: nothing widens the page any more. `Sheet` matches the sketch's padding.
- [x] `Bar`: furl toggle, waiting count, reachability, settings, order.
- [x] `lib/rail.svelte.ts` — furled or not, remembered like the theme.
- [x] `lib/waiting.svelte.ts` — how many outbox operations have not drained.
- [x] Commit.

### 2 — The register

- [x] `Register` becomes the grid itself, and furls its first column to nothing.
- [x] `Rail` and `Body` — the two cells one item drops into the grid, with the rule across the top,
      the lit wash, and the accent edge on an open body.
- [x] `Facts`/`Fact` replace `Label`/`Value`. `Separator`, `Row`, `Content` go.
- [x] `Stamp` puts the time beside the date and stacks it on a phone.
- [x] `Foot` sits in the content column.
- [x] Commit.

### 3 — The surfaces

- [x] `CaptureRow`, `QueueRow`, `Drained`, `FeedRow` emit a rail and a body.
- [x] The rail carries the stamp, the state word where there is one, tags, where it went, and — on
      the open row — payload type, edited, source, id.
- [x] Clicking anywhere in either cell opens the row; the stamp stays the button that says so.
- [x] Commit.

### 4 — Routing as a modal

- [x] `Modal` replaces `Composer` and `Connector`: veil, panel, title, the subject it is about,
      dismissed by the veil, the ×, or Escape.
- [x] `RoutingComposer` renders into it; the surface owns which item is being routed, so
      `lib/composing.svelte.ts` goes.
- [x] Commit.

### 5 — Docs and gates

- [x] `docs/specs/shell.md`: the rail, the furl, the modal, the waiting mark, and the death of the
      spine. Close the pending-mark open question.
- [x] Typecheck, tests, lint. `pnpm test:stack` is not needed — nothing crosses the layers.
- [x] Commit.

### 6 — Settings, which the same review asked for

Not a separate branch: it arrived as review on this PR, and splitting it would have split one
review conversation in two.

- [x] `--color-good`, and `--spacing-read` / `--spacing-mark` for a page that is read.
- [x] `components/settings/` — page, section, row, fact, destination, the daemon section with its
      connectivity check, and the delete confirmation. `components/destinations/` goes.
- [x] Settings stops being a register: one column, a narrower measure, no fold.
- [x] `docs/specs/shell.md`: settings moves into scope and gets a Behavior section; green is a
      result and never an intention.
- [x] Commit.

### 7 — The log page, which the same review asked for

- [x] `apps/daemon/public/log.html` is the same register, with the shell's bar: rail, body, one
      rule per cell, one type size, mono throughout.
- [x] The roles restated in the page, since it loads nothing but the daemon, with a test in
      `src/log/log.test.ts` holding that copy to `apps/ui/src/styles/tokens.css`.
- [x] `docs/specs/shell.md` and `http-v1.md`: `/log` leaves the out-of-scope list and the open
      question closes for half of it. `/docs` is a vendored Swagger UI and stays.
- [x] Commit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The existing suite is the floor. What is new and worth a test: the rail furls and the register keeps
working without it, the waiting count says what the outbox holds and never counts a refusal, an open
row's facts, and routing being reachable and dismissable in the modal.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed
and linking back to this plan.
