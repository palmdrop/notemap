# Review: A capture with an attachment, offline

**Date**: 2026-08-26
**Status**: Reconciled — every finding disposed of below
**Scope**: `packages/client/src/{client,types}.ts`, `packages/client/src/{assets,outbox,state,ports,adapters}/`, `apps/ui/src/components/capture/CaptureRow.svelte`, `tests/full-stack/src/`, `docs/`
**Plan**: `docs/plans/durable-offline-client.md` (phases 5 and 7), `docs/plans/offline-capture-rollout.md` (PR 6)
**Spec**: `docs/specs/client.md`, `docs/specs/shell.md`
**PR**: [#28](https://github.com/palmdrop/notemap/pull/28)

---

## Overall

The shape is right and it is the shape the plan asked for. Minting the asset id at the store write
rather than at a round trip is what makes the rest fall out: the envelope is complete before
anything is sent, `uploadAsset` has no reason to exist, and the two-step lives in the one place that
already knows how to retry — the drain. `Sending` as `{ api, bytes }` rather than a second port is
the right size for what two handlers need. The idempotency case is the one that had to be got right
and it is, and its test drives it honestly.

`pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` are green on `bdf8630`.

Three findings I would stop for, all reproduced.

**Finding 1** is the `sweeping` guard. It fixes a real spin, but it fixes it by *dropping* the
return rather than deferring it, and the surface re-read goes with it. A pool that comes back and is
first noticed by a drain's own request leaves every stale surface stale — permanently, because reach
is now true and the probe has stopped, so no second return is coming. That is the bug PR 5a existed
to fix, back for the case where the client's own drain is the thing that notices. `client.md`'s new
paragraph states the opposite — "the work a return would have started is already happening" — and
the drain half is happening while the read half is not.

**Finding 2** is `claimedBy` keying on `kind === "capture"`. The rule it encodes — an `edit` naming
a *capture's* asset releases nothing — is right. But the same test in this PR proves an `edit` may
name bytes no capture ever named, since `edit` now uploads, and those bytes are never released: they
stay in IndexedDB, keep an object URL alive, and are re-uploaded on every subsequent edit of that
item. The spec's "the bytes go when the capture that named them lands" has no clause for them.

**Finding 3** is that `released` was hung off `drop`, which is called inside `send`'s `try`. A store
that cannot forget a blob now turns a capture the pool *accepted* into a `refused` outbox entry, and
dismissing it fails the same way, so it cannot be got rid of.

The rest is small. The naming question the PR raises answers itself once you look at where
"attachment" actually landed — see finding 7.

---

## Bugs

### 1. A return that arrives inside a drain loses the surface re-read for good

`packages/client/src/client.ts:266-276`. The guard is `filter(() => sweeping === 0)`, which discards
the event. But the subscriber does two things — `drain()` *and* `readAfterReturn` — and only the
first is what "is already happening".

```
offline: surfaces hold a failure, reach false, probe on backoff
        → something starts a drain (a mutation, client.drain(), the probe's own drain)
        → the pool is back; the drain's first request answers
        → reach false → true, inside the sweep, filtered out
        → reach stays true, so the probe clears its timer and stops
        → no further return is ever emitted
        → the surfaces keep their failure until the page is reloaded
```

Reproduced against `bdf8630` with a client holding one cached item, one pending `archive` and a
failed `loadQueue`, then made reachable and drained by hand:

```
POST /v1/items/one/archive   sent   (the drain half works)
GET  /v1/queue               never re-read
queue.failure                { said: "the daemon is not reachable", refused: false }
```

Deleting the `filter` line makes the same case pass. `surfaces/return.test.ts`'s cases all go
through the probe with no drain in flight, so none of them see this.

The window is not only the hand-driven case: the probe fires on its own schedule, and any drain
running when it answers swallows the return with it.

Fix: suppress the *drain*, not the return. Latch the event while `sweeping > 0` and run
`readAfterReturn` in `sweep`'s `finally` if reach is still true — the pair of `GET`s cannot restart
a drain, so the spin the guard was written for does not come back. `pool.test.ts`'s new regression
case stays green under that, since after its sweep both surfaces are unpositioned and unfailed and
`readAfterReturn` returns without asking anything.

`docs/specs/client.md:583-588` needs the same correction: "the work a return would have started is
already happening" is true of the drain and false of the read.

### 2. Bytes an `edit` alone names are never released

`packages/client/src/assets/assets.ts:18-20` — `claimedBy` answers by operation kind, so no `edit`
ever releases anything. That is correct for the case the comment names, and wrong for the case this
PR created: `edit` now calls `uploaded`, precisely so a revision may name an asset the pool has
never seen. Attach a file while editing an item and the `edit` operation is the only thing that ever
names that asset.

Reproduced: attach, `edit` an item with the fresh asset in its payload, drain.

```
PUT  /v1/assets/<fresh>      sent
POST /v1/items/one/edit      landed, outbox empty
store.readBlob(<fresh>)      still a File
client.assetContent(<fresh>) still blob:
```

So: the blob stays in IndexedDB for the life of the database, its object URL stays alive for the
life of the tab, and every later edit of that item re-uploads the same bytes for as long as the
store holds them.

Fix: release what an operation names and nothing else still claims, rather than what its kind says
— the assets it names, minus the assets any operation still in the outbox names. That is a scan of a
short list at the one moment an operation leaves, and it makes the capture rule fall out instead of
being asserted.

`docs/specs/client.md:450-453` should say what happens to bytes an `edit` alone named, whichever way
this goes.

### 3. A store that cannot forget a blob turns a landed capture into an undismissable refusal

`packages/client/src/outbox/outbox.ts:70` puts `await deps.released(...)` inside `drop`, and
`outbox.ts:115` calls `drop` inside `send`'s `try`. `released` reaches `store.removeBlob`
(`client.ts:192-197`), which is a real IO call on a real IndexedDB.

```
capture lands → settlement applied → drop() → removeBlob rejects
  → the catch arm treats it as the send failing
  → record({ state: "refused" }) re-adds the entry drop had just removed
  → the person is shown a refusal for a capture the pool accepted
  → dismiss() is drop() again → removeBlob rejects again → the entry cannot leave
```

Reproduced with a store whose `removeBlob` rejects: the outbox ends holding one
`{ state: "refused", failure: "quota" }` entry for a capture the pool answered `201` to, and
`client.dismiss(...)` rejects rather than clearing it.

The `removeOperation` half of this predates the PR; releasing bytes widens it from one write to two,
one of which is the new one.

Fix: releasing is cleanup after the fact, not part of the send. Either move `released` out of `drop`
to after it in each caller, or let `drop` report a failed release through `onError` and swallow it —
an operation that has left the outbox has left it whether or not the bytes went.

---

## Design

### 4. `blobUrls` is state nothing observes, so switching to the pool's copy is not reactive

`packages/client/src/state/state.ts:49` puts the resolved URLs in `ClientState`, but nothing derives
from them. `sameList` (`client.ts:42-52`) compares items by identity and never looks at `blobUrls`,
so a `withBlobUrl(..., undefined)` update recomputes the list, finds it equal, and emits nothing.

On the drain of a picture the order is: settle the item (list emits, `images()` answers `blob:`
because the release has not run yet), then release (URLs change, no emission). The shell is left
holding a revoked `blob:` URL with no signal that the answer has changed. It survives today because
nothing draws a local picture yet — but drawing one is exactly PR 7, and it will land on this.

The client's own answer is right the moment it is asked; the problem is that being asked again is
nobody's job. Either fold the resolved URL into what the surfaces emit, or give the shell something
to subscribe to.

### 5. The rule `claimedBy` exists for has no test

The one behavioural claim in `client.md` about `edit` and assets — "An `edit` naming the same asset
releases nothing" — is not pinned anywhere. `assets.test.ts:221-243` asserts the upload order for an
edit and stops; nothing asserts `store.readBlob` still answers after an edit drains, and nothing
covers a `capture` and an `edit` naming one asset in the same outbox, which is the case the rule was
written to protect.

The rule is the subtle part of finding 2. It should be the test that makes finding 2's fix safe.

### 6. A store read failure inside `uploaded` is a refusal, not an unreachable

`packages/client/src/assets/assets.ts:33` — `await sending.bytes(asset)` runs inside the send, so a
transient IndexedDB error propagates out of `send()` as something that is not `Unreachable`
(`outbox.ts:117`). The operation is marked `refused`, its undo runs, and the person's capture is
taken off the surface for what is a local hiccup that waiting would fix. `CONTEXT.md` is explicit
that refused is "terminal without a person"; a store that could not be read this second is not that.

A missing blob is the quieter half of the same seam: `uploaded` skips it and posts an envelope
naming bytes the pool never received.

---

## Minor

### 7. "Attachment" as a noun is on the Avoid list, and it is now a spec heading

The PR asks whether `attach` violates **Asset**'s _Avoid: attachment, media file_. The verb is
defensible — it names the act, and the thing it produces is still called an asset everywhere in the
code. The noun is the part that actually landed on the list: `docs/specs/client.md:433` is a heading
reading **An attachment made offline**, `client.md:497` says "the attachment landed with it", and
`shell.md`'s amendment is anchored to `#an-attachment-made-offline`.

AGENTS.md says to fix the term in `CONTEXT.md` rather than work around it. So either amend **Asset**
to say the act is `attach` and the noun stays *asset* — and rename the section to something like
"A picture captured with the pool out of reach", which is what the behaviour example already calls
it — or record that the noun is allowed. Leaving the Avoid list saying one thing and a spec heading
saying the other is the state to avoid.

`claimedBy` is a smaller instance: **Asset** says an asset "an item still references cannot be
released", so *references* is the word the domain already has for this.

### 8. `assets.test.ts` does not live beside what it tests

`packages/client/src/assets.test.ts` tests `packages/client/src/assets/assets.ts`, which has its own
folder. Every other module folder keeps its test inside it — `outbox/outbox.test.ts`,
`pool/pool.test.ts`, `surfaces/return.test.ts`. Either move it in or, since what it actually drives
is `createClient`, name it for that.

Its pool double also models something nothing checks: `aPool` answers `200` for a replayed upload
and `201` for a new one, under a comment saying it "answers a replay as a replay", but the client
does not distinguish them and no assertion reads the status.

### 9. Dead branch in `CaptureRow`

`apps/ui/src/components/capture/CaptureRow.svelte:107-110` — with `uploading…` gone, `said` is only
ever assigned in the `catch`, so `said !== ""` implies `bad`. The `bad ? "text-accent" :
"text-ink-muted"` ternary and the `bad` state both have one reachable value now.

### 10. Two `CaptureRow` tests were loosened rather than pinned

`apps/ui/src/components/capture/CaptureRow.test.ts:30-35` replaces a synchronous
`expect(written.value).toBe("")` with a `vi.waitFor`. The PR is straight about why — hydration reads
one more collection, so the apply is a tick later — but the effect is that the tests no longer say
*when* the row clears, only that it eventually does. `capture()` resolving a tick later than it did
is an observable change in the client's contract and no doc mentions it.

### 11. Nothing revokes the object URLs a closed client minted

`client.close()` (`client.ts:399-402`) stops the probe and unsubscribes, and leaves every URL in
`blobUrls` alive. The plan settles revocation as "when the bytes are released", which is right for
the ordinary path; a shell that builds a second client over the same store — which
`tests/full-stack/src/outbox.test.ts:66-79` does, and which is what a reload is in a Tauri shell —
leaks the first client's set. Bounded and inside a session, so: worth a line in the spec rather than
code, unless a shell starts doing this often.

---

## Non-issues

- **`attach` writing bytes with no operation behind them.** The failure mode is real and is named in
  `client.md` rather than solved; the compose row avoids it by doing both in one gesture. The right
  answer waits for a shell that wants a draft.
- **`drop`'s third caller — the opposing-operation path in `enqueue`.** It releases too, which the
  `released` doc comment does not cover. No kind that carries an envelope declares `opposedBy`, so
  it cannot fire today, and if one ever did, releasing bytes for an operation that was reversed
  before it was sent is the right answer anyway.
- **`namedBy` reading `payload.assets` unguarded.** `assets` is required on every payload in
  `generated.d.ts`; a text capture answers `[]`.
- **The full-stack case using `createMemoryStore` for a "reload".** What it is testing is that the
  client holds nothing across the rebuild that the store does not; the durable adapter's own
  round-trips are the contract test's.
- **`pool.test.ts`'s spin regression test.** It pins the request sequence rather than a timer, and
  its mock gives up after thirty answers so a client that spins fails rather than hangs. It stays
  green under finding 1's fix.
- **The plan ticking `sync.md` and `docs/todo.md` in phase 7.** Both landed in PR 5; the checkbox
  means done, not done here, and the `Shipped:` trail is intact — `client.md` and `sync.md` both
  carry a dated entry for what this plan shipped.

---

## Reconciled

Co-reviewed on 2026-08-26. The developer's own review asked for two things, both folded in here:
**unnecessary comments removed**, and a decision on whether the store's blob methods should be
renamed now they carry a `File` — they keep `blob*`, since **Blob** is the domain's word for the
bytes an asset points at and a `File` is one with a name on it.

| # | Finding | Disposition |
|---|---|---|
| 1 | A return inside a drain loses the surface re-read | Fixed. It rides the running drain and reads the surfaces after it; `return.test.ts` covers the case where the drain is what notices. |
| 2 | Bytes an `edit` alone names are never released | Fixed, as the review proposed: `releasedBy` answers with what an operation names less what anything still queued names. |
| 3 | A failing `removeBlob` refuses a landed capture | Fixed. The release reports through `onError` and is swallowed. The `removeOperation` half predates this work and is left alone. |
| 4 | `blobUrls` is state nothing observes | Fixed by ordering rather than by new reactivity: the operation is dropped, and its bytes released, before the settlement is applied, so the emission that draws the pool's answer is the one that stops drawing the released bytes. |
| 5 | The release rule has no test | Fixed. `assets/assets.test.ts` pins `releasedBy` directly, and the edit case asserts the bytes go. |
| 6 | A store read failure becomes a refusal | Fixed. A store that could not answer is `Unreachable`; bytes it hands over and cannot produce are `Unreadable`, which is terminal. |
| 7 | "Attachment" as a noun against the Avoid list | `CONTEXT.md`'s **Asset** amended instead of renaming: the act is *attach*, what a capture carries is an *attachment*, and the asset is never one. |
| 8 | `assets.test.ts` placement | Not moved. It drives `createClient`, which is where `cache`, `editing` and `hydration` suites live; the unit test for `releasedBy` did go beside the module. The pool double's over-claiming comment is fixed. |
| 9 | Dead `bad` branch in `CaptureRow` | Fixed. |
| 10 | Two `CaptureRow` tests loosened | Kept. No spec promised a synchronous clear, and pinning a microtask count pins an implementation detail. |
| 11 | Object URLs a closed client minted | Recorded in `client.md` rather than coded, as the review suggested. |
| 12 | Remove unnecessary comments | Done: the ones that restated their line are gone, the ones answering a *why* are shorter. |
| 13 | Rename the store's blob methods | No. See above. |
| 14 | The bytes are copied when attached | Added. A picker's `File` points at a file on disk and a capture may outlive it; a file that moved now fails in front of the person. |
| 15 | An unreadable body was an eternal retry | Fixed with 6 — the bytes are read rather than streamed, which is what tells a body that cannot be produced from a socket that closed. |
