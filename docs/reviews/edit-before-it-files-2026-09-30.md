# Review: An edit and a trigger tag no longer race into a revision

**Date**: 2026-09-30
**Status**: Addressed on the branch, 2026-09-30
**Scope**: `git diff main...agent/edit-before-it-files` (PR #86, three commits):
`packages/core/src/pool/{capture,edit}.ts`, `packages/core/src/types/api/ports.ts`,
`packages/adapters/store-sqlite/src/{jobs,pool-store}.ts`, `apps/ui/src/components/item/{editing.svelte.ts,Tags.svelte,Row.svelte}`,
`apps/ui/src/components/primitives/controls/TagSet.svelte`, `apps/ui/src/lib/firing.ts`, tests, docs
**Spec**: `docs/specs/core.md` (Editing), `docs/specs/shell.md` (row edit), `docs/specs/client.md`,
`docs/specs/http-v1.md`, `docs/specs/sync.md`, `docs/adr/0053-a-reservation-nothing-has-tried-does-not-seal-a-capture.md`

---

## Overall

The fix hits the cause. The core change is sound: `sealed()` reads the delivery job inside the
edit's `BEGIN IMMEDIATE` transaction, a claim takes the same lock and commits its lease before any
host reads the item (`deliveryFor` runs after `claim` returns), so claim-vs-edit is correctly
serialised and no queued delivery can land old words while the item says new ones. The `untried`
SQL is correct for every caller that exists today. The capture read-back matches what `tags.ts`
already does. Tests and typecheck are green (`pnpm -r --silent test`, `pnpm typecheck`).

The weak spots are at the edges. The shell's ordering guarantee is weaker than its comment and spec
say (#1). `WorkApi.release` now carries a safety contract that nothing states (#3). ADR 53
misquotes ADR 21 and claims a guarantee the inline route does not have (#4). The OpenAPI text and
two spec sentences still describe the old rule (#5).

---

## Bugs

### 1. A waiting trigger tag is sent after the edit is *attempted*, not after it lands

`apps/ui/src/components/item/editing.svelte.ts:121-124`,
`packages/client/src/outbox/outbox.ts` (`chain`: `previous.then(work, work)`)

The per-item chain orders **attempts**. It does not wait for an earlier operation to succeed. An
edit that throws `Unreachable` (a dropped socket, or any `5xx`, which `http.ts:86` maps to
`Unreachable`) is parked, and the chain sends the tag next anyway. An edit the pool refuses with a
`422` is dropped, and the tag is still sent.

```
save → edit POST fails (5xx / timeout / 422) → chain continues → tag POST succeeds
     → template fires on the pre-edit words
     → edit retried later: inside 15 s → amended (ADR 53 rescues it)
                           after the claim → revision, which is the original bug
```

With a refusal, the tag files words the person just tried to replace, and nothing in the UI links
the two. `shell.md` says "sent only after `save` has sent the edit, so what it files is the saved
words", and the inline comment says "so the pool has the new words before anything files them".
Both overstate what the code does.

Also: if `client.edit` rejects (for example `mutate`'s `await ready` throws), `.then` never runs.
The held tags are then lost without a notice, and the `void` hides the rejection.

Fix: tie the waiting tags to the edit's settlement, not its enqueue (e.g. an outbox hook, or a
per-item "hold behind a parked/refused predecessor" rule). Or narrow the spec and comment to
"enqueued behind", and state the degraded case.

---

## Design

### 2. `sealed` is now its own predicate, with no glossary entry

`docs/specs/core.md:446-453`, `CONTEXT.md:39-44`, `CONTEXT.md:289-294`

Until now "processed" was the seal. core.md now says "revised once it is **sealed**" and "every
processed item is sealed but one", so *sealed* and *untried reservation* are domain terms with
their own meaning. CONTEXT.md defines neither; the new meaning is spread across the Capture and
Processed entries. `client.md:862` already uses "seal" for something else ("Hand-over seals it":
the capture box's local draft), so the collision is now sharper. AGENTS.md: fix the term in
CONTEXT.md rather than let it drift.

### 3. `release` now decides whether an edit may amend, and says nothing about it

`packages/adapters/store-sqlite/src/jobs.ts:110-113, 348-354`, `packages/core/src/types/api/pool.ts:379`,
`packages/core/src/types/api/ports.ts:480`

`untried` treats a released lease as "never claimed", and `jobs.test.ts` asserts that on purpose.
Every current caller is safe:

- `runner.ts:57` releases only jobs it already attempted in this drain, so `attempt ≥ 1`.
- `work.ts:72` releases only leases nobody has performed.
- `deliverWith` in the integration fixture behaves like the runner.

But `WorkApi.release` and `WorkQueue.releaseLease` have no contract, and a host that releases a
delivery lease *after* `deliveryFor` has read the item would reopen the item to amendment for a
delivery that may already have carried the old words. One example is a graceful shutdown that hands
back in-flight work. Nothing in core stops that. Either state the rule on `release` (and in core.md
under work): "a delivery lease may be released only if the item was not read under it". Or make
"claimed" sticky: count any claim of a delivery job as tried, and let the release test assert the
opposite.

### 4. ADR 53 misquotes ADR 21 and claims more than it delivers

`docs/adr/0053-a-reservation-nothing-has-tried-does-not-seal-a-capture.md:97-99, 103`

- Option 2's "Bad" says "ADR 21's objection stands. A retrying delivery has already read the item
  …". That is not ADR 21's objection. ADR 21 rejected freeze-on-delivery because "the bytes that
  land are not the ones the person decided to send". Option 3 accepts exactly that inside the
  window, and the ADR's own **Neutral** consequence says so. The argument holds (inside the window
  the decision is still open), but the options section should quote ADR 21's actual objection and
  answer it there, rather than put a different, easier one in its place.
- Option 3's "Good" says "nothing is amended after any attempt has read it". That is false for the
  inline route (`routing/route.ts:37-120`): `prepare` reads the item and the adapter runs **before**
  any record exists. An edit landing during a composer route's inline attempt therefore amends, and
  the record then lands `delivered` with the old words. This hole predates ADR 21, and this branch
  did not create it. But ADR 53 now claims it is closed. Narrow the sentence to "nothing is amended
  after a *queued* delivery has read it". Consider listing the inline hole under "More information",
  beside the scheduled-delivery revisit.

On the substance, as the PR asked: the narrow option is well argued, and I agree with it. The job
is the right thing to read, not the clock. Splitting editability from queue membership is a real
cost, and the ADR states it honestly.

### 5. The contract text still states the old rule

- `apps/daemon/src/routes/definitions.ts:649` (and the generated `apps/daemon/openapi.json`,
  `packages/client/src/api/generated.d.ts`): "an in-place **amendment** while the item is
  unprocessed, an appended **revision** once it has been routed …". The OpenAPI document is the
  interop surface, and it now disagrees with core.md.
- `docs/specs/http-v1.md:861-863`: "A client can usually predict which it will get, everything the
  seal derives from riding on the item it already holds". No longer true: whether a reservation is
  untried is job state, and the item does not carry it. The same applies to `client.md:873-875`
  ("since `archived`, `routing` and `revisedInto` all ride on the item").
- `docs/specs/core.md:1855`: "Editing a routed item produces a revision …". The new verification
  line three lines above now partly contradicts it. Say "a delivered item", or cross-reference the
  exception.

---

## Minor

### 6. A save with only a waiting tag sends a no-op edit

`apps/ui/src/components/item/editing.svelte.ts:108-124`

`changed` is now true for a waiting tag alone, so the leave dialog's `save` (and `mod+⏎`) send
`client.edit` with the unchanged payload. The pool amends. That appends an `amended` action to the
history for nothing, bumps `contentUpdatedAt` (optimistically too) and costs a mirror write.
Unchanged saves already did this before the branch, but the branch makes it the normal path for
"I only wanted to file it". Skip the edit when text and picture are unchanged, and send the tags
straight away.

### 7. Shell spec on when `revert` shows

`docs/specs/shell.md:697`: "`revert` … while the field holds something the item does not say".
`EditFoot.svelte:28` keys on `editing.changed`, which now includes a waiting tag. Update the
sentence.

### 8. The waiting state is drawn in colour and `title` only

`apps/ui/src/components/primitives/controls/TagSet.svelte:277-285`

The trigger tag's `aria-label` ("route/x, routes to Y") takes over the accessible name and says
nothing about waiting. Whether `title` is announced as a description varies by screen reader, and
it is invisible on touch. Fold the state into the `aria-label` (e.g. "…, files once the edit is
saved"). On `text-inert`: the PR notes it stretches the token's meaning. It does, and a held tag
stays pressable and removable. Acceptable if shell.md's colour section is updated to say grey also
means "not yet sent".

### 9. A resent amendment that crosses a claim becomes a revision

`packages/core/src/pool/edit.ts:30-35, 76-96`

The amend path has no replay detection. An edit whose response was lost and is resent after the
claim goes to `revise`. `itemBySourceIdentity(edit-envelope)` finds nothing, because the amendment
kept the capture's own identity, so a revision of identical words appears in the queue. Before
this branch, reaching that state needed another client's decision. Now a 15 s timer does it. The
chance is low. Worth one line in core.md's replay paragraph.

### 10. Small code notes

- `apps/ui/src/components/item/Tags.svelte:30`: yet another `const NAMESPACE = "route/"`, now the
  sixth in `apps/ui`. `TRIGGER_TAG_NAMESPACE` exists in core. Reuse, or lift one into `$lib/templates`.
- `packages/adapters/store-sqlite/src/jobs.ts:348-354`: `outstanding.all(...).length > 0` pulls rows
  only to count them. One `EXISTS … AND NOT EXISTS …` query does both. The `abandoned_at` clause in
  `tried` cannot matter to the only caller, because an abandoned delivery's record is removed in the
  same transaction.
- `Tags.svelte:61`: if a tag is both carried and waiting (another client added it mid-edit), it is
  drawn grey and `×` only unwaits it, and the carried tag cannot be removed until the edit ends.
  Probably will not happen.

### 11. Test gaps

- `sealed()`'s loop is covered only for one record at a time. Nothing covers an untried
  reservation beside a delivered record, or beside a tried one (both should revise), or beside an
  archive.
- `Queue.test.ts` "an edit let go … and not an ordinary one": the test name says the ordinary tag
  "stays", but only the request count is asserted, not that `reading` is still drawn. Its text
  change also triggers the dialog on its own, so "a waiting tag alone makes leaving ask" (the new
  `changed` clause) is never exercised. The foot's own `revert` (not the dialog's) and `×` on a
  waiting tag are untested.
- The integration amend test does not assert the `amended` action or that the mirror job was
  enqueued for an item out of the queue.
- The daemon's real runner path (`destinations/runner.ts`) is covered only through the
  `deliverWith` fixture that copies it. That is acceptable, but `test:stack` has no trigger-tag edit
  case.

### 12. No plan behind the branch

The branch is `agent/edit-before-it-files`, but `docs/plans/edit-before-it-files.md` does not
exist. AGENTS.md: "Branch per plan". Either the plan was skipped or the branch is misnamed.

---

## Non-issues

- **Claim vs edit serialisation.** Both run under `writeLock` → `BEGIN IMMEDIATE`. The runner reads
  the item via `deliveryFor` only after `claim` has committed its lease. An edit before the claim is
  what the delivery reads. An edit after it sees `lease_id IS NOT NULL` and revises. No delivery
  path reads the item for sending without holding a lease, except the inline route (#4).
- **`untried` SQL.** Trigger-tag jobs start at `attempt: 0`. Inline-route retry jobs start at
  `attempt: 1`, so they are tried from birth. An expired lease nobody reclaimed keeps `lease_id`,
  so it counts as tried. A reclaimed one is abandoned, and its record removed. No job at all reads
  as tried, which is conservative.
- **`unusable` / `delivery-unprepared` count as an attempt.** The next edit revises even though
  nothing left the pool. That is conservative and matches "claimed or attempted".
- **The amended outcome on an item out of the queue.** `amendItem` reads back through `uncommitted.item`,
  so the answer carries `routing`, and the client's `replacing(outcome.item)` keeps the item
  processed. `modified_at` is bumped, and the mirror write is enqueued.
- **`capture.ts:199` `?? item`.** Same pattern as `tags.ts:84`.
- **Preview reads the item without a lease.** A preview is indicative and never binding.
- **`Row.svelte`'s `$effect` closing on `!mayEdit`.** With the tag held, the shell's own trigger
  tag no longer flips `mayEdit` mid-edit and throws the typed words away.
- **Holding every `route/` tag, not only ones a loaded template declares.** Harmless, as the PR
  says.
- **The changed `fires nothing for a revision that carries it over` test.** It now delivers
  first, so the edit still revises under the new rule. Same intent.
- **Comment policy.** The new comments answer a "why" the code cannot. None points at a doc. The
  one overclaim is #1.

---

## Resolution

- **#1** Fixed. `edit` carries `tags`: drawn at once, and queued as ordinary `tag` operations only
  once the edit has landed, to the item amended or the revision made (`Landed.next` in the outbox).
  A refused edit takes them with it; a parked one keeps them waiting. The shell hands its waiting
  tags to `client.edit` rather than tagging after the enqueue.
- **#2** Fixed. CONTEXT.md gains **Sealed**, which names the untried reservation and sets it apart
  from the client's hand-over seal; Capture, Processed and Revision point at it.
- **#3** Fixed by contract: `WorkApi.release` and `WorkQueue.releaseLease` say a delivery lease is
  released only unused, and core.md says so beside the delivery rules.
- **#4** Fixed. ADR 53 quotes ADR 21's objection and answers it, narrows the claim to a queued
  delivery, and records the inline-attempt window as a known limit, also added to core.md.
- **#5** Fixed. The OpenAPI description (regenerated), `http-v1.md`, `client.md` and core.md's
  verification line now state the new rule, and that the outcome cannot be predicted from the item.
- **#6** Fixed. A save whose words are unchanged sends no edit, only its waiting tags.
- **#7** Fixed in shell.md.
- **#8** Fixed. The waiting state is in the tag's accessible name; shell.md says what the grey means
  here.
- **#9** Not changed. A resend crossing a claim makes a revision of identical words; rare, and
  nothing is lost.
- **#10** The namespace is one constant, `$lib/trigger`. `untried` is one query. A tag both carried
  and waiting is left as it is.
- **#11** Added: an untried reservation beside a delivered, a tried and an archived record; the
  `amended` action; a waiting tag alone making leaving ask; saving it with no edit; `×` and the
  foot's `revert` on waiting tags; the ordinary tag staying drawn; the client's ordering, revision
  target, refusal and parking. No `test:stack` case was added.
- **#12** The plan was skipped at the developer's request.

