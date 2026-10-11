# Review: An edit lets go of its bytes

**Date**: 2026-10-11
**Status**: Resolved — 8 and 9 answered rather than taken, 10 holds a named gap
**Scope**: `origin/main..HEAD` — `apps/ui/src/components/item/`, `apps/ui/src/lib/picking.ts`, `apps/raycast-extension/src/`, `scripts/reclaim-held-blobs.ts`, `docs/`
**Plan**: `docs/plans/an-edit-lets-go-of-its-bytes.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

The central move is right and the shape is better than what it replaces: `Editing` holding `File`s
and attaching at `save` makes the leak structurally impossible rather than remembered, the `sorted`
lift to `$lib/picking.ts` is a genuine single copy, and the Raycast `asset`→`assets` fix is the real
bug the plan went looking for. `pnpm typecheck`, `pnpm -r --silent test` and `pnpm lint` are all
green on re-run.

But the change moved failure handling from a place where failing was harmless to a place where it is
not, and did not follow it. `save()` grew two early returns that return normally without having
saved, and its one non-interactive caller — the leaving dialog — reads a resolved promise as "saved"
and goes on with whatever the person was leaving towards. The reachable outcome is that an edit whose
attach fails closes and takes the person's words with it, reporting only a toast about the file
(finding 1). That is a data-loss path this branch introduced; everything else here is smaller.

Second in weight is that `--delete` in the new sweep script and the console snippet both race the
attach-before-enqueue window and will delete bytes a capture is one `await` away from naming, with no
grace window, no lock, and no caveat in `docs/running.md` (finding 4). The project's own
`CONTEXT.md` says that grace window is the whole reason the daemon's reclaim has one.

---

## Bugs

### 1. A `save` that did not save is indistinguishable from one that did, and the leaving dialog goes on anyway

`apps/ui/src/components/item/editing.svelte.ts:131-137` and `:143-147` — `save()` now has two paths
that `return` having sent nothing:

- the save-time re-sort refusing a picked file (`:131`), which strips the refused files from
  `this.attachments`, raises a notice and returns;
- `#attached()` returning `undefined` (`:143`), which resets `busy`/`#saving` and returns.

Both resolve the promise normally. `apps/ui/src/lib/leaving.svelte.ts:82-85` is the caller that
cares:

```
if (open === edit) open = undefined;
if (choice === "save") await edit.save();
else edit.revert();
then();
```

`open` is cleared *before* the save, and `then()` runs unconditionally after it. So:

```
edit open, text changed, one file picked
  → press `close` → dialog → answer `save`
  → client.attach throws (quota, IndexedDB write error, a blob the store refuses)
  → notice "shot.png: <reason>", save() returns
  → then() === #close() → Row.svelte:109 sets editing = undefined
  → the edit unmounts with the person's words unsent
```

`apps/ui/src/components/item/Row.svelte:98` makes the other continuations just as fatal: selecting
another row sets `editing = undefined` with no second question. Pre-change this could not happen —
`save()` always reached `client.edit`, an attach failure having been reported at pick time.

`leaving.svelte.ts:13-14` states the contract this breaks: *"Settles once whatever was being attached
has gone up with it."* It no longer does, and the comment is now false as well as unenforced.

Fix: `save()` should report whether it saved — `Promise<boolean>`, or a small result — and
`answer("save")` should treat a save that did not happen as `stay`: resume the edit, leave `open`
set, skip `then()`. The refusal branch at `:131` additionally should not strip files *and* decline to
save in the same press; pick one.

### 2. A rejecting `client.edit` strands exactly the bytes this plan exists to prevent

`apps/ui/src/components/item/editing.svelte.ts:142-155` — `#attached()` writes a blob per picked
file, then `#close()` runs at `:153`, then `client.edit` is awaited at `:155`. If `client.edit`
rejects — the outbox write failing is the realistic case — the blobs are already written, no
operation names them, nothing detaches them, the row has closed, and the rejection escapes `save()`
unhandled (`Edit.svelte:67` and `:118` both `void` it).

