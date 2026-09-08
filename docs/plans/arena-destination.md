# An are.na destination

**Date**: 2026-09-07
**Status**: In progress
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
[ADR 40](../adr/0040-a-destination-kind-declares-the-shape-of-its-own-account.md) and
[ADR 41](../adr/0041-a-delivery-that-cannot-be-confirmed-may-duplicate.md) record the two decisions
worth the reasoning. The API reference this was designed against is
[`docs/research/are-na-v3-api.md`](../research/are-na-v3-api.md).

---

## What the spec settled

Resolved 2026-09-07 against [`are-na-openapi.json`](../research/are-na-openapi.json).

- **`POST /v3/blocks` takes `title` and `description` at creation.** No follow-up `PUT`, so there
  is no second write and no second window in which a failure duplicates. `BlockInput` is richer
  than assumed: also `alt_text`, `original_source_url`, `original_source_title`, `cover_url`, and
  **`metadata`** — custom key-value pairs set on the **block itself**, not only on the connection.
  Provenance goes there. Keys are alphanumeric or underscore and at most 40 characters, values are
  scalars with strings capped at 2000, and there is a limit of 50 keys and 32KB.
- **A channel is named by ID *or slug*** in both `channels` and the legacy `channel_ids` —
  `ChannelIds` accepts "numeric IDs, string IDs, or channel slugs", and `ConnectTo.id` is
  documented the same way. The `channel` argument therefore takes **either**, at no cost, and
  `candidates` answers slugs. See the note on retitling below.
- **`GET /v3/me` does not expose the token's scope.** `Me` is `User` plus `counts` and `email`, and
  `scope` appears nowhere but the `POST /v3/oauth/token` exchange response — which a pasted
  personal access token never produces. So a probe **cannot** catch a read-only token, and the
  fallback applies: say it in `config.example.toml` and the README, and let a `403` at delivery
  name the likely cause.
- **`/v3/users/{id}/contents` is not Premium-gated.** Exactly three paths in the spec mention
  Premium — `/v3/blocks/batch`, `/v3/blocks/batch/{batch_id}` and `/v3/search` — and this is not
  one of them. Candidates can be built on it. It returns full `Channel` objects rather than
  embedded ones.
- **A channel carries `can`, and `ChannelAbilities` includes `add_to`.** Better than the browse we
  designed: candidates can drop channels the token cannot post to. `can` is documented as present
  "only when channel is returned as a full resource", and this endpoint returns full ones — but it
  is nullable, so filter where it is present and keep the channel where it is not.
- **There is no idempotency key.** The only "idempotent" in the whole spec is about joining a
  group. [ADR 41](../adr/0041-a-delivery-that-cannot-be-confirmed-may-duplicate.md) stands as
  written.
- **There is no web permalink in the spec.** `_links.self` is an API URL
  (`https://api.are.na/v3/blocks/12345`), not something a person follows. The routing record's
  `url` therefore has to be **composed by convention** as `https://www.are.na/block/<id>`, which is
  are.na's long-standing public form but is not a documented contract. Noted rather than hidden: if
  it is ever wrong, the record carries a broken link rather than none.

### A slug does not survive a retitle

Tested by hand, 2026-09-07: renaming a channel changes its slug. That is worse than staleness.
`CONTEXT.md` allows a routing record's **pointer** to go stale — it is "best-effort" — but its
**arguments** are "remembered rather than consumed, because a delivery that has not landed is
attempted again from the record alone". An argument has to stay actionable, and a dead slug means a
pending delivery can never land.

Routing templates make it sharper. A template carries arguments and fires on a tag indefinitely, so
one pinned to a slug rots quietly: the channel is retitled, and some days later a tagged capture
fails to route.

So the argument accepts **either form**, which costs nothing because are.na does too:

- `candidates` answers **slugs**, so browsing reads as titles do and remembered places stay legible.
- A person who wants a template that cannot rot pastes the **numeric ID**. The README says why they
  might, and this is the recommended form for a template's argument specifically.
- A `404` on delivery is `rejected`, and its detail names a rename as the likely cause and points at
  the browse to re-pick.

