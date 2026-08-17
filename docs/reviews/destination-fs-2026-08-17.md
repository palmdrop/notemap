# Review: The filesystem destination

**Date**: 2026-08-17
**Status**: Resolved
**Scope**: `packages/adapters/destination-fs/`, `apps/daemon/src/{destinations,work,config,routes,errors}/`, `tests/integration/src/destination.test.ts`
**Plan**: `docs/plans/destination-fs.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`

---

## Overall

The slice does what the plan set out: an item routed from `/v1` lands as a file in a folder,
nothing escapes the root, nothing is overwritten, and the loop the mirror runner had is now shared
rather than copied. The containment work is the strongest part — two independent checks, each
justified where it sits, and tested against absolute targets, `..` arrangements and a symlink out.

Two things are wrong rather than debatable. Every asset link this adapter writes breaks the moment a
filename carries a space, which is the common case for a screenshot and is exactly the filename ADR
13 went to trouble to preserve. And the delivery runner calls one pool method outside its `try`, so
a transient store error does not retry the delivery — under ADR 17's evidence rule it **abandons**
it, because the lease expires with nothing reported.

The `Shipped:` trail is intact: the plan is Done and both specs carry dated entries linking back
to it.

---

## Bugs

### 1. Every asset link breaks on a filename with a space or a parenthesis

`packages/adapters/destination-fs/src/renderers.ts:35`,
`apps/daemon/src/destinations/renderers.ts:22` — both build the link by interpolating the asset's
name straight into the destination slot:

```ts
`- [${name}](${name})`   // renderAsJson
`![${name}](${name})`    // renderImage
```

`oneSegment` deliberately keeps spaces (`paths.ts:105` — the allowed set is `\p{L}\p{N} ._-`), so
`Screenshot 2026-08-14 at 11.02.33.png` survives intact and is a legal filename on disk. It is not a
legal CommonMark link destination: an unescaped space ends the destination, so the whole construct
renders as literal text rather than an image. Parentheses in a name break it the same way.

```
uploaded "my photo.png" → written to disk as "my photo.png" → ![my photo.png](my photo.png)
→ renders as the literal string, image never shows
```

Nothing catches it because every test uses `photo.png`, `raw.bin` or `authorized_keys`.

Fix: percent-encode the destination, or wrap it in `<...>` — and add a case with a space to
`destination.test.ts`'s asset group.

### 2. A store error during a deferred delivery abandons it instead of retrying it

`apps/daemon/src/destinations/runner.ts:45` — `pool.routing.deliveryFor` sits outside the `try` that
wraps the attempt:

```ts
const delivery = await pool.routing.deliveryFor(subject.record);   // unguarded
...
try { return asDeliveryWorkOutcome(await adapter.deliver(delivery)); }
```

`Perform` is documented at `work/runner.ts:22` as never throwing — "a throw is a bug, not an
outcome" — and `startRunner` takes it at its word: `runOnce` has no `try`, so a rejection there
unwinds the whole drain.

```
sqlite hiccup in deliveryFor → perform rejects → runOnce rejects → work.complete never called
→ this lease and every other fresh lease in the batch stay held → lease expires with nothing
reported → ADR 17's evidence rule abandons the delivery rather than retrying it
```

The mirror runner does not have this shape: its own pool call (`pool.mirror.recordFor`) is inside
its `try`, and everything else goes through `asWorkOutcome`. This is the one place the extracted
loop's contract is broken by its caller.

Fix: move `deliveryFor` inside the `try`. Guarding `runOnce` against a throwing `perform` as well
would be belt and braces, but the contract is stated clearly enough that honouring it is the
smaller change.

---

## Design

### 3. Nothing bounds a deferred delivery attempt

`apps/daemon/src/destinations/runner.ts:61` — `adapter.deliver(delivery)` is called with no
`AbortSignal`, inside a loop that awaits each lease in turn.

`core.md` is explicit that core imposes no timeout because "the caller bounds it with the
`AbortSignal` that reaches the adapter". The daemon is that caller, and it bounds nothing. A
destination that hangs holds up every other delivery in the runner indefinitely, and the lease
(300 s by default) expires while the attempt is still running — so core abandons a record the
adapter may be halfway through writing.

The filesystem adapter will not hang in practice, which is why this is design rather than a bug.
But the runner is the seam every future adapter passes through, and the first HTTP destination will
hang. `deliver` already accepts a signal; the runner is the only thing that can supply one.

