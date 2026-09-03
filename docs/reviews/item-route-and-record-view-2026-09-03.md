# Review: An item has an address, and a record can be read

**Date**: 2026-09-03
**Status**: Resolved <!-- Open | Partially addressed | Resolved -->
**Scope**: PR #41 — `origin/main...agent/item-route-and-record-view`
**Plan**: `docs/plans/item-route-and-record-view.md`
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`

---

## Overall

The slice lands what it set out to land. `/items/{id}` and
`/items/{id}/records/{recordId}` draw what the plan asked for, triage is genuinely
untouched, the `Client.item` widening is the right shape and matches how
`surfaces/reads.ts` already classifies a failure, and both specs carry dated
`Shipped:` entries — the trail is complete.

Two things are wrong rather than debatable. The offline item surface says the same
fact twice in two idioms, one of them a raw client error string announced to screen
readers from the slot where an action reports — the case the new spec paragraph is
specifically about, and the existing test asserts only the half that reads well. And
`records` survives a change of `id` on a reused component, so one item can draw
another item's routing history with links pointing at the other item. Both are
confirmed by running them, not inferred.

Beyond that: `shell.md` still says in plain declarative prose that there is no
separate item surface. Two other places got superseding notes; the most direct
sentence did not.

---

## Bugs

### 1. The offline item surface says out-of-reach twice, and once in the wrong voice

`apps/ui/src/components/item/Item.svelte:54-65`, rendered through
`apps/ui/src/components/item/Actions.svelte:64-66`.

`pool.yes` starts optimistically true (`reachable.svelte.ts` seeds both `online` and
`answering` to `true`), so the records effect fires before the client's reach mark
has flipped. `recordsFor` throws `Unreachable`, `said = saidBy(error)`, and that
string is handed to `Actions` — where it renders in the status slot that `mark done`
reports through. Then the mark flips and the rail draws `NO_RECORDS_OFFLINE` as
intended. Both are on screen:

```
rail:       "offline; records when the daemon answers"   (muted, deliberate)
action row: "the daemon is not reachable"                (role="status", muted)
```

Rendering `Item` with a cached item and an unreachable transport gives exactly that —
the `role="status"` node holds `the daemon is not reachable`. `Item.test.ts`'s
"says the records are out of reach while the item still draws" asserts the first
line and never looks at the second.

`said` is also never cleared: a records read that fails once and succeeds on the
next pass leaves the failure on screen under a fully drawn record list.

Two separate faults behind one symptom — an unclassified error (nothing distinguishes
`Unreachable` from a refusal here, though `ReadFailure.refused` exists precisely for
that), and a read failure reported through a write-report channel.

Fix: classify it the way `read.failure` is classified — swallow `Unreachable`, since
the rail already says it, and keep only a refusal; clear `said` at the top of each
attempt; and don't route a read failure through `Actions`' status, which belongs to
the action a person just took.

### 2. An item draws the previous item's routing records

`apps/ui/src/components/item/Item.svelte:41-65`.

`+page.svelte` for `/items/[id]` is reused across a param change — no `{#key}`
anywhere — so `Item` survives with a new `id`. The first effect resets `read` and
`editing`; `records` and `said` are reset by nothing, and the records effect carries
no staleness guard (the read effect's `wanted === id` has no counterpart).

```
/items/routed drawn, records fetched
  → id becomes "plain"
  → plain has no routing summary, so the effect returns early
  → `records` still holds routed's record
  → Routing.svelte draws it, href "/items/routed/records/rec"
```

Rerendering `Item` from `routed` to `plain` reproduces it: the surviving anchor is
`/items/routed/records/rec` on the page for `plain`. A wrong item's history,
presented as this item's, with a link that proves it.

No link in the shell goes item → item today, so this is latent rather than live — but
the whole point of the slice is that the address is reachable from outside the shell,
and back/forward across two item URLs is a browser gesture, not a feature.

Fix: reset `records` and `said` alongside `read` in the id effect, and guard the
records assignment on `wanted === id` as the read is guarded.

---

## Design

### 3. `shell.md` still says there is no item surface

`docs/specs/shell.md:245` — "So the row has two states and there is no separate item
surface."

The scope list (`:186`) is marked *Superseded 2026-09-03* and the prior decision
(`:787`) is amended, both well. This sentence — the flattest statement of the thing
the PR overturns, and the one a reader hits while reading about the row rather than
while auditing the decision list — was left alone. AGENTS.md's standing rule is that
docs and code agree; a superseded claim still asserted in the body of the spec is the
kind of thing that gets read and believed.

Fix: amend in place, in the same idiom as the other two — the row still has two
states and processing still happens there, and what an address adds is somewhere to
read deliberately.

### 4. `Record.svelte` keeps a description across a change of record

`apps/ui/src/components/record/Record.svelte:58-71` — `described` is neither reset
when `target` changes nor guarded on resolve (`asking === target.destination`), unlike
the two effects above it in the same file, which are both guarded. Two records under
one item pointing at different destinations would draw the second's arguments against
the first's schema until the describe lands, and a race between two describes settles
arbitrarily. Same latency as finding 2 — nothing links record → record today.

Fix: guard the assignment the way the records read is guarded, and clear `described`
when the target changes.

---

## Minor

### 5. `Action`'s `href` branch silently ignores `disabled`

`apps/ui/src/components/primitives/controls/Action.svelte:26-38` — the anchor takes
`look` (which carries a `disabled:` variant that can never apply to an `<a>`) and
drops the `disabled` prop entirely. Nothing passes both today. A disabled link that
still navigates is a bad thing to leave available in a primitive.

### 6. A bare `item` in the rail of the failed read

`apps/ui/src/components/item/Item.svelte:132-134` — where the read failed, the rail
renders the literal word `item`. Every other rail position holds a stamp, a state
word or a mark; this reads as placeholder text that got committed. If it is there to
keep the rail from collapsing, that is exactly the kind of *why* a comment is for.

### 7. `Client.held` has no test in its own package

`packages/client/src/client.ts:397` — a new method on the `Client` interface, and
`client.md` claims behaviour for it ("a mutation made where one item is drawn marks it
the way it marks a row") that nothing anywhere exercises. `cache.test.ts` covers the
four `item()` paths well; `held` is only reached indirectly through two `.svelte`
tests, neither of which mutates. AGENTS.md asks for tests when behaviour is added.

### 8. A `user` record with no note draws nothing where the note would be

`apps/ui/src/components/record/Record.svelte:128-131` — the destination branch says
`none` for empty arguments; the user branch renders no heading and no body at all.
`markProcessed` without a note is the ordinary case, so this fires often.

### 9. Two spellings of the same guard on two sibling surfaces

`Item.svelte:55` uses `pool.yes === false`; `Record.svelte:42` uses `!pool.yes`.
`pool.yes` is a strict boolean, so they are equivalent — but the difference reads as
though one of them is guarding a third state.

---

## Non-issues

- **`Cached.svelte`'s unused `inline` prop** — `Pending.svelte` and `StateWord.svelte`
  carry exactly the same prop with exactly the same two classes. It is the family's
  shape, not speculative generality.
- **`item()` swallowing every non-`Unreachable` error into `refused: true`** — this is
  the same classification `surfaces/reads.ts:90` already makes, which is what makes
  `ItemState` and `ListState` say the same thing the same way.
- **`Record.svelte:35-37` firing `client.item(id)` and discarding the answer** — the
  held copy is what the surface reads; the call is there to fill it. The comment says
  so.
- **`record.state` drawing `pending` in the inverted idiom** — the PR flags the
  collision with the muted outbox `pending`. It is defensible under the spec's own
  rule (pool state versus unsent work) and the two never appear on the same surface:
  `Record.svelte` draws no `Pending`, and the item surface's record lines are plain
  text through `Routing.svelte`.
- **The feed gaining a scroll mark** — outside the plan's letter, but the plan assumed
  both surfaces had one and only the queue did. Correcting that is what makes phase 2
  true rather than half true.
- **`restorePlace` clamping against a short page** — real, but `Queue.svelte` behaved
  this way before the extraction; the change moved it, it did not introduce it.

---

## Resolution

Reconciled with the review on [#41](https://github.com/palmdrop/notemap/pull/41)
on 2026-09-03. Findings 10–13 are the second reviewer's and are numbered on from
this file's own; every row was settled before anything was implemented.

1. **Fixed.** `recordsOf` (`apps/ui/src/lib/records.svelte.ts`) swallows
   `Unreachable` and carries back only a refusal, and clears it per attempt. The
   read failure no longer reaches `Actions`, which now reports only what it did —
   its `said` prop is gone. Regression test: the offline item surface holds no
   `role="status"` node at all.
2. **Fixed.** The one reader empties on a change of item and guards what lands
   against what is still wanted. Regression test rerenders `Item` from a routed
   item to an unrouted one and asserts the record link is gone.
3. **Fixed.** `shell.md`'s row section is amended in place rather than left
   asserting there is no item surface.
4. **Fixed.** `described` is cleared when the target changes and the answer is
   guarded on resolve, like the two effects above it.
5. **Fixed.** A disabled `Action` with an `href` renders a muted
   `aria-disabled` span — there is no anchor to disable, since a disabled one
   still navigates.
6. **Fixed.** The literal `item` is gone; the rail is simply empty where the
   read failed.
7. **Fixed.** Two tests in `cache.test.ts`: `held` follows an optimistic archive,
   and answers `undefined` for an id no read has drawn.
8. **Fixed.** A `user` record with no note draws the `note` heading with `none`
   beneath it, as an empty argument set does.
9. **Fixed.** Both surfaces spell it `!pool.yes`, through the shared reader.
10. **Fixed.** `Facts` owns the two columns and each `Fact` is `display: contents`,
    so a block's labels share one width and the longest widens it instead of
    running under its value. The two labels that overflowed are also gone:
    `destination` is now `where`, and `capability` is not a label at all.
11. **Fixed.** The id and the source leave the item surface and the opened queue
    row; the record view drops its own id. `shell.md`'s list of the opened row's
    facts is amended in the same change. A record's link to its item is labelled
    by the item's own words, falling back to `this item` rather than a UUID.
12. **Fixed, and narrower than asked.** The label is not `action`:
    [CONTEXT.md](../../CONTEXT.md) defines **Action** as an entry in the pool's
    log and lists `action` among the words a **Capability** must not borrow. The
    field is drawn without a label instead — a sentence saying what happened,
    which is what the request was for. `Created a note`, `Appended to a note`,
    `Created or appended to a note`.

    **Not delivered: the act, as distinct from the promise.**
    `DeliveryOutcome` is `{ kind: "delivered"; pointer?: string }`
    (`packages/core/src/types/domain/routing.ts:58`), so nothing anywhere records
    whether `create-or-append-file` created or appended. The sentence names both
    because both are true until the adapter reaches the vault. Saying which would
    need the adapter to report the act and that to survive into the record, the
    wire and the client. [ADR 31](../adr/0031-the-adapter-decides-create-or-append-at-delivery.md)
    assigns this view exactly that job, so the gap is real and is left open
    deliberately; the durable home for the readable phrase is likely a `title` on
    `Capability`, answered by the adapter rather than mapped in the shell.
13. **Fixed, and swept.** `href.ts` builds addresses with `resolve()` from
    `$app/paths`, typed against the route tree `svelte-kit sync` generates — a
    misspelt path or a wrong param name fails `svelte-check`, which
    `pnpm -r typecheck` runs. Every other constructed address in the shell went
    the same way, and `Order` keys its map by route id. `/docs` stays a literal:
    the daemon serves it, and it is not a route of this shell, which the type
    error proves rather than a comment claiming it.

    Not converted: `Nav` takes addresses rather than route ids. `resolve()`
    refuses an open `RouteId` because a parameterised route needs its params, so
    the resolving belongs at the call site holding the literal.
