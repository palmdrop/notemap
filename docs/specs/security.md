# Spec: What is undefended

**Status**: Draft
**Last updated**: 2026-09-08
**Shipped**:

- 2026-09-23 — **An account may be stored by the daemon.** Set from settings by a signed-in
  person, kept in `auth.db` with its secret recoverable, never in the pool or the mirror, and never
  answered back. A bearer token cannot reach the account routes. A stored account replaces a config
  one of the same kind and name entirely. See
  [accounts-in-the-auth-db](../plans/accounts-in-the-auth-db.md) and
  [ADR 49](../adr/0049-an-account-may-be-held-by-the-daemon.md).

- 2026-09-08 — **An account's shape becomes its kind's, and the daemon writes to one address it was
  not configured with.** Each adapter publishes an account schema and the daemon validates every
  `[[accounts]]` block against its kind's at startup, refusing to run on one that fails; what stays
  in the config reader holds for every kind — no inline secret, exactly one source for it, no two
  under one kind and name. Nothing about the property changes: no secret reaches core, the pool, the
  mirror or an API answer. The are.na kind streams an asset to a **presigned URL the service names
  at runtime**, which is the first write to an address that is not in `config.toml`; no notemap
  credential is attached to it, the address comes from an authenticated answer rather than from
  anything `/v1` accepts, and a redirect from it is not followed.
  ([plan](../plans/arena-destination.md),
  [ADR 40](../adr/0040-a-destination-kind-declares-the-shape-of-its-own-account.md))

- 2026-09-01 — **The first destination kind that holds a credential, and it holds neither the
  credential nor the address.** The rule written ahead of it is satisfied by taking both out of
  `settings`: the host's config declares named accounts carrying a base URL, a username and a
  secret read from a file or an environment variable, and a destination names one of those and a
  folder under it. So nothing secret enters the pool, the mirror or an API answer, and there is no
  redaction rule to remember. It also closes what would have been the first server-side request
  forgery here — a URL in `settings` is an address the daemon sends a credential to, chosen by
  whoever can create a destination, repeatedly, on the delivery runner's timer. Redirects are not
  followed with a credential attached, and an account reached over plain HTTP at an address that is
  not private is named on startup as one whose password crosses the network in the clear.
  ([plan](../plans/destination-webdav.md),
  [ADR 28](../adr/0028-a-remote-destination-names-a-credential-profile-not-a-url.md))

- 2026-09-01 — **The spec says what is true now that there is a door.** The boundary is two layers
  rather than one; the bind section describes the shapes a deployment takes — loopback, a LAN, a
  routable address, a tunnel, a container network — instead of one deployment's story; the proxy
  carries TLS and no longer carries authentication; and the five-item list of what authentication
  had to close is answered item by item, including the asset-content one, which the cookie closes
  for a browser and which a token-carrying client reopens. A new rule arrives ahead of what needs
  it: **no destination setting may hold a secret**.
  ([plan](../plans/login-and-access-tokens.md))

- 2026-09-01 — **A deployment may arrive with a password, and a password has a floor.**
  `NOTEMAP_PASSWORD` and `NOTEMAP_PASSWORD_FILE` set the credential on a daemon holding none,
  before anything listens, and leave one that is already set alone. A password is now at least 12
  characters, held against what may be chosen rather than against what is already stored.
  ([plan](../plans/login-and-access-tokens.md))

- 2026-09-01 — **Every `/v1` write declares its media type, carrying a body or not.** The
  content-type rule skipped the routes reading no body, so `.../archive`, `.../unarchive`,
  `.../mark-processed`, `.../retire`, `.../unretire` and `.../cancel` accepted a simple cross-site
  `POST` — held only by `SameSite=Lax`, which is same-site rather than same-origin, and an
  unguessable id. They are asked for `application/json` like every other write now, which forces
  the preflight the daemon refuses. `hono/csrf` is declined in the same breath, with the reasoning
  written down. ([plan](../plans/login-and-access-tokens.md))

- 2026-09-01 — **The login throttle counts an attempt before it weighs the password, and weighs one
  at a time.** The counter moved only once the hash had answered, so sign-ins arriving together
  each read an open door: the free attempts were spent on a single burst and that many memory-hard
  hashes ran beside each other. It now moves as the attempt begins and settles on what the hash
  said, and a second attempt arriving while one is still being weighed is answered `429`.
  ([plan](../plans/login-and-access-tokens.md))

- 2026-08-31 — **A filesystem destination is confined to what the container is given.** The
  compose files and the `Dockerfile` gain `/var/lib/notemap/vaults`, the one directory a root may
  be mounted under, and a root pointed at the pool, the mirror or the assets instead — whether it
  names one exactly or sits inside or around one — is refused rather than delivered into. The
  settings form asks a person to confirm a root it has not seen before, which is a check against a
  mistake and not a permission.
  ([plan](../plans/destination-targets.md))

- 2026-09-01 — **The daemon says when it is reached somewhere it was not told about.** The check
  that `daemon.origin` is set reads the bind address, which a tunnel or a proxy in front of a
  loopback daemon walks straight past. The first sign-in whose `Host` disagrees with the origin the
  cookie was decided from is logged once, naming the host and the key.
  ([plan](../plans/login-and-access-tokens.md))

- 2026-08-31 — **The session cookie asks for the scheme the `__Host-` prefix needs, not the trust
  it sits next to.** `Secure` still follows what a browser counts as trustworthy, loopback
  included; the prefix now follows `https:` alone, because Chromium rejects a prefixed cookie set
  over `http:` outright and a loopback daemon issuing one answered the sign-in `200` and every
  request after it `401`. ([plan](../plans/login-and-access-tokens.md))