Fix: an `AbortSignal` timed to something under `leaseForMs`, passed through `perform`.

### 4. `ports.ts` never looks at `destination.kind`

`apps/daemon/src/ports.ts:62` — every configured destination becomes a filesystem one:

```ts
const destinations = (options.destinations ?? []).map((destination) =>
  createFilesystemDestination({ id: destination.id, root: destination.root, ... }),
);
```

Total today, because `DestinationConfig["kind"]` has one member. `config/load.ts:47` says an unknown
kind is refused "rather than ignored, because a destination that silently is not there is a decision
that silently goes nowhere" — but the moment a second kind joins that enum, this map hands it the
wrong adapter with no compile error, which is the same failure the comment is arguing against.

Fix: a `switch` on `kind` with an exhaustive default, so adding a kind fails to build.

### 5. Appending replaces a symlink inside the root with a regular file

`packages/adapters/destination-fs/src/atomic.ts:50` — `replaceFile` renames over its target.

A symlink that stays inside the root is legal by `contain`, and `appendToNote` reads through it
happily. The write back then replaces the link itself: the user's real file never receives the
fragment, and the link is gone. `create-file` is safe from this by construction (`link` refuses a
taken name); `append-to-file` is the asymmetric case, and the README's "nothing is overwritten"
does not cover it.

A vault where a daily note is a symlink into a dated folder is not exotic. Fix: resolve the target
through `realpath` before writing back, or refuse a symlinked append target.

### 6. `delivery-outcome-unknown`'s status was decided during the rebase, not by the plan

`apps/daemon/src/errors/refusals.ts:78`, `docs/specs/http-v1.md` — main added
`delivery-outcome-unknown` to `AttemptFailure` after this branch forked, so the plan, the spec
section and the refusal table were all written without it. Reconciling the rebase meant choosing a
status; `422` follows the table's stated rule ("everything else core or the daemon refused") and
sits with the other two `AttemptFailure` codes.

Flagged because it is the one decision here that no plan or ADR made. The wire consequence is worth
a second opinion: `422` puts "the material may already be at the destination" in the same status
class as "the destination declined it", and a client can only tell them apart by `code`. That is
the same argument the spec already makes for `unreachable` sitting beside `rejected-by-destination`,
so it is consistent — but it is consistency by extension rather than by decision.

---

## Minor

### 7. The plan's errno list is narrower than the code's

`packages/adapters/destination-fs/src/destination.ts:49` reports `EACCES`, `EPERM`, `EROFS`,
`ENOSPC` and `EIO` as unreachable. `docs/plans/destination-fs.md:61` says "`ENOENT` on the root,
`EACCES` and `EPERM` therefore report `unreachable`" and names no others.

The widening is right — a full disk and a read-only mount are self-correcting in exactly the way the
decision's asymmetry argument describes — and the adapter README's table already covers both. It is
the plan that is stale, and the plan records its other two deviations under Notes, so this one
should be there too.

### 8. A dead `clock` argument in the integration fixture

`tests/integration/src/destination.test.ts:67,74` — `pooled()` still takes a `clock` and spreads it
into `createFilesystemDestination`, which no longer has that field. TypeScript does not catch it
because a conditional spread skips excess-property checking, and neither caller passes one. Left
over from removing the adapter's clock during the rebase. Delete the parameter.

### 9. `renderText` writes an empty note rather than refusing

`apps/daemon/src/destinations/renderers.ts:10` — `typeof text === "string" ? text : ""`. Core has
already validated the content against the payload type's schema, so this cannot fire today; if it
ever does, the vault gets a file with provenance frontmatter and no content, which is worse than a
refusal a person would see.

### 10. `insertUnder` reads a `#` line inside a code fence as a heading

`packages/adapters/destination-fs/src/sections.ts` — `HEADING` is matched line by line with no fence
tracking, so appending under a heading can insert into the middle of a fenced block, and
`sectionEnd` can stop early on a comment in a shell snippet. Unlikely in a daily note; worth a line
in the README next to the concurrent-editor caveat rather than a parser.

### 11. Exhausting `alternatives` throws a plain `Error`

`packages/adapters/destination-fs/src/assets.ts:57` — 100 taken names throws `Error`, which
`failure()` classifies as `rejected` only because it has no errno. The right outcome, reached by
falling through rather than by saying so; `Refused` is the class that means "the adapter decided".

---

## Non-issues

