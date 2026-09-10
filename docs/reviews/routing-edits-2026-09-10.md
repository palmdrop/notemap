# Review: A delivery carrying its own content

**Date**: 2026-09-10
**Status**: Resolved
**Scope**: `agent/routing-edits` vs `main` — `packages/core/src/pool/routing/`,
`packages/core/src/pool/templates/`, `packages/core/src/mirror/`,
`packages/adapters/store-sqlite/src/`, `apps/daemon/src/{routes,schemas,errors}/`,
`packages/client/src/`, `apps/ui/src/components/routing/ProcessingComposer.svelte`
**Plan**: `docs/plans/routing-edits.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/shell.md`,
`docs/specs/mirror.md`

---

## Overall

The mechanism landed as designed and the shape is right: one optional field beside the arguments,
one check that is the capture's own check, one substitution that touches `content` and nothing
else, and a record that carries the words so a retry replays them. `pnpm typecheck`,
`pnpm -r --silent test`, `pnpm lint` and `pnpm test:stack` are all green, and the four listed specs
each carry a dated `Shipped:` entry. The tests are placed where the plan said each layer would
prove its own half.

Two things want attention. `mirror.md` gained the same entry twice, and the second copy claims a
reservation is restored from a mirror with its words — reservations are not mirrored at all, so a
spec now asserts behaviour the code does not have. And the promise the ADR leads with, *what did I
actually send?*, is not answerable in the shell: the record holds the words, the record view does
not draw them.

---

## Bugs

### 1. `mirror.md` says a reservation is restored from a mirror with its words

`docs/specs/mirror.md:29-35` — a second `Shipped:` entry for this change, duplicating `:7-13` and
sitting out of order between the 2026-09-07 and 2026-09-04 entries. The duplicate is not merely
redundant; it says:

> a reservation restored from a mirror is attempted with the words it was decided with

Only delivered records are mirrored. `packages/core/src/mirror/record.ts:37` filters
`state === "delivered"`, for the reason the same spec gives at `:157` — "a record still pending
delivery is a reservation" — so no reservation is ever restored from a mirror, with words or
without. The replay this change does buy is from the **store** (`routing_records.content`), which
is what phase 2 tested and what the top entry says correctly.

Fix: delete `:29-35`. The entry at `:7-13` already covers it and claims nothing false.

---

## Design

### 2. `unknown-payload-type` reaches the routing surface, where editing deliberately refuses to raise it

`packages/core/src/types/api/refusal.ts:217` adds `unknown-payload-type` to `PreparationRefusal`,
so it now flows out of `route`, `preview` and `templates.route`. It can only be produced by a
rewrite, and the comment says so. But `packages/core/src/pool/edit.ts:53` takes the opposite line
for the sibling case and states its reasoning in the code:

```
// A host that has dropped the type since the capture leaves no schema to check
// against, which an edit keeping the type the pool holds is not where to catch.
```

The result is an asymmetry nothing states: on a host whose config no longer names an item's payload
type, the item can still be edited and can still be routed — but not routed with words of its own,
and the refusal it gets back names the item's type rather than anything the request got wrong.

Refusing is arguably the right call here — with no schema there is nothing to check the words
against, and passing them through unchecked is worse. The gap is that `core.md` does not say so.
`http-v1.md:1220` documents the wire behaviour; the domain spec's routing section documents
`content-invalid` and is silent on this one, and it is the spec that would have to explain why two
paths reading the same `checkPayload` answer disagree about the same refusal.

### 3. The words are recorded and nowhere drawn

`apps/ui/src/components/record/Record.svelte` draws where, the item, the arguments
(`:250`) and the output; it reads nothing from `target.content`. `Routing.svelte`'s per-record line
does not mark a rewritten delivery either. So a person re-reading a record sees the capture's
current words, the arguments, and — only where the kind produced one — the output.

ADR 45 lists as its first consequence that "what did I actually send?" is answerable from the
decision as well as from the output, and `core.md` ships that claim. For a destination that returns
no output, the shell cannot answer it. This is outside phase 4's stated scope, which was the
composer alone, so it is a gap rather than a miss — but the plan closed `todo.md:129` on the
strength of a claim the shell does not yet honour, and nothing tracks the remainder.

### 4. `rewrite` is one-way, and an untouched rewrite is still sent

`apps/ui/src/components/routing/ProcessingComposer.svelte:139,422,432` — `words` goes from
`undefined` to a string when `rewrite` is clicked and never goes back. There is no control that
drops the rewrite, and `release()` (`:271`), which clears every other part of the decision —
`chosen`, `capability`, `args`, `applied`, `hand`, the forecast — leaves `words` standing while the
row that would show it is no longer drawn.

The consequence is on the record rather than the screen. `carried()` sends `content` whenever
`words` is defined, so clicking `rewrite`, changing nothing, and routing writes a copy of the
capture's own words onto the record, mirrors it, and replays it. "The presence is the fact"
(ADR 45, `core.md`) then reads a rewrite that never happened, and finding 3 gets worse if the record
view later draws content: it will draw it for deliveries nobody rewrote.

