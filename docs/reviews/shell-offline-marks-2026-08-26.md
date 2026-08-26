# Review: The shell's offline marks

**Date**: 2026-08-26
**Status**: Resolved
**Scope**: PR #29, `agent/shell-offline-marks` against `main` — `apps/ui`, `packages/client/src/outbox/undrained.ts`, `docs/specs/shell.md`
**Plan**: `docs/plans/shell-offline-marks.md`
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`

---

## Overall

The three marks land as the plan drew them, and the seam is right: the client answers which items
have undrained work, the shell draws it, and a refusal is excluded at the one place that knows what
a refusal is. `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint` and `pnpm test:stack` are
all green here.

One real defect: the surface's "what this client holds" notice is drawn on the **first paint of an
ordinary online load**, because hydration finishes before anything sets `loading`. It flashes on
every page load and then vanishes — the loudest possible way to draw a mark whose whole design brief
was "quiet". Everything else is naming, duplication, and one sentence in `shell.md` this change
made false.

---

## Bugs

### 1. The cached notice flashes on every healthy load

`apps/ui/src/components/queue/Queue.svelte:37`, `apps/ui/src/components/feed/Feed.svelte:25` —
`cached` is `fromCache && !loading`, and neither is yet true of a surface nobody has asked about.
`loadQueue`/`loadFeed` go through `after()`, which waits on hydration before `walk()` sets
`loading: true`, so between the first render and the store coming back both surfaces satisfy
`cached`.

```
render → fromCache=true, loading=false → notice drawn
  → onMount calls loadQueue → awaits ready (IndexedDB reads)
    → walk sets loading=true → notice removed
      → pool answers → rows
