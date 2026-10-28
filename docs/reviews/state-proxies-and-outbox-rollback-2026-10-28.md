# Review: State proxies and outbox rollback

**Date**: 2026-10-28
**Status**: Resolved
**Scope**: `agent/state-proxies-and-outbox-rollback` (1779b482, 43399344) — `packages/client/src/outbox/outbox.ts`, `apps/ui/src/components/{capture/Capture.svelte,item/editing.svelte.ts,primitives/controls/TagSet.svelte}`, `apps/ui/src/testing/pool.ts`
**Spec**: `docs/specs/client.md`

---

## Overall

Two real fixes, both correct and both guarded. Svelte `$state` proxies reached `writeOperation`
and IndexedDB threw `DataCloneError`. The branch snapshots them where they leave state, and the
test pool's store now `structuredClone`s every operation, which catches the next proxy that gets
through. A fresh entry whose write fails is now undone and removed from the outbox. Before this,
the optimistic item stayed in the cache and a pending entry pointed at bytes the caller had
already detached. Typecheck, lint and `pnpm -r --no-sort --silent test` are green. Reverting
each source change one at a time breaks at least one test: the outbox rollback breaks 2, the
`undos.has` guard 1, Capture's snapshot 4, TagSet's 1, `waiting` 2 and `given` 1. The only
open question is #1, which affects the filesystem store only.

---

## Bugs

None.

---

## Design

### 1. The rollback assumes a rejected write left nothing on disk

`outbox.ts:220-229`: the catch treats a rejection from `writeOperation` as "the store never held
it". `filesystem-store.ts:181-186` breaks that assumption. It renames the operation file into
place and only then runs `rm(leasePath, { force: true })`. If that `rm` throws (EIO, EACCES),
the operation is already on disk and the write still rejects:

```
replace() lands the file → rm(lease) throws → enqueue undoes the cache, forgets, rethrows
  → caller detaches the bytes
  → a drain already waiting in send(): stored() settles, leaseOperation finds the file, sends it
  → or a later process reads it back and sends a capture whose blobs are gone
```

This process's own `reconciled()` does not resurrect it, because the id is in `seen`. Another
process or a restart will. It is unlikely, since `rm --force` rarely fails, but the spec
paragraph now promises "Nothing is sent", which is stronger than the store guarantees. Two
options: run a best-effort `store.removeOperation(id)` in the catch before rethrowing, or make
it part of the `ClientStore` contract that a rejected `writeOperation` wrote nothing, and have
the filesystem store live up to it. The second option is the better one.

---

## Minor

### 2. The `undos.has` guard covers more than its comment says

`outbox.ts:223`: "Opposed during the write" is one way `undos` loses the id. `dismiss` (`drop`)
is another: it deletes the undo synchronously and then waits on `stored()`. A dismiss that
arrives during the write would therefore skip the reversal and leave the optimistic effect with
no entry behind it. `StatusLine.svelte:115` only dismisses entries already on screen, so this
should not fire in practice. The guard also depends on microtask order: the enqueue's catch has
to run before a concurrent `send` reaches `forget`. It does today, because `send` still has to
await `leaseOperation` and `readOutbox`, but nothing enforces it.

### 3. No plan, and no `Shipped:` entry

The branch name says `agent/<plan-file-stem>`, but `docs/plans/` has no
`state-proxies-and-outbox-rollback.md`. The spec change is a dated paragraph in the body and a
bumped **Last updated**, with no line under **Shipped**. For a bug fix that may be the intended
weight. Say whether it is.

### 4. Snapshotting at each call site is whack-a-mole

There are three sites today. The `structuredClone` in `testing/pool.ts` is what keeps this
honest, but only for paths a UI test covers. Mutations such as `archive` reasons and plain tag
names pass strings, so nothing else is exposed right now.

---

## Non-issues

- **Snapshot in the UI, not in the client.** `structuredClone` throws on a Proxy too, so the
  client could only defend itself with a JSON round trip. Proxies are a Svelte concern and
  belong at the Svelte boundary.
- **Capture snapshots `given` even though TagSet now snapshots `values`.** `given` is itself
  `$state` in Capture, so the plain object TagSet hands over is proxied again once it is
  assigned. Removing either snapshot fails a test.
- **The opposing enqueue resolves while the one it cancelled rejects.** The net effect on the
  cache is still zero, and the `"is not undone twice"` test pins it down.
- **`mutate` throws before `void drain()`.** There is nothing new to drain, and a drain already
  running handles the entry through the no-lease path.

---

## Resolution

1. **Fixed.** `writeOperation` lets the lease go before the rename, and `replace` removes its
   temporary file when it fails. `ClientStore.writeOperation` now states that it lands whole or
   not at all. Three filesystem tests force `rm` or `rename` to fail by putting a non-empty
   directory where the file goes; all three fail against the old store.
2. **Won't fix.** Overstated on a second look. `dismiss` is only ever called on refused entries
   (`StatusLine.svelte:115`), and a refused entry is never a fresh write. The ordering is held
   by real I/O: `send` awaits `leaseOperation` and `readOutbox` before it can `forget`.
3. **Fixed.** Added a `Shipped:` entry to `docs/specs/client.md`. No retroactive plan was
   written.
4. **Fixed.** `enqueue` copies the operation with `structuredClone` before applying it, so a
   proxy is refused with the cache untouched in every store. The clone wrapper in
   `apps/ui/src/testing/pool.ts` is removed, and dropping a UI snapshot still fails the UI tests.
   Two outbox tests cover it: the held copy, and a refusal before anything is applied.
