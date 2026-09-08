# Review: the memos relay, and the payload type collapse

**Date**: 2026-09-08
**Status**: Partially addressed <!-- Open | Partially addressed | Resolved -->
**Scope**: `agent/memos-relay-phase-5` against `main` — 7 commits, phases 1 to 5
**Plan**: `docs/plans/memos-relay.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`, `docs/standards.md`

---

## Overall

The plan landed, whole. Every checked box has code behind it, the `Shipped:` trail is present and
dated on all four specs that carry one, both ADRs argue their case rather than announce it, and
the migration does the unglamorous half — rewriting `image` payloads *and* enqueueing the mirror
writes that rewrite owes. `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint` and
`pnpm test:stack` (65 tests, 15 files) are all green on this branch.

No bugs. What is here is a set of behaviours the relay has that nothing in the repo says it has,
and the most consequential is the first: **a memo's tags reach the pool exactly once, at capture,
and never again** — while `apps/relay-memos/README.md` presents `tags → tags` as an unqualified
row in its mapping table. The rest are smaller: revisions accumulate in the queue, an upstream
edit lands in the feed at poll time rather than at its own, and a pool that is down produces one
log line per memo.

---

## Bugs

None.

---

## Design

### 1. A memo's tags are captured once and never updated

`packages/core/src/pool/capture.ts:212` drops `tags` from `FixedByCapture` deliberately — an item
classified since capture must not read as a conflicting resubmission of itself. Correct for a
client. For a relay it means:

```
poll 1: memo "abc" #quote      → captured, item carries kind/quote
upstream: tag changed to #idea
poll 2: capture "abc"          → payload identical → already-captured
                               → the pool still says kind/quote, forever
```

The edit path does not rescue it either: `EditEnvelope` carries no tags, `amend` takes only a
payload, and `revise` copies `item.tags` (`packages/core/src/pool/edit.ts:116`). So even a memo
whose *content* changed keeps whatever tags it had when it first arrived.

`apps/relay-memos/README.md:27` says `tags → tags, attributed to the source` with no qualifier, and
the plan's phase 5 says "Memos' tags travel with the memo" — a reader will take both to mean the
classification tracks upstream.

Fix: say it, in the README's table and in `relayed.ts`'s doc comment — tags travel *at capture*,
and a re-tagged memo is not a changed memo. Making it actually sync is a bigger question (whose
tags win, when a person has tagged the item in notemap since) and should not be answered here.

### 2. Every upstream edit of a processed item leaves another item in the queue

`packages/relay/src/relay.ts:42` edits `captured.existing`, which is always the item holding the
identity `uid` — the original. So a memo edited three times after delivery:

```
edit A → revision R1 (uid@vA), unprocessed, in the queue
edit B → revision R2 (uid@vB), unprocessed, in the queue — R1 still there
edit C → revision R3 (uid@vC), unprocessed, in the queue — R1 and R2 still there
```

Each is a real item carrying a real capture, so CONTEXT.md's "one item may be revised more than
once, and the revisions are independent of each other" covers it exactly. But the plan and the ADR
both describe the steady state as "two requests every poll forever and never a second revision",
which is true only of a *re-run*, not of a second edit. Someone who edits a delivered memo a few
times will find the queue holding several near-identical versions of it and no note anywhere
saying that is the design.

Fix: a sentence in ADR 39's consequences, beside the "two requests a poll" one.

### 3. A relay's failures are counted per memo, including the ones that are not the memo's

`apps/relay-memos/src/run.ts:64` catches around the whole of `into.relay(...)`, so a pool that
answers `401`, or is not listening at all, produces one `could not be relayed` line and one
`failed` per memo — a library of two thousand memos gives two thousand identical lines and a tally
of `failed 2000`. Nothing distinguishes "this memo is bad" from "the far end is gone", which is
the distinction a person reading the log is actually after.

The recovery is unchanged either way, so this is legibility, not correctness. Cheapest fix: let a
`PoolRefused` with a `401`/`403`, or a `TypeError` from `fetch`, end the scan rather than the memo.

