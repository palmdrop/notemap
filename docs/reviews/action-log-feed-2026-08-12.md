# Review: The action log, read end to end

**Date**: 2026-08-12
**Status**: Open
**Scope**: `agent/action-log-feed` against `main` — `b482361..e63250f`, plus the PR #7 review
**Also changed here**: `AGENTS.md`, one line under Code (finding 9)
**Plan**: `docs/plans/action-log-feed.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`

---

## Overall

The slice does what it set out to do, and the part it was most at risk of fudging — moving the
default order out of the driver — is done properly rather than nominally. `PoolReads` takes an
`OrderedPage` whose order is required, `ordered()` settles it at the `Pool` boundary, and the
SQLite `DEFAULT_ORDER` is gone; a second store could not disagree with `core.md` without failing
to compile. The rename left no aliases. The three properties the plan called out as silent when
wrong are each pinned by a test that would actually fail: the log outliving its subject (store and
integration), one position read both ways (store, integration, and the feed's existing pair), and
arrival timing (route test plus `capture.test.ts`). Docs and code agree, and the `Shipped:` trail
is complete — plan is Done, both listed specs carry dated 2026-08-12 entries.

`pnpm -r typecheck`, `pnpm -r test` (151 unit + 49 integration), `pnpm lint` and `pnpm format:check`
are green, and `openapi.test.ts` asserts the checked-in document is the one the app serves.

No correctness bug found. The thing worth acting on is finding 1: the new `(at, id)` index removes
the sort, as its comment claims, but the `OR`-form keyset still cannot seek, so page N of the log
reads N × limit index rows. That is the cost keyset pagination exists to avoid, on the one surface
that grows without bound and has nothing that prunes it. Finding 2 is a test whose name promises
coverage its body does not provide. The rest is small.

Findings 9 and 10 come from the PR review rather than this pass, and both are right. 9 is the
larger of the two: comment density is 17% of the added TypeScript, the same note the last PR ended
on, so the answer is a sweep rather than the two lines it was raised against.

---

## Bugs

None.

---

## Design

### 1. The keyset predicate cannot seek, so the new index only buys the sort

`packages/adapters/store-sqlite/src/pool-store.ts:104-117`, migration
`packages/adapters/store-sqlite/src/migrations.ts:190-199`

`keysetClause` emits `(at < ? OR (at = ? AND id < ?))`. SQLite will not turn that into an index
seek. Against exactly the schema this migration installs:

```
OR form, unfiltered:         SCAN   actions USING COVERING INDEX actions_at
row-value form, unfiltered:  SEARCH actions USING COVERING INDEX actions_at ((at,id)<(?,?))
OR form, filtered:           SEARCH actions USING COVERING INDEX actions_subject (subject=?)
row-value form, filtered:    SEARCH actions USING COVERING INDEX actions_subject (subject=? AND (at,id)<(?,?))
```

The index does half of what the migration says it does: both plans are covering and the sort is
gone. What it does not do is let a read start where the position names.

```
newest-first, page N → scan actions_at backwards from the newest row
                     → discard every row newer than `after` (N × limit of them)
                     → only then does LIMIT fill
```

The filtered form seeks to the subject and then does the same walk inside it. Following `next` to
the end of a log is therefore quadratic in the number of pages.

Fix: row values — `(at, id) < (?, ?)` for descending, `> (?, ?)` for ascending, leaving the
bare-instant branch (`after.id === undefined`) exactly as it is. One change in `keysetClause`.

Pre-existing in the sense that the feed shipped with the same predicate and this plan deliberately
reused the helper rather than copying it — and `items_feed ON items (created_at, id)` means the
feed gets the fix for free. It belongs in this review because this change is what added an index
whose whole justification is how the keyset reads.

### 2. A daemon test asserts something other than its name

`apps/daemon/src/routes/routes.test.ts:471` — "carries the filter into next, so a filtered read
pages as itself". The body captures three items, reads `?limit=1&item=<id>`, asserts the one entry
and `next === undefined`, then reads unfiltered and asserts *that* `next` has no `item`. Nothing in
it observes a filter surviving into `next`.

The gap itself is fine and the plan named it: one entry per item today, so the composed case needs
a second mutation, and it is covered as a unit test over `pageUrl` and across a page boundary in
the store. The problem is the name — the one daemon-level test that reads like it covers the route
end to end is the one that does not, which is how a regression in `actionsHandler`'s `next`
composition would survive a green suite and a reader's glance at the test list.

Either rename it to what it checks (an unfiltered `next` invents no filter), or make it real: the
mirror runner is already in the daemon fixture, and a failed mirror attempt gives one item its
second entry.

### 3. `work-failed` detail restates a type rather than passing it

`packages/core/src/pool/work.ts:100` —
`failure: { code: outcome.detail.code, detail: outcome.detail.detail }`.

`FailureDetail` is `{ code: string; detail: string }` — both required, both JSON. `failure:
outcome.detail` is the same value, typechecks (a type alias gets an implicit index signature, so it
is assignable to `JsonObject`), and does not silently drop a field the day `FailureDetail` grows
one. The nesting that fixed `detail.detail` is right; the field-by-field copy is the part to drop.

### 9. Comment density, again — 17% of the added TypeScript *(from the PR review)*

57 of the 327 non-test TypeScript lines this branch adds are comment lines. `AGENTS.md` says
comments are the exception; the previous PR ended in a −180-line comment sweep and this one
reintroduces the density, which makes it a standard that is not landing rather than three slips.
Both inline notes are right, and both are examples rather than the extent of it:

- `apps/daemon/src/types/index.ts:34` — "What every paginated read takes off the query string, or
  why it was refused", above a union of `{ ok: true, order, limit, after? }` and
  `{ ok: false, refusal }`. The type says both halves.
- `apps/daemon/src/utils/query.ts:7-10` — "refused the four ways all of them refuse", above the
  four returns that refuse.

The same restatement runs through the slice. Each of these says only what the line beneath it says:

- `packages/core/src/pool/actions.ts:5` — "An entry with everything but its identity", above
  `Omit<Action, "id">`.
- `packages/core/src/pool/reads.ts:3` and `:6-9` — both of them; see finding 10.
- `packages/core/src/types/domain/action-log.ts:36-41` — six lines above `{ item?: ItemId }`,
  restating `core.md`.
- `packages/core/src/types/result.ts:21` and `:27-29` — the line after them ("a position belongs to
  no order, so one continues a read in either direction") is a real guarantee and should stay; the
  rest re-argues the rename, which is what the `Shipped:` entry is for.
- `packages/adapters/store-sqlite/src/pool-store.ts:83` — "which way the rows run, and which way a
  position bounds them", above a function returning `{ sql: "ASC" | "DESC", comparison: "<" | ">" }`.
- `apps/daemon/src/routes/definitions.ts:35` — "described once", above the thing described once.
- `apps/daemon/src/schemas/json.ts:3` — enumerates its two callers, which drifts at the third.
- `apps/daemon/src/utils/positions.ts:26-30` — four lines re-deriving `pageUrl`'s parameter list.
- `apps/daemon/public/log.html:160` — "Who did it", above `agentOf`.

**One is worse than noise.** `packages/core/src/pool/actions.ts:9` opens "The one place a mutation
appends to the log." Nothing enforces that — `appendAction` is still on `PoolTx` and any mutation
can call it directly. A comment claiming a guarantee the code does not keep is the case `AGENTS.md`
singles out as worse than none, and it will read as true long after it isn't.

**Four should survive the sweep**, because each says something the code cannot:

1. `apps/daemon/src/routes/actions.ts:15-16` and `pool-store.ts:354-355` — why `item` is not
   validated. An absence is the one thing code cannot state, and this is the absence a reader will
   helpfully repair. But the same rule is now stated five times: those two, the `ActionQuery` doc,
   the OpenAPI description, and `http-v1.md`. Keep the one at the boundary where the check would be
   added; delete the rest.
2. `packages/core/src/pool/actions.ts` — that `at` is the caller's. Delete it and someone tidies
   the signature by reading the clock inside the helper, and every entry lands a moment after the
   change it records, silently. One sentence, not four, and without the false claim above it.
3. `packages/adapters/store-sqlite/src/migrations.ts:191-193` — a migration is history that cannot
   be re-derived from the schema it produced. Keep it, and correct it per finding 1: as written it
   claims the index fixes the read, and the read still scans.
4. `apps/daemon/src/utils/query.ts:30-31` — "Not `Number()`". Pre-existing and only moved here, and
   load-bearing: `Number("")` is `0`, and the comment is what stops the simplification.

The rule as written ("comments are the exception") has now failed twice, which is a sign that a
principle is not enough — a writer needs something applicable in the moment. `AGENTS.md` gains one,
under Code:

> Before writing one, two questions: would a reader ask _why_ here, and can the code itself answer
> it? Write the comment only if the answers are yes and no.

It sorts this slice the way this finding does. `Omit<Action, "id">` prompts no *why*, so its gloss
goes. The missing validation of `item` prompts one the code cannot answer, so one copy stays. `at`
being the caller's prompts one, and answering it in code would mean the signature the comment
exists to defend. The line is a rule change, not a branch change; the sweep it asks for is still
open.

### 10. `pool/reads.ts` is a file for one three-line function *(from the PR review)*

Agreed, and not only on size. `ordered()` and `DEFAULT_ORDER` are twelve lines used by exactly one
file at three call sites. "Keep files small and grouped by concern" is about concerns; a file per
function is the flat directory that rule is against, wearing a folder.

`pool.ts` is the right home rather than merely the convenient one. `ordered()` is applied at
precisely the boundary `pool.ts` *is* — where a caller's request becomes a port call — and "core
resolves the default, the driver never does" is a claim about that boundary. `capture.ts` and
`work.ts` earn their own files by holding logic; a default is not logic.

Keep `DEFAULT_ORDER` a named constant when it moves, so `core.md`'s "newest first by default" has
one greppable counterpart. Drop the comment on it — `= "newest-first"` is not cryptic.

---

## Minor

### 4. An empty log renders inside an 11rem column

`apps/daemon/public/log.html:109` and `:254` — `li` is `display: grid` with
`grid-template-columns: 11rem 1fr`, and `.empty` overrides only padding and `text-align`. The
"nothing has happened yet" text becomes an anonymous grid item in the first column, so it wraps at
11rem and centres within it rather than across the row. It is the first thing a fresh install sees.
`grid-column: 1 / -1`, or `display: block` on `.empty`.

### 5. A failed first load leaves the page with no way to retry

`apps/daemon/public/log.html:251` — `more.hidden = !next` is assigned inside the `try`, after the
fetch. If the first request fails, the error message appears and the button stays hidden; the
`finally` re-enables a button nobody can see. Only a page reload recovers.

### 6. The order button is labelled with the state it is in

`apps/daemon/public/log.html:270` — the button reads "newest first" while the log *is* newest-first,
and clicking it flips to oldest-first. Only `title` says so. A button labelled with the state it is
already in reads as the action it would take. Label it with the destination, or make it a
two-option control.

### 7. The plan's bookkeeping does not match what shipped

`docs/plans/action-log-feed.md`

- Lines 107 and 192, both `git commit`, are unchecked. `b482361` and `4199dd3` are those commits.
- Line 190 is the one unchecked box that represents work not done — and only half of it. The PR
  body is straight about which half: the API was exercised against a running daemon, the page was
  never opened in a browser, and `pnpm dev` is broken on `main` for an unrelated reason (`yaml` is
  CJS, and esbuild's ESM bundle turns its `require("process")` into a throwing shim). None of that
  is in the plan, where the box sits identical to the two stale ones. Findings 4 and 5 are exactly
  what the browser half was for, which is the argument for the box rather than against it.
- Out of scope but worth saying once: nothing in the suite starts `dist/main.js`, so a bundle that
  cannot import is green all the way through `pnpm -r test`. That is why `pnpm dev` could break on
  `main` unnoticed, and it is a gap in what "verification" means here, not in this branch.
- "Unknowns and pending decisions" still lists three open questions the implementation answered:
  `ReadOrder`/`OrderedPage` were kept, `/log` won over `/actions`, and a subject links to the
  filtered log (`/log?item=…`) rather than `/v1/items/:id` — which sidesteps the `404` the plan
  worried about and is the better answer of the two. None of it is written down.

### 8. A garbled sentence in `core.md`'s `Shipped:` entry

`docs/specs/core.md:30-31` — "`FeedOrder`/`FeedPage` become `ReadOrder`, `PageRequest` and
`OrderedPage` now neither belongs to the feed." Two names became three, and the clause does not
parse. These entries are the only history the project keeps.

---

## Non-issues

- **`item` cast straight to `ItemId` in the route** — `apps/daemon/src/routes/actions.ts:14`.
  Deliberate, stated in `http-v1.md` and in a comment: any string is a legal filter, and an
  unmatched one is an empty page.
- **`ActionLogRefusal = never`** — a caller cannot construct a refusal, which is the point. `clear`
  is still `notImplemented`, so nothing depends on the refusal branch yet, and `actions-cleared` is
  already in `ActionKind` for when it lands.
- **`actionSchema.kind` is `z.string()` rather than an enum** — commented, and right: `ActionKind`
  is the list, and a second copy in the daemon is a second list to disagree with the first.
- **Three `CREATE INDEX actions_*` across the migration list** — migration 1 creates them, the
  table rebuild recreates them, this one replaces them. Wasteful on a fresh database, correct on
  every database, and the alternative is editing a migration that has run.
- **`ordered()` never fires on the HTTP path** — `readPageQuery` defaults to `READ_ORDERS[0]`, so
  the daemon always sends an explicit order. Core's default is asserted in the integration suite,
  which is where the guarantee moved.
- **The log is not mirrored** — new in `core.md`, already stated in `mirror.md:76`. They agree.
- **Nothing tests that the page renders entries** — same terms as `/docs`. The tests check what a
  server-side test can: it is served, it loads nothing but the daemon, it is absent from the
  document.
- **`?item=` with an empty value filters on the empty string** — answers an empty page, which is
  what "never validated" means.
