# Review: A routing summary on every item, and the tags in use

**Date**: 2026-08-20
**Status**: Open
**Scope**: PR #20 — `packages/core/`, `packages/adapters/store-sqlite/`, `apps/daemon/`,
`packages/client/`, `apps/ui/`, `docs/specs/{core,http-v1,client,shell}.md`, `CONTEXT.md`.
Reviewed as `a817ceb..e6e5958`, four commits by layer; those became `966b905` when the branch was
squashed and rebased onto `origin/main` (finding 2), and the review reads against that commit.
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`,
`docs/specs/shell.md`

---

## Overall

Both gaps are closed at the layer that owns them, and the layering is right: the summary is derived
in the store, rides one batched query beside tags and assets, and reaches every read through the
single `toItem` call site, so there is no surface that can accidentally be missed. `GET /v1/tags` is
one `GROUP BY` with the anti-join indexed by `items_revision_of`, and `item_tags`' primary key
`(item_id, name)` is what makes `COUNT(*)` an item count rather than a row count — the query is
correct for a non-obvious reason and nothing says so. Docs landed with code, per commit, per layer;
I checked each of the four. The mirror fix is the right fix at the right layer.

Typecheck, `pnpm -r --silent test`, lint, `format:check` and `pnpm test:stack` are green at the tip,
and again at `966b905` after the rebase.

Two things stopped the loop before the code could be discussed at all. The PR did not merge, and the
branch was built on the shell port as it stood *before* its review — main carried fixes this branch
had never seen. That is now resolved (finding 2). The other stands: the tag reload the PR adds turns
a routine pool hiccup into an unhandled rejection, which I reproduced (finding 1).

On the three questions the PR raises for a reviewer: the summary belongs on `Item` and the ids
belong on the wire — both for reasons the specs half-state and I would state fully (findings 8, 9).
The refresh trigger has a third option neither considered, which is better than both rejected ones
(finding 4).

---

## Bugs

### 1. A failed tag reload is an unhandled rejection

`packages/client/src/client.ts:71`:

```ts
if (operation.kind === "tag") void tags.load();
```

`tags.load()` goes through `answered()`, which throws `Unreachable`. `void` attaches no handler, so
a pool that answered the `POST .../tag` and then failed the `GET /v1/tags` — a restart, a 500, a
dropped connection in the gap between the two — raises `unhandledRejection` in Node and
`window.onunhandledrejection` in a browser. Reproduced against `mockTransport` answering 500 on
`GET /v1/tags` alone:

```
[ Unreachable { message: "the daemon is having trouble; this will be tried again",
                cause: Error { message: "the daemon answered 500" } } ]
