# One way out of the queue

**Date**: 2026-09-05
**Status**: Done
**Spec**: `docs/specs/shell.md`, `CONTEXT.md`
**Closed**: 2026-09-05

---

## Goal

An opened row offers one way for an item to leave the queue — `process` — and the composer behind
it answers *what became of this*: a configured destination, `manual`, or `discard`. Discarding
costs two gestures and is undone from the corner. The composer opens whether or not the pool is
reachable. `copy`, `edit`, `open` and `unarchive` are untouched.

Specified in [shell.md](../specs/shell.md#one-way-out-of-the-queue) and
[the composer is for processing](../specs/shell.md#the-composer-is-for-processing); the two words
are fixed in `CONTEXT.md` under **Archive** and **Processed**. Nothing on the wire changes.

---

## Tasks

### 1. Branch

- [x] `git checkout -b agent/one-way-to-process` _(2026-09-05)_

### 2. The corner can carry an offer

Nothing else can start until a discard has somewhere to be undone from. `Notice` today carries
`what`, `why`, `about`, `href`, `standing` and `key` — no action, and no way for one notice to
replace another.

- [x] `notices.svelte.ts`: a notice may carry an offer — a label and a callback — and `Notice.svelte`
      draws it as an action rather than a link.
- [x] A raise may **supersede** a previous notice by name, dismissing it: the mechanism `discard`
      needs so that only the last one is undoable. Distinct from `key`, which suppresses a repeat
      rather than replacing one.
- [x] Tests in the store's own suite: an offer is invoked once and the notice goes; a superseding
      raise leaves exactly one notice standing; a standing notice with an offer survives `trimmed`.
- [x] `git commit`

**Verify**: `pnpm --filter @notemap/ui test`

### 3. The composer's first step gains a second band

Depends on phase 2. `RoutingComposer.svelte` draws `<Group name="where">` over
`$destinations`; `DestinationLine.svelte` prefix-matches the same list.

- [x] `manual` and `discard` as entries the shell invents, in a second band of `where`, separated
      from the destinations by a rule and by no label.
- [x] `DestinationLine` matches them like any destination — same prefix rule, same `⏎` on an only
      match, same refusal on an ambiguous one.
- [x] Taking `discard` archives the item, closes the modal, and raises a standing notice carrying
      `undo`, superseding any previous discard notice. Undo calls `client.unarchive`.
- [x] An entry that cannot apply is drawn with its reason, not removed: `manual` where the routing
      summary already names the person, `discard` where the item is archived. Reuse the `why` an
      unavailable destination already takes.
- [x] Tests: both entries reachable by pointer and by typing; `discard` from the keyboard alone;
      the notice offers undo and the item comes back; a second discard leaves one notice; an
      inapplicable entry is present, disabled and gives its reason.
- [x] `git commit`

**Verify**: `pnpm --filter @notemap/ui test`

### 4. `manual` gets its step

Depends on phase 3. This is where the row's `done` field goes, plus two things it never had.
_Landed in phase 3's commit: the step is the same markup as the band, and splitting the two would
have committed untested markup._

- [x] Taking `manual` advances to a one-column step: the optional *where it went* field, the tag
      chooser, and `copy text` beside them. No place line, no tree, no preview, no second column.
- [x] `copy text` is offered and never automatic, and is absent where `copyable()` is false or the
      capture holds no text — the same gate `Actions.svelte` already applies.
- [x] Commit sends the note written or empty, and reads `mark processed`.
- [x] Tests: the note reaches `client.routing.markProcessed`; an empty field sends no note; copying
      is not triggered by taking `manual`; the control is absent without a clipboard.
- [x] `git commit`

**Verify**: `pnpm --filter @notemap/ui test`

### 5. The composer opens with the pool out of reach

Depends on phases 3 and 4. This reverses a rule, so it is its own phase and its own commit.
_Also landed in phase 3's commit, for the same reason: the composer reads reachability itself, and
the band could not be drawn honestly without it._

- [x] The modal opens regardless of reachability. Destinations and `manual` are drawn unavailable
      with the reason; `discard` is live.
- [x] The composer's tag chooser is drawn offline too — it is an outbox gesture like the row's.
- [x] Tests: with the pool unreachable the composer opens, discarding works from it and drains
      later, and no destination or `manual` can be taken.
- [x] `git commit`

**Verify**: `pnpm --filter @notemap/ui test`

### 6. The row collapses

Depends on 3–5, so that nothing the row gives up is unreachable at any commit.

- [x] `Actions.svelte`: `route`, `done` and `archive` become one `process`, in the accent, never
      disabled by reachability. The inline *where it went* field and `markDone` go with them.
- [x] `unarchive` stays, drawn only on an archived row.
- [x] `copy`, `edit`, `open` unchanged.
- [x] Update `Actions.test.ts`, and whatever in `Queue.test.ts`, `Feed.test.ts` and `Item.test.ts`
      names the old labels.
- [x] `git commit`

**Verify**: `pnpm --filter @notemap/ui test`

### 7. The words

Depends on 6. Cosmetic but spec'd, and worth its own pass so nothing is missed. _The composer's own
verbs landed with the band in phase 3, being inseparable from it; this pass was the record, the
summary, the corner and the log._

- [x] Composer chrome: `process`, then `process · <name>` or `process · manual`. Commit reads
      `route` for a destination, `mark processed` for `manual`.
- [x] `action-log.ts` says `manual` where it says `done` for a routed action naming no destination.
- [x] Rename `RoutingComposer.svelte` → `ProcessingComposer.svelte`. It stays in
      `components/routing/`: everything else there — the place line, the tree, remembered places —
      is routing and only routing.
- [x] `git commit`

**Verify**: `pnpm -r typecheck && pnpm -r --silent test && pnpm -r lint`

### 8. Close

- [x] `Status: Done`, `Closed:` dated, and the `Shipped:` entry on `shell.md` — which also drops
      the "except **one way out of the queue**" clause from its **Status** line.
- [x] `git commit`

---

## Unknowns

- **Whether `Notice.svelte` takes an action without restructuring `Corner`.** It draws a link
  today. Fallback: the offer is a button inside the existing notice body, styled as the muted lane
  is, rather than a new slot in the alarm primitives.
- **Whether `DestinationLine` can match synthetic entries cleanly.** It filters `Destination[]` and
  reads `retired` and `unusable`. Fallback: a narrow union — `Destination | { id: "manual" |
  "discard"; name: string }` — local to the composer, rather than faking a `Destination`. Do not
  put the two in `client.destinations`; they are not pool state.
- **Whether the two-column split misfires for `manual`.** `wide={split}` is derived from a
  destination having been taken. Fallback: make the split depend on there being a place line, which
  is what it was always about.
- ~~**Whether an undrained `archive` followed by `unarchive` collapses in the outbox or sends
  both.**~~ **It collapses**, and correctly: `enqueue` drops both where neither has been claimed by
  a drain, since applying the second reversed the first and the pool is already right. Where the
  archive has been handed over, the unarchive is sent. Worth knowing, because it means a discard
  undone before it drains costs the pool nothing at all.
- **A destination named such that `discard` or `manual` is an ambiguous prefix.** Not a defect: the
  existing rule takes nothing and says how many matched. Worth one test so it stays that way.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

`pnpm test:stack` is **not** part of finishing this: nothing crosses the HTTP surface, the host's
wiring, the client's transport or the config file. `core.md` and `http-v1.md` are unchanged, and
`client.md` was touched for a word rather than a behaviour.

The acceptance criteria added to `shell.md` are the floor: one control for leaving the queue;
discarding in two gestures with one undo offer however many rows went; `manual` offered once and
drawn with its reason when it cannot be taken; every `where` entry reachable from the keyboard; and
the offline criterion, rewritten, which now says `process` opens and discarding works from it.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed
and linking back to this plan. No implementation details, no granular tasks. A plan marked Done
whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.

---

## What landed, and what it cost

Eight phases became four commits. Phases 4 and 5 folded into phase 3's: the `manual` step and the
offline behaviour are the same markup and the same derived reachability as the band below the rule,
and splitting them would have committed untested markup for the sake of a commit boundary.

Two things were found rather than planned:

- **A component must act before it hands control away.** `discard` closed the composer and then
  read `item.id` off its props to archive, which does not reliably run — closing unmounts it. The
  order is now: read what is needed, do the work, then close.
- **Two surface tests were racing the decision.** They waited for the request to be *sent* rather
  than for the composer to close, and then acted on a modal that was about to be unmounted. Both
  now wait for the dialog, which is what a person waits for.

### Followed up 2026-09-05

Three notes from using it, landed after the plan closed:

- **The `manual` commit reads `done`.** `CONTEXT.md` keeps `done` off the *state* and now says so
  precisely: the word is spent on the gesture, a verb beside `route`.
- **`esc` gives a step back before it gives up the composer.** A taken destination or `manual` is
  released and the caret returns to the line; a second press closes. The cross and the veil are
  unchanged, and a control that consumes `esc` for itself keeps it — which the composer's tag field
  did not do and now does, so one press no longer both drops a half-typed tag and steps the
  decision back.
- **The actions are one line.** `ActionGrid` became `ActionLine`, and `Action` gained `quiet` so
  the muted ink that used to be a second line's is carried by the controls themselves.
