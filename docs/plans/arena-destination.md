# An are.na destination

**Date**: 2026-09-07
**Status**: Todo
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/shell.md`, `docs/specs/security.md`
**Closed**:

---

## Goal

> An item can be routed to an are.na channel and arrives as a block: text captures as text or link
> blocks, image captures as image blocks, with the channel browsed from the composer and the
> record carrying a followable permalink back to what was written.

Two changes clear the ground first: capability names stop being file-shaped, and a destination can
be told not to write frontmatter. Each of the three phases below is independently shippable and
should go as its own pull request — the rename touches two kinds are.na has nothing to do with, and
the frontmatter switch is a feature in its own right.

Design settled 2026-09-07 with the developer.
[ADR 38](../adr/0038-a-destination-kind-declares-the-shape-of-its-own-account.md) and
[ADR 39](../adr/0039-a-delivery-that-cannot-be-confirmed-may-duplicate.md) record the two decisions
worth the reasoning. The API reference this was designed against is
[`docs/research/are-na-v3-api.md`](../research/are-na-v3-api.md).

---

## Open questions to resolve before phase 3

None of these block phases 1 and 2. All are answerable from `https://api.are.na/v3/openapi.json`,
which the reference points at but does not inline.

- [ ] **Does `POST /v3/blocks` accept `description` (and `title`) at creation?** If it needs a
      follow-up `PUT /v3/blocks/{id}`, that is a second write and a second window in which a
      failure duplicates. If so, decide whether the description is worth it — dropping it and
      saying so in the delivery's note is the cheaper answer.
- [ ] **Does `GET /v3/me` expose the token's scope?** Decides whether a probe can catch a
      read-scoped token, or whether that is documentation only.
- [ ] **Does `GET /v3/users/{id}/contents` work on a free account?** It delegates to search
      internally and search is Premium-only, but the reference marks Premium endpoints explicitly
      (`/v3/search`, the batch routes) and does not mark this one. Confirm against a real free
      token before building candidates on it.
- [ ] **The block permalink format**, for the routing record's `url`.
- [ ] **Whether a channel's slug survives a retitle.** Decides how often a remembered place goes
      stale. Does not change the design either way — the glossary already calls such a place
      **gone** — but it decides how prominently the README warns about it.

---

## Phase 1 — capabilities stop being file-shaped

`create-file`, `append-to-file` and `create-or-append-file` become `create`, `append` and
`create-or-append`. The names generalise so that a vault's note and a board's block are one
capability rather than two, which is what keeps every rule, every composer choice and every
template from being written per kind.

The cost is that **`create` stops promising it will refuse a name already taken**. Both file kinds
still do — `EEXIST`, and `PUT If-None-Match: *` — but that becomes a promise each kind makes rather
than part of what the capability means. Are.na cannot make it.

- [ ] Create the branch for this phase.
- [ ] Rename the three constants in `packages/output-markdown/src/capabilities.ts` and their values.
- [ ] Update every reference across `destination-fs`, `destination-webdav`, `output-markdown` and
      their tests.
- [ ] `apps/ui/src/lib/capability.ts`: `DID` becomes bare verbs — `Created`, `Appended`,
      `Created or appended`. The destination is already named on the next line of `Record.svelte`,
      so the noun was redundant. Unknown names still fall through to themselves.
- [ ] `apps/ui/src/components/routing/ProcessingComposer.svelte:47`: rename the hardcoded
      `CREATE_FILE` used by the `⇧⏎` gesture, and narrow the comment at line ~429 — the no-clobber
      promise it relies on is now the file kinds', not the capability's.
- [ ] Migrate routing **templates**: one `UPDATE` over `capability` in the templates table. A
      template is live — it fires on a tag — so one naming a capability nothing declares is broken
      rather than merely historical.
- [ ] Do **not** migrate routing records. Old records keep the old spelling in the pool and in the
      mirror, which stay in agreement; there is no verify or repair to reconcile a divergence
      (`docs/specs/mirror.md:66`). Remembered places keyed on the old names go dark, which is
      accepted.
- [ ] Update `docs/specs/core.md` (including line ~211 and the `create-file` promise at ~1013),
      `docs/specs/http-v1.md` (the examples at ~781, ~826, ~841, ~1027, ~1041) and
      `docs/specs/shell.md:658`.
- [ ] Update `CONTEXT.md`'s **Capability** entry to the text below.
- [ ] Note in both file kinds' READMEs that `create` refuses a name already taken **on that kind**,
      and by what mechanism.
- [ ] Drain any pending deliveries before this lands: one naming an undeclared capability dies.
- [ ] Typecheck, tests, lint. `pnpm test:stack` — this crosses the HTTP surface.
- [ ] Commit.

### `CONTEXT.md` — Capability

Replaces the current entry. Keeps the field-annotation sentence added by the templating work.

