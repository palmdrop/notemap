# An edit lets go of its bytes

**Date**: 2026-10-10
**Status**: Done
**Spec**: `docs/specs/shell.md`
**Closed**: 2026-10-10

---

## Goal

> No file picked in an edit or in the Raycast capture form leaves bytes in the client's store
> unless an operation names them: an edit attaches at `save`, a Raycast capture that fails lets go
> of what it attached, and the only user has a command that sweeps what earlier versions left.

---

## Decisions

Settled with the developer on 2026-10-10, from the pitch:

1. **The edit attaches at `save`, not at `pick`.** It holds `File`s while it is open, as the
   capture box does (`apps/ui/src/components/capture/Capture.svelte:48`), and nothing reaches the
   client's store until the words are sent. A reload already loses the whole edit — `Editing` is
   component state and nothing persists it — so holding files rather than assets loses nothing that
   survives a reload today. It is the shape that makes the leak impossible rather than remembered.
2. **A picked file is refused as it is picked**, through `client.refuses(file)`, which is what the
   box does and what `shell.md:844` already says of the edit.
3. **A thumbnail of a picked file comes from `URL.createObjectURL`**, created and revoked as the box
   creates and revokes its own (`Capture.svelte:86-103`). An attachment the item carries keeps
   reading through `client.assetContent`.
4. **The narrow rule for what is let go**: what `pick` took and the saved item does not carry. An
   attachment the item carries is the pool's, and dropping one in an edit takes nothing locally —
   its local copy was released when the capture drained (`packages/client/src/client.ts:431`).
5. **The Raycast capture detaches in its failure branch**, in this same branch, since there the
   capture *is* the save. `client.detach` already leaves alone bytes an outbox operation names
   (`client.ts:684`), so the branch that captured-but-did-not-tag can call it without a flag.
   *Amended while implementing*: the detach is the smaller half. The form passed `asset` where
   `CaptureInput` names `assets`, which a spread hides from the excess-property check, so the
   client dropped it: the attachment never reached the pool and its bytes were orphaned on
   **every** capture rather than on a failing one. The field is the fix; the detach covers only
   the window where the capture throws before the outbox has taken it.
6. **Nothing migrates bytes already leaked.** Instead the only user gets a sweep to run: a script
   for a filesystem store, and a console snippet for the browser. `state.held` is memory-only
   (`packages/client/src/state/state.ts:142`) and `ClientStore` has no blob lister, so an in-client
   sweep would mean a port change across three adapters — more than this is worth, and the daemon's
   own `BlobStore.list()` is the precedent for when it is.
7. **No ADR.** Nothing is decided here that the specs do not already state: `shell.md:748` says a
   capture that fails lets go of every file it had attached, and `shell.md:829` says nothing an edit
   holds outlives it. This makes both true of the bytes.

---

## Tasks

- [x] Create branch `agent/an-edit-lets-go-of-its-bytes`

### Phase 1 — Docs

Depends on nothing.

- [x] `shell.md`: the edit's attachment paragraph (≈ lines 833-845). Say that the edit holds what is
  picked and attaches it as the edit is saved, that a file is refused as it is picked, and that the
  `×` on a picked file takes the file and nothing else. State that the bytes are what
  "nothing an edit holds outlives it" (≈ line 829) now covers, and keep the box's sentence at
  ≈ line 748 as the one place the rule is argued rather than restating it.
- [x] `shell.md`: `save` no longer "waits for an attachment still being attached" (≈ line 825) —
  it is what does the attaching. Say what `save` waits for instead, and keep the fact that a file
  on its way counts as a change.
- [x] `client.md` needs no change: `detach`'s sentence (≈ line 1001) already describes exactly what
  the Raycast form will do with it. Confirm that by reading it, and leave it alone.
- [x] Commit

**Verify:** `grep -n "still being attached" docs/specs/shell.md` finds nothing that describes the
old shape, and the edit's paragraph names `refuses` rather than an attach at pick time.

### Phase 2 — The edit holds files

Depends on phase 1.

- [x] Lift `sorted` out of `Capture.svelte:139` and have the box and the edit use the one copy. It
  is the whole of "refuse as it is picked". _(landed in `$lib/picking.ts` rather than
  `$lib/attachments.ts`, which is pure and would have gained the client singleton)_
