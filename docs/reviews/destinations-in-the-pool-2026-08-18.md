# Review: Destinations in the pool (PR #17)

**Date**: 2026-08-18
**Status**: Resolved
**Scope**: `agent/destinations-in-the-pool` vs `main` — core, store-sqlite, destination-fs, mirror-fs, daemon, client, ui
**Plan**: `docs/plans/destinations-in-the-pool.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/mirror.md`, `docs/specs/client.md`

---

## Overall

The plan landed: a destination is a row, the port is per kind with the destination as a parameter,
the foreign key carries the in-use refusal, the mirror grows its non-item unit, and every phase's
tests exist and are good — the store's `PRAGMA`-level deletion refusal, the "listing makes no
adapter call" route test, and the property test the destination record joins rather than
duplicates. `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` are green. All four
specs carry a dated `Shipped:` entry.

Two real defects, both at seams the move created. A destination's `root` used to be expanded and
resolved by `config/load.ts`; nothing does it now, so the `~/notes` that the OpenAPI example, the
spec and the tests all use is accepted, described as healthy, and then fails every delivery. And
the new bodyless-route exemption in the content-type middleware matches on path alone, which
silently removes the `415` guard from `POST /v1/destinations` and `PATCH /v1/destinations/{id}`,
both of which the document still declares it for. Beyond that the findings are documentation the
change was supposed to keep in step with: the `/v1` refusal table, `todo.md`, the daemon README
and the mirror's layout section.

---

## Bugs

### 1. A `~` in a destination's root is never expanded

`packages/adapters/destination-fs/src/destination.ts:97`, `apps/daemon/src/ports.ts` —
`config/load.ts` used to hand the adapter `resolve(expandHome(destination.root))`. Settings now
come from a row, and nothing expands or resolves them: `reachRoot` calls `realpath(root)` on
whatever string was typed.

```
create { root: "~/notes" }  → 201, settings pass the schema
GET .../description         → "described" (describe never touches the filesystem)
route                       → realpath("~/notes") → ENOENT → unreachable → reserved
                            → retried, bounded, abandoned
```

Confirmed against the daemon fixture: a destination created with `root: "~/notemap-scratch-review"`
answers `200 described` with both capabilities. The value is not exotic —
`apps/daemon/src/schemas/destination.ts:68` publishes `{ root: "~/notes" }` as *the* example, the
http-v1 sample body uses it, and `settings.test.ts` and the UI test both use it. A relative root is
the same problem one step quieter: it now resolves against whatever directory the daemon was
started in, rather than at load.

Fix: expand `~` and resolve to an absolute path where the string becomes a path — in the
filesystem kind, since that is what owns the meaning of `root` — and say so in the kind's schema
description. Doing it in core would put a filesystem idea in the domain.

### 2. `POST /v1/destinations` and `PATCH /v1/destinations/{id}` no longer require `application/json`

`apps/daemon/src/middleware/content-type.ts:31-58` — `NO_BODIES` is built from every declared route
whose `request.body` is undefined, and `takesNoBody` matches by **path**, with no notion of method.
`GET /v1/destinations` and `DELETE /v1/destinations/{id}` are bodyless, so their paths exempt the
`POST` and `PATCH` that share them.

Measured on the fixture app:

```
POST  /v1/destinations      content-type: text/plain → 201   (document says 415)
PATCH /v1/destinations/{id} content-type: text/plain → 200   (document says 415)
POST  /v1/captures          content-type: text/plain → 415   (unaffected)
```

`http-v1.md:155` states the rule without exception, and
`routes/definitions.ts:442,477` declare the `415` these two routes no longer give. The retire
routes — the case the exemption was written for — are unaffected either way, since no bodied route
shares their paths.

Fix: key the exemption on method and path together. The definitions carry `method`, so
`NO_BODIES` can hold `` `${method} ${path}` `` and `takesNoBody` can compare the request's method
too; the test at `content-type.test.ts:45` then still passes for the right reason.

---

## Design

### 3. The `/v1` refusal table does not know the new codes, and now contradicts one

`docs/specs/http-v1.md:740-770` — seven codes ship in this change and none is in the table:
`destination-in-use` (409), `already-retired` (409), `not-retired` (409), `destination-retired`
(409), `destination-unusable` (409), `unknown-destination-kind` (422),
`invalid-destination-settings` (422). Worse, `unknown-destination` is in the table as `422`, which
is still what `POST /v1/items/{id}/route` answers, while every destination route answers `404`
(`errors/refusals.ts:92,101,109`). The paragraph under the table says anything outside it is a bug
and gets a `500`, so the table is load-bearing rather than decorative.

Fix: add the seven rows, and give `unknown-destination` two — or say in the table that the code's
status depends on whether the id is the subject of the request or a fact inside it.

### 4. `docs/todo.md` still says this is unbuilt

