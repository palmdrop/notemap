# A command is published by the surface, and a binding names its key

**Date**: 2026-09-15
**Status**: Todo
**Spec**: `docs/specs/shell.md`
**Closed**:

---

## Goal

Every keyboard gesture in `apps/ui` resolves through one dispatcher against a list of **commands**
the surface on screen publishes, so that a deed's key, its button and its refusal are one
definition; the queue's and the process surface's hand-rolled `onkeydown` handlers are gone; the
feed has the keyboard it never had; and a command palette needs no seam that does not already
exist.

---

## What changes, and why

Two `<svelte:window onkeydown>` handlers exist today — `components/queue/Queue.svelte:154` and
`components/process/Process.svelte:680` — each with its own copy of `writing(target)` and its own
`switch` over `event.key`. Beside them, `components/item/Actions.svelte` hand-wires the same deeds
as buttons, with `refusalFor()` feeding a `disabled`/`title` pair. The key and the button call the
same function and nothing names the pair, so nothing stops them drifting and nothing else can ask
what a person can do right now.

A **command** is that pair named: an id, a word a person reads, the deed, and why it cannot be
taken. A **binding** maps a command to a chord, in one table. The dispatcher reads both. So does
`Actions`. So would a palette.

**Settled with the developer, 2026-09-15:**

- **Commands are published by whatever is on screen, not registered globally.** The interesting
  ones close over state only the surface has — the selected row, and `Row`'s exported `tag()`.
  Hoisting selection into a global store to make a flat registry work is the tail wagging the dog.
- **A chord is `event.key`, not a modifier flag.** A printable single character *is* the chord and
  shift is never named separately — `d`, `D`, `+`, `[`. A named key lowercases and names its
  modifiers — `enter`, `mod+enter`, `shift+tab` — where `mod` is ⌘ on mac and ctrl elsewhere, which
  `Process.svelte:681` already means by hand. Layout-robust, and it is how the existing code already
  reads `+` and `[`.
- **Bindings are `id → chord`.** Dispatch takes the top-most *live* command whose binding matches,
  which is what lets two surfaces bind one key to different deeds without namespacing the ids. The
  inverse — *what key is this?* — is what a palette and a settings page both ask, and `chord → id`
  would make it the awkward direction.
- **No persistence in this slice.** Nothing writes an override until there is a page to write it,
  and `chordFor(id)` is the one function that page changes.
- **`discard` moves to `D`.** Shift is the guard: the character is the chord already, so it costs no
  machinery, and a capital reads as the forceful variant. A two-key leader was weighed and dropped —
  it is the only piece of this design that is not nearly free.
- **No palette.** Only the architecture that allows one.

**The word.** `Action` is taken twice — `CONTEXT.md:206` is one entry in the append-only log, and
`components/primitives/controls/Action.svelte` is the button. A third meaning in one codebase is
not worth the familiarity, so the concept is a **command**.

**Three behaviour changes the developer should see land**, beyond the refactor:

- `d` no longer discards; `D` does.
- The feed gains the whole row and list keyboard. It holds `selected` today and listens to nothing,
  so `j`/`k` do not work there and the index keys `shell.md:559` says the feed has do not exist.
- One `writing()` gives the queue the process surface's rule that the first `esc` leaves the field.
  `Capture` is autofocused on arrival, so until now no key on the queue worked until the caret was
  clicked away; `esc` becomes the way from writing to working.
- **`copy` and `undiscard` speak in the corner.** `Actions` holds a local `said` for either failing
  and draws it under the row. A deed a key took has no row to draw under — the row may not be on
  screen — which is the reason `lib/quick.ts` already gives for `discard` and `manual` speaking
  there. `said` goes.

**New bindings**, beyond porting what exists: `e` edit, `c` copy, `o` open, `u` undiscard — the
four deeds `Actions` already draws as buttons and no key could reach.

---

## Tasks

### 1 — The vocabulary and the seam

Nothing on screen changes. Depends on nothing.

- [ ] Branch `agent/keyboard-commands`.
- [ ] `docs/adr/0047-*.md`: a command is published by the surface and a binding names its key.
      What it weighs: the global registry that selection would have to be hoisted for, `chord → id`
      against `id → chord`, and the word, given `Action` is spent.
- [ ] `CONTEXT.md`: **Command**, and **Binding** beside it. _Avoid_ on the first: action, shortcut,
      hotkey, keybinding.
- [ ] `lib/command/command.ts` — the type. `run` or `href`, never both: `open` and `history` are
      places rather than deeds and `shell.md:1069` is deliberate that they stay links, so a key on
      one is a `goto`. `refusal` replaces the `disabled`/`title` pair. `primary`, `alarm` and
      `group` are how the shell draws a deed, and one place holding them beats two.
- [ ] `lib/command/keys.ts` — `chord(event)`, `reads(chord)` for display, and the single `writing()`
      that two components own copies of.
- [ ] `lib/command/bindings.ts` — the default table, `id → chord`, and `chordFor(id)`. Named so it
      does not collide with `lib/routing.ts`'s `keyFor`.
