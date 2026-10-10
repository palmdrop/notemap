# Review: are.na takes every file

**Date**: 2026-10-10
**Status**: Open
**Scope**: `packages/adapters/destination-arena/`, `apps/ui/src/components/process/Process.svelte`,
`docs/specs/core.md`, `docs/specs/shell.md`, `docs/adr/0059-*`, `docs/adr/0041-*`
**Plan**: `docs/plans/arena-takes-every-file.md`
**Spec**: `docs/specs/core.md`, `docs/specs/shell.md`

---

## Overall

The change does what ADR 59 decided, and the shape is right: one `wanting` deciding both
capabilities, one loop posting one block at a time, the pointer rule turning on how many blocks were
made, and the shell filtering the carrier out by annotation rather than by kind. Typecheck, lint and
`pnpm -r --silent test` are green, and both specs carry a dated `Shipped:` entry for the plan.

Two things are wrong rather than untidy. **The "in slot order" promise is stated in four places and
enforced nowhere** — both renderers walk `delivery.payload.assets` in array order, which is the one
list core does not sort, and the fixtures' slot names happen to hide it. And **a delivery that has
already posted blocks and then meets an asset the pool cannot resolve answers `rejected`**, which
abandons the decision on the first attempt with blocks sitting in the channel and no record of them.
Beyond that, ADR 59's own consequence section claims the shell did not change, which Phase 4 then
made false, and the preview of several files says nothing about there being several.

---

## Bugs

### 1. "In slot order" is claimed by the docs and not done by the code

`packages/adapters/destination-arena/src/blocks.ts:39` and `:59` map
`delivery.payload.assets` as it comes. Nothing sorts it, and nothing guarantees it is sorted:

- `packages/core/src/pool/routing/delivery.ts:155` sorts **`delivery.assets`**, not
  `payload.assets`, and the `Delivery` type says so of that field alone
  (`packages/core/src/types/domain/routing.ts:51`).
- `apps/daemon/src/destinations/renderers.ts:23` explicitly sorts `payload.assets` before drawing,
  because it does not trust the array order.
- the fs kind's `place-assets` builds from `attachedAssets` (`packages/output-markdown/src/placing.ts:38`),
  which filters the already-sorted `delivery.assets`.

So arena is the only place where "slot order" means "whatever order the payload's references are in".
Claimed in `docs/adr/0059-…:75`, `docs/specs/core.md:1429`,
`packages/adapters/destination-arena/README.md:63` and the comment at `destination.ts:186` — and
AGENTS.md's rule is that a comment claiming a guarantee must be one the code enforces.

It decides two visible things: the order the blocks appear in a channel, and **which asset gets the
caption**, since the words go on `assets[0]` of the array rather than on the first slot. A payload
whose references are not in slot order would caption a different picture than the one the shell draws
first (`apps/ui/src/lib/attachments.ts:10`, slot-ordered) and the fs kind files first.

The tests cannot catch it. `blocks.test.ts:91` ("makes one block per asset, in slot order") and
`destination.test.ts:220` use slots `one`, `two`, `three`, which sort as `one < three < two`, so both
assert array order while naming it slot order; and the fixture's `delivery.assets`
(`src/testing/fixture.ts:142`) is handed back unsorted, so it does not model what core passes either.

Fix: take the assets from `attachedAssets(delivery)`, or sort a copy of `payload.assets` by slot as
the daemon's renderer does — and change one fixture's slots so attach order and slot order differ.

### 2. A partial delivery that meets an unresolvable asset is `rejected`, not `unreachable`

`destination.ts:269-274`: `valueFor` throws `Refused` where no `delivery.assets` entry matches the
block's slot, and `failure()` maps anything that is not `Unreachable`/`TokenRefused` to `rejected`
(`destination.ts:372-377`). `rejected` is abandoned on the first attempt
(`packages/core/src/pool/routing/route.ts:112`), and the record keeps no pointer, no url and no
output.

```
block 1 posted → block 2's asset no longer resolves → Refused → rejected
→ record abandoned, one block on the board, nothing naming it
```

This is reachable rather than theoretical: `projectDelivery` drops a reference whose asset row is
gone (`packages/core/src/pool/routing/delivery.ts:146`), so the payload can name a slot that
`delivery.assets` does not carry; and a blob whose bytes have gone throws a plain `Error` from
`openAsset` (`delivery.ts:189`), which lands in the same branch. Before this change the same throw
could only fire with nothing posted; now it fires with blocks already made, which is the one state
ADR 59 says the kind handles by retrying.

Fix: resolve every block's asset in `wanting`, before anything is reached. Then the refusal is
pre-flight, the preview refuses it identically, and no partially-landed delivery can answer
`rejected`. (Skipping the unresolvable slot, as the fs kind effectively does, is the other honest
answer.)

---

## Design

### 3. ADR 59 says the shell did not change; Phase 4 changed it

`docs/adr/0059-…:108-110`: "`attachments only` works on a board as it does on a vault. Nothing in
the shell changes to know it: the gesture finds the capability by `x-notemap-carries`."

Both halves are now false. `Process.svelte:187` changed, and `docs/specs/shell.md:1451-1455` records
that change as *reached by ADR 59*. And on a board the gesture is **not** the `attachments only`
switch: arena settles nothing, so `offersOutput` is false and the carrier is picked under `do` — which
the plan's own Unknowns section established before any code was written.

Fix: amend the consequence bullet — three pictures reach a board as three blocks and the carrier is
offered by annotation, with the one thing the shell had to learn (not offering a carrier to an item
with nothing to carry) named rather than denied.

