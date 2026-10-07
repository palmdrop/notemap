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

Its own image, because it is its own program: `ghcr.io/palmdrop/notemap-relay-arena`,
published with every release under the daemon's version. For a change no
release has yet, build it where it will run under the `dev` tag, alongside a
`dev` build of the daemon, and run compose with `NOTEMAP_VERSION=dev`:

```sh
docker build -f Dockerfile.relay-arena -t ghcr.io/palmdrop/notemap-relay-arena:dev .
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
| a Text block's title, prose and source URL | composed into `note` prose — the prose verbatim, unless `hashtags` is set, which takes a trailing line of `#tags` off it |
| a Link block's title, caption and source URL | composed into `note` prose         |
| an Image or Attachment block's title, caption and source URL | composed into `note` prose — the title only where it is not just the uploaded file's name |
| an Embed block                | mapped like a Link — are.na never hosts the actual media, only a cached thumbnail, so no attachment is carried |
| an Image block's stored image, an Attachment block's file | one asset, under a derived id |
| the watched channel's configured `tags`, and a trailing `#tag` line where `hashtags` is set | tags, attributed to the source, **at capture** |
| a Channel-class block         | its title, description and `https://www.are.na/channel/<slug>`, composed into `note` prose, under `channel/<id>` — a channel's id may also be a block's |
| the block's own page, `https://www.are.na/block/<id>` | the last paragraph of every block's prose but a channel's, whose link already is its page |

The parts are joined as paragraphs in that order, each only where the block
has it. A source URL the block's own words already hold whole is not repeated;
one that only starts a longer URL in them is. The
source URL of a Text or an Image is the page it was saved from, where it was
saved with are.na's browser extension.

A block with neither prose nor a file is not captured: core would take it, and
a relay guards its own input. Its own page does not count as prose.

An Image or Attachment titled with nothing but a filename — `IMG_2231.jpg`,
which is what are.na titles an upload until someone retitles it — carries no
title into the prose; the title names the asset instead, since the file's own
`filename` on are.na is a storage hash.

A block removed from the channel upstream is left alone. Notemap never loses
an item, and there is nothing to do.

**A trailing line of `#tags` can be classification rather than prose.** are.na
has no tags on a block, so without `[arena] hashtags = true` the only tags a
block arrives with are the ones its channel is configured with. With it, the
last line of a block's own words — a Text block's prose, any other block's
caption — is read as tags where it holds nothing but hashtags, after the
channel's own, and comes off the words captured before the source URL is put
after them. A title is never read for tags. The line comes off so a vault that
writes tags as a `#tag` foot writes them once rather than twice. Words that are
nothing but a foot come off too wherever a title, a link or a file is left to
capture, and stay as the text where nothing would be. A `#tag` mid-sentence is
a word somebody wrote and stays one. The block's version digests the prose the
payload carries, foot already off, so a foot edited upstream alone is
`already-captured`; turning the flag on, though, changes that payload, so the
next poll amends or revises every item made from a block carrying one, once.

**Tags travel once.** A capture whose payload is unchanged is `already-captured`
whatever its tags say — the pool drops tags from that comparison so that an
item classified in notemap since does not read as a conflicting resubmission
of itself. are.na has no tags on a block at all; what a block carries is
whatever the watched channel is configured with, set once at capture and never
reconciled.

**A change to how the relay reads a block is an edit, once.** The pool compares
payloads and cannot tell a block edited upstream from a block read differently.
Titles and source URLs joined the prose on 2026-10-06, and with `hashtags` set
a foot is now read off a caption too; the block's own page joined it on
2026-10-07. The first full poll after upgrading past either amends every
unprocessed item whose prose changed, and revises every processed one. A channel's prose holds its slug, so renaming the channel on
are.na is an edit as well.

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

One levelled line per event on stdout, the same shape the daemon writes —
`HH:MM:SS.mmm LEVEL message key=value` — or one JSON object per line where
`[log] format = "json"` asks for it. `level` chooses how much: `debug` is a line
per block relayed, `info` is what each poll came to, `warn` is a block that could
not be relayed or a channel that could not be read, `error` is a poll that could
not be finished and the failure that ends the run. A block with nothing in it is
counted `empty` and says nothing at any level.
`NOTEMAP_RELAY_ARENA_LOG_LEVEL` in the environment turns the level up without
editing the file.

Failures go there and nowhere else: notemap has nowhere to put another program's
errors, and a relay that could not reach the pool has nothing to report to it by
definition.

A block that could not be relayed is a `warn` and that channel's scan carries
on. A channel are.na refused — most often one the token lost access to — ends
that channel's scan and lets the next one run; a failure that was the pool's, or
are.na's rate limit, ends the whole poll.

Whether it is running at all is read from the other end —
`GET /v1/sources`, drawn in notemap's settings, says when each source last
captured.