### 4. Nothing agrees on how a slot is named, and slot order is now load-bearing

Both renderers sort attachments by slot string (`apps/daemon/src/mirror/renderers.ts:21`,
`apps/daemon/src/destinations/renderers.ts:23`), and `http-v1.md` promises `assets` "in slot
order, which is the order a rendering draws in". Meanwhile the shell writes `"image"`
(`packages/client/src/capture/envelope.ts:6`), the relay writes `"000"`, `"001"`
(`packages/relay/src/assets.ts:56`), and `tests/seed` writes `"image"`.

Nothing breaks — every producer attaches either one file or a run of padded indices — but the
ordering contract now rests on a convention no type, schema or doc states. A future producer that
names slots `"1"`, `"2"`, …, `"10"` will draw them in the wrong order and every test will pass.

Fix: state the convention where the field is described (`http-v1.md`'s item section), or stop
sorting lexicographically and sort on the payload's stored order.

---

## Minor

### 5. A comment claims a loop guard the code does not have

`apps/relay-memos/src/memos/read.ts:81` — "An empty page ends the scan whatever the token says: a
server that answered the same token forever would otherwise be read forever." The guard below it
only catches the *empty* page; a server answering the same non-empty page under the same
`nextPageToken` is still read forever. AGENTS.md: a comment that claims a guarantee must be one the
code enforces. Either narrow the comment or remember the last token and stop when it repeats.

### 6. An upstream edit lands in the feed at the poll's time, not its own

`packages/core/src/pool/edit.ts:110` — `revise` stamps the revision `ports.clock.now()`, because
`EditEnvelope` has no `capturedAt`. So the relay's care over `capturedAt` (the memo's own creation
time, tested at `tests/full-stack/src/relay-memos.test.ts:104`) applies to the first capture only:
a memo edited months after it was written surfaces at the top of the feed. Core states this
plainly — a revision "mints its own id, its own capture time of now" (`core.md:369`, and again at
`:384`) — so the gap is only in the relay's own documentation, whose mapping table promises
`createTime → capturedAt — never the time the poll ran` without saying that promise covers the
first capture alone.

### 7. A relay cannot carry a UTC offset

`Relayed` (`packages/relay/src/types.ts:18`) has no `utcOffset`, though the envelope has one and
the shell sends it. Memos' `createTime` is RFC3339 and generally arrives as `Z`, so nothing is
lost today; a relay whose upstream does know the local offset has no way to pass it.

### 8. The purge case in phase 3 is asserted by proxy

The plan asked for "a source that captured and had every item purged still answers, or does not —
decide it and assert it either way". It is decided (does not — `openapi.json:3681`,
`http-v1.md`'s sources section), but the test that stands in for it is
`packages/adapters/store-sqlite/src/pool-store.test.ts:1932`, "answers nothing at all for a pool
holding no items". That covers the empty pool, not the purge. Same SQL, so the same answer — but
the assertion the plan asked for is not there.

### 9. `mirror.md` describes behaviour that changed and has no dated entry

The mirror's renderers changed shape and behaviour in phase 2: two renderers became one, and a
non-image attachment is now written as a link rather than as a broken embed. `docs/specs/mirror.md`
got a wording fix at line 60 and no `Shipped:` entry. It is not in the plan's spec list, and
`core.md`'s entry arguably covers it — worth one line either way, or a deliberate "covered by
core.md".

### 10. `note` means two things inside `tests/integration`

`tests/integration/src/fixture.ts:49` declares a payload type `note` whose content schema is
`{ body }` — a fixture predating this branch, and arbitrary by design, since core takes any payload
type. It now collides head-on with the one real payload type, whose content is `{ text }`. Renaming
the fixture's would cost nothing and stop a reader from having to work out which `note` they are
looking at.

---

## Non-issues

- **`packages/relay` has no tests beside it** (`--passWithNoTests`) — deliberate. Phase 4 chose
  `tests/full-stack/src/relay.test.ts` on the grounds that a relay is defined by what it does
  against a real daemon, and a mocked pool would assert the dance against a fiction. Nine cases
  there cover the capture/amend/revise/replay dance and asset derivation.
