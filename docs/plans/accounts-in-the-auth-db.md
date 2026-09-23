# An account can be set from the settings page

**Date**: 2026-09-23
**Status**: In progress <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/http-v1.md`, `docs/specs/shell.md`, `docs/specs/security.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> A Nextcloud or are.na account can be created, its secret set, and its secret replaced from
> notemap's settings page, without editing a file or restarting the daemon — and the secret is
> never written to the pool, never reaches the mirror, and is never answered back by any route.
> `[[accounts]]` in the daemon's config keeps working unchanged; where both declare the same kind
> and name, the stored one wins entirely.

---

## The decisions this rests on

Stated here because the implementation is mechanical once they are agreed, and wrong on any one of
them it is worse than what exists. They need an ADR (phase 6), since this amends
[ADR 28](../adr/0028-a-remote-destination-names-a-credential-profile-not-a-url.md) and
[ADR 40](../adr/0040-a-destination-kind-declares-the-shape-of-its-own-account.md).

**It goes in `auth.db`, never in the pool.** ADR 28's reasoning was not "a secret may not be typed
into a browser" — it was that a destination's settings are pool state, answered verbatim by
`GET /v1/destinations` and written to the mirror in the clear, so a secret in one is a secret every
access token can read and every backup keeps. `auth.db` already has exactly the properties wanted:
daemon-owned, beside the pool and never in it, never written by the mirror, and a rebuild from the
mirror restores no way in. Accounts belong there with the credential and the tokens.

**The secret is stored recoverable, and that is said out loud.** Tokens and sessions are hashed
because they are only ever *verified*; an account secret must be *presented* to somebody else's
server, so it cannot be. Encrypting it needs a key, and a key in a file is the file this exists to
remove — so it is plaintext in a database the daemon owns, no worse than the `secretFile` it
replaces and no better. `docs/running.md` and the ADR say so plainly rather than implying a
protection that is not there.

**Session-only, never a bearer token.** The account routes sit behind `requireSession`, like the
token routes, and for the same class of reason
(`apps/daemon/src/middleware/authenticate.ts`). ADR 28's real fear was that whoever can create a
destination over `/v1` could aim the daemon at any address it can reach with a password attached,
on the delivery runner's own timer. Behind a session that is still impossible for a bearer token;
only the person signed in at the browser can do it. This is what makes the whole change safe, and
it is the first thing the ADR should say.

**No route ever answers a secret.** `GET /v1/accounts` answers the kind, the name, the non-secret
fields, whether a secret is set, when it last changed, and where the account came from — `config`
or `stored`. There is no read path for the secret at all, for anybody, ever. The precedent is a
minted token: answered once at mint and never again.

**Precedence is whole-record, never per-field.** Same kind and name in both places means the stored
record is used entirely and the config one is ignored. Merging two half-accounts is undebuggable.
"Update the token in the UI" is served by the *form* seeding itself from the config account's
non-secret fields, so saving copies it into a stored record you own from then on. The list marks
which is which, and the daemon reports a shadowed config account at startup rather than silently
dropping it.

**TOML stays the headless path.** No CLI subcommand in this plan. A container without a browser
keeps `[[accounts]]` with `secretFile`, which is what compose and Docker secrets are for.

**Settled while implementing (2026-09-23).**
- The live account list is a daemon module, `apps/daemon/src/accounts/`. It is loaded at startup
  from both sources, keeps the non-secret listing in memory, and every write goes through it so
  the listing cannot drift. `settingsSchema` stays synchronous. `main.ts` opens `auth.db` before
  the pool.
- Unknown 1 is resolved toward the host. A kind's account schema declares its non-secret fields
  only. The host strips the one `*File`/`*Env` key off a config account before validating, and a
  stored account's fields validate against the same schema. This amends ADR 40.
- `settings/Account.svelte` becomes `Access.svelte`. The new section is `Accounts.svelte`.

---

## Tasks

### Phase 1 — the store

_Depends on nothing._

- [x] Branch `agent/accounts-in-the-auth-db`.
- [x] A migration in `apps/daemon/src/auth/store/migrations.ts` adding an account table, keyed on
      (kind, name): the non-secret fields as a JSON column, the secret as text, `changedAt`.
