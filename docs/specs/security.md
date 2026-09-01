# Spec: What is undefended

**Status**: Draft
**Last updated**: 2026-09-01
**Shipped**:

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

- What an unauthenticated `/v1` currently permits, and to whom.
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

### The pool is the boundary

**There is no authentication and no authorization** (decided 2026-08-02,
[core.md](core.md#constraints)). Anything that can reach the daemon's address and port can do
everything `/v1` can do: read every item in the pool, capture new ones, upload bytes, and
download any asset by id. There is no notion of a user, so there is nothing to be permitted or
denied.

This is deliberate and it is affordable **only because of where the daemon binds**. The defence
is the network, entirely.

### The bind address is the whole of the defence

*When the daemon runs on a host directly. In a container it does not, and the next section is the
one that describes that.*

The daemon binds `127.0.0.1:4747` by default ([http-v1.md](http-v1.md#transport)). On that
address, reaching it means already having code execution on the machine, at which point the
SQLite file is readable anyway and the daemon adds nothing.

**Binding wider moves the pool onto the network unauthenticated.** Configuration allows it, and
nothing in `/v1` defends it:

- On a LAN, every device on that LAN can read and write the pool. That includes devices the
  user does not administer — a guest phone, a television, anything on the same subnet.
- On a routable address, so can anyone who finds the port.
- There is no rate limit, so nothing slows an enumeration of item ids or asset ids.
- Ids are unguessable in practice — UUIDv4 for the ones notemap mints — but that is obscurity,
  not a control. `GET /v1/feed` lists every item without needing to guess anything.

A wider bind is therefore a decision to trust the whole network segment, and should be paired
with something that is not part of notemap: a reverse proxy that authenticates, an SSH tunnel,
or a WireGuard interface to bind to instead.

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
  is the mistake this is shaped to prevent**: it would put an unauthenticated pool on the LAN.
- **`compose.proxy.yaml` publishes nothing** and joins one named external network instead. The
  daemon is then on no address the host publishes, and the proxy reaches it by service name.
  Anything else on that network reaches an unauthenticated `/v1` in full — the pool is readable and
  writable by any container that can resolve the name — so putting notemap on the proxy's network is
  a decision to trust every other container that proxy fronts. It is the smallest network that still
  has the proxy on it, not a safe one, and it is named rather than defaulted so that it is never
  quietly the network every container on the host shares.

Merging the two — `docker compose -f compose.yaml -f compose.proxy.yaml up` — publishes the port
*and* joins the network, which is the union of what each exposes rather than the intersection.
Running one after the other does something else: both files name the same project and the same
service, so the second `up` replaces the container the first made, and what is exposed is whichever
file was named last.

### What the proxy carries until the daemon has a door

An interim, written down as one. The daemon has no authentication and no TLS, so the proxy has to
supply both or the arrangement above is a pool on the internet:

- **TLS.** The daemon speaks plain HTTP and will not speak anything else while a proxy is in front.
  A capture from a phone crosses a real network.
- **Authentication.** Whatever that proxy already carries for the apps behind it. Without it, the
  pool is readable and writable by anyone who finds the hostname.

[A login, and tokens for everything else](../plans/login-and-access-tokens.md) is what ends this, and
what makes the proxy's authentication a choice rather than a requirement. It also owns the **general**
account of the boundary — the several shapes a deployment takes, of which a container is one. What is
written above is the container case and nothing else.

### A filesystem destination reaches only what is mounted

The container's filesystem is the boundary here, not `/v1`. A filesystem destination's `root` is a
path *inside the container*, and the only thing that container can ever write to is whatever was
mounted into it — the compose files mount one state volume and, optionally, one or more vaults
under `/var/lib/notemap/vaults`. Nothing else on the host is reachable no matter what root a
destination names, because nothing else is there to reach.

**The pool, the mirror and the assets are refused as a root**, whether a destination names one of
them exactly or sits inside or around one: `describe()` reports it `unusable` and `deliver()`
writes nothing. This is a check against a mistake, not a permission — whoever can create a
destination over `/v1` already has read and write of the whole pool through the lack of
authentication above, so a person who meant harm loses nothing this refusal takes away. It exists
because routing a note into the mirror is destructive and nobody who honestly reaches `/v1` ever
means it; a fat-fingered path is the only thing it defends against.

**The settings form asks a person to confirm a root it has not seen before, the same way.** It
authenticates nobody, and clicking past the confirmation is not a boundary crossed, because there
was never one there to cross — a person who wanted to route somewhere unfamiliar was always free
to. What it catches is a root nobody meant to type, which costs enough — see the paragraph above —
to be worth catching before it is saved rather than after.

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
- **Adding a CORS header is the moment to reconsider authentication**, not a convenience to
  reach for. Any origin allowed to read is an origin allowed to read everything.
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

### What authentication has to close

When the open question in [http-v1.md](http-v1.md#open-questions) is answered, the answer has to
account for every line of this list:

1. Every `/v1` route, including `GET`s. Read access to the feed is read access to everything.
2. Asset content, which is the one route a browser will fetch as a subresource — so whatever
   carries the credential has to survive an `<img src>`, or asset URLs need a capability of
   their own.
3. Cross-origin writes, which today are blocked by a content-type rule rather than by intent.
4. A story for the capture page and the playground, both of which are unauthenticated pages the
   daemon serves itself.
5. Whether a wider bind is then supported or merely permitted, which decides whether transport
   security (TLS) becomes notemap's problem or stays the reverse proxy's.

### Authentication answers who, and nothing answers what

A credential that authenticates carries no scope. Once a request is authenticated it may do
anything any other authenticated request may do: read the feed, capture, edit, route, delete a
destination. There is one exception, and it is a containment measure rather than an authorization
model — **an access token may not manage access tokens**. `GET`, `POST` on `/v1/tokens` and
`DELETE /v1/tokens/{id}` require a session, and a bearer token is refused with `session-required`.
The reason is narrow: without it a leaked token mints a replacement, and revoking the token you
know about leaves the one you do not.

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
  down rather than implied.
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
- A `POST`, `PUT` or `PATCH` under `/v1` that declares no media type, or one an HTML form can send,
  is refused `415` — the routes reading no body included. The asset upload is the one exception.
