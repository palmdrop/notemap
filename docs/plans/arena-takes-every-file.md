# are.na takes every file

**Date**: 2026-10-10
**Status**: Done
**Spec**: `docs/specs/core.md`, `docs/specs/shell.md`
**Closed**: 2026-10-10

---

## Goal

A capture carrying any number of files can be routed to an are.na destination: `create` makes one
block per file, the words captioning the first, and the arena kind declares `place-assets`, which
makes one block per file and nothing else. Nothing refuses a capture for carrying more than one
asset, and a record of a delivery that made several blocks names the channel and lists the blocks
it made.

---

## Decisions taken

Settled with the developer before this plan; the first four are its reason for existing.

- **One block per file, and are.na receives everything.** `create` with three pictures makes three
  blocks. The capture's words are the `description` and `alt_text` of the **first** block only,
  which is what a person filing by hand does; the rest are bare asset blocks. A capture with no
  asset is unchanged — its prose is one block, a leading URL still becoming a Link block.
- **A partial failure retried duplicates, and that is accepted.** Block one lands, block two is
  unreachable, the job retries, and block one is posted again. The arena kind already promises
  nothing here ([ADR 41](../adr/0041-a-delivery-that-cannot-be-confirmed-may-duplicate.md)) because
  are.na offers no conditional create and no idempotency key, and `/v3/search` is Premium-only so
  nothing can look at what landed. What is new is that this duplicates **deterministically** on
  every retry of a partially failed delivery rather than in the narrow window of an unconfirmed
  POST, so the kind's README says so and ADR 41 carries a dated note pointing at the new ADR.
  Keeping track of what landed was weighed and rejected: `DeliveryOutcome` is all-or-nothing, and
  the alternative — one delivery per file — is fan-out from one gesture, which makes *cancel* a
  question [ADR 37](../adr/0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md)
  does not answer.
- **A delivery that made several blocks names the channel.** `pointer` is the channel as the
  decision named it, `url` is absent — a channel permalink needs the owner's slug, which `deliver`
  does not have, and only `/block/<id>` is composable by convention — and every block's URL is in
  the **output**, which is the shape [ADR 57](../adr/0057-a-capture-can-be-routed-as-its-attachments-alone.md)
  already gives the same problem. **A delivery that made one block is unchanged**: `pointer` is the
  block's id and `url` is the block, so every record that exists reads as it did and the common case
  keeps a link a person can follow. The rule is one block names the block, several name the channel.
- **`place-assets` on arena takes `channel` alone.** One block per file, no text block, and a
  capture referencing no asset is `rejected`, as it is on the file kinds. No folder, no folder mode:
  a channel is joined rather than made, so there is nothing for a mode to decide. The channel field
  is the one `create` declares, annotated the same way, and the schema root carries
  `x-notemap-carries: "assets"`, which is what makes the shell offer it.
- **What the output says it dropped.** For `create`, as now: the tags went into the block's
  metadata, artifacts went nowhere. For `place-assets`, only the tags line — the words and the
  artifacts going nowhere is what was asked for, so the output does not confess them, following
  ADR 57.
- **Provenance metadata still goes on every block.** It is where the capture came from rather than
  what it said, and a block moved out of its channel keeps it.

---

## Unknowns

- ~~**Does the shell's `attachments only` switch keep the channel?**~~ Resolved while writing the
  plan: the switch is never drawn here. It is offered only beside a capability the surface *settles*
  (`offersOutput`, `Process.svelte:279`), and arena settles none — with two capabilities and no
  typed line, `implied` goes undefined and the surface asks under `do` instead, which is what
  `shell.md` already prescribes for a kind that settles nothing. So no `withFolder` call ever
  touches a channel. What the change does cost the shell is the step: routing to a board by hand
  now asks `create` or `place-assets`, where it asked nothing. Phase 4 is therefore only the one
  thing that is wrong about that list — it would offer `place-assets` for a capture with no
  attachments, which delivery is bound to reject.
- **Does `@notemap/schema-ajv` accept `x-notemap-carries` on a schema that is not the file kinds'?**
  It is registered as an annotation rather than per capability, so it should; Phase 3's test of the
  description says so either way.
- **Does the fake board in `packages/adapters/destination-arena/src/testing/arena-server.ts` hold
  more than one block per channel?** Phase 2 finds out at its first test; if it does not, it grows
  a list, which is a fixture change and not a design question.

---

## Tasks

### Phase 0

- [x] Branch `agent/arena-takes-every-file`

### Phase 1 — docs, for review before any code

Depends on nothing. Every later phase codes against it.

- [x] ADR 0059: one block per file, the words on the first, the channel as the pointer of a
      multi-block delivery, and the deterministic duplication a retry now accepts. Weighed and
      rejected: refusing as now, the first file only, keeping track of what landed, and one
      delivery per file.
- [x] A dated note on [ADR 41](../adr/0041-a-delivery-that-cannot-be-confirmed-may-duplicate.md)
      naming 0059 and what it widened. Nothing in it is rewritten.
- [x] `docs/specs/core.md`: the `place-assets` paragraph stops saying the arguments are a folder and
      the folder mode, and stops making the pointer the folder — both become the declaring kind's.
      The arena kind declares it with a channel, makes one block per file, and names the channel
      where it made several.
- [x] `docs/specs/shell.md`: a capability carrying the assets alone is not offered under `do` where
      the item has no attachments, and a board asks `do` at all now that it declares two.
