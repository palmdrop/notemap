# A Nextcloud account can be connected from the settings page

**Date**: 2026-09-23
**Status**: Todo <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/http-v1.md`, `docs/specs/shell.md`, `docs/specs/security.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> From the webdav account form, a person enters their Nextcloud address, approves notemap in
> Nextcloud's own login page, and ends with a stored webdav account whose `baseUrl`, `username`
> and app password were filled in by the daemon. They never type or see the password, and it never
> passes through the browser.

---

## Depends on

[accounts-in-the-auth-db](accounts-in-the-auth-db.md), fully: the stored account, the resolver
that reads it per delivery, the session-only account routes and the settings section. This plan
adds a second way of filling a stored webdav account. It adds no new place for a secret to live.

---

## The decisions this rests on

**Login Flow v2, not OAuth2.** Nextcloud's OAuth2 needs a client registered on each server, with a
redirect URI back to an address the daemon cannot promise. Its access tokens expire in an hour, so
notemap would have to hold refresh tokens and run refreshes. Login Flow v2 needs no registration
and no redirect. The daemon starts a flow, the person approves it in the browser, and the daemon
polls until it is handed an app password. That password does not expire and can be revoked per
device under Nextcloud's Settings → Security. It is the same kind of secret `docs/running.md`
already tells people to create by hand.

**The daemon starts and polls, and the browser only opens a URL.** The poll endpoint answers the
app password to whoever holds the poll token. So the poll token stays in the daemon, and the UI
learns only the login URL and the state of the flow. That makes the secret's path Nextcloud →
daemon → `auth.db`, which is shorter than pasting it.

**It is a helper on the webdav kind, not a Nextcloud kind.** The account is an ordinary webdav
account once connected, and the destination that names it cannot tell the difference. What is
Nextcloud-specific is how its three fields are found:
- The secret is the app password.
- `username` is the login name the flow returns.
- `baseUrl` is `<server>/remote.php/dav/files/<user id>`. The user id is **not** always the login
  name: a login by email, or through LDAP, logs in with one and files under the other. It is read
  over OCS (`/ocs/v1.php/cloud/user`) with the new app password, never assumed.

**Session-only, like every account route.** A bearer token can neither start a flow nor read its
state.

---

## Tasks

### Phase 0 — agree the route shape

_Depends on nothing. No code._

- [ ] Branch `agent/connect-a-nextcloud-account`.
- [ ] Agree the routes with the developer before phase 2. Proposed:
      - `POST /v1/accounts/webdav/{name}/nextcloud` takes `{ server }`, starts a flow and answers
        `{ loginUrl }`. It is refused where a config account of that name exists and is not
        shadowed, on the same terms the accounts plan's `PUT` uses.
      - `GET /v1/accounts/webdav/{name}/nextcloud` answers the flow's state, one of `pending`,
        `connected`, `expired` or `failed` (with a reason).
      - Starting a second flow for the same name replaces the first.
- [ ] Settle whether the kind declares this helper, which ties into Unknown 1 of the accounts plan.
      Either the webdav package exports a Nextcloud flow the daemon wires by hand, or a kind can
      declare "ways to connect" that the UI discovers from `GET /v1/account-kinds`. Prefer wiring
      by hand until there is a second one.

### Phase 1 — the flow, in the webdav package

_Depends on phase 0._

- [ ] A `nextcloud/` folder in `packages/adapters/destination-webdav/src` that owns the Nextcloud
      side and nothing else:
      - start a flow against a server;
      - poll it until it succeeds, expires (Nextcloud gives 20 minutes) or fails;
      - on success, resolve the user id over OCS and answer a whole webdav account (`baseUrl`,
        `username`, secret).
      It takes `fetch` and a clock so it can be tested without a server.
- [ ] The rules in `docs/specs/security.md` apply to every request the flow makes: no redirect is
      followed with a credential attached, and TLS verification is never turned off. Plain HTTP to
      an address that is not private is warned about exactly as a config account is.
- [ ] Tests: a flow that succeeds, one that expires, one where the login name and the user id
      differ, a server that is not Nextcloud (the start answers 404 or something other than JSON),
      and a redirect on the OCS call that is not followed.
- [ ] **Verify**: `pnpm --filter @notemap/destination-webdav test` green.
- [ ] `git commit`