This is not a new class of problem — a vault path is mutable too, and a template pointing into a
renamed folder breaks the same way. It is only louder here, which on balance is better: a renamed
folder is silently recreated, where a renamed channel says so.

---

## Phase 1 — capabilities stop being file-shaped

`create-file`, `append-to-file` and `create-or-append-file` become `create`, `append` and
`create-or-append`. The names generalise so that a vault's note and a board's block are one
capability rather than two, which is what keeps every rule, every composer choice and every
template from being written per kind.

The cost is that **`create` stops promising it will refuse a name already taken**. Both file kinds
still do — `EEXIST`, and `PUT If-None-Match: *` — but that becomes a promise each kind makes rather
than part of what the capability means. Are.na cannot make it.

- [x] Create the branch for this phase.
- [x] Rename the three constants in `packages/output-markdown/src/capabilities.ts` and their values.
- [x] Update every reference across `destination-fs`, `destination-webdav`, `output-markdown` and
      their tests.
- [x] `apps/ui/src/lib/capability.ts`: `DID` becomes bare verbs — `Created`, `Appended`,
      `Created or appended`. The destination is already named on the next line of `Record.svelte`,
      so the noun was redundant. Unknown names still fall through to themselves.
- [x] `apps/ui/src/components/routing/ProcessingComposer.svelte:47`: rename the hardcoded
      `CREATE_FILE` used by the `⇧⏎` gesture, and narrow the comment at line ~429 — the no-clobber
      promise it relies on is now the file kinds', not the capability's.
- [x] Migrate routing **templates**: one `UPDATE` over `capability` in the templates table. A
      template is live — it fires on a tag — so one naming a capability nothing declares is broken
      rather than merely historical.
- [x] Do **not** migrate routing records. Old records keep the old spelling in the pool and in the
      mirror, which stay in agreement; there is no verify or repair to reconcile a divergence
      (`docs/specs/mirror.md:66`). Remembered places keyed on the old names go dark, which is
      accepted.
- [x] Update `docs/specs/core.md` (including line ~211 and the `create-file` promise at ~1013),
      `docs/specs/http-v1.md` (the examples at ~781, ~826, ~841, ~1027, ~1041) and
      `docs/specs/shell.md:658`.
- [x] Update `CONTEXT.md`'s **Capability** entry to the text below.
- [x] Note in both file kinds' READMEs that `create` refuses a name already taken **on that kind**,
      and by what mechanism.
- [ ] Drain any pending deliveries before this lands: one naming an undeclared capability dies.
- [x] Typecheck, tests, lint. `pnpm test:stack` — this crosses the HTTP surface.
- [x] Commit.

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

- [x] Create the branch for this phase.
- [x] Wire `Field.options` into `apps/ui/src/components/settings/DestinationForm.svelte` and
      `apps/ui/src/components/routing/ProcessingComposer.svelte`. Only `TemplateForm.svelte:87`
      reads it today, so an enum argument is a bare text input everywhere else — which is also why
      `folder` is currently typed from memory in the composer. This fixes both.
- [x] Add the `frontmatter` enum to `FILESYSTEM_SETTINGS` and `webdavSettings`, and to their
      readers (`asFilesystemSettings`, `asWebdavSettings`). Both schemas are
      `additionalProperties: false`.
- [x] Add the `frontmatter` enum argument to the three file capabilities in
      `output-markdown/src/capabilities.ts`, absent meaning inherit.
- [x] `renderNote` takes whether to emit frontmatter; both kinds resolve argument over setting over
      off, and pass it.
- [x] The delivery's stored output is what was written, so a note without frontmatter stores
      without it. No change needed — confirm with a test.
- [x] Update `docs/specs/core.md` and `docs/specs/shell.md`. The rule that a renderer may not shadow
      a fixed key still holds; what changes is that the whole block can be off, so provenance is no
      longer guaranteed to be in the file.