`#attached()`'s `fresh` rollback covers only failures *during* attaching, not the window between the
last successful attach and the operation that claims them. The plan's Goal is "No file picked in an
edit … leaves bytes in the client's store unless an operation names them"; this is the one path left
where that is false.

Fix: hold the `fresh` list until `client.edit` has resolved and detach it on rejection, and close
after the operation is recorded rather than before — or at minimum surface the rejection instead of
dropping it.

### 3. The Raycast catch path pops to root before closing the client, dropping the invariant stated two lines above it

`apps/raycast-extension/src/capture.tsx:126-136` — the success path is careful about ordering, and
says why at `:116-117`: *"Popping to root ends this process, so whatever is still on the wire is
abandoned and written back first rather than left leased."* It closes at `:118`, then hides the
toast, then shows the HUD.

The new `catch` does `toast.hide()` → `showHUD(…, { popToRootType: Immediate })` → and only then
`client.close()` in the `finally`. The HUD pops to root first, so the close may never complete and
the lease is left behind. The old code got this right: its captured-failure branch did
`await client.close()` *before* `toast.hide()` and the HUD. That ordering was silently dropped in
the rewrite.

Fix: `await client.close()` as the first statement of the `catch`.

### 4. `--delete` and the console snippet both race the attach-before-enqueue window, with no grace window and no warning

`scripts/sweep-held-blobs.ts:69-88`, `docs/running.md:251-287` — `client.attach` writes the blob
before any operation names it (`packages/client/src/client.ts:667`, then `capturing()` in
`apps/raycast-extension/src/lib/note.ts:97-102`, and `Capture.svelte:172-180` for the browser). A
blob written in that window is on disk named by nothing, and `--delete` will take it while the next
`await` is about to claim it.

The script reads the outbox once at `:69` and the blobs once at `:73` and never re-checks, so an
operation written by a concurrent process between the two reads is invisible. There is no lock and no
mtime grace window. `CONTEXT.md:160-166` is explicit that this is why the daemon's sweep waits one
out: *"to a sweep running at the wrong instant, 'referenced' and 'about to be referenced' look
identical."* The script is the only thing in the tree that deletes blobs without that protection, and
`docs/running.md` tells the person to run it with no instruction to quit Raycast or close the tab
first.

Related, same line: `rm(path, { recursive: true, force: true })` at `:87` deletes the whole blob
directory, including a `replace()` temp file mid-rename inside it
(`packages/client/src/adapters/filesystem-store.ts:83-88`). `sizeOf` reports `0 bytes` for such a
directory because it only stats `bytes`, so the dry run shows nothing worth keeping and `--delete`
destroys a nearly complete write.

Fix: skip any blob directory whose mtime is inside a grace window, and say in `running.md` that the
shell or extension must not be capturing while this runs.

### 5. The console snippet reports a deletion it never waited for

`docs/running.md:279-285` — the delete loop opens a `readwrite` transaction, queues the deletes, and
returns `{ unnamed, deleted: del }` without awaiting `tx.oncomplete`. The queueing is valid (no
interleaved `await`, so no auto-commit), but the function reports `deleted: true` before the
transaction has committed and regardless of whether it aborts on quota or error. A tab closed on the
returned value loses the work it claims to have done.

`read()` at `:270-274` also has no `onerror`, so a failed `getAll`/`getAllKeys` hangs the promise
forever rather than rejecting.

Fix: await `tx.oncomplete` (rejecting on `onabort`/`onerror`) and return the count that actually
committed; add `onerror` to `read`.

---

## Design

### 6. `sweep` is a reserved domain term, and this script does the reclaim's job

`CONTEXT.md:160-173` defines **Sweep** as "the periodic release of assets no item ever referenced …
It deletes no blob; the bytes an asset leaves behind are the reclaim's", and **Reclaim** as the walk
"that deletes each blob no asset and no routing record names, once it has gone unput for the sweep's
grace window". Both carry an `_Avoid_` list, so they are deliberately narrow.

`package.json:14` now names a blob-deleting, grace-window-less, client-side one-shot `sweep`, and
`docs/running.md:251` and `docs/todo.md:95` use the verb in prose. The five commits immediately
preceding this branch exist to draw exactly this distinction — *"a reclaim deletes blobs nothing
names; the sweep releases assets only"* — so the naming inverts a line the codebase had just
finished drawing. `AGENTS.md` says to use `CONTEXT.md`'s words or fix the entry, not to overload one.

