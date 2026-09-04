# The shell's second pass

**Date**: 2026-09-04
**Status**: Done
**Spec**: `docs/specs/shell.md`
**Closed**: 2026-09-04

---

## Goal

The composer reads as one decision and stops moving while it is typed; a row is one band with
one aligned set of actions; and every finding in [misc-findings](../misc-findings.md) marked as
carried is either built or dropped with a reason.

Drawn in the Claude Design project across turns 4–12. The pages that settle it are
`Composer v6.dc.html` (`6a`–`6d`), `Composer v7.dc.html` (`10a`), `Register v6.dc.html`
(`9a`–`9c`) and `Register v8.dc.html` (`12a`, `12b`); the turns before them are the alternatives
these were chosen from. **`docs/design/` is still the ground truth** and does not yet hold any of
it — phase 9 is what closes that.

Nothing here touches the pool, the wire or the client's cache. `routing.cancel` and the record's
`pointer` already exist and are simply not drawn; `RoutingSummary.to` already carries a `user`
entry, so a row can tell it has been marked done without reading its records.

---

## Tasks

### Phase 1 — the feed row and the queue row become one

Depends on nothing. `FeedRow` and `QueueRow` differ in what they offer, not in what they are, and
the finding asks for exactly this.

- [x] Create branch `agent/shell-second-pass`
- [x] One row component, taking what the surface offers rather than which surface it is
- [x] The feed's row opens in place, with the facts the queue's has
- [x] A feed row carries one fact the queue's does not: where it went, from the records the row
      reads when it opens
- [x] Double-click opens the item's own surface, from either surface; the second click of one
      leaves the row as the first click left it
- [x] `shell.md`: the row section says one row serves both, and what each surface offers
- [x] `pnpm -r --silent test`; `Feed.test.ts` still asserts no per-row routing read
- [x] `git commit`

### Phase 2 — one band, fewer facts, a quiet empty queue

Depends on phase 1 for the row it changes.

- [x] An open row is one fill: the rail's runs across the gutter to meet the body's, and the
      accent edge moves to the head of the row
- [x] `payload` leaves the facts
- [x] `edited` is absent where there is none, rather than saying so
- [x] The drained queue loses its paragraph and its `zero`, and says one quiet thing in the rail
- [x] `shell.md`: what an open row looks like, which facts a row carries, what a drained queue says
- [x] `pnpm -r --silent test`; the drained queue's copy constant goes with its paragraph
- [x] `git commit`

### Phase 3 — the row's actions

Depends on phase 1. This is the phase that changes what a person can do.

- [x] Two aligned lines on a grid, every cell taking the same inline padding: `route done archive`
      above `copy edit open`, the second muted
- [x] `mark done` becomes `done`, and opens one optional field for where it went; `⏎` sends it,
      empty or not; `esc` puts it away
- [x] `done` is not offered to an item whose summary already names the person
- [x] `copy` takes the capture's text and says so in the corner, naming what it took
- [x] `undo` on a record the person made, which cancels it
- [x] `shell.md`: the action row, what `done` is, and that a decision made by hand can be taken back
- [x] `pnpm -r --silent test`
- [x] `git commit`

### Phase 4 — what a record says

Depends on nothing; touches `lib/routing.ts` and the two surfaces that draw a record.

- [x] A record reads as its destination and the place it landed, from the pointer `placeIn()`
      already computes
- [x] `delivered` goes; a state is said only where it is not that
- [x] The capability goes; it is the adapter's word
- [x] `shell.md`: what a routing record says on a row and on the record surface
- [x] `pnpm -r --silent test`
- [x] `git commit`

### Phase 5 — the composer's two columns

Depends on nothing. The largest phase; `RoutingComposer` and `PathLine` both change shape.

- [x] Taken, a destination puts the composer in two columns: the line, the state word and the tree
      on the left, everything consulted or settled after it on the right, ending in the commit
- [x] Untaken, there is one column: the destination line, the `where` list, the commit
- [x] A typed field is a faint ground and carries no rule, so the only rule in the modal is the
      chrome's
- [x] `used before` moves to the right column under its own label, the count beneath the path
      rather than beside it
- [x] The derived name leaves the state word; the tree is where the note lands
- [x] `gone` leaves both places it is drawn. The flag stays and keeps a vanished place out of the
      greyed continuation, which is the half that was doing work
- [x] A field beside the line is hidden only where the forecast says `create`. An absent forecast
      is not knowing, and not knowing keeps the field