- 2026-08-31 — **The daemon has a door.** One middleware over `/v1` takes a session cookie or a
  bearer token, and a request carrying neither is refused in the daemon's own envelope. A password
  is set from the command line and takes effect on the next request; access tokens are minted,
  listed and revoked one at a time. Failed sign-ins are throttled on one counter for the daemon.
  Authorization is deferred and said so out loud, with two containment rules standing in for it.
  ([plan](../plans/login-and-access-tokens.md), [ADR 27](../adr/0027-the-daemon-authenticates-and-core-does-not.md))

- 2026-08-27 — **The containerised case, written down.** Notemap now runs as a container from a
  published image, where the daemon binds every interface by necessity and the bind-address section
  no longer describes it. What limits reach is which of the two shipped compose files is used: a
  port on the host's loopback, or no port and one named network with a proxy on it — which carries
  TLS and authentication until the daemon has a door of its own.
  ([plan](../plans/run-story.md))

- 2026-08-25 — **The one unauthenticated cross-origin write closed itself.** The upload became
  `PUT /v1/assets/{id}`, and `PUT` is never a simple method, so a cross-origin upload is
  preflighted and fails against a daemon that sends no `Access-Control-Allow-*`. This was not the
  reason for the change — the id moved to the uploader so an offline capture can name its assets —
  but it is what the change is worth here.
  ([plan](../plans/client-minted-assets-and-health.md),
  [ADR 22](../adr/0022-the-uploader-mints-the-asset-id.md))

- 2026-08-12 — This document, written alongside the slice that made it necessary: uploaded bytes
  now live on the daemon's own origin. The controls it describes ship with it — the inert
  allowlist deciding `inline` versus `attachment`, `nosniff` and `default-src 'none'; sandbox` on
  every asset response, and the upload size limit.
  ([plan](../plans/asset-upload-and-images.md))

---

## Outcome

Someone deciding where to run notemap can tell, without reading the code, what reaching the
daemon gets an attacker and what it does not. Nothing here is a promise to defend; it is the
list of what is deliberately open, so that a decision to widen the bind, or to add
authentication, is made against facts rather than against a feeling.

---

## Scope

### In scope

- What `/v1` permits, to whom, and what it still permits to a caller carrying nothing.
- The exposure a wider bind address adds, and the exposure a browser adds.
- What uploaded bytes can and cannot do once they are served from the daemon's origin.
- The list authentication has to close when it is built.

### Out of scope

- **The design of authentication itself** — credentials, sessions, tokens, the Micropub OAuth2
  relationship. That is [http-v1.md](http-v1.md)'s open question, and this document is the
  requirement list it has to satisfy, not a proposal.