`docs/todo.md:11-16` — "**decided, unbuilt** … Specs are updated; core, the store, the daemon, the
client and the UI are not, and `[[destinations]]` is still in `load.ts` and the example config."
Every clause of that is now false. The entry should go, or become a line about what is left
(verify and repair reaching destination records).

### 5. `apps/daemon/README.md` still documents `[[destinations]]`

`apps/daemon/README.md:71-90` — "destinations, which the daemon wires from configuration", followed
by a `[[destinations]]` block with `id`, `kind`, `root` and `accepts`, and "`GET /v1/destinations`
reports what each one declared". The block is exactly what `config.example.toml` now says is
ignored with a warning, and the capabilities moved to `/v1/destinations/{id}/description`. The
paragraphs below it — the root is never created, appending is not editor-safe — are still right and
worth keeping.

### 6. `mirror.md`'s layout section does not mention `destinations/`

`docs/specs/mirror.md:292-312` — the on-disk layout of the filesystem driver is explicitly in
scope, and the Behavior section says destinations are carried, but the layout block still shows
only `pool-mirror/YYYY/MM/DD/`. `mirror-fs/src/paths.ts:56` writes
`pool-mirror/destinations/<id>.json`, with no rendering beside it and no date path, for reasons
worth one sentence there: the id is minted and immutable, so the path needs no immutable
composition.

### 7. A `PATCH` is two operations, and the shell always sends both

`apps/daemon/src/routes/destinations.ts:94-108`, `apps/ui/src/components/destinations/DestinationForm.svelte:54` —
the handler runs `reconfigure` then `rename`, each its own transaction, entry and mirror write; the
comment argues the order makes a declined request leave nothing half-applied, which is true, but a
*successful* one is still two writes with a moment between them. The form then sends `{name,
settings}` on every save regardless of what changed, so renaming a destination appends
`destination-reconfigured` as well, and saving with nothing edited appends both — with
`destination-renamed`'s `from` equal to its `name`.

Fix: either send only what changed from the form, or give the pool one `edit` that takes both and
appends one entry. The second is the smaller API and matches how the wire already talks about it.

### 8. `route` can now fail on the foreign key after the bytes have landed

`packages/core/src/pool/routing/route.ts:44,113,118` — the destination is read outside the
transaction, the adapter is called, and only then does the transaction insert the record. A
`DELETE /v1/destinations/{id}` that commits in that window (legal: nothing had named it yet) makes
`insertRoutingRecord` violate the new `ON DELETE RESTRICT` reference, which throws rather than
refusing — and the action-log entry written in the same transaction rolls back with it. A delivery
happened and the pool holds no trace of it, answered as a `500`.

The window is small and the failure needs a person deleting a destination while routing to it, but
the foreign key is new and this is the one path where core writes a reference it did not take
under the lock. Worth a decision rather than a discovery: either re-read the destination inside the
transaction and refuse `unknown-destination`, or catch the constraint and turn it into the same
refusal.

---

## Minor

### 9. A comment claims a guarantee the code drops one line later

`apps/ui/src/lib/schema-form.ts:60-64` — "Keyed by what is there rather than by the fields, so a
value under a key the schema has since dropped is still shown rather than silently lost." It is
shown, and then `valuesFrom` iterates `fields` only, so the save drops it. Either keep the unknown
keys through `valuesFrom` or drop the claim.

### 10. Orphaned doc comment in the client's types

`packages/client/src/types.ts:38-47` — routing's "a decision to deliver cannot be replayed…"
paragraph now sits above `DestinationsApi`'s own comment, so it documents nothing and `RoutingApi`
has no doc at all. It belongs back above `RoutingApi`.

### 11. Unreachable branch in the update handler

`apps/daemon/src/routes/destinations.ts:111-116` — `updateDestinationRequestSchema` refines that at
least one of `name` and `settings` is present, so `edited === undefined` cannot happen and the
hand-built `malformed-envelope` is dead. Its comment says as much.

### 12. The settings screen never retries `kinds()`

`apps/ui/src/components/destinations/Destinations.svelte:29-38,160` — kinds are fetched once in
`onMount`, and "Add a destination" is disabled while `kinds.length === 0`. Open the screen while
the daemon is down and the button stays disabled after it comes back, with nothing to press to
recover. Re-fetching when `pool.yes` becomes true would do it.

### 13. The routing picker caches the list for the session

`apps/ui/src/components/queue/RouteAction.svelte:reveal()` — `if (!open || $destinations.length >
0) return`, so the list is read once and never again for that page. `http-v1.md` gained the
sentence "a client re-reads rather than caching for the session" in this same change, and
`definitions.ts:371` repeats it in the route description. Nothing breaks — the pool refuses a
retired or unusable destination — but the shell is the one client and it does the thing the
document tells clients not to do.

### 14. Mirror records written before this change no longer parse

