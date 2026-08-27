# Running notemap

One container, one volume, no published port, behind the reverse proxy that already fronts your
other self-hosted apps. Everything here lives in `packaging/docker/`.

## What you need

- Docker with the compose plugin.
- A reverse proxy already on a Docker network, terminating TLS. **It has to carry authentication
  too** — see [the proxy](#the-proxy).

## From a clone to a running daemon

```sh
git clone https://github.com/palmdrop/notemap.git
cd notemap/packaging/docker
$EDITOR config.toml   # only if the defaults are wrong for you
NOTEMAP_PROXY_NETWORK=proxy docker compose up -d --build
```

`NOTEMAP_PROXY_NETWORK` names the existing Docker network your proxy is on; it defaults to `proxy`.
The network is not created here — compose expects to find it.

Then:

```sh
docker compose ps      # healthy, once the healthcheck has asked /v1/health
docker compose logs    # the pool, the mirror, the assets and the destinations it found
```

The daemon is on no address the host publishes. On the proxy's network it answers at
`http://notemap:4747`.

## The proxy

Point it at `notemap:4747` and give notemap **a hostname of its own** rather than a subpath. The app
is a static build made for its own origin and the daemon serves it from `/`; mounting it under
`/notemap/` on a shared host is untested and would need a build flag.

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

[What is undefended](specs/security.md) is the full account of what this arrangement is open to,
including the fact that anything else on the proxy's network reaches an unauthenticated `/v1`.

## The config

`packaging/docker/config.toml` is mounted read-only at `/etc/notemap/config.toml`. Editing it takes
a `docker compose restart`.

It binds `host = "0.0.0.0"`, which is not the daemon relaxing: a container that binds loopback is
reachable from nothing at all, not even the proxy. `apps/daemon/config.example.toml` is the
annotated reference for every key.

**Destinations are not in this file.** A vault is created in settings and lives in the pool
([ADR 20](adr/0020-destinations-are-pool-state.md)), so it survives a rebuild and is edited without
a restart. A leftover `[[destinations]]` block is ignored with a warning on startup.

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

## Destinations

A destination is created in the app's settings, not in a file: a name, a kind, and that kind's
settings. Today there is one kind.

### filesystem

Its one setting is `root`, **a path inside the container**. Mount the directory you mean and name
the container's side of the mount — there is a commented-out example in `compose.yaml`:

```yaml
volumes:
  - /srv/vault:/vault
```

Then create a destination with `root = "/vault"`. The daemon runs as uid 1000, so that directory
has to be writable by uid 1000 on the host. The root is never created for you: one that is not
there is an unmounted drive far more often than it is a typo.

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

## Upgrading

```sh
git pull
NOTEMAP_PROXY_NETWORK=proxy docker compose up -d --build
```

The volume is not touched. Notemap is greenfield and has no migrations: features and APIs may
change without one ([AGENTS.md](../AGENTS.md#what-this-project-is)), so read what changed before
upgrading a pool you care about, and take the backup above first.