```

Nothing in the suite catches it because every mock answers `/v1/tags` happily.

The shell's own two loads already do this correctly — `+layout.svelte` writes
`.catch(() => undefined)` on both. The client, which fires on every drain rather than once a
session, does not. Same clause, same place.

### 2. The PR does not merge, and its base is the pre-review shell port — resolved

`mergeStateStatus: DIRTY`, `mergeable: CONFLICTING`. The branch's parent is `fea611f`; main is
`68ccfe2`, a squash of that same port *plus* the fixes from
`docs/reviews/shell-design-port-2026-08-20.md`. So the branch and main both created about twelve
files in `apps/ui` independently — add/add conflicts on `Feed.test.ts`, `FeedRow.svelte`,
`Tags.svelte`, `TagSet.svelte`, `controls.test.ts`, `Queue.test.ts`, `QueueRow.svelte`,
`lineage.ts`, `routing.ts`, `+layout.svelte`, and on `CONTEXT.md`, `shell.md`, `client.md`.

What is at risk is not the merge but the hand-resolution of it. Main holds, and this branch has
never had:

- `surfaces/reads.ts` — the `held.loading` guard, finding 1 of the previous review. Safe by luck:
  this branch does not touch the file, so a three-way merge keeps main's. A rebase resolved
  carelessly would not.
- `apps/ui/src/styles/{tokens,utilities,base}.css` and the token gate widened to scan them.
- `Drained.svelte`, `Stamp`'s shared snippet, `Alarm`'s `right-20`, `OrderSelector`'s import.

`git merge origin/main` on the branch, then re-run `tokens.test.ts` and `pnpm test:stack`. Not a
rebase: `AGENTS.md` forbids force-pushing a branch with an open PR, and a rebase needs one.

**Resolved 2026-08-20, by rebase rather than merge.** The developer took the force-push
deliberately, on the ground that the PR carried no review and no comments, so a rewrite orphaned
nothing — which is the thing the rule protects. The four layer commits were squashed to `966b905`
first, so the conflicts were resolved once instead of four times, and `--onto origin/main fea611f`
replayed only this branch's own work: a plain rebase would have replayed the whole shell port on
top of the squash of itself.

One conflict, in `QueueRow.svelte`, where main had moved the `edited` line onto the collapsed row
and this branch changed the block below it; main's structure was kept with the summary-or-records
conditional inside it. Everything this finding listed as at risk came through a content merge
untouched — `reads.ts`'s guard, the `styles/` move and its widened token gate, `Drained.svelte`,
`Stamp`, `Alarm`, `OrderSelector`. Typecheck, the suite, lint, `format:check` and `pnpm test:stack`
are green on the rebased tip.

### 3. `untag` never refreshes the tags in use

`client.ts:71` fires on `kind === "tag"` alone. Untag the last item carrying a tag and the pool
stops answering it while the client goes on offering it, until something else triggers a load. The
same reachability argument that justifies reloading after a tag applies verbatim: the pool has just
answered, so it is reachable.

`core.md` says "a tag no item carries does not exist" and `http-v1.md`'s acceptance list says
`GET /v1/tags` "drops one the last item carrying it lost" — the pool does; the client does not.
One character of a union type.

---

## Design

### 4. One request per drained tag operation, where one per drain would do

The PR weighs this against folding counts locally and deriving names from the item cache, and
rejects both. There is a third option it does not consider: fire once when the drain settles rather
than once per operation. A person who tagged eight items on a train and then reconnects sends eight
identical `GET /v1/tags`, seven of them answering a list that the eighth will answer again. The
outbox already knows where a batch ends.

It keeps every property the current trigger has — the pool has just answered, the tag just used is
offered — and drops the only cost. I would not merge the per-operation version.

### 5. `pending` never comes back down in a client's cache

`processed()` adds `+1` to `pending` where the record came back pending, and nothing ever takes it
away. When the host's delivery job lands, the pool's summary becomes `pending: 0`; the held item
does not change, and no surface re-reads it. The feed goes on drawing `· 1 pending` for the rest of
the session, for a delivery that landed.

The fold's contract is stated as "the cached copy is brought up to what a re-read would say"
(`client.md`) — which it is, at the instant of the decision, and then diverges. Either the client
re-reads the item when a route answered `pending` (a poll, or on the next drain), or `client.md`
says plainly that arrival is not observed until a surface is read again. It currently says neither,
and the shell draws the stale half.

### 6. Ids in `to` are right; the raw-UUID fallback is not

Ids are the correct call, and for a reason `http-v1.md` states only as convenience ("a client
resolves the name from `GET /v1/destinations`, which it already reads"). The real argument is the
one `core.md` already makes about deriving rather than storing: a destination's name is mutable pool
state — `CONTEXT.md`, "a name a person can change" — so a name carried in the summary is a second
copy that can disagree with the destination it names. Same reasoning as `supersededBy`. Worth
writing down, because as stated the argument is weaker than the decision.

What is wrong is the fallback. `Routing.svelte` renders `?? id`, so a row reads
`0198f0c2-8a1e-7c3d-... · 1 pending`. That tells a person nothing at all and costs a whole line of a
compact row; "a destination" or a dash says exactly as much and is honest about not knowing. The
feed test `names a destination it has not read by its id` asserts the UUID as intended behaviour,
which locks it in.

This matters more than a first read suggests because of finding 7: the fallback is not a brief
window during startup, it is the whole of every cold start without a pool.

### 7. `inUse` and `destinations` are held in memory only

`persistItems` writes items to the `ClientStore` and nothing else. `state.tags` and
`state.destinations` live for one session.

So three claims are true within a session and false across a cold start:

- `client.md`: a tag field "goes on completing from the last list it read while the pool is
  unreachable".
- `TagsApi`'s doc comment: "a client that cannot reach the pool still completes".
- `ClientState.destinations`: "a settings screen reads while offline" — pre-existing, but this PR
  now leans a feed row on it.

Open the app offline having closed it, and completion offers nothing and every routed row shows a
UUID. Either persist both through `ClientStore` alongside items, or narrow the three claims to the
session. I would persist: the whole stated point of holding the set whole is the unreachable pool,
and the unreachable pool is most often met at startup.

### 8. The summary belongs on `Item` — keep it

Raised for weighing, so: on `Item` is right, and a sibling map in the slice response is not. The
summary rides five answers that are not slices — `GET /v1/items/{id}`, the capture outcome, the edit
outcome, and both routing answers — and the client folds into exactly those. A sibling map would
need a second shape for the singular reads or a second read to fill them. One field, one code path,
one place in the codec that has to drop it.

---

## Comments and truth

### 9. `mirror.ts:17` claims what this PR disproved

```ts
/**
 * An `ItemRecord` rather than an `Item`, so derived state has no way in: a
 * mirrored `supersededBy` could disagree with the chain it was rebuilt from.
 */
