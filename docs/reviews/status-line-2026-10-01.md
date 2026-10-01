# Review: Status line

**Date**: 2026-10-01
**Status**: Resolved
**Scope**: `agent/status-line` against `agent/abandoned-notice-keeps-its-reason` (04b17603), PR #88
**Plan**: `docs/plans/status-line.md`
**Spec**: `docs/specs/shell.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`

---

## Overall

The shape matches ADR 54 and its two amendments. The pool's count (core, SQLite, route, client)
is small and correct, and typecheck, lint and `pnpm -r --silent test` all pass. The problems are at
the edges of a firing's life and in how a give-up is counted. The most important finding is
design rather than a bug: the "said once and let go" amendment auto-dismisses refused operations.
For a refused capture, that deletes the only copy of its text and assets within one effect tick,
and the ADR never weighed that cost.

---

## Bugs

### 1. A delivery the pool will retry closes its firing, and `cancel` goes with it

`apps/ui/src/lib/action-log.ts:20` — `ENDS` holds `delivery-failed` whatever the failure was. For
`unreachable` the pool schedules a retry and the record stays pending, so it can still be
cancelled. The shell closes the firing anyway, and `firings.closed` adds the record to `closed`,
so nothing can open it again.

```
window closes → attempt → unreachable → delivery-failed (retryable)
→ firing closed + "retrying: …" (no offer) → record still pending, no cancel on the line or panel
```

The spec contradicts itself here. "A failure says whether it is over" calls this not over, and
"Everything that ends it takes it away" lists every failed delivery as an end.

Fix: close only on a `delivery-failed` whose code is not `unreachable`. `work-abandoned` already
closes the record when retries run out. Update the "Everything that ends it" paragraph to match.

### 2. A route given up on at its first attempt is counted and listed twice

`apps/ui/src/lib/action-log.ts:198,221` with `notices.svelte.ts:raise` — on give-up the pool writes
`delivery-failed` *and* `work-abandoned` (`packages/core/src/pool/work.ts:243,268`). For a
`rejected` delivery these become two alarms with different keys (`failed:r`, `abandoned:r`).
`only` collapses them on the line, but `past` keeps both and `unseen` goes up twice.

```
rejected → delivery-failed (alarm) + work-abandoned (alarm) → notices (2), two panel entries for one failure
```

This breaks "one run of attempts at one record is one notice". A retry that runs out happens not
to show it, because the final `delivery-failed` is dropped by the `failed:r` key spoken on the
first retry.

Fix: when `only` replaces a live notice, replace it in `past` too, and count it in `unseen` only
if the one it replaces was not already an alarm.

### 3. After a long absence, firings never close

