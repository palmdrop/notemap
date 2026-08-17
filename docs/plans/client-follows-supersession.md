# The client follows supersession

**Date**: 2026-08-17
**Status**: Todo <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/client.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> An operation the person made against an item is carried out against that item's revision when the
> pool supersedes it mid-flight, rather than refused: a tag added while an edit is in the outbox
> lands on the revision the pool recorded, survives a reload, and keeps its own operation-time.

Finding 2 of [the review](../reviews/editing-and-classification-2026-08-17.md). Operations against
one item drain in order, and that ordering is what opens the window: a `tag` queued behind an `edit`
waits for it, and by the time it is sent the pool may have answered `revised`. Core now refuses it
(`item-superseded`), so nothing lands where nobody reads it — but the person's tag is still lost,
and they were never wrong. They tagged what was on screen.

---

## Scope

In: re-targeting queued operations onto a revision, from both places the client can learn of one.

Out: **the pool.** Core is right as it stands — an edit and a tag both refuse a superseded subject,
and the refusal carries the revision's id precisely so a caller can recover. Nothing here asks core
to change.

Out: **operations already handed over.** A `sending` operation cannot be taken back, which is the
same seal `client.md` already draws around a capture. It settles or refuses on its own terms.

---

## Tasks

### Phase 0 — Branch

- [ ] Create branch `agent/client-follows-supersession`.

### Phase 1 — Decide it in `client.md`

Depends on: nothing. This is a spec decision before it is code, and the shape of phases 2 and 3
follows from it. Propose the section and get confirmation before writing either.

- [ ] Settle **which kinds follow a revision**, and write it into
      [client.md](../specs/client.md)'s operation vocabulary. Classification is the clear case.
      `archive` is arguable and `edit` is the sharp one — re-targeting an edit means applying the
      person's words to content they have not seen, which may be the opposite of what they want.
- [ ] Settle whether a re-targeted operation keeps its **original operation-time**. It should: the
      stamp is when the person acted, and re-targeting is the client's bookkeeping, not a new
      decision. Say so beside the last-write-wins rule that already governs it.
- [ ] Add the observable consequences to the list at the end of `client.md`.
- [ ] `git commit`.

**Verify:** the section says which kinds re-target and which are refused instead, and the reasoning
for the ones that do not — a reader should be able to argue with it rather than around it.

### Phase 2 — Re-target on the pool's own answer

Depends on: Phase 1. The case the review found: this client made the edit, so it holds the
`EditOutcome` naming the revision.

- [ ] Carry the revision through the `revised` settlement to the operations still queued against the
      original, rewriting the target of each kind Phase 1 named.
- [ ] Rewrite the **persisted** operation too, not only the one in memory. The outbox is durable and
      the settlement is not; an app that dies between the revision arriving and the queued operation
      draining would otherwise send against the original on reload.
- [ ] Move a re-targeted operation onto the **revision's drain chain**. The chain is keyed by target,
      so an operation left on the original's chain no longer orders against the operations it now
      shares an item with.
- [ ] Re-evaluate **opposition** after the move: `opposes` compares targets, so a `tag` and its
      `untag` must still cancel once both name the revision.
- [ ] `git commit`.

**Verify:** `pnpm --filter @notemap/client test` covers a tag enqueued while an edit is in flight
landing on the revision; the same across a reload from a durable store; a tag and its untag both
re-targeted still cancelling; and an operation already `sending` left alone.

### Phase 3 — Re-target on a refusal

Depends on: Phase 2, for the re-targeting itself. This is the half the review did not reach: an edit
made **on another device** supersedes an item here, and no settlement of this client's ever mentions
it.

- [ ] Read the revision's id off an `item-superseded` refusal — it carries `by` for this — and
      re-target and retry rather than surfacing the refusal.
- [ ] Bound the retry. A refusal that re-targets into another refusal must not loop: an item whose
      revision is itself superseded walks the chain, and the walk needs an end.
- [ ] Leave the refusal surfaced for the kinds Phase 1 excluded, with the reading `errors.ts`
      already gives it.
- [ ] `git commit`.

**Verify:** `pnpm --filter @notemap/client test` covers a tag refused `item-superseded` by a mock
`Transport` landing on the named revision without the person seeing a refusal; a chain of two
revisions resolving to the newest; and an excluded kind still surfacing the refusal.

---

## Unknowns

- **Whether re-targeting an `edit` is right at all.** Applying the person's words to content they
  have not seen is a different act from re-attaching a tag. *Fallback:* exclude `edit` in Phase 1
  and surface the refusal, which is what happens today and is not wrong — only unhelpful.
- **Whether the chain move can race a drain already in progress.** `drain` iterates the outbox and
  claims entries into `inflight`; a settlement landing mid-iteration changes a target under it.
  *Fallback:* re-target only entries that are neither `inflight` nor `sending`, and let the rest
  refuse as they do now — the durable rewrite means the next drain picks them up correctly.
- **Whether a revision can be superseded before the queued operation reaches it.** Two edits in
  quick succession from two devices make a chain, and the client may hold a stale link.
  Phase 3's bounded walk is the answer if so; the bound is what needs deciding.
- **Whether the shell should say anything.** A tag quietly moving to a revision is the behaviour
  this plan wants, but a person watching may see the item they tagged disappear and the tag appear
  elsewhere. *Fallback:* nothing in the interface, and revisit if it reads as a glitch.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Phase 2 carries the load, and the durable half is where this can quietly go wrong: an in-memory
re-target that passes every test and loses the operation on reload is the failure mode to write a
test against first. The existing `editing.test.ts` already has the shape — a mock `Transport` and a
memory store — so the reload case is a matter of reusing the store rather than building a fixture.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above** (`docs/specs/client.md`), dated, describing at a
high level what landed and linking back to this plan. No implementation details, no granular tasks.
A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will
flag.
