# The run story

**Date**: 2026-08-26
**Status**: In progress
**Spec**: `docs/specs/security.md`
**Closed**:

---

## Goal

Notemap runs as a container on the machine that hosts the other self-hosted apps: an image built
from this repo, a compose service holding the pool, the mirror and the assets in one volume, no
published port, and the existing reverse proxy in front of it carrying whatever authentication that
proxy already carries. The acceptance is capturing a thought from a phone, over the proxy, and
watching it land as a file in a filesystem destination on that machine — with the daemon surviving
a reboot and a `docker compose up -d` without losing the pool.

Nothing about routing changes. Capture → queue → route → file already works end to end
(`tests/full-stack/src/delivery.test.ts`, and by hand on 2026-08-26); this plan is only about the
daemon being something that is *running* rather than something that gets started.

**Getting notes into Nextcloud is not in this plan.** It is a `webdav` destination kind, decided
2026-08-26 against writing into Nextcloud's own data directory: that arrangement is unsupported by
Nextcloud, needs an `occ files:scan` the daemon has no business being able to run, and leaves files
owned by the wrong uid. The kind wants designing alongside destination-target enumeration, since
`PROPFIND` answers both, and it gets its own plan. Until it exists, the vault is reachable here only
as a plain directory.

---

## Tasks

### Phase 1 — an image

Depends on nothing.

- [x] Create branch `agent/run-story`
- [x] `packaging/docker/Dockerfile`, two stages. The builder takes the workspace, installs frozen,
      and runs `pnpm build`. The runtime carries `apps/daemon/dist` and `apps/daemon/public` and
      nothing else: the bundle holds every workspace package, the store is `node:sqlite`, and there
      is no `node_modules` at runtime
- [x] `dist/` and `public/` keep their relative positions in the image — `paths.ts` resolves
      `public/` as a sibling of the directory the bundle sits in. Say so where the copy happens
- [x] It runs as a non-root uid that owns the state directory, and the entrypoint is the bundle with
      `--config` naming the mounted file. `SIGTERM` reaches PID 1 as itself, since the daemon's own
      handler is what gives the runners' leases back
- [x] Verify: `docker build`, then run the image against a scratch config and a scratch volume;
      `GET /v1/health` answers and `/ui` serves. `docker stop` exits without the ten-second kill
- [x] `git commit`

### Phase 2 — a service that comes back

Depends on phase 1.

- [x] `packaging/docker/compose.yaml`: one service, one named volume for the state directory, the
      config file mounted read-only, `restart: unless-stopped`, and **no `ports:`** — it joins the
      proxy's network and is reached by name
- [x] A healthcheck on `GET /v1/health`, which has no refusals and no parameters and is exactly this
      question. The image carries no curl; busybox `wget` or `node -e` does it
- [x] `stop_grace_period` leaves room for `SHUTDOWN_GRACE_MS` plus a delivery in flight — a lease
      that expires with nothing reported is abandoned rather than retried, so a killed daemon costs
      a routing decision
- [x] Verify by hand: `docker compose up -d`, the health check goes healthy, the startup lines are
      in `docker compose logs`, `docker compose restart` and the pool is still there, reboot and it
      comes back
- [x] `git commit`

### Phase 3 — one config that is the real one

Depends on nothing; lands after phase 2 to keep the commits legible.

- [x] `packaging/docker/config.toml`, the file the compose service mounts: the state paths under the
      volume, `host = "0.0.0.0"`, the `text` and `image` payload types, the two web sources, the
      delivery cadence. `apps/daemon/config.example.toml` stays as the local-run example and gains a
      pointer to this one rather than being rewritten around a container
- [x] The container config binds every interface, and that is not the daemon relaxing: a container
      that binds loopback is reachable from nothing at all. The boundary moved to the network and
      the proxy, which is phase 4's business, and the file says so in one line