`apps/ui/src/components/status/StatusLine.svelte:183` — when `since.more` is set, the batch goes to
`tooMuch` and `hear` never runs, so `firingOf` never sees the endings in it. A firing opened before
the absence stays on the line under the asking mark. Its `cancel` will refuse ("could not
cancel"), and it stays until reload or sign-out.

Fix: run the firing half of `hear` (open/close) over `since.actions` even when `more`, or ask
`recordsFor` about each open firing once a catch-up overflows.

---

## Design

### 4. Auto-dismissing a refusal destroys a refused capture

`apps/ui/src/components/status/StatusLine.svelte:67-84` — `said` raises the notice and calls
`client.dismiss` straight away. For a capture, the outbox entry is the only copy left: the
optimistic item was already undone at refusal (`outbox.ts:250`), and `release` deletes the
capture's asset blobs from the store (`client.ts:319`). What survives is an excerpt in an in-memory
notice that is gone after a reload. It also fires on start for refusals persisted from an earlier
session, which then flash for ten seconds and are deleted before anybody has looked.

The old corner also lost the text on dismiss, but only when a person pressed `dismiss`. Until
then the entry was durable. ADR 54's amendment argues that clearing "costs a gesture and buys
nothing", and that holds for a tag or an archive. It does not hold for a capture, which for this
app is the one thing that must not be lost.

Options: keep refused captures in the outbox, listed in the panel with their full text and a
`copy`, and let go of everything else as now. Or keep the full text in the notice itself. Either
needs a line in the ADR amendment and in shell.md's "A refusal is said once and let go".

---

## Minor

### 5. Safe-area padding does nothing

`apps/ui/src/components/primitives/frame/Line.svelte:42` — `pb-[env(safe-area-inset-bottom)]` is
always 0, because `app.html` has no `viewport-fit=cover`. Either add it, or drop the padding and
the plan's "safe-area padded". If it is added, `Sheet`'s `h-[calc(100dvh-var(--spacing-status))]`
also has to subtract the inset, or the process surface's foot ends up under the line.

### 6. `unseen` counts up while the panel is open

`StatusLine.svelte:64` — `seen()` runs only when the panel opens. An alarm raised while it is open,
and being read, still shows as `(1)` once it is closed.

### 7. `n` while signed out toggles a panel that is not drawn

`StatusLine.svelte:91` publishes `notices` even when `shut`. `open` flips without showing anything,
and the panel then appears already open after signing in.

### 8. `firings`' `closed` is a `SvelteSet` nothing reads reactively

`apps/ui/src/lib/firings.svelte.ts:22` — a plain `Set` is enough.

### 9. Counts are read twice for one event

On return, `+layout.svelte:50` loads and the client's own return flag (`client.ts:426`) loads again.
For this client's own capture, the drain reads, and if the log watcher then applies the capture's
entry, `applied` reads a second time. The coalescer caps a burst at two, so this costs requests, not
correctness.

### 10. Stale spec lines

- `shell.md`, "What happened while nobody was asking": "Four kinds are said out loud and no
  others", but `SAID` has five (`delivery-cancelled`). The drift predates this branch, but this
  branch amends that paragraph.
- `shell.md`, "A tag that fired nothing": "a refusal is what the line already holds for a person to
  act on". Since 2026-10-01 a refusal is not held.
- The 2026-09-30 Shipped entry still says "`undo` or `dismiss`" and "`N to clear`". Its own
  amendment covers this, but the first sentence reads wrong on its own.

### 11. The plan does not cover all of the branch

`docs/plans/status-line.md` — Phase 6's PR box is unchecked though #88 is open. The tag-offer
anchoring (69f2924e, 000f6a45: `TagSet`, `offer` utility, `pinned`) is on this branch with no
task in the plan.

---

## Non-issues

- **`firings.opened` ignoring a closed record** — intended: the log can report a landing before the
  tag's own lookup returns.
- **The queue count ignores the surface's tag filter** — http-v1 says so: it counts the pool, not
  the surface.
- **Pending work is not in `14 in queue`** — the pending count says it, per client.md.
- **The queue count is not drawn below `narrow`** — shell.md says exactly that.
- **`publish(…, { atop: true })` at `Infinity` depth** — two atop layers would tie, but only the
  panel uses it.
- **`said(held)` running again on each outbox emission before `dismiss` lands** — the notice is
  keyed `refused:<id>` so it is raised once, and a second `dismiss` of a dropped id is harmless.
- **The counts read awaited inside the drain** — deliberate and in client.md: an answer is proof of
  reach, and a return it causes rides this drain.

---

## Resolution

1. **Fixed.** A `delivery-failed` the pool will retry no longer closes its firing. shell.md's
   "Everything that ends it" now says so.
2. **Fixed.** When an alarm takes the place of a live alarm under the same `only`, it replaces that
   alarm in the history and is not counted again. A `retrying` turning into `routing failed` still
   keeps both.
3. **Fixed.** An overflowing catch-up applies its page to the routes in flight, then asks
   `recordsFor` about each route still open.
4. **Fixed, with the developer's choice.** A refused capture stays in the outbox and in the
   panel's `refused` section, and counts on `notices` until somebody decides: `copy`, `edit` (put
   back into the capture box, then let go) or `delete` (asked first). Other refusals are let go as
   before. ADR 54, shell.md and CONTEXT.md are amended.
5. **Fixed.** Dropped the padding rather than adding `viewport-fit=cover`.
6. **Fixed.** While the panel is open, anything counted is seen at once.
7. **Fixed.** Signed out, `notices` is not published, the toggle does nothing, and an open panel
   closes.
8. **Won't fix.** `svelte/prefer-svelte-reactivity` requires a `SvelteSet` in a rune module.
9. **Fixed in part.** The client no longer reads on a return, since the shell's read on reach
   covers it. The drain's read and the later log read are seconds apart, and other devices may
   change the count in between, so they are not duplicates.
10. **Fixed.** Five kinds, the stale refusal sentence, and the Shipped entry rewritten as shipped.
11. **Fixed.** The PR is ticked, and Phase 7 records the work added after it.
