# Review: Routing templates (PR #46)

**Date**: 2026-09-07
**Status**: Resolved <!-- Open | Partially addressed | Resolved -->
**Scope**: `agent/routing-templates` against `main` — 122 files, core `pool/templates/`, the tag
and capture paths, the store, `/v1/templates`, the composer and settings
**Plan**: `docs/plans/routing-templates.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/mirror.md`,
`docs/specs/client.md`, `docs/specs/shell.md`

---

## Overall

The slice lands what the plan set out and the four ADRs hold up in the code: the expansion is
statically total, the tag and the reservation commit together on both the interactive and the
capture path, and the window is a row rather than a timer. Tests, typecheck and lint are green.

Two findings are worth acting on before this merges. **The capture path now reaches the network
with no abort signal** (#2): a source-supplied trigger tag makes `POST /v1/captures` describe a
destination, and against an unresponsive WebDAV host — no timeout anywhere in that adapter — the
fastest path in the app hangs with nothing able to cancel it. And **repointing a template keeps its
establishment** (#3), which is the exact repair phase 8 offers a stranded template and which leaves
it demanding a folder that never existed where it now points.

---

## Bugs

### 1. `http-v1.md` has no `Shipped:` entry for this plan

`docs/specs/http-v1.md:4` — the body gained the templates routes, the second `route` body and
`trigger-refused`, but the header still reads `**Last updated**: 2026-09-04` and the newest
`Shipped:` entry is 2026-09-04. The plan is **Status: Done** and names this spec. Every other spec
it names got its dated entry; this one records the work only in `Settled (2026-09-07)` lines
scattered through the body.

The specs are the only tracker, so the gap is lost history rather than a formality.

Fix: a `Shipped:` entry dated 2026-09-07 at the top of `http-v1.md`, and the `Last updated` bumped.

### 2. A source-supplied trigger tag makes capture do uncancellable network I/O

`packages/core/src/pool/capture.ts:36,82` → `pool/templates/fire.ts:38` → `routing/prepare.ts`
(`checkFor` → `ports.destinations.describe`).

```
POST /v1/captures  with tags: ["route/research"]
  → fired() → firingFor(config, ports, item, template)   ← no signal argument
  → checkFor → describe(destination)                     ← HTTP PROPFIND, no timeout
  → the request hangs for as long as the vault does; aborting the client does nothing
```

`Pool.capture` (`types/api/pool.ts:369`) takes no `AbortSignal` at all, so the daemon's
`context.req.raw.signal` cannot be threaded through even if `firingFor` were passed one — and
`packages/adapters/destination-webdav` sets no timeout on any request. Before this change capture
was store work only; it is now the one write path that can block on a third party with no way out.

*Corrected while fixing this:* the interactive `tag` path is no better. `ItemsApi.tag` takes no
signal either, so core's own parameter was always `undefined` there too — the gap is both paths,
not capture alone.

Fix: give `Pool.capture` a signal, thread it to `firingFor`, and have the daemon pass the request's.
A destination that cannot be reached in time is not a refusal here — `firingFor` already treats
`unreachable` as *fires anyway* — so a bounded wait costs the feature nothing.

### 3. Repointing a stranded template keeps its `establishedAt`

`packages/core/src/pool/templates/lifecycle.ts:141` — establishment is cleared only when
`changes.arguments` differ:

```ts
const moved =
  changes.arguments !== undefined &&
  !sameJson(changes.arguments, held.arguments);
```

Phase 8's repair for a stranded template is "an ordinary edit of its destination field". After one,
an `establish` template still carries `establishedAt`, so `withFolder` (`templates/apply.ts:107`)
resolves it to `require` and the first delivery to the new destination is `rejected` for a folder
that was never there. The comment two lines up — *"A changed place is a different place"* — argues
for exactly the case it does not cover: a different destination is more of a different place than a
different path is.

Fix: clear `establishedAt` when `destination` or `capability` changes as well as `arguments`.

### 4. A fired template's corner notice never goes away when the delivery fails

`apps/ui/src/lib/action-log.ts:99,124,130,146` — `template-fired` raises a standing notice under
`only: FIRED` carrying `cancel`. Only `routed` clears it (`only: FIRED` again). `delivery-failed`
and `work-abandoned` carry no `only`, so the failure of a fired delivery leaves:

```
routing · research   [cancel]     ← standing, from template-fired
given up · back in the queue      ← standing, from work-abandoned
```

Both on screen at once, the first claiming the route is still in flight, and its `cancel` now
refusing with `no-such-record` (the record was removed by `concluded`, `pool/work.ts:228`) — which
the shell reports as "could not cancel". `delivery-cancelled` is likewise absent from `SAID`, so
cancelling a fired route from anywhere but the notice leaves it standing too.

Fix: carry `only: FIRED` on `delivery-failed` and `work-abandoned` where the entry names a template
fired by its tag, and say `delivery-cancelled` in the corner for the same case.

### 5. `folder-missing` names the wrong folder when a path repeats a segment

`packages/core/src/pool/templates/report.ts:153` — `walked(segments, segment)` stops at the first
element *equal to* the missing one rather than at its index:

```
place    research/notes/research/{{captured_at}}.md
missing  the second "research"
says     research/            ← which is there
```

Fix: walk by index — `segments.slice(0, at + 1)` off the loop's own position.

---

## Design

### 6. The composer draws `folder` as an ordinary schema field

`apps/ui/src/components/routing/ProcessingComposer.svelte:168` — `beside` is every field but the
line's, so the `folder` mode notemap itself puts into the arguments schema is now drawn beside
`heading` as a generic control on a hand-made route. `apps/ui/src/lib/arguments.ts:14` exists to
say these are *"drawn as their own control … never part of the place a person reads off a row"*,
and `TemplateForm.svelte:71` filters them out — the composer does not.

The consequence is small (a `create · require` select appears on an append) but the two forms now
disagree about whose field it is, and a person can set `require` on a one-off route where the
concept means nothing.

Fix: filter `OWN_ARGUMENTS` out of `beside`, or draw the mode deliberately with its own control as
the template form does.

### 7. Nothing keeps two decisions off one item

`packages/core/src/pool/tags.ts:56` and `routing/route.ts:44` — the reservation is worked out
before the transaction and inserted inside it without re-reading the item's records. Two trigger
tags arriving together, or a tag arriving while the composer commits, insert two pending routing
records for one item and deliver it twice.

This is not new — `route` has always been shaped this way — but a trigger tag makes it reachable
without a person, which is what changes the odds. Worth naming even if the answer is "later": the
plan's own Notes ask what a template does to the shape of the queue, and this is part of that
answer.

---

## Minor

### 8. `report.ts`'s comment describes cases that reach it as other values

`packages/core/src/pool/templates/report.ts:138` — *"A kind that cannot be asked, one that could
not say, or a destination that has gone since"* sits over `if (answer === undefined)`, but
`candidates()` (`destinations/candidates.ts:35`) returns `undefined` for a missing destination
alone; the other two arrive as `not-offered` and `unreachable` and are handled below. The comment
claims a guarantee the code does not make.

### 9. `fired` counts templates taken by hand as having fired

`packages/adapters/store-sqlite/src/pool-store.ts:137` — `fired_records` and `fired_last_at` count
every record whose `template_id` matches, including composer-made ones where `fired_by_tag = 0`.
The settings row reads *"when it last fired"* and `CONTEXT.md` reserves *fires* for what a trigger
tag does. Either the counts filter on `fired_by_tag`, or the field is named for what it counts —
decisions made from this template.

### 10. The untouched-template check compares serialised JSON

`apps/ui/src/components/routing/ProcessingComposer.svelte:313` —
`JSON.stringify(wanted) === JSON.stringify(resolved.arguments)` makes key order part of the
equality. It holds today because `valuesFrom` walks the schema's own property order and the pool
appends `folder` last, but a reordered schema silently turns an untouched template into a hand-made
decision: the record then names no template and an `establish` template never learns its folder is
there. A key-wise comparison (`sameJson`'s equivalent on this side) says what is meant.

### 11. A stranded doc comment in the WebDAV adapter

`packages/adapters/destination-webdav/src/notes.ts:282` — `requireFolder` was inserted between
`makeCollections` and its doc comment, so two comment blocks now stack and the first
(*"Nextcloud will not make a parent for a `PUT`…"*) describes a function two definitions away.

### 12. The plan says `POST /v1/items/{id}/route/resolve`; the route is a `GET`

`docs/plans/routing-templates.md` phase 6 against `apps/daemon/src/routes/definitions.ts` and
`http-v1.md:253`. The spec and the code agree, so only the plan is stale — worth a line since the
plan is what a reader reconstructs the slice from.

---

## Non-issues

- **`checkPatterns` runs at save and never at route** — deliberate, and the property that makes it
  safe (every field present on every item) holds: `Expansion` is total over `PATTERN_FIELDS`.
- **`create` written as absence rather than as `folder: "create"`** (`templates/apply.ts:113`) — a
  capability declaring no folder mode would refuse an argument set carrying one, so the absence is
  load-bearing.
- **`create` does not check the capability exists at the destination** — the report is the live
  answer to that question, and a template is meant to tolerate a destination that has changed.
- **No foreign key from `routing_templates.destination_id`** — the migration argues it, and phase 2
  wants the stranded template to keep naming what it named.
- **The jobs table rebuilt again for `subject_kind = 'template'`** — CHECK constraints cannot be
  relaxed in place, and every index of the previous rebuild is recreated verbatim.
- **The item is read twice on the tag path** (`pool/tags.ts:135`) — commented, and the second read
  is the one that decides.
- **`projectTemplateRecord` spreads what it was handed** — the two derived fields are destructured
  out explicitly, and it matches `projectDestinationRecord` beside it.
- **Neither `route` handler passes the request signal to core** — pre-existing on that route, and
  unchanged by this branch.

---

## Resolution

Reconciled with the developer's own review on 2026-09-07; their seven findings are numbered 13–19
below, and every one of mine was taken. The collision policy (19) is the one thing deferred, by
their decision, and is recorded in `todo.md`.

1. **Fixed.** `http-v1.md` has its dated `Shipped:` entry and `Last updated` is 2026-09-07.
2. **Fixed.** `Pool.capture` and `ItemsApi.tag` take an `AbortSignal`, the daemon passes the
   request's on both, and it reaches `firingFor`. Untagging is store work and is given none.
3. **Fixed.** `establishedAt` is cleared when the destination or the capability changes as well as
   the arguments (`templates/lifecycle.ts`), which is what a repointed stranded template does.
   `core.md`'s establishment rule says so.
4. **Fixed.** `delivery-failed`, `work-abandoned` and the new `delivery-cancelled` notice carry
   `only: FIRED` where the record was tag-fired, so everything that ends a firing takes the
   notice's place. Core names the template on those entries, which is what lets the shell tell.
5. **Fixed.** The walk names the level it got to rather than the first segment spelt the same.
6. **Fixed.** The composer filters `OWN_ARGUMENTS` out of the fields it draws — not out of what it
   sends, so a taken template's `require` survives an edit of the line.
7. **Fixed**, narrowly and deliberately. A blanket one-decision-per-item guard would forbid
   legitimate routing to two destinations; what is enforced instead is that **one template files an
   item once** — checked inside the transaction, so two tags racing insert one record. It also
   closes the untag-then-retag hole (16).
8. **Fixed.** The comment says what `undefined` from `candidates()` actually means.
9. **Fixed.** `fired` counts only records a trigger tag made. A template applied by hand was applied,
   not fired, and `CONTEXT.md` reserves the word.
10. **Fixed.** `sameArguments` compares key-wise; the serialised comparison is gone.
11. **Fixed.** `makeCollections`' doc comment is back above `makeCollections`.
12. **Fixed.** The plan says `GET`, which is what the route and the spec say.
13. **Fixed.** Opening a template to edit draws the form in place of the settled fields.
14. **Fixed.** `Option` used `why` — *the reason an option cannot be taken* — for a description, so
    all three folder modes were `disabled` and the mode stayed whatever it started as. `Option`
    gained `note`, which draws alike and disables nothing.
15. **Fixed.** The chooser offers the trigger tags templates declare beside the tags in use: what is
    *in use* is what the pool has seen on an item, so a new template's tag was missing on exactly
    the day nobody knew it.
16. **Fixed.** Core refuses `untag` for a trigger tag whose record still stands —
    `409 trigger-tag-held` — and the refusal says that cancelling is the way back. Cancelling or
    abandoning removes the record, and the tag is live again.
17. **Fixed.** Standing and alarming are separated: a fired template's notice stands so its cancel
    does not time out, and is drawn as news rather than in the accent.
18. **Fixed.** The shell that tagged raises the notice as soon as it can name the record, rather
    than waiting for a log polled every 10s against a 15s window. The log's own entry arrives under
    the same key and adds nothing.
19. **Deferred**, by the developer's decision: a collision policy adds a word to an adapter's
    argument vocabulary and is worth its own slice and probably an ADR. Recorded in `todo.md`.

**Found while fixing, and fixed with them.** The wire `RoutingRecord` carried no `applied` at all,
though `http-v1.md` said plainly that a record names the template it came from — the field was
travelling undeclared, so nothing on the client could read it. It is in the schema and the spec's
example now.