- [x] An unreachable destination keeps the line and its muted word in the left column, and no tree
- [x] `--spacing-composer` is the two-column measure; `--spacing-modal` keeps 30rem for the
      untaken composer and for the confirm that shares it
- [x] Below the register's narrow breakpoint the two columns stack in reading order
- [x] `shell.md`: the composer's shape, both columns, what `gone` no longer says, and that a field
      beside the line goes only where the composer knows a new note is being made
- [x] `pnpm -r --silent test`; `PathLine.test.ts` keeps its ghost-excludes-gone test and loses its
      gone-is-drawn ones
- [x] `git commit`

### Phase 6 — the composer stops moving

Depends on phase 5, which is what it holds still.

- [x] The modal takes a fixed distance from the top rather than being centred
- [x] The tree keeps a floor under it, so a shallow answer leaves room rather than collapsing
- [x] `⇥` with nothing to complete does nothing, rather than handing focus away
- [x] `shell.md`: the composer does not move while it is typed, and what `⇥` does when it cannot
      complete
- [x] `pnpm -r --silent test`
- [x] `git commit`

### Phase 7 — our own chooser

Depends on nothing.

- [x] A chooser is a word, a mark, and a panel of marked options — the idiom `where` already uses
- [x] The order selector stops being a native `select`
- [x] `shell.md`: the shell draws its own choosers
- [x] `pnpm -r --silent test`
- [x] `git commit`

### Phase 8 — the capture row

Depends on nothing.

- [x] `⇧⏎` commits the capture
- [x] An attached picture is previewed before it is committed, with a way to drop it
- [x] `shell.md`: both, in the capture section
- [x] `pnpm -r --silent test`
- [x] `git commit`

### Phase 9 — the design reference catches up

Depends on every phase above. `docs/design/` is what the port is verified against and it currently
describes none of this.

- [x] `composer.html` redrawn for the two columns and every state phase 5 and 6 settle
- [x] `queue.html` and `feed.html` redrawn for the band, the aligned actions and the drained queue
- [x] `shell.css` and `composer.css` carry what the pages now use
- [x] `shots/` re-rendered at 1440 and 390 for every page
- [x] `docs/design/README.md` says what agrees with the code, as of today's date
- [x] `todo.md` and `misc-findings.md`: the marks already written on this branch land with the rest
- [x] `git commit`

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Two things are worth naming because they are easy to leave untested. **`done` not being offered
twice** is a rule about the summary, not about the records, and deserves a test that draws a row
whose summary already names the person. **`⏎` in the note field** is the whole gesture the finding
asked for; a test that clicks a button instead proves nothing about it.

`pnpm test:stack` is not needed: nothing here crosses the HTTP surface, the host's wiring or the
client's transport.

---

## Settled while planning

- **`copy` uses `navigator.clipboard` and nothing else** *(2026-09-04)*. It needs a secure context:
  HTTPS, or `localhost` — which browsers trust without a certificate — but not plain HTTP to a LAN
  address, which is a plausible way to reach a self-hosted daemon from a phone. Relied on as it
  stands; a deployment that cannot reach it is a later change rather than a fallback built now.
- **A field beside the line goes only where the composer *knows* a new note is being made**
  *(2026-09-04)*, which is the forecast saying `create`. No forecast is not knowing, and not
  knowing keeps the field. This needs no schema hint, because the line is drawn for exactly one
  capability and the only field beside it is the heading an append would use. A second such
  capability, with a field that applies either way, is what would make a hint necessary — and that
  is the moment to add one, not before.
- **The composer earns a measure of its own** *(2026-09-04)*. `--spacing-modal` has two users: the
  composer and the confirm that offers to retire a destination instead of deleting it. 30rem is
  right for the second and for the composer before a destination is taken, so it stays as it is and
  `--spacing-composer` is the width of the two-column state — the log's rail being the precedent for
  a qualified variant of a measure. **The modal grows when it gains its second column, and that is
  deliberate**: it is the one moment it is allowed to change size, because a decision was just made.
  Phase 6 holds it still while it is *typed*, which is a different thing. It stacks back to one
  column at the register's own narrow breakpoint rather than earning a second one to keep in step.
- **The second click of a double does not toggle the row shut** *(2026-09-04)*. Opening a row is a
  toggle, so a naive double-click opens it, closes it, and then navigates — a flicker the reader did
  not ask for. A click carries how many of them it is, and the row ignores any but the first, so the
  gesture is: open, nothing, go. No delay on the single click, which the alternative would have
  cost.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
