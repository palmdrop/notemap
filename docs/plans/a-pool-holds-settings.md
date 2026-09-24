# A pool holds settings

*The concept is a **pool setting**. The title drops the qualifier by the same rule the code does:
the subject already says "pool".*

**Date**: 2026-09-24 *(both open questions answered the same day)*
**Status**: Done <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/core.md`, `docs/specs/mirror.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`
**Closed**: 2026-09-24

---

## Goal

> A pool holds **pool settings** — named values true of the pool rather than of any item,
> destination or template: read over `/v1`, changed by a person while using notemap, written to
> the action log, mirrored, read back by a rebuild, and the same on every device at once. One
> exists when this lands — the unfurl opt-out — and adding the second is an entry in a constant
> and a migration, not a concept.

Scoped to carry one boolean, shaped so it is not a single-purpose hack. What is deliberately **not**
built: a schema-driven settings form, per-device overrides, anything typed richer than the one
value needs, and any second pool setting.

**Prerequisite for** [clickable-links-and-link-previews](clickable-links-and-link-previews.md),
whose opt-out phase depends on this plan being `Done`.

---

## Why this is not `config.toml`, and not `localStorage`

The line is already drawn twice and this falls on the pool's side of both.

[ADR 20](../adr/0020-destinations-are-pool-state.md) put destinations in the pool because they are
what a person changes while *using* notemap. [ADR 43](../adr/0043-config-holds-what-an-install-is.md)
restated it from the other end: `config.toml` holds what is settled when notemap is installed on a
machine — paths, addresses, cadences, limits, accounts — and "anything a person changes while using
notemap is pool state". A privacy switch is changed while using notemap, by the person using it,
and never by whoever set the container up.

The device-local half is the one worth arguing, because the shell already has that mechanism: the
palette and the order control live in `localStorage` and nothing minds. They are **reading
preferences and carry no privacy cost** — a reader who likes dark on their phone and light at a
desk is not in conflict with themselves. A switch that decides whether this pool's daemon reaches
out to third-party servers is a different kind of thing: it wants one answer, not an answer per
device, and a person who turned it off on their laptop has not turned it off at all if the phone
still asks. One source of truth is the whole point, and that is what makes it pool state.

---

## What is already there

- **Nothing.** `Pool` is fifteen entity-shaped APIs — items, views, tags, sources, destinations,
  templates, routing, assets, work, mirror, actions, sync, maintenance, and the two enrichment
  stubs — plus `identity()`, which is minted and never set. There is no API, no port method, no
  table, no route and no glossary word for a value that is true of the pool.
- `MirrorSubject` is `item | destination | template`, each naming an id
  (`packages/core/src/types/domain/mirror.ts`).
- `ACTION_KINDS` (`types/domain/action-log.ts`) has thirty-odd entries and none of them is about
  the pool itself. `Action.subject` is `ItemId | undefined`, and the comment already says what to
  do for something that is not an item: "a destination names itself in `detail`".
- `packages/adapters/store-sqlite/src/migrations.ts` is where a table is added, with
  `migrations.test.ts` beside it.
- **The client already holds pool state that is not items**, and the pattern is settled:
  destinations and templates are "cached for display" with `all` and `held`, persisted, offered
  from the cache while the pool is unreachable, and their edits are **not** outbox operations,
  because only the daemon can answer whether an edit is valid (client.md, *The destinations cache
  is read two ways* and the paragraph after it). A pool setting is the same kind of thing and
  should need no new mechanism on that side.

---

## Decisions taken

- **The concept is a pool setting** *(settled 2026-09-24)*. It reads under its own sub-heading on
  the Settings page, so the qualifier is in context wherever a person meets it rather than only in
  prose — which is what makes the two-word term carry its own disambiguation against a
  destination's **settings** and against the page itself.
- **The qualifier is dropped only where what it hangs off already says "pool"**, and written in
  full everywhere else. One rule, so the next name does not need a conversation:

  | | |
  |---|---|
  | `PoolSetting`, `PoolSettingName`, `PoolSettingDescriptor` | the domain types |
  | `POOL_SETTINGS` | the constant core exports, beside `PAYLOAD_TYPES` |
  | `PoolConfig.poolSettings` | the field the host hands back, on `payloadTypes`' pattern — written in full because a host file is far from anything saying "pool" |
  | `pool.settings` | the API on `Pool`, beside `pool.destinations` and `pool.templates` |
  | `GET` / `PATCH /v1/settings` | one daemon serves one pool, and no other settings are addressable under `/v1` — a destination's are reached at `/v1/destinations/{id}` |
  | `client.settings` | one client, one pool, beside `client.destinations` |
  | `"pool-setting"` | the mirror record kind — written in full because it sits in the same union as `"destination"`, which is exactly where the collision lives |
  | `pool-setting-changed` | the action kind, beside `destination-reconfigured` |
  | `pool_settings` | the sqlite table |
  | `unknown-pool-setting`, `pool-setting-invalid` | the two refusals |
  | **Pool settings** | the Settings sub-heading |

- **Core exports the list, the host hands it back** *(settled 2026-09-24)* — `POOL_SETTINGS` is a
  constant core exports, a host puts it on the `PoolConfig` it builds as `poolSettings`, and core
  validates against what it was given rather than what it found.
  [ADR 43](../adr/0043-config-holds-what-an-install-is.md) faced this fork for payload types and
  chose it **for the seam**: a pool that reaches for its own list has ambient configuration, and a
  test wanting a pool holding a setting nobody ships would have nowhere to say so. The reasoning
  transfers unchanged, and departing from a decision this recent wanted a better reason than
  "smaller".
- **A pool setting is a name, a type and a default, declared by that constant.** The known settings
  are a closed list in code — one entry today, `unfurl`, a boolean defaulting to on. A name the
  running code does not know is refused rather than stored, on `bad-kind`'s instinct.
- **Unset reads as its default.** The table holds only what someone changed, so adding a setting
  later is a constant and no backfill. A read answers the **effective** value for every known
  setting — a caller wants the answer, not the distinction between "unset" and "set to the
  default".
- **Writing always writes a row**, including a value equal to the default. Reverting a setting is
  an ordinary change with an ordinary action and an ordinary mirror write, not a delete path — the
  mirror never needs to remove a settings record, which is a job kind and a repair path this does
  not have to grow.
- **One setting is changed at a time, and a change names only what changed.** Two devices changing
  two different settings must not clobber each other, which rules out reading a document and
  writing it back whole.
- **A change is an action.** One new `ACTION_KIND`, carrying the setting's name and the value
  before and after in `detail`. **`Action.subject` is not widened**: a setting is not an item, and
  it names itself in `detail`, exactly as a destination already does. The log is how a person asks
  when a switch was flipped and by whom.
- **One mirror record per pool setting**, subject `{ kind: "pool-setting", setting: PoolSettingName }`. It
  parallels the destination and template records — every existing subject names one thing — where a single
  record for all of them would be the first subject with no id and a new shape for `MirrorSubject`
  to carry. A rebuild reads them back; a record naming a setting the running code does not know is
  **warned about and ignored**, which is the mechanism ADR 43 already chose for a leftover key.
- **The client caches it on destinations' and templates' terms**: read for display, persisted,
  offered from the cache while the pool is out of reach, dropped when the pool identity changes,
  and **not an outbox operation** — the reasoning is unchanged, a change validated against a
  cached list of known names would hand back an acceptance the pool may refuse.
- **The client fails closed.** A client that has **not yet read this value from the pool** treats
  unfurling as off: it draws no previews and makes no unfurl request. Not defaulting to on, and
  not guessing from the constant's own default — the point of making it pool state is that the
  answer comes from the pool, and a client that has never heard it does not have one. Note what
  this does *not* mean: the value is cached and persisted like every other piece of pool state, so
  an offline client that has read it once goes on honouring what it last read. Fail-closed bites
  on a genuinely cold client — a first run, or one whose cache was dropped because the identity
  changed — and there it is the right way round, because the cost of being wrong is an outbound
  request a person asked nobody to make.
- **This gets an ADR.** It extends ADR 20 and ADR 43 rather than contradicting them, and it is the
  decision the next person adding a knob will read instead of adding it to `config.toml`. It also
  holds the four calls above that will otherwise look arbitrary: unset-reads-as-default, one record
  per pool setting, fail-closed on the client, and following ADR 43's core-exports-host-hands-back
  shape for the declared list.

---

## Tasks

Nothing blocks phase 1. The name and the core/host split were the two things that did, and both
were settled 2026-09-24.

### Phase 1 — the concept, in core

Depends on nothing.

- [x] Branch `agent/a-pool-holds-settings`.
- [x] `docs/adr/00NN-pool-settings-are-pool-state.md`: why not `config.toml` (ADR 43's line, read
      from this side), why not device-local (the privacy argument above), and the four shape calls
      — unset reads as default, one mirror record per pool setting, the client fails closed, and
      core exporting the list for the host to hand back. Rejected options: a `config.toml` key, a
      `localStorage` flag, a single whole-document read-write, and core owning the list itself.
- [x] `CONTEXT.md`: **Pool setting**, under *The store* beside **Pool identity**, which is the
      other thing that is true of the pool rather than of anything in it. It must say how it
      differs from a destination's **settings** — the values a kind's schema asks for — and from a
      reading **preference**, which shell.md already spends on the palette and the order control
      and which lives on the device. _Avoid_: setting *on its own*, configuration (which is what an
      install is, ADR 43), preference, option, flag, knob.
- [x] `packages/core`: `PoolSetting`, `PoolSettingName` and `PoolSettingDescriptor`; the
      `POOL_SETTINGS` constant core exports, holding the names, types and defaults;
      `PoolConfig.poolSettings`, which a host fills from it, exactly as `payloadTypes` is filled;
      and `pool.settings` — read every known pool setting with its effective value, change one.
      The `pool-setting-changed` action, written when a change commits.
- [x] Refusals: `unknown-pool-setting`, carrying the name and what is allowed, and
      `pool-setting-invalid`, carrying the name and what was expected. Facts and no sentence,
      placed in the status table by the rule http-v1.md already states.
- [x] Core tests: reading before anything is written answers the defaults; a change is readable
      back; a change writes exactly one action naming the setting and both values; an unknown name
      and a wrong type are refused and write nothing; a value equal to the default still writes;
      **a pool handed a `poolSettings` list nobody ships behaves against that list** — the test the
      seam exists for, per ADR 43.
- [x] `docs/specs/core.md`: what a pool setting is, that the list is closed and core exports it for
      a host to hand back, that unset reads as its default, and that a change is an action.
- [x] Verify: `pnpm --filter @notemap/core test` green; `pnpm -r typecheck` and lint green.
- [x] Commit `feat(core): a pool holds pool settings`.

### Phase 2 — the store

Depends on phase 1.

- [x] The store port gains the read and the write.
- [x] `store-sqlite`: a migration and a `pool_settings` table — the name, the value, and when it
      was last changed — with the write going through the same write lock everything else does.
- [x] `migrations.test.ts`: the upgrade from the version before this one, on a database with
      existing items, destinations and templates.
- [x] Store tests: round trip; a rewrite of the same name replaces rather than accumulates; reading
      a name never written answers nothing and core turns that into the default.
- [x] Verify: `pnpm --filter @notemap/store-sqlite test` and `pnpm --filter @notemap/core test`
      green.
- [x] Commit `feat(store): hold a pool's own settings`.

