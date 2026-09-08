# @notemap/destination-webdav

A **destination** that is a folder on a WebDAV server — a Nextcloud vault, most immediately. An
item routed at one arrives as a markdown note the server already knows about: no `occ files:scan`,
no shared volume, no uid to align.

The note itself is [`@notemap/output-markdown`](../../output-markdown/README.md), the same code the
filesystem kind writes with, so a vault reached over the network and a vault on disk get the same
note rather than two dialects of one.

## What a destination is, and what it is not

Settings are an **account** and a **root**: the name of an account in the daemon's own
configuration, and a folder under that account's collection.

There is nowhere in them to put a URL or a password, and that is the point
([ADR 28](../../../docs/adr/0028-a-remote-destination-names-a-credential-profile-not-a-url.md)).
Settings are pool state — `GET /v1/destinations` answers them verbatim and the mirror writes them
to disk in the clear — so a password in one is a password every access token can read and every
backup keeps. And a URL in one is an address the daemon will send that password to: creating a
destination is a `/v1` write, so a free-text endpoint would let whoever can make a destination aim
the daemon anywhere it can reach, with the credential attached, on the delivery runner's own timer.

The account is declared in `config.toml` instead, carrying the base URL, the username and where the
secret is read from, resolved together by the host. `apps/daemon/config.example.toml` annotates the
whole of it.

**Redirects are never followed** — a `3xx` is reported rather than chased, because following one
carries the credential to whatever address the answer names, which is the one thing a fixed base URL
exists to prevent. TLS verification is never disabled. An account reached over plain HTTP at an
address that is not private — not loopback, not a private or link-local address, not a single-label
name, which is what a container on the same network is called — is named on startup as one whose
password crosses the network in the clear, and then used: the host says it, and does not decide it.

## The two capabilities

`create` and `append`, the filesystem kind's own names with the same argument shapes,
from the same definition. Two kinds doing one thing under different words would make every rule and
every composer choice kind-specific for no gain.

Neither field offers **candidates**: enumerating what is already in the vault is a slice of its own,
and a field that claimed otherwise would draw a browse button for an answer this kind refuses.

Whether a note carries provenance is the `frontmatter` setting — `full` or `none`, unset meaning
none — which each capability takes as an argument of the same name to override for one delivery,
exactly as the filesystem kind does.

## What it will not do

- **Nothing escapes the root.** A target is resolved against it and anything that leaves is refused.
  Containment is string arithmetic — there are no symlinks to chase, so the filesystem kind's second
  check has no counterpart — and what stands in its place is that a resolved path is reassembled one
  percent-encoded segment at a time, so nothing a name holds, `..` and `/` and `?` included, can
  address anything the base URL does not contain. Vault folders have spaces in them, which is the
  ordinary reason the encoding is there at all.
- **Nothing is overwritten.** A create is `PUT` with `If-None-Match: *`, which is the request that
  means *only if it is not there*, so a name that is taken is refused rather than replaced and two
  creates racing leave one note and one refusal. Asking first and then writing would have lost one
  silently. That is this kind's promise and not `create`'s: the capability says a new thing rather
  than an addition to one, and a kind whose protocol offers no conditional create cannot promise
  more.
- **No append loses a concurrent write.** The note is read, its `ETag` kept, and written back with
  `If-Match`. A `412` means somebody wrote in between, so it re-reads and tries again, four times,
  and then reports contention as unreachable rather than throwing a routing decision away over
  somebody else typing. A note served with no `ETag` — or a weak one, which no conditional write
  can match however quiet the vault is — is reported rather than written over blind.
- **The root is never created.** Collections below it are made with `MKCOL` a level at a time, since
  a `PUT` will not make its own parent; the root itself is not among them, because a vault that is
  not there is an account somebody has not set up rather than a folder to conjure.
- **An asset is never buffered.** The opener's stream is handed to `fetch` as it is, so an hour of
  audio goes chunked and is never gathered up to be measured first.

## Refused, or unreachable

The distinction decides whether a delivery is retried, so it is not about severity:

| What happened | Reported as | Because |
|---|---|---|
| Nothing answered, or a `5xx`, `429`, `408` | `unreachable` | A server that is down comes back |
| An account that is not declared, or a secret that will not read | `unreachable` | The settings are fine; a config edit fixes it |
| `401` or `403` | `unreachable` | A password that has just been rotated is the ordinary case |
| A `3xx` | `unreachable` | The credential is not carried to it, and a redirect may be temporary |
| Every append attempt lost its race | `unreachable` | Contention, and the runner's business |
| The note was served no `ETag`, or a weak one | `unreachable` | Something in front of the server is rewriting them |
| Something above the target is not there | `unreachable` | The vault is not set up yet |
| The target escapes the root | `rejected` | No later attempt makes it legal |
| The note is already there | `rejected` | It will be there next time too |
| The arguments are not the shape the capability declared | `rejected` | Likewise |
| A renderer threw | `rejected` | It will throw identically |

A **check** is asked by somebody waiting, so it answers two of those differently: a refused
credential is `rejected` there, a password having possibly just been rotated being the delivery's
reason to retry and not a person's reason to be told nothing. And an account nobody declared is
**`unusable`** — nothing was reached, so nothing refused anything, and no retry gets there.

A rejected credential is on the retrying side although a wrong password does not fix itself. It is
the filesystem kind's asymmetry: wrongly retrying is bounded by `maxAttempts` and ends up in front
of a person, which is where it was going anyway, while wrongly abandoning throws away a decision
somebody made.

## The DAV server the tests run against

`src/testing/dav-server.ts` is an in-process server standing in for Nextcloud, so the suite needs no
instance and stays fast and offline. **It is a fake**, and it implements the parts of DAV this
adapter uses and no more. Whether the real thing agrees — that `If-None-Match: *` is honoured on
`PUT`, that its `ETag` is stable enough for `If-Match`, and where a proxy's body limit sits — is
what hand verification against a real instance is for, and nothing here can answer it.

It is written rather than depended on, and that was checked rather than assumed (2026-09-02).
`webdav-server` is the only maintained candidate on npm, and it implements no HTTP conditional
requests at all — no `If-None-Match`, no `If-Match`, only RFC 4918's `If:` lock header — which is
the whole of what these tests exist to exercise. `webdav-test` is a client, and `webdav-cli` wraps
a static server. A dependency that cannot fail the way Nextcloud fails would make the suite
quieter and prove less.