### 4. A preview of several files says nothing about several files

`destination.ts:340-354`. For a preview, every `Posted.id` is absent, so `made` is empty and the body
falls through to the values-and-captions path. Asset blocks have `value: ""`, so:

- `create` with three pictures previews as `notes from the show\n` — byte-identical to one picture.
- `place-assets` with two files previews as `"\n"`. The shell draws the capture's pictures above it
  and the note under it (`shell.md:1149`), so it is not blank, but nothing says two blocks are coming.

The plan's Phase 2 says "`preview` answers the same list without uploading anything", which it does
not; and `destination.test.ts:295` is named "says what three blocks would read as before any of them
is made" while asserting only the single caption line. One fact — how many blocks — is the whole
difference this change introduces, and it is the one thing the preview will not say.

Fix: either put the count (or a line per block) in the preview body, or correct the plan sentence and
the test name to say the preview answers the captions alone.

### 5. The plan ticks a test for the `place-assets` browse that does not exist

`docs/plans/arena-takes-every-file.md:137` — "the browse answers channels for the new capability",
checked off. Nothing in `destination.test.ts` passes `capability: "place-assets"` to `candidates` or
`naming`; every case in "the channels it offers to browse" and "what it calls a channel a field
already holds" uses `create`. So the new `channelOf` predicate's second arm
(`candidates.ts:27`) is dead to the suite, and a regression that narrows it back to `create` would
break browsing for the carrier silently.

Fix: one case per entry point with the capability set to `place-assets`, or untick the line.

---

## Minor

### 6. A code comment still says are.na declares one capability

`apps/ui/src/components/process/Process.svelte:246`: "are.na declares `create` and nothing else" —
the example the comment leans on is exactly what this change undid. Pick a kind that still has one
capability, or state the rule without the example.

### 7. The plan is Done with its by-hand verification unchecked, and the line is garbled

`docs/plans/arena-takes-every-file.md:152-154`: the only unticked box is the by-hand run against a
real board, and the text reads "— attach two — attach two pictures". Nothing has yet seen two blocks
land on a real channel with the words on the first; worth saying plainly beside a Done status, and
worth fixing the duplicated fragment.

### 8. Provenance is rebuilt once per block

`destination.ts:296`: `inputFor` calls `provenanceOf(delivery)` inside the loop, so a five-file
delivery builds the same metadata object five times. It is per-delivery data; hoisting it above the
loop and passing it in would say so.

### 9. The slot lookup matches on the slot alone

`destination.ts:269`: `delivery.assets.find((each) => each.slot === slot)`. Core dedups that list on
slot **and** asset id (`routing/delivery.ts:140`), so a payload slot and an artifact slot of the same
name carrying different assets both appear, and `find` takes whichever sorts first — possibly the
artifact's bytes. `attachedAssets` keys on both for that reason. Pre-existing, but the loop now runs
it per block.

### 10. The new spec sentence was spliced without rewrapping

`docs/specs/shell.md:1455` ends up ~170 columns, with the added clause and the pre-existing
`**The template form draws…**` sentence on one line. The file has other long lines, so this is drift
rather than a new rule broken.

### 11. Test gaps beyond #5

- `place-assets` with exactly **one** asset: the pointer/url boundary for the new capability is
  untested (`create` with one is covered at `destination.test.ts:268`).
- `place-assets` preview with assets — the `"\n"` body in #4 is nobody's assertion.
- `Process.svelte:192`'s escape hatch (`one.name === capability`) — the template-took-the-carrier case
  for an item with no attachments, which the comment and the spec both rest on, has no test. It is the
  only thing keeping `chosenCapability` defined, and so the arguments form drawn, in that state.
- The deliberate duplication: nothing posts a second attempt after a partial failure and asserts the
  extra block. The README now promises that behaviour in so many words
  (`README.md:97`), and `destination.test.ts:286` only asserts the first block stayed.

---

## Non-issues

- **`one === undefined` making a single-block delivery name the channel** — `CreatedBlock.id` is a
  required `number` (`api.ts:19`), so `posted.length === 1` always carries an id. The optional field
  exists for the preview's `Posted` records.
- **Cancellation** — `AbortSignal.timeout(attemptMs)` fires inside a `fetch`, and both `send` and
  `upload` wrap a rejected fetch as `Unreachable` (`api.ts:137`, `:258`), so an aborted attempt is
  `unreachable` and retried. `blobs.open` returns the generator without touching the signal and
  `chunks` throws from inside the request body, which fetch surfaces the same way.
- **The output is markdown rather than `text/plain`** — unlike ADR 57's placed paths. The shell draws
  a record's output in a `<pre>` (`apps/ui/src/components/record/Block.svelte:286`), so one URL a line
  reads as written.
- **No `attachments only` switch on a board** — arena settles nothing, so `implied` is undefined and
  `offersOutput` is false by design; the carrier is offered under `do`. Resolved in the plan's
  Unknowns.
- **The switch disappearing after `everything` on an attachment-less item** — for a kind that settles
  one, taking `everything` drops the carrier from the filtered list and the `output` section with it.
  Unchanged from before: `offersOutput` already required `attachments.length > 0 || assetsOnly`.
- **`docs/todo.md:199` still stating the old refusal in its headline** — that file records the problem
  as it was and closes it with a dated note, which is what happened.
- **`place-assets` taking its `accepts` from the note renderers** — the markdown kinds declare it the
  same way (`packages/output-markdown/src/capabilities.ts:196`).

---

## Resolution

<!-- One numbered entry per finding once addressed; flip Status above. -->