- [x] `AccountRecord` in `apps/daemon/src/auth/store/types.ts`, and on `AuthStore`: `listAccounts`,
      `getAccount(kind, name)`, `putAccount`, `deleteAccount`. `listAccounts` must be able to
      answer **without** the secret — the route path should never have it in hand at all — so
      either it omits the column or there are two reads. Prefer omitting it; the only caller that
      needs the secret is the resolver, asking for one account by name.
- [x] Tests in `store.test.ts` on the shape the existing ones set: round trip, overwrite by
      (kind, name), delete, and the listing not carrying the secret.
- [x] **Verify**: `pnpm --filter @notemap/daemon test` green; the migration runs against a fresh
      `auth.db` and against one created by the previous version.
- [x] `git commit`

### Phase 2 — the account list becomes dynamic

_Depends on phase 1. No new routes and no behaviour change: with nothing stored, everything works
exactly as it does today. This is the phase that makes the rest possible and the one most likely to
surprise._

Three things read the account list once, at wiring time, and all three must become lazy.

- [x] `accountsFor(kind, accounts)` in `apps/daemon/src/destinations/credentials.ts` builds a `Map`
      at startup. It takes a live source instead — stored first, config second — and resolves per
      delivery. It already reads the *secret* per delivery so that rotation is writing a file; this
      extends the same reasoning to the record.
- [x] `settingsSchema` on each destination kind bakes the account names into `examples` at wiring
      (`packages/adapters/destination-arena/src/destination.ts`, and the webdav equivalent). It
      becomes a getter over the live list, so an account created in the UI appears in the form
      without a restart. Safe to do because names are `examples` and deliberately not an `enum`
      (`packages/adapters/destination-arena/src/settings.ts`) — a stale or missing name is
      cosmetic and cannot turn a destination unusable.
- [x] `apps/daemon/src/ports.ts` reads `baseUrl` off each webdav account at wiring time to hand to
      the adapter. That must move behind the resolver too, or a stored webdav account's address
      will never be seen. *As built*: `baseUrl` already travelled through the resolver, and
      only the plain-HTTP warning read it at wiring. That warning now reads the accounts in use.
- [x] **Verify**: `pnpm -r --silent test` green with no stored accounts — every existing
      destination test passes untouched. `pnpm test:stack` green, since this crosses the host's
      wiring.
- [x] `git commit`

### Phase 3 — validation for a held secret

_Depends on phase 2._

`refuseUnusableAccounts` in `apps/daemon/src/ports.ts` checks each account against its kind's
schema and additionally requires a key ending in `File` or `Env`, which is how the config reader
finds a secret. **A stored account has no such key** — it holds the secret itself — so it cannot
satisfy the schema as written. This is the one place ADR 40's contract has to give.

- [ ] Split the check: a config account validates exactly as today. A stored account validates
      against the same kind schema with the secret-source requirement satisfied by the held secret
      instead, and the `File`/`Env` keys not permitted.
- [ ] Validation for a stored account happens at **write** time, not startup — the daemon is
      already running — and a write that fails answers the issues, which is better than the config
      path's refuse-to-start.
- [ ] Tests for each kind: a valid stored account, one missing a required field, one carrying a
      `File` key it may not have.
- [ ] **Verify**: `pnpm --filter @notemap/daemon test` green.
- [ ] `git commit`

### Phase 4 — the routes

_Depends on phase 3._

- [ ] `GET /v1/account-kinds` — each kind that holds an account, with the schema a client builds a
      form from, mirroring `GET /v1/destination-kinds` exactly. The UI has no other way to know
      that webdav wants a `baseUrl` and a `username` and are.na wants neither.
- [ ] `GET /v1/accounts` — every account from both sources, each carrying `kind`, `name`, the
      non-secret fields, `secretSet`, `changedAt`, and `from: "config" | "stored"`. No secret.
- [ ] `PUT /v1/accounts/{kind}/{name}` — create or replace a stored account. Validated per phase 3.
- [ ] `DELETE /v1/accounts/{kind}/{name}` — removes the stored record. Where a config account of
      the same kind and name exists, this *reveals* it again rather than leaving nothing, and the
      response should make that legible. **Refused while a destination that is not retired names
      it**, with the count — matching "a destination is never removed once a routing record has
      named it".
- [ ] All four behind `requireSession`. A request carrying a bearer token is refused, and there is
      a test for exactly that on each route.
- [ ] Error kinds in the refusals table; `definitions.ts` and the OpenAPI document; the generated
      client types; `packages/client` methods.
