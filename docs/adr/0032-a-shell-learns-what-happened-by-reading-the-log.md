# 32. A shell learns what happened by reading the log

**Date**: 2026-09-03
**Status**: Accepted — extends the action log sections of
[client.md](../specs/client.md) and [shell.md](../specs/shell.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

Routing is a decision that reaches the pool and a delivery that may happen much later
([ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md)). The gap between the two is
where every interesting outcome lives, and until now none of it reached the person who made the
decision: the row left the queue, and whether it landed, failed four times, or was given up on
entirely was written to `/v1/actions` and nowhere a person was looking. The developer's own words,
top of `todo.md`: *"Immediately hiding a routed item from the queue is confusing, especially if it
fails. There's no good way to see pending operations."*

Worse than absent: **giving up removes the reservation** (`work.ts`), so the item comes back to the
queue on its own. A person watching sees a row vanish and, some minutes later, reappear, with
nothing anywhere connecting the two.

So the shell needs to learn about work it did not start and is not waiting on. The question is how.

---

## Decision drivers

- **The facts are already durable.** `routed` is written when a delivery actually lands — inline and
  deferred alike — carrying the record, the destination, the capability and the pointer.
  `delivery-failed` is written per attempt and `work-abandoned` at the end of the road. Nothing
  about what a person needs to be told is missing from the log.
- **A pool is one machine somebody owns**, usually on the same network, serving one person and a
  handful of their own clients. Traffic that would be reckless against a fleet is not reckless here.
- **Nothing may become a second source of truth.** The log outlives the material it describes and is
  append-only; anything that reports the same facts by another route is a second copy to keep in
  step.
- **A shell that is not being read should cost nothing.** The client already knows whether it is
  **watched** and whether the pool is answering, and already stops work on both.

---

## Considered options

1. **A push channel** — server-sent events or a websocket from the daemon, carrying actions as they
   are written.
2. **A new `delivered` action kind**, or a `deliveries` read shaped for this, so a shell has
   something purpose-built to poll.
3. **Poll the routing records** of items with pending deliveries, per item.
4. **Read the action log the shell already reads**, on its own tempo, from a mark taken at start.

---

## Decision outcome

Chosen: **option 4**. `ActionsApi` gains `watch()`, answering what the pool has done since this
client started looking.

### Option 1 delivers a second time what is already delivered once

A socket is the obvious shape and the wrong one here. It is a second delivery of facts that are
already durable, and its failure mode is the bad one: a connection dropped mid-failure loses the
one event that mattered, and recovering from that means reading the log anyway — so the log read
has to exist regardless, and the socket is what sits on top of it. It also puts a stateful,
long-lived connection into a daemon whose whole surface is otherwise a request and an answer, for
a latency improvement measured against ten seconds.

It is not ruled out forever. Where it earns its keep is a pool with many clients or a person
watching a slow delivery in real time, and if that day comes the mark-and-catch-up this builds is
what a socket would fall back to.

### Option 2 invents a fact the pool already records

There was a real question here, since the log's own rule is that **successful work is not logged**
— its product is the log entry. Checking rather than assuming turned up that a delivery is already
an exception to that rule: `routed` is written on landing, not on deciding, precisely because a
delivery's product is in somebody else's vault where the pool cannot point at it. So there is
nothing to add. A purpose-built read would be a second query over the same rows, narrower and one
more thing to keep honest.

### Option 3 asks the wrong question, per item

A routing record's state answers "did this land", but only for an item somebody names — and the
item that needs reporting is exactly the one that has left the queue and is on no surface. It also
cannot see `work-abandoned` at all: giving up **removes** the record, so the read that would report
it finds nothing where something used to be.

### Option 4 reads what is already there

One `GET /v1/actions?order=newest-first`, a mark, and the entries above it. The kinds a shell says
out loud are a subset of what comes back — `routed`, `delivery-failed`, `work-failed`,
`work-abandoned` — decided in the shell, so which facts are worth interrupting somebody with is a
presentation question and never a wire change.

**Its own timer, not the reachability probe's.** This is the part that is not obvious from the
code: `pool/reachability.ts` pushes the probe out on every answered request, so a client whose
requests are being answered never sends one. Riding it would mean the watcher goes quiet exactly
when a person is working, which is when there is somebody to tell.

**The first read is the mark and says nothing.** Everything before a client started looking is
history, and a shell that opens by announcing yesterday is worse than one that says nothing at all.

**Gated on watched and on reachable**, both of which the client already holds, and lazy: a client
nobody asks to watch asks the pool nothing on its own.

**Bounded.** One page, and a flag saying there was more — a client that was away for a day gets what
one read holds and a way through to the log, rather than a hundred things to dismiss.

### Consequences

- **Good** — no core change, no wire change, no new action kind. Every fact reported was already
  being written.
- **Good** — the log stays the single record of what the pool has done, and a notice is a reading of
  it rather than a parallel account.
- **Good** — an item that comes back to the queue because its delivery was given up on now says so,
  which is the condition nothing could previously explain.
- **Bad** — up to one request every ten seconds per watched client, for a screen where usually
  nothing has happened. Cheap for a self-hosted pool; it would not be for a hosted one.
- **Bad** — up to ten seconds between the pool writing a failure and a person being told. Fine for
  a delivery that has already been retried on a backoff, and the wrong shape for anything that ever
  needs to be immediate.
- **Neutral** — the log is pool-wide, so another of this person's clients doing something reports
  here too. For one person with one pool that is arguably the point; narrowing it to what this
  client touched is a filter the cache could answer if it ever grates.