### Phase 2 — the routes

_Depends on phase 1 and on phase 4 of the accounts plan._

- [ ] Flows in progress are held in memory in the daemon, keyed by account name. A restart drops
      them, which is acceptable because a flow lives 20 minutes and starting another costs one
      click. Say so in the spec.
- [ ] On success the daemon writes the stored account through the same validated `putAccount`
      path the `PUT` route uses, then discards the poll token.
- [ ] The routes as agreed in phase 0: behind `requireSession`, error kinds in the refusals table,
      `definitions.ts`, the OpenAPI document, generated client types, `packages/client` methods.
- [ ] Tests:
      - a bearer token is refused on both routes;
      - no response carries the app password or the poll token under any shape;
      - a connected flow leaves a stored account that a delivery resolves;
      - a second start replaces the first.
- [ ] **Verify**: `pnpm --filter @notemap/daemon test` green; the OpenAPI snapshot passes.
- [ ] `git commit`

### Phase 3 — the form

_Depends on phase 2 and on phase 5 of the accounts plan._

- [ ] A "Connect Nextcloud" action on the webdav account form. It asks for the server address,
      opens the login URL in a new tab, and shows the flow's state until it ends. When it succeeds
      the form shows the filled-in `baseUrl` and `username` with the secret marked set.
- [ ] Expired and failed flows say what happened and offer to start again.
- [ ] Next to a connected account, a plain line saying that deleting it here does not revoke the
      app password, which is done in Nextcloud's Settings → Security.
- [ ] Tests beside the component.
- [ ] **Verify**: `pnpm --filter @notemap/ui test` green. By hand against a real Nextcloud: connect,
      point a destination at the account, check the destination, deliver a note.
- [ ] `git commit`

### Phase 4 — docs

_Depends on phase 3._

- [ ] `docs/running.md`, webdav section: connecting is the first way described, the config block
      the headless one.
- [ ] `docs/specs/http-v1.md`, `shell.md` and `security.md`, each for what it describes. In
      `security.md`: the poll token never leaves the daemon, and flows are in-memory only.
- [ ] `CONTEXT.md`: add a term only if the UI or the routes needed a word the glossary lacks.
- [ ] **Verify**: `pnpm -r --silent test`, `pnpm -r --silent typecheck`, `pnpm -r --silent lint`,
      then `pnpm test:stack`, since this crosses the HTTP surface.
- [ ] `git commit`

---

## Unknowns

1. **The address the daemon reaches and the one the browser reaches can differ.** The ordinary
   deployment in `docs/running.md` has notemap reaching Nextcloud as `http://nextcloud` on a
   compose network, while the browser knows it as `https://cloud.example.com`. Nextcloud builds the
   login URL and the poll endpoint from its own idea of its address (`overwrite.cli.url`,
   `overwritehost`, or the request's `Host`). So the login URL may be one the browser cannot open,
   or the poll endpoint one the daemon cannot reach. Test this against a compose stack in phase 1
   before building the form. *Fallback*: the form asks for both addresses, with the second
   optional. The daemon starts and polls on its own, stores its own as `baseUrl`, and rewrites the
   login URL's origin to the browser's.
2. **Whether `trusted_domains` refuses a flow started at the internal name.** If it does, the
   operator has to add it, and `docs/running.md` should say so. *Fallback*: document it; the
   daemon cannot work around it.
3. **Servers with the flow disabled or behind SSO.** Some deployments turn off app passwords, or
   put a proxy login in front of `/login/v2`. *Fallback*: a failed start says the server did not
   offer the flow and points at the pasted-password path, which still exists.

---

## Not in this plan

- **Are.na.** It stays a pasted personal access token on the accounts plan's form. Whether are.na
  OAuth supports PKCE or an out-of-band redirect, and so whether it could work for a daemon with no
  fixed address, is a research question to settle first.
- **Revoking the app password upstream when the account is deleted.** Doing it would mean
  recording on the account that it was connected rather than typed. The form says where to revoke
  it instead.
- **Relays.** Unchanged, and still configured by file.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Two tests matter more than the rest: no route ever answers the app password or the poll token, and
a login name that differs from the user id still produces a `baseUrl` that reaches the user's files.

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
