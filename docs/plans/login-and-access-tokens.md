# A login, and tokens for everything else

**Date**: 2026-08-27
**Status**: Todo
**Spec**: `docs/specs/security.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`
**Closed**:

---

## Goal

The daemon has a door. A person signs in with one password and gets a session; anything that is not
a browser carries an **access token** it was issued, which can be named, listed and revoked one at a
time. Both are accepted by one middleware over the whole of `/v1`, and a request carrying neither is
refused in the daemon's own envelope — not redirected, not answered with somebody else's HTML.

This answers [http-v1.md](../specs/http-v1.md)'s open question and revises the 2026-08-02 decision
that there is no authentication, which was affordable while the daemon bound loopback on one
person's machine and is not once it is deployed anywhere else. It does not revise core: **core still
has no notion of a user**, and this is the host's.

Notemap is single-user by design. There is no account, no registration, no role and nothing to
permit or deny — one credential, and tokens that carry exactly what it carries. The credential has a
**username**, so the login looks like every login and a client expecting that form works; the
**domain gains no user**, which is a different thing and stays out.

Not in this plan: TLS, which stays the proxy's; rate limiting beyond the login itself; quotas; and
any multi-user idea, which [core.md](../specs/core.md) puts out of scope rather than deferring.

## Who writes what

**The developer writes the authentication itself** — deliberately, to own the security-sensitive
code and to learn the mechanism rather than a wrapper around it. That is phases 2, 3 and 4: the
password, the sessions, the tokens, the middleware and the routes that open the door.

Phases 5 to 8 — the client, the shell, the specs and the end-to-end proof — are ordinary work and
may be delegated, with one caveat: **the outbox rule in phase 5 is a correctness requirement, not a
nicety**, and whoever writes it should read why before touching it.

A library was considered and declined for now, not dismissed: see phase 1. The seam in phase 2
exists so that decision stays reversible.

---

## Tasks

### Phase 1 — the decision

Depends on nothing.

- [ ] Create branch `feature/login-and-access-tokens`
- [ ] An ADR: **the daemon authenticates; core does not, and the implementation is ours.** What it
      has to record, because none of it is recoverable from the code:
  - Core stays host-agnostic and gains no user, so a different host picks its own scheme, and
    credentials never enter the pool — which matters because the mirror writes pool state to disk in
    the clear and a rebuild would restore them.
  - A reverse proxy was considered as *the* mechanism and declined: it cannot revoke one client
    without changing every client, it does not protect the daemon from anything already inside the
    network, and its login is an HTML redirect that an offline-capable client cannot read. The proxy
    keeps TLS.
  - **Better Auth was considered and declined for now.** It is multi-user by construction, in an app
    that defines no user; it owns a database and a migration CLI; and its endpoints sit outside
    `/v1`'s refusal envelope and generated document. Against that, it would make social login a
    config block. The decision is *for the current product* — a self-hosted single-user pool — and
    the hosted multi-user service that would change it is a different product that would revisit
    this anyway, most likely with an identity provider rather than an in-process library.
  - What password-and-session authentication actually is, so this reads as a choice rather than an
    omission: it is the mechanism the libraries implement, not a lesser substitute for one.
  - **A username, and no user.** The credential carries a name because a login form asks for one and
    because clients expect it; the pool, the mirror and the client gain no user entity. Memos is not
    the counter-example it looks like — it genuinely supports several users with roles, so its model
    is used rather than vestigial — and the hosted service that would change this is *one pool per
    user*, which is tenancy above the daemon rather than users inside a pool. Record the trigger for
    revisiting: `Agent` already carries a `{ kind: "person" }` variant with no identity on it
    (`agent.ts:6`), recorded on every tag, artifact and suggestion. The day two people's tags must be
    told apart, that variant grows a name and a user has earned its place.
- [ ] Verify: the ADR is written and confirmed
- [ ] `git commit`

### Phase 2 — the primitives, behind a seam — *developer*

Depends on phase 1.

- [ ] **The seam first.** A small port inside the daemon answering two questions — *who is this
      request*, and *mint, list, revoke* — with the implementation behind it. The rest of the daemon
      talks to the port. Adopting a library later is then wiring rather than a rewrite, which is the
      whole reason phase 1's decision is allowed to be provisional
- [ ] **The credential lives in the auth database, not in the config.** One row: a username, a hash,
      and when it was last changed. The config file is mounted read-only in a container, so a hash
      there would make changing a password mean editing a file on the host and restarting the
      daemon; in the database it takes effect on the next request. An environment variable may still
      set the credential on first start, for a deployment that wants to arrive with one
- [ ] **No credential set means no authentication**, exactly as today, and the daemon says so on
      startup in the same voice as its other lines — naming the command that fixes it. That keeps a
      loopback daemon on a laptop as easy as it is now, and keeps the existing suites running while
      phases 3 to 6 land
