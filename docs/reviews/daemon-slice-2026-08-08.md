# Review: The daemon slice (capture-feed-mvp phases 3–4)

**Date**: 2026-08-08
**Status**: Resolved
**Scope**: `apps/daemon/`, plus the branch's core and store commits where the daemon exercises them
**Plan**: `docs/plans/capture-feed-mvp.md`
**Spec**: `docs/specs/http-v1.md`, `docs/specs/core.md`

---

## Overall

Faithful to the spec, and unusually well-annotated: the error grammar, the status tables and
the position wire form all match `http-v1.md`, the strict envelope and the totality of the
refusal mapping are enforced by types where types can do it, and the 52 HTTP-level tests
cover the acceptance criteria almost line by line. The `Shipped:` trail is complete in both
specs, both plans are Done, and typecheck, tests and lint are green.

The most important finding is a hole in the strict-envelope promise: a `capturedAt` that
parses as no instant at all sails through wire validation and produces a `500` (bug 1) —
which the spec's own error-model rule defines as a bug. The `app.openapi()` bypass, reviewed
specially below, is **justified** in substance but leaves one real drift channel (design 4).

---

## Bugs

### 1. A garbage `capturedAt` is a 500, not a 400

`apps/daemon/src/wire.ts:59` — the wire schema types `capturedAt` as `branded()`, i.e. any
non-empty string. `POST /v1/captures` with `"capturedAt": "yesterday"` (confirmed
empirically):

```
passes captureEnvelopeSchema → pool.capture → store's toMillis() → Date.parse NaN
→ TypeError thrown → app.onError → 500, empty body
```

The spec says anything outside the table is a bug (`http-v1.md` "Errors"), and this one is
reachable by any client typo. It is exactly the class of shape problem `malformed-envelope`
exists for — a misspelled *value* rather than a misspelled key, on the field the strictness
argument itself uses as its example.

Fix: validate `capturedAt` at the wire (refine: `Date.parse` is not `NaN`, or a stricter
RFC 3339 check per minor 6) and answer `400 malformed-envelope` with
`{ path: "/capturedAt", keyword: "format" }`.

### 2. `OPTIONS` is advertised in `Allow` but answered 405

`apps/daemon/src/app.ts:145` — `methodsFor` unconditionally adds `OPTIONS`, but no route
answers it (Hono does not handle `OPTIONS` on its own). Confirmed:

```
OPTIONS /v1/feed → 405, Allow: GET, OPTIONS
```

A 405 whose `Allow` header lists the method being refused contradicts itself.

Fix: either answer `OPTIONS` (a small `app.options` or middleware returning `204` +
`Allow`), or stop adding it to the set.

### 3. Unescaped regex metacharacters in path matching

`apps/daemon/src/app.ts:139` — `methodsFor` builds a regex from the route path without
escaping regex characters, so the `.` in `/v1/openapi.json` matches any character.
Confirmed:

```
GET /v1/openapiXjson → 405 method-not-allowed, method: "GET", allow: ["GET", "OPTIONS"]
```

— a nonsense response (the refused method appears in its own `allow`; the truthful answer is
`404 unknown-route`).

Fix: escape the path before templating (`path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")` prior
to the `:param` substitution), and — belt and braces — have the notFound handler fall back to
`unknown-route` whenever the request method is in the computed `allow`.

---

## Design

### 4. The `codes` lists in `routes.ts` are the one hand-synced surface

`apps/daemon/src/routes.ts:83-101` — the OpenAPI route declarations enumerate error codes
per status by hand. The status *mapping* is total by construction (`errors.ts`'s
`satisfies Record<CaptureRefusal["kind"], number>` — a new core refusal kind fails to
compile), but nothing forces the corresponding entry in `routes.ts`: a refusal kind added
tomorrow compiles once `errors.ts` is updated, while the served-and-checked-in document
silently omits the new code. The openapi tests pin response *statuses*, not code lists, so
the drift would not be caught.

Suggestion: derive the per-status code lists from `CAPTURE_STATUS` / `DAEMON_STATUS`
(group keys by value) so the document and the mapping cannot disagree. This also removes the
duplicated 409/422 taxonomy comment.

---

## Minor

### 5. `limit` and `after` accept spellings the spec does not

`apps/daemon/src/positions.ts:22` — `Date.parse` accepts non-RFC 3339 forms: a date-only
`after=2026-08-08` is accepted (confirmed, `200`), as is a date-only `capturedAt`. The spec
says "an RFC 3339 timestamp". Harmless today — the store compares instants, not text, and
date-only parses to midnight UTC — but it widens the wire contract silently, and what is
accepted once is relied on (the same argument the strict envelope makes). Either tighten to
RFC 3339 or say "anything `Date.parse` accepts" in the spec; tightening is more in
character.

### 6. `text/json` satisfies the content-type check

`apps/daemon/src/app.ts:169` — `endsWith("/json")` admits `text/json` and friends where the
spec names `application/json` only. Lenient-accept is defensible; noting it because the spec
and the check disagree as written.

---

## Non-issues

