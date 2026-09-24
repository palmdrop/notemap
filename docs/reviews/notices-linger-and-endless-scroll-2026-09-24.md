# Review: Notices that linger, and lists that read on

**Date**: 2026-09-24
**Status**: Open <!-- Open | Partially addressed | Resolved -->
**Scope**: `main...agent/notices-linger-and-endless-scroll` (PR #77, 804c91e6): `apps/ui/src/lib/notices.svelte.ts`, `apps/ui/src/components/notices/Corner.svelte`, `apps/ui/src/components/primitives/alarm/Notice.svelte`, `apps/ui/src/components/primitives/register/More.svelte`, `apps/ui/src/components/{feed,queue}/*.svelte`, `apps/ui/src/lib/{quick,action-log}.ts`, tests, `docs/specs/shell.md`, `docs/todo.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

Both todo items are done, and the approach is right. Dropping `standing` from `marked manual`,
`discarded` and the landed `routed · research` is justified: the spec already gave `unarchive` on
the row and `undo` on the record's own surface, and the old `quick.ts` comment that "neither
decision leaves anything on the item to undo from" contradicted it. Only `routing · research` still
stands, because its `cancel` exists nowhere else. The spec was amended in the same change, and
typecheck, tests and lint are green. The most important finding is that `j` past the last row
does nothing while a page is already being read (1). The auto-read makes that likely, because it
has usually started the read by the time the selection reaches the last row. Second, the log also
reads on as you scroll, and the spec does not say so (4). Third, the "don't retry a failed read"
guard uses the foot's pixel position as a stand-in for whether the read landed. The tests cannot
exercise that position in jsdom (5, 7).

---

## Bugs

### 1. `j` past the last row is a no-op while a read is already in flight

`apps/ui/src/components/feed/Feed.svelte:86`, `apps/ui/src/components/queue/Queue.svelte:159`:
`walk` awaits `client.loadFeed()` and expects the next page to have landed afterwards. But
`loadMore` returns at once when the surface is already loading
(`packages/client/src/surfaces/reads.ts:150`). It does not wait for the read in flight.

```
selection nears the end → foot comes within a screen → More's auto-read starts (loading = true)
→ j on the last row → loadFeed() resolves immediately → rows unchanged
→ next = min(at + 1, rows.length - 1) = at → selection stays put
```

This happens on any slow read, and whenever `j` is held down: key repeat reaches the last row
while the auto-read it triggered is still in flight. The spec's "`j` past the last row held reads
it before stepping into it" does not hold then. The new Feed test starts from a surface with no
read in flight, so it misses this.

Fix: have `walk` wait for the read in flight when there is one. For example, wait on the surface
store until `loading` is false before recomputing `at`, or have `loadMore` return the in-flight
promise instead of returning early. Add a test that starts a read and then presses `j`.

### 2. A notice that replaces one under the pointer leaves anyway

`apps/ui/src/lib/notices.svelte.ts:141` and `Corner.svelte` (`{#each shown as notice (notice.id)}`):
an `only` replacement mints a new id, so it gets a new `Notice` instance with `hovered = false`,
and its timer is already running. The case that matters is someone reaching for `cancel` on
`routing · research` just as it resolves. The notice turns into `routed · research` under their
pointer and is gone four seconds later. `trimmed()` (line 101) can also drop a held confirmation
when a fifth notice arrives. Both break the spec's "No notice leaves while it is under the pointer
or holds focus".

Fix: carry the held state across an `only` replacement (keep a held-ids set in the store, not
in the component), and skip held notices in `trimmed()`. Or narrow the spec's claim.

---

## Design

### 3. The spec now describes the mechanism, not the behaviour

`docs/specs/shell.md` ("The next page is read before it is asked for"): "a page that landed
nothing leaves the foot where it was, and the shell does not ask again from the same place on its
own". That sentence describes how `More.svelte` works, not what a reader sees. The observable rule
is "a failed read is not retried until somebody asks", and the acceptance bullet already says it.
If the mechanism changes (see 5), this paragraph would go stale while the behaviour stayed the
same.

### 4. The log reads on as well, and the spec does not say so

`apps/ui/src/components/log/Log.svelte:84` uses the same `More`, so the log now reads its next
page as the reader scrolls. The Shipped line, the amended paragraph and the acceptance bullet all
say "the feed and the queue". Either say the log does it too, which is probably what you want,
since the log is the one surface where reading far back is ordinary, or give `More` a way to opt
out. As it stands, the code and the spec disagree.

### 5. Using the foot's position to spot a failed read is fragile

`apps/ui/src/components/primitives/register/More.svelte:16,47`: `askedAt` stores the foot's
document-absolute top, and the next auto-read is allowed whenever that top has changed. Anything
else that moves the foot counts as "a page landed":

- a window resize
- a picture above the foot finishing loading
- a `Refused` line appearing at the top of the register after a refused read
- a poll adding rows at the head

After a failed read, each of these causes one more automatic retry. None of them loops, but each
is exactly what the spec says will not happen. The opposite case also exists: a page whose ids
were all already held (`extended` filters them out) moves the cursor on but not the foot. Scrolling
then stops asking, although more pages exist. The signal is already in the store: the surface's
`failure`, or the held count. Pass `failed` (or the length) into `More` and gate on that. It
states the rule directly, and a jsdom test can check it (see 7).

---

## Minor

### 6. `walk` reads the selection after the await, whatever happened in between

`Feed.svelte:84-88`, `Queue.svelte:157-161`: if the person presses `Escape` (deselect) or
clicks another row while the page is read, `at` is recomputed from the new selection and the
step is applied to it. After an `Escape`, `at === -1` and `j` selects row 0, so the page scrolls
back to the top. This is rare, and the fix is cheap: bail out if `selected` changed during the
await.

### 7. The position guard is untested where it matters

`apps/ui/src/components/primitives/register/register.test.ts:105`: jsdom's
`getBoundingClientRect` always returns 0. So "a page that did not move the foot is not asked for
again" passes whatever the guard does, and the positive path is never exercised: a page lands,
the foot is still near, and the component should ask again. That chaining is what fills a tall
screen. If 5 is taken, this goes away. If not, stub `getBoundingClientRect` so the test is real.

### 8. Stubbed globals leak if a test fails

`register.test.ts:102,123,135`: `vi.unstubAllGlobals()` runs at the end of each test body.
When an assertion throws, the `IntersectionObserver` stub stays in place for the rest of the
file. Move it to `afterEach`.

### 9. Holding by focus, and the queue's `j`, have no tests

The Corner test covers pointer hold/release only. Nothing tests `Notice.svelte`'s `focusin` and
`focusout` handling, including the `relatedTarget` check that keeps a notice held when focus moves
between its own buttons. The `walk` change in `Queue.svelte` has no test of its own; only the
Feed's does.

### 10. No plan behind the branch

AGENTS.md says to branch per plan as `agent/<plan-file-stem>`, but there is no
`docs/plans/notices-linger-and-endless-scroll.md`. The work came from `docs/todo.md`, which is
reasonable for its size, but the branch name suggests a plan that does not exist.

---

## Non-issues

- **Clicking `look` focuses the link, so the notice might seem held forever.** It isn't. SvelteKit
  resets focus to the body after navigating, which fires `focusout` and releases the notice.
  `undo` and `dismiss` drop the notice outright.
- **`N more` (folded) offers no `dismiss`.** It is a count of notices, not a notice itself, and
  the standing notices it counts can each be dismissed.
- **`Notice.svelte`'s `hovered`/`focused` are plain `let`, not `$state`.** Nothing renders from
  them, so reactivity would be wasted.
- **Every notice being dismissable adds a button to confirmations.** The spec asks for it, and it
  is the direct answer to "a corner nobody could empty without clicking".
- **Auto-read is off in jsdom.** `IntersectionObserver` is undefined there, so existing surface
  tests are unaffected. This is deliberate, and the `typeof` guard is what makes it so.
- **The new `docs/todo.md` item about the unbounded page.** It is correct that endless scroll
  makes the 500-item cap easy to reach. It belongs in the todo list, not in this PR.

---

## Resolution

Addressed on the same branch.

1. `walk` waits for a read already in flight (`lib/paging.ts`, `readPast`) and keeps reading until
   there is a row past the one it stepped from, the surface is exhausted, or a read fails. Waiting
   once was not enough: a read queued behind the client's drain is not yet `loading` when `j` asks,
   so the second ask returned before the first landed. Tested with a gated second page.
2. Hold is now the corner's rather than a notice's: while the pointer or focus is anywhere in it,
   no timer runs and nothing is trimmed, including a replacement raised into it. A per-notice hold
   could not follow a replacement, which is drawn in a different slot from the notice it replaces.
3. The spec paragraph now says what the reader sees.
4. The log reading on is kept and documented.
5. The foot's position is gone. `More` takes `failed` from the surface's own failure state (the
   log store gained one), and a page that lands with the foot still near reads the next.
6. `walk` gives up the step when the selection changed while it waited.
7. Replaced by tests of `failed` and of the still-near case.
8. The stub is undone in `afterEach`.
9. Tests added for focus holding the corner and for the queue's `j`.
10. No plan, at the developer's word.
