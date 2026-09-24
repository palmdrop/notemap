# Review: A pool holds settings

**Date**: 2026-09-24
**Status**: Resolved <!-- Open | Partially addressed | Resolved -->
**Scope**: `agent/a-pool-holds-settings` against its merge base `bdc6fec` (7 commits, 9fcf232..ef9b72c)
**Plan**: `docs/plans/a-pool-holds-settings.md`
**Spec**: `docs/specs/core.md`, `docs/specs/mirror.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`

---

## Overall

Core, store, mirror write path, wire and store adapters match the plan and are well tested.
Typecheck and lint are green. `pnpm -r --silent test` exited 1 on its first run and 0 on the three
runs after it (see 10). The main problem is on the client: once a client has read a pool setting it
never reads it again. Two devices therefore do not agree, and that agreement is the argument ADR 49
rests on. The plan and the mirror spec also record a rebuild path as shipped, and rebuild does not
exist. The branch has fallen behind `main`, and `main` already uses ADR number 0049.

---

## Bugs

### 1. A client never re-reads a pool setting it already holds, so devices do not agree

`apps/ui/src/components/settings/PoolSettings.svelte:501`: the only `load()` call is guarded by
`$settings === undefined`. `apps/ui/src/routes/+layout.svelte:43` loads destinations, templates and
tags on mount but does not load settings. The cache is persisted, so after the first read the
guard never fires again, including after a reload.

```
device B reads unfurl=on → persisted
device A sets unfurl=off
device B reloads → hydrates unfurl=on → guard skips load → B keeps unfurling, and its Settings page shows "yes"
```

This defeats the ADR's own argument: "a person who turned it off on their laptop has not turned it
off at all if the phone still asks". The plan's phase 6 manual check ("flip it in one browser,
reload another, see them agree") cannot pass as written, but the task is ticked. The cold side
fails the same way: a client that never opens Settings → Pool settings stays cold, so unfurl reads
as off on every device where nobody opened that page. Every reader in
clickable-links-and-link-previews will hit this.

Fix: load settings in the layout's `onMount` beside destinations and templates, and have the
section read on mount unconditionally, as `Destinations.svelte`'s `read()` already does.

### 2. The docs record a rebuild path as shipped, and rebuild does not exist

`docs/specs/mirror.md:7-13`: the Shipped entry says an unknown record "is warned about and skipped
on a rebuild". Plan phase 3 ticks "Rebuild reads the pool-setting records back…" and "a rebuild
integration test that flips a pool setting, rebuilds, and reads it back". The same spec says rebuild
is unbuilt (`mirror.md:98`, `Pool` at `types/api/pool.ts:411`). `tests/integration/src/mirror.test.ts`
tests the write side only. The specs are the only tracker, so this is false history, not a
formality.

Fix: drop the rebuild clause from the Shipped entry. Keep the behaviour in the Rebuild section as
design, where it already sits. In the plan, untick the two tasks with a note that rebuild does not
exist, or move them to `docs/todo.md` beside the verify/repair entry.

---

## Design

### 3. The branch is behind `main`, and the ADR number is taken

`main` has `d611a22` (accounts in `auth.db`), which adds `docs/adr/0049-an-account-may-be-held-by-the-daemon.md`.
This branch's `0049-pool-settings-are-pool-state.md`, and every "ADR 49" link to it in CONTEXT.md,
the five specs, `todo.md` and the plan, will point at the wrong decision after a merge. `main` also
renames `Account.svelte` → `Access.svelte`, adds an Accounts section, and edits `href.ts`,
`+page.svelte`, `shell.md` (the section and route list this branch extends), `http-v1.md` and
`CONTEXT.md`, so conflicts are certain. `main` touched only the auth migrations, so the pool's
sqlite migration list does not collide.

Fix: rebase, renumber the ADR to 0050 and update its links, then re-run the checks and `pnpm test:stack`.

### 4. A multi-name `PATCH` applies part of the body and then refuses

`apps/daemon/src/routes/settings.ts:389`: each name is committed in its own transaction, in body
order. `{ "unfurl": false, "ghost": true }` commits `unfurl` and answers `404`. The error body does
not say what was applied, so the caller sees a refusal after a change has already landed. The route
description documents this, but no client sends more than one name, so the multi-name form buys
nothing and adds a partial-failure state.

Fix: either accept exactly one name per `PATCH`, or validate every name and type before applying
any of them (core could expose `changeMany` in one transaction). The first option is smaller and
matches "one setting is changed at a time".

---

## Minor

### 5. Choosing the option that is already chosen still writes an action and a mirror job

