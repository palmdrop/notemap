# Review: Shell third pass (PR #79)

**Date**: 2026-09-27
**Status**: Open
**Scope**: `git diff main...agent/shell-third-pass` — `apps/ui/src/**`, `docs/specs/shell.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

Most of the PR works as described. The process-surface changes, notice overflow, `grow()`
clipping and `offerable()` reactivity are small, correct and match the spec. The weak part is the
leave guard's focus handling around the modal. `answer()` does its focus work synchronously while
the `<dialog>` is still modal, and the effect closes the dialog a tick later. In a real browser
that means `keep editing` never puts the caret back in the field. When the question came from the
capture box, the dialog's focus restoration re-asks the same question every time (finding 1). The
jsdom `showModal` stub hides this: it has neither inertness nor focus restoration, so the tests
that claim to cover it pass without exercising it. The navigation guard also breaks external links
(2). The dialog's `save` can silently lose an edit while an attach is uploading (3). Typecheck,
lint and `pnpm -r --silent test` are green.

---

## Bugs

### 1. `keep editing` cannot refocus the field, and from the capture box it loops

`apps/ui/src/lib/leaving.svelte.ts:63`, `apps/ui/src/components/item/Edit.svelte:34-49`,
`apps/ui/src/components/queue/Queue.svelte:157-166`. `answer("stay")` clears `asking` and calls
`edit.resume()` synchronously, which runs `field.focus()`. The dialog is still open as a modal at
that point, because only the `$effect` closes it and that runs on the next flush. Everything
outside a modal dialog is inert, so the `focus()` is a no-op. Then `dialog.close()` runs the
dialog's focus restoration and hands focus back to whatever held it before `showModal()`.

```
j/k/esc path:   focus() on inert field → ignored → close() restores focus to <body> → no caret
capture path:   click box → focusin → captureFocused → leave → showModal (prev = box textarea)
                → keep editing → focus(field) ignored → close() refocuses box textarea
                → focusin → captureFocused → leave → unsaved → dialog again → …