- [x] `Editing` (`apps/ui/src/components/item/editing.svelte.ts`): the attachment list becomes
  carried-or-picked. `pick` sorts through the lifted helper, says what was refused on the status
  line and holds the rest, awaiting nothing; `drop` takes either kind out; `revert` goes back to
  what the item carries and lets every picked file go; `#rewritten` compares the list against the
  objects the constructor made, so anything else in it is an edit; `save` attaches the picked files
  in list order and sends the payload with the slots in that same order; `busy` means saving.
- [x] `#uploading` and the `await this.#uploading` in `save` go, there being no pick in flight to
  wait for. `close`, `abandon` and the leaving dialog need no byte handling at all — which is the
  point of the shape.
- [x] `Edit.svelte`: key the two `{#each}` blocks on something a picked file has — the box keys on
  the `File` itself (`Capture.svelte:234`) — and draw a picked file's thumbnail from an object URL
  held in a map created and revoked as the box's is. `HeldAttachment` already takes `name`, `url`
  and `bytes` and needs no change.
- [x] `EditFoot.svelte`: `attach` stays disabled by `busy`, which now means the save is going out
  rather than a pick is uploading — nothing to pick in that window either way.
- [x] Commit

**Verify:** `pnpm --filter @notemap/ui test`. The fixture (`apps/ui/src/testing/pool.ts`) wraps its
memory store in one that records `writeBlob` and `removeBlob`, so the tests can say:

- picking a file in an edit writes no blob;
- picking then dropping, reverting, or closing with *discard* writes none and leaves none;
- `save` writes one blob per picked file and sends an envelope naming them in list order,
  interleaved with what the item carried;
- the existing "save waits for an attachment still being attached" test (`Edit.test.ts:139`)
  becomes a test that `save` finishes its attaching before it sends — its old premise is gone;
- a file larger than the limit is still refused at pick (`Edit.test.ts:172`), unchanged.

### Phase 3 — The Raycast capture names its file, and lets go of what it failed to send

Depends on nothing; can run beside phase 2.

- [x] Move the attach-capture-tag sequence out of the view into `apps/raycast-extension/src/lib/note.ts`,
  so it is reachable from `note.test.ts`; `capture.tsx` keeps the form, the toast and the HUD.
- [x] `capturing` sends `assets: [asset]`, so the file goes with the words and an operation names
  the bytes. This, not the detach, is what was leaking on every Raycast capture carrying a file.
- [x] The failure path detaches what `attaching` attached, before `client.close()`. Only the
  pre-outbox window needs it: a capture the pool **refuses** stays in the outbox naming its bytes,
  which is why `detach` declines those and why the words can be sent again.
- [x] Fix `note.ts:48`: "One file, because that is what a capture carries" stopped being true on
  2026-10-07. The picker is still single-select, so say that instead.
- [x] Commit