Fix: have `carried()` omit `content` when it equals `item.payload.content`, and give the row a way
back to the capture.

---

## Minor

### 5. A doc comment was orphaned by the insertion

`tests/integration/src/routing.test.ts:630-635` — the block explaining that "nothing a route writes
may name a row that is not there" belonged to `describe("what a route leaves in the database")` and
now sits above `describe("a delivery carrying words of its own")`, which is about none of that. Move
the new describe below it.

### 6. The new CHECK constraint has no test

`packages/adapters/store-sqlite/src/migrations.ts:835-838` adds
`CHECK (content IS NULL OR target_kind = 'destination')`. Every sibling constraint on that table is
exercised by `schema.test.ts:120`, "refuses a routing record whose columns disagree with its
target"; this one is not. It does work — checked by hand against `node:sqlite`, since `ALTER TABLE
ADD COLUMN` with a CHECK is legal but easy to assume otherwise — which is exactly the fact the test
row would pin.

### 7. `routeFrom` is now five positional parameters with two optional trailing

`packages/core/src/pool/templates/apply.ts:44-56` — `(config, ports, item, id, firedByTag, signal?,
content?)`, called from `pool.ts:108` as `..., options?.firedByTag ?? false, options?.signal,
options?.content`. The public API already takes an options object for exactly these three; the
internal one is unpacking it only to be handed the pieces in order. A third optional would be the
one that gets passed in the wrong slot.

### 8. `shell.md:908` is a 130-column line

The inserted sentence at `:906-908` left the sentence it broke into unwrapped, in a file that wraps
at 100. Prettier does not touch prose, so nothing catches it.

### 9. `carried()`'s comment claims more than `saidAs` delivers

`ProcessingComposer.svelte:416-421` — "The payload's own shape decides where the words go, so the
composer knows no more about a payload type than the row that draws one does". `saidAs` hardcodes
the `text` slot (`packages/client/src/capture/says.ts:4`), so a second payload type whose content is
not `{ text }` would have `text` injected and be refused by its own schema. Only `note` exists
(`packages/core/src/pool/payload.ts:16`), so it cannot fire — but the comment says the code is
general where it is uniform, and the second payload type is the reader who will believe it.

---

## Non-issues

- **`content-invalid` is checked before the destination is looked up** (`prepare.ts:79`), so a
  request that is wrong about both reports the content rather than the unknown destination. The
  cheap, local check first is the right order and nothing contracts a precedence between refusals.
- **`rewritten` renamed to `saidAs`** in the client — deliberate, and the right call:
  `CONTEXT.md` now reserves *rewrite* for the delivery's words, so a function that rewrites the
  capture could not keep the name.
- **The words survive a change of destination while the arguments are cleared** — spec'd in
  `shell.md`, argued in the plan, and tested.
- **An empty rewrite sends `content: {}`** rather than being refused — `saidAs` drops the key, and a
  capture carrying assets and no text is already legitimate.
- **`payload.assets` and `payload.metadata` are untouched by a rewrite** (`delivery.ts:177`) —
  deliberate and tested from both core and the wire.
- **The daemon's `templates.route` still passes no `firedByTag`** — unchanged by this branch; a
  route from a template over HTTP was never a tag firing one.

---

## Resolution

1. **Fixed.** The duplicate entry is gone from `mirror.md`, and the one true sentence it carried
   that the surviving entry lacked — nothing new in the file's shape — moved up into it.
2. **Fixed as documented rather than as changed.** Refusing stands: where the schema is gone there
   is nothing to check the words against, and the whole of what a rewrite promises is that check.
   `core.md`'s routing decisions now say so, and say why editing forgives the same absence.
3. **Fixed.** The record page draws the words a delivery carried, above what was sent and only
   where it carried its own, with a line saying the item was not changed. `saidOf` in the client
   keeps the `text` slot in the one place that already held it. The one-line summary on a row is
   deliberately left alone: it says where something went, and a second mark on it would be a
   different decision from this one.
4. **Fixed.** `carried()` sends nothing where the words still say what the capture says, so opening
   the field and typing nothing writes no `content`; `keep the capture's` is the way back.
   `release()` deliberately still leaves the words standing — it is what taking a template calls,
   and the words survive a change of destination by design. Nothing can be sent while invisible:
   the row is drawn on exactly the condition that lets `carried()` reach a request.
5. **Fixed.** The new describe moved above the comment it orphaned.
6. **Fixed.** `schema.test.ts` now inserts a `user` target carrying content and a `destination` one,
   beside the sibling constraints.
7. **Fixed.** `routeFrom` takes an options object, and the shape `TemplatesApi.route` already
   published is now a named `TemplateRouting` both sides share; `pool.ts` passes it straight
   through.
8. **Fixed.** The paragraph is rewrapped at 100 columns, which also took in a pre-existing long
   line two sentences later.
9. **Fixed.** The claim is gone; the comment now says what the code does — only the payload's
   content is replaced.
