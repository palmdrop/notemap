# The /v1 capture-and-feed subset, and pagination by position

**Date**: 2026-08-08
**Status**: Done
**Spec**: `docs/specs/http-v1.md`, `docs/specs/core.md`
**Closed**: 2026-08-08

---

## Goal

The grilling session's outcome is written down and true: `http-v1.md` specifies the
capture-and-feed subset in observable terms, ADR 14 and CONTEXT.md carry the pagination
decision, and core's paginated reads take domain positions — `cursor.ts` deleted, typecheck,
tests and lint green — so that `capture-feed-mvp.md` phase 3 can build the daemon against a
settled contract.

This plan is the outcome of the phase-1 grilling session of
[capture-feed-mvp.md](capture-feed-mvp.md); that plan's phases 2–4 remain where daemon and
page work live. Its phase 3 depends on both phases here.

---

## Decisions (settled in the grilling session, 2026-08-07/08)

**Wire, capture:**

- `POST /v1/captures`: body is core's `CaptureEnvelope` verbatim. Success bodies are core
  types verbatim: `201 Created` + `CaptureOutcome` (`kind: "captured"`) with
  `Location: /v1/items/<id>`; `200 OK` + `kind: "already-captured"` with `matchedOn` on
  replay.
- An id-minting client (the browser page) supplies its capture id as `sourceItemId` too —
  one minted value, both fields.

**Wire, errors:**

- Error envelope: `{ "error": { "code": <refusal kind>, ...facts } }`. `code` is the
  refusal's `kind` unchanged, remaining refusal facts spread beside it. No `message` —
  facts only; rendering is the client's. Daemon-minted errors use the same grammar.
- Status table: `409` for `capture-id-conflict` and `source-item-changed`; `422` for every
  other refusal, plus daemon-minted `limit-too-large` and `bad-position`; `400`
  `malformed-json` / `malformed-envelope` (envelope-shape issues, `SchemaIssue` shape);
  `415` `unsupported-media-type`; `404` `unknown-route` / `no-such-item`; `405` with
  `Allow`.

**Wire, reads:**

- `GET /v1/feed`: `order` (default `newest-first`), `limit` (default 50, max 500, refused
  above — never clamped), `after` = position as `<at>,<id>`, or a bare timestamp as a
  coarse entry point. Response `{ values, next? }`; `next` is a ready-to-fetch relative
  URL carrying order, limit and the next position; absent on the last page.
- `GET /v1/items/:id` is in the subset: `200` + `Item` verbatim, `404 no-such-item`.

**Pagination by position (core):**

- A **position** is the sort-key fields of the last row seen, in domain terms. Never
  stored; a read parameter. Replaces opaque cursors and rules out offsets (behind-position
  inserts are normal in this domain).
- Every paginated core read takes one: `feed` `{at: createdAt, id}`; `queue`/`archived`
  `{at: content time, id}`; `actions.*` `{at, id}`; `abandoned` `{at: abandonedAt, item,
  enrichment}`, with `abandonedAt` added to the abandoned state. `PageCursor` and
  `cursor.ts` are deleted. Sync's `changesSince` cursor stays opaque **by design** — a
  store-internal sequence is exactly what should not be domain-stated.

**Transport and stack:**

- `application/json; charset=utf-8` both ways. Binds `127.0.0.1` only, default port 4747,
  no CORS headers; the capture page is served at `/`; all API under `/v1`.
- An OpenAPI 3.1 document is part of the contract: generated, served at
  `/v1/openapi.json`, checked in. Hono + `@hono/zod-openapi` produce it. Client/hook
  generation is downstream of the document and explicitly deferred.
- Daemon config is TOML. The daemon mints v7 via the `uuid` package; the static page
  hand-rolls v7 inline.

---

## Tasks

### Phase 1 — Docs *(no code; blocks phase 2)*