- Multi-user and multi-tenant operation, which nothing in notemap models
  ([core.md](core.md#scope)).
- Encryption at rest. The pool is a file on a machine the user owns; disk encryption is the
  operating system's job and notemap adds nothing to it.
- Threats to the *destinations* an item is routed to. Once material has been delivered, it is
  that system's, which is why purge cannot reach it ([core.md](core.md#archive-and-purge)).

---

## Behavior

### The door is the boundary, and the network is the layer under it

*Revised 2026-09-01. Until then there was no authentication at all, and everything below said so;
what that sentence used to mean is kept in [Prior decisions](#prior-decisions).*

**The daemon authenticates.** A password mints a session for a browser, an access token is carried
by everything else, and every `/v1` route takes one or the other ([ADR
27](../adr/0027-the-daemon-authenticates-and-core-does-not.md)). Reaching the address and port is no
longer the whole of it.

Two things that has not changed:

- **A daemon nobody has set a credential on is open**, exactly as before, and says so on startup.
  That is not a default nobody chose — it is what keeps a loopback daemon on one person's laptop as
  easy as it was — but a deployment that reaches further and never runs `notemap password set` or
  sets `NOTEMAP_PASSWORD` is the old story unchanged.
- **Authentication answers *who*, and nothing answers *what*.** One credential, and tokens carrying
  what it carries, with two containment rules standing in for authorization
  ([below](#authentication-answers-who-and-nothing-answers-what)).

So the network is no longer the whole of the defence, and it is still a layer worth having: it
decides who may *ask*, and the door decides who is *answered*. The sections that follow are what
each one covers, and what neither does.

### Where the daemon binds, and what that still decides

The daemon binds `127.0.0.1:4747` by default ([http-v1.md](http-v1.md#transport)). **A container is
one way to run notemap and not the only one**, so this is the several shapes a deployment takes and
what each covers. In every one of them the door is the same door; what changes is who gets as far as
knocking.

- **Loopback, on the machine the person uses.** Reaching it means already having code execution
  there, at which point the SQLite file is readable anyway. The credential is worth setting even
  here — it is what stops another *user account* on the same machine, and another program running
  as that account, from reading the pool over HTTP — but this is the shape where the door adds
  least.
- **A LAN address.** Every device on the subnet can reach the port, including ones nobody
  administers: a guest phone, a television. They now meet a `401` rather than the feed. What the
  bind still decides is that they can *knock*, which is worth something: an unauthenticated caller
  can still fill logs, and the login is the one route that does real work
  ([throttled](#the-login-is-throttled-and-nothing-else-is)).
- **A routable address.** Anyone who finds the port meets the door. This is where **TLS stops being
  optional**: the daemon speaks plain HTTP, so a session cookie or a bearer token on a bare
  routable address crosses the network readable. The daemon warns when the origin it was told is
  plain HTTP on an address that is not loopback, and drops `Secure` from the cookie rather than
  minting one a browser will not send back.
- **A tunnel or a tailnet.** The daemon binds loopback or the tailnet interface, and the network
  layer is doing the same job a proxy would. The one thing to know is that the bind address is not
  where a browser arrives — `daemon.origin` is what settles the cookie, and the daemon
  [says so](#the-session-cookie-is-as-narrow-as-the-origin-allows) the first time a `Host` disagrees
  with it.
- **A container network, with a proxy on it.** The section below.

**A wider bind is no longer a decision to trust a whole network segment with everything.** It is a
decision about who may reach the door, on a daemon whose credential had better be set — which is
worth stating plainly because the old version of this document said the opposite, and a reader who
remembers it would take the wrong lesson.

What the door does not do, on any of these: it does not stop enumeration by a *signed-in* caller,
because there is nothing to enumerate past — one credential reaches everything. Ids are unguessable
in practice (UUIDv4 for the ones notemap mints), and that remains obscurity rather than a control.

### In a container, the proxy is the boundary

The deployment notemap is actually run in is a container: a published image, one compose service
holding the pool, the mirror and the assets in one volume, and the reverse proxy that already fronts
the other self-hosted apps on that machine (`docker/compose/`,
[the run story](../plans/run-story.md)).

**There the daemon binds every interface, and the section above does not describe it.** A container
that binds `127.0.0.1` is reachable from nothing at all — not from the proxy, not from the host.
`host = "0.0.0.0"` in the container's config is not the daemon relaxing; it is the loopback having
moved. What limits reach is one level out, and all of it is outside notemap.

Two compose files ship, and the difference between them is exactly this boundary:

- **`compose.yaml` publishes `127.0.0.1:4747`.** The loopback moved into the container, so it is
  published back out to the host's loopback and no further. Reaching it means already having code
  execution on the machine, which is the same bargain the direct-run default makes. **`4747:4747`
  is the mistake this is shaped to prevent**: it would put the pool on the LAN behind one password,
  which is a decision worth taking on purpose rather than by editing a port.
- **`compose.proxy.yaml` publishes nothing** and joins one named external network instead. The
  daemon is then on no address the host publishes, and the proxy reaches it by service name.
  Anything else on that network reaches `/v1` and meets the same door a browser does — so what
  putting notemap on the proxy's network now costs is that every other container the proxy fronts
  may knock, and may spend the login's one attempt at a time. Before the door it was the whole
  pool; it is not that any more, and it is still not a network to join carelessly. It is the smallest network that still
  has the proxy on it, not a safe one, and it is named rather than defaulted so that it is never
  quietly the network every container on the host shares.

Merging the two — `docker compose -f compose.yaml -f compose.proxy.yaml up` — publishes the port
*and* joins the network, which is the union of what each exposes rather than the intersection.
Running one after the other does something else: both files name the same project and the same
service, so the second `up` replaces the container the first made, and what is exposed is whichever
file was named last.

### What the proxy still carries

One thing, and it is not negotiable:

- **TLS.** The daemon speaks plain HTTP and will not speak anything else. A capture from a phone
  crosses a real network, and so does the credential that made it. The daemon cannot see whether
  TLS is in front of it, which is why it is told through `daemon.origin` rather than left to guess
  — and why an origin that says `http:` on a reachable address costs the cookie its `Secure` and
  earns a warning on startup.

**Authentication is no longer the proxy's**, as of 2026-08-31. Whatever the proxy carries for the
apps behind it is now a second lock rather than the only one, and is worth keeping for exactly that
reason: it stops an unauthenticated caller before the daemon spends a scrypt hash on them. What it
cannot do is tell one client from another — that is what an access token is for, and why revoking
one client does not mean changing every client.

### A filesystem destination reaches only what is mounted

The container's filesystem is the boundary here, not `/v1`. A filesystem destination's `root` is a
path *inside the container*, and the only thing that container can ever write to is whatever was
mounted into it — the compose files mount one state volume and, optionally, one or more vaults
under `/var/lib/notemap/vaults`. Nothing else on the host is reachable no matter what root a
destination names, because nothing else is there to reach.

**The pool, the mirror and the assets are refused as a root**, whether a destination names one of
them exactly or sits inside or around one: `describe()` reports it `unusable` and `deliver()`
writes nothing. This is a check against a mistake, not a permission — whoever can create a
destination over `/v1` is signed in, and a signed-in caller already has read and write of the whole
pool, so a person who meant harm loses nothing this refusal takes away. It exists
because routing a note into the mirror is destructive and nobody who honestly reaches `/v1` ever
means it; a fat-fingered path is the only thing it defends against.

**The settings form asks a person to confirm a root it has not seen before, the same way.** It
authenticates nobody, and clicking past the confirmation is not a boundary crossed, because there
was never one there to cross — a person who wanted to route somewhere unfamiliar was always free
to. What it catches is a root nobody meant to type, which costs enough — see the paragraph above —
to be worth catching before it is saved rather than after.

### No destination setting may hold a secret

A rule written ahead of the kind of destination that will want to break it. A filesystem
destination's settings are a path, and nothing about that is sensitive; the next kinds — WebDAV, an
API somewhere — arrive wanting a password or a token in the same field, and this says they may not
have one there.

Two things make it a rule rather than a preference, both verified 2026-08-26:

- **`GET /v1/destinations` answers `settings` verbatim**, to any authenticated caller. That
  includes an access token handed to a script, which authorization does not narrow
  ([above](#authentication-answers-who-and-nothing-answers-what)) — so a credential in a setting is
  a credential every other credential can read.
- **The mirror writes them to disk in the clear**, at `pool-mirror/destinations/<id>.json`. The
  mirror is a plain-text copy of pool state by design, and a rebuild restores whatever is in it.
  This is the same reasoning that keeps the *auth* database out of the pool: a secret that reaches
  the mirror survives being deleted from anywhere else.

So a destination that needs a credential holds a **reference** to one — a name the daemon resolves
out of its own configuration — and never the credential itself.

**Settled 2026-09-01, and it went further than a reference to the secret**
([ADR 28](../adr/0028-a-remote-destination-names-a-credential-profile-not-a-url.md)). The host's
config declares named **accounts** under `[[accounts]]`, each naming the destination kind that
speaks to it and carrying a base URL, a username and where its secret is read from, resolved
together; a destination's settings name an account and a path within it, and have nowhere to put
either a URL or a password. The block is not named after any kind — the daemon reads accounts and
secrets, and an adapter picks out its own by `kind` — so a second kind needing a credential adds no
config code. The second half is what decided the shape. A
destination is created over `/v1`, so a URL in `settings` is an address the daemon will then send a
credential to — another container, a loopback service, a host of somebody's choosing — repeatedly,
on the delivery runner's own timer. That is request forgery with credential disclosure at the end
of it, and it did not exist before only because every kind was local. The set of addresses the
daemon will authenticate to is now fixed by a file only the operator writes.

Two more that are one line each to get wrong and invisible afterwards: **a redirect is never
followed with a credential attached**, and TLS verification is never disabled.

**A plain-HTTP base URL is warned about, not refused** (settled 2026-09-02). Where the address is
not private — not loopback, not a private or link-local address, not a single-label name, which is
what a container on the same network is called — the daemon names that account on startup and says
its password crosses the network in the clear. Then it delivers.

It was written as a refusal at load and that was wrong twice over. It refused the ordinary
deployment, notemap and the server it delivers to as siblings on one container network reached as
`http://nextcloud`, where there is no loopback and no certificate to be had. And refusing at load
meant one account nothing should be sent to stopped the daemon from capturing at all, in a restart
loop. Whether plain HTTP is acceptable beyond that is not a thing the daemon can know — a private
VLAN, a tunnel and a mesh interface all look like the open internet from here — so it is the
operator's call, made in a file only they can write, and the daemon's job is that nobody makes it
unknowingly.

What is still fatal is the file being wrong rather than an account being exposed: an inline secret,
two profiles under one name, an account that does not fit the shape its kind declares. And the
warning is a warning about the *transport*; nothing about it relaxes the rule above, which is that
the secret and the address are the host's and never a destination's.

**What an account of a given kind must carry is that kind's own** (narrowed 2026-09-08,
[ADR 40](../adr/0040-a-destination-kind-declares-the-shape-of-its-own-account.md)). The three
fields above are Basic authentication's shape, and are.na has none of them: a bearer token, no
username, and an address that is a constant of the service. So each adapter publishes an account
schema, the daemon validates every block against its kind's at startup and refuses to run on one
that fails, and the checks left in the config reader are the ones that hold for every kind — no
inline secret, exactly one source for it, no two accounts under one kind and name. Nothing about
the property changes: neither core nor the pool ever holds a secret, and an account schema is not
published over `/v1` (until 2026-09-23, below).

**An account may also be stored by the daemon** (added 2026-09-23,
[ADR 49](../adr/0049-an-account-may-be-held-by-the-daemon.md)). A signed-in person can set one
from settings. It goes into `auth.db`, never into the pool or the mirror. Its secret is kept as
given, because it has to be presented rather than verified, so whoever can read `auth.db` can read
it. Every account route requires a session, so the set of addresses the daemon authenticates to is
still fixed by the operator: by the config file, or by the one person signed in at a browser, and
never by a bearer token. A kind's account schema now covers only the fields beside the secret, and
it is published over `/v1/account-kinds` so a form can be built from it. The secret, and where a
config account reads it from, are the host's. A stored account is checked against the kind's schema
when it is written, and a key naming a secret source is refused.

**A destination may send an item's bytes to an address the service names at runtime**
(added 2026-09-08). The are.na kind asks for a presigned upload URL and streams the asset to it,
which is the first time the daemon writes to an address that is not in `config.toml`. It is not the
threat ADR 28 closed: the address comes from an authenticated answer rather than from anything
`/v1` accepts, **no notemap credential is attached to it** — a presigned URL is its own
authorisation — and no answer from it is trusted for anything but whether the write succeeded. What
travels is material a person decided to route there, which is the point of routing it. A redirect
from such an address is not followed either.

### No CORS headers, which is load-bearing

The daemon sends **no CORS headers at all**, and that is the only thing stopping a web page on
another origin from reading the pool of a user who happens to be running the daemon.

- A page on `evil.example` can *issue* requests to `http://127.0.0.1:4747` — the browser sends
  them — but cannot read the responses, because the same-origin policy withholds them without an
  `Access-Control-Allow-Origin`.
- **Every write is preflighted, and since 2026-09-01 on purpose** *(amended 2026-08-25 and again
  2026-09-01)*. A simple `POST` is not preflighted, so a cross-origin page could otherwise cause a
  write it cannot read the answer to. Every `POST`, `PUT` and `PATCH` under `/v1` has to declare
  `application/json` — carrying a body or not — which is not a media type an HTML form can send and
  which a `fetch` can only send after a preflight the daemon answers no `Access-Control-Allow-*` to.
  The upload is the exception and needs none: it is a `PUT` under the asset's own type, and `PUT` is
  never simple.

  This started as two happy consequences — of the content-type rule and of the id moving to the
  uploader — rather than a defence anything set out to build, and it was a handful of routes short
  of holding. The rule used to skip whatever declared no body, which left `.../archive`,
  `.../unarchive`, `.../mark-processed`, `.../retire`, `.../unretire` and `.../cancel` reachable as
  a simple cross-site `POST`, with `SameSite=Lax` and an unguessable id the only things in the way.
  It is now stated as the rule it had been standing in for, and a route added under a media type a
  form can send is what would reopen it.
- **The cookie is the other half, and it is a control now rather than a happy accident.** The
  session cookie is `SameSite=Lax`, so a cross-*site* `POST` does not carry it whatever the media
  type — and the media-type rule above holds for the cross-origin case Lax does not, a page on a
  sibling of the same registrable domain. Neither alone covers both, which is why both are here and
  why each stands behind an acceptance criterion and a test.
- **Adding a CORS header is the moment to reconsider authentication**, not a convenience to
  reach for. Any origin allowed to read is an origin allowed to read everything — and now that
  there is a credential, an allowed origin is one allowed to spend somebody's cookie.
- **The client stays same-origin so the header never has to exist.** In production the daemon
  serves the app from its own origin ([http-v1.md](http-v1.md#transport)); in development the app's
  dev server proxies `/v1` to the daemon rather than calling it across origins, so both are
  same-origin and the no-CORS property holds unchanged ([client.md](client.md)). **A shell that
  cannot be same-origin is where this reopens**: a native or mobile build, or a browser build
  pointed at a remote daemon, is cross-origin to `/v1` by nature and is exactly the wider-bind case
  above — it needs authentication, not a CORS header, and is the trigger for the open question below
  rather than a reason to relax this one.

The playground at `/docs` works because it is same-origin — served by the daemon it calls
([http-v1.md](http-v1.md#the-playground)). A playground anywhere else could render the document
and never call it, which is the same rule seen from the other side.

### Uploaded bytes are served from the daemon's own origin

`GET /v1/assets/:id/content` serves whatever was uploaded, from
`http://127.0.0.1:4747` — the same origin as the capture page and the playground. Anything a
served file can execute, it executes there.

What holds that down ([http-v1.md](http-v1.md#inline-or-attachment)):

- **`Content-Disposition: attachment` for everything not on the inert allowlist**, so a media
  type nobody has considered downloads rather than renders. HTML, XHTML, SVG and XML are the
  named dangerous ones; PDF is an attachment too.
- **`X-Content-Type-Options: nosniff`**, so a browser cannot decide an `application/octet-stream`
  looked like HTML.
- **`Content-Security-Policy: default-src 'none'; sandbox`** on asset responses, so even a
  document that does get rendered has no origin privileges, runs no script, and loads nothing.
- The recorded media type is served **honestly**, never guessed, because a guess would be a
  claim the pool cannot support.

What that leaves:

- **SVG is stored exactly as uploaded and never sanitized.** It is served `attachment`, and a
  page that embeds one through `<img>` executes no script by specification. A user who
  deliberately opens the download in a tab is opening a document from their own daemon's origin,
  with the sandbox CSP applied. This is a considered trade, not an oversight
  ([http-v1.md](http-v1.md#inline-or-attachment)).
- **There is no malware scanning**, and there will not be. Notemap stores the bytes it is given.
- **Nothing rewrites or validates content against its declared media type.** A file called
  `.png` that is not one is stored, and served as `image/png` because that is what the uploader
  said.

### Quotas and denial of service

- **The only limit is the upload size cap.** There is no cap on the number of assets, the number
  of items, or the total size of the pool. A client that can reach the daemon can fill the disk.
- The sweep reclaims assets no capture ever referenced, after a grace window
  ([core.md](core.md#archive-and-purge)), so unclaimed uploads are self-limiting over time — but
  not within the window, and not at all for uploads a capture *does* claim.
- There is no rate limiting anywhere **except failed sign-ins** (below), and the pool holds a
  write lock for the duration of a transaction, so a caller issuing writes in a loop degrades
  every other caller.
- None of this matters at the intended deployment — one person, one machine, one daemon — and
  all of it matters the moment the bind widens.

### What authentication had to close, answered

This was a list of five things the answer would have to account for. It has one now, so each is
answered here rather than left to be inferred — including the two that are answered only partly.

1. **Every `/v1` route, including `GET`s. Closed.** One middleware over `/v1` takes a session cookie
   or a bearer token and refuses anything else in the daemon's own envelope. Three routes are open
   on purpose — `/v1/health`, `/v1/session` and `/v1/openapi.json` — and none of them answers pool
   material: health withholds even the pool's identity until something is presented.

2. **Asset content, the one route a browser fetches as a subresource. Closed for a browser, open
   for a client that is not one.** An `<img src>` carries no header, but it does carry a cookie:
   the daemon serves the shell from its own origin, the cookie is `SameSite=Lax` with `Path=/`, and
   a subresource `GET` from that page is same-site, so the bytes are fetched signed in with nothing
   special done. A client holding an **access token** instead has no such luck — its transport can
   set a header on `fetch` and cannot set one on an `<img>` — so `assetUrl` is the one part of the
   port a token does not reach. Two things soften it and neither answers it: bytes the client
   captured itself render from an object URL and never touch `/v1`, and any client can read the
   bytes through `fetch` and make its own URL. **The real answer is a short-lived signed URL**, not
   a token in a query string, and it is owed the day a native or mobile shell exists. Recorded in
   [Open questions](#open-questions).

3. **Cross-origin writes. Closed, and on purpose rather than by accident.** Every `POST`, `PUT` and
   `PATCH` under `/v1` must declare `application/json` — carrying a body or not — which no HTML
   form can send, so a cross-origin write is preflighted and dies on the CORS headers the daemon
   does not send. `SameSite=Lax` stands behind that, and the two are separate controls:
   [the CORS section](#no-cors-headers-which-is-load-bearing) says which covers what, and why
   `hono/csrf` was declined rather than added.

4. **The pages the daemon serves itself. Answered, and they stayed open.** The shell's own files
   are the application and not the pool, and something has to be able to draw the login; everything
   they then *ask for* is behind the door, and an unauthenticated shell draws no pool material even
   from its own cache. `/docs` renders a document and calls nothing until a person presses a button,
   so it stays too — the button meets the same `401` everything else does. `/log` is a static page
   whose only call is `/v1/actions`, which is closed; gating the page would answer a browser a JSON
   refusal where it asked for HTML.

5. **Whether a wider bind is supported or merely permitted. Supported, with TLS still the proxy's.**
   A daemon with a credential set may be bound wider deliberately — that is what the door was for —
   and [the shapes](#where-the-daemon-binds-and-what-that-still-decides) say what each one covers.
   What notemap does **not** take on is transport security: the daemon speaks plain HTTP, is told
   rather than left to guess whether a cookie may travel, and a reachable address without TLS in
   front of it puts the credential on the wire in the clear.

### Authentication answers who, and nothing answers what

A credential that authenticates carries no scope. Once a request is authenticated it may do
anything any other authenticated request may do: read the feed, capture, edit, route, delete a
destination. There is one exception, and it is a containment measure rather than an authorization
model — **an access token may not manage access tokens**. `GET`, `POST` on `/v1/tokens` and
`DELETE /v1/tokens/{id}` require a session, and a bearer token is refused with `session-required`.
The reason is narrow: without it a leaked token mints a replacement, and revoking the token you
know about leaves the one you do not. The account routes — `/v1/account-kinds`, `/v1/accounts` and
`/v1/accounts/{kind}/{name}` — are held to the same rule, for a different reason: a token that could
write an account could aim the daemon at any address with a password attached.

What that does not give:

1. **A read-only credential.** A token handed to a script that only captures can also archive
   everything and retire every destination.
2. **A per-destination or per-source credential.** Nothing narrows a token to the vault it was
   made for.
3. **Any distinction between the browser and a headless client**, beyond the token rule above.
   A session and a token reach the same routes.

This is deliberate for a single-user daemon where every credential belongs to the same person, and
it is the reason `lastUsedAt` and revocation matter more here than they would in a system with
scopes: containing a leak means noticing it and revoking, because nothing limits the blast radius
in advance. There is one more refusal of the same shape, added for the same reason: **an access token may not
end every session** (`DELETE /v1/sessions`). Signing every browser out is what a person does so
that a leak is noticed, so it is not a thing a leaked token may do to them first.

**Authorization is deferred, not decided.** The day two credentials should be able to
do different things, this section is the list of what has to be answered, and `Agent` growing a
name (see [the login plan](../plans/login-and-access-tokens.md)) is the same trigger from the
other direction.

### The session cookie is as narrow as the origin allows

A sign-in mints a cookie carrying `HttpOnly`, `Path=/`, `SameSite=Lax` and no `Domain`. Two things
about it are the origin's to decide, and they are decided separately:

- **`Secure`** follows what a browser will treat as trustworthy. That includes loopback whatever
  the scheme, so the ordinary `http://localhost:4747` daemon still gets it. It comes off only where
  a configured origin is plain HTTP on an address someone else can reach — which the daemon warns
  about on startup, because at that point the cookie crosses a network in the clear.
- **The `__Host-` prefix** follows the scheme alone. `https://` gets `__Host-session`; everything
  else, loopback included, gets `session`.

The prefix is worth having where it applies: it is the browser's own guarantee that the cookie was
set with `Secure` and `Path=/` by this exact host and not by a subdomain or a sibling that talked
its way into a `Domain`. It is not worth having everywhere, because Chromium **rejects a prefixed
cookie set over `http:`** — loopback included, even though it accepts `Secure` there. A daemon that
took the prefix on loopback would answer a sign-in `200` with an identity, have the cookie dropped
on the floor, and refuse every request after it as `unauthenticated`, saying nothing about why.
Firefox accepts the same cookie, so this is a browser a person happens to be using rather than a
thing the daemon can observe. The two attributes are therefore kept apart, and the prefix asks for
the scheme it needs rather than for the trust it is adjacent to.

**The daemon says when it is reached somewhere it was not told about.** `origin` is refused as
absent once `host` binds beyond loopback, but that check reads the bind address, and the bind
address is not where a browser arrives: a tunnel or a reverse proxy puts a name in front of a
daemon still bound to `127.0.0.1`, which passes the check and then mints a loopback cookie for a
browser that is not on loopback. The first sign-in whose `Host` disagrees with the origin the
cookie was decided from is logged once — naming the host that arrived, and `daemon.origin` as the
key that settles it. A warning rather than a refusal: it is a guess about somebody else's network,
and a wrong guess must not be the thing that shuts the door.

### What a password may be

At least 12 characters, at most 4096 bytes, no control characters and no unpaired surrogates.
Twelve is the floor OWASP's ASVS puts under a password standing on its own, which this one does:
there is no second factor, and one credential is the whole of the door. The maximum is counted in
bytes rather than characters because it guards the hash against a body worth nothing, where the
minimum guards a person against a password worth guessing. Spellings are folded to NFC and no
further, so a password chosen as a compatibility variant stays its own.

**The minimum holds when a password is chosen, not when one is presented.** A password stored
before the rule was raised still opens the door — refusing to weigh it would lock its owner out
with nothing said, and a rule about what may be picked has no business deciding what already was.

### A deployment may arrive with a password

A container has nowhere to type one. `NOTEMAP_PASSWORD` sets the credential on a daemon that holds
none, and `NOTEMAP_PASSWORD_FILE` names a file holding it instead. Both are read before anything
listens, so a daemon told to have a door never answers a request through the moment before it has
one, and a password the rules refuse stops the daemon rather than leaving it quietly open. Setting
both is refused too: two sources for one secret is a misconfiguration, not a precedence to work out.

**Only where there is no credential yet.** The auth database owns the password once one is set. A
variable that reasserted itself every start would end every open session each time the container
restarted, and would make `notemap password set` a change that does not survive a restart — so where
both exist the database wins, and the daemon says on startup that it did.

**The environment is not a secret store, and that is what the variable costs.**
`NOTEMAP_PASSWORD` is readable in `docker inspect`, in `/proc/<pid>/environ` by anything running as
the same user, and in whatever compose file was committed to a repository; it is also inherited by
every child process. `NOTEMAP_PASSWORD_FILE` is the one to prefer, because a path is what Docker and
Podman secrets, Kubernetes and systemd credentials all hand over. The file is still readable by
whoever can read it — this moves the secret somewhere with an owner and a mode, rather than making
it safe.

**The username is `admin`**, and the environment does not set it. A deployment that wants another
runs `notemap password set --name`, which is also how the password is changed afterwards.

### The login is throttled, and nothing else is

One password is the whole of the attack surface, and without a delay a wordlist gets unlimited
attempts. `POST /v1/session` counts failed sign-ins and, past a threshold, answers `429
too-many-attempts` with `Retry-After`. A successful sign-in clears the count.

**One counter for the daemon, not one per caller.** Behind a proxy the socket address is the
proxy's, so keying on it throttles everyone as one by accident; `X-Forwarded-For` fixes that and
is a header anyone can write, so trusting it needs a configuration flag saying a proxy is in
front. Neither is worth it here. Per-caller keying is also what *lets* an attacker evade a
throttle — by rotating the value — and it grows a map that then has to be bounded against that
same rotation. Notemap is one person with one credential, so the per-caller key buys little and
costs the hole.

**It answers rather than waits.** Sleeping inside the handler holds a socket per attempt, which
turns a wordlist into a slow-loris by accident. A `429` costs nothing to hold and tells an honest
client when to come back; the attacker's rate is capped either way.

**The attempt is counted as it begins, not as it is answered.** Weighing a password is a
memory-hard hash, and a counter that moves once the answer is known is a counter every request
that arrived during the hash walked past — the free attempts spent on one batch rather than on one
guess, and that many hashes held at once on a machine chosen for being small. The count moves
before the hash starts and is settled by what the hash said, so a caller turned away still costs
nothing and a caller let in has already paid for its attempt.

**One attempt is weighed at a time.** A second arriving while the first is still hashing is
answered `429` rather than admitted: one password and one person means two at once is never
somebody mistyping, and the one open route that does real work needs a ceiling on how much of that
work is in flight as well as a limit on how often it may be asked for. A rate limit is not a
concurrency limit, and the login is given both.

**It escalates to a cap and never becomes a lock.** A permanent lockout hands anyone who can
reach the login the power to deny it.

**Every other `401` is deliberately not counted**, which is an absence worth stating so it does
not read as an oversight. A session id and an access token are 32 random bytes: throttling them
defends nothing, because guessing one is not an attack that finishes. It would, however, create
one — an outbox draining twenty queued captures with a session that expired overnight produces
twenty `401`s in a burst, and under a single counter that would throttle the owner out of the one
route that fixes it. The client's own recovery would be the thing locking it out.

Two risks are accepted rather than mitigated:

- **Anyone who can reach the login can slow yours.** That is inherent to one counter, and is why
  the escalation is bounded and never a lock. The intended deployments — a proxy, a tailnet, a
  LAN — mean the population who can do this is people already let in. On the open internet it
  would not be an acceptable trade.
- **The count is in memory, so a restart clears it.** A crash-looping daemon has no throttle at
  all, and `restart: unless-stopped` is in the compose file.

The trigger to revisit is **a second guessable credential** — a pairing code, a recovery code,
anything short enough for a person to type. That joins this counter the day it exists. A new
32-byte secret does not.

### What the door does not close

Said plainly, because an absence reads as an oversight otherwise:

- **No rate limiting beyond the login.** Every other route takes as many requests as a caller cares
  to make, authenticated or not.
- **No quotas.** The upload size cap is still the only limit; a signed-in caller can fill the disk.
- **TLS is the proxy's.** The daemon cannot see it, is told rather than left to guess whether a
  session cookie may travel, and serves plain HTTP itself.
- **Nothing here is multi-user.** One credential, and tokens carrying exactly what it carries.
- **No `Origin` check beside `SameSite`, and `hono/csrf` declined.** What the middleware would
  have guarded is closed in the content-type rule instead, which depends on no header surviving a
  proxy — see the section below.

### Why there is no `Origin` check, and why `hono/csrf` was not the answer

`hono/csrf` is already a dependency, so declining it costs an argument rather than a package. It
guards an unsafe method whose `Content-Type` is one an HTML form can send —
`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`, or none at all, which it
reads as `text/plain` — and lets the request through if `Sec-Fetch-Site` says `same-origin` or
`Origin` matches the daemon's own. Everything else it does not look at.

That window used to be a real gap, and it was not where the plan expected. Every route declaring a
body already required `application/json`; what was uncovered was the writes declaring **no** body,
or one that was optional and absent — `POST` on `.../archive`, `.../unarchive`,
`.../mark-processed`, `.../retire`, `.../unretire` and `.../cancel`. The content-type rule had
nothing to check on those and waved them through, so they were the one shape a cross-site page could
put on the wire as a simple `POST`.

**What stood in the way was `SameSite=Lax`, and Lax is same-*site*, not same-*origin*.** A page on a
sibling of the deployment's registrable domain — `anything.example.com` beside a notemap at
`notes.example.com` — is same-site, so the cookie rides along on its cross-origin `POST`. Past that
it was an id the page has no way to learn, which is obscurity, which this document does not count.

**The rule was tightened rather than a check on `Origin` added**, and that is the decision worth
recording. Requiring a media type no form can send on *every* `/v1` write, the bodyless ones
included, closes the same set as `hono/csrf` would — by forcing the preflight the daemon already
refuses — and it does so in the layer the mistake was made in. It also depends on nothing a
deployment can remove: `hono/csrf` reads `Origin` and `Sec-Fetch-Site`, and a reverse proxy is both
the intended deployment and the thing its own documentation warns about. A defence a proxy
configuration can switch off is one nothing observes the loss of.

`hono/csrf` becomes worth having the day a `/v1` route legitimately accepts a form's media type,
which is the day the content-type rule stops being able to speak. Until then it would guard a set
that is empty, at the price of a dependency on a header the deployment is allowed to strip.

---

## Constraints

- **This document describes; it does not defend.** Every control named here is stated in the
  spec that owns it — the bind address and the headers in [http-v1.md](http-v1.md), the sweep
  and the boundary in [core.md](core.md). Nothing is specified twice.
- **A gap discovered later belongs here on the day it is discovered**, whether or not it is
  fixed. The value of the list is that it is complete, not that it is short.
- Notemap is local-first and single-user by design ([core.md](core.md#scope)). Anything that
  would only make sense for a multi-user deployment is out of scope rather than deferred.

---

## Prior decisions

- **[No authentication for now](core.md#constraints)** (2026-08-02) — the daemon binds to
  localhost and the pool is the boundary. This document is the cost of that decision, written
  down rather than implied. **Revised 2026-08-31** by
  [ADR 27](../adr/0027-the-daemon-authenticates-and-core-does-not.md): the daemon authenticates,
  and core still does not. The decision was affordable while the daemon bound loopback on one
  person's machine and stopped being affordable once it was deployed anywhere else. It is not
  erased here, because a reader of the old sections should be able to see what they were the cost
  of.
- **[Assets name, blobs store](../adr/0013-assets-are-named-references-to-content-addressed-blobs.md)**
  — asset ids are minted by the daemon and unguessable in practice, which is not a control but
  does mean an asset URL is not enumerable from a filename.
- **Anything uploads; only inert things render** (2026-08-11,
  [http-v1.md](http-v1.md#inline-or-attachment)) — the allowlist governs disposition, never what
  may be stored, so the pool never refuses to keep something a person wanted kept.

---

## Open questions

- [ ] 2026-08-12 — Whether the capture page should stop being served on the same origin as
      asset content. Today a stored SVG and the page share an origin, and only the sandbox CSP
      and `attachment` separate them; a second port or a `null`-origin sandbox would separate
      them structurally.
- [x] 2026-08-12 — Whether `POST /v1/assets` should require a header a cross-origin form cannot
      send, closing the one unauthenticated write a visited page can currently cause. Answered
      2026-08-25 by something else entirely: the upload is `PUT /v1/assets/{id}` now, and a `PUT`
      is preflighted whatever it carries. The header is unnecessary; what remains is that no rule
      says a `/v1` write must be unreachable by a simple request, so the next route added could
      lose this again.
- [ ] 2026-08-12 — Whether a pool should carry a total-size ceiling at all, or whether that
      belongs to the filesystem the way disk encryption does.
- [ ] 2026-09-01 — **How a client that is not a browser renders an asset.** An `<img src>` carries
      a cookie and cannot carry a header, so a token-carrying shell cannot render one from
      `/v1/assets/{id}/content` at all. The answer will be a short-lived signed URL rather than a
      token in a query string, which a log or a `Referer` would leak. It is not owed until a native
      or mobile shell exists; today every shell is a browser on the daemon's own origin.
- [ ] 2026-08-30 — Whether an access token should carry a scope. Deferred deliberately: every
      credential belongs to one person, so a scope would be a fence around one's own garden. The
      question becomes real the first time a token is handed to something not fully trusted — a
      shared script, a hosted integration, a device someone else holds.

---

## Acceptance criteria

- Every asset content response carries `X-Content-Type-Options: nosniff` and
  `Content-Security-Policy: default-src 'none'; sandbox`, whatever its media type.
- An uploaded `text/html` file is served `Content-Disposition: attachment`, and so is any media
  type absent from the inert allowlist.
- No response from any `/v1` route carries an `Access-Control-Allow-Origin` header.
- A body larger than the configured upload limit is refused, and the refusal names the limit.
- The daemon's default bind address is `127.0.0.1`, and starting it on a wider one is possible
  only by writing that address into the configuration file.
- The standalone compose file publishes on `127.0.0.1` only, and the proxy compose file publishes
  no port at all and names the network it joins rather than defaulting to one.
- The container's config binds `0.0.0.0`, and that address is in the file rather than in the image.
- An access token is refused with `session-required` on every `/v1/tokens` route and on
  `DELETE /v1/sessions`, and reaches every other `/v1` route exactly as a session does.
- `GET /v1/health` omits the pool identity where a password is set and nothing was presented, and
  carries it where one was or where no password is set at all.
- An unauthenticated `/log` answers the page and no pool material, and the calls it would make
  are refused.
- Repeated failed sign-ins are answered `429 too-many-attempts` carrying `Retry-After`, and one
  successful sign-in clears the count.
- An unauthenticated request to any route other than the login never contributes to that count.
- No number of failures makes signing in permanently unavailable.
- Sign-ins arriving together are answered `429` bar one, so a batch reaches the password hash once
  rather than once apiece.
- A password shorter than 12 characters is refused when it is set, and one already stored under
  that length still signs in.
- `NOTEMAP_PASSWORD` or `NOTEMAP_PASSWORD_FILE` closes the door on a daemon holding no credential,
  before the first request is answered; on one that holds a credential it changes nothing and the
  daemon says so.
- Both variables set at once, a file that cannot be read, or a password the rules refuse, each stop
  the daemon from starting rather than leaving it open.
- A client carrying only an access token reaches the pool, captures and routes without ever signing
  in, and is answered `403 session-required` on every `/v1/tokens` route and on `DELETE /v1/sessions`.
- A revoked token is refused on the next request, with nothing to wait for.
- An outbox filled while the door was shut lands everything once when it opens, in order, with its
  uploaded bytes.
- Settings shows the access tokens to a session and to nothing else, and a minted token's string is
  shown once and never read back.
- A `POST`, `PUT` or `PATCH` under `/v1` that declares no media type, or one an HTML form can send,
  is refused `415` — the routes reading no body included. The asset upload is the one exception.
