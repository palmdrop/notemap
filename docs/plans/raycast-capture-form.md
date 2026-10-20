# Raycast capture form: drafts, attachments alone, attachments first

**Date**: 2026-10-20
**Status**: In progress
**Closed**:

---

## Goal

In the Raycast **Capture** command, a note left with Escape is there again on the next launch,
along with its tags and trigger tags, and the draft is gone once a capture lands. A capture made of
attachments with no text is taken, and its notice names the file, or how many there are. The
attachments field sits directly under the note.

---

## Decisions taken

- **A draft keeps the text, the tags picked, the new tags typed, and the trigger tags among
  them.** It keeps no attachments, because a path picked last week may no longer point at anything.
- **A refused capture keeps its draft.** The form already stays open on a refusal. Leaving it
  afterwards must not lose the words.
- **The notice for a capture with no text** names the file when there is one attachment
  (`photo.png`), and the count when there are several (`2 attachments`). It reads the same in the
  toast and the HUD, wrapped in the wording `submitting` already uses: `Captured —`,
  `Waiting to send —`, `Captured, but not all of it —`.
- **Field order**: Note, Attachments, Tags, New tags, then the fields a template asks for.
- **Nothing outside the extension changes.** Core already takes a note with empty text: the `note`
  schema in `packages/core/src/pool/payload.ts` requires no `text`. The refusal lives only in the
  form's own check in `capture.tsx`.
- **What was typed into a template's asked fields is not kept.** A restored trigger tag asks the
  pool for its fields again, and they start empty.

---

## Unknowns

- **Does Raycast drop a draft when a submit pops to root?** `leaving` calls `showHUD` with
  `PopToRootType.Immediate`. Its comment says the form is popped specifically so the next launch
  does not reopen a note that was already sent. If `enableDrafts` saves the form as it unmounts,
  that comment's failure comes back. Check this by hand in `pnpm dev` before building anything on
  it. **Fallback:** the extension keeps its own draft in Raycast's `LocalStorage`, saved as the
  fields change and cleared in `leaving`. This is the shape the web shell's capture draft already
  has ([capture-draft](capture-draft.md)).
- **Does `enableDrafts` restore the file picker on its own?** If Raycast restores uncontrolled
  fields from the draft, the picker would come back holding paths, against the first decision. In
  that case the picker is either controlled and started empty, or the fallback above is used, since
  it never stores `files` in the first place.

---

## Tasks

### Phase 1: drafts

Depends on nothing.

- [x] Create branch `agent/raycast-capture-form` _(2026-10-20)_
- [-] Settle the first two unknowns by hand in `pnpm dev`: Escape and relaunch, submit and
      relaunch, refuse and relaunch _(dropped — no Raycast in the agent's container; the
      `LocalStorage` fallback was taken outright, since it settles both by construction)_
- [x] Restore text, picked tags and new tags from a draft, starting the `picked` and `typed` state
      from it. Use `enableDrafts` with `draftValues` if Raycast behaves, the `LocalStorage` fallback
      if not _(2026-10-20)_
- [x] Make sure a capture that lands, or lands partly, leaves no draft behind, and a refused one
      keeps it _(2026-10-20)_
- [x] Tests for whatever is plain TypeScript: reading a draft into the form's starting values, and
      clearing it if the fallback is used _(2026-10-20)_
- [x] Typecheck, lint, test; `git commit` _(2026-10-20)_

**Verify:** in `pnpm dev`, type a note, add a tag and a trigger tag, then press Escape. Relaunch:
all three are back and no attachment is. Capture it, relaunch, and the form is empty. Stop the
daemon, capture, and the capture goes to the outbox. Relaunch, and the form is empty.

### Phase 2: attachments alone, attachments first

Depends on nothing. Independent of phase 1.

- [x] Change the form's check from "no text" to "no text and no files". Keep `Nothing to capture`
      for the case where both are empty _(2026-10-20)_
- [x] A function in `lib/note.ts` saying what a capture is: the text excerpt when there is text,
      otherwise the single file's name, or `N attachments`. Use it for the toast in `capture.tsx` and
      for the line `submitting` builds _(2026-10-20)_
- [x] Move `Form.FilePicker` to directly under the note _(2026-10-20)_
- [x] Tests in `lib/note.test.ts` (text, one file, several files, whitespace-only text with a file)
      and in `lib/submitting.test.ts` (an attachments-only capture is captured and its line names
      the file) _(2026-10-20)_
- [x] Typecheck, lint, test; `git commit` _(2026-10-20)_

**Verify:** `pnpm --filter notemap test` passes. In `pnpm dev`, a capture with one picture and no
text lands in the queue with its picture, and the HUD says `Captured — <name>.png`. With two
files, it says `Captured — 2 attachments`.

### Phase 3: docs and todo

Depends on phases 1 and 2.

- [x] Update the **Capture** line in `apps/raycast-extension/README.md` to cover drafts,
      attachments without text, and the field order. Leave the root `README.md` alone _(2026-10-20)_
- [x] Tick both Raycast lines under *Inboxes* in `docs/todo.md`, and tick "trigger tags with
      arguments" under *Templates*, shipped in #112 _(2026-10-20)_
- [x] `git commit` _(2026-10-20)_

**Verify:** the extension's README describes what the form now does, and `docs/todo.md` has no open line this
plan closed.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Raycast's components aren't rendered under Vitest here, so anything visible in the form is checked
by hand in `pnpm dev`. Everything else in this plan goes in `lib/` and gets unit tests.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
