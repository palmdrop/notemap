# A staging stack per branch

**Date**: 2026-10-13
**Status**: Todo <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/security.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Where this stands

As of 2026-10-13. Read this first when picking the work up.

- **Not started.** Nothing in this plan is implemented, and the plan itself is uncommitted on
  `main`. Commit it on `agent/staging-environment` as the first step.
- **The agents half is in progress** on branch `agent/agent-stage`, in the worktree
  `~/.local/share/agents/worktrees/agents/agent-stage`. Its plan,
  `docs/plans/agent-stage.md` on that branch, carries its own state. This plan only needs that
  plan's *contract* (the `STAGE_*` variables, `.claude/stage/` on `main`, and the network rule in
  its phase 5) and is verified without it.
- **Rootless podman bridge networks were broken** on 2026-10-13: the kernel was upgraded without a
  reboot, so `/lib/modules/$(uname -r)` was missing and netavark's nftables setup failed with
  `Could not process rule: No such file or directory`. A reboot fixes it. If compose still fails
  that way, check `uname -r` against `ls /lib/modules` before suspecting this stack.
- **No decisions are open.** Phase 2 was dropped on 2026-10-13 (see its note), and the phase
  numbers were kept rather than renumbered.

---

## Goal

> `.claude/stage/` on `main` defines a containerised notemap for any branch: a daemon built from
> that branch, with a real WebDAV server, a fake are.na and a fake page server beside it, and a
> seed job. When the stack comes up, signing in with the password from the stage secrets file
> shows seeded items. Some are already routed to a filesystem vault, the WebDAV server and the
> fake are.na, and their links have previews. Each arrival can be inspected, and nothing built
> from the branch can reach anything outside the stack.

The lifecycle (which branch, when to rebuild, when to tear down, ports, URL) belongs to `agent
stage` in the agents repo, planned in `agents/docs/plans/agent-stage.md`. This plan is the
notemap half. It is written against that plan's contract and verified with plain `podman
compose`, so it does not wait on it.

---

## Decisions this rests on

Settled 2026-10-12/13 with the developer, except where marked.

- **An are.na account takes an optional `baseUrl`, as a WebDAV account does.** Absent means
  `https://api.are.na`. This matches
  [ADR 28](../adr/0028-a-remote-destination-names-a-credential-profile-not-a-url.md): the account
  holds where it points. The adapter already takes a `baseUrl` (`destination-arena/src/api.ts`),
  but only per adapter instance. It moves onto the credential, so each account carries its own.
  [ADR 40](../adr/0040-a-destination-kind-declares-the-shape-of-its-own-account.md)'s account
  shape for are.na gains the optional field. The settings page's account form
  ([accounts in the auth db](accounts-in-the-auth-db.md)) gets it wherever the WebDAV form has
  `baseUrl`.
- **WebDAV is real, are.na and pages are fake.** `rclone serve webdav` stands in for Nextcloud,
  because a real server checks more than the in-memory `dav-server.ts` does. are.na has no
  self-hostable substitute, so `arena-server.ts` is lifted into a standalone process. It is partial
  and in memory, and what it accepts says nothing about whether the real are.na would. The page
  server answers every path with the same placeholder page (title, description, image), and
  nothing more.
- **Nothing built from the branch has a route out.** The daemon, the fakes and the seed join only
  an `internal: true` network. One `edge` service runs a pinned caddy image and a config from
  `.claude/stage/`. It is the only service on a routed network, publishes every port on
  `127.0.0.1`, and reverse-proxies to the internal services. `agent stage` enforces this for every
  project (agents plan, phase 5): it refuses a definition in which a service built from
  `$STAGE_CONTEXT` joins a network that is not internal. It also closes the LAN: a rootless
  container on a routed network reaches anything the host can, except services bound to host
  loopback alone.
- **Build-time egress is accepted.** `podman build` has unrestricted network, so a `postinstall`
  runs outside any firewall. The build holds nothing secret (the stage password only exists at
  runtime), and the sandbox's GitHub PAT is already a way out for the code itself. Closing it
  would need a trusted Dockerfile separate from the real one, and then staging would stop testing
  the real one. Named in `.claude/stage/README.md`.
- **Unfurl reaches the page server because `stack` uses a publicly routable subnet, not because
  the guard is relaxed.** The unfurl guard (`apps/daemon/src/unfurl/guard.ts`) refuses every
  private, reserved and documentation range, so it refuses every address a compose network hands
  out by default. `docs/specs/security.md` rules out an exception: "There is no allowlist, by
  decision. No configuration, no deployment-level exception." So the stage gives `stack` a subnet
  from publicly routable space that the guard classifies as public, and the daemon is unchanged.
  Nothing outside can reach it, because nothing routes that range to this machine and the bridge
  lives in podman's rootless namespace, away from the host's routing table. Nothing inside can
  leave, because `stack` is internal. The only thing shadowed is the range's real owners, and only
  from the stack's own containers, which have no route to them anyway. Rejected:
  - An `[unfurl] exemptHosts` config key. It reverses the no-allowlist decision for the sake of a
    test stack.
  - Leaving previews broken in staging. That stays the fallback if the subnet does not work.
