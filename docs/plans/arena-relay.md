# A block in an are.na channel reaches the pool by itself

**Date**: 2026-09-23
**Status**: Todo <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/core.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> A block connected to a watched are.na channel appears in the notemap queue without anyone
> touching notemap — with its image, at the time it was connected, under a source named per
> channel — and a block edited afterwards amends or revises the item it became. The program
> holds no state: it re-reads every watched channel every poll, and the pool's own dedup is
> what makes that harmless.

`apps/relay-arena`, modelled closely on `apps/relay-memos`. It is a **relay**: a program outside
notemap reaching `/v1` with an access token
([ADR 39](../adr/0039-a-relay-is-outside-notemap-and-reaches-v1-like-anything-else.md)). Nothing
lands in the daemon, no route is added, and no pool state is introduced.

`packages/relay` already carries the shared half — derived asset ids, uploading what the pool has
not got, capture, and turning a `409` into the edit that change earned. If this app needs changes
in `packages/relay` to work, that is worth stopping on and saying: that package exists precisely
so the second relay is cheap.

---

## What is one-way, and must be settled before phase 2

Three choices are written onto items forever and cannot be corrected later.

**The asset namespace.** `RELAY_ARENA = "42f2bf62-27bc-47e9-8989-f37c25ea6f13"`, a constant in
`src/constants.ts`, exactly as `RELAY_MEMOS` is. The per-source namespace is `uuidv5(source,
RELAY_ARENA)`, as `apps/relay-memos/src/relay.ts` derives it. A changed namespace re-uploads every
attachment and makes every block carrying one look edited, forever.

**The source string is per channel and explicitly configured.** One source per watched channel, not
one per relay: a source is "finer than the app that sent it, because policy is what the distinction
is for" (`CONTEXT.md`), and a UI-configured inbox would be per channel if that is ever built. It is
a required key rather than derived from the slug, because an are.na channel can be retitled and a
derived source would silently split one channel's items across two sources — which reads in
`GET /v1/sources` exactly like a relay that died. Suggested shape `arena/<something>`, matching
`shell/web`; the relay does not enforce it.

**`capturedAt` is `connected_at`, not `created_at`.** A block connected into a channel may have been
created by someone else years earlier; what happened was the connecting. For a block you made in the
channel the two are the same instant, so this only differs for a re-connected block, where
`connected_at` is the moment that is yours.

---

## Tasks

### Phase 1 — the app exists and does nothing

_Depends on nothing._

- [x] Branch `agent/arena-relay`.
- [x] `apps/relay-arena` scaffolded against `apps/relay-memos` as the reference: `package.json`
      (`@notemap/relay-arena`, private, `bin` → `notemap-relay-arena`, `build`/`start`/`typecheck`/
      `test` scripts), `tsconfig.json`, `scripts/build.ts` (the esbuild bundle, unchanged but for
      the entry point).
- [x] `src/constants.ts` — `DEFAULT_POOL_URL`, `DEFAULT_POLL_MS`, `PER_PAGE`, and `RELAY_ARENA`
      fixed to the UUID above. No `DEFAULT_SOURCE`: the source is per channel and required.
      `DEFAULT_POLL_MS` is 900000 (fifteen minutes), longer than relay-memos' five — unknown 3's
      fallback, since it is not resolved yet.
- [x] `src/relay.ts` — `namespaceFor(source)` and `relayInto(...)`, the memos versions with the new
      constant. One `Relay` instance per watched channel, since the namespace and source differ per
      channel. `relayInto` takes a `PoolTarget` and a `source` directly rather than a `RelayConfig`,
      since config doesn't exist until phase 4.
- [x] Register the package in the workspace so `pnpm -r` picks it up. `pnpm-workspace.yaml` already
      globs `apps/*`; `pnpm install` picked it up and updated the lockfile.
- [x] **Verify**: `pnpm --filter @notemap/relay-arena typecheck` passes. `build` cannot produce
      `dist/main.js` yet — `src/main.ts` is phase 5's task, not phase 1's — so that half of this
      step is deferred to phase 5's verify.
- [x] `git commit`

### Phase 2 — reading are.na

_Depends on phase 1. Resolve unknown 1 first._

- [x] `src/arena/types.ts` — the block and page shapes read down to the fields used, on the terms
      `apps/relay-memos/src/memos/types.ts` sets: only what is consumed.