- [ ] `lib/command/stack.svelte.ts` — push a layer on mount, pop it by identity on destroy. One
      layer in practice; by identity because SvelteKit can hold the outgoing and incoming page
      mounted at once and a single slot is clobbered by whichever effect runs last.
- [ ] `lib/command/dispatch.ts` — a plain function over the event, the stack and the bindings, so it
      is tested without a DOM. Two rules live here rather than in any command, both being about the
      caret rather than about a deed: a chord does not fire while a field has it unless its binding
      says `whileWriting`, and `esc` in a field leaves the field.
- [ ] Tests beside each: the chord of a shifted letter, of `+`, of `mod+enter`; a chord bound twice
      taking the live one; the field rules.
- [ ] `pnpm -r --silent test`, typecheck, lint. Commit.

### 2 — An item's commands, and the buttons read them

Depends on 1. The screen is unchanged and the tests that cover `Actions` should not move.

- [ ] `lib/command/item.ts` — `commandsFor(item, surroundings)`, pure and list-returning, where
      `surroundings` carries what `Actions` takes as props today plus `tag`. It absorbs
      `refusalFor()` from `lib/processing.ts` and calls `discard`/`manual` from `lib/quick.ts`;
      neither module moves.
- [ ] `components/item/Actions.svelte` renders the list. The two tiers `shell.md:1054` describes
      come from `group`, and the order within each from the order returned — `process` bold first,
      `unarchive` beside the decisions, `open` last.
- [ ] `copy` and `undiscard` raise their failures in the corner, and `Actions`' local `said` goes.
- [ ] `lib/command/item.test.ts`: the refusals `processing.test.ts` covers, now as absent or refused
      commands; `copy` absent without a clipboard or with nothing to take; `edit` absent on a
      processed item.
- [ ] `pnpm -r --silent test`, typecheck, lint. Commit.

### 3 — The surfaces publish, and one dispatcher reads

Depends on 2. This is where behaviour changes.

- [ ] `lib/command/list.ts` — walking a register: `j`/`k`, `enter` as select-first-or-process, `esc`
      as deselect.
- [ ] `Queue.svelte` publishes its list and the selected row's, and loses its handler, its `switch`
      and its `writing()`. The selection, the `drawn` map and `reveal()` stay where they are.
- [ ] `Feed.svelte` publishes the same two, which is the whole of it gaining a keyboard.
- [ ] `components/item/Item.svelte` publishes the one item's, the subject there being the page.
- [ ] `Process.svelte` publishes `e`, `esc`, `[`, `]` and `mod+enter`, and loses its handler.
- [ ] `routes/+layout.svelte` binds the dispatcher to `<svelte:window>`, once, and not while the
      door is shut.
- [ ] `docs/specs/shell.md`: the two keyboard paragraphs at `:548` and `:654` become one section
      saying what a command is, what a binding is, which surface publishes what, and the tables.
      The "never printed" clause goes — a settings page and a palette both print it. The feed's
      keyboard is stated rather than implied, and `d` reads `D`.
- [ ] A `keys()` helper in `testing/dom.ts` if none of the existing ones will dispatch on `window`.
- [ ] Tests: the queue's `D` discards and `d` does not; the feed walks and processes; the process
      surface's `mod+enter` fires from a field and `e` does not.
- [ ] `pnpm -r --silent test`, typecheck, lint. Commit.

---

## Unknowns

Resolved 2026-09-15, each against the code, and kept here with its fallback.

- **Whether `Actions`' two groups survive a list-driven render.** They do: `group` and the order
  returned reproduce what `shell.md:1054` describes, `unarchive` being a `decide` and `open` last
  among the `work`. _Fallback_: `Actions` keeps its own layout and looks commands up by id, which
  costs a palette nothing.
- **Where the tag command is built.** Decided by the rule this slice is for — **a key exists where
  its button does**. `Tags` takes `addable={selected}` and knows nothing of the surface, so a feed
  row already draws the `+` and no key reaches it; the feed grows the `drawn` map the queue has.
  _Fallback_: the surface passes the callback and one that has none simply publishes no command.
- **How many bindings want `whileWriting`.** Two, and both are what the code does by hand today.
  _Fallback_: a third and a fourth would mean the flag is the wrong shape and the rule belongs to
  the field.
- **Whether the item page publishing is worth it.** Yes — one subject, no selection, nearly free.
  _Fallback_: drop it; that surface is read rather than worked.
- **Whether `esc`-blurs-the-field is welcome on the queue.** Taken, and it is a gain rather than a
  cost: `Capture` is autofocused, so no key on the queue works until the caret is clicked away.
  _Fallback_: the rule reads the surface, which would be the first thing in the dispatcher that
  knows where it is.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

There are none for the keyboard today — neither `Queue.test.ts` nor `Process.test.ts` presses a
key — so the port has nothing to keep it honest and the tests named in each phase are the point
rather than the garnish. Most of it is pure and tests as a function: the chord, the binding lookup,
the dispatch, `commandsFor`. Only the three surface tests in phase 3 need a rendered component.

`pnpm test:stack` is not part of this. Nothing here crosses a layer.

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
