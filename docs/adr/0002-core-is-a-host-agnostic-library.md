# 2. Core is a host-agnostic library, not a service

**Date**: 2026-08-01
**Status**: Accepted

---

## Context and problem statement

notemap should be deployable as a docker service, as a web app, and possibly as an Obsidian
plugin. Is the core of notemap a long-running hub service, or a library that different hosts
embed?

---

## Decision drivers

- Flexibility of deployment is a stated goal; a service-shaped core forecloses it.
- The intake paths that *require* something always-on — phone sync, folder watch, provider
  webhooks — are a property of a deployment, not of the domain.
- A seam cut on day one is nearly free; retrofitting one after handlers have grown business
  logic is not.
- Core must be testable without a socket.

---

## Decision outcome

**Core is a pure library.** A daemon is the reference host and the default deployment, but it
is one host among several, and it is not privileged in the model.

Core owns: the pool, the state machine, revisions, classification, the routing log, mirror and
asset writing, the *state* of the enrichment job queue, and the port interfaces for providers
and destinations.

Core does not own: HTTP, timers, config files, folder watching, or the decision of *when* work
runs. It exposes claimable work; the host drives the loop.

Any host may own a pool — the daemon, a CLI, or an embedded plugin. Concurrent hosts are made
safe by **leases on job rows** rather than by a rule, which is machinery retries and crash
recovery need regardless. This holds only on a local filesystem; a pool must never live on a
network share.

**Core is instantiated per pool, never global.** No module-level state, no ambient config, no
singleton connection — one instance is constructed with its storage, mirror and clock. A single
pool is the whole product today, but this is what keeps multi-pool and multi-user possible: N
pools is N instances, and resolving which pool a request belongs to is a host problem. Stated
explicitly because the thing that would actually foreclose it is a convenient singleton
appearing in month two.

Authentication is a host concern permanently. Authorization does not exist while the pool *is*
the boundary; it would only become a domain rule under multi-user, which is out of scope
(2026-08-02).

### Consequences

- **Good** — a desktop-only deployment needs no service at all; the domain is testable
  in-process; the daemon can be replaced without touching the model.
- **Bad** — the seam must be defended. Every "just read the config here" inside core erodes it,
  and nothing but discipline prevents that.
- **Neutral** — multi-device deployments still require the daemon, because the phone needs
  something reachable to sync against.

---

## More information

Storage model: [0001-pool-is-a-database.md](0001-pool-is-a-database.md).
Deployment sketch: [../exploration/vision/unified-app.md](../exploration/vision/unified-app.md#sketch).
