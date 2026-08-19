# @notemap/seed

Fills a pool with the states worth looking at, over `/v1` and nothing else.

It exists twice over: the full-stack suite seeds a daemon it started, and `pnpm seed` fills a
development pool so the shell has something to draw. Both get the same pool, because both call the
same function against the same surface a client would.

```sh
pnpm seed                          # http://127.0.0.1:4747
pnpm seed --url http://host:4748
```

## What it leaves behind

Seven captures, deterministic: fixed ids, fixed times, fixed words. Two sit in the queue, one is
marked processed, one is archived, one is an image with an uploaded asset attached, and two are
routed — one per destination the daemon reports.

`seed()` answers with the ids it used, by the state each was left in, so a test can assert on them
without reading the pool back.

Capture is idempotent on `sourceItemId`, and a decision the pool has already recorded answers 409,
which the seeder reads as agreement. Seeding the same pool twice therefore changes nothing. Pass
`offset` to add a second set alongside the first instead.

## What it expects to find

Routing is the one part the seeder leaves to whoever is seeding: destinations are pool state now,
so they can be made over `/v1` — but which ones a pool should hold is not the seeder's to decide.
It routes one item to each destination `GET /v1/destinations` reports, in the order the pool holds
them, asking each what it can do before it sends anything. What that leaves behind is the daemon's
business:

- a destination whose root exists takes the delivery, and the record reaches `delivered`;
- a destination whose root does not takes it too — `destination-fs` describes itself without
  touching the disk — and the record stays `pending`, retried, which is the "owed" state;
- a retired one is passed over, and so is one that answers `undescribable` or `unusable`, since
  routing to any of the three is refused.

Make one of each of the first two to get both states. The daemon's own payload types and
sources are likewise its own: the defaults here are `web-manual`, `web-image`, `text` and `image`,
matching `apps/daemon/config.example.toml`, and every one is an option.