- **`place()` skips the upload when the pool already holds the asset id**, without comparing
  filename or bytes — correct given the ids are derived from immutable upstream attachment names,
  and *safer* than the alternative: re-uploading a renamed attachment under a used id is
  `409 asset-id-conflict`, which the relay would then have to recover from.
- **The migration enqueues a mirror write for every item in the pool**, not only the `image` ones —
  every item's `payload_type` was rewritten, so every mirror record is stale. The `NOT EXISTS`
  guard skips items that already have unclaimed mirror work.
- **`content-disposition: filename*=UTF-8''…`** from `packages/relay/src/pool/pool.ts:126` matches
  what `packages/client` already sends and what `filenameFrom` parses.
- **`GET /v1/assets/{id}` returns metadata, not bytes** — `assetContentHandler` is the separate
  `/content` route, so `pool.asset()`'s `response.json()` is right.
- **The empty capture is legal in core** — the shell guards at
  `apps/ui/src/components/capture/CaptureRow.svelte:73` and the relay at
  `apps/relay-memos/src/memos/relayed.ts:39`, which is what ADR 38 said would happen.
- **`README.md` carries no mention of the relay** — the plan asked for the roadmap edit to be
  *suggested* rather than made, that file being hand-written.

---

## Resolution

*2026-09-08. Everything but 4 and 7 is closed; both of those are left deliberately and say why.*

1. **Fixed, as documentation.** `apps/relay-memos/README.md` gains a "Tags travel once" paragraph
   and a qualifier in the mapping table; ADR 39 gains the consequence. Making the tags actually
   track upstream is a decision of its own — whose classification wins when a person has tagged
   the item in notemap since — and is not taken here.
2. **Fixed, as documentation.** ADR 39's "two requests a poll" consequence now says plainly that a
   *second* upstream edit is another matter, and that each makes its own independent revision.
   The README says the same in the reader's terms.
3. **Fixed.** `packages/relay` gained `PoolUnreachable` — a transport failure is no longer an
   anonymous `TypeError` — and `notThisItem`, which names the failures that are about the far end:
   never reached, `401`, `403`, `5xx`. `relayEverything` rethrows those instead of counting them
   against the memo in hand, so a pool that is down ends the scan with one line rather than one per
   memo. `main.ts` now prints the whole cause chain, so that line says `ECONNREFUSED` rather than
   stopping at "could not be reached". Tested in `packages/relay/src/pool/pool.test.ts` and
   `apps/relay-memos/src/run.test.ts`.
4. **Fixed, as documentation — the convention, not the mechanism.** `http-v1.md`'s item section now
   states that slots sort as strings, that the payload's array order is not kept, and that a
   capture attaching more than one file names its slots as zero-padded indices. Not enforced: the
   schema would have to refuse a slot name, which would break the shell's single `image` slot for
   no gain, and core holding an opinion about slot names is core holding an opinion about payloads.
   Left open in the sense that nothing checks it.
5. **Fixed.** `read.ts` remembers the tokens it has spent and stops on a repeat; the comment now
   describes what the code does. Tested.
6. **Fixed, as documentation.** The behaviour is core's and core states it; the relay's README now
   says its `capturedAt` promise covers the first capture and that a revision lands at the poll.
7. **Won't fix.** `Relayed` still carries no `utcOffset`. Memos' `createTime` is RFC3339 and
   arrives as `Z`, so there is nothing to pass; adding the field for a relay that does not exist
   yet is a wire field no caller fills. The moment one has an offset to give, this is where it goes.
8. **Fixed.** `pool-store.test.ts` now asserts the purge case directly — a source whose every item
   was deleted stops being answered — beside the empty-pool case that stood in for it.
9. **Fixed.** `mirror.md` gains a dated entry for the renderer collapse and the non-image
   attachment now being linked rather than embedded.
10. **Fixed.** The integration fixture's second payload type is `second`, not `note`, with a
    comment saying what it is for.
