# 49. An account may be held by the daemon and set from the settings page

**Date**: 2026-09-23
**Status**: Accepted — amends [ADR 28](0028-a-remote-destination-names-a-credential-profile-not-a-url.md) and [ADR 40](0040-a-destination-kind-declares-the-shape-of-its-own-account.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

Until now an account could only be declared in the daemon's config under `[[accounts]]`, with its
secret in a file or an environment variable. Changing a Nextcloud app password or an are.na token
meant editing a file on the host and, for a new account, restarting the daemon. Can a person
create an account and set or replace its secret from the settings page without weakening what
ADR 28 protects?

---

## Decision drivers

- **Only a signed-in person may do this.** ADR 28 feared that anyone able to create a destination
  over `/v1` could point the daemon at any address it can reach, with a password attached, on the
  delivery runner's timer. Whatever lets a browser write an account must keep that out of reach of
  a bearer token.
- **The secret must stay out of pool state.** A destination's settings are answered verbatim by
  `GET /v1/destinations` and written to the mirror in the clear. A secret kept there is readable by
  every access token and kept by every backup.
- **No protection may be implied that is not there.** Hashing only works for something that is
  verified. An account secret has to be presented to another server.
- **Config stays usable without a browser.** A container keeps `[[accounts]]` with `secretFile`,
  which is what compose and Docker secrets are for.

---

## Considered options

1. **Store accounts in `auth.db`, behind a session** — beside the credential and the tokens.
2. **Store accounts in the pool** — as rows beside destinations.
3. **Encrypt the stored secret** — with a key the daemon reads at startup.
4. **Write the account into the config file from the UI.**
5. **Keep config as the only way.**

---

## Decision outcome

Chosen: **Option 1**. An account may be **stored**: kept in `auth.db`, written over
`PUT /v1/accounts/{kind}/{name}` and removed over `DELETE`, and listed alongside config accounts by
`GET /v1/accounts`. It rests on four points.

- **Session-only.** Every account route, `GET /v1/account-kinds` included, sits behind
  `requireSession`. A bearer token is refused with `session-required`. This is what keeps ADR 28's
  fear out of reach, so it comes first.
- **`auth.db`, never the pool.** `auth.db` is owned by the daemon, sits beside the pool rather than
  inside it, and is never written to the mirror. A pool rebuilt from the mirror restores no account,
  just as it restores no credential and no token.
- **Stored recoverable, and documented as such.** The secret is plaintext in `auth.db`, mode 0600.
  That is the same protection as the `secretFile` it replaces, no more and no less. Encrypting it
  would need a key in a file, which is the file this change exists to remove. No route ever answers
  a secret. `GET /v1/accounts` answers `secretSet` and nothing more.
- **Precedence is whole-record.** Where a stored account and a config account share a kind and a
  name, the stored one is used entirely and the config one is ignored. It is still listed, marked
  `shadowed`, and the daemon logs it at startup. The settings form seeds itself from the config
  account's non-secret fields, so editing one copies it into a stored record.

The same change settles where the secret source belongs. **A kind's account schema now declares
only the fields beside the secret.** Kind, name and where the secret is read from are the host's.
A config account is checked after the host strips its kind, its name and its one `*File` or `*Env`
key. A stored account's fields are checked against the same schema, and a `*File` or `*Env` key
among them is refused whatever the kind allows. This is what lets one schema serve both paths and
also serve as the account form.

### What still stands

- ADR 28's rule that **a destination never holds an address or a secret** is untouched. A
  destination names an account, and its settings have nowhere to put either.
- ADR 40's rule that **a kind declares the shape of its own account** stands, narrowed to the
  fields beside the secret.
- Resolution still happens per delivery, and nothing secret reaches core, the pool, the mirror or
  an API answer.

### What changes from ADR 40

- A kind no longer names its secret key. `passwordFile` and `secretFile` both keep working for any
  kind, since the host accepts exactly one key with a `File` or `Env` suffix. The naming reasons in
  ADR 40 are now convention in the examples, not something the schema enforces.

### Consequences

- **Good** — an account can be added, and its secret rotated, from a browser, and it takes effect
  on the next delivery with no restart.
- **Good** — one validation path and one schema for config and stored accounts, and that schema
  is also what `GET /v1/account-kinds` publishes to build the form.
- **Bad** — a readable secret now sits in `auth.db`. Whoever can read that file can read every
  stored account. This is stated in `docs/running.md`.
- **Bad** — rebuilding from the mirror leaves every stored account to be set again.
- **Neutral** — removing a stored account is refused while a destination that is not retired names
  it, unless a config account of the same kind and name takes over.

---

## Pros and cons of the options

### Option 1 — `auth.db`, behind a session

- **Good** — already has the properties needed: owned by the daemon, not in the mirror, file mode
  0600, and migrated in place.
- **Bad** — plaintext at rest.

### Option 2 — the pool

- **Bad** — the pool is mirrored and answered over `/v1`. That puts the secret everywhere ADR 28
  kept it out of.

### Option 3 — encrypted at rest

- **Bad** — the key has to live somewhere the daemon can read at startup, which puts a secret back
  in a file. The protection would be mostly theatre, and it would read as more than it is.

### Option 4 — write the config file

- **Bad** — the daemon would rewrite a file people keep in dotfiles, comments and all. The secret
  would still need a file of its own.

### Option 5 — config only

- **Good** — nothing new to protect.
- **Bad** — a browser-first install has no way to add an account without a shell on the host.

---

## More information

Plan: [accounts-in-the-auth-db](../plans/accounts-in-the-auth-db.md). Specs:
[http-v1](../specs/http-v1.md), [security](../specs/security.md), [shell](../specs/shell.md).

Revisit if scoped access tokens arrive, since a scope might safely admit a token to these routes,
or relays reading a stored secret over `/v1`. Also revisit if the daemon gains a key store it
already has to protect, because at-rest encryption would then cost no new file.