- [ ] **Verify**: `pnpm --filter @notemap/daemon test` green; the OpenAPI snapshot test passes; a
      bearer token is refused on all four.
- [ ] `git commit`

### Phase 5 — the settings page

_Depends on phase 4._

- [ ] **Decide the component name first.** `apps/ui/src/components/settings/Account.svelte` is
      today the *signed-in person's* page — sign out, access tokens — which contradicts
      `CONTEXT.md`, where **Account** is reserved for the outward thing and is called "the one word
      in this glossary that points outward". Either rename the existing component or name the new
      one something else. Do not ship two `Account`s meaning different things.
- [ ] A settings section listing accounts, grouped by kind, each showing name, the non-secret
      fields, whether a secret is set, when it changed, and whether it comes from config or is
      stored.
- [ ] A form per kind, built from that kind's account schema over `GET /v1/account-kinds`, on the
      same terms `DestinationForm.svelte` builds a destination's settings form.
- [ ] Editing a **config** account seeds the form from its non-secret fields and saves a stored
      record, with the page saying plainly that the config entry is from then on shadowed.
- [ ] A secret field that is never populated from the server, shows only set / not set, and where
      left blank on an edit leaves the stored secret alone rather than clearing it.
- [ ] Tests beside the components, on the terms `Destinations.test.ts` sets.
- [ ] **Verify**: `pnpm --filter @notemap/ui test` green; by hand, create a webdav account in the
      UI, point a destination at it, and check the destination — it reaches.
- [ ] `git commit`

### Phase 6 — docs and the ADR

_Depends on phase 5._

- [ ] An ADR: an account may be held by the daemon and set from the UI. It must carry the four
      points above — `auth.db` not the pool, recoverable and said so, session-only, whole-record
      precedence — and say what of ADR 28 and ADR 40 still stands. ADR 28's rule that a
      *destination* never holds an address or a secret is untouched and should be restated as
      untouched.
- [ ] `apps/daemon/config.example.toml` — the long `[[accounts]]` comment now describes one of two
      ways, and says which wins.
- [ ] `docs/running.md` — the arena and webdav sections, plus a plain statement that a stored
      secret is recoverable on disk in `auth.db`, and that `auth.db` is not in the mirror so a
      rebuild leaves every account to be set again.
- [ ] `CONTEXT.md` — the **Account** entry says an account is "declared in the daemon's config
      under `[[accounts]]`". Now it is declared there or held by the daemon.
- [ ] **Verify**: `pnpm -r --silent test`, `pnpm -r --silent typecheck`, `pnpm -r --silent lint`.
- [ ] `git commit`

### Phase 7 — the full-stack test

_Depends on phase 6._

- [ ] `tests/full-stack`: an account created over the routes is used by a real delivery; a stored
      account shadows a config one of the same kind and name; a bearer token is refused where a
      session succeeds; a deleted stored account reveals the config one again.
- [ ] **Verify**: `pnpm test:stack` green.
- [ ] `git commit`

---

## Unknowns

1. **Whether the secret-source keys belong in the kind's account schema at all.** Phase 3 works
   around them; the cleaner shape may be for a kind to declare its non-secret fields and for
   "where the secret comes from" to be the *host's* concern in both paths, which would simplify
   ADR 40 rather than amending it. Worth ten minutes before phase 3. *Fallback*: the split
   described, which is confined to one function.
2. **What an in-flight delivery does when its account changes mid-run.** The resolver reads per
   delivery, so a replacement lands on the next attempt and a retry after a fixed secret just
   works — but a delivery already holding the old secret will fail and retry, which is probably
   right and should be confirmed rather than assumed.
3. **Migration of `auth.db` in the container.** The volume carries an existing database; confirm
   the migration runner handles a schema bump in place, since nothing has needed one since the
   token table. *Confirmed*: `migrate` applies from `user_version` onward, and `store.test.ts`
   opens a database written before the accounts table.

---

## Not in this plan

Relays reading a stored secret over `/v1`. That would make the daemon a secret server for any
token holder and needs scoped tokens first — the gap `docs/specs/security.md` already parks. A
relay keeps its own upstream secret in its own file until then.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Two tests matter more than the rest and should exist from the phase that makes them possible: a
bearer token is refused on every account route, and no route answers a secret under any shape.

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