```
**Capability**:
One thing an adapter can do — **create** something that was not there, **append** into something
that was, or decide between the two at delivery. Named in words no kind owns, so a vault's note and
a board's block are one capability rather than two; whether `create` refuses a name already taken is
the kind's own promise and not the capability's. Says which payload types it accepts, and carries a
schema for the **arguments** a delivery must supply: where it goes, and anything else that shapes
it, such as a template or a format. It may also **annotate** a field — that this one can be browsed,
that this one is a `/`-separated path — which is how anything that needs to know more than the shape
asks the capability rather than knowing it by name. Core matches and refuses; it holds no list of
its own, so a new kind of destination needs no change in core.
_Avoid_: verb, action, method, operation
```

---

## Phase 2 — a destination can be told not to write frontmatter

Frontmatter clutters notes and the exact origin is rarely wanted. The switch is a **string enum**,
not a boolean, following the idiom `folder` established: `enum` plus `default`, which
`schema-form.ts` already reads into `Field.options`.

Two levels, because both are wanted: a **destination setting** as the default, and a **capability
argument** as the per-capture override. An absent argument inherits the setting; an absent setting
means no frontmatter. Templates carry `arguments`, so they get the override for free.

The setting must never be `required` — settings are re-validated on every `describe`, and a
destination failing its kind's schema is reported **unusable**, which would break every destination
that already exists.

- [ ] Create the branch for this phase.
- [ ] Wire `Field.options` into `apps/ui/src/components/settings/DestinationForm.svelte` and
      `apps/ui/src/components/routing/ProcessingComposer.svelte`. Only `TemplateForm.svelte:87`
      reads it today, so an enum argument is a bare text input everywhere else — which is also why
      `folder` is currently typed from memory in the composer. This fixes both.
- [ ] Add the `frontmatter` enum to `FILESYSTEM_SETTINGS` and `webdavSettings`, and to their
      readers (`asFilesystemSettings`, `asWebdavSettings`). Both schemas are
      `additionalProperties: false`.
- [ ] Add the `frontmatter` enum argument to the three file capabilities in
      `output-markdown/src/capabilities.ts`, absent meaning inherit.
- [ ] `renderNote` takes whether to emit frontmatter; both kinds resolve argument over setting over
      off, and pass it.
- [ ] The delivery's stored output is what was written, so a note without frontmatter stores
      without it. No change needed — confirm with a test.
- [ ] Update `docs/specs/core.md` and `docs/specs/shell.md`. The rule that a renderer may not shadow
      a fixed key still holds; what changes is that the whole block can be off, so provenance is no
      longer guaranteed to be in the file.
- [ ] Typecheck, tests, lint.
- [ ] Commit.

---

## Phase 3 — the are.na adapter

A new package, `packages/adapters/destination-arena`, kind `arena`.

### Shape

A destination **is the account**; the channel is an argument. That is what buys browsing and
remembered places, both of which are keyed on `{capability, field}` and so reach arguments only.
Settings are therefore just `account`.

### Tasks

- [ ] Create the branch for this phase.

**Account and config**

- [ ] Export an account schema from the package: `secretFile` or `secretEnv`, and nothing else. No
      base URL, no username ([ADR 38](../adr/0038-a-destination-kind-declares-the-shape-of-its-own-account.md)).
- [ ] Export WebDAV's account schema from its package, moving the non-HTTP `baseUrl` refusal out of
      `readAccounts` and into it.
- [ ] `readAccounts` keeps only the kind-agnostic checks: no inline secret, exactly one secret
      source, unique `kind`+`name`.
- [ ] `apps/daemon/src/ports.ts` validates each account against its kind's schema at startup and
      refuses to start on a failure.
- [ ] The host resolves an account to the validated raw object plus its secret; each adapter reads
      that into its own credential type. Retire `ResolvedAccount`; keep one shared `secretOf`.
- [ ] Document the account in `apps/daemon/config.example.toml`, saying plainly that the token must
      be minted with **`write`** scope — are.na defaults to `read`, and a read token 403s on every
      delivery.

**The adapter**

- [ ] Base URL `https://api.are.na`, paths under `/v3`, constant. Overridable only through
      host-wired construction config, so the test suite can point at a fake — never through
      `config.toml` and never through settings.
- [ ] `describe` does no I/O, as both other kinds refuse to: a destination must be routable while
      are.na is unreachable, which is what makes deferred delivery work.
