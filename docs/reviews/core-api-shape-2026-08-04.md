# Review: Core API shape (PR #2, `agent/core-api-shape`)

**Date**: 2026-08-04
**Status**: Resolved
**Scope**: `packages/core/src/`, `docs/adr/0012`, `docs/adr/0013`, amendments to ADRs 1/5/6/10, `CONTEXT.md`, `docs/specs/core.md`, `docs/specs/mirror.md`, `docs/standards.md`
**Spec**: `docs/specs/core.md`

---

## Overall

The docs half is in good shape: ADRs 12 and 13 are well-argued, the amendments are consistent
with each other, and the glossary discipline in the type names is close to flawless. The type
half is weaker at exactly one seam: the storage port. The `Pool` surface promises behaviours —
suggestion creation, enrichment requests — that the `Command` union cannot express, and the
`Item` type does double duty as read projection and write record, which quietly re-opens the
"superseded is derived, never stored" invariant the spec is explicit about. Those are the
findings to fix before any driver is written against `PoolStore`.

---

## Bugs

### 1. No `Command` can create a suggestion, so the enrichment loop is unclosed

`packages/core/src/ports.ts:87-138` — the `Command` union has `decide-suggestion` but nothing
that appends one. `settle-work` carries `artifacts: readonly Artifact[]` only, and
`WorkOutcome.succeeded` carries a single `JsonObject`. An enrichment whose whole point is to
propose a tag or a destination (`Proposal`, `suggestion.ts:5-7`) has no path into the store.
ADR 1 says every domain operation is one command; this operation has none.

```
enrichment runs → WorkOutcome.succeeded → settle-work { artifacts } → Suggestion never written
```

Fix: `settle-work` (or a sibling command) carries `suggestions: readonly Suggestion[]`.

### 2. `EnrichmentApi.request` has no command either

`packages/core/src/pool.ts:70-73` vs `ports.ts:87-138` — requesting an enrichment by hand is a
state mutation (spec: it resets an abandoned enrichment's attempts, moves it to pending,
enqueues work) and per ADR 12 must also log an action. No `Command` variant enqueues a job or
sets an enrichment state outside `settle-work`, which requires a `lease`. The unclaimed
read-side (`PoolStore`) is marked deliberately partial; the `Command` union is not, and the gap
is on the write side.

Fix: an `enqueue-jobs` / `request-enrichment` command, or extend the partiality comment to the
command union explicitly so this is a stated deferral rather than a hole.

### 3. Capture replay with a matching id but changed content has no defined outcome

`packages/core/src/refusal.ts:34-50`, `capture.ts:21-27` — the spec guarantees "re-reading a
source whose content has changed is refused rather than silently recorded as an edit", and
`source-item-changed` covers the source-identity match. The id match has no counterpart: a
client that replays capture id X with a payload that differs from what the pool holds gets
either `already-captured` (silently dropping the difference) or nothing the types name. The
spec's own model admits this case — a client "may freely amend" before handover, and a crashed
client cannot always know where handover happened.

Fix: either a `capture-id-conflict` refusal symmetric with `source-item-changed`, or a stated
decision that an id match ignores content (and then `already-captured` should say so).

---

## Design

### 4. `Item` is both the read projection and the write record

