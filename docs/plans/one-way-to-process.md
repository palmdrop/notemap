# One way out of the queue

**Date**: 2026-09-05
**Status**: Todo
**Spec**: `docs/specs/shell.md`, `CONTEXT.md`
**Closed**:

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

- [ ] `git checkout -b agent/one-way-to-process`

### 2. The corner can carry an offer

Nothing else can start until a discard has somewhere to be undone from. `Notice` today carries
`what`, `why`, `about`, `href`, `standing` and `key` — no action, and no way for one notice to
replace another.

- [ ] `notices.svelte.ts`: a notice may carry an offer — a label and a callback — and `Notice.svelte`
      draws it as an action rather than a link.
- [ ] A raise may **supersede** a previous notice by name, dismissing it: the mechanism `discard`
      needs so that only the last one is undoable. Distinct from `key`, which suppresses a repeat
      rather than replacing one.
- [ ] Tests in the store's own suite: an offer is invoked once and the notice goes; a superseding
      raise leaves exactly one notice standing; a standing notice with an offer survives `trimmed`.
- [ ] `git commit`

**Verify**: `pnpm --filter @notemap/ui test`

### 3. The composer's first step gains a second band

Depends on phase 2. `RoutingComposer.svelte` draws `<Group name="where">` over
`$destinations`; `DestinationLine.svelte` prefix-matches the same list.

- [ ] `manual` and `discard` as entries the shell invents, in a second band of `where`, separated
      from the destinations by a rule and by no label.
- [ ] `DestinationLine` matches them like any destination — same prefix rule, same `⏎` on an only
      match, same refusal on an ambiguous one.
- [ ] Taking `discard` archives the item, closes the modal, and raises a standing notice carrying
      `undo`, superseding any previous discard notice. Undo calls `client.unarchive`.
- [ ] An entry that cannot apply is drawn with its reason, not removed: `manual` where the routing
      summary already names the person, `discard` where the item is archived. Reuse the `why` an
      unavailable destination already takes.
- [ ] Tests: both entries reachable by pointer and by typing; `discard` from the keyboard alone;
      the notice offers undo and the item comes back; a second discard leaves one notice; an
      inapplicable entry is present, disabled and gives its reason.
- [ ] `git commit`

**Verify**: `pnpm --filter @notemap/ui test`

### 4. `manual` gets its step

Depends on phase 3. This is where the row's `done` field goes, plus two things it never had.

- [ ] Taking `manual` advances to a one-column step: the optional *where it went* field, the tag
      chooser, and `copy text` beside them. No place line, no tree, no preview, no second column.
- [ ] `copy text` is offered and never automatic, and is absent where `copyable()` is false or the
      capture holds no text — the same gate `Actions.svelte` already applies.
- [ ] Commit sends the note written or empty, and reads `mark processed`.
- [ ] Tests: the note reaches `client.routing.markProcessed`; an empty field sends no note; copying
      is not triggered by taking `manual`; the control is absent without a clipboard.
- [ ] `git commit`

**Verify**: `pnpm --filter @notemap/ui test`

### 5. The composer opens with the pool out of reach

Depends on phases 3 and 4. This reverses a rule, so it is its own phase and its own commit.

- [ ] The modal opens regardless of reachability. Destinations and `manual` are drawn unavailable
      with the reason; `discard` is live.
- [ ] The composer's tag chooser is drawn offline too — it is an outbox gesture like the row's.
- [ ] Tests: with the pool unreachable the composer opens, discarding works from it and drains
      later, and no destination or `manual` can be taken.
- [ ] `git commit`

**Verify**: `pnpm --filter @notemap/ui test`

### 6. The row collapses

Depends on 3–5, so that nothing the row gives up is unreachable at any commit.

- [ ] `Actions.svelte`: `route`, `done` and `archive` become one `process`, in the accent, never
      disabled by reachability. The inline *where it went* field and `markDone` go with them.
- [ ] `unarchive` stays, drawn only on an archived row.
- [ ] `copy`, `edit`, `open` unchanged.
- [ ] Update `Actions.test.ts`, and whatever in `Queue.test.ts`, `Feed.test.ts` and `Item.test.ts`
      names the old labels.
- [ ] `git commit`

**Verify**: `pnpm --filter @notemap/ui test`

### 7. The words

Depends on 6. Cosmetic but spec'd, and worth its own pass so nothing is missed.

- [ ] Composer chrome: `process`, then `process · <name>` or `process · manual`. Commit reads
      `route` for a destination, `mark processed` for `manual`.
- [ ] `action-log.ts` says `manual` where it says `done` for a routed action naming no destination.
- [ ] Rename `RoutingComposer.svelte` → `ProcessingComposer.svelte`. It stays in
      `components/routing/`: everything else there — the place line, the tree, remembered places —
      is routing and only routing.
- [ ] `git commit`

**Verify**: `pnpm -r typecheck && pnpm -r --silent test && pnpm -r lint`

### 8. Close

- [ ] `Status: Done`, `Closed:` dated, and the `Shipped:` entry on `shell.md` — which also drops
      the "except **one way out of the queue**" clause from its **Status** line.
- [ ] `git commit`

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
- **Whether an undrained `archive` followed by `unarchive` collapses in the outbox or sends both.**
  `client.md` says each operation knows what opposes it. Either is correct against the pool; a test
  that discards and undoes offline, then drains, should say which happens.
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
