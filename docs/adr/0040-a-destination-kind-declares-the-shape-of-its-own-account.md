# 40. A destination kind declares the shape of its own account

**Date**: 2026-09-07
**Status**: Accepted — narrows [ADR 28](0028-a-remote-destination-names-a-credential-profile-not-a-url.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

[ADR 28](0028-a-remote-destination-names-a-credential-profile-not-a-url.md) moved a remote
destination's credential into the daemon's config, under `[[accounts]]`, and fixed what an account
is: a base URL, a username, and where the secret is read from. That is Basic authentication's
shape, because WebDAV was the only kind that needed one.

Are.na is the second. It authenticates with a bearer token and has no username; its base URL is a
constant of the service rather than anything an operator supplies. None of the three fields fits,
and two of them are required at load.

So: how does one config block serve two kinds whose credentials have nothing in common?

---

## Decision drivers

- **The load-time refusal is worth keeping.** `readAccounts` refuses at parse — an inline password,
  neither or both of the two secret sources, a duplicate `kind`+`name`, a base URL that is not
  HTTP. A malformed account fails when the daemon starts rather than at the first delivery, hours
  later, on a runner's timer.
- **One of those checks is already variant-specific.** Refusing a non-HTTP `baseUrl` is a rule
  about Basic auth over a URL. It means nothing to a kind that has no URL, and it is enforced today
  in a function that is meant to know nothing about kinds.
- **No dummy fields.** A bearer account carrying `username = ""` to satisfy a schema would pass
  every check and describe nothing true. A shape that has to be lied to is the wrong shape.
- **Core must not learn what an account is.** ADR 28's central property is that neither core nor
  the pool ever holds a secret, and `DestinationKindAdapter` lives in `packages/core`. A field
  there that core defines and never reads would put the word into the one place ADR 28 kept it out
  of.
- **A destination stays a thing a person creates in a form.** Whatever changes, adding a *vault* or
  a *channel* must not become a config edit.

---

## Considered options

1. **Loosen `Account`** — `baseUrl` and `username` become optional, adapters check what they need
   when they resolve one.
2. **Tag the union by authentication** — an `auth` key selecting `basic` or `bearer`, validated per
   variant at load.
3. **Each kind declares its own account schema**, validated by the host at startup.
4. **A separate `[[tokens]]` block** beside `[[accounts]]`, for credentials that are not logins.

---

## Decision outcome

Chosen: **option 3**.

- Each adapter package **exports an account schema** as a constant, beside its `create*Destination`.
  `apps/daemon/src/ports.ts` — which already names every kind, already filters accounts by kind,
  and already holds the ajv validator — validates each account against its kind's schema at startup
  and refuses to start on one that fails.
- **`kind` is the discriminator.** There is no `auth` tag: a kind's schema already says what its
  accounts look like, and a tag would be a second answer to the same question, free to disagree
  with the first.
- **`parseConfig` keeps only the kind-agnostic checks** — no inline secret, exactly one secret
  source, unique `kind`+`name`. The non-HTTP `baseUrl` refusal moves into the WebDAV schema, where
  it was always a statement about that kind.
- **The secret's key is the kind's too.** WebDAV keeps `passwordFile` and `passwordEnv`, because a
  password is what it holds. Are.na uses `secretFile` and `secretEnv`: a bearer token is not a
  password, and `token` is already spent — in notemap an **access token** is a credential notemap
  *issues*, and an account's secret is never notemap's.
- **The host resolves an account to the validated raw object plus its secret**, and the adapter
  reads that into its own credential type — the idiom `asWebdavSettings` and `asFilesystemSettings`
  already use for settings, on the same reasoning: a schema that passed once is not a type.
  `ResolvedAccount` retires.
- **Core is untouched.** No `accountSchema` on `DestinationKindAdapter`, and nothing about accounts
  reaches `/v1`.

This **narrows ADR 28 without reversing it**, and is the revisit that decision asked for in its own
closing line: *"Revisit if a second kind wants profiles shaped differently enough that one config
block cannot serve both."* Everything ADR 28 decided still holds — the secret and the address are
the host's, a destination names an account and a place within it, the adapter closes over a
resolver, and nothing secret enters the pool, the mirror or an API answer. What changes is that the
*shape* of an account stops being one thing the daemon knows and becomes something each kind says.

### Consequences

- **Good** — a kind whose credential shape nobody anticipated needs no change to the daemon's
  config types. It adds a schema and a reader in its own package, and a line in `ports.ts`.
- **Good** — the load-time refusal survives and gets sharper: a check that was universal and wrong
  for half the kinds becomes a check that is right for the kind it belongs to.
- **Good** — core stays ignorant of accounts, which is the property ADR 28 spent its length on.
- **Bad** — two validation vocabularies in config: zod for the file's overall shape, JSON Schema
  for one block within it. Accepted, because the second is per-kind and lives with the kind, and
  because JSON Schema is already what an adapter publishes for settings.
- **Bad** — `ports.ts` grows a line per kind. Accepted: it already grows a `create*Destination`
  call per kind, and this is the same knowledge in the same place.
- **Neutral** — the account schema is not published over `/v1`. Nothing renders it, so no settings
  page can explain what an are.na account needs; `config.example.toml` documents it, as it
  documents everything else in that file.

---

## Pros and cons of the options

### Loosen `Account`

- **Good** — the smallest possible diff, and every existing config keeps working untouched.
- **Bad** — the load-time refusal dissolves. With every field optional there is nothing left to
  check at parse, so a malformed account fails at the first delivery instead — which is the failure
  mode ADR 28 deliberately moved forward.
- **Bad** — it invites the dummy field. Nothing stops a `bearer` account carrying a `username`, and
  nothing reports it.

### Tag the union by authentication

- **Good** — explicit, and validation stays at load. A future kind using Basic auth reuses the
  variant rather than adding one.
- **Good** — the daemon branches on how you authenticate rather than on which kind, which keeps it
  ignorant of kinds.
- **Bad** — the tag duplicates `kind`, which already determines the answer. Two fields that must
  agree, and nothing makes them.
- **Bad** — it only scales to the shapes someone thought of. A kind wanting a header name, a
  region, or a pair of keys widens a union in the daemon rather than adding a file beside it.

### A separate `[[tokens]]` block

- **Good** — `Account` is untouched, and two genuinely different things get two names.
- **Bad** — a destination would then name a *token* for one kind and an *account* for another, so
  the single invariant that a remote destination names something in config becomes two, and
  `CONTEXT.md` grows a second entry for what is one idea.
- **Bad** — the split is by credential type, which is exactly the thing that keeps varying. A third
  shape wants a third block.

---

## More information

Written for the are.na destination ([plan](../plans/arena-destination.md)), which is the second
kind to need a credential and the first whose credential is not a login.

Revisit if a kind's account needs something a schema cannot check — a secret that must be exchanged
before it is usable, or one that expires and has to be refreshed — at which point what wants
rethinking is the resolver rather than the shape. Revisit also if an account schema turns out to be
worth rendering, which would mean publishing it somewhere `/v1` can reach.