**Verify:** `pnpm --filter notemap test` (the extension's package is named for the store). New
tests over the lifted function, against a real client on a memory store: a capture carrying a file
sends an envelope naming one asset and uploads it once — which fails on the old field; the tags it
was given are applied after the capture; and a capture the pool refuses keeps its bytes, the outbox
entry being the only copy of what it carried.

### Phase 4 — A sweep for what is already held

Depends on nothing.

- [x] `scripts/sweep-held-blobs.ts`, run as `pnpm sweep <directory>`: the blob directories of a
  filesystem store (`<dir>/blobs/<asset>/`) that no persisted operation names (`<dir>/outbox/*.json`),
  listed with their sizes. Dry run unless `--delete`.
- [x] `docs/running.md`: a short section saying where the two client stores are, how to run the
  script against Raycast's support path, and the console snippet for the browser — the `notemap`
  database's `blobs` keys less every asset named by an entry of `outbox`. Say plainly that clearing
  site data instead takes the outbox and the cache with it.
- [x] Commit

**Verify:** run the script against a copy of a real Raycast support directory and see it name
nothing that the outbox names; run it with `--delete` on that copy and see the directory shrink.
Paste the snippet into the shell's console and read the count it reports.

### Review fixes (2026-10-11)

From [the review](../reviews/an-edit-lets-go-of-its-bytes-2026-10-11.md), whose Resolution section
is the finding-by-finding account.

- [x] `save` answers whether it saved, and the leaving dialog stays put where it did not — the one
  data-loss path this branch had introduced.
- [x] A rejecting `client.edit` lets go of the bytes it had just held, and the edit closes after the
  operation is recorded rather than before.
- [x] The Raycast `catch` closes the client before the HUD pops to root.
- [x] The walk is a **reclaim**, in `CONTEXT.md`'s words, with a grace window and a refusal to
  delete where it meets an operation kind it does not know.
- [x] `$state` had made `#rewritten`'s identity comparison wrong rather than merely fragile; it
  compares by asset and by file now.
- [x] Tests for the rollback, the save-time refusal, object-URL revocation, `capturing`'s detach
  path and a `partly` capture.
- [x] What the Raycast form does with what it holds becomes `lib/submitting.ts`, taking Raycast's
  part as three functions, so the HUD branching and the close-before-leaving ordering are tested
  without a renderer. The view keeps the fields, the toast and the notice.
- [x] The documentation findings, 12 through 21.
- [x] Commit

**Verify:** `pnpm typecheck`, `pnpm -r --silent test`, `pnpm lint`, `pnpm test:stack`.

### Phase 5 — Close out

Depends on every phase above.

- [x] Tick `docs/todo.md:85` with the date, and say where the Raycast half landed, that entry
  having never named it.
- [x] `pnpm typecheck`, `pnpm -r --silent test`, `pnpm lint`.
- [x] `pnpm test:stack` — the edit's save path crosses the client's transport and the upload route,
  which is what that suite is for.
- [x] Status to `Done`, and a dated `Shipped:` entry in `docs/specs/shell.md`.
- [x] Commit

**Verify:** all four commands clean.

---

## Unknowns

- **Whether the fixture's store can be wrapped without touching the client.** `pool()` builds
  `createMemoryStore()` inline and hands back only the transport
  (`apps/ui/src/testing/pool.ts:33`). A recording wrapper around it is test-only and needs nothing
  from the port. If that turns out to reach further than expected, fall back to asserting on the
  envelope the save sends and on `client.attachments` drawing nothing after an exit — weaker, since
  it observes the list rather than the bytes.
- **Slot order with carried and picked files interleaved.** `client.attached` numbers slots afresh
  in the order the ids are given, so `save` must attach picked files into their positions rather
  than appending them. The test above is what holds this; if the order turns out to be more
  tangled than it reads, the fallback is to attach in one pass and build the id list from the
  displayed list rather than from two.
- **What `attach` in the foot is disabled by while saving.** Today `busy` covers a pick in flight.
  It may want nothing at all, the save being quick and the row closing behind it.
- **Where the sweep belongs.** `scripts/` is the repo's home for tooling the developer runs, and
  `docs/running.md` is about operating an install, which is nearly the same audience. If the
  developer would rather have it outside the repo, it is a `oneshot save scripts/sweep-held-blobs.ts`
  and the section in `running.md` keeps the snippet alone.
- **Found in phase 3: the Raycast attachment never arrived.** Written up under decision 5. Nothing
  tested the extension's capture end to end, and the one place the field is named is a spread,
  where TypeScript checks no excess property. The new test names the asset count, which is what
  would have caught it.
- **Found in phase 3: a refused capture keeps its bytes on purpose.** The pitch said each failed
  press left another copy. It does not: the refused operation stays in the outbox naming them, so
  `detach` declines and the words can be sent again. What the window the detach covers really is:
  a capture that throws before the outbox has recorded it.
- **Found in the review: `$state` proxies and identity.** `attachments` is reactive state, so an
  entry read out of it is a proxy and never equals the raw object `#carries` holds. The comparison
  has to be by asset and by file. The cost of getting it wrong was invisible to the whole suite,
  because the one test for an unchanged edit uses an item with no attachments.
- **Pictures the pool has measured.** An edit draws a carried picture at the proportions the pool
  measured (`shell.md:2536`); a picked one has no measurement and is drawn from its object URL at
  the box's size. The box already lives with that, so the expectation is nothing to do — but it is
  the one visible difference between picking in the box and picking in an edit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The assertions that matter are about bytes, not about lists: a test that only checks what the edit
draws would have passed throughout the life of this bug. Each exit — drop, revert, discard, and a
save that the pool refuses — gets one that reads the store.

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
