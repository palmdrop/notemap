# Review: arena relay

**Date**: 2026-09-23
**Status**: Resolved <!-- Open | Partially addressed | Resolved -->
**Scope**: `apps/relay-arena/`, `tests/full-stack/src/{relay-arena.test.ts,harness/arena.ts,harness/relay-arena.ts}`, `Dockerfile.relay-arena`, `docker/compose/`, `docs/running.md`, `CONTEXT.md`
**Plan**: `docs/plans/arena-relay.md`
**Spec**: `docs/specs/core.md`

---

## Overall

The mapping, config, loop and docs match the plan and read like `relay-memos`. The weak part is
rate limiting, which the plan left as Unknown 3. The longer default interval is in. The `429`
half of the fallback is missing: nothing in the code or tests tells a `429` apart from any other
refusal. The larger issue is design. Every poll pages each channel to the end at `per=100`, and
are.na's best-practice section names that exact loop as a "Don't"
(`docs/research/are-na-v3-api.md:146-148`). At the default interval and typical channel sizes the
volume is small, so this matters for API etiquette more than for today's request budget. But v3
has a sort on `contents`, and with it the relay could stop early without holding any state (#2).

---

## Bugs

### 1. A `429` ends one channel, then the next channel spends its request into the same limit

`apps/relay-arena/src/run.ts:96-99`, `apps/relay-arena/src/arena/read.ts:30-37`: a `429` is
thrown as a plain `ArenaRefused` and caught with every other read failure. `relayEverything`
then moves straight on to the next channel. are.na limits per token (per user tier), not per
channel, so each remaining channel fires its first request into a window that is already spent.

```
channel A page 3 → 429 → readFailed, log
channel B page 1 → 429 → readFailed, log
channel C page 1 → 429 → …                (one wasted request + one fault line per channel)
```

`X-RateLimit-Reset` isn't read either, so the log can't say when the limit clears. The plan's
Unknown 3 promises a fallback where a `429` ends the scan quietly. Nothing implements it, and no
test sends a `429`.

Fix: when `ArenaRefused` has status `429`, end the whole poll the way a pool failure does, log
it once with the reset time, and add a `run.test.ts` case for it.

---

## Design

### 2. A full enumeration every poll is the pattern are.na's docs ask callers not to use

`apps/relay-arena/src/arena/read.ts:50-71`. The research doc quotes are.na: "Don't … Set
`per=100` and iterate until `has_more_pages` is `false`". The Acceptable Use section also rules
out "automated crawling". A relay that re-reads whole channels every fifteen minutes around the
clock is close to that line, even though the request count stays low.

`GET /v3/channels/{id}/contents` accepts `sort` (`created_at_*`, `updated_at_*`, `position_*`;
research doc line 422). That makes an early stop possible without state. Read newest-first and
stop after the first page on which every block came back `already-captured` or `empty`. The
pool's answer serves as the watermark, so the relay still holds nothing. In steady state a poll
costs one request per channel.

Before choosing this, settle two open questions:

- **Which timestamp each sort uses.** `updated_at_desc` catches edits, but it misses an old
  block someone else made that was newly *connected* here, because that block sorts deep. Only
  `created_at_desc` catches that case, and only if "created" means the connection and not the
  block. Verify this live. Covering both cases may need a first page from each sort.
- **What gets missed.** A block that failed in an earlier poll and sits below a fully-known page
  is never retried. A full scan on startup (and in `--once`), or every Nth poll, would cover it
  and keep the plan's "a failed poll is repaired by the next one" nearly true.

This changes the plan's Goal wording ("re-reads every watched channel every poll"), the README
and `CONTEXT.md`'s Relay entry. It needs your call.

### 3. `poll.interval` has no floor

`apps/relay-arena/src/config/load.ts:71`: `z.number().int().positive()` accepts
`interval = 1000`. The fifteen-minute default is the only guard in the code, and nothing refuses
a config that polls are.na every second. I suggest refusing anything below a floor at load
(five minutes, relay-memos' default, would be consistent) and saying so in
`config.example.toml`. `--once` under cron is out of reach either way; the README's `--once`
paragraph should state the same floor.

### 4. No pacing between requests, and later channels starve under load

`read.ts:50-71` fires pages back-to-back, and `run.ts:67` walks channels in config order. On the
free tier (120/min), a poll that needs more than ~120 pages across all channels (about 12k blocks
in total) gets a `429` partway through on every poll. Because of #1, the channels at the end of
the config are then never read, on any poll. #2 removes most of this. Without #2, a small delay
between pages (the docs suggest 200–500 ms) or a check on `X-RateLimit-Remaining`-style headers
would keep a large first sync under the limit.

---

## Minor

### 5. The interval comment misstates what costs are.na requests

`apps/relay-arena/config.example.toml` (`[poll]` comment): "costs one request per page plus one
per changed block, per channel". The per-block request is an `open()` to object storage plus a
pool call, and neither counts against are.na's API limit. The are.na cost is one request per
page per channel. That number is the one a reader of this comment needs.

### 6. Image blocks usually carry their filename as text

`apps/relay-arena/src/arena/relayed.ts:40-44`: are.na sets an uploaded image's `title` to its
filename by default, so most Image blocks arrive with `IMG_2231.jpg` as their prose. This is a
guess from are.na's UI behaviour and should be checked against a real block. If it holds, a title
equal to `image.filename` should be dropped.

---

## Non-issues

- **`open()` sends no bearer** — the file lives in are.na's object storage, off the API, so
  downloads don't count against the per-minute limit.
- **The bearer goes on public channels too** — this puts requests on the user's tier (120+/min)
  instead of the guest limit (30/min).
- **Default `position` sort shifting mid-scan** — an insert reads one block twice, and dedup
  absorbs it. A removal skips one block, and the next poll catches it.
- **No `ETag`/`If-None-Match`** — a `304` still counts against the limit, so it saves bandwidth
  but not budget. Not worth the state.
- **Fifteen-minute default** — at one request per 100 blocks per channel, a typical config makes
  a handful of requests per poll, far under any tier.
- **`Shipped:` entry while the plan is In progress** — the plan's Notes allow it for partial
  implementation.

---

## Resolution

Settled with the developer after the review: edits stay supported, and the stop rule and the pacing
use are.na's headers where it sends them. Live checks are in `docs/research/are-na-v3-api.md`
("Observed live").

1. **Fixed.** A `429` is `ArenaRateLimited`, carrying the reset from `x-ratelimit-reset` or
   `Retry-After`, and ends the whole poll like a pool failure. Tested.
2. **Fixed.** Contents are read `sort=created_at_desc`, which is verified live as newest
   *connection* first. A poll stops after the first page holding a block the pool already had. The
   first poll, and one a day after that, reads every page, and that is where an edit further down
   a channel or a block a failed poll left behind is picked up. `--once` is shallow unless given
   `--full`. The live checks found that connecting a block moves its `updated_at`, so `version`
   is now a content digest. Otherwise a processed block connected into a second channel would
   have earned a duplicate revision.
3. **Fixed.** `poll.interval` below five minutes is refused at load.
4. **Fixed.** `arena/pace.ts` spaces requests using `x-ratelimit-remaining`/`x-ratelimit-reset`,
   with a reserve of five and waits capped at one window, plus a 500 ms gap when those headers
   are absent.
5. **Fixed.** The `[poll]` comment now states the real cost: one request per page, and downloads
   from object storage are not counted.
6. **Fixed.** Confirmed live: an untitled upload is titled with its original filename. An Image or
   Attachment title that is only a filename is dropped from the prose and becomes the asset's
   filename, since are.na's own `image.filename` is a storage hash.