`reclaim-held-blobs.ts` / `pnpm reclaim` is the name that matches what it does.

### 7. `#attached()` attaches unconditionally; whether to send is decided afterwards by a separate predicate

`apps/ui/src/components/item/editing.svelte.ts:142-156` — `#attached()` writes blobs for every
picked file, and only then does `:152` read `#rewritten` to choose between `client.edit` and a loop
of `client.tag`. The tag-only branch names no assets. Today the two cannot disagree — a `Picked` is
never in `#carries`, so a picked file forces `#rewritten` true — but that is an invariant held
implicitly by two unrelated expressions, it is the precise invariant whose violation is this plan's
bug, and nothing tests it. Compute "will send an edit" once, before attaching, and attach only on
that branch.

### 8. The save-time re-sort copies the box's shape into a place where it does not fit

`editing.svelte.ts:128-137` vs `apps/ui/src/components/capture/Capture.svelte:158-163` — the two are
deliberately identical: narrow the list, say what was refused, return. In the box that is harmless,
because nothing is waiting on `capture()` and the person is still looking at the form. In the edit it
is finding 1, and it also mutates `attachments` out from under a person who pressed Save and will now
have to press it again. Since `client.refuses` is pure and per-file, the only thing that makes this
branch reachable at all is the limit having been learned between pick and save — a narrow case
carrying a disproportionate failure mode.

### 9. The sweep's `namedBy` is a hand copy of client-internal logic, with no test, guarding an irreversible flag

`scripts/sweep-held-blobs.ts:27-41` duplicates `packages/client/src/assets/assets.ts:7-11`. The
duplication is forced — `namedBy` is not exported from the client's public surface — and the header
comment makes the honest case for it. But the walk is correct only as long as `capture` and `edit`
remain the sole operation kinds carrying `envelope.payload.assets`, and the only thing standing
between a future operation kind and `--delete` eating live bytes is someone noticing two files
disagree. A script that deletes data deserves a test; nothing in the branch tests it at all.

### 10. Test gaps — the intricate new code is the untested code

Each of these is a specific case the branch does not cover:

- **`#attached()`'s rollback** (`editing.svelte.ts:179-183`) — no test that a save where the second
  attach fails detaches the first, leaves the edit open, and keeps the words. This is the most
  intricate code added and it has no coverage; finding 1 lives here.
- **The save-time refusal branch** (`:131-137`) — untested. The plan's own Testing section required
  "a save that the pool refuses" to get a test that reads the store; it was not written.
- **`capturing`'s detach path** — `note.test.ts`'s "keeps the bytes of a capture the pool refused"
  asserts `state === "refused"` and `held()` length 1, which tests the *client* declining to detach.
  The branch that actually calls `client.detach` — `client.capture` throwing before the outbox records
  it — has no test, and decision 5 calls it half the fix. The test also never asserts
  `captured.kind`, so which path ran is invisible.
- **`Captured["kind"] === "partly"`** — untested.
- **Object URL revocation** (`Edit.svelte:30-47`) — `stubObjectUrls()` already exists, so asserting
  that dropping a picked file revokes its URL and that unmount revokes the rest is cheap. Neither is
  asserted.
- **`apps/raycast-extension/src/capture.tsx`** — still has no test of any kind, which is why finding 3
  could be introduced silently. The lift made `capturing` testable but left the view's wiring (the
  HUD branching, the close ordering, `chosen(tags, newTags)`) unguarded, and the view is where the
  original `asset` bug lived.

Separately, the repurposed test **would mostly pass against the pre-fix code**. `Edit.test.ts:139`
adds `await vi.waitFor(() => expect(heldBlobs()).toHaveLength(1))`, which attach-at-pick satisfied
just as well. The assertion that discriminates — `expect(heldBlobs()).toEqual([])` *before* the save
chord is fired — is the one line missing. The other new test
(`Edit.test.ts:180`, drop/revert/discard) does fail pre-fix, correctly.