```

Confirmed with a scratch test against a healthy online pool: `CACHED` present synchronously after
`render(Queue)`, absent after the queue loads. In a browser the window is a real store read, so it
is at least one painted frame, on every load, online or not.

Fix: the condition wants "a read has been attempted and has not answered", not "no read is in
flight". Either the surface carries that (`ListPage` already distinguishes `answered` from
`loading`; it lacks *attempted*), or the shell holds a local flag set when the mount's load settles.

---

## Design

### 2. `pending` now names two different sets in one package

`packages/client/src/types.ts:123` — `client.pending` is a set of `ItemId`, and it holds every
operation that is not `refused`. `OperationState` (`outbox/operations.ts`) already has a member
called `"pending"`, and it is a *different* set: `client.pending` also contains items whose only
operation is `sending` or `unreachable`. CONTEXT.md's **Pending** entry defines the word as said of
an operation, not of an item, and is not amended by this change.

The internal helper has the honest name — `undrained` — and the exported one does not. Either
export the honest word and let the shell say `pending` where it draws it, or add the item-level
sense to CONTEXT.md so the two readings are on the record. AGENTS.md asks for the second half
either way.

### 3. "A refusal is not waiting" is defined in two places

`packages/client/src/outbox/undrained.ts:14` and `apps/ui/src/lib/waiting.svelte.ts:11` both filter
`state !== "refused"`, for the two marks that the spec now says answer different questions. They
answer different questions from the *same* predicate, and only one of them lives where the outbox's
vocabulary does. A fourth operation state — or a decision that, say, `unreachable` past some age is
not "waiting" either — changes one and not the other.

Fix: the bar's count derives from the client alongside `pending`, so the predicate has one home.

### 4. `cached` and `refusal` are duplicated verbatim across the two surfaces

`Feed.svelte:25-31` and `Queue.svelte:37-44` carry the same two derivations and the same comment in
different words. `$lib/cached.ts` was created by this change and is where the rule about what a
surface says belongs; a `marksFor(list)` there would leave one copy of the "unreachable is the
chrome's, refused is the register's" decision instead of two.

---

## Minor

### 5. `shell.md` still says pending and refused share a shape

`docs/specs/shell.md:516` — "**Pending and refused are drawn differently.** They currently share a
red row and a shape." The "Reachable, pending, refused" section twelve lines up was amended by this
change to say each is now drawn as itself. The Prior decisions bullet is the reasoning, so it keeps
its argument, but the present-tense clause needs the same amendment.

### 6. The cached sentence is not drawn as prose

`apps/ui/src/components/primitives/register/Notice.svelte:21` puts a two-sentence statement in a
bare span, while `Drained.svelte` — the nearest thing to it, a sentence about the surface rather
than a row — draws its through `Prose`. Same kind of content, two typographies.

### 7. A cold surface the pool refused draws two register rows

Both notices render when `fromCache` and a refusal are true together, which is exactly what a
refused read on a surface with no rows produces (`walk` sets `answered: ids.length > 0`). The rail
word — `queue` or `feed` — is then drawn twice, stacked. shell.md reads as ink with "the accent
beside it", one entry.

### 8. A furled rail drops the pending mark

`Pending.svelte` lives in `Rail`, which is `group-data-furled:hidden`. `StateWord` has the same
limitation, so this is consistent — but the stamp gets carried into the body when furled and these
do not, and the acceptance criterion is "a queue row can be told at a glance … to have work not yet
drained".

### 9. The feed's half of phase 2 is untested

`Feed.test.ts` gains the archived-and-pending case only. The cached notice, the refusal, and the
changed `bare` condition are covered in `Queue.test.ts` alone, and the feed is the surface the spec
defines as the pool read *completely* — the one where "this is what the client holds" carries the
most weight.

### 10. `transport.unreachable(false)` on a replaced transport

`apps/ui/src/components/queue/Queue.test.ts:309` — the next line calls `pool(...)`, which builds a
new transport and a new client, so this has no effect on what the second `render` sees. Harmless,
but it reads as setup that matters.

### 11. `Notice`'s `surface` prop is `string`

`Notice.svelte:12` — the client exports the `Surface` union the two call sites pass; typing it as
`string` lets any word into the rail.

### 12. The `Shipped:` trail has one gap the rollout closure asserts is complete

`docs/plans/offline-capture-rollout.md` flips to Done here, and every plan it sequences is Done with
a spec entry to match. `durable-offline-client.md` is `**Status**: Done` with `**Closed**:` empty —
PRs 4, 5 and 6 closed it in three pieces and nobody dated it. One line.

---

## Non-issues

- **An unreachable read draws nothing at all, on any surface** — settled in phase 2 and written into
  the spec: unreachable is stated once, in the chrome, and a surface repeats it nowhere.
- **A row is briefly pending during an ordinary online mutation** — `sending` is in the set by
  design; pending is the ordinary state of a mutation and it heals itself.
- **`pending()` subscribes in `onMount` rather than being read with `$`** — it is the shape
  `waiting()` and `reachable()` already have, including the one-frame gap before mount.
- **Both notices carry `role="status"`** — inherited from the failure row this replaces, not
  introduced here.
- **Phase 3 shipped a test and no code** — the client already resolved locally-held bytes from
  `blobUrls`; the plan records the hold and the test is the honest deliverable.

---

## Resolution

Co-reviewed with the developer, whose own two findings are 13 and 14 below. All fixed on this
branch.

1. **Fixed.** `$lib/surface.svelte.ts` holds the mark, and `read()` wraps the surface's own load so
   `cached` needs a read to have been made and not answered. A surface nobody has asked about is no
   longer one the pool has not answered for. Covered by "says nothing about the cache on a queue the
   pool answers at once" and its feed twin.
2. **Fixed.** The observable is `client.undrained`, and `CONTEXT.md`'s **Pending** entry now carries
   the item-level sense and says it is wider than the operation state of the same name. client.md
   says the same in its outbox section, and the plan lists it as a spec it changed.
3. **Fixed.** `outbox/undrained.ts` exports `waiting()` — the operations that are not refused — and
   `undrained()` is the items those are about. `client.waiting` counts them, and the bar reads that
   rather than filtering the raw list itself.
4. **Fixed.** `surface()` holds `cached` and `refused` for both surfaces. One copy of the reasoning,
   in the helper.
5. **Fixed.** The bullet keeps its argument and says the sharing ended on 2026-08-26.
6. **Fixed.** `Notice` draws its sentence through `Prose`, like `Drained`.
7. **Fixed.** `Notice` takes `said` and `refused` and draws one register entry; the accent sits
   beside the ink instead of under a second rail. Asserted in the refusal test.
8. **Fixed**, and wider than the finding: a furled rail hands the state word to the body along with
   the pending mark and the stamp. Drawing one and hiding the other would have been worse than
   hiding both, and the acceptance criterion names all three. shell.md's furl paragraph says so, and
   the criterion now reads "with the rail furled or not".
9. **Fixed.** Four feed tests: the cold notice, the notice's absence on a healthy load, the refused
   read, and the bare state waiting for the pool to answer.
10. **Fixed.** Line dropped.
11. **Fixed.** `Surface` is exported from `@notemap/client` and `Notice` takes it.
12. **Fixed.** `durable-offline-client.md` is closed 2026-08-26, the date its last pull request
    landed.
13. **Fixed** *(theirs)*: `$lib/cached.ts` did not read as a file of user-facing copy. It is now
    `$lib/said.ts`, holding the shell's sentences — the cached notice, the empty feed, and the
    drained queue, which had been a constant inside its own component.
14. **Fixed** *(theirs)*: the comments. The sentence about a refusal not being waiting was in four
    places and is now one, on the public interface; three test docblocks restating their own test
    names are gone, as is `Notice`'s restatement of its props and `Pending`'s two lines of rationale,
    which is shell.md's to hold.