- [ ] Password hashing: **`node:crypto` scrypt**. OWASP's first choice is Argon2id and scrypt is its
      named fallback where Argon2id is unavailable — which, without a native module, is exactly the
      situation in Node. Keeping `dist/main.js` a single self-contained bundle is worth more here
      than the margin between two memory-hard KDFs guarding one password behind a throttle. If that
      trade ever stops being worth it, `@noble/hashes` is audited and pure JavaScript; `argon2` and
      `@node-rs/argon2` are native and would cost the bundle
- [ ] Tokens live in a small SQLite file the daemon owns, a sibling of the pool. **Not in the pool**:
      it is not the pool's material, it is not mirrored, and a rebuild is a new deployment that
      should issue new tokens
- [ ] A session id and a token are both 32 random bytes from `randomBytes`, and **both are stored
      hashed** — SHA-256 through `crypto.hash` is right for a high-entropy secret, where the
      password wants a slow KDF for the opposite reason. A leaked auth database is then not a set of
      live sessions. Comparison is `timingSafeEqual`, both kinds
- [ ] A token carries a short identifying **prefix** so it is recognisable in a log or a config file
      and so secret scanning has something to match, the way `ghp_` does. GitHub's checksum digits
      are a nice idea and overkill for one person's daemon; the prefix is not
- [ ] A token has a name, a creation time, an optional expiry and a last-used time. Expiry is checked
      on every use, and revocation takes effect on the next request — there is no cache to outrun
- [ ] **A command line for the credential and the tokens**, as a subcommand on the existing bundle
      rather than a second binary, so the image stays two directories. It sets the password, mints a
      token with a name and an optional expiry printed once, lists what exists, and revokes one. The
      token commands are not only for recovery: they are how a headless client is given a credential
      without a browser in the loop
- [ ] It is **not user management**, and is not named as though it were: there is no user to manage,
      only a credential and some tokens. A command called `user` would smuggle back the concept this
      plan declined
- [ ] There is no email in this, now or later: no verification, no magic link, no reset by mail. An
      emailed reset is more security-sensitive code than the login it protects — single-use tokens,
      expiry, timing — plus SMTP configuration, for one person who has a shell on the machine. And it
      grants nothing: whoever can run this command can already read the pool's database directly,
      which is why it is a recovery path rather than a way in. `occ user:resetpassword`,
      `changepassword` and `gitea admin user change-password` are the same reasoning
- [ ] The running doc says how to reset a forgotten password, and that a daemon which will not start
      is recovered by running the image with the command overridden rather than by reaching into a
      container that is not up
- [ ] Tests: a hash round-trips and a wrong password does not; an expired token does not
      authenticate; a revoked one stops working immediately; a stored session is not usable as
      presented; setting the password ends every session that was open
- [ ] Verify: `pnpm --filter @notemap/daemon test`
- [ ] `git commit`

### Phase 3 — the middleware, and the routes that open it — *developer*

Depends on phase 2.

- [ ] One middleware over `/v1` accepting either a session cookie or `Authorization: Bearer`. A
      request with neither is `401` with `unauthenticated` in the existing refusal envelope, which
      joins the status table [http-v1.md](../specs/http-v1.md) keeps.
      *Amended 2026-08-30*: this said there would be no `403`, on the reasoning that with one user
      nothing is authenticated but not permitted. There is exactly one — an access token may not
      manage access tokens, `session-required`, `403` — and it is containment rather than
      permission: without it a leaked token mints a replacement that survives revoking the original.
      The original reasoning still holds everywhere else
- [ ] Open without a credential, and only these: `POST /v1/auth/login`, and `GET /v1/health` — the
      shell probes it every ten seconds to decide whether it is offline, and a probe that answers
      `401` would make a closed door look like a dead daemon, which is the worse lie. But it answers
      **liveness only** when unauthenticated: which pool this is, is a fact about the pool and goes
      behind the door
- [ ] `POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/auth/session`. The cookie is
      `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` when configured to be — behind a proxy
      the daemon cannot see TLS and has to be told rather than guess
- [ ] **A new session id is minted on every login**, and the old one invalidated. Session fixation is
      the thing this prevents and it is one line to omit
- [ ] `GET`, `POST` and `DELETE` on the tokens routes. The secret appears in the creation response
      and never again; the list carries the name, the times and the id. **A session is required**:
      these are the only routes an access token cannot reach
