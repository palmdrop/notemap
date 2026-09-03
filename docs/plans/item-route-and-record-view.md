# An item has an address, and a record can be read

**Date**: 2026-08-30
**Status**: In progress <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> An item is somewhere you can go — `/items/{id}` — and a routing record is read there in full:
> what it targeted, what state it is in, when the decision was made, and where it landed. All of it
> is already stored and on the wire, and none of it has ever been drawn.

The shell has three addresses today — `/` for the queue, `/feed`, `/settings` — and no way to name
one item. An item is a row that opens in place, and tags, lineage, editing and routing all happen
inside it. That is right for triage and wrong for a routing record, which carries an argument
object, a pointer, and shortly the whole content that was delivered
([delivery-output-and-preview](delivery-output-and-preview.md)) — none of which fits in a register
row, and all of which someone reads deliberately rather than at a glance.

This is the shell's **first addressable entity**, so the plan is as much about what that costs as
about what it draws: what a deep link does when the pool is out of reach, what going back means,
and what a surface with no register does about the order and the position every other surface
remembers.

Nothing here touches core, the wire or the client's shape. `RoutingApi.recordsFor` and
`Client.item` both exist, and every extensionless path already falls through to the shell — which
is why `/ui` answers at all ([run-story](run-story.md)) — so a new address needs no daemon change.

**Out of this slice, deliberately**: the delivered content and the preview, which fill this view in
once [delivery-output-and-preview](delivery-output-and-preview.md) lands; cancelling a pending
delivery from here, which already exists on the row; and lineage, which has a home in the row and
does not need a second one yet.

---

## Tasks

### Phase 1 — An item has an address

Depends on nothing.

- [x] Create branch `agent/item-route-and-record-view`
- [x] `/items/{id}` draws one item: its payload, its tags, its marks, and the routing records the
      opened row already reads. It is a surface, not a modal — the modal idiom belongs to the
      composer, which is a decision being made rather than a thing being read
- [x] It reads through `Client.item`, which already exists. Settle in this phase whether that
      reaches the pool for an id the cache has never held, or answers `undefined` — a deep link into
      a fresh browser is the case that decides it, and the answer belongs in `client.md` either way
- [x] An item the pool does not have is said plainly, and is not an error. A link outlives the item
      it names: purge exists in the specs and a tombstone is a real answer
- [x] Drawn from the cache, it says so, in the words the surfaces already use for it
      ([shell.md](../specs/shell.md)'s three conditions). An item view is exactly where a person
      looks when they are trying to find out what happened, so it is the worst place to imply
      freshness
- [x] Tests beside the route: a known item draws, an unknown one says so, a cached one is marked
- [x] Verify: `pnpm --filter @notemap/ui test`
- [x] `git commit`

### Phase 2 — Getting there, and getting back

Depends on phase 1.

- [ ] A queue row and a feed row lead to it. Which gesture — the row's own body, or an action beside
      the others — is a design decision to settle here rather than assume: opening a row in place is
      what triage is, and this must not replace it
- [ ] Back returns to the surface you came from, in the order it was in, at the position it held.
      Both are already remembered per surface ([reconnect-and-remembered-order](reconnect-and-remembered-order.md)),
      and an item view that loses them would make reading one record cost your place in the queue
- [ ] The item view is not a register and remembers no order of its own. Say so where the order
      machinery is, so the next surface does not inherit a rule that was never meant to be general
- [ ] Tests: leaving and returning keeps order and position; the row still opens in place
- [ ] Verify: `pnpm --filter @notemap/ui test`
- [ ] `git commit`

### Phase 3 — A record is a thing you can read

Depends on phase 1.

- [ ] `/items/{id}/records/{recordId}` draws one routing record in full: the destination by name,
      the capability, the state, the time the decision was made, the **arguments** it was given, and
      the pointer to where it landed. Every one of those is already stored and already answered by
      `GET /v1/items/{id}/routing`; the shell has drawn three of them and ignored the rest
- [ ] The arguments are drawn against the capability's own schema where it can be read, so a person
      sees `directory` and `filename` with the titles [destination-targets](destination-targets.md)
      gives them rather than a JSON blob — and as a JSON blob when the destination cannot be
      described, which is the honest fallback and not a failure
- [ ] The pointer is drawn as text. It becomes a link when
      [delivery-output-and-preview](delivery-output-and-preview.md) gives a destination somewhere to
      put one; the shell never guesses whether a string is a URL
- [ ] Records need the pool: `recordsFor` reaches it and nothing caches the answer. Out of reach is
      said as out of reach, with the item still drawn from what the client holds — one surface, two
      different answers about freshness, which is the case shell.md's three conditions exist for
- [ ] The opened row keeps its one line per record and gains the way in. It is a summary and stays
      one; nothing that fits on a row moves out of it
- [ ] Tests: a record draws its arguments and pointer, an undescribable destination falls back, an
      unreachable pool says so while the item still draws
- [ ] Verify: `pnpm --filter @notemap/ui test`
- [ ] `git commit`

### Phase 4 — The specs say so

Depends on phases 1–3.

- [ ] `shell.md` gains the item surface and the record view: what each says, what an address costs,
      and that the register's rows stay for triage. It also settles what the spec says about routing
      records being "an item's detail, not a row's" — that is still true and now has somewhere to be
      read
- [ ] `client.md` records what `Client.item` does for an id the cache has never held, which phase 1
      settles
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`
- [ ] `git commit`

---

## Unknowns

- **Whether `Client.item` reaches the pool.** Phase 1 settles it. If it does not, a deep link into a
  fresh browser draws nothing, and the fallback is a read that does — which is a client change this
  plan would rather not make and will make if the link has to work.
- **What leads into the item view.** Making the row body navigate would be the smallest gesture and
  the one most likely to steal a click from opening the row in place. Fallback: an action beside the
  others, which is duller and cannot be triggered by accident.
- **Whether the item view makes the opened row redundant.** It should not — triage is a register and
  a register is rows — but the two will overlap, and the honest answer may be that the row sheds
  something once there is somewhere else for it to live. Worth watching rather than deciding now.
- **A record with no item.** Purge does not exist yet, so this cannot happen today; when it does, a
  record view reached by link outlives its item and has to say something.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Everything here is the shell's, and the shell's suite covers it. Nothing crosses the wire, so
`pnpm test:stack` is not part of finishing this.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