### Phase 3 — the mirror, and the rebuild

Depends on phase 2.

- [x] `MirrorSubject` gains `{ kind: "pool-setting", setting: PoolSettingName }`;
      `mirror/record.ts`, `codec.ts` and `arbitraries.ts` follow, and the round-trip property test
      covers it.
- [x] A change enqueues a mirror write the way a destination's does — the same job, the same one
      write path, no second route to the mirror.
- [x] Rebuild reads the pool-setting records back. A record naming a pool setting this code does
      not know is warned about and skipped, and the rebuild goes on.
- [x] `docs/specs/mirror.md`: the fourth record kind, what its file holds, and what a rebuild does
      with an unknown one.
- [x] `CONTEXT.md`, **Mirror record**: it says "one item's complete durable state", which
      destination and template records already stretched. A dated amendment saying what the unit
      actually is now — rather than leaving an entry that reads false.
- [x] `docs/todo.md`: the open entry "Verify and repair reach destination records" gains pool
      settings, since neither exists to reach anything and this adds a third thing nothing would
      notice the loss of. Named rather than silently added to the debt.
- [x] Verify: `pnpm --filter @notemap/core test` green, property tests included; a rebuild
      integration test that flips a pool setting, rebuilds, and reads it back.
- [x] Commit `feat(mirror): a pool setting is a mirror record`.