- [ ] **Authorization is deferred, and said so out loud** rather than left to be inferred from the
      absence of it. A credential answers *who*, and nothing answers *what*: any authenticated
      request may do anything, the tokens routes aside. There is no read-only token, no
      per-destination token, and no difference in reach between a session and a token. That is
      right for one person holding every credential, and it is why revocation and `lastUsedAt`
      carry the weight a scope would otherwise carry — a leak is contained by noticing it, not by
      what the credential was allowed to do. Recorded in
      [security.md](../specs/security.md#authentication-answers-who-and-nothing-answers-what) with
      the list of what a scoped model would have to answer
- [ ] **Failed logins are throttled**, and this is required rather than a refinement: one password is
      now the whole attack surface, and without a delay a wordlist gets unlimited attempts. A
      per-caller backoff and a global ceiling. Single-user means an in-memory counter is enough
- [ ] `hono/csrf` alongside `SameSite`, since the two fail differently — but read the caveat in
      **Unknowns** first: it leans on `Origin`, and a reverse proxy is exactly the thing that
      sometimes strips it
- [ ] Route tests beside the routes, and the OpenAPI document regenerated. The playground is
      same-origin and carries the cookie, so it keeps working
- [ ] Verify: `pnpm --filter @notemap/daemon test`
- [ ] `git commit`

### Phase 4 — the pages the daemon serves — *developer*

Depends on phase 3.

- [ ] The shell's own files stay reachable without a credential: they are the application, not the
      pool, and something has to be able to draw the login. Everything they then *ask for* is behind
      the door
- [ ] `/log` reads the action log, so the page goes behind it. `/docs` renders a document and calls
      nothing until a person presses a button, so it may stay — decide it deliberately and write the
      reason in `http-v1.md` rather than leaving it to whichever is easier
- [ ] Tests: an unauthenticated `/log` does not answer pool material
- [ ] Verify: `pnpm --filter @notemap/daemon test`
- [ ] `git commit`

### Phase 5 — the client learns there is a door

Depends on phase 3. This is where an auth slice usually does its damage.

- [ ] **A `401` is not a refusal.** Today a refusal is terminal: the entry becomes `refused`, is kept
      to be read and is never retried (`outbox.ts:136`). A session that expired while the shell was
      offline would burn every queued capture that way, which is data loss wearing a refusal's
      clothes. An expired credential is `unreachable`-shaped — the entry parks, keeps its optimistic
      state, and drains when someone signs in again
- [ ] The client carries a session state a surface can read, `login` and `logout`, and a transport
      that can carry a bearer token for a caller that is not a browser
- [ ] **Signing out drops the cache and keeps the outbox** — the rule
      [ADR 23](../adr/0023-a-changed-pool-identity-drops-the-cache-and-keeps-the-outbox.md) already
      sets for a changed pool identity, for the same reason: what is held describes somewhere the
      holder can no longer speak for, and unsent work is still the person's
- [ ] Tests: a `401` mid-drain parks the outbox rather than refusing it; signing out clears the
      cached collections and leaves the outbox; a token-carrying transport authenticates
- [ ] Verify: `pnpm --filter @notemap/client test`
- [ ] `git commit`

### Phase 6 — the shell

Depends on phase 5.

- [ ] A login surface in the register's own language — one field, the shell's bar above it, a
      refusal in the place refusals go. Not a modal: there is nothing behind it to return to
- [ ] **An unauthenticated shell draws no pool material, cached or not.** The cache holds the pool's
      items and the door is shut; drawing them because they happen to be local would make signing
      out mean nothing. What it does say is how much unsent work it is holding, because that is the
      person's and its loss would be silent
- [ ] Settings gains tokens: create one with a name, see it once, copy it, list what exists and
      revoke any of them. Beside the destinations, in the same one-column measure
- [ ] Tests: unauthenticated draws the login and no rows; a token is shown once and not again;
      revoking removes it
- [ ] Verify: `pnpm --filter @notemap/ui test`
- [ ] `git commit`

### Phase 7 — the security spec says what is true now

Depends on phases 3 to 6.

- [ ] `security.md`'s bind section stops being one deployment's story. It describes the shapes —
      loopback on a person's own machine, a LAN, a container network, a tunnel or tailnet, a proxy
      in front — and what each one covers, because **the container is one way to deploy notemap and
      not the only one**
- [ ] "The bind address is the whole of the defence" becomes two layers, and the doc says what each
      one still does not cover. A wider bind is no longer a decision to trust a whole network segment
      with everything
- [ ] The CORS section is revised where the cookie touches it: cross-origin writes were blocked by a
      content-type rule the doc is honest about calling an accident, and `SameSite` — with `Origin`
      checking beside it — is now a control standing behind an acceptance criterion and a test
- [ ] The five-item list of what authentication has to close is answered item by item — including
      the asset-content one, which the cookie closes for the browser and which a bearer-only client
      will reopen when one exists
- [ ] **A new rule, ahead of the kind that needs it**: no destination setting may hold a secret.
      `GET /v1/destinations` answers settings verbatim and the mirror writes them plaintext to
      `pool-mirror/destinations/<id>.json`, verified 2026-08-26. This is what
      [destination-webdav](destination-webdav.md) phase 2 must satisfy
- [ ] What is still open, said plainly: no rate limiting beyond the login, no quotas, TLS is the
      proxy's, and nothing here is multi-user
- [ ] `core.md`'s constraint gets a dated clarification rather than a rewrite — no authentication
      **in core** was and remains true; the daemon has one now
- [ ] Verify: the acceptance criteria at the foot of `security.md` are each true, and each has a test
- [ ] `git commit`

### Phase 8 — end to end, with the door shut

Depends on everything above.

- [ ] The full-stack harness can run a daemon with a password and one without. Most tests keep the
      open daemon, since what they are about is not this; at least one drives the whole path with a
      password — sign in, capture, route — and one proves an unauthenticated request is refused
- [ ] A token-carrying client does the same without a browser, which is the thing the tokens exist
      for and the first proof they work
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm test:stack`
- [ ] `git commit`

---

## References

Human-written, and checked on 2026-08-27. The first two are the ones to read before writing phase 2.

- **[Lucia](https://lucia-auth.com/)** — was a package, deprecated in March 2025, and is now a guide
  to implementing sessions yourself in TypeScript. It carries a single-file reference implementation
  at [`code/auth_session.ts`](https://github.com/lucia-auth/lucia/blob/main/code/auth_session.ts) —
  token generation, hashing before storage, validation, expiry and extension — which is close to
  exactly what phase 2 needs, in this language.
- **[Pilcrow's Auth Book](https://auth.pilcrowonpaper.com/)** — the same author's longer treatment:
  chapters on sessions, passwords, password hashing algorithms, and CSRF. Successor to
  **[The Copenhagen Book](https://thecopenhagenbook.com/)**, which is archived but still up and
  still the version most people have read.
- **[OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)**
  — the checklist to hold phase 3 against. Session id regeneration on login comes from here.
- **[OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)**
  — Argon2id first, scrypt as the named fallback, with parameters for each. Read it before picking
  scrypt's cost parameters, which matter more than the choice of algorithm.
- **[OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)**
  — general, and where the login-throttling guidance lives.
- **[Behind GitHub's new authentication token formats](https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/)**
  — how a real personal-access-token format is designed: prefix, character set, entropy, checksum.
  The prefix is worth copying; the checksum is not, at this size.
- **[Hono CSRF middleware](https://hono.dev/docs/middleware/builtin/csrf)** and
  **[cookie helper](https://hono.dev/docs/helpers/cookie)** — already dependencies, so no new trust
  is being extended. Note what the CSRF middleware actually checks, in Unknowns below.

---

## Unknowns

- **`hono/csrf` leans on headers a proxy may remove.** It checks `Origin` and `Sec-Fetch-Site` and
  allows the request if either passes — and its own documentation warns that environments using
  reverse proxies to strip those headers "may not work well". Since a proxy is the deployment,
  verify this against the real Caddy setup rather than only in tests, and treat `SameSite=Strict` as
  the protection that does not depend on a header surviving a hop.
- **Trusting `X-Forwarded-Proto` for the `Secure` cookie.** Behind a proxy the daemon cannot see TLS.
  Fallback: a plain configuration flag, believed rather than inferred — honest and slightly annoying.
- **Whether the open-by-default mode survives contact.** No credential meaning no door keeps today's
  behaviour and every existing test working, but a default that is off is a default someone deploys
  by accident. Fallback: keep it, and make the startup line loud and the running doc explicit.
- **Whether setting the password should end open sessions.** It should — a reset is usually a
  response to suspecting something — but it means the person running the command signs themselves
  out of the browser they were holding, which will surprise someone at least once.
- **When authorization stops being deferrable.** The trigger is a credential handed to something not
  fully trusted — a shared script, a hosted integration, a device someone else holds — which is the
  same trigger as `Agent` growing a name, arriving from the other direction. Until then a scope
  would be a fence around one's own garden. Fallback if it arrives sooner than expected: a single
  read-only flag on a token, which covers the common case without a permission model.
- **Bearer tokens and `<img src>`.** A future native client cannot set a header on an image, which is
  item 2 of the spec's own list. Out of scope here — the cookie covers the browser — but the answer
  will be short-lived signed URLs rather than a token in a query string, and phase 7 should say so
  rather than leave it blank.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Every acceptance criterion in `security.md` needs a test standing behind it, including the ones that
were previously true by accident: no `Access-Control-Allow-Origin` on any response, and `SameSite`
on the session cookie. Phase 8 runs `pnpm test:stack`, because this crosses the HTTP surface, the
host's wiring, the client's transport and the config file at once — which is precisely what that
suite is for.

---

## Notes

Phases 2, 3 and 4 are the developer's own work and are not to be implemented by an agent, including
their tests. An agent may read them, review them, and say what it thinks is wrong.

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