- [x] `packages/adapters/destination-arena/README.md`: the second capability, one block per file,
      the words on the first, the pointer rule, the output, and the retry promise it does not make.
- [x] `docs/todo.md`: tick the are.na line and its 2026-10-08 note.
- [x] Verify: the developer confirms the docs — pitched and answered before the plan _(2026-10-10)_.
- [x] Commit _(2026-10-10)_

### Phase 2 — `create` makes one block per file

Depends on Phase 1.

- [x] `blocks.ts`: a renderer answers blocks rather than one block, the words captioning the first
      asset block and no other. A capture with no asset answers one block, as now.
- [x] `destination.ts`: `wanting` carries the blocks and refuses nothing for their number; `deliver`
      uploads and posts each in slot order; the outcome names the channel where it made several and
      the block where it made one; the output lists what went.
- [x] `preview` answers what it can without uploading anything: the captions, and no address — an
      unposted block has none. So a preview of three pictures reads as a preview of one, and the
      attachments the surface draws around it are what say how many go.
- [x] Tests: three assets make three blocks in slot order; the words caption the first and nothing
      else; one asset and no asset are unchanged; the output lists every block URL; the pointer is
      the channel for several and the block for one; a failure on the second block is `unreachable`
      with the first left where it landed.
- [x] Verify: `pnpm --filter @notemap/destination-arena test`
- [x] Commit _(2026-10-10)_

### Phase 3 — `place-assets` on arena

Depends on Phase 2. *Landed in Phase 2's commit: both capabilities are declared in one function and
decided in one `wanting`, so splitting the commit would have split a file in half.*

- [x] `capabilities.ts`: the second capability, its channel field, `x-notemap-carries: "assets"` at
      its root, and its arguments reader.
- [x] `destination.ts`: `place-assets` makes one block per asset with no caption and no text block,
      and `rejected` where the payload references none. The output's note says only what the tags
      did.
- [x] `candidates.ts`: both the browse and the naming answer for either capability's channel field
      instead of `create`'s alone.
- [x] Tests: the description carries both capabilities and the annotation; two assets make two
      uncaptioned blocks; no asset is rejected, and its preview is refused the same way; the browse
      answers channels for the new capability.
- [x] Verify: `pnpm --filter @notemap/destination-arena test`
- [x] Commit — with Phase 2 _(2026-10-10)_

### Phase 4 — the shell offers no capability that cannot work

Depends on Phases 1 and 3. Codes against the annotation, not the kind.

- [x] A capability carrying the assets alone is left out of the `do` list where the item has no
      attachments, which is the same condition the `output` section already applies. The template
      form keeps offering it: what item a template will meet is not known.
- [x] Tests beside it: a kind that settles nothing offers both capabilities for an item with
      attachments and only the other for an item without.
- [ ] Verify: `pnpm --filter @notemap/ui test` passes; **by hand against a real board, left for the
      developer** — attach two pictures, route to a channel, see two blocks with the words on the
      first.
- [x] Commit _(2026-10-10)_

### After review

[arena-takes-every-file-2026-10-10](../reviews/arena-takes-every-file-2026-10-10.md).

- [x] **Blocks in slot order.** Core sorts `delivery.assets` and leaves the payload's references in
      the order they were attached; both renderers read the payload, so neither the block order nor
      which file got the caption was the slot order four places claimed. Both now read
      `attachedAssets`, as the file kinds' `place-assets` does, and the fixture sorts as core does
      so a test that says slot order tests it _(2026-10-10)_.
- [x] **Every asset resolved before the first block is posted.** The slot lookup inside `valueFor`
      threw `Refused`, which is `rejected`, which core abandons at once — so a reference the pool
      could not resolve could answer "nothing was delivered" with blocks already in the channel. A
      block carries its resolved asset, and `place-assets` refuses on what actually resolved
      _(2026-10-10)_.
- [x] **A later block refused is a delivery that carried part of the capture**, settled with the
      developer: `delivered`, the blocks that landed named, and a note saying how many of how many
      went and which file did not. `rejected` only where nothing landed; `unreachable` still retries
      and still duplicates. ADR 59, `core.md` and the README all say so _(2026-10-10)_.
- [x] ADR 59's consequences no longer claim nothing in the shell changed, a board being reached
      through `do` rather than through the `attachments only` switch _(2026-10-10)_.
- [x] The browse and the naming for `place-assets`' channel field are tested, which the plan had
      ticked without _(2026-10-10)_.
- [x] The rest of the review's list, after the developer asked whether all of it was done: the
      comment in `Process.svelte` that leant on are.na having one capability, the provenance
      metadata built once per delivery rather than once per block, a spec line rewrapped, and the
      four test gaps — `place-assets` with one file and its preview, the carrier a template took
      for a capture with none, and the duplication a second attempt makes, which the README
      promises in so many words. The slot-only lookup went with the resolved asset above
      _(2026-10-10)_.
- [x] Left deliberately: the preview says nothing about how many blocks it would make, the
      developer having chosen to leave it and the claims about it corrected instead.
- [x] Commit _(2026-10-10)_

### Phase 5 — finishing

- [x] Typecheck, lint, `pnpm -r --silent test`.
- [x] `pnpm test:stack`: a destination's description answers a second capability — 88 passed.
- [x] Add a `Shipped:` entry to `core.md` and `shell.md`, and set this plan's status.
- [x] Commit _(2026-10-10)_

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
