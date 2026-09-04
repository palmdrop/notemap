# Review: What went, and what would go

**Date**: 2026-09-04
**Status**: Open <!-- Open | Partially addressed | Resolved -->
**Scope**: `git diff main...HEAD` on `agent/delivery-output-and-preview` (PR #44) — 73 files, +4340/-342
**Plan**: `docs/plans/delivery-output-and-preview.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/mirror.md`, `docs/specs/client.md`, `docs/specs/shell.md`

---

## Overall

The core of this lands well. The blob-before-transaction ordering is right in both callers and
carries a comment that is actually true; `landingFor` cannot un-deliver anything when it fails,
which is the correct shape; the store withholds an output's blob from the sweep's release path and
the partial index it added is genuinely used for that lookup; the pairing `CHECK` on
`output_blob`/`output_mime` really is enforced (I checked both against SQLite rather than reading
the migration's comment). `prepare.ts` is a good extraction — a preview refusing for exactly the
reasons a route refuses falls out of sharing the function rather than being kept in step by hand.
All five specs carry dated `Shipped:` entries covering this work, and `pnpm -r --silent test`,
`pnpm -r typecheck` and `pnpm lint` are green.

Both bugs are in the shell, and both are the same failure: state fetched for one subject drawn
under another. **Finding 2 is the one to fix first** — navigating between two records of the same
item draws the first record's bytes under the second record's "what was sent", with no indication
that they are not its own. `Output.svelte` prefers `text` over `said`, so even a record that kept
no copy shows the previous record's markdown instead of saying so.

Beyond those: the lease margin the delivery runner keeps back for "reporting the outcome" now has
a blob write inside it, and the plan's amended claim that a filesystem preview "reads nothing at
the destination" is not true of the code that shipped.

---

## Bugs

### 1. A preview in flight lands under a decision that has already changed

`apps/ui/src/components/routing/RoutingComposer.svelte:126-151` — the effect that drops a stale
preview is keyed on `decision` only, and `show()` writes `shown` unconditionally when it resolves:

```
preview asked with directory=inbox
  → person types "drafts"        → $effect clears `shown`
  → the inbox request resolves   → show() sets `shown` to the inbox answer
  → the composer draws inbox's markdown under drafts' arguments
```

The comment above the effect claims the guarantee — "changing any part of it drops the answer
rather than leaving a stale one under the line" — and `shell.md` states it as behaviour
("Changing any part of the decision **drops what was shown**"). Neither is enforced against a
request that is already out. The window is a whole round-trip to the destination, which for the
motivating case (a conversion that is a model call) is seconds, and the preview button stays
enabled for the fields while `showing` only disables itself. The composer's own test
("drops what was shown when the decision under it changes") asks for the preview and waits for it
before editing, so it does not reach this.

Fix: capture `decision` when the request goes out and discard the answer if it has moved on — the
same shape `Record.svelte:53-67` already uses for `describe`, which re-checks `asking === target.destination`
before assigning.

### 2. A record's fetched output is never dropped when the record changes

`apps/ui/src/components/record/Record.svelte:94-118` — `output`, `reading` and `unreadable` are
`$state` with no reset keyed on `wanted` (or on `id`). `apps/ui/src/routes/items/[id]/records/[recordId]/+page.svelte`
renders `<Record>` unkeyed, and SvelteKit reuses a page component across a param change, so
navigating from one record to another keeps the first record's bytes in `output`.

`Output.svelte:103-115` makes this worse rather than better: `{#if text !== undefined}` wins over
both `said` and `onread`, so on a record that kept no copy the person sees the *previous* record's
markdown instead of `NO_OUTPUT_KEPT`, and there is no control to correct it.

```
read record A's output      → output = "# A"
navigate to record B        → `record` re-derives, `output` does not
B has no output             → saidAboutOutput = NO_OUTPUT_KEPT, onread = undefined
Output draws `text` = "# A" → A's bytes labelled "what was sent" on B
```

The same field also takes a late write: `read()` resolving after navigation assigns into whatever
record is on screen. This is a routing record — the surface whose whole job is answering "what did
I actually send" — so a wrong answer here is worse than no answer.

Fix: reset `output`/`unreadable` in an effect on `wanted`, and drop a resolved read whose record is
no longer the one being drawn. Alternatively `{#key data.record}` at the page, though that throws
away the destination description too.

---

## Design

### 3. The lease margin now has a blob write inside it

`packages/core/src/pool/work.ts:104-108`, `apps/daemon/src/constants.ts:80`,
`apps/daemon/src/destinations/runner.ts:38-44` — `DELIVERY_REPORT_MARGIN_MS` is documented as
"how much of a lease is kept back for reporting the outcome the attempt produced", and the runner
budgets `leaseForMs - 5s` for the attempt on that basis. `complete()` now reads the adapter's
output stream and writes a blob inside that 5s, before the lease is even checked.

Both kinds that produce an output today hand over an in-memory string, so nothing is close to the
margin. But the margin's justification no longer describes what it covers: the reporting step is
now bounded by the size of whatever a destination decided to hand back, which is exactly the thing
the lazy-opener shape exists to allow being large. Overrunning it costs a delivery that landed and
a record that stays pending and is then abandoned — the output lost and the evidence with it.

Either the constant's comment should say that it now covers storing the output, or the store
should happen before the attempt's lease accounting is spent. Worth a sentence rather than a
rewrite; flagging it because the comment currently claims a budget it does not hold.

### 4. Two kinds already disagree about what a preview of `create-file` over an existing note is

`packages/adapters/destination-fs/src/destination.ts:344-359` vs
`packages/adapters/destination-webdav/src/notes.ts:256-263` — the filesystem kind's `create`
stats the target and throws `Refused` when it is already there, so its preview reports `rejected`.
The webdav kind's create is a conditional `PUT` and never asks, so its preview happily renders the
note and the delivery that follows is refused.

Both are defensible on their own terms and the plan's amendment names the webdav behaviour
deliberately ("for `create-file` is no request at all, its `PUT` being conditional"). But
`shell.md` says a preview that would be refused "is the one case where a preview is worth more
than the route it precedes: the refusal arrives before the decision rather than after it" — and
for the webdav kind it does not arrive. The ADR's "faithfulness is the adapter's discipline" covers
a converter drifting; it does not cover a preview that cannot see a refusal the delivery will make.
Either the spec sentence should be narrowed to the kinds that can answer it, or webdav's preview
should make the one `PROPFIND`/`GET` that would tell it.

---

## Minor

### 5. A truncated preview can end in a replacement character

`apps/daemon/src/routes/routing.ts:162-188` — `take()` cuts at a byte boundary and decodes the
result, so a multi-byte character straddling `MAX_PREVIEW_BYTES` becomes U+FFFD. `truncated: true`
says the text was cut, which mostly covers it; a streaming `TextDecoder` with `{ stream: true }`
would drop the partial sequence instead. Byte accounting is otherwise correct — I traced both the
truncated and untruncated paths, and `joined` is exactly `limit` and exactly `size` respectively.

### 6. The filesystem preview skips the directory check its delivery makes

`packages/adapters/destination-fs/src/destination.ts:110-111` vs `148` — `deliver` goes through
`reachRoot`, which resolves *and* `stat`s for `isDirectory`; `preview` calls `realRootOf` alone.
A root that resolves to a regular file gives `unreachable` from a delivery and `rejected` from a
preview (via `ENOTDIR`, which is not on the `UNREACHABLE` list). Same question, two answers.

### 7. An output's blob outlives the transaction that refused to name it

`packages/core/src/pool/routing/route.ts:65-90` — `landingFor` writes the blob, then the
transaction may refuse `item-purged` or `unknown-destination` and never insert a record.
`work.ts` does the same on `lease-lost` or a record cancelled from under the attempt. The blob is
then named by nothing, and `docs/todo.md` says plainly that nothing reclaims a blob no asset ever
named. This is the shape `assets.ts:14-20` already accepts and documents for uploads, so it is not
new — but that comment is about a *crash*, and this is an ordinary refusal path. Worth a line
somewhere, given the same todo entry now also has to be told not to take outputs.

### 8. A preview whose media type is not text draws an empty box

`apps/daemon/src/routes/routing.ts:144-156` answers `content: { mediaType, truncated: false }` with
no `text`, which `http-v1.md` describes as "answers what it would be and nothing to read".
`RoutingComposer.svelte:329-340` passes `shown.content?.text` (undefined) and `said={nothingShown}`
(empty, since `kind` is `previewed`), so `Output.svelte` draws the heading and nothing else — not
even the media type the daemon went to the trouble of answering. No kind produces a non-text output
today, so it will not fire; it will the first time one does.

### 9. The preview's content read ignores the request's abort signal

`apps/daemon/src/routes/routing.ts:145` — `content.open()` is called with no argument, although
`previewHandler` has `context.req.raw.signal` and passes it to `pool.routing.preview`. A client that
disconnects mid-read leaves the adapter's stream to run to completion.

### 10. The plan's amendment claims a filesystem preview reads nothing, and it reads

`docs/plans/delivery-output-and-preview.md`, "Amended 2026-09-04": *"A preview needs no
reachability for the filesystem kind, which follows from the line above: if the output is the
inserted bytes, converting them reads nothing at the destination."* The shipped preview resolves
the root through `realpath`, `create` stats the target, and `append` reads the whole target file —
because whether it exists is what decides between the whole note and the inserted body. The
integration and full-stack tests both exercise the unreachable case, so the code is behaving as
built; it is the amendment's reasoning that is stale. Nothing in `core.md` or `shell.md` repeats
the claim, which is why this is minor rather than a spec disagreement.

### 11. A failed preview's message survives a successful one

`apps/ui/src/components/routing/RoutingComposer.svelte:143-152` — `show()` sets `said` on error and
never clears it on entry, so an error from one attempt sits beside the controls through the next
successful preview. `send()` clears it at line 232; `show()` should too.

---

## Non-issues

- **`landingFor` running outside the transaction, twice** — deliberate and correct. Reading the
  adapter's stream inside a store transaction would hold the write lock for the length of the read.
  Both call sites carry the reasoning and both are genuinely outside.
- **A failure to store the output not failing the call** — right. The bytes are already at the
  destination, so `outputLost` on the action log is the honest record and the delivery still lands.
- **The `CHECK` added in the same `ALTER TABLE` sequence as the column it names** — verified against
  SQLite: `ADD COLUMN output_mime TEXT CHECK ((output_blob IS NULL) = (output_mime IS NULL))`
  registers on the table and rejects a lone `output_blob`. The migration's comment about ordering
  is accurate.
- **The partial index on `output_blob`** — verified: `SELECT output_blob ... WHERE output_blob = ?`
  plans as `SEARCH ... USING COVERING INDEX routing_records_output`. SQLite's partial-index analysis
  does see that `= ?` implies `IS NOT NULL`.
- **`namedAsOutput` consulted in `deleteAssets` rather than in `unreferencedAssets`** — correct
  placement. The sweep's list is over assets; the withholding belongs where blobs are released.
- **A blob put before the transaction that names it, racing a concurrent sweep** — the same window
  the asset path has had since it was written, and closing it is a change to how blobs are
  reference-counted rather than anything this PR introduced.
- **`followable` allowing only `http:`/`https:`** — the right allowlist for a string that reaches an
  `href`, `rel="noreferrer"` on the anchor, and no kind offers a URL today anyway.
- **The output fetch serving `text/markdown` as `attachment`** — `dispositionFor`'s allowlist has no
  `text/markdown`, so it downloads. Correct, and matches what `http-v1.md` says it does.
- **`POST /v1/items/{id}/route/preview` being a `POST` that writes nothing** — behind
  `authenticate` and `requireJsonBody` like every other `/v1` write, so the CSRF reasoning in
  `security.md` covers it unchanged, and the spec says the "changes nothing" part out loud.
- **The output opener not being re-hashed on the way out** — matches the asset read, and both say so.
- **Every listed spec carrying a dated `Shipped:` entry** — `core.md`, `http-v1.md`, `mirror.md`,
  `client.md` and `shell.md` all have a 2026-09-04 entry covering this work, linking the plan and
  (where it applies) ADR 33.

---

## Resolution

<!--
Add once findings are addressed, and flip **Status** above. One numbered entry per finding,
mirroring its number. Mark each: Fixed / Mitigated / Won't fix (reason).
Until this section exists and **Status** is updated, the findings count as open.
-->
