# The shell's offline marks

**Date**: 2026-08-24
**Status**: Todo
**Spec**: `docs/specs/shell.md`
**Closed**:

---

## Goal

The three conditions shell.md names stop being two. A row whose outbox operation has not drained
says so; a surface drawn from the cache says it is showing what the client holds rather than what
the pool holds; and a picture captured with the pool out of reach draws its own bytes instead of a
broken image. After this, a capture made yesterday and one the pool already has no longer look
identical.

Depends on [durable-offline-client](durable-offline-client.md), which is what makes any of it true,
and on [reconnect-and-remembered-order](reconnect-and-remembered-order.md), which is where a page
learns to say which kind of failure it holds — phase 2 needs that to draw one and not the other.

---

## Tasks

### Phase 1 — the pending mark

Depends on the client's outbox being observable per item, which it already is.

- [x] A row carries a **pending** mark when an outbox operation about that item has not drained. The
      word is `pending`; `unsynced` is on [CONTEXT.md](../../CONTEXT.md)'s Avoid list for this exact
      thing. *Settled 2026-08-26*: it goes in the metadata rail rather than into the row's timestamp
- [x] It is **not** drawn in the idiom `routed`, `archived` and `revised` use. Those say what became
      of the item in the pool; this says what this client's outbox is still holding, and they are
      different claims about different subjects. So it is the quieter of the two, an archived row
      that has not drained carries both without either shouting over the other, and `became`'s
      one-word rule is left alone
- [x] Quiet, not loud. Pending is the ordinary state of a mutation and it heals itself
      ([CONTEXT.md](../../CONTEXT.md)); it is not drawn in the shape a refusal is drawn in
- [x] The bar's `N waiting` **stays**. It answers whether anything at all is outstanding, including
      for rows nobody is looking at; the mark answers whether this row is. Two marks, two questions
- [x] The shell needs a way to ask which items have undrained work. `targetOf` is not exported from
      `packages/client` today, so this is a client API addition — an exported helper, or a derived
      observable of the ids with work outstanding — and it is designed before it is built
- [x] The compose row's own capture is the first thing that has it
- [x] Tests: a capture made against a dead transport draws the mark; the mark goes when the pool
      answers; a refused operation is not drawn as pending; an archived row that has not drained
      says both things
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` green
- [x] `git commit`

### Phase 2 — a surface that says what it is

Depends on the client's derived surfaces.

- [x] The queue and the feed say, when they are drawn from the cache, that this is what the client
      holds. The queue matters most: three rows must not read as "you are nearly done", and the feed
      is defined as the pool read *completely*
- [x] Stated once per surface, in the register rather than per row, and in the same voice as the
      chrome's unreachable mark — a condition, not a failure
- [x] The surface's **failure** is settled in the same pass, since it occupies the place this mark
      wants. *Settled 2026-08-26*: an unreachable read says nothing here at all — shell.md states
      unreachable **once**, in the chrome, and a row-shaped repeat of it is the thing this phase is
      removing. A read the pool **refused** keeps the register, because it is the one read failure
      that needs a person and the register is where the reader is looking. It does not go to the
      corner: the corner belongs to the outbox — an operation, with an id, that a person dismisses —
      and a failed read has neither
- [x] It reads the two apart from what the page carries, which
      [reconnect-and-remembered-order](reconnect-and-remembered-order.md) puts there
- [x] Tests: a cold client with no transport draws the queue with the mark; the mark goes once the
      pool has answered for that surface; an unreachable read draws no failure and a refused one
      does
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` green
- [x] `git commit`

### Phase 3 — a picture that is there before it is sent

Depends on the client resolving locally-held bytes.

- [x] A picture row draws the local bytes while its capture has not drained, so the row looks the
      same before and after the drain
- [x] The compose row stops saying `uploading…` before a capture can be made, the upload having
      moved into the drain. What it says while an upload is actually in flight is a matter for the
      pending mark, not a separate wait. *Done 2026-08-26* in
      [durable-offline-client](durable-offline-client.md)'s phase 5: the wait went with the upload
      it was about, and shell.md's sentence naming it was amended there
- [x] Tests: a picture captured against a dead transport draws an image; the same row after the
      drain draws the pool's copy. *Held rather than built*: the client resolves an asset it still
      holds bytes for, so the row already drew them; what was missing was the test
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` green
- [x] `git commit`

### Phase 4 — the spec

Depends on the phases above.

- [ ] `docs/specs/shell.md`: the three conditions section stops describing pending as undrawn, and
      the row's mark, the surface's mark and the local-bytes rule are written as they landed
- [ ] `docs/specs/shell.md`: "Pending is quiet: one count in the chrome" becomes a sentence about
      two marks and what each one answers, and the unreachable clause says that a surface repeats
      it nowhere
- [ ] `docs/todo.md`: drop the pending-mark item
- [ ] Add the dated `Shipped:` entry (see Notes)
- [ ] `git commit`

---

## Unknowns

- [x] **Which of shell.md's two candidates the pending mark takes** — an inverted timestamp, or a
  word in the left column beside `routed` and `archived`. *Settled 2026-08-26*: the word, in the
  rail, but not in the state word's idiom — the two are claims about different subjects, and phase 1
  says which is which. The reasoning is in
  [reconnect-and-remembered-order](reconnect-and-remembered-order.md)'s out-of-scope section, where
  it was argued.
- **Whether a surface's incomplete mark and the chrome's unreachable mark say the same thing twice.**
  They are not the same fact — a cached surface stays cached for a moment after the pool comes back
  — but they will usually appear together. *Fallback*: draw both and see; the surface mark is cheap
  to remove if it reads as noise.
- **What the compose row says during a large upload** now that the upload is inside the drain and no
  longer blocks the capture. *Fallback*: nothing beyond the pending mark, which is what every other
  undrained mutation gets.

---

## Out of scope

Surfacing the outbox as a list — pending, draining, refused, all in one place. client.md has that
open since 2026-08-17 and a per-row mark may well answer it; deciding needs the marks to exist first.

The markdown renderer, the folder tree, and everything else shell.md lists as not shipped.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

`apps/ui` already asserts what is enabled and disabled while the pool is out of reach; these are the
same kind of assertion about what is *drawn* there.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
