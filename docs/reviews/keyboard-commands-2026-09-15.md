# Review: Keyboard commands

**Date**: 2026-09-15
**Status**: Resolved
**Scope**: `apps/ui/src/lib/command/`, the four publishing surfaces, `routes/+layout.svelte`
**Plan**: `docs/plans/keyboard-commands.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

The slice lands what it set out to: one dispatcher, one bindings table, one `commandsFor`, and the
two hand-rolled `onkeydown` handlers are gone. Tests, typecheck and lint are green, and the
nineteen existing keyboard tests still pass with `d → D` as the only edit. The seam is the right
shape — `chordFor`, the stack and `refusal` are genuinely all a palette or a settings page would
need.

The headline finding is that the rule the whole slice is for — *a key exists where its button
does* — is already broken on the item page, and by a comment that states the opposite. Beyond
that, two structural notes: the stack's ordering does not mean what the spec says it means, and
the surroundings a command closes over are still written twice per surface, which is the drift the
ADR set out to close.

---

## Bugs

### 1. The item page draws a `+` and publishes no `tag`

`components/item/Item.svelte:78` publishes `commandsFor` without `tag`, over the comment:

> `tag` is absent — nothing here draws a `+`.

`components/item/Item.svelte:129` draws `<Tags {item} addable />`. The `+` is right there, and `t`
does nothing on that surface. So the branch's own rule — and `shell.md:1152`'s "a key reaches
exactly what a button reaches, on either surface, and a control that is not drawn has no key
either" — is false on the one surface the plan called "nearly free".

The comment is the worse half: AGENTS.md is explicit that a comment claiming a guarantee must be
one the code enforces, and this one asserts a fact about the template thirty lines below it that
the template contradicts.

Fix: `bind:this` the `Tags` instance as `Row.svelte:43` does and pass `tag: () => tags?.add()`,
then drop the comment.

---

## Design

### 2. The stack is ordered by mount, not by depth

`lib/command/stack.svelte.ts:15` appends on `onMount`; `lib/command/dispatch.ts:25` walks from the
end. `shell.md:1152` says "A chord reaches the deepest surface that published one."

Svelte runs a child's `onMount` before its parent's, so a nested publisher lands *below* its
parent and loses every chord they share. Confirmed with a throwaway fixture: a parent and child
both publishing give `["child", "parent"]`, and `dispatch` takes `parent`.

Nothing nests today — `Queue`, `Feed`, `Item` and `Process` are each the only publisher on their
page — so this is latent, and `stack.test.ts` only covers the sibling case the ADR argued about.
But it is a documented guarantee the code does not hold, and the first nested surface (a palette
over a register, a sheet over the item page) is exactly the case that breaks it.

Fix: either order the stack deliberately rather than by mount, or say in the spec that the
top-most layer is the most recently mounted one and that surfaces do not nest.

### 3. A command's list is one definition; its surroundings are two

`Row.svelte:123-128` wires `Actions` with `address`, `offline`, `onprocess`, `onedit`.
`Queue.svelte:176-184` and `Feed.svelte:113-121` wire `commandsFor` with the same four again, from
different expressions — `onedit={() => (editing = !editing)}` in one, `drawn[id]?.edit()` in the
other. `Item.svelte:141` and `Item.svelte:78` are the same pair.

The refusals and the *set* of commands can no longer drift, which is most of the win. But what a
command actually does can: the queue's `e` and the queue's `edit` button are two expressions that
happen to agree today, and #1 is this shape failing in the smallest possible way — one of the two
call sites was simply given less.

Worth naming because the ADR's stated driver is "the key and the button are the same fact", and
they are one fact only down to the argument list. A `Row` that exported its surroundings, or an
`Actions` that took a command list rather than building one, would close it.

### 4. `writing()` knows about fields, not about focused controls

`lib/command/keys.ts:2` covers `INPUT`, `TEXTAREA`, `SELECT` and `contenteditable`. A focused
`<button>` or `<a>` is none of those, and `enter` is bound to `select`. So tabbing to the
`discard` button on a selected row and pressing `⏎` activates the button *and* dispatches
`select` → `process`, sending the item two ways at once.

This predates the branch — the old queue handler had the same gap — but `dispatch` is now the one
place to fix it, and the cheapest fix also covers it: skip a chord whose event is already
`defaultPrevented`, since a control that handled the key has said so.

---

## Minor

### 5. `shell.md:546` still spells discard `d`

> So `d` `d` `d` no longer walks the list — `d` `j` `d` `j` does

Written for the held-row change and left behind by `d → D` in the same file.

### 6. `reads()` is called only by its own test

`lib/command/keys.ts:37`. The plan justified it for a settings page and a palette, neither of
which exists. Either drop it until something reads it or note in the module why it is there.

### 7. `tag` has no `group`, so `Actions` would silently drop it

`lib/command/item.ts:139` omits `group`; `Actions.svelte:28-34` renders only `DECIDE` and `WORK`.
Correct today — `Actions` never receives `tag` — but a surface that passed one would get a
command with a key and no button, and nothing would say so.

### 8. Two checked-off tests do not exist

Plan task 3 lists "the process surface's `mod+enter` fires from a field and `e` does not", checked
off. No test anywhere presses a chord with `metaKey`/`ctrlKey`, and `Process.test.ts:2944` presses
`e` at `window`, not at a field. `route` is the only `whileWriting` command in the app and its
wiring is untested; `dispatch.test.ts` covers the rule, not the surface.

Untested for the same reason, each being a stated behaviour change: `esc` blurring `Capture` on
the queue (the plan calls this the thing that makes the queue's keyboard reachable at all), the
item page's keyboard, and `copy`/`undiscard` failures speaking in the corner now that `said` is
gone.

Also new and unguarded: `route` gains `refusal: ready ? undefined : …`, so `mod+⏎` on an
incomplete composer now falls through instead of being swallowed.

---

## Non-issues

- **`mod+⏎` in a path line reaches two senders.** `PathLine.svelte:313` does not check modifiers,
  so its own `onsubmit` fires and then the `route` command does. `send()` sets `busy` before its
  first `await`, so the second returns at the guard, and the first is the one carrying `beside`.
  Unchanged from `main`.
- **`esc` in the tag chooser never reaches the dispatcher.** `TagSet.svelte:181` calls
  `stopPropagation()`, so the chooser closes and the field keeps the caret — which is what
  `shell.md` describes.
- **`alt` is a prefix on a printable chord where `shift` is not.** Asymmetric on purpose and
  pinned by `keys.test.ts:32`: an alt combination should bind nothing.
- **`esc` with nothing selected now preventDefaults on the queue.** `deselect()` is a no-op there.
- **`drawn` keeps a key for every row ever rendered.** The queue already did this.

---

## Resolution

1. **Fixed.** `Item.svelte` binds its `Tags` and passes `tag: () => tags?.add()`, so `t` reaches
   the `+` the page draws. The comment claiming nothing there draws one is gone.
   `Item.test.ts` presses `e`, `t` and `p` on the page.

2. **Fixed.** `publish` reads a depth off Svelte context and sets `depth + 1` for whatever it
   contains, and the stack sorts by it — so a nested surface outranks the one drawing it whatever
   order the two mounted in. Ties keep mount order, which is still what the outgoing and incoming
   page want. `stack.test.ts` covers the nested case; `shell.md` now says *most deeply nested*, and
   says what decides between two surfaces neither of which is inside the other.

3. **Fixed.** `Actions` takes a `commands` list rather than an item and four callbacks, and each
   surface builds that list once: `Queue`, `Feed` and `Item` each hold one `$derived`, publish it
   to the keyboard and hand the same array down to the buttons. There is now one call site per
   surface, so a key and a button reach the same objects rather than two agreeing readings.

   `Row` passes the list through and no longer builds a second one; the surface reaches its `edit()`
   and `tag()` exports as before. The index view keeps the item keyboard it had, which is why the
   build stayed on the surface rather than moving into `Row`.

4. **Fixed.** `dispatch` drops a press that is already `defaultPrevented` — a line that committed
   on `⏎` — and one the browser is about to turn into a click, which is the new `activates()` in
   `keys.ts`: `⏎` or space on a focused `button`, `a`, `summary` or `role="button"`. Covered in
   `dispatch.test.ts` and `keys.test.ts`, and stated in `shell.md` as *whatever has the press keeps
   it*.

5. **Fixed.** `shell.md:546` reads `D` `D` `D` and `D` `j` `D` `j`.

6. **Fixed.** `reads()` and its two tests are gone, along with the `mac()` it needed. `chordFor` is
   the seam a settings page or a palette reads; printing a chord can be written when something
   prints one.

7. **Fixed** as a stated contract rather than a change of shape: `Command.group` now says it is
   absent where a command's control is its own, which is what `tag` is — the row's `+`.

8. **Fixed.** `Process.test.ts` presses `⌘⏎` from the words field and gets a route, presses `esc`
   there and gets the field left with the editor still open, and presses `⌘⏎` with no destination
   taken and gets nothing sent. `Queue.test.ts` presses `esc` in the capture box and walks the rows
   after it. `Item.test.ts` covers the item page's keyboard. `lib/command/item.test.ts` covers a
   failed `copy` speaking in the corner.

   **Not covered, deliberately**: a failed `undiscard`. `client.unarchive` enqueues to the outbox
   and drains in the background, so its `.catch` fires only on a store write failure, never on a
   pool answer — exactly as `discard`'s does in `lib/quick.ts:23`. The safety net is consistent
   with the codebase and is left alone; a test would have to break the store to reach it.

