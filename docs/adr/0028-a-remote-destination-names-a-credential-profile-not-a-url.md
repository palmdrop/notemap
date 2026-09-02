# 28. A remote destination names a credential profile, not a URL

**Date**: 2026-09-01
**Status**: Accepted — narrows [ADR 20](0020-destinations-are-pool-state.md). Amended 2026-09-02:
the word is **account** and the config block is `[[accounts]]`, generic across kinds, and plain
HTTP to an address that is not private is warned about rather than refused. The decision is
unchanged; what changed is the spelling of it and one enforcement that was wrong in practice
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

Every destination kind so far is local. A filesystem destination's settings are a path, the daemon
holds no secret to reach it with, and the worst a wrong one does is write a note somewhere silly —
which is why the containment rules in [security.md](../specs/security.md#a-filesystem-destination-reaches-only-what-is-mounted)
are described as a check against a mistake rather than a permission.

WebDAV is the first kind that is neither. It needs a password, and it needs an address to send that
password to. Both of those want to live in `settings`, which
[ADR 20](0020-destinations-are-pool-state.md) made pool state — created over `/v1`, mirrored to
disk, restored by a rebuild. That ADR named the collision in its own consequences: "the first kind
that needs a credential will put it in pool state, which the mirror writes to plain files."

So: where does a remote destination's credential live, and who decides what address it is sent to?

---

## Decision drivers

- **`GET /v1/destinations` answers `settings` verbatim** to any signed-in caller, and nothing
  narrows what a caller may do ([security.md](../specs/security.md#authentication-answers-who-and-nothing-answers-what)).
  A secret in a setting is a secret every access token can read.
- **The mirror writes settings to disk in the clear**, at `pool-mirror/destinations/<id>.json`. A
  secret that reaches the mirror survives being deleted from everywhere else, which is the same
  reasoning that keeps the auth database out of the pool
  ([ADR 27](0027-the-daemon-authenticates-and-core-does-not.md)).
- **A URL in `settings` is an address the daemon will send a credential to.** Creating a
  destination is a `/v1` write, so whoever can make one can aim the daemon at any host it can
  reach — a sibling container, a loopback service, somewhere of their choosing — and have it
  deliver *with the credential attached*, repeatedly, on the delivery runner's own timer. That is
  server-side request forgery with credential disclosure at the end of it. Authentication shuts the
  outer door; this has to hold with somebody signed in.
- **The host reads config and secrets; core evaluates** ([core.md](../specs/core.md)). Core has
  never sourced anything, and a credential is the strongest case yet for keeping it that way.
- **A destination must stay a thing a person creates in a form.** That is what
  [ADR 20](0020-destinations-are-pool-state.md) bought, and an answer that sends people back to a
  text editor to add a vault gives it away.

---

## Considered options

1. **The secret in `settings`, redacted on the way out** — one place to look, and the API and the
   mirror both learn to blank it.
2. **The secret referenced by name, the URL still in `settings`** — settings name a credential the
   daemon resolves, and keep the address.
3. **A credential profile carrying the address and the secret together** — the host's config
   declares named profiles; settings choose one by name and a path within it. *(Called an **account**
   since 2026-09-02; the option is written here as it was weighed.)*

---

## Decision outcome

Chosen: **option 3**.

- The host's config declares named **accounts** (`[[accounts]]`, amended 2026-09-02 from "credential
  profiles" — the word is [CONTEXT.md](../../CONTEXT.md)'s). An account names the kind that speaks
  to it and carries the base URL, the username and where the secret is read from, and is resolved as
  one thing. The daemon reads the block without knowing what any kind is.
- A destination's settings name an **account** and a **root** within it — never a URL, never a
  secret. The root is a path under the account's collection, and it is the destination, exactly as
  the filesystem kind's `root` is.
- The adapter is constructed by the host and **closes over a resolver**, so neither core nor the
  pool ever holds a secret, and no route can answer with one it does not have.
- A secret is read from a **file or an environment variable**, named in config. An inline password
  is refused at load, naming the two keys that are allowed: `config.toml` is a file people keep in
  dotfile repositories and paste into issues.
- **Redirects are never followed with a credential attached**, and TLS verification is never
  disabled. Both are one line to get wrong and neither is visible afterwards.
- Plain HTTP to an address that is **not private** is named on startup and then used *(amended
  2026-09-02; this was a refusal at load, and it refused the ordinary deployment — a server beside
  the daemon on a container network, which is neither loopback nor certificated — and took the
  whole daemon down with one such account. Whether a given network is safe is not a thing the
  daemon can tell, so it says so and the operator decides)*.
- A credential that will not resolve is **not** `unusable`. The settings satisfy the schema and
  nothing about the destination is wrong; `describe()` still answers, doing no I/O, and the
  delivery reports `unreachable` naming what it could not read — the same answer an unmounted drive
  gets, and retried on the same terms.
  *Narrowed 2026-09-02 by [ADR 29](0029-a-destination-can-be-asked-whether-it-is-really-there.md):
  a **probe** answers the same fact `rejected` rather than `unreachable`. What this clause protects
  is retry semantics — a delivery that could not read a credential must stay pending and be
  attempted again — and a probe has none to protect. It is a person asking once, and the true answer
  is that waiting will not fix it. The delivery path is unchanged.*

This **narrows [ADR 20](0020-destinations-are-pool-state.md) without reversing it.** Destinations
stay pool state: created, renamed, retired, deleted, mirrored, and restored by a rebuild. What
changes is that for a kind holding a credential, *which endpoint* stops being a person's free-text
field. A vault is still added in a form; adding the *account* the vault is on is a config edit,
once, which is where a secret was always going to have to be typed anyway.

### Consequences

- **Good** — nothing secret enters the pool, the mirror or an API response, and no redaction rule
  has to be written or remembered. The property holds because there is nothing to redact.
- **Good** — a credential cannot be redirected by editing a destination. The set of addresses the
  daemon will authenticate to is fixed by a file only the operator writes, so the forgery above
  needs filesystem access, which is a different and much larger thing to have.
- **Good** — one account serves many destinations. Two vaults on one Nextcloud account are two
  rows naming one account, and rotating the password is one file.
- **Bad** — adding an account is no longer a form, and it needs a restart. Accepted: it is the
  one part of a destination that is genuinely the operator's, and the alternative is either a
  secret in mirrored state or a redaction scheme that has to hold in three places forever.
- **Bad** — a destination naming an account that is not there validates fine and fails at delivery.
  Accepted deliberately, above: `describe()` doing I/O would make every settings screen stall on a
  destination that is merely asleep ([ADR 26](0026-a-destination-can-be-asked-what-an-argument-could-hold.md)),
  and a config typo is exactly the shape of thing a retry fixes.
- **Neutral** — the base URL is now pasted once into config rather than into a form, which settles
  the open question of how much of Nextcloud's URL layout a kind named for a protocol should
  assume: none. The person supplies the DAV collection URL; the adapter appends path segments to
  it and nothing else.

---

## Pros and cons of the options

### The secret in `settings`, redacted on the way out

- **Good** — one place to look, and a destination stays entirely a form.
- **Bad** — the redaction has to hold in the API, the mirror and every rebuild, forever, and a new
  route or a new field reopens it silently. A secret is not a thing to guard with a list of places
  that must remember to blank it.
- **Bad** — leaves the forgery untouched, because the URL is still a person's field.

### The secret referenced by name, the URL still in `settings`

- **Good** — the mirror and the API are clean, which was the stated problem.
- **Bad** — solves the half that was written down and leaves the half that decides the shape. A
  named secret aimed at an arbitrary host is a credential handed to whoever names the host.
- **Bad** — invites a per-destination allowlist to close it, which is the profile from this
  option with more moving parts and a worse failure mode.

---

## More information

Written for [destination-webdav](../plans/destination-webdav.md) phase 2, which is the first kind
that needs it. The rule it satisfies was stated ahead of it in
[security.md](../specs/security.md#no-destination-setting-may-hold-a-secret): a destination that
needs a credential holds a reference to one and never the credential itself.

[ADR 20](0020-destinations-are-pool-state.md) anticipated this in its closing line — "revisit if a
kind arrives whose settings are large or secret enough that a row in a mirrored table is the wrong
place for them" — and this is that revisit. Host wiring of adapters is unchanged and stays
[ADR 8](0008-adapters-are-in-process-and-wired-by-the-host.md)'s.

Revisit if a second kind wants profiles shaped differently enough that one config block cannot
serve both, or if a credential ever needs to be rotated without a restart — at which point the
profile store, rather than the profile, is what wants rethinking.