- **The extracted runner** — `work/runner.ts` is faithful to main's mirror runner line for line
  (claiming, the one-attempt-per-drain guard, the single-flight `drain`/`next` pair, the unref'd
  timer, `stop`). `MirrorRunnerConfig` and `MirrorRunner` are re-exported aliases, so nothing
  downstream of the mirror changed. The plan's third unknown is answered correctly.
- **Assets written before the note exists** — a `link` that loses a race leaves them as debris.
  Documented at `destination.ts:118` and deliberate: debris in exchange for never overwriting.
- **`link` rather than `rename` to create** — deliberate, and recorded in the plan's Notes. It buys
  refuse-if-taken and appears-whole-or-not-at-all from one call.
- **`deliveryFor` answering `undefined` → `succeeded`** — cancelled, purged and already-delivered
  all mean there is nothing left to carry out, so there is nothing to retry.
- **An appended fragment carries no frontmatter** — it is going into somebody else's file, which has
  its own. README says so.
- **`EACCES` reported as unreachable** though a permission bit does not fix itself — the asymmetry
  argument in the plan decides it, and the README repeats it.
- **`renderText` dropping metadata and artifacts** — deliberately lossy; a vault wants the note.
- **`GET /v1/destinations` unpaginated** — spec says so, and says why.

---

## Resolution

Addressed 2026-08-17, together with the GitHub review on
[PR #12](https://github.com/palmdrop/notemap/pull/12).

1. **Fixed.** `linkTo` in `renderers.ts` puts a name that would end a bare destination early into
   the angle-bracket form, and leaves one that would not alone. Narrower than reported: `oneSegment`
   strips parentheses, so only whitespace can reach a link. Tested with a spaced filename.
2. **Fixed.** `deliveryFor` and the adapter lookup moved into `prepare`, which answers a
   **retryable** failure rather than throwing — the evidence rule permits a retry because nothing
   was attempted. Two tests cover it, one of them asserting the drain resolves rather than rejects.
3. **Fixed.** The attempt gets `AbortSignal.timeout` set to the lease less
   `DELIVERY_REPORT_MARGIN_MS`, so the outcome is reported while the lease is still held.
4. **Fixed.** `adapterFor` in `ports.ts` switches on `kind` with no default, so a second kind fails
   to build until it is wired.
5. **Fixed.** `replaceFile` resolves through `realpath` before writing, so an append lands in the
   real file and the link stays a link. `createFile` and `replaceFile` now share `throughTemporary`,
   which is the GitHub review's request in the same place.
6. **Won't fix, deliberately** — `422` stands, and the spec now states the rule it follows. The
   `unreachable` line changed for a different reason: an asynchronous `describe` makes it raisable
   before an attempt, which is written down in `http-v1.md`.
7. **Fixed.** The plan's Notes record the wider errno list.
8. **Fixed.** The `clock` parameter is gone from `pooled()`.
9. **Fixed.** `renderText` throws rather than writing an empty note; a renderer that throws is
   already `rejected`.
10. **Mitigated.** `sections.ts` carries a `TODO` naming the Markdown library that would settle it,
    and the README says so. Not fixed now, at the developer's direction.
11. **Fixed.** `Refused` moved to `errors.ts` and `assets.ts` throws it.

### From the GitHub review

- **Comments** — rationale duplicated in the README or the plan is cut throughout the adapter; what
  is left answers a why the code cannot.
- **`describe` should be async** — done, and it turned out `core.md` had required it since the
  destination section was written. The implementation had contradicted a shipped spec statement,
  which this review missed. Identity moved to `adapter.id`; a destination that cannot describe
  itself is now reported rather than dropped, which the same spec sentence required.
- **`atomic.ts` duplication** — shared through `throughTemporary`, with finding 5.
- **`let rendered` has no type** — the site is gone, restructured into `renderOrRefuse`. The lint
  rule that would forbid it repo-wide is still open; see below.
- **Destinations from the UI** — recorded in `docs/todo.md`.

### Still open

- **A rule for uninitialised `let`.** TypeScript has no flag: `let x;` is an evolving `any` that
  `noImplicitAny` permits by design. `@typescript-eslint/init-declarations` forbids it, but flags
  **28 sites in 20 files** across every package — 19 of them annotated mutable state such as
  `let timer: NodeJS.Timeout | undefined;`, which is not the pattern the review objected to. Not
  enabled, pending a decision.