- [x] Typecheck, tests, lint.
- [x] Commit.

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
      base URL, no username ([ADR 40](../adr/0040-a-destination-kind-declares-the-shape-of-its-own-account.md)).
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
- [ ] One capability, `create`, with a `channel` argument holding **a slug or a numeric ID** — v3
      accepts either — and carrying the browse annotation. The field's description says that an ID
      survives a retitle and a slug does not, which is what a template's argument should prefer.
- [ ] `accepts` derives from the keys of `arenaRenderers()`, so a payload type with no block form
      is refused by core before a decision is made rather than landing as noise.
- [ ] `candidates`: one page of
      `GET /v3/users/{me}/contents?type=Channel&sort=updated_at_desc&per=100`, with `truncated` set
      from `meta.has_more_pages`. One request. Each entry's `label` is the title and its `value` is
      the **slug**, so what a browse leaves in the field stays legible. Drop a channel whose
      `can.add_to` is false; keep one whose `can` is absent, since the field is nullable and a
      missing ability is not a denial. Group channels are not browsable; the field still accepts
      anything typed by hand.
- [ ] `preview`: converts without reaching the network, unlike WebDAV's, which must read the note it
      would append to.
- [ ] `probe`: `GET /v3/me`, and nothing more — the response does not carry the token's scope, so a
      read-only token passes. Documentation is the only guard, and a `403` at delivery names it.

**Conversion**

- [ ] Define `ArenaRenderer` in the package — `(delivery, at) => ArenaBlock`, a block being text,
      link or image. The host wires `arenaRenderers()` beside the markdown ones, so dialect stays
      the daemon's. Capability name constants still come from `@notemap/output-markdown`; the
      `Renderer` type does not fit and is not reused.
- [ ] A text capture **beginning with a URL** sends `value` = the URL and the remaining prose as the
      description; are.na infers Link, Image or Embed from the value itself. Anything else sends
      `value` = the whole text and becomes a Text block.
- [ ] An image capture posts `{files: [{filename, content_type}]}` to `POST /v3/uploads/presign`,
      which answers `{files: [{upload_url, key, content_type}], expires_in}`. PUT the bytes to
      `upload_url` with that exact `Content-Type` — streamed, never buffered; `Asset.bytes` supplies
      the length — then create the block with `value` set to the uploaded object's URL, derived from
      `key`. The caption becomes both the **description** and the **`alt_text`**; the title is left
      unset. URLs expire in an hour, so presign and upload belong to the same attempt and a retry
      presigns again.
- [ ] Refuse a capture carrying more than one asset. A guard: `packages/client/src/capture/envelope.ts:36`
      builds `assets` as zero-or-one, so only a direct `/v1` caller can trip it.
- [ ] Write provenance into **`BlockInput.metadata`** on create — the block's own key-value pairs,
      not the connection's, so it survives the block being disconnected. Best effort, and shaped to
      the limits: keys alphanumeric or underscore up to 40 characters, scalar values, strings under
      2000, at most 50 keys. Tags flatten to one joined string. It is not queryable, so it is a
      record for a person and never a dedup mechanism.

**Outcome**

- [ ] `pointer` is the block id; `url` is `https://www.are.na/block/<id>`, **composed by
      convention** — the spec offers no web permalink, and `_links.self` is an API URL a person
      cannot follow. First kind to return a `url` at all; `followable()` and `Record.svelte:95`
      already handle it.
- [ ] Output is the block's readable form as markdown; the note says what was dropped — tags,
      artifacts, and any metadata that did not fit.
- [ ] Error mapping: `401` → `rejected` to a probe and `unreachable` to a delivery, following
      WebDAV's asymmetry. `403`, `404` and `422` → `rejected`; an under-scoped token and an
      unwritable channel are both permanent, unlike a rotated password. `408`, `429` and `5xx` →
      `unreachable`. Never follow a redirect with the token attached.
- [ ] README, on both file kinds' model: what a destination is, the one capability, what it will not
      do, and a refused-or-unreachable table.
- [ ] **State the duplicate window plainly in the README**
      ([ADR 41](../adr/0041-a-delivery-that-cannot-be-confirmed-may-duplicate.md)): this kind's
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
[ADR 40](docs/adr/0040-a-destination-kind-declares-the-shape-of-its-own-account.md)).

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
