# Review: Raycast capture form — drafts, attachments alone

**Date**: 2026-10-20
**Status**: Resolved
**Scope**: `apps/raycast-extension/src/capture.tsx`, `apps/raycast-extension/src/lib/{draft,note,submitting}.ts` and their tests, `apps/raycast-extension/README.md`, `docs/todo.md` (PR #113)
**Plan**: `docs/plans/raycast-capture-form.md`

---

## Overall

Matches the plan. The draft round-trips text, picked tags and typed tags, `leaving` drops it on
every path that captured (captured, waiting, partly, and the post-capture `catch`), and a refused
capture never reaches `leaving`, so its draft stays. The serialisation in `draft.ts` does what its
comment says, and its test would fail without it. Attachments alone pass the form's check and go
through `capturing` unchanged. `described` covers the toast and every `submitting` line. The
weakest part is how the draft meets its edges: a read that lands after the first keystrokes
overwrites them, every keystroke queues a full write with no coalescing, and a failing
`LocalStorage` call can either wipe the draft or keep the form open over a capture it already
made. None is likely, but the first two are the moments a draft exists for. `pnpm typecheck`,
`pnpm lint` and `pnpm -r --no-sort --silent test` all pass. No spec is named, so there is no
`Shipped:` trail to check (see 5).

---

## Bugs

### 1. The restored draft overwrites what was typed while it was being read

`apps/raycast-extension/src/capture.tsx:45-60` — `isLoading` does not disable the fields, and the
TextArea has `autoFocus`. Once the read resolves, `setText(draft.text)`, `setPicked` and `setTyped`
replace state unconditionally:

```
hotkey → form drawn, focused → first keys typed → read resolves → setText(draft.text ?? "") → keys gone
```

With no draft stored, `draft.text` is `""` and the first keystrokes are erased. The window is one
`LocalStorage` IPC round trip, but launching from a hotkey and typing at once is exactly how this
form gets used.

Fix: restore only into a field that is still empty (`setText((current) => current === "" ? draft.text : current)`, and the same for the others), or hold the fields back until `restored`.

---

## Design

### 2. One queued write per keystroke, and Escape loses the tail of the queue

`apps/raycast-extension/src/capture.tsx:64-67`, `apps/raycast-extension/src/lib/draft.ts:53-68` —
every change to `text` queues a full `setItem`, and `after` runs each write behind the one before
it. Fast typing builds a queue of stale drafts, and the newest is always last. Escape ends the
process, so whatever is still queued never reaches storage, and the part that goes missing is the
most recent text. The serialisation that guards against a write landing after the drop also
widens this window.

Fix: coalesce. `keep` records the latest draft and starts a write only if none is in flight; when
that write finishes, it writes whatever is latest by then. `drop` clears the pending draft before
it queues the remove. This keeps the drop ordering and loses no more than one write on exit.

---

## Minor

### 3. A failing `LocalStorage` call has no handling

- `capture.tsx:195` — `await shelf.drop()` comes before `showHUD`. If `removeItem` rejects,
  `leaving` throws after the capture was made: no HUD, no pop to root, a form still holding the
  sent note, and a rejection from `onSubmit`. A second submit captures the note again. Drop after
  the HUD is shown, or catch the error and continue.
- `capture.tsx:47-56` — if `getItem` rejects, `.finally` still sets `restored`, and the keep effect
  then writes the empty form, which runs `removeItem` and deletes the draft the read failed to
  fetch.
- `capture.tsx:47,66` — both promises are `void`ed with no `catch`, so their rejections go
  unhandled.

### 4. A keep can land after the drop

`capture.tsx:195-201` — the form stays interactive through the settle and the toast. A change
made while `showHUD` is awaited queues a keep after the drop, and the next launch brings back the
note that was just sent. A change made earlier, during the two-second settle, is dropped along
with the draft, even though the capture did not include it. Both windows are small. A flag set at
the start of `submit` that turns `keep` into a no-op covers the first.

### 5. Doc drift around "draft"

`CONTEXT.md:45-50` defines **Draft** as kept by the *shell*, with its attachments kept in memory.
The Raycast extension is not a shell in the glossary (`CONTEXT.md:518`), and its draft holds no
attachments. Amend the entry so it covers both, or name the extension's draft differently. The
plan names no spec, but earlier Raycast form changes were recorded in `docs/specs/shell.md`'s
`Shipped:` trail (2026-10-10), so this one has no record there.

### 6. The outbox shows nothing for an attachments-only capture

`apps/raycast-extension/src/outbox.tsx:103` — `about` returns `saidIn(payload)`, which is `""`
for a capture without text, so the row reads `Capture` with no subtitle. Before this PR the
extension could not produce such a capture. The asset count is in the payload, so `described`'s
`N attachments` would fit here too. The file name is not available.

### 7. Test gaps

- `apps/raycast-extension/src/lib/draft.test.ts` — nothing covers a write that rejects. Removing
  the second `next` in `last.then(next, next)` (`draft.ts:55`) would leave the queue stuck after
  one failure, and every test would still pass.
- `apps/raycast-extension/src/lib/submitting.test.ts:105-114` — the attachments-only test asserts
  only the line. The plan asked for "is captured" too: that `client.capture` received `text: ""`
  and an `assets` entry. The fake `capture` records nothing.

---

## Non-issues

- **`LocalStorage` over `enableDrafts`** — the 2.4.1 types say only that drafts are "preserved
  when user exits the screen", and say nothing about clearing on submit or about
  `PopToRootType.Immediate`, so they give no evidence against the choice. A refused capture also
  argues for it: it must keep its draft, and if Raycast clears drafts on submit, `enableDrafts`
  cannot express that.
- **Restored picks added to `offered`** (`capture.tsx:136-149`) — no item key repeats across the
  three groups. A pick that later turns out to be known, or a trigger tag, moves into that group
  under the same key.
- **The keep that fires as `restored` turns true** writes the draft that was just read. The write
  is redundant and harmless.
- **Whitespace-only text sent with an attachment** goes out verbatim, as the web shell's does
  (`apps/ui/src/components/capture/Capture.svelte:189`).
- **A restored trigger tag asks for its fields again** — `tags.join` and `templates` in the
  asking effect's dependencies see to that, as the plan intends.
- **"trigger tags with arguments" ticked in `docs/todo.md`** — shipped in #112, and the PR body
  says so.
- **Plan `Status: In progress`** — every task is done, but the hand check in Raycast is still
  outstanding.