### 11. Two copies of the recording store, and the UI one is the worse shape

`apps/ui/src/testing/pool.ts:32-47` and `apps/raycast-extension/src/lib/note.test.ts:121-140` — the
same wrapper, written twice. Across packages that is defensible, but the UI copy reassigns a
module-level `blobs` as a side effect of being called (`pool.ts:34`), so `heldBlobs()` silently
refers to whichever store was built last; the Raycast copy returns `{ store, held }` and has no such
coupling. The Raycast shape is the one to keep. `pool.ts:49`'s "in the order they were written" is
also slightly stronger than a `Set` gives — a re-written asset moves to the end.

### 12. The `Shipped:` entry omits a third of what landed

`docs/specs/shell.md:7-14` matches house style and covers the edit and the Raycast half, but never
mentions the sweep. Phase 4 is a full phase, the sweep is one of three clauses in the plan's own Goal,
and `docs/running.md` gained a user-facing section for it. The specs are the only tracker, so this is
lost history.

### 13. `hudFor` takes a stringly subset of the result it is describing

`apps/raycast-extension/src/capture.tsx:29-36` — the parameter is
`kind: "captured" | "partly"`, a hand-narrowed copy of `Captured`'s discriminant, and the `catch` at
`:130` passes the literal `"partly"`. Taking the `Captured` value (or an explicit third case for
"captured, but the HUD went wrong") would stop the two unions drifting and remove the need for the
`landed === undefined` convention to mean two different things.

---

## Minor

### 14. The spec does not say what `save` does when it cannot attach

`docs/specs/shell.md:834` and `:852-857` describe `save` attaching and sending with no failure clause,
while `:833` still promises that `save` "answer[s] and go[es] on with whatever was asked". Together
they describe finding 1 as correct behaviour. Whatever shape finding 1 is fixed into needs a sentence
here.

### 15. `Open.save`'s doc comment is now false

`apps/ui/src/lib/leaving.svelte.ts:13-14` — "Settles once whatever was being attached has gone up with
it" describes the attach-at-pick model. `AGENTS.md` is explicit that a comment claiming a guarantee
the code does not enforce is worse than none.

### 16. `pnpm sweep` contradicts `running.md`'s own premise

`docs/running.md:251-255` vs `:10` — the document opens with "Docker with the compose plugin. That is
all — no clone, no pnpm, no toolchain." The file already has the pattern for this: "Cutting a release"
at `:535` scopes itself with *"From a clone, on the machine you develop on:"*. The new section needs
the same line.

### 17. The snippet does not report "the same thing"

`docs/running.md:260-261` claims parity with the script, but the script reports per-asset and total
byte sizes and the snippet returns ids and a copy of its own flag. `deleted: del` in particular reads
as a result and is an echo of the argument.

### 18. A malformed outbox `.json` crashes the sweep uncaught

`scripts/sweep-held-blobs.ts:53` — no `try` around `JSON.parse`. It fails safe, since `names()`
resolves before anything is listed or deleted, but it dies with a raw `SyntaxError` where the store it
mirrors renames and continues (`filesystem-store.ts:132-145`).

### 19. `.unreadable` operations' assets are swept without mention

`scripts/sweep-held-blobs.ts:52` — the `.endsWith(".json")` filter skips quarantined operations, so
any asset one of them names is reported unnamed and deleted. That matches the client, which never
reads them again — but `filesystem-store.ts:44-45` keeps them deliberately ("kept but read no more"),
and taking their bytes forecloses recovering one by hand. Worth a counted line in the output rather
than silence.

### 20. `docs/todo.md` says what the Raycast half was, not where it landed

`docs/todo.md:93-96` — phase 5 asked it to "say where the Raycast half landed". The note names the bug
and links the plan and `running.md`, but not `apps/raycast-extension/src/lib/note.ts`, where the same
bullet's older sentence does cite a path.

### 21. `shell.md`'s reflow and an uncheckable count

`docs/specs/shell.md:835-838` and `:852-857` — the edit left lines of 60 and 118 columns in a file that
otherwise wraps near 100, which will make the next prose diff here noisier than it needs to be. And
"an edit has four ways of never being saved, where the box has one" asserts a count nothing in the
spec or the code enumerates.

