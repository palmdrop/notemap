# @notemap/relay-arena

A block connected into a watched [are.na](https://are.na) channel appears in
the notemap queue — with its image, at the time it was connected, under a
source named per channel — and a block edited afterwards amends or revises
the item it became.

It is a **relay**: a program outside notemap, reaching `/v1` with an access
token like anything else that is not a browser
([ADR 39](../../docs/adr/0039-a-relay-is-outside-notemap-and-reaches-v1-like-anything-else.md)).
Nothing about it is in the daemon.

```sh
pnpm --filter @notemap/relay-arena build
node apps/relay-arena/dist/main.js --config ~/.config/notemap/relay-arena.toml
```

`--once` polls once and exits non-zero if anything went wrong, which is the
shape cron wants. It stops early like any other poll; `--once --full` reads
every page, and a cron setup wants that once a day. `--help` says the rest.

## Never watch a channel notemap delivers into

A destination of kind `arena` posts blocks under the same are.na user this
relay reads as. If a watched channel is also one notemap delivers to, its own
blocks are read back as fresh captures — a new `sourceItemId` and a payload
the pool has never seen, so dedup does not catch it — and there is no way to
tell them apart by author. Nothing here enforces this; it is on you to keep
the two apart.

## In Docker

Its own image, because it is its own program. Nothing is published yet, so
build it where it will run:

```sh
docker build -f Dockerfile.relay-arena -t notemap-relay-arena:local .
```

The image is the bundle and nothing else: no port, no volume, no healthcheck,
and `/etc/notemap/relay-arena.toml` is where it looks for its config.
`docker/compose/` carries a `relay-arena.toml` with the container's paths
already in it, and both compose files carry the service commented out beside
the daemon's.

The one step that is not a mount is the tokens. Neither is minted for you:

```sh
docker compose exec notemap notemap token mint --name relay-arena \
  > notemap_relay_arena_pool_token
```

Put the are.na token in `notemap_relay_arena_token` beside it, uncomment the
service and the two secrets, and `docker compose up -d`. Both files are read
at every poll, so rotating either one is writing the file — not a restart.

Reach the daemon at `http://notemap:4747`, the service on the compose network.
The port `compose.yaml` publishes is on the host's loopback, which is not the
relay container's.

## What it does with a block

| are.na                       | notemap                                          |
| ----------------------------- | ------------------------------------------------ |
| the block's numeric id        | `sourceItemId`                                   |
| `connected_at`                | `capturedAt` — the moment it joined *this* channel, never the block's own `created_at` |
| a digest of the block's prose and file | the identity an edit is captured under — never `updated_at`, which are.na moves whenever the block is connected into any channel |
| a Text block's own prose      | `note` prose, verbatim                           |
| a Link block's title, caption and source URL | composed into `note` prose         |
| an Embed block                | mapped like a Link — are.na never hosts the actual media, only a cached thumbnail, so no attachment is carried |
| an Image block's stored image, an Attachment block's file | one asset, under a derived id |
| the watched channel's configured `tags` | tags, attributed to the source, **at capture** |
| a Channel-class block         | not captured — a channel connected into a channel is not a note |

A block with neither prose nor a file is not captured: core would take it, and
a relay guards its own input.

An Image or Attachment titled with nothing but a filename — `IMG_2231.jpg`,
which is what are.na titles an upload until someone retitles it — carries no
title into the prose; the title names the asset instead, since the file's own
`filename` on are.na is a storage hash.

A block removed from the channel upstream is left alone. Notemap never loses
an item, and there is nothing to do.

**Tags travel once.** A capture whose payload is unchanged is `already-captured`
whatever its tags say — the pool drops tags from that comparison so that an
item classified in notemap since does not read as a conflicting resubmission
of itself. are.na has no tags on a block at all; what a block carries is
whatever the watched channel is configured with, set once at capture and never
reconciled.

**An edit to a *processed* block lands at the time of the poll.** A revision is
an ordinary capture carrying a link, and mints its own capture time of now
([core.md](../../docs/specs/core.md#editing)) — there is nowhere to put the
block's own edit time. Only the first capture of a block sits where it was
connected. Each further edit makes another revision, independent of the last,
so a block edited three times after it was delivered leaves three items in the
queue.

## What it holds

Nothing. Every poll reads each watched channel newest connection first and
posts each block; the pool answers `already-captured` for the ones it has, and
the first page of 100 holding such a block is where the poll stops — anything
below it was connected earlier and read by an earlier poll. There is no
watermark, no cursor and no database, so there is nothing to lose, corrupt or
migrate.

The first poll after start, and one a day after that, reads every page. That
is where an edit to a block below the newest page is seen, and where a block
a failed poll left behind is picked up — an edit can take up to a day to
arrive.

An asset id is derived from the block's own id rather than minted, so a block's
file is uploaded once and the block does not look edited on every run.
`packages/relay` does that half.

## are.na's rate limit

Requests to are.na are spaced by its own `x-ratelimit-remaining` and
`x-ratelimit-reset` headers: none while the window has requests to spare,
and a wait for the reset once five are left, which leaves some for an arena
destination sharing the token. An answer without those headers earns a fixed
half-second gap. A `429` ends the whole poll — the limit is the token's, so
every channel after it would be refused the same way — and the log says when
the window resets. Files come from are.na's object storage, which the limit
does not count.

## What it says

Failures go to its own log and nowhere else: notemap has nowhere to put
another program's errors, and a relay that could not reach the pool has
nothing to report to it by definition. A block that could not be relayed is
logged and that channel's scan carries on. A channel are.na refused — most
often one the token lost access to — ends that channel's scan and lets the
next one run; a failure that was the pool's, or are.na's rate limit, ends the
whole poll.

Whether it is running at all is read from the other end —
`GET /v1/sources`, drawn in notemap's settings, says when each source last
captured.