- [x] `src/arena/read.ts` — `arenaAt(target)` with `ArenaRefused` (status, route, first 200 chars),
      mirroring `MemosRefused`. It offers:
  - `contents(handle, signal)`, an async generator over every block in a channel, paginated, with
    the same guard `memos/read.ts` has against a server that would page forever — here,
    `meta.total_pages` bounds the scan, since are.na's own page numbers are a plain counter with
    no opaque token to repeat.
  - `open(block, signal)` returning the bytes of a block's file. are.na serves these from its own
    object storage under a plain URL, so **no bearer is attached** to that request — the same shape
    as Memos' `externalLink` path.
  - The channel handle is sent verbatim: are.na accepts both the numeric id and the slug
    (`packages/adapters/destination-arena/src/api.ts` relies on this for `channel`).
- [x] Tests beside it, driven by a fake `fetch`: pagination across two pages, a page that ends the
      scan, a `401` and a `404` surfacing as `ArenaRefused`, and `open` sending no authorization
      header.
- [x] **Verify**: `pnpm --filter @notemap/relay-arena test` green.
- [x] `git commit`

### Phase 3 — one block as the pool takes it

_Depends on phase 2. The bulk of the thinking, and the part that ports unchanged if a poller ever
moves into the daemon — so it must not know how it is being run: no config, no HTTP, no loop._

- [x] `src/arena/relayed.ts` — `relayedFrom(block, open, tags)` returning `Relayed | undefined`,
      on the terms `memos/relayed.ts` sets.
  - `sourceItemId` — the block id as a string.
  - `version` — `updated_at`.
  - `capturedAt` — `connected_at` (see above).
  - `text` — by block class. A text block is its content verbatim. A link block is its title,
    description and source URL composed into prose. An image or attachment block is its title and
    description where it has them, and may have no text at all. **An `Embed` block — a class the
    plan missed; see Unknown 2 — is composed the same way as a link, with no attachment**: decided
    with the developer, since are.na never hosts the actual media, only a cached thumbnail.
  - `attachments` — an image block's stored image, an attachment block's file. Attachment `id` is
    composed and stable — `block/<id>/image` — since the asset id is a UUIDv5 over it and must not
    move while the block stands still. Filename and mime come from what are.na reports directly on
    every block tried (Unknown 2, resolved) — the URL-derived fallback is not implemented.
  - `tags` — are.na has no tags on a block, so these are the watched channel's configured tags and
    nothing else. Empty by default. They travel once, at capture, and are never reconciled
    afterwards — the pool drops tags from the payload comparison on purpose.
  - Returns `undefined` for a block with neither text nor attachment, and for a channel-class block
    (a channel connected into a channel is not a note).
- [x] Tests beside it, one per class, plus the empty guard and the channel-block skip.
- [x] **Verify**: `pnpm --filter @notemap/relay-arena test` green.
- [x] `git commit`

### Phase 4 — configuration

_Depends on phase 1._

- [ ] `src/config/load.ts` — `apps/relay-memos/src/config/load.ts` is the model and its rules carry
      over verbatim: `smol-toml` plus a **strict** zod object, an inline `token` refused by name,
      exactly one of `tokenFile`/`tokenEnv`, `~` expanded, secrets read where they are used rather
      than held from startup so rotation is writing the file.
- [ ] The shape, which differs from memos in one way — one token, many channels:
  - `[pool]` — `url`, `tokenFile`/`tokenEnv`. No `source` key here; it is per channel.
  - `[arena]` — `tokenFile`/`tokenEnv`. No `url`: are.na's address is a constant of the service,
    as `ARENA_API` in the destination adapter already states.
  - `[[channel]]`, one or more — `handle` (id or slug, required), `source` (required), `tags`
    (optional, default empty).
  - `[poll]` — `interval`, defaulting to `DEFAULT_POLL_MS`.
- [ ] Refuse at load: no channels, a duplicate `source` across two channel blocks, a duplicate
      `handle`. Two channels under one source would merge two channels' blocks into one identity.
- [ ] Tests beside it covering each refusal and the happy parse.
- [ ] **Verify**: `pnpm --filter @notemap/relay-arena test` green.
- [ ] `git commit`

### Phase 5 — the loop

_Depends on phases 2, 3, 4._

- [ ] `src/run.ts` — `relayEverything(...)` per channel, with a `Tally` on `relay-memos`' terms
      (`read`, `captured`, `unchanged`, `amended`, `revised`, `empty`, `failed`). A block that
      could not be relayed is logged and the scan carries on; `notThisItem(cause)` rethrows, so a
      failure that was the *pool's* ends the scan rather than writing one identical line per block.
- [ ] A failure reading **one channel** ends that channel and not the poll: the other channels are
      other upstreams, and one private channel the token lost access to should not stop the rest.
      A pool failure still ends everything.
- [ ] `src/main.ts` — `parseArgs` with `--config`, `--once`, `--help`; `NOTEMAP_RELAY_ARENA_CONFIG`
      then `~/.config/notemap/relay-arena.toml`; SIGINT/SIGTERM into an `AbortController`; polls
      that never overlap; `--once` exiting non-zero if anything went wrong. The tally is said per
      channel and the usage text is this program's.
