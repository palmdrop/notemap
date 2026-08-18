# 20. Destinations are pool state; the port is per kind

**Date**: 2026-08-17
**Status**: Accepted — replaces `PoolPorts.destinations` and the `[[destinations]]` block in
[core.md](../specs/core.md#routing) and [http-v1.md](../specs/http-v1.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A destination is a `[[destinations]]` block in `config.toml`. The daemon reads it, builds one
`DestinationAdapter` per block, and hands core an array it indexes once at `createPool`
([ADR 8](0008-adapters-are-in-process-and-wired-by-the-host.md)). Adding a vault therefore means
opening a file in an editor, and [http-v1.md](../specs/http-v1.md) states the consequence plainly:
"wiring a destination is a restart".

That is fine for a daemon and wrong for a person. But a destination is not only a setting: a
routing record names one and keeps the name forever, and every item carries the source it came
from. Deleting a block leaves records pointing at something that no longer exists anywhere, with
no record it ever did — a row that lost its table.

So: where do destinations live, and what does a person edit?

---

## Decision drivers

- **A routing record must resolve.** `destination` on a record is a reference, and the file it
  refers into is text a person can delete a paragraph from.
- **Comments do not survive a machine write.** TOML was chosen because "comments survive a
  hand-edit" ([http-v1.md](../specs/http-v1.md#constraints)); `smol-toml` parse → stringify
  returns the values and drops every comment. A daemon that writes the file flattens the file.
- **A file the daemon both reads and writes must tolerate every shape it has ever emitted**,
  forever, in both directions — a store gets a version and a migration instead.
- **Settings a person edits and settings an operator sets are different animals.** Comparable
  self-hosted apps split them the same way: Home Assistant hand-authors YAML and keeps
  UI-created entries in versioned machine-owned storage; Grafana keeps the server in
  `grafana.ini` and datasources in the database; Immich keeps server config in the database and
  makes the UI read-only when a config file is supplied instead.
- **Some settings cannot move.** The pool path cannot live in the pool, and the assets and mirror
  roots must be readable without one for a rebuild to work.

---

## Considered options

1. **The daemon rewrites `config.toml`** — one file, one truth, and the UI edits it.
2. **An overlay file** — `config.toml` stays hand-authored and untouched; UI edits land in a
   machine-owned file layered over it, key by key.
3. **Destinations become pool state** — rows the pool owns, with `config.toml` keeping host
   wiring and never being written.

---

## Decision outcome

Chosen: **option 3**, for destinations only.

- A **destination** is a row in the pool: a minted id, a person-facing name, a **kind**, that
  kind's settings as opaque JSON, and whether it is retired. `DestinationId` joins `MintableId`.
- `PoolPorts.destinations` and the `DestinationAdapter` instance are replaced by one port
  registered per kind:

  ```ts
  interface Destinations {
    kinds(): readonly DestinationKind[]; // name + settingsSchema
    describe(destination: Destination, signal?): Promise<DestinationDescriptor>;
    deliver(destination: Destination, delivery: Delivery, signal?): Promise<DeliveryOutcome>;
  }
  ```

  The destination is a **parameter**, not a constructor argument, so there is no instance to cache
  and nothing to invalidate when a row is edited: the next call carries the new row. It is the
  move already made for delivery — everything durable is handed in and the adapter reaches back
  for nothing — applied to the destination as well as the item.
- A kind publishes a **`settingsSchema`**, core validates settings against it and refuses with
  facts, and the UI builds its form from it. This is `targetSchema` one level up.
- **Removal is retire**, reversible, which stops new routing and leaves pending deliveries alone.
  Outright deletion is allowed only for a destination no record has ever named — a typo does not
  become permanent furniture, and nothing referenced ever disappears.
- **A destination the running code cannot make sense of is reported, never dropped.** An unknown
  kind, or settings that no longer validate, is `unusable` with a reason, beside `described` and
  `undescribable`. Routing to it is refused; the row is untouched.
- **The mirror carries destinations**, retired ones included, as its first pool-level record, so a
  rebuild restores them and routing records stay resolvable.
- **`config.toml` keeps host wiring** — paths, ports, mirror, sweep, delivery cadence, payload
  types, enrichments — and the daemon never writes it. `[[destinations]]` leaves the schema and
  the example. An unrecognised key becomes a warning rather than a startup failure; a recognised
  key with a value that cannot be honoured still refuses.

**Sources do not move yet.** Declaring a source attaches policy and nothing else
([core.md](../specs/core.md#intake)), that policy is `autoRequest`, and nothing reads it until
enrichment exists. They follow on the same pattern when it does — discovered rather than created,
since a source needs no declaration to capture.

### Consequences

- **Good** — adding a destination is a form. Nothing in the flow requires an editor, a file path,
  or knowing what TOML is.
- **Good** — a routing record's `destination` resolves to a row, before and after a rename, and a
  destination that has ever been used cannot be removed out from under one.
- **Good** — the file a person hand-writes is never written by a machine, so its comments survive
  exactly as [http-v1.md](../specs/http-v1.md#constraints) intended.
- **Good** — the port shrinks: no per-destination instance, no id on the adapter, no
  duplicate-id check in `indexDestinations`, since uniqueness becomes a store constraint.
- **Bad** — "wiring a destination is a restart" stops being true, so `GET /v1/destinations` no
  longer answers a list that is stable for the life of a connection. Accepted: that stability was
  a consequence of where destinations lived, never a property anything needed.
- **Bad** — the mirror grows a second kind of unit, and verify and repair grow with it. Accepted:
  the alternative is a rebuild that restores records naming destinations it cannot produce.
- **Bad** — the first kind that needs a credential will put it in pool state, which the mirror
  writes to plain files. Nothing does today, and the answer when one does is either a secret that
  stays in `config.toml` or a mirror that redacts. Named here so it is a decision rather than a
  discovery.
- **Neutral** — destination editing is online-only, like routing, and for the same reason: only
  the daemon can say whether a root exists or whether settings satisfy the kind registry it is
  actually running.

---

## Pros and cons of the options

### The daemon rewrites `config.toml`

- **Good** — one file, one truth, no precedence to explain and no core change.
- **Bad** — every comment in that file goes on the first UI edit, which is the property TOML was
  picked for.
- **Bad** — the parser has to stop being strict in both directions and stay tolerant forever, and
  a text edit can still delete a destination a record names.

### An overlay file

- **Good** — hand-edits stay sacred, and an overlay holding only what a person changed lets
  upstream default changes still reach them.
- **Bad** — two places to look for one setting, and a hand-edit that is silently overridden.
- **Bad** — solves the wrong half: it moves *where settings are written* without making a
  destination a thing records can refer to.

---

## More information

The fork this closes was carried in [todo.md](../todo.md) as "whether the UI edits the config or
destinations become pool state". Precedent for moving a boundary this way:
[ADR 16](0016-the-asset-registry-is-pool-state.md), which made assets rows for the same reason —
a reference needs something to refer to. What a delivery does with a destination is unchanged and
stays [ADR 19](0019-a-destination-converts-and-the-delivery-records-what-went.md)'s. Host wiring
of adapters is unchanged and stays [ADR 8](0008-adapters-are-in-process-and-wired-by-the-host.md)'s;
the host now wires one adapter per kind rather than one per destination.

Spec: [core.md](../specs/core.md#routing); the wire: [http-v1.md](../specs/http-v1.md);
on-disk consequences: [mirror.md](../specs/mirror.md); the client's asymmetry:
[client.md](../specs/client.md).

Revisit if destinations ever need to be shared between pools, or if a kind arrives whose settings
are large or secret enough that a row in a mirrored table is the wrong place for them.