`packages/core/src/pool/settings.ts:84`, `PoolSettings.svelte:540`: `Option` fires `onchoose` on
the chosen option, and core writes even when the stored value already equals the new one. The log
gets `unfurl → true` entries where `from === to`. "A value equal to the default still writes" is
about pinning an unset value, not about re-writing an identical row. Guard in the UI, or return
early in core when a stored row already holds the value.

### 6. The fail-closed read is left for every reader to spell

`client.settings.held` is a list. Every consumer has to write
`held?.find((s) => s.name === "unfurl")?.value === true`, and a slip (`!== false`) silently fails
open. A `value(name): boolean | undefined` accessor would put the rule in one place. This is worth
settling before clickable-links adds the first reader.

### 7. Sign-out also drops the cache, and the spec does not say so

`packages/client/src/state/state.ts:121`: `forgotten` drops `poolSettings` along with destinations
and templates. That is consistent and fails closed, but `client.md:588` names only an identity
change.

### 8. Comments narrate design

These go against AGENTS.md's rule on comments:
- `migrations.ts` explains why there is no foreign key or per-name CHECK.
- `POOL_SETTINGS`'s doc says "a second is an entry here and a migration, not a redesign".
- `pool/index.ts` restates the host-hands-back pattern.
- The "third non-item unit" phrasing appears in `arbitraries.ts`, `mirror.ts` and the test.
- The upsert doc is duplicated in `ports.ts` and `pool-store.ts`.
- The `ClientState`/`PoolSettingsApi` docs repeat each other.

The comment in `schemas/settings.ts` explaining `z.unknown()` earns its place. Keep it.

### 9. `as never` in `migrations.test.ts`

`migrations.test.ts:311,331` cast `"unfurl" as never`, where `pool-settings.test.ts` uses
`as PoolSettingName`.

### 10. One non-zero test exit, not reproduced

The first `pnpm -r --silent test` exited 1. The next three runs, one verbose and two silent, were
green. The failure's output was never seen, so the cause is unknown, and it may not come from this
branch.

---

## Non-issues

- **The whole stack assumes boolean values**: the mirror record, sqlite `CHECK (value IN (0,1))`,
  the wire schema and the descriptor default. The plan scopes out richer types. Note that the
  goal's "adding the second is an entry in a constant and a migration" holds only for another
  boolean.
- **`mirror-remove` is a no-op for `pool-setting`** in `mirror-fs`: nothing enqueues one, by design.
- **Request values are `z.unknown()`**, so a wrong type reaches core and answers `422
  pool-setting-invalid` rather than a `400`.
- **`Action.subject` stays `undefined`**, and the setting is named in `detail`, as the plan
  decides.
- **`list` ignores a stored row whose name is not in the config**, which is the seam the plan wants
  and is tested.
- **The IndexedDB version goes to 3**, and the upgrade only creates missing stores.
- **All five specs carry a Shipped entry**, so the trail is complete apart from the false clause in
  2.

---

## Resolution

1. **Fixed.** The layout reads pool settings whenever the pool is in reach and the door is open.
   The section reads them again each time it opens or the pool comes back. UI tests cover a warm
   cache being replaced by the pool's current answer, a read on start, and a read after sign-in.
2. **Fixed.** Rebuild is postponed. The Shipped entry in mirror.md, core.md and the ADR no longer say
   rebuild reads pool settings, and the Rebuild section now words it as future behaviour. The two
   plan tasks are unticked and marked postponed, and `docs/todo.md` gains "Rebuild restores pool
   settings".
3. **Fixed.** Merged `origin/main` (conflicts in `definitions.ts`, `http-v1.md` and `shell.md`,
   keeping both sides). The ADR is renumbered to `0050-pool-settings-are-pool-state.md`, and every
   link to it is updated. This review keeps "ADR 49" as written at the time.
4. **Fixed.** `PATCH /v1/settings` takes exactly one name. A body with none or several is
   `400 malformed-envelope`, and nothing is written. The spec, OpenAPI and client types are
   regenerated, and a route test covers two names.
5. **Fixed.** Core writes nothing when the stored row already holds the value, and core.md says so.
   The section also sends nothing when the chosen option is chosen again.
6. **Fixed.** `client.settings.value(name)` answers `boolean | undefined`, and client.md says a
   fail-closed reader asks `=== true`.
7. **Fixed.** client.md now says the cache is also dropped on sign-out.
8. **Fixed.** The listed comments are removed or cut to the one fact a reader would ask about.
9. **Fixed.** Both casts are now `as PoolSettingName`.
10. **Not reproduced.** Five further `pnpm -r --silent test` runs after the fixes were all green,
    so there is still no cause to act on.