- [ ] Tests for `run.ts` against a fake reader and a fake `Relay`: each `Landed` kind counted, a
      per-block failure counted and survived, a pool failure ending the scan, a channel failure
      leaving the next channel to run.
- [ ] **Verify**: `pnpm --filter @notemap/relay-arena test` green; `pnpm -r --silent typecheck`
      and `pnpm -r --silent lint` clean.
- [ ] `git commit`

### Phase 6 — running it

_Depends on phase 5._

- [ ] `apps/relay-arena/config.example.toml`, annotated as the memos one is — including why the
      source is per channel and why it is required.
- [ ] `apps/relay-arena/README.md`, on the memos README's terms: the mapping table, what it holds
      (nothing), what it says (its own log), and how it is noticed to be alive
      (`GET /v1/sources`).
- [ ] **The loop, as a rule and not as mechanism.** The README says plainly: never watch a channel
      an are.na *destination* delivers into. Notemap's own blocks would be read back as fresh
      captures — a new `sourceItemId` and a payload the pool has never seen, so dedup does not
      catch it — and they cannot be told apart by author, since notemap posts under the same are.na
      user. Nothing enforces this.
- [ ] `Dockerfile.relay-arena` beside `Dockerfile.relay-memos`; `docker/compose/relay-arena.toml`;
      the service commented out beside the memos one in both compose files, with its two secrets.
- [ ] `docs/running.md` — a relay-arena section beside the daemon's, covering the two tokens and
      the `read` scope an are.na token needs (the destination's section documents `write` and why
      the scope cannot be checked; this is the mirror of it).
- [ ] `CONTEXT.md` — the **Relay** entry says "There is one: `apps/relay-memos`". Now there are two.
- [ ] `docs/todo.md` — check off "are.na relay" under Inboxes with a dated note, on the terms the
      Raycast entry was closed with.
- [ ] **Verify**: build the image and run `--once --help`; run the relay by hand against a real
      are.na channel and a local daemon, and confirm the block is in the queue with its image, at
      the time it was connected.
- [ ] `git commit`

### Phase 7 — the full-stack test

_Depends on phase 6._

- [ ] `tests/full-stack/src/relay-arena.test.ts` beside `relay-memos.test.ts`, with a fake are.na
      in the harness alongside the fake Memos: a block captured, a block re-read as
      `already-captured`, an edited block amending, an image arriving as an asset, and a block in a
      second channel landing under the second source.
- [ ] **Verify**: `pnpm test:stack` green — this change crosses the layers, so it is one of the
      cases that earns the stack suite.
- [ ] `git commit`

---

## Unknowns

1. **Resolved.** `/v3/channels/{handle}/contents?page=&per=` answers, verified live against
   `arena-influences`: `meta` carries `has_more_pages` and `total_pages`, same shape as the
   destination's `/v3/users/{id}/contents`. A slug and a public channel need no token at all; a
   missing channel answers `404` with `{"error":"Not Found",...}`.
2. **Resolved.** Both `Image` and `Attachment` blocks report `filename` and `content_type`
   directly (`image.filename`/`image.content_type`, `attachment.filename`/`attachment.content_type`)
   — verified against a real `Attachment` block carrying a PDF. The URL-derivation fallback was not
   needed and is not implemented.
   - **Found in the process, not in the plan**: are.na has a sixth block class, `Embed` (rich
     media — a Vimeo/YouTube embed), alongside `Text`/`Link`/`Image`/`Attachment`/`Channel`. Raised
     with the developer; decided `Embed` is mapped like `Link` — title, description and
     `source.url` composed into prose, no attachment. Its `image` is a cached thumbnail, not the
     block's content, and downloading the actual media would mean scraping the embed provider
     directly (a per-provider extractor, most providers' ToS, an identity story the asset-id model
     has no room for) — out of scope for this plan.
3. **Rate limiting.** are.na asks callers not to enumerate aggressively, which is why the
   destination's browse deliberately reads one page
   ([ADR 44](../adr/0044-naming-a-value-is-a-second-question-a-destination-answers.md)). A relay
   re-reading every channel every poll is exactly the pattern that guidance is about. *Fallback*:
   a longer default interval than memos' five minutes, and a `429` from `ArenaRefused` ending the
   channel's scan quietly rather than logging per block.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Unit tests beside what they test, driven by a fake `fetch` and a fake `Relay` — no network in
`pnpm -r test`. The one full-stack test is phase 7 and runs under `pnpm test:stack`.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what
was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed
and linking back to this plan. No implementation details, no granular tasks. A plan marked Done
whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
