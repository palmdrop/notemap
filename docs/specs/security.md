# Spec: What is undefended

**Status**: Draft
**Last updated**: 2026-08-27
**Shipped**:

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
- Ids are unguessable in practice — UUIDv7 for the ones notemap mints — but that is obscurity,
  not a control. `GET /v1/feed` lists every item without needing to guess anything.

A wider bind is therefore a decision to trust the whole network segment, and should be paired
with something that is not part of notemap: a reverse proxy that authenticates, an SSH tunnel,
or a WireGuard interface to bind to instead.

### In a container, the proxy is the boundary

The deployment notemap is actually run in is a container: an image built from this repo, one compose
service holding the pool, the mirror and the assets in one volume, no published port, and the
reverse proxy that already fronts the other self-hosted apps on that machine
(`packaging/docker/`, [the run story](../plans/run-story.md)).

**There the daemon binds every interface, and the section above does not describe it.** A container
that binds `127.0.0.1` is reachable from nothing at all — not from the proxy, not from the host.
`host = "0.0.0.0"` in the container's config is not the daemon relaxing; it is the loopback having
moved. What limits reach is one level out, and all of it is outside notemap:

- **No `ports:`.** The daemon is on no address the host publishes, so nothing on the LAN can find it
  and neither can anything on the machine that is not on its network.
- **One compose network, named.** The service declares the proxy's network, which is also what keeps
  it off compose's default one. Anything on a shared Docker network reaches an unauthenticated `/v1`
  in full — the pool is readable and writable by any container that can resolve the service name — so
  putting notemap on the proxy's network is a decision to trust every other container that proxy
  fronts. It is the smallest network that still has the proxy on it, not a safe one.
- **The proxy in front**, which is the whole of what stands between `/v1` and whoever can reach it.

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

### No CORS headers, which is load-bearing

The daemon sends **no CORS headers at all**, and that is the only thing stopping a web page on
another origin from reading the pool of a user who happens to be running the daemon.

- A page on `evil.example` can *issue* requests to `http://127.0.0.1:4747` — the browser sends
  them — but cannot read the responses, because the same-origin policy withholds them without an
  `Access-Control-Allow-Origin`.
- **Writes are not preflighted by design, only by accident** *(amended 2026-08-25)*. A simple
  `POST` is not preflighted, so a cross-origin page could cause a write it cannot read the result
  of. No `/v1` write is reachable that way today: `POST /v1/captures` and every other bodied
  route require `application/json`, which *is* preflighted, and the upload is a `PUT`, which is
  never simple. Both are happy consequences — of the content-type rule and of the id moving to the
  uploader — rather than defences anything set out to build, and a route added under a media type
  a form can send would reopen this without anything noticing.
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
- There is no rate limiting anywhere, and the pool holds a write lock for the duration of a
  transaction, so a caller issuing writes in a loop degrades every other caller.
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
- The compose service publishes no port and names the network it joins, so it is never on compose's
  default network.
- The container's config binds `0.0.0.0`, and that address is in the file rather than in the image.