---

## Non-issues

- **`#rewritten` comparing object identity** (`editing.svelte.ts:81`) — sound. `revert()` restores the
  same `#carries` array reference, nothing clones the list, and a `Picked` is never in `#carries`, so
  identity is strictly stronger than the old `asset` comparison. Fragile if anything ever maps the
  list, which is finding 7's concern rather than a defect here.
- **`busy` and `#saving` never reset on the success path** (`:139-153`) — `#close()` is
  `Row.svelte:109` setting `editing = undefined`, so the instance is discarded. Harmless.
- **`changed` losing its `busy` term** (`:72`) — no reachable regression. During a save in flight the
  list still holds picked files or `waiting` is non-empty, so `#rewritten` or the `waiting` term covers
  every case the `busy` term used to.
- **`HeldAttachment` receiving `url: undefined`** on a picked file's first paint — handled.
  `HeldAttachment.svelte:31-35` reserves the picture's box before the picture exists, and
  `AttachmentLine.svelte:26` renders a `span` rather than a dead `<a>`. The plan's "needs no change"
  holds.
- **Object URL lifecycle** (`Edit.svelte:30-47`) — no leak found. The effect tracks only
  `editing.attachments` and `untrack`s its own map reads, creation is idempotent per `File`, removal
  revokes, and `onDestroy` catches a save or a `Row.svelte:98` teardown mid-flight. A dropped and
  re-picked file is a new `File` object and gets a new URL.
- **The blocking `{#each}` keys** (`Edit.svelte:50-52`) — `File` identity is stable for as long as the
  file is held, and a single `change` event cannot produce the same `File` twice.
- **`sorted` is genuinely one copy** — `$lib/picking.ts:16`, imported by `editing.svelte.ts:10` and
  `Capture.svelte:24`; nothing duplicate left in `$lib/attachments.ts`. It also removed the old
  double `client.refuses` call per file.
- **Double `client.close()` on the Raycast success path** (`capture.tsx:118` and `:135`) —
  pre-existing, and `:116-117` explains why the early one is there.
- **The sweep's field walk** (`sweep-held-blobs.ts:27-41`) — correct. It mirrors
  `assets.ts:7-11` exactly, and the five operation kinds with no `envelope` genuinely name no assets.
  A `sending`-state operation's assets are counted as named, which is the safe direction.
- **`pnpm sweep` runs as written** — Node 26 type-strips the file natively; no `tsx` needed.
- **`client.md` left unchanged** — its `detach` sentence and its generic edit/attach prose do cover the
  new behaviour. Decision 5's reading holds.
- **`Row.svelte:98` tearing an edit down outside `leave()`** — leaks nothing now, which is a quiet win
  of the new shape rather than a problem with it.

---

## What I would change before this merges

1. **Finding 1** — `save()` must tell its caller whether it saved, and `answer("save")` must stay put
   when it did not. This is a data-loss path, and it is the only finding here I would block on.
2. **Finding 3** — move `await client.close()` to the top of the Raycast `catch`. One line, restores an
   invariant the code's own comment claims.
3. **Finding 4** — either give `--delete` a grace window, or tell the person in `running.md` not to run
   it while the extension or the tab is live. Deleting a blob a capture is about to name is the same
   class of bug this branch exists to close.
4. **Finding 6** — rename to `reclaim`. The distinction was drawn in the five commits before this
   branch, and overloading it now costs nothing to avoid.
5. **Finding 10, first two bullets** — a test for `#attached()`'s rollback and one for the save-time
   refusal branch. The plan asked for the second and both cover findings 1 and 2.
6. **Finding 12** — add the sweep to `shell.md`'s `Shipped:` entry.

## Worth noting, not blocking

Findings 2 and 5 are real but narrow, and both become cheap once finding 1 forces `save` to have a
result type. Findings 7, 8, 9, 11, 13 are structural and can wait for the next pass over this area.
Findings 14-21 are documentation and comment hygiene; 14 and 15 should travel with whatever fixes
finding 1, since they are the same statement in three places.