- [ ] One capability, `create`, with a `channel` argument holding the **slug** (v3 accepts "ID or
      slug") and carrying the browse annotation.
- [ ] `accepts` derives from the keys of `arenaRenderers()`, so a payload type with no block form
      is refused by core before a decision is made rather than landing as noise.
- [ ] `candidates`: one page of
      `GET /v3/users/{me}/contents?type=Channel&sort=updated_at_desc&per=100`, with `truncated` set
      from `meta.has_more_pages`. One request. Group channels are not browsable; the field still
      accepts any slug typed by hand.
- [ ] `preview`: converts without reaching the network, unlike WebDAV's, which must read the note it
      would append to.
- [ ] `probe`: `GET /v3/me`. Report `rejected` naming the scope where the response exposes a
      read-only token; otherwise validity only.

**Conversion**

- [ ] Define `ArenaRenderer` in the package — `(delivery, at) => ArenaBlock`, a block being text,
      link or image. The host wires `arenaRenderers()` beside the markdown ones, so dialect stays
      the daemon's. Capability name constants still come from `@notemap/output-markdown`; the
      `Renderer` type does not fit and is not reused.
- [ ] A text capture **beginning with a URL** sends `value` = the URL and the remaining prose as the
      description; are.na infers Link, Image or Embed from the value itself. Anything else sends
      `value` = the whole text and becomes a Text block.
- [ ] An image capture presigns via `POST /v3/uploads/presign`, PUTs the bytes to the returned URL
      with the matching `Content-Type` — streamed, never buffered; `Asset.bytes` supplies the length
      — then posts with `value` set to the S3 URL. Caption becomes the description; the title is
      left unset.
- [ ] Refuse a capture carrying more than one asset. A guard: `packages/client/src/capture/envelope.ts:36`
      builds `assets` as zero-or-one, so only a direct `/v1` caller can trip it.
- [ ] Write provenance into **connection metadata** via the `channels` form on create, best effort.
      It is not queryable, so it is a record for a person and never a dedup mechanism.

**Outcome**

- [ ] `pointer` is the block id; `url` is the block permalink. First kind to return one —
      `followable()` and `Record.svelte:95` already handle it.
- [ ] Output is the block's readable form as markdown; the note says what was dropped — tags,
      artifacts, and any metadata that did not fit.
- [ ] Error mapping: `401` → `rejected` to a probe and `unreachable` to a delivery, following
      WebDAV's asymmetry. `403`, `404` and `422` → `rejected`; an under-scoped token and an
      unwritable channel are both permanent, unlike a rotated password. `408`, `429` and `5xx` →
      `unreachable`. Never follow a redirect with the token attached.
- [ ] README, on both file kinds' model: what a destination is, the one capability, what it will not
      do, and a refused-or-unreachable table.
- [ ] **State the duplicate window plainly in the README**
      ([ADR 39](../adr/0039-a-delivery-that-cannot-be-confirmed-may-duplicate.md)): this kind's
      `unreachable` does not promise that nothing landed, because are.na offers no conditional
      create and no idempotency key.

**Wiring and docs**

- [ ] Register the kind in `apps/daemon/src/ports.ts`.
- [ ] `docs/specs/core.md`: rewrite the retry-is-keyed-on-evidence clause (~line 772) so the
      no-duplicate guarantee is a promise each kind makes rather than a property of `unreachable`.
- [ ] `docs/specs/security.md`: widen the account section to cover uploading item bytes to an
      address are.na names at runtime. No notemap credential is attached — the presigned URL is its
      own authorisation — so ADR 28's threat does not apply, but the file currently reads as though
      the daemon only ever talks to addresses in `config.toml`.
- [ ] `CONTEXT.md`'s **Account** entry, to the text below.
- [ ] Typecheck, tests, lint. `pnpm test:stack` — this crosses the config file, the host's wiring
      and the HTTP surface.
- [ ] Commit.

### `CONTEXT.md` — Account

Replaces the current entry.

```
**Account**:
A login the daemon holds on **another** system, so that a destination can deliver to it — a
Nextcloud, an are.na, and whatever comes after. Declared in the daemon's config under
`[[accounts]]`, one per kind and name, and resolved as one thing when a delivery needs it. What an
account of a given kind must carry is that kind's own — an address and a username for one, a bare
secret for another — declared by its adapter and checked when the daemon starts. Where the secret is
read from is the only part every kind shares. Never in a destination's settings, which are pool
state: a destination names an account and a place within it, and has nowhere to put an address or a
secret ([ADR 28](docs/adr/0028-a-remote-destination-names-a-credential-profile-not-a-url.md),
[ADR 38](docs/adr/0038-a-destination-kind-declares-the-shape-of-its-own-account.md)).

The one word in this glossary that points outward. The daemon's own **credential** is not an
account and is never called one, and neither is an **access token**, which notemap issues rather
than holds; an account is never notemap's, and belongs to a server somebody else's software is
running.
_Avoid_: profile, connection, endpoint, integration, remote
```

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

An in-process fake are.na, on `destination-webdav/src/testing/dav-server.ts`'s model, so the suite
stays fast and offline. It is a **fake**: it implements the routes this adapter uses and no more,
and whether the real thing agrees — that a presigned PUT accepts a streamed body, what
`POST /v3/blocks` really returns, where the block type inference draws its lines — is what hand
verification against a real account is for.

Worth covering specifically: the URL-sniffing boundary, since it is a judgement made at delivery;
the multi-asset refusal; `truncated` when a channel page has more; and that `accepts` really does
exclude a payload type with no renderer.

---

## Notes

Raised while designing this, not part of it: `CandidateBrowser` renders `{#each entries}` whole and
its input sets the field's value rather than filtering the list, so a long answer — two hundred
channels, or a vault folder of two hundred notes — is navigated entirely by scrolling. Belongs in
`docs/todo.md` rather than here.

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed
and linking back to this plan. No implementation details, no granular tasks. A plan marked Done
whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