- [x] Create branch `agent/http-v1-subset-and-positions`
- [x] Rewrite `docs/specs/http-v1.md`: the subset above in observable terms — endpoint by
      endpoint, the full refusal-to-status table, error envelope, position wire form,
      `next`-URL behavior, content types, bind/port, OpenAPI document. Mark what is now
      settled and what remains stub (queue, tags, suggestions, artifacts, routing,
      archive, purge, assets, sync wire form, auth).
- [x] ADR `0014-pagination-by-domain-position.md`: positions over opaque cursors *and*
      over offsets; the per-surface sort-key rule; `abandonedAt`; sync staying opaque;
      the `next`-URL layer. Rejected alternatives with reasons.
- [x] CONTEXT.md: **Position** entry (a read parameter, never stored; *avoid*: cursor,
      token, offset; distinguish from the frontend's processing position).
- [x] `docs/specs/core.md`: amend the storage constraint (reads asked for in domain terms
      now includes the continuation; `PageCursor` gone), add `abandonedAt` to the
      enrichment behavior, note the sync-cursor exception. New open question: feed
      revision-tie ordering — spec says a revision's place comes from the revision link,
      the sqlite driver sorts `(created_at, id)`, which agrees only for time-ordered ids;
      client-minted ids can violate it.
- [x] `docs/plans/capture-feed-mvp.md`: mark phase 1 done pointing here; resolve the
      pending decisions (Hono + zod-openapi, TOML, `uuid` package, port, OpenAPI doc,
      `sourceItemId`); adjust phase 3/4 task wording to match (error envelope, positions,
      `next` URL, `/v1/openapi.json`).
- [x] Verify: every decision listed above appears in exactly one authoritative doc;
      `capture-feed-mvp.md` no longer says "Undecided" anywhere.
- [x] `git commit`

### Phase 2 — Core position surgery *(depends on phase 1)*

- [x] Core types: `Position` (`{at, id}`) and the abandoned position shape; `FeedPage`,
      `Page`, `Slice.next` move off `PageCursor`; `abandonedAt` on the abandoned state.
- [x] Store port: paginated read signatures take positions; wrong-order/garbage cursor
      handling disappears (a malformed position never reaches the store).
- [x] `store-sqlite`: delete `cursor.ts`; `keysetPage` works on positions; `abandoned`
      ordered by `abandonedAt` (migration for the new column if the schema stores state).
- [x] Tests: pagination through positions on feed/queue/archived/actions/abandoned;
      a position surviving a purge of the row it names; bare-`at` bound semantics
      (see unknown below); both orders from one position.
- [x] Verify: `pnpm typecheck && pnpm test && pnpm lint` green; `grep -r PageCursor
      packages/` finds nothing.
- [x] `git commit`

---

## Unknowns — resolved

- **Bare-timestamp entry semantics** — the likely shape held. `Position.id` is optional; with
  no id the store bounds on `at` alone, strictly, and rows sharing that instant fall outside
  it. It cost one branch in one helper, so the fallback of rejecting bare timestamps on the
  wire was not needed. Both the coarse entry and the instant it skips are covered by tests.
- **Where `abandonedAt` lives in the schema** — nowhere. The store persists no enrichment state
  at all yet: there is no `enrichment_states` table, and `abandonedEnrichments` is still one of
  the driver's `unimplemented` reads. `abandonedAt` lands in core's types only, and there is no
  migration to write. The column arrives with the table, in whichever plan builds the
  enrichment slice.
- **`Slice` genericity** — a type parameter with a default was enough: `Slice<T, P = Position>`
  and `Page<P = Position>`. Only the abandoned surface passes one, and every other signature
  reads exactly as it did before.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Phase 1 is docs-only; its verify step is the cross-check above. Phase 2's tests live with
core and the driver suite; the daemon's HTTP tests belong to `capture-feed-mvp.md` phase 3.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase —
or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and
describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In
progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at
a high level what landed and linking back to this plan. No implementation details, no
granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error
the `review` skill will flag.