- **The `app.openapi()` bypass** (`apps/daemon/src/app.ts:152-163`) — the review's special
  question; **justified, with the caveat in design 4**. What `app.openapi()` buys is request
  validation wired per route and handler return types checked against the declared
  responses. The first is genuinely incompatible with this API's contract as specified: the
  framework answers a malformed JSON body with its own plain-text 400 before any hook runs,
  a wrong content type silently *skips* validation rather than 415ing, and the parameter
  refusals (`bad-order` with `allowed`, `limit-too-large` with `max`) carry facts a
  `defaultHook` would have to reverse-engineer out of zod issues. Getting the specified
  one-shape error grammar through the sanctioned path means fighting three separate
  extension points; the daemon instead validates with **the same zod schemas the document is
  generated from** (`captureEnvelopeSchema` does both jobs), which preserves the single
  source of truth that matters. The second thing — response typing — zod-openapi does not
  enforce at runtime anyway, and the checked-in-document test plus the behavior tests pin
  both sides of the contract. What is genuinely given up is compile-time pressure on the
  declarations, which is design 4's drift channel, and worth closing the cheap way suggested
  there rather than by adopting `app.openapi()`.
- **`toEnvelope` written out field by field** (`app.ts:63`) — deliberate: a field core adds
  fails to compile instead of silently never arriving. The mirrored assignability checks in
  `wire.ts:120-129` cover the other direction.
- **500 with no body on unexpected throws** (`app.ts:261`) — per spec, deliberate: a refusal
  synthesized from a crash teaches clients to trust a fiction.
- **`retry` defaulting when absent from config** (`config.ts:119`) — the plan's example
  shows `[retry]` but absent-means-default is consistent with absent-lists-mean-empty, and
  `config.example.toml` documents it.
- **Ports that throw `absent(...)`** (`ports.ts:34`) — correct per plan: nothing can reach
  them, and a silent no-op would turn "unbuilt" into "quietly lossy" when something can.
- **The store's `keysetPage` throwing on a non-positive limit** (`pool-store.ts:281`) — the
  daemon refuses `bad-limit` before core is reached, so the throw is a genuine
  caller-bug guard, not a reachable wire path.

---

## Resolution

**Resolved 2026-08-10.** Every finding acted on, together with the PR review's structural and
comment feedback.

- **1 — garbage `capturedAt`** — fixed at the wire, and widened rather than tightened per the
  developer's decision on minor 5. `capturedAt` and a position's `at` are now an **ISO 8601
  instant**: offsets accepted and converted, a date alone meaning midnight UTC, and anything
  else `400 malformed-envelope` / `422 bad-position` with keyword `format`. A date-time with no
  offset is refused — it names no instant, and reading it as either UTC or the daemon's own zone
  makes the captured moment depend on where the daemon runs. The daemon normalises before core,
  so `Timestamp` stays RFC 3339 UTC. Validation is zod's `z.iso.*`, which also rejects
  `2026-02-31`, a date `Date.parse` silently rolls into March. `http-v1.md` gains an *Instants*
  section.
- **2 — `OPTIONS`** — answered, `204` with `Allow`. The by-hand run then found a second, worse
  version of it: under the node server a bodyless request carries a readable stream, so the
  content-type middleware refused `OPTIONS` and `DELETE` with `415`, which `app.request` could
  never reproduce. The middleware now keys on the method, and `serving.test.ts` exercises a real
  listener precisely because the two environments diverge.
- **3 — regex metacharacters** — path escaped, plus the suggested fallback: a request whose
  method already appears in the computed `allow` is `404 unknown-route`.
- **4 — hand-synced `codes`** — gone. The status maps are split by concern (`BODY_STATUS`,
  `PARAMETER_STATUS`, `SUBJECT_STATUS`, `ADDRESS_STATUS`, `CAPTURE_STATUS`), `satisfies` over
  their union keeps every refusal kind mapped, and each route's per-status code list is derived
  from them by `codesFor`.
- **5 — lenient spellings** — see 1. The spec now states the grammar rather than the code
  quietly exceeding it.
- **6 — `text/json`** — tightened to `application/json` exactly.

Found while fixing, and not in either review: **`branded()` made `z.infer` resolve to `any`**,
so the three "drift" assertions in `wire.ts` proved nothing — deleting a field from `itemSchema`
compiled clean — and `toEnvelope` was receiving `any`. The cause is `@hono/zod-openapi`'s
re-exported `z`, not the helper: schemas built with plain `zod` keep their types and still take
`.openapi()`. Schemas now import from `zod`, the helpers and the false assertions are gone, and
the one check that always worked — `toEnvelope` constructing a `CaptureEnvelope` field by field
— is verified to catch a field added to core. Documentation drift on the response schemas is
accepted deliberately: the API does not have to mirror core's shape.

Also from the PR review: the daemon is no longer a flat directory (`config/`, `errors/`,
`middleware/`, `routes/`, `schemas/`, `types/`, `utils/`, tests beside what they test);
`wire.ts` is `schemas/`; `daemon.host` is configurable and `http-v1.md` says localhost is the
default and what binding wider costs; `MAX_LIMIT` and friends live in `constants.ts`; the
`--openapi` flag on the serving binary is replaced by a pool-free `openApiDocument()` and its
own bundle entry; a top-level `try`/`catch` turns a failed config load or pool open into a
sentence; and the comments are cut throughout, with `AGENTS.md` gaining a sharper rule about
them.
