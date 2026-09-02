# Running notemap

One container, one volume, from a published image. Nothing is built on the machine that runs it.

Everything you copy to that machine is in [`docker/compose/`](../docker/compose): two compose files,
the daemon's config, and an `.env` naming the version.

## What you need

- Docker with the compose plugin. That is all — no clone, no pnpm, no toolchain.
- If you are putting it behind a reverse proxy: one already running on a Docker network,
  terminating TLS. **It has to carry authentication too** — see [the proxy](#behind-a-proxy).

## Get the files

The repository is private, so the four files come out of a clone rather than a public tarball:

```sh
mkdir -p /srv/notemap
gh repo clone palmdrop/notemap /tmp/notemap -- --depth 1
cp -r /tmp/notemap/docker/compose/. /srv/notemap/
cd /srv/notemap
```

They are yours from then on; upgrading does not replace them, and nothing else from that clone is
needed on the host.

The image lives at `ghcr.io/palmdrop/notemap`, and the package is private too. Log in once per host:

```sh
echo $PAT | docker login ghcr.io -u palmdrop --password-stdin
```

A classic personal access token with the `read:packages` scope is the form that has always worked;
fine-grained tokens have been gaining Packages support, so check the current state before assuming
one will not do. The login is stored, so this is a one-time step per machine.

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

To ask what is actually running rather than infer it from an image tag:

```sh
curl -s http://127.0.0.1:4747/v1/health
{"pool":"12add8f7-f445-4b8e-b526-317cd85c46a1","version":"0.2.0"}
```

That address is the one `compose.yaml` publishes. Under `compose.proxy.yaml` nothing is on the host
at all, so ask from inside instead — `docker compose -f compose.proxy.yaml exec notemap wget -qO-
http://127.0.0.1:4747/v1/health` — or over the proxy's hostname.

## Signing in

A fresh daemon has no password and lets every request through, and says so on startup:

```
notemap: no password set — every request is let through; `notemap password set` closes the door
```

Close it from inside the running container. It takes effect on the next request — no restart, no
signal:

```sh
docker compose exec notemap notemap password set
```

It asks twice, echoes nothing, and ends every session that was open. `--name` sets who the login
asks for; leaving it out uses `admin`. Piping works too, for a script:
`printf '%s\n' "$PASSWORD" | docker compose exec -T notemap notemap password set`.

Run `exec` as it comes, without `-u root`. The daemon runs as `node` and its database is that
user's alone; a root process would leave SQLite's `-wal` and `-shm` files owned by root, and the
daemon could no longer write them.

There is no email in any of this — no verification, no reset link. **A forgotten password is reset
by the same command**, which asks for no old one. That grants nothing: whoever can run it can
already read the pool's database off the volume, which is why it is a recovery path rather than a
way in.

If the daemon will not start at all, do not try to `exec` into a container that is not up. Start one
just for the command, which overrides the image's own:

```sh
docker compose run --rm notemap password set
```

Running the daemon directly rather than in a container, it is the same command against the binary:
`notemap-daemon password set`.

## Access tokens

A browser signs in and holds a session. Anything else — a script, a headless client, a machine with
no browser in the loop — carries an access token instead:

```sh
docker compose exec notemap notemap token mint --name laptop
nmp.ei9pmmbzgs6hqpe2.461s0-TQjtup6tOreeRwQAZXQEY6R0lr67QaIZkEGFM
```

**That is the only time it is readable.** The daemon stores a hash and cannot reproduce it, so a
token nobody wrote down is replaced rather than recovered. It goes in an `Authorization: Bearer`
header, and reaches everything a session does except the token routes themselves — a leaked token
cannot mint its own replacement.

`--expires` takes a date or an instant and mints one that stops working then. Without it, it works
until revoked.

```sh
docker compose exec notemap notemap token list      # names, times, and when each was last used
docker compose exec notemap notemap token revoke <id>
```

Revoking takes effect on the next request; nothing caches an authentication. `last used` is what
says whether a token is still in use, and is the thing to read before revoking one you have
forgotten the purpose of.

There is no command for users, because there are none: one credential, and the tokens it issues.

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
| `v0.2.0`, `v0.2` | A release. What you should be running. |
| `sha-a1b2c3d` | Any commit on `main`, for trying something that has no release yet. |
| `latest` | The most recent release. Moves on its own. |

The image tags carry the `v` the git tag does, so the version in `.env` is the release as it is
written everywhere else.

The volume is never touched by an upgrade. Notemap is greenfield and has no migrations: features and
APIs may change without one ([AGENTS.md](../AGENTS.md#what-this-project-is)), so read what changed
first, and take the backup below.

## The volume, and what to back up

The named volume `notemap_state` holds all three of these under `/var/lib/notemap`:

| | |
|---|---|
| `state/notemap.db` | The pool. The authority for everything. |
| `state/auth.db` | The password and the access tokens. Not in the pool, and never mirrored. |
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

`config.toml` is mounted read-only at `/etc/notemap/config.toml`, which is where the image's own
command looks — not a notemap default. Run directly, the daemon reads
`~/.config/notemap/config.toml`; the container names its path explicitly instead, because `/etc` is
where an operator's file belongs and the daemon's own user's home is not. Editing it takes a
`docker compose restart`.

It binds `host = "0.0.0.0"`, which is not the daemon relaxing: a container that binds loopback is
reachable from nothing at all, not even the proxy. What limits reach is the compose file you chose.
`apps/daemon/config.example.toml` in the repo is the annotated reference for every key.

**Destinations are not in this file.** A vault is created in settings and lives in the pool
([ADR 20](adr/0020-destinations-are-pool-state.md)), so it survives an upgrade and is edited without
a restart. A leftover `[[destinations]]` block is ignored with a warning on startup.

## Destinations

A destination is created in the app's settings, not in a file: a name, a kind, and that kind's
settings. Today there are two kinds — a folder this container can see, and a folder on a WebDAV
server it can reach.

### filesystem

Its one setting is `root`, **a path inside the container**, and the only directory it may be
mounted under is `/var/lib/notemap/vaults` — there is nothing else to configure, because the
container reaches nothing else: nothing else is mounted. Mount the directory you mean somewhere
under it and name the container's side of the mount — there is a commented-out example in both
compose files:

```yaml
volumes:
  - /srv/vault:/var/lib/notemap/vaults/second-brain
```

Then create a destination with `root = "/var/lib/notemap/vaults/second-brain"`. The daemon runs as
uid 1000, so that directory has to be writable by uid 1000 on the host. The root is never created
for you: one that is not there is an unmounted drive far more often than it is a typo.

A root pointed at the pool, the mirror or the assets instead — `/var/lib/notemap/state`,
`/var/lib/notemap/pool-mirror`, `/var/lib/notemap/assets` — is refused, whether it names one of
them exactly or sits inside or around one: routing a note into the mirror is destructive and
nobody ever means it. Mounting under `vaults/` keeps the two apart without having to think about
it, but the refusal holds regardless of what is mounted where.

What is reserved is the pool's whole **directory**, not the database file — its `-wal` and `-shm`
siblings are part of the pool and are not named in any config. So a `pool` moved up a level, to
`/var/lib/notemap/notemap.db`, would reserve `/var/lib/notemap` and make every vault mounted under
it unusable. Leave the database in `state/`.

Routing an item at it uses one of two capabilities:

- **`create-file`** — writes a new file under `directory` (empty names the root itself). Give it a
  `filename` or let one be derived from the capture. It never overwrites: a name already taken is
  refused, and the decision comes back to you. An *asset* whose name is taken becomes `name-1.png`
  rather than being refused, since nobody chose that name.
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

### webdav

A folder on a WebDAV server — a Nextcloud vault, most immediately. The note arrives as something
the server already knows about: no `occ files:scan`, no shared volume, no uid to align. It writes
the same markdown the `filesystem` kind writes, and its two capabilities are the same two, with the
same fields.

**The account is not a setting.** A destination's settings are two things — the *name* of an
account and a *folder* under it — and there is nowhere in them to put an address or a password.
Settings live in the pool: `GET /v1/destinations` answers them to anything signed in, and the
mirror writes them to disk in the clear. And an address in one would be somewhere the daemon sends
that password, chosen by whoever can create a destination
([ADR 28](adr/0028-a-remote-destination-names-a-credential-profile-not-a-url.md)).

So the account goes in `config.toml`, once:

```toml
[[webdav]]
name = "nextcloud"
baseUrl = "https://cloud.example.com/remote.php/dav/files/alice"
username = "alice"
passwordFile = "/run/secrets/notemap_webdav_nextcloud"
```

`baseUrl` is the DAV collection the account is rooted at. For Nextcloud that is
`https://<host>/remote.php/dav/files/<user>` — the whole of that user's files, with the vault a
folder below it.

Plain HTTP is fine where the password cannot cross a network somebody else is on: loopback, a
private or link-local address, or a **single-label name**, which is what a container on the same
network is called. Nextcloud in the same compose stack is `http://nextcloud/remote.php/dav/files/…`
and needs no certificate. Anywhere else, plain HTTP still works and the daemon says so once on
startup, naming the account:

```
notemap: the webdav account nextcloud reaches cloud.example.com over plain HTTP, so its
password crosses the network in the clear — put TLS in front of it, or reach it at a private address
```

It is said rather than enforced because a private VLAN, a tunnel and a mesh interface are
indistinguishable from the open internet at this end, and only you know which one it is.

Use an **app password** rather than the account's own: Nextcloud issues them under Settings →
Security, and one can be revoked without changing the password everywhere else. It comes from
`passwordFile` or `passwordEnv` and never from an inline `password`, which is refused on startup —
`config.toml` is a file that gets backed up and pasted into issues. There is a commented-out secret
in both compose files. The file is read when a delivery needs it, so rotating the password is
writing the file; the daemon prints the account names it holds on startup, and never a password.

Then create a destination in settings with `profile = "nextcloud"` and `root = "Notes/Vault"` —
where the folder is the vault inside that account, or blank for the account's own folder. Several
vaults on one account are several destinations naming one profile.

The root is never created for you, for the same reason the `filesystem` kind's is not: one that is
not there is a vault somebody has not made yet. Folders *below* it are created as notes are filed
into them. A create never overwrites — a name already taken is refused — and an append never loses
a write that landed between the read and the write, which is a thing that can happen here and
cannot on a local disk. An account that is unreachable, a password that will not read, or a
profile that is not declared all leave the delivery pending and retried, on the same terms as an
unmounted drive.

## Cutting a release

From a clone, on the machine you develop on:

```sh
pnpm release patch   # or minor, or major
```

It refuses unless you are on `main` with a clean tree and nothing unpulled, runs typecheck, lint,
format, the tests and the full-stack suite, then bumps the version in `package.json`, commits it as
`chore(release): v0.2.0`, tags, and pushes both. CI builds from the tag and pushes `v0.2.0`, `v0.2`
and `latest` to GHCR — and refuses if the tag and `package.json` disagree.

Every push to `main` also gets a `sha-<short>` tag, so a build with no release yet is still
something the homelab can pin.

To try the image locally without a release, build it under a name the compose files will use:

```sh
docker build -t ghcr.io/palmdrop/notemap:dev .
cd docker/compose && NOTEMAP_VERSION=dev docker compose up -d
```