### Phase 4 — the wire

Depends on phase 3.

- [x] `GET /v1/settings` — every known pool setting with its effective value. `PATCH /v1/settings`
      — only the names being changed, so two callers changing two pool settings do not clobber each
      other. The bare path is right: one daemon serves one pool, and a destination's settings are
      reached at `/v1/destinations/{id}`, so nothing else is addressable here. Both behind the door;
      neither in `OPEN_PATHS`.
- [x] `routes/definitions.ts`, a handler, the registration in `app.ts`, and
      `unknown-pool-setting` and `pool-setting-invalid` in the daemon's table.
- [x] Route tests: a read before anything is written answers the defaults; a change is readable
      back; an unknown name and a wrong type are refused with their facts; a `PATCH` naming one
      pool setting leaves the others alone.
- [x] `docs/specs/http-v1.md`: both routes, their shapes, the new refusal codes in the table, and a
      *Settled* line dated the day it lands.
- [x] Verify: `pnpm --filter daemon test` green; OpenAPI regenerated and `openapi.test.ts` green.
- [x] Commit `feat(daemon): read and change a pool's settings`.

### Phase 5 — the client

Depends on phase 4.

- [x] Regenerate the client's types (`pnpm --filter @notemap/client codegen`).
- [x] `client.settings`, a module beside `destinations` and `templates` and on their terms: `all`
      as the observable a screen renders from, `held` as the same cache answered now for a caller
      with nowhere to hang a subscription, persisted and hydrated, dropped when the pool identity
      changes, and the change **not** an outbox operation.