---

## Resolution

_2026-10-11, in the same branch._

1. **Fixed.** `Editing.save` answers `Promise<boolean>`, and `answer("save")` resumes the edit and
   skips `then()` where it is `false` (`editing.svelte.ts:131`, `leaving.svelte.ts:82`). Covered by
   two tests: an attach that fails mid-save, and a save the pool would now refuse.
2. **Fixed.** `#attached()` hands back what it freshly held, `client.edit` is awaited inside a try,
   and a rejection lets those bytes go and answers `false`. The edit closes after the operation has
   been recorded rather than before — the one behaviour change this caused is that the existing
   "dropping it saves the item without one" test now waits for the close.
3. **Fixed.** `await client.close()` is the first statement of the Raycast `catch`.
4. **Fixed.** The walk holds back any blob whose directory or bytes were touched inside a
   ten-minute grace window, for the reason `CONTEXT.md` gives, and says how many it held back.
   `docs/running.md` says to have nothing capturing while it runs, the browser having no write time
   for a grace window to read.
5. **Fixed.** The snippet awaits `tx.oncomplete`, rejects on abort, returns the count that
   committed, and `read` rejects on `onerror`.
6. **Fixed.** `scripts/reclaim-held-blobs.ts` and `pnpm reclaim`, in `CONTEXT.md`'s words.
7. **Fixed.** `#rewritten` is read before anything is attached; the tag-only branch attaches
   nothing and returns early.
8. **Declined, with the reason.** The save-time re-sort stays (`#refuses()`), because
   `#attached()`'s per-file refusal would otherwise leave a file the pool will always refuse in the
   list, failing every save until the person finds it. What made it dangerous was finding 1, which
   is fixed; `docs/specs/shell.md` now states both halves.
9. **Partly.** There is no test runner at the repo root, and adding one for a single script is out
   of proportion — so instead the walk refuses to delete anything when it meets an operation kind it
   does not know (`reclaim-held-blobs.ts:126`), which turns the drift this finding describes into a
   stop rather than a silent deletion.
10. **Fixed, except the view.** Added: the rollback, the save-time refusal, object-URL revocation on
    drop, `heldBlobs()` empty *before* the save chord, `capturing`'s detach path, a `partly` tag
    failure, and `captured.kind` asserted in the refusal test. `capture.tsx` still has no test —
    the package has no renderer or `@raycast/api` double, and that is more than this branch should
    grow; it stays worth doing.
11. **Fixed.** `recording` returns `{ store, held }` and `pool()` is what points `heldBlobs` at the
    store it just built. The order comment is gone.
12. **Fixed.** The `Shipped:` entry names the reclaim and links `running.md`.
13. **Fixed.** `hudFor` is gone, for two message helpers the `catch` shares.
14. **Fixed.** `shell.md` says what a save that could not be made does, the leaving dialog included.
15. **Fixed.** `Open.save` says what it answers.
16. **Fixed.** The section opens "From a clone, on the machine you capture from".
17. **Fixed.** It no longer claims parity; it says what it reports.
18. **Fixed.** A file that cannot be parsed is counted and said, not thrown.
19. **Fixed.** `.unreadable` operations are read where they parse, and what could not be read is
    counted in the closing line.
20. **Fixed.** The todo note names `apps/raycast-extension/src/lib/note.ts`.
21. **Fixed.** Every line this branch added to `shell.md` is inside 100 columns, and the count is
    now the four exits named.

### Found while fixing

**`$state` made the identity comparison wrong, not merely fragile.** The Non-issues list cleared
`#rewritten`'s `held !== this.#carries[at]`, but `attachments` is `$state`, so reading an entry
hands back a proxy that never equals the raw object `#carries` holds. Every edit of a capture that
carries an attachment therefore reported itself changed: the leaving dialog asked on every exit, and
a save sent a revision saying nothing new. Nothing caught it because the one test for an unchanged
edit uses items with no attachments. Both `#rewritten` and `drop` now compare by asset and by file
(`same()` in `editing.svelte.ts`), with a test that an untouched edit of a captured picture is not
changed.
