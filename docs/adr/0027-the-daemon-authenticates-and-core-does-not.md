# 27. The daemon authenticates, core does not, and the implementation is ours

**Date**: 2026-08-31
**Status**: Accepted
**Deciders**: palmdrop

---

## Context and problem statement

On 2026-08-02 `/v1` was given no authentication, and the reasoning was recorded plainly: the
daemon binds `127.0.0.1` on one person's machine, so the bind address is the boundary and the pool
behind it is already as reachable as the filesystem it sits on.

That held for exactly as long as the deployment did. The container binds `0.0.0.0` — a container
that binds loopback is reachable from nothing, not even the proxy in front of it — and the compose
files, the release images and `running.md` describe a daemon somebody else's network can reach.
At that point "the bind address is the whole of the defence" stops being a decision and becomes a
description of what is missing.

So: who authenticates, and with what?

---

## Decision drivers

- **Core is host-agnostic** ([ADR 2](0002-core-is-a-host-agnostic-library.md)). A second host —
  a CLI, a desktop app, something embedded — picks its own scheme or has none, and neither should
  inherit a decision made for an HTTP daemon.
- **Credentials must never enter the pool.** The mirror writes pool state to disk in the clear, and
  a rebuild reads it back; a credential in there would be a password in a plaintext file and would
  be restored by a rebuild that should have issued new ones.
- **Anything that is not a browser has to be able to hold a credential**, without a browser in the
  loop and without sharing the one the person uses.
- **A refusal must stay in `/v1`'s own envelope.** An offline-capable client parses one shape; an
  HTML redirect is not readable by it and a 302 to somebody else's login page is worse than a 401.
- Notemap is **single-user by design** ([core.md](../specs/core.md)). Nothing here should make
  multi-user cheaper to add, and nothing should pretend it is already possible.

---

## Considered options

- A reverse proxy in front, doing the authentication.
- Better Auth, or a comparable in-process library.
- Password-and-session authentication, written here.

---

## Decision outcome

**The daemon authenticates, and the implementation is ours.** One middleware over the whole of
`/v1` takes either a session cookie or `Authorization: Bearer`; a request carrying neither is
`401 unauthenticated` in the daemon's existing refusal envelope. A person signs in with one
password and gets a session. Anything that is not a browser carries an access token it was issued,
which can be named, listed and revoked one at a time.

**Core gains nothing.** No user, no credential, no notion that a request has an author. The
credential lives in a SQLite file the daemon owns beside the pool — not in it, because it is not
the pool's material, it is not mirrored, and a pool rebuilt from its mirror is a new deployment
that should issue new tokens.

**The credential carries a username and the domain gains no user.** A login form asks for a name
and clients expect that shape, so the credential has one; the pool, the mirror and the client gain
no user entity. Memos is not the counter-example it looks like — it genuinely supports several
people with roles, so its user model is used rather than vestigial. The hosted service that would
change this is *one pool per person*, which is tenancy above the daemon rather than users inside a
pool.

### Consequences

- A daemon nobody has set a password on asks for nothing and behaves exactly as it did before.
  That keeps a loopback daemon on a laptop as easy as it was, and it is a default that is off,
  which someone will deploy by accident — so the daemon says so loudly on startup and names the
  command that fixes it.
- Security-sensitive code is now ours to get right: password hashing, session and token minting,
  storage, comparison and expiry. The primitives sit behind a small port inside the daemon so that
  adopting a library later is wiring rather than a rewrite.
- TLS stays the proxy's. The daemon cannot see it and is told rather than left to guess whether a
  session cookie may travel.
- **Authorization is deferred, not decided.** A credential answers *who*; nothing answers *what*.
  The one exception is containment rather than permission — an access token may not manage access
  tokens or end every session, so a leak cannot mint its replacement or hide itself. The trigger
  for revisiting is recorded in [security.md](../specs/security.md).
- The trigger for a *user* to earn its place is recorded too, and it is not this one: `Agent`
  already carries a `{ kind: "person" }` variant with no identity on it, stamped on every tag,
  artifact and suggestion. The day two people's tags must be told apart, that variant grows a name.

---

## Pros and cons of the options

### A reverse proxy doing the authentication

Real, and already in the deployment for TLS. But it cannot revoke one client without changing
every client — there is one credential at the proxy and everybody shares it. It protects nothing
from whatever is already inside the network, which is the container network the daemon sits on.
And its login is an HTML redirect: a client that has to work offline cannot read one, and cannot
tell it from the daemon being down.

The proxy keeps TLS, which is the part it is good at.

### Better Auth, or a comparable library

It would make social login a config block, and it is written by people who do this for a living.
Against that: it is multi-user by construction, in an application that defines no user, so most of
what it models would be vestigial. It owns a database and a migration CLI, which is a second
schema and a second lifecycle in an image that currently has two directories. Its endpoints sit
outside `/v1`, so its refusals are not in this document's envelope and its routes are not in the
generated OpenAPI document.

The decision is *for the current product* — a self-hosted single-user pool. The hosted multi-user
service that would overturn it is a different product, and would revisit this anyway, most likely
with an identity provider rather than an in-process library. **Declined for now, not dismissed**,
which is why the port exists.

### Password-and-session authentication, written here

This is the mechanism the libraries implement, not a lesser substitute for one: a slow KDF over the
password, a high-entropy secret per session stored as a digest, constant-time comparison, expiry
checked on use, and the session id regenerated on sign-in. It is a known quantity with published
guidance to hold it against, and the failure modes are the documented ones rather than novel.

It is also the reason for the choice as much as the result of it: this is a learning project, and
owning the mechanism is worth more here than owning a wrapper around it.

---

## More information

- [security.md](../specs/security.md) — what is defended, what is not, and the acceptance criteria.
- [login-and-access-tokens.md](../plans/login-and-access-tokens.md) — the plan this came from,
  including the references read before writing it.
- [ADR 23](0023-a-changed-pool-identity-drops-the-cache-and-keeps-the-outbox.md) — the rule signing
  out follows, for the same reason.