`packages/core/src/mirror/codec.ts:48` — `kind` is now required, and an item record written by an
earlier build has none. Nothing reads the mirror back except `mirror-fs`'s removal walk, which
swallows the parse failure and skips the file, so an old item's pair would be left behind by a
`mirror-remove`. Greenfield, no users, no migration owed — recorded so it is not a surprise if
someone points an old `pool-mirror/` at a new daemon.

---

## Non-issues

- **`reconfigure` refuses a destination whose kind has no adapter** — deliberate and stated both in
  the code and in `core.md`: settings that cannot be checked cannot be edited, and the row is left
  exactly as it is.
- **A destination action carries no `subject`** — `subject` is an `ItemId` and a destination is not
  an item; naming it in `detail` is ADR 18's shape, and `AbandonedWork.item` going optional follows
  from the same fact.
- **No foreign key from `jobs` to `destinations`** — a `mirror-remove` outlives the row it names,
  exactly as a purged item's does. Stated in the migration.
- **A pending mirror write and a mirror-remove can be queued for one destination at once** — the
  write re-reads the pool and finds nothing, so neither order leaves a stale file. This is the
  first code path that actually enqueues a `mirror-remove`, since `items.purge` is still
  unimplemented.
- **Deletion is offered whatever the pool will say** — only the pool knows whether a record ever
  named it, and showing the refusal is the design the plan asked for.
- **`modified_at` is one counter across items and destinations** — a logical clock for the pool,
  not per table; gaps in an item's sequence cost nothing.
- **Verify and repair do not reach destination records** — deferred with verify and repair
  themselves, which do not exist; the plan says so in the task it struck through.

---

## Resolution

Reconciled with the developer's own review on 2026-08-19; every row was given a disposition before
anything was touched. Their findings were about comments and the config loader, and are recorded
below the numbered ones.

1. **Fixed.** `rootPath` in `destination-fs/src/paths.ts` expands `~` and resolves what is left, and
   `realRootOf` goes through it. Two tests: a delivery to `~/notes` under a temporary `HOME`, and a
   relative root resolving against the working directory.
2. **Fixed.** The content-type middleware matches method *and* path, so a bodyless `GET` or
   `DELETE` no longer excuses the bodied route beside it. A test sends `text/plain` to
   `POST /v1/destinations` and `PATCH /v1/destinations/{id}` and expects `415`.
3. **Fixed.** The refusal table carries the seven new codes, and `unknown-destination` appears
   twice — `404` where the id is what the request is about, `422` where it is a fact inside one —
   with a paragraph saying which is which.
4. **Fixed.** The `todo.md` entry is now the part that is genuinely left: verify and repair
   reaching destination records.
5. **Fixed.** `apps/daemon/README.md` says destinations are pool state, keeps the `[delivery]`
   block that is still configuration, and names the description route. It also now says `~` is
   expanded, which is finding 1's other half.
6. **Fixed.** `mirror.md`'s layout block carries `pool-mirror/destinations/`, with a paragraph on
   why the path is the bare id and why there is no rendering.
7. **Fixed**, as `edit`. `rename` and `reconfigure` are one `destinations.edit(id, {name?,
   settings?})`: one transaction, one mirror write, and an entry per half that actually differs, so
   a save that changed nothing appends nothing. `PATCH` is one pool call. Confirmed with the
   developer before it landed; `core.md`, `http-v1.md` and the plan say so.
8. **Fixed.** `route` re-reads the destination inside the transaction that writes the record, as it
   already re-read the item, and refuses `unknown-destination` where it has gone. The entry saying
   bytes left the machine is written first either way.
9. **Fixed.** The claim is gone rather than the behaviour changed: a key the schema has dropped
   cannot be sent back, because the daemon would refuse the whole object for it.
10. **Fixed.** Routing's paragraph is back above `RoutingApi`.
11. **Fixed.** The branch went with the handler, which is now a single call.
12. **Fixed.** An effect re-reads the kinds when the pool becomes reachable, so a settings screen
    opened while the daemon was down can add a destination once it is back. Tested.
13. **Fixed.** Opening the picker re-reads the list rather than trusting what it holds, which is
    what `http-v1.md` says a client should do. Tested.
14. **Won't fix.** No migration is owed on a greenfield mirror; recorded above so it is not a
    surprise.

From the developer's review:

- **`for (;;)` and "is there a library for this?"** — both answered by deleting the loop.
  `fileSchema` strips rather than refuses, which is what the plan asked for, so one parse succeeds
  and `droppedKeys` names what did not survive by walking raw against parsed. `withoutKeys` and the
  re-parse loop are gone.
- **The `[[destinations]]` note in `config.example.toml`** — removed. It only made sense as a
  description of the state before this change.
- **The comment on `destinationPathFor`** — removed; what is worth keeping about that path is in
  `mirror.md`.
- **Comment sweep** — done across the branch: rationale that belongs to the ADR or the specs is
  gone, restatements are gone, and what is left is contracts a caller relies on and the two or
  three unexpected decisions the code cannot say itself.