- **The password comes from `$STAGE_SECRETS`** (`~/.config/agents/notemap.stage.env`, holding
  `NOTEMAP_PASSWORD=…`), which the daemon provisions from on its empty auth db. Every rebuild
  starts from empty volumes, so a changed password takes effect on the next rebuild. It must not be
  the password of a real pool: branch-built containers hold it. The stage README says so.
- **The origin is templated from `$STAGE_URL` when the container starts.** There is no daemon
  change: the config template is mounted read-only and the compose command writes the real one.
  The origin is a plain-HTTP non-loopback address reached over Twingate, so the session cookie
  goes without `Secure` and `__Host-`, as the config already documents for that case. That is
  acceptable for a stage holding fixtures and nothing else.
- **The definition lives on `main` and only images come from the branch.** That is the agents
  plan's rule, and it means phase 5 only becomes usable through `agent stage` once it is merged.
  `--definition-from` covers developing it before then.

---

## Tasks

### Phase 0

- [ ] Create branch `agent/staging-environment`, and commit this plan on it.

### Phase 1: an are.na account names its own `baseUrl`

Depends on nothing.

- [ ] An optional `baseUrl` on an are.na account: in the account's fields, through
      `asArenaCredential`, and onto every API call the destination makes for that account. The
      per-instance `baseUrl` on `createArenaDestination` goes, unless something besides tests uses
      it.
- [ ] Wherever the WebDAV `baseUrl` is accepted, the are.na one is too: config `[[accounts]]`, the
      account routes and the settings form.
- [ ] `config.example.toml`, ADR 40's account shape (a superseding note if the ADR states the shape
      as closed), and `docs/specs/security.md`: the token goes to the account's `baseUrl`, so that
      field is as trusted as the secret beside it.
- [ ] Commit.

**Verify:** a daemon test routes an item to an are.na destination whose account `baseUrl` points
at `arena-server.ts`, and the block lands in the fake. Two accounts with different `baseUrl`s
deliver to their own servers. With no `baseUrl`, the existing tests pass unchanged.

### Phase 2: unfurl reaches hosts the config names