- [x] **`held` distinguishes "not yet read" from "read and off"**, which is what makes failing
      closed possible. A caller that cannot tell the two apart cannot honour the decision.
- [x] Client tests: read, cached, and offered from the cache with the pool unreachable; a cold
      client answers "not yet read" rather than a default; the cache is dropped when the identity
      changes; a change reaches the pool and is not queued when it cannot.
- [x] `docs/specs/client.md`: a paragraph beside the destinations and templates ones — same terms,
      same reasoning for staying out of the outbox — plus what a cold client answers and why the
      reader of that answer is expected to fail closed.
- [x] Verify: `pnpm --filter @notemap/client test` green; `pnpm -r typecheck` green.
- [x] Commit `feat(client): hold a pool's settings`.

### Phase 6 — where it surfaces

Depends on phase 5.

- [x] A sixth Settings section headed **Pool settings**, routed `/settings/pool` beside the five
      that exist — `destinations`, `templates`, `account`, `server`, `appearance`. It is not a
      sub-heading of *Appearance*, which is the reader's and is local, and not of *Server*, which
      is what the daemon is rather than what the pool holds. The heading is also what makes the
      two-word term carry itself: a person meets the qualifier where they meet the control.
- [x] The control is the two-option row every boolean has been since 2026-09-21 — `yes` and `no`,
      the chosen one solid — not the browser's checkbox.
