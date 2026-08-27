# Running notemap

One container, one volume, from a published image. Nothing is built on the machine that runs it.

Everything you copy to that machine is in [`docker/compose/`](../docker/compose): two compose files,
the daemon's config, and an `.env` naming the version.

## What you need

- Docker with the compose plugin. That is all — no clone, no pnpm, no toolchain.
- If you are putting it behind a reverse proxy: one already running on a Docker network,
  terminating TLS. **It has to carry authentication too** — see [the proxy](#behind-a-proxy).

## Get the files

```sh
mkdir -p /srv/notemap && cd /srv/notemap
curl -L https://github.com/palmdrop/notemap/archive/refs/heads/main.tar.gz \
  | tar xz --strip-components=3 '*/docker/compose'
```

Or copy `docker/compose/` out of a clone you already have. The four files are yours from then on;
upgrading does not replace them.

The image lives at `ghcr.io/palmdrop/notemap`, and the package is private. Log in once per host:

```sh
echo $PAT | docker login ghcr.io -u palmdrop --password-stdin
```

**It has to be a classic personal access token** with the `read:packages` scope — GHCR does not
accept fine-grained tokens. The login is stored, so this is a one-time step per machine.

## Standalone

Reachable from that machine and nothing else.

```sh
$EDITOR .env          # NOTEMAP_VERSION
$EDITOR config.toml   # only if the defaults are wrong for you
docker compose up -d
```

`compose.yaml` publishes `127.0.0.1:4747`, so `curl http://127.0.0.1:4747/v1/health` answers on the
host and nothing on the LAN can reach it. **Do not change that to `4747:4747`** — `/v1` has no
authentication, and that one edit puts the whole pool on your network.

## Behind a proxy

```sh
$EDITOR .env          # NOTEMAP_VERSION, and PROXY_NETWORK
docker compose -f compose.proxy.yaml up -d
```

`compose.proxy.yaml` is a whole file rather than an overlay on `compose.yaml`: pick one, use it, and
what you are running is the file you can read. It publishes no port and joins the network named by
`PROXY_NETWORK`, which must already exist — compose will not create it.

Point the proxy at `notemap:4747` and give notemap **a hostname of its own** rather than a subpath.
The app is a static build made for its own origin and the daemon serves it from `/`; mounting it
under `/notemap/` on a shared host is untested and would need a build flag.

What the proxy must supply, because the daemon does not:

- **TLS.** The daemon speaks plain HTTP.
- **Authentication.** There is none in notemap: everything that reaches `/v1` can read the whole
  pool, capture into it, and download any asset. Whatever your proxy already carries for the other
  apps behind it is what protects notemap too, until
  [a login and access tokens](plans/login-and-access-tokens.md) lands.

Two things to check in the proxy's own configuration:

- **The body-size limit.** Uploads go up to `assets.maxUpload` in `config.toml` — 256 MiB by
  default. A proxy capping bodies lower than that refuses photos before the daemon sees them
  (nginx's `client_max_body_size`).
- **The read timeout**, for the same reason.

[What is undefended](specs/security.md) is the full account of what each of these two arrangements
is open to, including the fact that anything else on the proxy's network reaches an unauthenticated
`/v1`.

## One container, not two

The app is not a service of its own. It is a static build the daemon serves from its own origin,
which is what lets the daemon send no CORS headers at all — the only thing stopping another origin
from reading the pool of whoever is running it ([security.md](specs/security.md)). Two containers
would be two origins, and closing that again would mean either a CORS header on an API with no
authentication, or a proxy merging them back into one origin.

## Checking on it

```sh
docker compose ps      # healthy, once the healthcheck has asked /v1/health
docker compose logs    # the pool, the mirror, the assets and the destinations it found
```

## Upgrading

The version you run is one line in `.env`:

```sh
$EDITOR .env                        # NOTEMAP_VERSION=v0.2.0
docker compose pull && docker compose up -d
```

Rolling back is the same edit with the old value. Pin a release rather than leaving
`NOTEMAP_VERSION=latest`: `latest` moves under you the next time one is cut, which is the wrong
moment to discover what changed.

Which tags exist:

| | |
|---|---|
| `v0.2.0`, `0.2` | A release. What you should be running. |
| `sha-a1b2c3d` | Any commit on `main`, for trying something that has no release yet. |
| `latest` | The most recent release. Moves on its own. |

The volume is never touched by an upgrade. Notemap is greenfield and has no migrations: features and
APIs may change without one ([AGENTS.md](../AGENTS.md#what-this-project-is)), so read what changed
first, and take the backup below.

## The volume, and what to back up

The named volume `notemap_state` holds all three of these under `/var/lib/notemap`:

| | |
|---|---|
| `state/notemap.db` | The pool. The authority for everything. |
| `pool-mirror/` | The plain-file copy of every item, written and never read back. |
| `assets/` | The blobs — every uploaded image, recording and snapshot. |

**Back them up as one unit.** A rebuild reads the mirror, and the mirror's records point at blobs,
so a mirror without its assets rebuilds a pool full of dangling references.

SQLite is being written to while the daemon runs, so stop it first:

```sh
docker compose stop
docker run --rm -v notemap_state:/state -v "$PWD:/out" alpine \
  tar czf /out/notemap-$(date +%F).tar.gz -C /state .
docker compose start
```

## The config

`config.toml` is mounted read-only at `/etc/notemap/config.toml`. Editing it takes a
`docker compose restart`.

It binds `host = "0.0.0.0"`, which is not the daemon relaxing: a container that binds loopback is
reachable from nothing at all, not even the proxy. What limits reach is the compose file you chose.
`apps/daemon/config.example.toml` in the repo is the annotated reference for every key.

**Destinations are not in this file.** A vault is created in settings and lives in the pool
([ADR 20](adr/0020-destinations-are-pool-state.md)), so it survives an upgrade and is edited without
a restart. A leftover `[[destinations]]` block is ignored with a warning on startup.

## Destinations

A destination is created in the app's settings, not in a file: a name, a kind, and that kind's
settings. Today there is one kind.

### filesystem

Its one setting is `root`, **a path inside the container**. Mount the directory you mean and name
the container's side of the mount — there is a commented-out example in both compose files:

```yaml
volumes:
  - /srv/vault:/vault
```

Then create a destination with `root = "/vault"`. The daemon runs as uid 1000, so that directory has
to be writable by uid 1000 on the host. The root is never created for you: one that is not there is
an unmounted drive far more often than it is a typo.

Routing an item at it uses one of two capabilities:

- **`create-file`** — writes a new file under `directory` (empty names the root itself). Give it a
  `filename` or let one be derived from the capture. It never overwrites: a name already taken
  becomes `name-1.md`.
- **`append-to-file`** — appends onto an existing note at `path`, under `heading` if you name one,
  at the end of the file if you do not.

A delivered `text` capture is a markdown file: frontmatter carrying the item id, the source, the
capture time and the tags, then the capture's own markdown, unaltered.

```markdown
---
id: '01a04298-6a88-70e5-b49a-c08be16017cd'
capture_source: 'web-manual'
payload_type: 'text'
captured_at: '2026-08-27T10:00:00.000Z'
wasAttributedTo: 'web-manual'
derived_from: 'urn:commons:item:01a04298-6a88-70e5-b49a-c08be16017cd'
tags:
  - 'kind/note'
  - 'project/run-story'
---

# A thought

Routed into a folder on the host.
```

An `image` capture gets its assets copied in beside the note and embedded by relative link, so the
vault keeps working with notemap gone.

### Nextcloud

**Not reachable yet.** A Nextcloud vault is reachable here only as a plain directory, and writing
into Nextcloud's own data directory is not that — it is unsupported by Nextcloud, needs an
`occ files:scan` the daemon has no business being able to run, and leaves files owned by the wrong
uid. [A webdav destination kind](plans/destination-webdav.md) is what makes it work properly.

## Cutting a release

From a clone, on the machine you develop on:

```sh
git tag v0.2.0 && git push --tags
```

CI builds the image and pushes `v0.2.0`, `0.2` and `latest` to GHCR. Every push to `main` also gets
a `sha-<short>` tag, so a build with no release yet is still something the homelab can pin.

To try the image locally without a release, build it under a name the compose files will use:

```sh
docker build -t ghcr.io/palmdrop/notemap:dev .
cd docker/compose && NOTEMAP_VERSION=dev docker compose up -d
```