- [-] `[unfurl] allowHosts` _(dropped 2026-10-13: it contradicts the spec's no-allowlist decision.
      `stack`'s public subnet reaches the page server with the guard unchanged; see Decisions)_

### Phase 3: seed signs in and lays out destinations

Depends on phase 1 (an are.na destination must be able to point at the fake).

- [ ] `@notemap/seed` and `pnpm seed` take a password (`--password-file`, or `NOTEMAP_PASSWORD`)
      and sign in through the same route the client uses, so a stage behind a password can be
      seeded. Without one, the behaviour is unchanged.
- [ ] Seed takes a fixture file (`--fixtures <file>`): destinations by kind and account (a
      filesystem vault, a WebDAV account and folder, an are.na account and channel) and templates
      with trigger tags. It creates them before seeding, and tags captures so that at least one
      routes to each destination. The fixture can also name a base URL for links, so captures link
      to the page server.
- [ ] Commit.

**Verify:** `tests/seed` drives a password-protected daemon with a fixture naming all three kinds,
against `dav-server.ts` and `arena-server.ts`. Every destination ends up with a delivered item,
and `seed` reports a route to each.

### Phase 4: the fakes as processes, and the stage image

Depends on phase 3 (the image carries the seed).

- [ ] A standalone entry for `arena-server.ts`. It takes its listen port and the URL presigned
      uploads should name from the environment, preloads the channels a fixture names, and answers
      `GET /_inspect` with the blocks and uploads it holds.
- [ ] A page server: every path answers the same HTML page with OpenGraph title, description and
      image, and the image it names.
- [ ] `Dockerfile.stage` with three targets, `arena`, `pages` and `seed`, built from the workspace
      the way `Dockerfile` builds it. The production `Dockerfile` is untouched.
- [ ] `Dockerfile.stage` in `verify.yml`'s image matrix, so a stage that cannot build shows up on
      the PR that broke it.
- [ ] Commit.

**Verify:** all three targets build. `podman run` of `arena` answers `GET /v3/me` with the token
and refuses without it, and `/_inspect` starts empty. `pages` answers any path with the
placeholder.

### Phase 5: `.claude/stage/`

Depends on phase 4.

- [ ] `compose.yaml`:
  - Two networks: `stack` (`internal: true`, with an explicit subnet from publicly routable
    space, so the unfurl guard reads `pages` as public) and the default. Choose the subnet outside
    every range `guard.ts` refuses, and say why in a comment.
  - `notemap`: built from `$STAGE_CONTEXT` with `Dockerfile`, on `stack` only, healthchecked over
    `/v1/health`.
  - `webdav`: `rclone serve webdav` with an image pinned by digest and fixed non-secret
    credentials, on `stack` only.
  - `arena`, `pages` and `seed` (one-shot, after `notemap` is healthy): from `Dockerfile.stage`,
    on `stack` only.
  - `edge`: caddy pinned by digest, on both networks, publishing `127.0.0.1:$STAGE_PORT_APP`,
    `$STAGE_PORT_WEBDAV` and `$STAGE_PORT_ARENA`, and proxying them to `notemap`, `webdav` (for
    browsing what landed) and `arena` (for `/_inspect`).
  - A volume per stage.
- [ ] `Caddyfile` for `edge`.
- [ ] `config.toml` template:
  - Pool, auth, mirror and assets under the volume.
  - `[[accounts]]` for `webdav` (`http://webdav:<port>/`, a single-label name, so plain HTTP is
    accepted) and for `arena` (`baseUrl = "http://arena:<port>"`).
  - `origin` filled from `$STAGE_URL`.
- [ ] `ports` (`app`, `webdav`, `arena`), `fixtures.json`, and a `README.md`. The README covers
      what a stage holds, where the password goes and that it must not be a real one, how to
      inspect arrivals, the network layout including why `stack` has a public subnet, and the
      accepted build-time egress.
- [ ] `tests/integration/src/compose.test.ts` gains the stage file: published on loopback and
      nowhere else, as it already checks for `docker/compose/`, and every service but `edge` on
      `stack` alone.
- [ ] Commit.

**Verify:**
- With the `STAGE_*` variables set by hand, `podman compose -f .claude/stage/compose.yaml up
  --build --wait` comes up.
- The app URL asks for a password and takes the one from the secrets file.
- The queue holds seeded items, the log shows routes to all three destinations, and the linked
  captures have previews.
- The WebDAV listing shows the file, and `/_inspect` shows the block.
- `podman exec` into `notemap` and fetch any outside address: it fails.
- Once the agents plan has landed, `agent stage <branch> --definition-from
  agent/staging-environment` does the same from one command, and accepts the definition under its
  network rule.

### Phase 6: docs

Depends on phase 5.

- [ ] `AGENTS.md`: one line under Verification saying a branch can be staged with `agent stage`,
      pointing at `.claude/stage/README.md`.
- [ ] Propose a README addition to the developer. Do not write it.
- [ ] Commit.

**Verify:** the docs name the secrets file, the inspect URLs, the network layout and the build
egress, and say nothing the stack does not do.

---

## Unknowns

- **Presigned uploads across two names.** The daemon reaches the fake as `http://arena:<port>`,
  and you reach `/_inspect` through `edge`. The presigned URL has to name the first. `/_inspect`
  reports uploads from memory, so it never needs a public one. Fallback if the adapter insists on
  something about the upload host: serve uploads from a second listener on its own internal name.
- **What the fake leaves out.** It implements the v3 calls the adapter's tests use. The composer's
  channel browse goes through `/v3/users/{id}/contents`, which the fake answers one page of, so a
  fixture with more channels than a page shows only the first. Keep the fixture under a page.
- **Signing in from the seed.** Whether seed should take a session cookie or mint an access token
  depends on which the client package already supports headless. Read `@notemap/client` before
  choosing, and prefer whatever it does.
- **A public subnet on an internal network.** Netavark should accept any subnet, but nobody has
  tried it on this host. Check two things: that the unfurl of a seeded link draws the placeholder,
  and that the host's own route to that range is untouched (`ip route get <an address in it>` on
  the host still goes out the default route). Fallback: previews stay broken in staging, and the
  README says so.
- **DNS on an internal network.** Service names must resolve on `stack` with no route out.
  Netavark's aardvark serves internal networks, but nobody has tried it on this host. Fallback:
  fixed addresses on `stack`, plus `extra_hosts`.
- **Build time per push.** Every rebuild is a full `podman build` of four images. The `pnpm fetch`
  layer is cached unless the lockfile changed. If a rebuild takes long enough to matter, measure
  before optimising.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

`pnpm test:stack` is not affected. The stage is checked by the compose test in phase 5 and by CI
building `Dockerfile.stage`. The stack coming up as a whole is verified by hand, per phase 5.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
