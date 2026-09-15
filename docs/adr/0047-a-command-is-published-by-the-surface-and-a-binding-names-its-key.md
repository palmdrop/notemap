# 47. A command is published by the surface, and a binding names its key

**Date**: 2026-09-15
**Status**: Accepted
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

Two `<svelte:window onkeydown>` handlers exist — the queue's and the process surface's — each with
its own copy of `writing(target)` and its own `switch` over `event.key`. Beside them,
`components/item/Actions.svelte` hand-wires the same deeds as buttons, with `refusalFor()` feeding a
`disabled`/`title` pair by hand. The key and the button call the same function and nothing names the
pair, so nothing stops them drifting apart and nothing else — a command palette, a settings page —
can ask what a person can do right now.

The feed holds `selected` and listens to nothing: `j`/`k` do not walk it, and the index keys
`shell.md` already promises do not exist. So the question is not only how the two existing handlers
become one. It is what a keyboard gesture *is*, in a shape general enough that a surface with no
keyboard today gains one for free.

---

## Decision drivers

- **One definition for a deed, its key and its refusal.** A person reading the row's actions should
  be able to guess the keyboard from them, which only holds if button and key are the same fact.
- **Closes over what only the surface has.** The interesting commands need the selected row, or
  `Row`'s own exported `tag()` — state a global registry does not hold without being handed it.
- **No namespacing tax.** Two surfaces binding one key to two different deeds should cost nothing
  extra to declare.
- **Buys a palette's seam without buying a palette.** Nothing here should have to be redone to add
  one later.

---

## Considered options

1. **A flat global registry**, every command declared once, surfaces toggling which are active.
2. **Commands published by whatever is on screen**, read from a stack the dispatcher walks top-down.
3. **Keep two handlers**, just extract the shared `writing()` and matching `switch` cases into a
   helper each call into.

---

## Decision outcome

**Option 2.**

**A command** is the pair named: an id a binding names, a word a person reads, the deed itself —
`run` or `href`, never both, since `open` and `history` are places rather than deeds and a key on
one is a `goto` — and a `refusal`, replacing the `disabled`/`title` pair by hand. `primary`, `alarm`
and `group` are how the shell draws one, held in the same place so a button and a key never learn
two different answers.

**Commands are published by whatever is on screen, not registered globally.** A surface pushes a
layer of them on mount and pops it by identity on destroy — by identity because SvelteKit can hold
the outgoing and the incoming page mounted at once, and a single slot would be clobbered by
whichever effect runs last. In practice there is one layer live at a time.

**A binding maps an id to a chord, `id → chord`, in one flat table.** The dispatcher resolves a
keydown to a chord — a printable character *is* the chord, shift never named beside it, since
`event.key` already reads `D` and `+`; a named key lowercases and takes `mod` and `shift` as
prefixes, `mod` matching either physical modifier so the same chord matches on every platform — and
takes the top-most *live* command whose binding matches. Two rules about the caret rather than about
any deed live in the dispatcher itself: a chord does not fire while a field has it unless the
command says `whileWriting`, and `esc` in a field leaves the field rather than reaching anything.

**No persistence this slice.** Nothing writes an override until there is a settings page to write
one from, and `chordFor(id)` is the one function such a page would change.

**`discard` moves to `D`.** Shift is the guard already: the character is the chord, so naming a
forceful variant costs nothing new, and a capital reads as one. A two-key leader was weighed and
dropped as the only piece of this design that is not close to free.

**The word.** `Action` is taken twice already — `CONTEXT.md`'s append-only log entry, and
`components/primitives/controls/Action.svelte`, the button. A third meaning in one codebase is not
worth the familiarity a shared word buys, so the concept is a **command**, and `CONTEXT.md` gains it
beside **Binding**.

**No palette.** Only the architecture that allows one without redoing this.

### Consequences

- Good: one definition means a key and a button cannot drift, and the feed gains the queue's
  keyboard by publishing the same two functions the queue does.
- Good: a settings page or a palette needs no new seam — `chordFor`, the stack, and a command's
  `refusal` are already what either would read.
- Neutral: ids are plain strings, matched at dispatch time rather than namespaced per surface. Two
  surfaces may use the same id for different deeds without collision, because only one is ever
  live, but nothing enforces that a shared id means the same deed twice.
- Bad: a registry the size of a small app now lives as an idiom — a stack, a dispatcher, a bindings
  table — for three keyboards. The cost is paid once and is what makes the fourth one (a palette)
  cheap.

---

## Pros and cons of the options

### A flat global registry

- **Good** — one place to read every command that exists, which is what a palette wants most.
- **Bad** — the interesting commands close over the selected row and `Row`'s own `tag()`; making
  that available to a global registry means hoisting selection into a store nothing else needs it
  in, the tail wagging the dog.

### Commands published by whatever is on screen

- **Good** — a surface's state stays where it is, and a mounted surface is exactly the lifetime a
  command should have.
- **Good** — the feed gains a keyboard by publishing what the queue already builds, not by learning
  a new shape.
- **Bad** — "what commands exist right now" is answerable only while something is mounted to ask,
  which is the correct answer for a keyboard but not for, say, documentation generation.

### Keep two handlers, extract the shared parts

- **Good** — smallest change, touches nothing a button reads.
- **Bad** — leaves the button and the key as two definitions that happen to agree today. A palette
  still has nothing to read, and the feed still has no keyboard without a third handler written by
  hand.

---

## More information

Plan: [keyboard-commands](../plans/keyboard-commands.md). `chord → id` was considered for the
bindings table and dropped: *what key is this?* is a display question a palette or a settings page
asks by looking a chord up, not by the table being shaped that way, and `id → chord` is also what
lets a chord move without the id it names moving with it.
