# Review: Capture draft

**Date**: 2026-09-22
**Status**: Addressed
**Scope**: `apps/ui/src/lib/draft.ts`, `apps/ui/src/components/capture/Capture.svelte`, `apps/ui/src/testing/dom.ts`, `docs/specs/shell.md`, `docs/specs/client.md`, `CONTEXT.md`
**Plan**: `docs/plans/capture-draft.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

Matches the plan and the spec paragraph it added. Words and tags round-trip through
`localStorage` under one key, the picture lives at module scope and goes with the draft, a
failed capture keeps both, a committed one clears both. The two `$effect`s in `Capture.svelte`
track what they need to (the `tags` reassignments are reads of the state source, so they fire)
and the commit path has no stale-write window: every assignment and `clearDraft()` run
synchronously before the effects get a turn, by which point `chosen` is already `undefined`.
`writeDraft` removing the key on an empty draft and `readDraft` mapping `null` to `EMPTY` agree.
The `Shipped:` entry on `shell.md` is there and dated. No bugs found; what remains is doc drift
in the plan and a `todo.md` change that should not have ridden along.

`pnpm -r --silent test`, `pnpm -r --silent typecheck` and `pnpm lint` all green.

---

## Bugs

None.

---

## Design

None.

---

## Minor

### 1. The plan contradicts what shipped

*Fixed 2026-09-22.*

`docs/plans/capture-draft.md:12,44,82` — the Goal still says "A picked picture is not kept",
Phase 1 says "No module-level state", and the struck-through unknown concludes "the module
holds nothing at module scope". `draft.ts:50` holds `picture` at module scope and `dom.ts:143`
had to grow a `clearDraft()` because of it. The amendment is recorded once, under Decisions;
the three lines that say the opposite were left standing.

### 2. `todo.md` gained an unchecked todo for the feature this PR ships

*Accepted 2026-09-22 — the developer keeps the todo edits on this branch.*

`docs/todo.md:14-15` — landed in `506008d` alongside the spec change. The item asks for the
attached asset to survive a closed tab, which the plan explicitly decided against, and it sits
unchecked in a PR whose plan is `Done`. Two unrelated todos (`clickable links`, `preview
external links`, `searchable files/folders`) came with it. Either check it off with a note
pointing at the decision, or keep the todo edits out of this branch.

### 3. One line in `shell.md` is not wrapped

*Fixed 2026-09-22.*

`docs/specs/shell.md:534` — 143 characters where the file wraps near 100.

### 4. `shaped` does not reject duplicate tags

*Fixed 2026-09-22 — deduped in `readDraft`.*

`draft.ts:17-25` — `TagSet` renders `{#each names as name (name)}`; a stored draft with the same
name twice would collide on the key. The box never writes one, so it takes a hand-edited store
to reach. Dedupe in `shaped` or accept it as the same "unreadable is empty" class.

### 5. Whitespace-only text is a draft

*Fixed 2026-09-22 — `writeDraft` treats it as empty.*

`Capture.svelte:80` refuses to capture it, `draft.ts:37` keeps it. A box restored with three
spaces in it is odd rather than wrong.

### 6. `EMPTY` is exported with no caller outside the module

*Fixed 2026-09-22 — no longer exported.*

`draft.ts:15` — nothing under `apps/ui/src` imports it.

---

## Non-issues

- **`clearDraft()` on commit next to effects that would write the same** — not redundant: if
  the box unmounts while `capture()` is awaiting, its effects are gone and only the explicit
  call clears storage. It is also synchronous, which the effects are not.
- **The write effect fires on mount with the restored values** — idempotent, and it is what
  sweeps an unreadable value out of storage on the first draw rather than the first keystroke.
- **`dom.ts` calls `clearDraft()` right after `localStorage.clear()`** — the storage half is
  redundant; the call is there for the module-level picture.
- **Two module-level writes through `$effect` rather than in `pick`/`drop`/`onadd`** — the plan
  chose one place a change can come from; both effects read exactly the state they mirror.
- **Reading the draft at component init rather than in `onMount`** — the values seed `$state`
  and the module is synchronous; there is nothing to wait for.
- **The remount test does not assert the text survives the remount** — the text path is covered
  by the "starts from the draft" case through storage, which is the same path a remount takes.
