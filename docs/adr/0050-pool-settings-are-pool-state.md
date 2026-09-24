# 50. A pool setting is pool state, its list closed and handed to core

**Date**: 2026-09-24
**Status**: Accepted — extends [ADR 20](0020-destinations-are-pool-state.md) and
[ADR 43](0043-config-holds-what-an-install-is.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

Notemap needed its first value true of the pool itself rather than of any item, destination or
template: whether the daemon may reach out to a third party to unfurl a link. Nothing built so far
had anywhere for that to live.

Two lines were already drawn. ADR 20 put destinations in the pool because they are what a person
changes while *using* notemap, never by whoever set the container up. ADR 43 restated it from the
other end: `config.toml` holds what is settled when notemap is installed — paths, addresses,
cadences, accounts — and anything a person changes while using notemap is pool state. A privacy
switch is changed by the person using notemap, while they are using it, so it falls on the pool's
side of both lines.

The device-local half was worth arguing on its own terms, because the shell already keeps reading
preferences — the palette, the order control — in `localStorage`, and nothing about that is wrong.
Those carry no privacy cost: a reader who likes dark on their phone and light at a desk is not in
conflict with themselves. A switch deciding whether *this pool's daemon* reaches a third party
wants one answer, not one per device — a person who turned it off on a laptop has not turned it off
at all if the phone still asks. That is what makes it pool state rather than a preference.

## Decision drivers

- **One source of truth.** A privacy switch answered differently by two devices is not a switch a
  person can trust.
- **The concept should carry a second setting for the cost of an entry in a list**, not a redesign,
  since the first is deliberately narrow — a boolean opt-out — and will not be the last.
- **The seam ADR 43 chose for payload types applies unchanged.** A pool that reaches for its own
  configuration is a pool with ambient state, and a test wanting a pool holding a setting nobody
  ships would have nowhere to say so.
- **The mirror, the action log and the wire already have a shape for "one non-item unit"** —
  destinations, then templates — and a third one should cost a case, not a concept.

## Considered options

1. **A `config.toml` key**, on the model of the payload types block ADR 43 emptied out.
2. **A `localStorage` flag**, on the reading-preferences model the palette already uses.
3. **A pool setting**: a row in the pool, read and written over `/v1`, mirrored, logged — and its
   declared list handed to core by a host, on ADR 43's own pattern, rather than core reading its own.

## Decision outcome

**Option 3.** A pool setting is a name, a type and a default, declared by a constant —
`POOL_SETTINGS` — that core exports and a host hands back on `PoolConfig.poolSettings`, exactly as
`PAYLOAD_TYPES` already is. Core validates a change against the list it was given rather than one it
found. One entry exists today: `unfurl`, a boolean defaulting to on.

Four shapes follow from treating this as pool state on destinations' and templates' terms rather
than inventing a fourth one:

- **Unset reads as the setting's default.** The store holds only what someone changed; a read
  answers the *effective* value for every known setting, because a caller wants the answer, not the
  distinction between unset and set to the default. Adding a setting later is an entry and a
  migration, never a backfill.
- **Writing always writes a row**, a value equal to the default included. Reverting a setting is an
  ordinary change with an ordinary action and an ordinary mirror write, not a delete path — the
  mirror never grows a removal job or a repair path for this kind.
- **One mirror record per pool setting**, subject `{ kind: "pool-setting", setting }`, parallel to a
  destination's and a template's record. Rebuild is not built yet; when it is, a record naming a
  setting the running code does not know is to be warned about and skipped, the mechanism ADR 43
  already chose for a leftover `config.toml` key.
- **The client fails closed.** A client that has not yet read a setting from the pool treats it as
  off rather than guessing from the constant's own default, because the point of pool state is that
  the answer comes from the pool. This bites only on a genuinely cold client — a first run, or one
  whose cache was dropped because the identity changed — never on one that read the value once and
  is offline now: that client goes on honouring what it last read, the same as the destinations
  cache.

Option 1 was rejected for the reason ADR 43 emptied the equivalent block out: a value a person
changes while using notemap is not something `config.toml` should hold, and a daemon that rewrites
its own config file undoes the reasoning of ADR 20.

Option 2 was rejected because the switch is not a reading preference: it decides whether the
daemon — not the device — reaches a third party, and a person who turned it off on one device has
not turned it off at all if another still asks.

### Consequences

- **Good** — a second pool setting is an entry in `POOL_SETTINGS` and a migration, not a new concept:
  the store table, the mirror record kind, the action kind and the `/v1/settings` routes are already
  general over the name.
- **Good** — the seam stays where ADR 43 put it. A test can hand a pool a `poolSettings` list nobody
  ships and assert what it does with a name that list does not carry.
- **Good** — the log gets a plain answer to "when was this switch flipped, and by whom": a change is
  an action carrying the setting's name and its value before and after.
- **Neutral** — a change is not an outbox operation, on the destinations cache's own terms: only the
  pool can say whether a name and a value are its own, and an offline client validating against a
  cached list would hand back an acceptance the pool may refuse.
- **Bad** — a fourth thing (destinations, templates, now pool settings) that `docs/todo.md`'s open
  verify/repair gap has to eventually reach. Named there rather than silently added to the debt.

---

## Pros and cons of the options

### A `config.toml` key

- **Good** — no new mechanism; the payload types block already had the shape before ADR 43 removed
  it.
- **Bad** — a value a person changes while using notemap, changed by editing a file and restarting
  the daemon, which is exactly the friction ADR 20 moved destinations away from.
- **Bad** — two devices cannot both flip it without one clobbering the file the other just wrote.

### A `localStorage` flag

- **Good** — cheapest possible mechanism, and the shell already has it for the palette.
- **Bad** — answers per device, which is the one thing this switch must not do: a person who turned
  it off on a laptop would not have turned it off on the phone.

### A pool setting, core exporting the list

- **Good** — one source of truth, mirrored, logged, and reached the same way any other pool state is.
- **Good** — the declared-list seam is proven already, by `PAYLOAD_TYPES`.
- **Bad** — the most machinery of the three for a single boolean. Accepted: the machinery is what
  makes the second setting free.

---

## More information

Spec: [core.md](../specs/core.md#pool-settings); the mirror: [mirror.md](../specs/mirror.md); the
wire: [http-v1.md](../specs/http-v1.md); the client's cache: [client.md](../specs/client.md).

Plan: [a-pool-holds-settings](../plans/a-pool-holds-settings.md). Prerequisite for
[clickable-links-and-link-previews](../plans/clickable-links-and-link-previews.md), whose opt-out
phase depends on this landing.

Revisit if a pool setting ever needs to be richer than a boolean, or per-device — neither is built,
and the shape here does not assume either.