`packages/core/src/item.ts:35-38`, `ports.ts:88-107` — `supersededBy` is documented as
"derived, never stored", and on the read side it must exist (the feed includes superseded
items). But `append-capture`, `append-revision` and `amend-item` all carry a full `Item`, so
every driver receives a possibly-populated `supersededBy` at write time and nothing but the
comment stops it landing in a column. This is precisely the drift ADR 1 forbids ("no
independent superseded flag that can drift from the link"), reintroduced by type reuse. The
same reuse blurs `modifiedAt`: on content commands core has filled it in (it is on the `Item`
it submits), yet ADR 1 assigns monotonic `modified_at` to the driver, and on `set-tags` /
`set-archive` the command carries no timestamp at all, so the driver must bump it implicitly.
Two commands, two different owners of the same field.

Consequence: the first driver written against this port will store `supersededBy` or assign
`modifiedAt` inconsistently, and both failures pass the type checker.

Fix: a write-side record type (`Omit<Item, "supersededBy" | "modifiedAt">` or a named
`ItemRecord`), and one stated owner for `modifiedAt`.

### 5. Asset reference counts straddle two ports that cannot see each other

`packages/core/src/ports.ts:41-51` (AssetStore) vs `ports.ts:93` (`references` on commands)
and `ports.ts:136` (`release` on `purge-item`) — ADR 13's two-level count ("a blob is freed
when its last asset goes, an asset when its last item goes") is not assigned. Item→asset
references are taken by a `PoolStore` command, but `AssetStore.sweepUnreferenced` requires the
asset store to know which assets are referenced — knowledge only the pool store has. Meanwhile
`purge-item.release` implies core precomputes which assets drop to zero, and `AssetStore.release`
implies the asset store counts them itself. Three overlapping mechanisms, no stated division.

Consequence: unimplementable as declared; the first implementation will pick a split ad hoc and
the other port's methods become dead or double-counting.

Fix: decide where each count lives (plausibly: item→asset in `PoolStore`, asset→blob in
`AssetStore`, with `sweepUnreferenced` fed a referenced-set or moved to core orchestration) and
say so on the port.

### 6. `WorkOutcome` cannot express what `settle-work` needs

`packages/core/src/work.ts:45-52` vs `ports.ts:127-131` — `succeeded` carries one
`JsonObject`, but an `Artifact` also carries `assets: readonly AssetRef[]` and `settle-work`
accepts several artifacts. A worker that produced media, or more than one artifact, has to
smuggle structure through `result` for core to reassemble by convention. And a `mirror` job
(`JobKind`, `work.ts:12`) settling through `settle-work` must supply an `EnrichmentState` it
does not have. `Job` is honestly labelled "deliberately partial"; `WorkOutcome` and
`settle-work` carry no such label but are equally unsettled.

### 7. In-scope surfaces are absent with nothing marking them deferred

Rebuild-from-mirror and the mirror verify/repair operation are both first-slice scope
(`core.md` Scope, `mirror.md`) and appear nowhere — no port reads the mirror, no API triggers
rebuild. Likewise absent: source registration (yet `CaptureRefusal.unknown-source` implies a
registry), the per-source auto-request policy (in scope), payload-type registration
(`PayloadTypeDescriptor` exists but nothing accepts one), an enrichment's declared needs
(ADR 7; `needs-unmet` refusal exists, the declaration doesn't), and `RetryPolicy`
(`work.ts:54-58`), which is exported and referenced by nothing. Each may be a deliberate
deferral, but only `Job` and `PoolStore` say so; the rest read as forgotten.

Fix: a factory/config type sketch, or explicit deferral comments where the wiring surface will
grow.

### 8. `ActionKind` does not cover "every state-mutating action"

`packages/core/src/action-log.ts:4-20` — ADR 12 promises an entry per mutation. Missing at
least: a suggestion being created, an enrichment being requested by hand (spec: "every attempt
is an entry"), unarchive exists but `clear-actions` itself does not, and asset store/sweep
events. Also `Action.subject` is a required `ItemId`, but `clear-actions` without an item has
no item-shaped subject.

---

## Minor

### 9. `itemBySourceIdentity` takes an unbranded `source: string`

`packages/core/src/ports.ts:167` — everything else uses `SourceId`; this is the one place a
raw string slips through, on exactly the lookup where mixing up `source` and `sourceItemId`
would be silent.

### 10. `purge-item` carries one tombstone; purge removes a chain

`packages/core/src/ports.ts:132-137` — the spec purges the entire revision chain, and a
syncing client may hold any revision's id. One `Tombstone` per command means either the driver
cascades and invents tombstones core never saw, or the chain's other revisions purge without
one. Should be `tombstones: readonly Tombstone[]` or one command per chain member.

### 11. `AssetRef.hash` duplicates `Asset.blob` with no comment

`packages/core/src/asset.ts:24-28` — a genuinely surprising field (the ref pins the content
the capture expected, which is what makes `asset-hash-mismatch` checkable at capture time,
presumably) and the one place in the package where a surprising choice has no comment. Either
explain it or drop it.

### 12. Glossary misses concepts the types make load-bearing

`CONTEXT.md` — **Agent**, **Action** (the log entry), and **Job**/**Lease** are all prominent
in the API and absent from the glossary, while the glossary's own entries ("which agent added
it") already use the words. Action in particular collides with Capability's *Avoid: action*
list and deserves a sanctioned definition.

### 13. ADR 5's amended text contradicts core.md's dependency clarification

`docs/adr/0005-typescript-now-rust-later.md` still states "no Node built-ins" as a surviving
rule, while `core.md` (clarified 2026-08-04) says the rule is about reaching the outside
world, `@types/node` is carried, and `fs` is importable-but-avoided. Same rule, two strengths;
the next reader of ADR 5 gets the stale one.

### 14. Editing a superseded item forks the revision chain, and nothing has an opinion

`packages/core/src/refusal.ts:52-58` — `EditRefusal` permits editing an item that already has
a revision, producing two revisions of one original, both in the queue. The spec is silent
too. If forking is intended, fine; if not, `item-superseded` belongs in `EditRefusal`. Worth
deciding now, since `Precondition.is-head` shows the machinery to refuse it already exists.

### 15. Types-only, tests deleted

`packages/core/src/enrichment/state.test.ts` (deleted), `package.json`
(`--passWithNoTests`) — a types-only package with no tests is a defensible call, and the one
deleted function (`isWorkExpected`) was logic that no longer belongs. Raised once: the
declared behaviours above (findings 1, 3, 4) are exactly the kind of thing a type-level
assertion suite (`expect-type`, or compile-only fixtures) could pin today, before any
implementation exists. Consider whether the "no logic" rule should also mean "no type tests".

---

## Non-issues

- **`supersededBy` existing on `Item` at all** — the feed includes superseded items, so the
  read model needs it; only its presence in write commands is a problem (finding 4).
- **`EnrichmentState` coverage** — all seven states in `core.md` are present, `failed` carries
  attempts/failure/next-attempt and `abandoned` drops the schedule; the failed/abandoned split
  and its comment earn their place.
- **`Mutation` bundling command + preconditions + actions** — coherent, not premature fusion:
  ADR 12 requires the log entry in the same atomic command, and ADR 1 requires commands to
  carry preconditions. The bundle is those two decisions made visible.
- **Alias refusal unions** (`TagRefusal = SubjectRefusal`, `AssetRefusal` on `store`) — the
  uniform-Result rule is a recorded decision in core.md and the aliases are commented as such.
- **`AssetStore` containing "store"** — CONTEXT.md's *Avoid: store* applies to naming the
  pool, not to the asset store port.
- **No `head()` on the client-facing API** — deliberate; `EditOutcome`'s comment says the
  caller does not assert headship, core answers.
- **Comment discipline otherwise** — no comment in the package references an ADR or a doc;
  the ones present state decisions, not restatements.
- **`Shipped:` trail** — no plan exists for this work and `core.md` is Draft; nothing to check.

---

## Resolution

Resolved 2026-08-04 in `6f31f3b`, merged as `a884534`. Reconciled with the developer's own
review on PR #2; where the two overlapped they agreed, and the one conflict is noted below.

**Bugs — all fixed.**

1. Suggestions are writable: `WorkOutcome.succeeded` carries `SuggestionDraft[]` alongside
   `ArtifactDraft[]`, and the `Command` union gains `add-suggestions`. The enrichment loop is
   expressible end to end.
2. `request-enrichment` command added, so requesting by hand has a write path that does not
   require a lease.
3. `capture-id-conflict` added, symmetric with `source-item-changed`. `core.md` now states the
   rule for both identities: a resubmission whose content differs is refused, whichever
   identity matched.

**Design — all fixed.**

4. `ItemRecord` splits the write-side record from the read projection. Commands carry
   `ItemRecord`, which has neither `supersededBy` nor `modifiedAt`, so neither can reach a
   driver. `Item` is `ItemRecord` plus those two, and the store owns both.
5. Counting is assigned: the pool store owns item-to-asset and answers `unreferencedAssets`;
   the asset store owns asset-to-blob via `release`. `AssetStore.sweepUnreferenced` is gone —
   it required knowledge that port never had — and `purge-item.release` with it.
6. `settle-work` splits into `settle-enrichment` and `settle-mirror`, so a mirror job no longer
   has to supply an `EnrichmentState` it does not have. `WorkOutcome` carries drafts rather
   than one opaque object.
7. `PoolConfig` gives `RetryPolicy`, `PayloadTypeDescriptor`, `SourceDescriptor` and
   `EnrichmentDescriptor` somewhere to attach. `MaintenanceApi` and `MirrorReader` cover
   rebuild and verify/repair. `EnrichmentDescriptor` is marked deliberately partial, since what
   an enrichment declares as its needs is genuinely unsettled.
8. `ActionKind` gains the missing mutations; `Action.subject` is optional, for entries with no
   item-shaped subject.

**Minor.**

9. Fixed — `itemBySourceIdentity` takes a `SourceId`.
10. Fixed — `purge-item` carries `tombstones`, and `ItemsApi.purge` returns the chain's.
11. Kept, with the comment it was missing. It survived a general comment cull because it states
    something the type cannot.
12. Fixed — `CONTEXT.md` gains **Agent**, **Action**, **Job** and **Lease**. Left open: the
    developer questioned whether *agent* is the right word at all. It is already the word in
    `core.md` and `standards.md`, so it was made official rather than replaced; changing it is
    a rename everywhere and remains that person's call.
13. Fixed — ADR 5's "no Node built-ins" corrected to match `core.md`'s clarification.
14. Decided: **editing a superseded item is refused.** `item-superseded` added to
    `EditRefusal`, and `core.md` states why — allowing it forks the revision chain into two
    live revisions with nothing to say which is current.
15. Not done, deliberately. Type-level assertions are worth having, but they belong with the
    first implementation slice rather than in a commit whose whole premise is that no logic
    ships.

**From the developer's review, in the same commit.** Type files moved under `src/types/`, split
into `domain/` and `api/`; barrels re-export with `export *`; the branded-string helper is
defined once and the JSON types moved out of `ids.ts`; comments cut to those stating something
a type cannot; `.js` import extensions dropped, which required moving the workspace from
`moduleResolution` NodeNext to Bundler. Two of that review's points were answered rather than
acted on: TypeScript ships no JSON value type to import instead, and `Result` has two variants
by design because anything that is not a domain refusal throws.
