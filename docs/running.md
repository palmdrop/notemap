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
docker compose logs    # what it found on startup, and everything it has done since
```

The log is one line per event: the clock, the level, what happened, then the facts as
`key=value`.

```
13:26:17.257 INFO /var/lib/notemap/state/notemap.db on http://0.0.0.0:4747
13:26:17.258 INFO mirroring mirror=/var/lib/notemap/pool-mirror
13:26:18.670 INFO action kind=captured item=01925f3e-… by=source source=raycast
13:26:40.102 INFO action kind=routed item=01925f3e-… by=person record=… destination=… target=destination
13:27:02.511 WARN action kind=delivery-failed item=01925f3e-… by=notemap record=… attempt=1 failure.code=unreachable
```

Every action the pool records is there — the same facts `/v1/actions` serves, as they happen — and
so is every sign-in, every token minted or revoked, and every failure with its stack. Requests are
below the default level: `NOTEMAP_LOG_LEVEL=debug` in the compose file's `environment` shows each
one with its status, its duration and who asked, and `format = "json"` under `[log]` in
`config.toml` makes every line an object for a collector. Neither prints a note's text, a password
or a token's secret.

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
| `state/auth.db` | The password, the access tokens, and every account set from settings, **its secret readable**. Not in the pool, and never mirrored. |
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

- **`create`** — writes a new file under `directory` (empty names the root itself). Give it a
  `filename` or let one be derived from the capture. It never overwrites: a name already taken is
  refused, and the decision comes back to you. An *asset* whose name is taken becomes `name-1.png`
  rather than being refused, since nobody chose that name.
- **`append`** — appends onto an existing note at `path`, under `heading` if you name one,
  at the end of the file if you do not.

A delivered `text` capture is a markdown file: the capture's own markdown, unaltered, under
frontmatter carrying the item id, the source, the capture time and the tags — **where you asked for
it**. `frontmatter` is a setting on the destination, `full` or `none`, and the same word is an
argument on one capture that overrides it. Unset means none, so a destination that never said it
wants provenance writes the prose alone.

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

So an account is declared apart from any destination, in one of two places. **From settings**, on
the Accounts page, while signed in: the daemon stores it in `state/auth.db`, and a new or replaced
one is used from the next delivery on, with no restart. **Or in `config.toml`**, which is the way
for a container with no browser. Where both name the same kind and name, the stored one wins
entirely and the config block is ignored — the Accounts page marks it, and the daemon says so on
startup.

**A stored secret is recoverable on disk.** It has to be presented to Nextcloud or are.na, so it
cannot be hashed the way your own password is. It sits in `auth.db` as given, protected by that
file's `0600` mode and nothing else — the same as a `passwordFile`. No route answers it back, and an
access token cannot reach the account routes at all. `auth.db` is not in the mirror, so a pool
rebuilt from the mirror leaves every stored account to be set again.

In `config.toml`, once:

```toml
[[accounts]]
kind = "webdav"
name = "nextcloud"
baseUrl = "https://cloud.example.com/remote.php/dav/files/alice"
username = "alice"
passwordFile = "/run/secrets/notemap_webdav_nextcloud"
```

`kind` is the destination kind that speaks to it. The daemon reads this block without knowing what
a webdav is; the adapter picks out its own.

`baseUrl` is the DAV collection the account is rooted at. For Nextcloud that is
`https://<host>/remote.php/dav/files/<user>` — the whole of that user's files, with the vault a
folder below it.

Plain HTTP is fine where the password cannot cross a network somebody else is on: loopback, a
private or link-local address, or a **single-label name**, which is what a container on the same
network is called. Nextcloud in the same compose stack is `http://nextcloud/remote.php/dav/files/…`
and needs no certificate. Anywhere else, plain HTTP still works and the daemon says so once on
startup, naming the account — a stored one included, though one stored while the daemon runs is
not named until the next start:

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

Then create a destination in settings with `account = "nextcloud"` — the account's **name**, not its
URL — and `root = "Notes/Vault"`, the vault inside that account, or blank for the account's own
folder. Several vaults on one account are several destinations naming one account.

The root is never created for you, for the same reason the `filesystem` kind's is not: one that is
not there is a vault somebody has not made yet. Folders *below* it are created as notes are filed
into them. A create never overwrites — a name already taken is refused — and an append never loses
a write that landed between the read and the write, which is a thing that can happen here and
cannot on a local disk. An account that is unreachable, a password that will not read, or a
profile that is not declared all leave the delivery pending and retried, on the same terms as an
unmounted drive.

### arena

An [are.na](https://www.are.na) account. A capture leaves as a **block**, connected to the channel
you named.

The account is a name and a token, and nothing else — are.na has no username, and its address is a
constant of the service. Set it on the Accounts page in settings, or in `config.toml`:

```toml
[[accounts]]
kind = "arena"
name = "mine"
secretFile = "/run/secrets/notemap_arena_token"
```

**Mint the token with `write` scope.** are.na hands out `read` by default, and nothing notemap can
ask tells the two apart: `GET /v3/me` does not carry a token's scope. So a read-only token passes
the check on the settings page — the destination reports *reached* — and then fails every delivery
with a `403` whose detail says this is the likely reason. If you see that pair, this is it.

A destination of this kind **is the account**: create one with `account = "mine"` and nothing else.
The channel is chosen per capture, browsed from the composer, and remembered like any other place.

Browsing answers **slugs**, which read the way a channel's title does. The field also takes a
**numeric ID**, and that is worth pasting into a routing template: renaming a channel changes its
slug, and a template fires on a tag for months. A `404` at delivery says a rename is the likely
cause and points you back at the browse.

What a capture becomes:

- prose beginning with a URL on a line of its own → a **link** block, with the rest as its caption;
- anything else → a **text** block;
- a capture with a picture → an **image** block, its caption used as both the description and the
  alt text. The bytes go up through a presigned URL and never through notemap's own address.

A block carries neither your tags nor artifacts. What fits goes into the block's own metadata — the
item id, the source, the capture time, and the tags as one string — which is a record for a person
and not something are.na lets anything search.

**This kind may duplicate on a retry, and the others do not.** are.na offers no conditional create
and no idempotency key, so a create whose answer never arrived is indistinguishable from one that
never left; notemap retries, and the block may already be there. A duplicate sits visibly in the
channel and you can delete it — the alternative is throwing away a decision that probably landed.
Both file kinds do promise a retry cannot duplicate, and say by what mechanism.

## relay-arena

A **relay**, not a destination: a program outside notemap, reaching `/v1` with an access token like
anything else that is not a browser
([ADR 39](adr/0039-a-relay-is-outside-notemap-and-reaches-v1-like-anything-else.md)). It watches one
or more are.na channels and captures what is connected into them; nothing about it is in the
daemon, and nothing here is in `config.toml`. `apps/relay-arena/README.md` has the rest — building
it, running it in Docker, what it does with a block.

It carries **two** tokens, neither minted for you:

- **The pool token**, `notemap token mint --name relay-arena`, reaching the whole pool the same as
  any other access token.
- **The are.na token**, from are.na's own developer settings. Unlike the `arena` **destination**,
  which needs `write` scope to post a block and cannot get the check to confirm it (see above), this
  relay only ever reads. The default scope — `read` — is enough; there is nothing to mint specially
  and nothing that would tell you either way if you did.

Both are read from a file or an environment variable, never written inline, and read again at every
poll — rotating either one is writing the file it lives in, not a restart.

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
