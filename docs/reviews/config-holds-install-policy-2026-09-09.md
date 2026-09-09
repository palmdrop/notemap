# Review: `config.toml` holds what an install is (PR #52)

**Date**: 2026-09-09
**Status**: Resolved <!-- Open | Partially addressed | Resolved -->
**Scope**: `main...agent/config-holds-install-policy`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`

---

## Overall

The change does what it says and the reasoning holds: all three blocks were either
unreadable-by-anything or had exactly one correct value, and the seam chosen — core exports
`PAYLOAD_TYPES`, the host puts it on the `PoolConfig` it builds — keeps `checkPayload` validating
against data it was given, which is what the integration fixture's `SECOND` type depends on. No
bugs. Typecheck, `pnpm -r --silent test` and `pnpm lint` are green here, as the PR body claims.

What is left is drift the removal created and did not sweep: a test comment naming a field that no
longer exists, two file-level comments that now overstate, and an ADR relation that neither matches
the repo's backlink convention nor, arguably, the word it uses.

---

## Bugs

None.

---

## Design

### 1. ADR 43 says it narrows ADR 20; ADR 20 does not know, and "narrows" is the wrong word

`docs/adr/0043-config-holds-what-an-install-is.md:4` — the repo's precedent is a backlink on the
narrowed ADR: ADR 20's own Status carries *"narrowed for credential-holding kinds by
[ADR 28]"*. ADR 43 adds no such line to ADR 20, so reading ADR 20 alone leaves you thinking the
config story ends there.

Separately, *narrows* looks wrong. ADR 20 decided destinations are pool state; ADR 43 does not
restrict that decision at all — it applies ADR 20's **reasoning** to three unrelated blocks. The
honest relation is "extends" or "applies". Either fix the word or accept it and add the backlink;
doing neither leaves the ADR graph asymmetric.

---

## Minor

### 2. A test comment still explains a field the branch deleted

`tests/integration/src/capture.test.ts:322` — *"The only policy a source carries today is
`autoRequest`, and there are no enrichments configured for it to name"*. `autoRequest` exists
nowhere in the tree after this branch, and "configured" is the shape ADR 43 removed. The test's
title — *"carries no policy, which is the whole of what declaring one buys"* — is about declaring,
which is likewise gone. The assertion is still right; only its explanation is stale, and AGENTS.md
puts a stale comment below no comment.

### 3. `config.example.toml` claims the opposite of what it means about restarts

`apps/daemon/config.example.toml:19` — *"Nothing in here needs a restart to be worth writing."*
Read plainly, that says a change to this file takes effect without restarting the daemon, which is
false. The intent is the reverse: everything here is settled once at install time, so needing a
restart costs nothing. Rephrase.

### 4. "Keys are core's own names" survived the change that made it false

`apps/daemon/src/config/load.ts:87` (*"Keys are core's own names. Absent lists mean empty."*) and
`apps/daemon/config.example.toml:8` (*"Keys are core's own names, so `docs/specs/core.md` reads as
documentation for this file."*). With `[[payloadTypes]]`, `[[sources]]` and `[[enrichments]]` gone,
what remains — `daemon`, `mirror`, `assets`, `capture`, `routing`, `delivery`, `accounts` — is the
host's vocabulary, not core's, and `core.md` no longer documents any of it. The claim was loose
before; this branch is what makes it wrong.

### 5. Per-entry key naming lost its only test, and may now be unreachable

`apps/daemon/src/config/load.test.ts:190` replaced *"names one inside a list, by the entry it was
in"* (`sources.0.autoTag`) with a test asserting nothing inside an `[[accounts]]` entry is
stripped. `accounts` is now the only array in `fileSchema` and it is a `looseObject`, so the array
branch of `droppedKeys` (`load.ts:281`) can no longer report a dropped key from any input. The
branch is either dead or a guarantee for a future list — worth deciding which, rather than leaving
untested code that used to be covered.

### 6. Branch has no plan

`agent/config-holds-install-policy` with no `docs/plans/config-holds-install-policy.md`. AGENTS.md
says branch per plan, `agent/<plan-file-stem>`. Plausibly deliberate for a removal this size, but
the branch name promises a file that is not there.

---

## Non-issues

- **`PoolConfig.payloadTypes` kept although every real host passes the same constant** — that is
  ADR 43's option 1, and the integration fixture's `SECOND` type is exactly what the retained seam
  buys. Core reaching for its own list would be ambient config in a per-pool object.
- **The client still hardcodes `"note"` rather than importing `PAYLOAD_TYPES`** — `@notemap/client`
  does not depend on `@notemap/core`; it speaks the generated wire types. The stack suite is what
  ties the two spellings together.
- **ADR 20, ADR 38, `docs/plans/*` and `core.md`'s 2026-08-08 Shipped entry still name
  `autoRequest` / `config.sources`** — dated records, correct as of their date; editing them would
  erase history the repo deliberately keeps.
- **`http-v1.md` gets no `Shipped:` entry** — nothing on the wire changed; the edit is to a
  decision bullet that documents the config file, not to `/v1`.
- **Dropping *"refuses a payload type with no schema"*** — that refusal was the file schema's, and
  the file no longer declares payload types.
- **`expect(...).toBe(PAYLOAD_TYPES)` identity assertions** — asserting the host hands core's own
  list back, rather than a copy that could drift, is the point of the test.

---

## Resolution

Reconciled with palmdrop's review on the PR, which added two findings of its own — the unknown-key
paragraph in `config.example.toml` and the whole install paragraph in `docker/compose/config.toml`,
both cut as asked.

1. **Fixed.** ADR 43 *extends* ADR 20 rather than narrowing it, and ADR 20's Status now names it.
2. **Fixed.** The comment is gone; the test says what it asserts in its title, and the block around
   it stops describing a source as one core was told about.
3. **Fixed.** The restart sentence is gone with the rest of the header prose.
4. **Fixed.** "Keys are core's own names" is gone from both `config.example.toml` and the schema in
   `load.ts`.
5. **Won't fix.** The array branch of `droppedKeys` stays: it implements the function's stated
   contract, and with `accounts` the only array left and deliberately loose, there is no input that
   reaches it — so a test for it would need the module's surface widened for nothing.
6. **Dropped.** Deliberate; a removal this size gets no plan.

Swept alongside them, on the same files: the prior-state clauses in `pool/index.ts` and
`pool/payload.ts`, and three comments in `load.test.ts` and `testing/fixture.ts` that restated the
test or the type beneath them.
