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

Depends on [durable-offline-client](durable-offline-client.md), which is what makes any of it true.

---

## Tasks

### Phase 1 — the pending mark

Depends on the client's outbox being observable per item, which it already is.

- [ ] A row carries a **pending** mark when an outbox operation about that item has not drained.
      shell.md has carried this since 2026-08-19 and names the candidates: inverting the row's
      timestamp, or a word in the row's left column, where `routed` and `archived` already sit
- [ ] Quiet, not loud. Pending is the ordinary state of a mutation and it heals itself
      ([CONTEXT.md](../../CONTEXT.md)); it is not drawn in the shape a refusal is drawn in
- [ ] The compose row's own capture is the first thing that has it
- [ ] Tests: a capture made against a dead transport draws the mark; the mark goes when the pool
      answers; a refused operation is not drawn as pending
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` green
- [ ] `git commit`

### Phase 2 — a surface that says what it is

Depends on the client's derived surfaces.

- [ ] The queue and the feed say, when they are drawn from the cache, that this is what the client
      holds. The queue matters most: three rows must not read as "you are nearly done", and the feed
      is defined as the pool read *completely*
- [ ] Stated once per surface, in the register rather than per row, and in the same voice as the
      chrome's unreachable mark — a condition, not a failure
- [ ] Tests: a cold client with no transport draws the queue with the mark; the mark goes once the
      pool has answered for that surface
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` green
- [ ] `git commit`

### Phase 3 — a picture that is there before it is sent

Depends on the client resolving locally-held bytes.

- [ ] A picture row draws the local bytes while its capture has not drained, so the row looks the
      same before and after the drain
- [ ] The compose row stops saying `uploading…` before a capture can be made, the upload having
      moved into the drain. What it says while an upload is actually in flight is a matter for the
      pending mark, not a separate wait
- [ ] Tests: a picture captured against a dead transport draws an image; the same row after the
      drain draws the pool's copy
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` green
- [ ] `git commit`

### Phase 4 — the spec

Depends on the phases above.

- [ ] `docs/specs/shell.md`: the three conditions section stops describing pending as undrawn, and
      the row's mark, the surface's mark and the local-bytes rule are written as they landed
- [ ] `docs/todo.md`: drop the pending-mark item
- [ ] Add the dated `Shipped:` entry (see Notes)
- [ ] `git commit`

---

## Unknowns

- **Which of shell.md's two candidates the pending mark takes** — an inverted timestamp, or a word
  in the left column beside `routed` and `archived`. The left column already carries state words,
  which argues for consistency; the timestamp is quieter. *Fallback*: the word, since the column
  exists for exactly this and a person reads it in one place.
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
