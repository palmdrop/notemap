# 39. A relay is outside notemap and reaches `/v1` like anything else

**Date**: 2026-09-07
**Status**: Accepted — bounds
[ADR 8](0008-adapters-are-in-process-and-wired-by-the-host.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

Notemap routes out through **destinations**, which are in-process adapters the host wires
([ADR 8](0008-adapters-are-in-process-and-wired-by-the-host.md)). Reading *into* the pool from
somebody else's system — a Memos server, an are.na channel, a watched folder on another machine —
looks like the mirror image of that, and the obvious move is to make it one: an intake adapter,
wired the same way, polled by the same runner.

It is not the mirror image, and building it as one would cost notemap the property that makes
`/v1` worth having.

---

## Decision drivers

- **What made a destination in-process is what intake has none of.** Core owns the routing
  decision, the durable record of it, the retry and the lease that stops two workers delivering
  twice. An intake poll owns none of that: the recovery strategy for a failed poll is to poll
  again, and the pool's own dedup on `(source, sourceItemId)` is what makes re-reading everything
  harmless.
- **`/v1` is the bus other apps hook into** ([standards.md](../standards.md#conformance)). An
  in-process intake adapter would reach the pool by a path no outside program has, and the first
  thing anyone would ask for is the same privilege — which is how a public API acquires a private
  door beside it.
- **Every credential for somebody else's system would become the daemon's.** `[[accounts]]` exists
  for destinations and is already the awkward part of the config; intake would double it, and each
  new upstream would be a reason to restart the daemon.
- **A second upstream should cost a program, not a release.** An are.na relay is a program someone
  writes and runs; it should not be a pull request against notemap.

---

## Considered options

1. **Outside, over `/v1`** — an ordinary program carrying an access token.
2. **An in-process intake adapter**, symmetrical with destinations, polled by a runner in the
   daemon.
3. **A privileged intake route on `/v1`**, wider than capture — batch, upsert, or "capture or
   edit" in one call.

---

## Decision outcome

**A relay is a program outside notemap.** It reads someone else's system, maps what it finds, and
captures over `/v1` carrying an access token, exactly as any other program that is not a browser
does. Nothing about it is privileged and nothing about it is in the daemon.

`packages/relay` is the half every relay shares — deriving asset ids, uploading what the pool has
not got, capturing, and turning a `409 source-item-changed` into the edit that change earned.
Reading upstream, the loop and the timer are the relay's own.

Option 3 was rejected with option 2 and for the same reason. Every route a relay needs already
exists: `PUT /v1/assets/{id}` is idempotent on the id, the bytes, the filename and the media type;
`POST /v1/captures` answers `already-captured` for what the pool has; the edit route matches its
own replay on `(source, sourceItemId)`. A batch or upsert route would be a second way to do what
those three already do, and the pool's dedup is what makes the plain ones enough.

Consequences worth stating:

- **A relay is not a `@notemap/client`.** A client holds an outbox and a cache; a relay wants
  neither. Its material is still durable upstream, so an outbox would add durability to something
  that has it, and would introduce a **refused** state needing a person for something nobody is
  watching. Plain requests against `/v1`.
- **An asset id is derived, never minted.** A fresh id each poll would change the payload and so
  manufacture a revision every run, forever. It is a UUIDv5 over the attachment's own upstream
  identifier, under a namespace fixed per relay — and not over the bytes, because two names over
  one content are two assets and upload compares the filename, so the same picture arriving under
  two names would collide as `asset-id-conflict`.
- **An edited item costs two requests a poll, forever, and never a second revision.** The capture
  is refused because the identity is held by an item saying something else; the edit goes under a
  version identity of its own, which the edit route then matches on replay.
- **A relay's failures are the relay's.** Notemap has nowhere to put another program's errors, and
  a relay that could not reach the pool has nothing to report to it by definition.
- **Authorization is not addressed.** A relay's token reaches the whole pool, which is the gap
  [security.md](../specs/security.md) already parks. This decision does not narrow it and does not
  widen it.

### What would move it in-process

An **inbox that needs pool-side configuration a person edits in the UI**. The moment "which folder
does this watch" or "which Memos server" is a row in the pool rather than a line in a program's own
config file, the thing configuring it is notemap's, and the thing reading it should be too. Nothing
here is that yet: a relay's configuration is its own TOML file, beside its own binary.

---

## Pros and cons of the options

### Outside, over `/v1`

- Good, because it uses the surface every other program uses, which keeps that surface honest.
- Good, because a new upstream is a new program and not a release of notemap.
- Good, because no credential for somebody else's system reaches the daemon.
- Bad, because a relay is a second thing to run, supervise and notice the death of — which is
  what `GET /v1/sources` exists to make visible.
- Bad, because a relay reaching the whole pool is a wider grant than it needs.

### An in-process intake adapter

- Good, because there is one process to run.
- Bad, because it would reach the pool by a path no outside program has, and the API would grow a
  privileged door beside it.
- Bad, because every upstream's credentials become the daemon's config, and every new one a
  restart.
- Bad, because it buys leases, retries and durable records for work whose recovery strategy is
  already "do it again".

### A privileged intake route

- Good, because a relay would make one request per item instead of one or two.
- Bad, because it duplicates capture, edit and upload behind one verb, and the interesting
  behaviour — replay, dedup, amend-or-revise — would have to be re-decided inside it.
- Bad, because the latency it saves is latency nobody is waiting on: a poll runs on a timer.

---

## More information

Built with [the memos relay plan](../plans/memos-relay.md), whose second decision —
[ADR 38](0038-text-and-image-collapse-into-one-payload-type.md) — is what makes one upstream thing
map to one payload type for life, without which none of this could sync at all.

Deliberately out: a push. Memos can call a webhook, and that webhook would land on the **relay**,
which then polls at once. It is latency; the reconciling scan has to exist either way.