```

Structural assignability is precisely how the routing summary got in. The comment is not merely
stale — it is the comment that made the leak plausible, and it is untouched in the change that
found it. `AGENTS.md`: a comment claiming a guarantee must be one the code enforces.

### 10. `canonicalItem`'s comment is one list short

"Named here exactly as the codec's reader names them, so a durable field missing from either list
fails the round trip rather than going quietly."

For a **required** field the compiler catches it at the return type, not the round trip. For an
**optional** one nothing fails unless `arbitraries.ts` also generates it — three lists, not two. As
written it promises a guard that only holds for two thirds of the cases.

The hand-written allowlist itself is defensible: it fails closed. If you would rather not carry two
lists at all, the denylist is compile-enforced without duplicating the durable one:

```ts
type Derived = {
  readonly modifiedAt: Timestamp;
  readonly supersededBy?: ItemId;
  readonly routing?: RoutingSummary;
};
export type Item = ItemRecord & Derived;

const DERIVED = { modifiedAt: true, supersededBy: true, routing: true } satisfies Record<
  keyof Derived,
  true
>;
```

Adding a field to `Derived` without listing it is then a type error, and `canonicalItem` strips by
`Object.keys(DERIVED)`. Either shape is fine; the comment has to change under both.

### 11. A schema comment asserting what the schema does not check

`apps/daemon/src/schemas/item.ts` — `/** Deliveries that have not landed. Never more than
`records`. */`. The zod object accepts `{ records: 0, pending: 9 }`. A `.refine` makes it true;
otherwise the sentence should go.

### 12. `+layout.svelte`'s four-line comment restates its three lines of code

"Two pool-wide sets every surface reads from: the destination names a routed row says, and what a
tag field completes from" — the two `load()` calls say that. The only half a reader would ask *why*
about is the swallowed rejection, which is one clause.

---

## Wire surface and glossary

### 13. `lastUsedAt` has no consumer, no glossary entry, and a third name

Nothing reads it. Ordering is count then name; the UI takes only `name`; the client caches it
untouched. `CONTEXT.md`'s **Tags in use** defines the tag and the count and says nothing about a
time, so a spec-driven project has a wire field no glossary term covers.

It is also the third word for one thing: the column is `added_at`, `core.md` and `http-v1.md` both
say "last **added**", the field says `lastUsedAt`. `AGENTS.md` says fix the term in `CONTEXT.md`
rather than inventing a synonym.

Drop it, or use it — recency is a better tiebreak than alphabetical for tags at equal counts, and
that is a real improvement to completion — and then name it `lastAddedAt` and add the clause to
`CONTEXT.md`.

### 14. `shell.md` and `client.md` disagree on how often the list is read

`shell.md`: "read once from `GET /v1/tags` and filtered locally". `client.md`: "read again once a
`tag` operation reaches the pool". The code matches `client.md`.

### 15. `/v1/tags` rests on "the set is small" with nothing holding it there

The route is unpaginated by design and the reasoning is sound for the pools this project has. But
the assumption is stated in three docs and enforced nowhere: a pool with 50,000 distinct tags
answers all of them on every reconnect, and there is no narrowing path to fall back to. Worth one
line in `http-v1.md` saying what happens if the assumption stops holding — a `prefix` parameter is
still addable, since nothing about the current shape forecloses it.

---

## Tests

### 16. The optimistic fold is tested only on an item that has been nowhere

`client.test.ts` — one record folded onto no summary. Untested: a second record onto a held summary,
the same destination twice, `to`'s ordering, and the pending count crossing more than one record.
The PR body names this as the drift it most wants an eye on, and the test does not reach it.

`summarise` is exported and is exactly the oracle: a property that
`summarise(records) ≡ records.reduce(fold, undefined)` closes the whole class in a few lines and
would catch any future divergence between the two implementations of the same summary.

### 17. The tie-break the specs promise is untested

"Most used first, **then by name**" is in `core.md`, `http-v1.md` and `PoolReads.tagsInUse`'s
comment. Every test has distinct counts, so the `name ASC` half is unexercised. One test with two
tags at one item each.

### 18. Nothing tests the wiring, only the ends

`controls.test.ts` passes `offered` by hand; `Tags.svelte` computing it from `client.tags.inUse` is
untested, and so is the `onMount` that fills the set at all. Delete either and the primitive test
still passes.

### 19. The mirror arbitrary generates summaries the pool cannot produce

`pending` is drawn independently of `records` and `to` independently of both, so
`{ records: 1, pending: 3, to: [] }` is in the space. Harmless for a property that only proves the
field is dropped, but it is not the pool's shape, and it will be wrong the moment the property grows
into anything about the summary's content. `branded<never>()` for the destination is odd beside
`branded()` everywhere else in the file.

### 20. A dynamic import inside a test, beside the static one

`Feed.test.ts` — `const app = await import("../../testing/pool")` for `client`, while the same module
is imported at the top for `routeOf`, `anItem`, `pool`, `json`. If that is working around mock
hoisting, it is exactly the surprise that earns a comment. Otherwise it should join the import
block.

### 21. Two test names missing a word

"goes again when the one reservation is cancelled" (`routing.test.ts`), "goes again when a cancelled
reservation is removed" (`pool-store.test.ts`). Both mean "goes away again".

---

## Not findings, recorded so they are not re-litigated

- Docs are not retrofitted. Checked commit by commit as reviewed, before the squash: `CONTEXT.md` +
  `core.md` in `a817ceb`, `http-v1.md` in `ecd36cc`, `client.md` in `d1250ba`, `shell.md` in
  `e6e5958` — each with the code it describes. `966b905` carries all four together.
- `canonicalItem`'s nine fields match `readItem`'s nine exactly. Checked field by field.
- `COUNT(*)` over `item_tags` is an item count because the primary key is `(item_id, name)`, and the
  `NOT EXISTS` anti-join rides `items_revision_of`. Both correct, neither obvious.
- The store's `to` ordering (`ORDER BY at, id`, first occurrence wins) and the client's
  (`targets` appends the unseen) agree, which is what makes the fold match a re-read.
- `{ values: [...] }` matches every other unpaginated list in `apps/daemon/src/schemas/`.
- `state IN ('pending','delivered')` is the whole of the column's domain, so `ItemRoutingRow`'s
  union is exhaustive rather than optimistic.