- [x] Unavailable rather than guessing while the pool is out of reach, the way a destination's
      controls already are on that screen.
- [x] UI tests: the control draws what the pool said; flipping it sends only that pool setting; it
      reads unavailable with the pool unreachable; a cold client draws it as unread rather than as
      on.
- [x] `docs/specs/shell.md`: the sixth section in *Settings* and in the route list the spec already
      enumerates, what it holds, and that it is the pool's and not the device's.
- [x] Verify: `pnpm --filter ui test` green; `pnpm -r --silent test`, `pnpm -r typecheck` and lint
      green; `pnpm test:stack` green, this having crossed core, the store, the mirror, the HTTP
      surface, the client and the shell. By hand: flip it in one browser, reload another, see them
      agree; stop the daemon and see the control read as unavailable.
- [x] Commit `feat(ui): the pool's own settings section`.

---

## Open questions

None. Both are answered; kept with their answers, which is the convention the specs use.

- [x] 2026-09-24 — **What the concept is called.** Answered: **pool setting**. `settings` was spent
      twice already — a destination's **settings** are the values its kind's schema asks for, and
      **Settings** is the shell's own page — and the words nearest to hand were all carrying
      something: **preference** is spent informally in shell.md on exactly the device-local thing
      this is not (the palette, the order control); **policy** is spent in core.md for what an
      interface decides rather than core, and in CONTEXT.md's **Source** entry; **configuration**
      is ADR 43's word for `config.toml`; **option** is what every schema-driven form calls an enum
      value; **rule** is on **Routing template**'s Avoid list; **default** is a schema field's
      fallback. *Disposition* and *stance* were the two genuinely free alternatives and were not
      taken. The reason the two-word term carries itself: **it appears under its own sub-heading on
      the Settings page**, so the qualifier is in context wherever a person meets the thing, not
      only in prose about it.
- [x] 2026-09-24 — **Does core own the list, or does a host hand it back?** Answered: the host
      hands it back, on [ADR 43](../adr/0043-config-holds-what-an-install-is.md)'s pattern —
      `POOL_SETTINGS` is a constant core exports and a host puts on the `PoolConfig` it builds as
      `poolSettings`. ADR 43 rejected core reading its own **for the seam**: a pool that reaches
      for its own list has ambient configuration, and a test wanting a pool holding something
      nobody ships would have nowhere to say so. That reason applies here unchanged, and departing
      from a decision this recent wanted a better reason than "smaller".

---

## Unknowns

- **Whether the mirror's job and repair path need anything.** A pool setting's write goes through
  the same job kind a destination's does, in theory; whether `Job.subject` already carries a
  subject that is not an item without widening is worth checking before phase 3 rather than during
  it — the job subject union was widened once already for this reason.
- **What a rebuild does about ordering.** Pool-setting records are independent of items and of each
  other, so nothing should care; worth confirming the rebuild does not assume every record it
  reads names an item.
- **Whether the client's persisted state needs a version bump.** Adding a held collection to what
  hydration reads may or may not be a shape the existing hydration tolerates on an upgrade. If it
  does not, the fallback is the one the cache already has: unreadable is empty, and the next read
  fills it — which is also fail-closed, so it costs nothing beyond one round trip.
- **Whether a second pool setting is close enough to design for.** Nothing in this plan forbids one
  and nothing anticipates one. If the developer already knows the second value, it is cheaper to
  see it now than to discover the type needs to be richer than a boolean.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Two of these are worth writing deliberately because they assert an absence. **A cold client answers
"not yet read", not a default** — every fail-closed reader depends on that distinction, and nothing
notices if it quietly collapses to `false`. And **a `PATCH` naming one pool setting leaves the
others alone**, which is the whole reason a change names only what changed.

`pnpm test:stack` belongs to phase 6, which is the first point at which every layer has moved.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
