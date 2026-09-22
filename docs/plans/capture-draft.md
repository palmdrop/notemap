# Capture draft: what is typed survives the tab

**Date**: 2026-09-22
**Status**: Done <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/shell.md`
**Closed**: 2026-09-22

---

## Goal

> Text typed into the capture box and the tags chosen for it are there again after a reload, a
> crash, a closed tab, or a visit to another surface, until a capture commits them. A picked
> picture survives the visit and not the reload, being held in memory, and nothing in
> `@notemap/client` changes.

## Decisions taken

- **The draft is the shell's, in `localStorage`**, on the terms `order`, `theme` and `names` already
  use it: presentation-sized, string-shaped, and losing it costs retyping. It is not the client's
  and not in the store port — that shape was weighed and would only have been worth it for the
  picture, which is out.
- **The picture is not written.** `Capture.svelte` goes on holding the `File` in memory and attaching
  at commit, so `client.md`'s "attaching without capturing" paragraph stays true and nothing about
  asset lifecycle moves. After a reload the box comes back with its text and no picture, and says
  nothing about it. *Amended while implementing*: the `File` is held at module scope beside the
  draft, so it survives the box unmounting — a visit to the feed and back — and only a reload
  loses it.
- **One draft per origin.** Two tabs share it, last write wins. Not synced across tabs and not
  through the pool.
- **Capture only.** An edit's draft and the composer's typed arguments are not in scope.
- **Read when the box is drawn, written as it changes, cleared when a capture commits.** A capture
  that fails keeps it. No debounce: the value is small and the write is synchronous.
- **Unreadable is empty**, the way `names` treats it: a value that does not parse or is not the
  expected shape restores nothing, and the next keystroke writes over it.

---

## Tasks

### Phase 1 — the draft module

Depends on nothing.

- [x] Branch `agent/capture-draft`.
- [x] `apps/ui/src/lib/draft.ts`: read, write and clear one `{ text, tags }` under `notemap:draft`.
      The box reads it when it mounts, so a visit to another surface and back restores it the
      same way a reload does. The picked `File` is held beside it, at module scope, which is what
      lets the picture survive the visit; nothing about it is written.
- [x] `apps/ui/src/lib/draft.test.ts`: round-trips; clear leaves nothing; garbage, a wrong shape
      and a full or refused storage all restore empty and do not throw.
- [x] Verify: `pnpm --filter ui test -- draft` green.
- [x] Commit `feat(ui): hold a capture draft in local storage`.

### Phase 2 — the box uses it

Depends on phase 1.

- [x] `Capture.svelte`: `text` and `tags` start from the draft; every change writes it; a
      committed capture clears it with the fields. The `File`, the preview and `busy` stay as
      they are.
- [x] `Capture.test.ts`: a box rendered over a stored draft draws the text and the tags; typing
      writes; a commit clears storage; a refused capture leaves it.
- [x] The picked `File` held in memory across mounts, dropped with the draft; a test that unmounts
      and draws the box again.
- [x] Verify: `pnpm --filter ui test -- Capture` green; by hand, type, reload, see it; type, go to
      the feed, come back, see it; capture, reload, see nothing.
- [x] Commit `feat(ui): restore the capture box from its draft`.

### Phase 3 — the docs

Depends on phase 2.

- [x] `docs/specs/shell.md`, *Capture is the head of the queue*: a paragraph saying what is typed
      and the tags chosen survive a reload, a closed tab and a visit elsewhere; that the picture
      does not and is picked again; and that two tabs share one draft.
- [x] `docs/specs/client.md`, *An attachment made offline*: the sentence ending "does not have
      one" gains a dated note that the web shell keeps a draft of words and tags only, which is
      why it still has none.
- [x] `CONTEXT.md`: **Draft** — what a capture box holds before its capture commits; kept by the
      shell, on the device, never sent. *Avoid*: unsaved, pending (which is the outbox's word).
- [x] Verify: `pnpm -r --silent test`, typecheck and lint green.
- [x] Commit `docs(shell): the capture box keeps a draft`.

---

## Unknowns

- ~~**Whether `Capture.test.ts` sees `localStorage` per case.**~~ It does: `testing/dom.ts`
  clears it in `beforeEach`. The module-level picture is not storage and does not clear with it,
  so `dom.ts` calls `clearDraft()` too.
- ~~**Whether the tag chooser's `onadd`/`onremove` are the only writes to `tags`.**~~ They are:
  `TagSet` takes `names` read-only. Written through an `$effect` over both fields anyway, which
  is the one place a change can come from.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