```

From the capture box, `keep editing` and `esc` reopen the question indefinitely, and only
`save`/`revert` get out. The `asked` continuation in `captureFocused` fails for the same reason:
`capture?.take()` runs inside `answer()` while the modal is still up, so the box never gets the
caret after `save`/`revert`. The test *"leaving a row edited with changes asks, and staying goes
back into the field"* asserts `document.activeElement === field`, but it only passes because
`stubDialogs()` (`src/testing/dom.ts:52-66`) makes no inertness and restores no focus. The
capture-box path has no test.

Fix: close the dialog before any continuation runs. Either `answer()` closes it synchronously, or
the continuation runs from the dialog's `close` event. Then do the resume or `take()` after the
focus restoration, or suppress the restoration.

### 2. Navigating to an external link after the question is answered does nothing

`apps/ui/src/routes/+layout.svelte:77-83`. SvelteKit runs `beforeNavigate` for a same-tab click on
an external anchor, with `type: "link"` and `willUnload: true`. The handler cancels it, and after
`save`/`revert` it continues with `goto(to)`. SvelteKit 2.70 rejects `goto` for another origin
(`client.js:2335`, "goto: invalid URL"). The `void` swallows that into an unhandled rejection, and
the person stays on the page after being told the page would go. Unfurl cards
(`components/unfurl/Unfurl.svelte:71`) are exactly such anchors, drawn on every other row of the
queue and feed while one row is being edited. `data-sveltekit-reload` links are also turned into
client-side navigations by the same `goto`.

Fix: when `navigation.willUnload` (or `to` is off-origin) is true, continue with
`location.href = to.href` instead of `goto`.

### 3. The dialog's `save` can lose the edit while an attach is uploading

`apps/ui/src/lib/leaving.svelte.ts:69-72` and `apps/ui/src/components/item/editing.svelte.ts:82-83`.
`answer("save")` clears `open`, calls `edit.save()` and then calls `pending.then()`
unconditionally. `Editing.save()` returns early while `busy`. The continuation then moves the
selection or navigates. The Row's `if (!selected) editing = undefined` effect, or the page going,
drops the changed text without a save and without asking again, because the guard has already
released the edit. The foot's `save` is disabled while `busy`, but the dialog's `save` is not.
A related gap: during the first attach, `changed` is false until the upload resolves, so leaving
mid-upload doesn't ask. `pick()` then writes into a dead `Editing`, and the asset is orphaned until
the sweep.

Fix: `save()` should report whether it saved, and `answer` should only carry on when it did. Or
disable the dialog's `save` while `busy`, as the foot does.

---

## Design

### 4. The dialog is global state rendered per edit

`apps/ui/src/lib/leaving.svelte.ts` keeps one module-level question, but every mounted `Edit`
renders its own `<dialog>` whose `$effect` opens on `question.asked`. It works today only because
at most one `Edit` is mounted. `stack.svelte.ts` notes that SvelteKit can hold the outgoing and
incoming pages mounted together. The effect also depends on `asking.open`, which is not
reactive, so a dialog closed by anything other than `answer()` is never reopened or reconciled
(see 8). One dialog in the layout, driven by `question`, would remove both hazards and would make
finding 1's ordering easier to get right.

### 5. Edits dropped without asking, contrary to the spec

`apps/ui/src/components/item/Row.svelte:74-78, 148, 163`. The spec now says losing the selection
"any other way leaves the shape too … and asks first where it holds changes." Two paths skip the
guard. First, `$effect(() => { if (!selected) editing = undefined; })` discards the edit silently
on any selection change not routed through `leave`. Second, `mayEdit` turning false while editing
(the item processed on another device, so the held row stays drawn) unmounts `Edit`, and the
changes go silently. `editing` also stays defined, so the row then draws the full `Actions` while
the keyboard is limited to `tag` and the row cannot be clicked (`pick`/`reach` are `undefined`)
until `esc`. When an `Edit` unmounts mid-question, `opened()`'s cleanup also drops `asking`
along with its `then` (for example a navigation the person asked for). Either make these paths
ask or reset, or narrow the spec sentence to the paths that actually ask.

### 6. `enter` still reaches `process` on a row being edited

`apps/ui/src/components/queue/Queue.svelte:254-258`, `apps/ui/src/components/feed/Feed.svelte:157`.
`whileEditing` filters the row's commands, but `listCommands`' `onselect` is unfiltered, so
`enter` (field blurred) calls `process(current)`. The spec says "No decision is reached while it
is open — its foot draws none, so no key reaches one", and "a control that is not drawn has no key
either". The mouse equivalent is disabled (`reach` is `undefined` in `Row.svelte:101`). With an
unchanged edit it navigates to process and the edit silently closes. With changes it asks through
`beforeNavigate`.

### 7. Glossary gap: the edit's pending words have no term, and "unsaved" is on Draft's avoid list

`CONTEXT.md` lists `unsaved` under **Draft**'s _Avoid_. The PR deliberately does not make an
edit's uncommitted words a draft, yet `leaving.svelte.ts` exports `unsaved()` and the dialog says
"unsaved changes to …". Per AGENTS.md, either add a term (for the open edit and what it holds) or
amend Draft's avoid note, rather than using a listed-to-avoid word.

---

## Minor

### 8. A dialog closed without an answer blocks every later leave

`apps/ui/src/components/item/Edit.svelte:92-103`. Nothing handles the dialog's `close` event. If
the dialog closes other than through `answer()`, `asking` stays set, and every `leave()` returns
early (`leaving.svelte.ts:39`). Then `j`/`k`/`esc`/`close` do nothing, and `beforeNavigate` cancels
navigations that never continue, until `save` unmounts the edit. One way this can happen is
Chrome's close-watcher rule, which closes without a cancelable `cancel` after repeated `esc` with no
user activation in between. Not verified in a browser. Handling `onclose` with
`if (question.asked) answer("stay")` covers it.

### 9. Stale and false comments

- `apps/ui/src/components/item/Row.svelte:74` — "The box's foot is where `cancel` and `save`
  are": `cancel` is gone, and the effect now drops changes the rest of the PR says are asked about.
- `apps/ui/src/testing/dom.ts:53-54` — "What the shell relies on is the `open` state and the `close`
  event": nothing in the shell listens for `close`.
- `apps/ui/src/components/queue/Queue.test.ts:975-978` — the doc comment still says "holds a draft
  and its own `cancel`".
- `apps/ui/src/components/item/Row.svelte:85` ("Toggles"), `:91`, and `Item.svelte:96` — the
  `else editing.close()` branch is unreachable, because `whileEditing` removes `edit` while
  editing.

### 10. `beforeNavigate` continuation rewrites history for popstate, and loses goto options

`apps/ui/src/routes/+layout.svelte:82`. A cancelled back or forward navigation is undone by
SvelteKit with `history.go(-delta)`. Continuing with `goto(to)` then pushes a new entry instead of
traversing, which loses the forward stack. Programmatic `goto`s that pass `replaceState` or
`keepFocus` also lose them on the continuation.

### 11. Dispatch skips only presses whose target is inside the dialog

`apps/ui/src/lib/command/dispatch.ts:21`. If focus ever sits on `<body>` while a modal is open,
chords reach the shell behind it. `t` isn't wrapped in `leave` and would open a tag chooser under
the modal. Checking for any `dialog:modal` in the document is the stricter rule.

### 12. The dialog's text is not its accessible description

`apps/ui/src/components/item/Edit.svelte:93-106`. The dialog is labelled "Unsaved changes", but
the sentence naming the capture isn't referenced by `aria-describedby`. A screen reader lands on
`save` without hearing which capture. `data-first` also marks the last button. Naming it after
what it is (the focused one) would read better.

### 13. Process: `answeredFor` survives `release()`, and records may be refetched on every held update

`apps/ui/src/components/process/Process.svelte:320-334, 111-114`. After a route, re-choosing the
identical decision finds `answeredFor === decision`, so the mark doesn't stand during settling.
Reset it in `release()`. Separately, `recordsOf`'s key reads `summary`, a derived object. If
`$held` emits a new item (for example after a tag change), the effect reruns, empties `drawn` and
refetches, which flickers the head line back to the summary form. This depends on whether the
held store replaces `routing` by identity, and wasn't checked.

---

## Non-issues

- **Module-level non-reactive `open` in `leaving.svelte.ts`**: it is only read imperatively
  (`unsaved()`, `answer()`, the layout's guard), never in a reactive context. Only `asking` needs
  to be `$state`, and it is.
- **`goto(to)` re-entering `beforeNavigate`**: `answer()` clears `open` before the continuation,
  so the second pass sees `unsaved() === false` and lets it through.
- **`captureFocused` firing on every `focusin` in the box**: moving focus between the field, the
  tag line and `attach` re-runs `deselect()`, which is idempotent.
- **`save` published `whileWriting`**: the field's own `onkeydown` prevents default, so dispatch
  skips the press (`defaultPrevented`) and it doesn't save twice.
- **`overflowY: "clip"` in `grow()`**: correct for keeping the box edges; jsdom can't show it,
  as the PR says.
- **Disabled destinations hidden while their templates stay listed**: an intentional asymmetry,
  with the reasoning recorded in the spec.
