# Memos reaches the pool by itself

**Date**: 2026-09-07
**Status**: In progress <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`, `docs/standards.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> A memo written in Memos appears in the queue without anyone touching notemap — with its
> pictures, at its own capture time, carrying the tags it already had — and a memo edited
> afterwards amends or revises the item it became. The program that does this holds no state:
> it re-reads everything every poll, and the pool's own dedup is what makes that harmless.

Designed 2026-09-07 in a grilling session. Two decisions carry the rest.

A **relay** is a program *outside* notemap that reads someone else's system and feeds the pool
over `/v1`. It is deliberately not an **adapter**: destinations are in-process because core owns
the decision, the durable record, retry and leases ([ADR 8](../adr/0008-adapters-are-in-process-and-wired-by-the-host.md)),
and intake owns none of that. The recovery strategy for a failed poll is to poll again, so a
relay needs no job, no lease and no outbox — and keeping it outside is what stops `/v1` from
growing a privileged intake door that the "bus other apps hook into"
([standards.md](../standards.md#conformance)) does not have.

The **payload types collapse into one**, because the edit route refuses a type change with
`422 payload-type-changed`. A memo whose type was derived from its current contents — `text` with
prose, `image` without — would become permanently unsyncable the moment someone added a picture to
a note or deleted the last picture from one. One memo must map to one type for life, and the type
that fits a memo is prose with any number of attachments.

The collapse is worth doing on its own terms rather than for the relay's convenience. `image` was
minted in `config.example.toml` and three renderers and never reached
[standards.md](../standards.md#payload-types), whose payload table has no row for it; the
distinction it draws is already carried where CONTEXT.md says it belongs, as the two **sources**
`web-manual` and `web-image`; and `requiredSlots` exists for `image` alone.

---

**Out of this slice, deliberately.** Push: Memos can call a webhook, and that webhook would land on
the **relay**, which then polls at once — it is latency, the reconciling scan has to exist either
way, and it reopens nothing. Authorization: a relay carries an access token that reaches the whole
pool, which is the gap [security.md](../specs/security.md) already parks and this plan does not
reopen. An are.na relay: `packages/relay` is built here with one caller, and the second caller is
what will tell us whether its seam is in the right place.

---

## Tasks

### Phase 1 — An item answers its assets

Depends on nothing. Purely additive: every read that answers items carries more, and nothing
reads it yet. Safe to land and stop.

- [x] Create branch `agent/memos-relay`
- [x] An `Item`'s payload carries `AssetRef = { slot, asset }` and nothing else, so a client cannot
      tell which of an item's attachments is a picture without a read per attachment. Every read
      that answers items grows a resolved asset list — the filename, media type and size the
      `Asset` row already holds — **derived at read time and never stored**, exactly as the routing
      summary is ([http-v1.md](../specs/http-v1.md#items)). The payload's own `assets` are
      untouched, so nothing about what the mirror writes changes
- [x] The shape follows the routing summary's rules: present on the item route, the feed, the
      queue, the archive, a capture outcome and an edit outcome; **absent where the payload
      references none**, rather than present and empty
- [x] Core answers it from the same transaction that reads the item, so an asset swept between two
      reads cannot make a row describe attachments that have gone
- [x] `client.md`: the cache keeps what an item answers, so this is more per cached item and the
      500-item history cap now covers slightly more. Say so where the cache's contents are described
- [x] Tests: an item with two attachments answers both with their media types; an item with none
      omits the field; the feed answers it per row without a read per attachment
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, and `pnpm test:stack` —
      the wire shape changes, which is what that suite is for
- [x] `git commit`

### Phase 2 — One payload type

Depends on phase 1: the renderers and the shell stop keying on the payload type and start keying
on each asset's media type, which is only possible once the media type is there. This phase is
atomic — capture breaks if the config drops `image` while the client still mints it — so it lands
whole or not at all.

- [x] `text` and `image` become **`note`**: prose at `content.text`, **optional**, no `minLength`;
      any number of attachments. `config.example.toml` and `docker/compose/config.toml` both
- [x] `PayloadTypeDescriptor.requiredSlots` and the `missing-asset-slot` refusal are removed, in
      core and from `http-v1.md`'s error table. Its only user was `image`, and by the rule below no
      future type wants it. An empty capture — no prose, no attachment — becomes legal in core; the
      shell and each relay guard their own input, which is what core being a primitive API means
- [x] The four places that hardcode the two names, all of which stop naming a payload type at all:
      `client/src/capture/envelope.ts` builds the envelope, `client/src/client.ts:464` decides what
      is a picture, `daemon/src/mirror/renderers.ts:51` and `daemon/src/destinations/renderers.ts:43`
      render. A `DeliveredAsset` already carries the whole `Asset`, so both renderers can ask
- [x] A migration in `store-sqlite/src/migrations.ts` rewrites existing `image` payloads to `note`
      and moves `caption` to `text`. It **also inserts the mirror-write jobs it makes owed**: the
      mirror is written by a job and never by a store write, so a payload rewritten underneath it
      leaves the copy describing items that no longer exist that way, and `verify` would report
      drift on every one
- [x] The shell keeps **two capture sources**, `web-manual` and `web-image`, though both now produce
      `note`. That distinction is what CONTEXT.md says a source is for — "one page may stamp two
      sources" — and it is not tidied away with the payload types
- [x] `CONTEXT.md`: **Payload type** gains the rule that a second type exists **only when `content`
      needs a different schema**. `link` qualifies, carrying a `{ url }` nothing else validates;
      `table` qualifies; **voice does not** — a recording's audio is an **asset** and its transcript
      an **artifact**, so a `voice` type would have `note`'s schema under another name and
      `checkPayload` could not tell them apart. Auto-transcription already keys on the **source**,
      via `autoRequest`, not on a payload type
- [x] `CONTEXT.md`'s **Payload type** entry names `note` and must say plainly that **Item**'s
      avoid-list still stands: `note` names a payload's shape and is still the wrong word for an
      item. Without that sentence the glossary contradicts itself on one page
- [x] `standards.md`'s payload table: the `text` row becomes `note` and says it carries attachments.
      This closes an existing disagreement rather than opening one — `image` was never in that table
- [x] `core.md` and `shell.md` follow: what a capture may hold, and what the capture surface offers
- [x] ADR: **text and image collapse into one payload type**, recording the `payload-type-changed`
      constraint that forced it, the `content`-differs test, and `requiredSlots` losing its only
      user. Hard to reverse, surprising without context, and a real trade-off — a reader will
      otherwise ask why a photograph is typed `note`
- [x] Tests: a `note` with prose and pictures renders both, in slot order, in the shell and at a
      filesystem destination; an attachment whose media type is not an image is not drawn as one;
      the migration turns a captured `image` into a `note` and leaves a mirror write owed
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm test:stack`. By hand:
      capture text, capture a picture, capture both, and confirm an existing pool still reads
- [x] `git commit`

### Phase 3 — The sources are answerable

Depends on nothing — it could land before either phase above. It is here because a relay's first
run should be observable rather than debugged blind.

- [x] `GET /v1/sources` answers every **discovered** source with how many items it captured and when
      it last did. Unpaginated and unnarrowed, like `GET /v1/tags`, and most recent first
- [x] It needs no new glossary term. `Tags in use` exists because a tag vocabulary can be declared
      without being used; a source cannot — core.md says a source is "discovered rather than
      created" — so every source is in use and the route just answers the sources. **Source** gains
      an amendment saying they can be enumerated
- [x] `GET /v1/tags` omits when a tag was last added, on the rule that "a wire field no client
      consumes is one the next reader has to work out the meaning of". The last capture time earns
      its place here **only because the settings view that draws it lands in this same phase** —
      that view is the whole point, since it is how a dead relay is noticed
- [x] The settings view lists the sources with their counts and how long ago each last captured
- [x] Tests: a pool with two sources answers both with their counts; a source that captured and had
      every item purged still answers, or does not — decide it and assert it either way
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm test:stack`
- [x] `git commit`

### Phase 4 — `packages/relay`

Depends on phase 2 for the payload shape. Ends with a library and no caller, which is a weak
stopping point — phases 4 and 5 are naturally landed together.

- [ ] The dance, written once: capture under the upstream id; on `409 source-item-changed`, read
      `existing` off the refusal and post the edit under a version identity. The edit route matches
      replay on `(source, sourceItemId)`, so **the second call is idempotent too** — an edited item
      costs two requests every poll forever and never a second revision
- [ ] Attachments: upload is idempotent on all four of id, bytes, filename and media type, so an
      asset id must be **derived, not minted** — a fresh id each poll would change the payload and
      manufacture a revision every run. UUIDv5, namespace per relay, name is the attachment's own
      identifier upstream. `GET /v1/assets/{id}` is checked first so unchanged bytes are never
      re-sent
- [ ] Hashing the bytes instead is wrong and the reason belongs in a comment nowhere else would
      hold: two names over one content are two assets by CONTEXT.md's rule, and upload compares the
      filename, so the same picture arriving under two names would collide as `asset-id-conflict`
- [ ] A relay is **not** a `@notemap/client`: a client holds an outbox and a cache, and a relay
      wants neither. Its material is still durable upstream, so an outbox would add durability to
      something that has it, plus a **refused** state needing a person. Plain requests against `/v1`
- [ ] Slot names are zero-padded indices, so slot order — which is the order a renderer draws in —
      is the order the attachments arrived in upstream
- [ ] Tests against a real daemon, using the `tests/full-stack` harness: a first run captures; a
      second run captures nothing; an upstream edit amends while unprocessed and revises once
      processed; a re-run after an edit adds no second revision; an attachment is uploaded once
      across three runs
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`
- [ ] `git commit`

### Phase 5 — `apps/relay-memos`

Depends on phase 4. Depends on phase 3 only for being able to watch it work.

- [ ] Reads Memos, maps each memo to a `note`, posts it through `packages/relay`. Source id is
      **one per relay instance** — `memos`, or `memos-<name>` if a second server ever appears.
      `sourceItemId` is the memo's uid; an edit claims `<uid>@<updateTime>`
- [ ] A **full scan every poll**, holding nothing: post every memo, let the pool answer
      `already-captured` for the ones it has. Nothing to lose, corrupt or migrate, and the relay's
      correctness is one sentence. A watermark on `updateTime` is a pure cache and can be added if
      and when the scan actually hurts
- [ ] Capture time is the memo's own creation time, never the poll's — `capturedAt` is what puts a
      memo written three days ago at its true place in the feed
- [ ] Memos' tags travel with the memo and are attributed to the source, which core does already:
      "importing from an already-classified system does not lose its classification"
- [ ] Configuration is its own TOML file, in the daemon's annotated-reference style. Both secrets —
      the notemap access token and the Memos token — are **read from a file named in the config**,
      never inline, which is the rule `[[accounts]]` already follows and for the same reason
- [ ] A memo deleted upstream is left alone: notemap never loses an item, and there is nothing to do
- [ ] Failures go to the relay's log. Notemap has nowhere to put another program's errors, and after
      phase 2 nothing in a payload can be refused anyway
- [ ] Tests against a fake Memos, driving the full-stack harness end to end: a memo with prose,
      a memo with only pictures, a memo with both, a memo edited between runs, a memo with tags
- [ ] `README.md` — **suggest** the roadmap edit rather than making it; that file is written by hand.
      "External Inboxes" is what this is. `docs/todo.md`'s "full POC: inbox via Memos app" line is
      half-closed and says so
- [ ] ADR: **a relay is outside notemap and reaches `/v1` like anything else**, recording why intake
      is not symmetrical with destinations and what would move it in-process — an inbox needing
      pool-side configuration a person edits in the UI
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm test:stack`. By hand:
      point it at your Memos, watch the queue fill, edit a memo, watch it amend
- [ ] `git commit`

---

## Unknowns

- **Which fields the Memos API actually exposes per memo.** The edit identity assumes an
  `updateTime` that moves on every content change. *Fallback*: if there is none, the identity
  becomes `<uid>@<content hash>`, which is total but deadlocks on a memo edited A → B → A — the
  relay then has to read the item back and recognise "the pool already says what the memo says" as
  a no-op. Confirm before phase 5 is written, not during.
- **Whether an attachment has a stable upstream identifier.** The derived asset id depends on one.
  *Fallback*: derive from `(memo uid, position, filename)`, which is stable until an attachment is
  removed from the middle of a memo — an edit, which is handled anyway.
- **Whether the stored payload preserves asset array order or canonicalises it.**
  `canonicalPayload` sorts by slot for *comparison*; whether the write path stores that ordering is
  unchecked. Slot order is display order, so this decides nothing if the relay sends slots already
  in order — but confirm it in phase 1 rather than assuming.
- **Whether your pool holds any `image` items at all.** Unreadable from this container.
  *Fallback*: the migration is a no-op, which costs nothing.
- **Whether `tests/full-stack` can host a fake Memos.** *Fallback*: phase 5's end-to-end tests
  become unit tests over the mapping, with the loop exercised by hand.
- **Two content edits inside one `updateTime` tick** leave the second refused and retried noisily
  each poll until the next edit heals it. Accepted rather than solved; if Memos' timestamps turn out
  to be second-precision, revisit and add the content hash.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The full-stack suite is where phases 4 and 5 earn their keep: a relay is defined by what it does
against a real daemon over real HTTP, and a mocked pool would assert the dance against a fiction.
Phases 1 to 3 change the wire shape, so `pnpm test:stack` runs on each of them too.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