- [x] Both files say that **destinations are not config**: a vault is created in settings and lives
      in the pool ([ADR 20](../adr/0020-destinations-are-pool-state.md)). A stale `[[destinations]]`
      is already ignored with a warning; where they went belongs in the file
- [x] `config/load.test.ts` reads the container config too, and holds it to what it claims. A
      config the daemon cannot load should fail in CI rather than on the box
- [x] Verify: `pnpm --filter @notemap/daemon test`
- [x] `git commit`

### Phase 4 — what the boundary actually is now

Depends on phase 2, which is the arrangement being described.

- [x] [security.md](../specs/security.md) gains the containerised case, and only that. It was
      written imagining a loopback bind, and that sentence is misleading in the deployment this plan
      builds: the daemon binds every interface by necessity, so what limits reach is the compose
      network and the proxy in front of it. Anything else on a shared Docker network reaches an
      unauthenticated `/v1` — which is why the service joins the proxy's network and its own, and
      not the default one
- [x] The **general** rewrite of that section — the several shapes a deployment takes, of which a
      container is one — belongs to [login-and-access-tokens](login-and-access-tokens.md), which
      lands next and changes what the section is about. Two plans editing one section in sequence is
      fine; two plans editing it at once is not
- [x] What the proxy is expected to carry **until the daemon has a door**: TLS, and authentication,
      because the daemon has none today and `/v1` permits everything to whoever reaches it. Written
      as the interim it is, naming the plan that ends it, rather than as a permanent requirement
- [x] Verify: `pnpm lint`, and the spec reads true against the compose file
- [x] `git commit`

### Phase 5 — the README

Depends on phases 1–4: it describes them.

- [x] Root `README.md`: what notemap is, in the glossary's words, and the shortest path from a clone
      to a running container. Short, pointing at the rest rather than restating it
- [x] `docs/running.md`: build and deploy, the config, the proxy and what it must carry, what is in
      the volume and what to back up — the pool, the mirror and the assets are one unit, because
      rebuilding needs the mirror and the assets together — and how to upgrade: rebuild, `up -d`
- [x] The destinations section: create a `filesystem` destination in settings, route with
      `create-file` into a folder or `append-to-file` onto a note, and what a delivery writes —
      frontmatter carrying the item id, the source, the capture time and the tags, then the
      capture's own markdown. It says plainly that Nextcloud is not reachable yet and names the
      webdav plan
- [x] `docs/README.md`'s table gains the running doc
- [ ] Verify: follow it from a clone on the host, capture from a phone over the proxy, route into a
      directory in a volume, and read the file back — *done except the phone and the proxy, which
      this machine has neither of. Capture, route and read-back were driven against the compose
      service over its network on 2026-08-27.*
- [x] `git commit`

---

## Unknowns

- ~~**`node:sqlite` on musl.**~~ Answered 2026-08-27: `node:24-alpine` carries it, and a pool opens
  and is written to in the image. No Debian fallback needed.
- ~~**The uid that owns the volume.**~~ Answered 2026-08-27: Docker initialises an empty *named*
  volume from the ownership of the image path it covers, and the image chowns `/var/lib/notemap` to
  uid 1000, so nothing has to be chowned. A **bind mount** does not work that way, which is why the
  running doc says a mounted vault must be writable by uid 1000.
- **Whether the proxy terminates at a host root.** Still open, and the running doc takes the
  fallback: give it a hostname of its own. Note that the app is served from `/`, not `/ui` —
  `/ui` answers only because every extensionless path falls through to the shell.
- **Capture from a phone over the proxy.** The client is offline-capable and the shell is same-origin,
  so nothing here should be new — but it has never been used across a real network, and phase 5's
  verify is the first time. Anything that fails there is a finding, not a task in this plan.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Phase 3's config is held by `config/load.test.ts`, which is the one part of this plan a test can
reach. An image, a compose file and a proxy are verified by hand, once, on the host that runs them,
and each phase says how. `pnpm test:stack` still answers for the behaviour inside the container; it
is not what this plan changes.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
