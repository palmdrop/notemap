# Review: A destination can be asked what an argument could hold

**Date**: 2026-08-31
**Status**: Resolved <!-- Open | Partially addressed | Resolved -->
**Scope**: PR #35, `agent/destination-targets` vs `main`
**Plan**: `docs/plans/destination-targets.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`, `docs/specs/security.md`

---

## Overall

The slice does what it set out to do, and the `target` → `arguments` rename is complete — column,
codec, wire, client, shell, and every doc that said the word. `candidates` lands as designed: a
field rather than a path, an opaque scope, hierarchy carried on the entry, and three failures that
reuse the vocabulary the domain already had. `pnpm -r --silent test`, `pnpm -r typecheck`,
`pnpm lint`, `pnpm format:check` and `pnpm test:stack` are all green.

The finding worth reading first is **2**: `append-to-file`'s `path` can only ever be browsed at the
vault root, because the filesystem adapter offers files for that field and folders for no field but
`create-file`'s. In a vault of any size most notes live in folders, so the browser answers "nothing
here" for the capability that most needs it — and the `CandidateEntry` shape as specified cannot
express the entry that would fix it. That is an ADR-level gap, not an adapter bug.

After that: one real race in the composer's browser (**1**), and an adapter that speaks a different
failure vocabulary from the one core and the ADR agreed on (**5**), currently masked by the route
checking first.

---

## Bugs

### 1. The candidate browser has no request sequencing

`apps/ui/src/components/routing/CandidateBrowser.svelte:46` — the `$effect` fires a fetch per scope
change and has no cleanup, no abort, and no generation counter. Two clicks in quick succession —
`open()` then `back()`, or descending twice — leave two requests in flight, and whichever resolves
last paints.

```
open("projects") → fetch(scope=projects) ─────────────┐ slow
back()           → fetch(scope=undefined) → applied() │ fast, paints root
                                            applied() ┘ paints projects, at the root scope
```

`entries`, `truncated`, `refusal` and `loading` all come from the loser. Nothing in the UI then
disagrees with itself visibly — the crumb trail says root, the list says `projects` — so a person
picks a value from the wrong folder and it routes.

Rare against a local filesystem, ordinary against the WebDAV kind
([destination-webdav](../plans/destination-webdav.md)), which is the plan's own stated worry about
enumeration latency.

Fix: capture a generation number (or an `AbortController`) in the effect and discard an answer that
is not the current one. `client.destinations.candidates` takes no `AbortSignal` today, so the
counter is the smaller change.

---

## Design

### 2. `append-to-file`'s `path` cannot be browsed past the vault root

`packages/adapters/destination-fs/src/candidates.ts:88` — `page()` filters to `isFile()` for that
field, so folders are neither listed nor given a scope, and only entries with a `scope` can be
descended into. A note at `projects/fiction/notes.md` is unreachable by browsing; the only way to
reach it is to type it.

`candidates.test.ts:124` fixes this in place — *"lists notes, and not folders"* — and the plan's
phase 5 says it in as many words: *"`create-file`'s `directory` offers folders,
`append-to-file`'s `path` offers notes"*. So this matches what was written down. What was written
down is the problem: in an Obsidian vault of any size, root-level notes are the minority, and
`append-to-file` is the capability the browser exists for.

The fix is not local to the adapter, which is why this is here rather than under Bugs.
`CandidateEntry` requires `value`:

```ts
export type CandidateEntry = {
  readonly label: string;
  readonly value: JsonValue;   // required
  readonly scope?: string;
};
```

There is no way to say *"this is a place to look further, and not something the field may hold"*.
The adapter's two available moves are both wrong: offer folders with the folder path as `value`,
and a person can pick `projects` as a note to append to — which `contain()` will happily resolve and
`appendToNote` will then write a file over a directory path and fail at delivery time, after the
record is minted; or leave it as it is, which is what shipped.

Making `value` optional is a one-field change to the type, the Zod schema, the OpenAPI document and
the browser's `open()`, and it is exactly the shape a board's columns would want too (a swimlane you
can open but not drop a card into). Worth settling before the WebDAV kind is written against the
current shape. ADR 26 should record whichever way it goes.

### 3. `Unusable` is a new adapter contract that no spec records

`packages/core/src/pool/destinations/usability.ts:18`, exported from
`packages/core/src/pool/index.ts:12` — an adapter can now throw `Unusable` from `describe()` and
core turns it into `DestinationReport.unusable`, into `CandidatesReport.unusable`, and into a
`destination-unusable` refusal from `route()`.

That is a genuine widening of the port. `core.md:644` still defines `unusable` as core's own
judgement — *"a kind no adapter is registered for, or settings that no longer satisfy that kind's
schema"* — with no mention that an adapter may declare it. `http-v1.md`'s account of
`/description` says the same. `security.md` describes the *behaviour* ("`describe()` reports it
`unusable`") without naming the mechanism, which is the closest anything comes.

The plan's phase 2 says only that the refusal "surfaces as `unusable` from `describe()` … and needs
no new port method". Strictly true — it is a new port *exception* instead, which is the same kind of
contract and needs the same writing down. AGENTS.md is unambiguous that docs and code move
together.

Fix: a sentence in `core.md`'s routing decisions saying an adapter may declare a destination
unusable, and why that is not the same as failing to describe it.

### 4. `core.md`'s `Shipped:` trail does not mention `candidates`

`docs/specs/core.md:7` — the plan is **Status: Done** and names `core.md` first among its specs, but
the only dated entry added is *"A delivery supplies arguments, not a target"*. The port method, the
optional adapter method, the request/answer shape and the three failures — the actual subject of the
plan and of ADR 26 — have no entry.

The prior-decisions bullet at `core.md:765` covers the substance well, but that section is what core
believes, not what shipped when. `http-v1.md`, `client.md`, `shell.md` and `security.md` each got a
proper entry; core, which is where the method actually lives, did not.

### 5. The filesystem adapter answers `unreachable` for two things that are not

`packages/adapters/destination-fs/src/candidates.ts:42` and `:56` — both throw a bare `Error`, and
`core`'s `candidates()` sorts every bare throw into `unreachable`
(`packages/core/src/pool/destinations/candidates.ts:53`):

- a root overlapping the daemon's own state throws `` `${realRoot} overlaps notemap's own ${overlap}` ``
  — the identical condition `describe()` throws `Unusable` for, twenty lines away in
  `destination.ts:84`;
- a capability/field pair the kind does not offer throws
  `` `${capability} has no candidates for its ${field} field` `` — which is `not-offered` in the
  ADR's own words.

So the port contradicts itself: the same destination is `unusable` when described and `unreachable`
when asked for candidates. Nothing catches it because the daemon route calls `describe()` first and
checks `x-notemap-candidates` before it ever gets here
(`apps/daemon/src/routes/destinations.ts:95`), and the adapter's own tests assert only
`rejects.toThrow()` without naming the failure. The route's tests then assert the *right* kinds, so
the suite reads as if the adapter were correct.

That masking is what makes it worth fixing rather than shrugging at: the port is the contract, the
route is one caller, and the next caller (the delivery runner, a CLI, a second host) gets the wrong
answer.

Fix: throw `Unusable` for the overlap. For the unoffered field, the honest answer is `NotOffered`,
but that lives in `@notemap/core`'s pool internals and is currently the registry's alone — either
export it as part of the adapter contract the way `Unusable` was, or accept that per-field
not-offered has no representation and say so in ADR 26 (the report's `not-offered` is per *kind*,
which is a real and defensible narrowing — it just isn't written down).

---

## Minor

### 6. `overlapsAny`'s comment describes one of its two callers

`packages/adapters/destination-fs/src/paths.ts:40` — *"this runs from `describe()`, which touches no
filesystem, so a root that is a link to reserved state is caught only once a delivery is
attempted."* It also runs from `filesystemCandidates`, which hands it an already-`realpath`'d root,
and from `deliver()`, which does the same. The caveat is true of exactly one of the three, and the
comment claims a guarantee about all of them.

### 7. The browser keys entries by label

`CandidateBrowser.svelte:118` — `{#each entries as entry (entry.label)}`. Two entries sharing a
label is a Svelte runtime error, and nothing in the protocol says labels are unique; `value` is the
identity the answer actually carries. `readdir` makes it safe for the filesystem kind and for
nothing else.

### 8. The root scope cannot be taken from the browser

`CandidateBrowser.svelte:100` — `take()` is only rendered when `history.length > 0`, and `create-file`
documents an empty `directory` as naming the root (`capabilities.ts:12`). Reaching the root is fine
by default because the input starts empty, but a person who descends into `projects`, takes it, then
goes `back` has `projects` in the input and no affordance to get back to the root except clearing
the text by hand.

### 9. The per-kind seam is untested by construction

`apps/ui/src/lib/candidate-browsers.ts:18` — `REGISTRY` is a module-level constant with no injection
point, so `browserFor` can only ever return the fallback. The test *"an unregistered kind gets the
schema-driven control"* (`RoutingComposer.test.ts:310`) asserts the same button the registered case
would, and would pass if `browserFor` were replaced by `() => CandidateBrowser`. Phase 9's stated
deliverable was the seam; what a test can currently prove is that there is a function.

Not worth building a registered component to test. Worth knowing the seam is asserted by reading
rather than by the suite.

### 10. A ticked plan task describes work that was not done

`docs/plans/destination-targets.md:83` — *"A new migration renames the column and recreates the two
triggers that guard it"*, ticked. `migrations.ts:611` recreates no triggers, and its comment
explains why: they had already been folded into a `CHECK` that `RENAME COLUMN` carries across. The
implementation is right and the tick is wrong; the plan should say what happened.

Also `docs/plans/destination-targets.md:189` — phase 4's `git commit` is unticked though `f3e3de4`
and `65f7250` exist. Phase 9's verify is unticked deliberately and says so, which is the right
treatment.

### 11. `todo.md`'s routing-arguments line is ticked over its own remainder

`docs/todo.md:21` — ticked `[x]`, while the line's own body still names *"titles, descriptions,
defaults, enums"* and the closing note says *"Defaults were not built; open a fresh line if they are
still wanted."* Either the defaults get their own open line now, or the tick is a small overclaim in
the one file that tracks what is left. The line's body also still says `targetSchema` twice, in a
change that renamed it everywhere else.

### 12. `reserved` is the pool's whole directory

`apps/daemon/src/ports.ts:73` — `dirname(options.file)`, so *any* vault under the pool's directory is
`unusable`. Correct today: the shipped config and `defaultPoolPath()` both put the database in
`state/`, a sibling of `vaults/`. But a config with `pool = "/var/lib/notemap/notemap.db"` — which
is what the path looked like before `state/` existed — silently makes every mounted vault unusable,
with a message about the pool that a person mounting a vault will not connect to their mount.
Reserving the three database files by name would be exact; reserving the directory is the WAL/SHM
shortcut the comment describes. Worth a line in `running.md` at least.

---

## Non-issues

- **The route describes before it asks.** Two calls where a caller might expect one, and for a slow
  kind that is two slow calls. But the field check has to read `argumentsSchema`, and `/description`
  is the only thing that holds it — caching it in the route would be a second staleness problem for
  a route whose whole point is that nothing here is cached.
- **The client caches nothing at all**, where phase 8 said "in memory for as long as a composer is
  open". The composer holds the answer in component state and the client is a bare passthrough,
  which is the same lifetime with one fewer thing to invalidate. `client.md` describes what was
  built, not what the plan said.
- **A symlinked root pointed at reserved state passes `describe()`.** String arithmetic there by
  design; `deliver()` resolves and rejects. Documented in `paths.ts:40` and caught where it matters.
- **`x-notemap-candidates` declared to ajv rather than relaxing strict mode.** Deliberate, commented
  at `validator.ts:44`, and the right trade: a typo'd keyword in a hand-written `config.toml` payload
  type still fails loudly.
- **`capability-undeclared` living in two status maps** (`DELIVERY_STATUS` and
  `CANDIDATES_REQUEST_STATUS`, both 422). Same fact raised by two layers; `http-v1.md:1086` lists
  both rows explicitly rather than pretending they are one.
- **The unfamiliar-root confirmation is one click, relabelled.** It reads as a weaker gate than
  "confirm" suggests, but `DestinationForm.svelte:62` and `security.md` both say plainly that it
  authenticates nobody and is a check against a typo. A second click would be ceremony over a
  boundary that does not exist.
- **Phase 6 dropped.** WebDAV has not landed; the phase is marked `[-]` with the reason on every
  task rather than left ticked or silently deleted.

---

## Resolution

Reconciled with the developer's own review of the same PR on 2026-08-31. Their two findings are
recorded below as T1 and T2; nothing was raised by both reviews.

1. **Fixed.** `CandidateBrowser` keeps a request counter and drops every answer but the newest, so
   descending and coming straight back no longer paints the left scope's entries.
2. **Fixed**, the way the type change proposed. `CandidateEntry.value` is optional, so an entry may
   be somewhere to look without being something to take, and `append-to-file`'s `path` now lists
   folders — scope, no value — alongside notes. ADR 26 gains an *Amended* section for the new entry
   shape; `core.md`, `http-v1.md` and `shell.md` say it. The wire needed no change: `z.unknown()`
   already generated `value?: unknown`, so only the TypeScript type was ever stricter than the
   schema it published.
3. **Fixed.** `core.md` records that an adapter may declare a destination unusable by throwing
   `Unusable`, and why core's own two checks are not all of them.
4. **Fixed.** `core.md`'s `Shipped:` trail gains a dated entry for `candidates`.
5. **Fixed**, both halves. The filesystem adapter throws `Unusable` for a root overlapping the
   daemon's state and `NotOffered` for a field it does not answer for; `NotOffered` is exported from
   `@notemap/core` as part of the adapter contract, the way `Unusable` already was. The adapter's
   tests name the failure rather than asserting a bare throw.
6. **Fixed.** `overlapsAny`'s comment says what each of its three callers hands it.
7. **Fixed.** Entries are keyed by `scope ?? value`, which is the identity the answer carries.
8. **Fixed.** `clear` at the top of the browser empties the field. Deliberately not called "use the
   root": what an empty value means is the schema's business, and only `create-file` says it names
   the vault's root.
9. **Fixed.** `browserFor` takes the registry as a defaulted parameter, and a test registers a
   component and proves the lookup picks it over the fallback.
10. **Fixed.** The plan's phase 1 says the migration recreated no triggers, and why there were none
    to recreate. Phase 4's `git commit` is ticked.
11. **Fixed.** `todo.md`'s routing-arguments line no longer says `targetSchema`, and the `default`
    that was not built is its own open line rather than a caveat inside a ticked one.
12. **Fixed.** `running.md` says the pool's whole directory is reserved, and to leave the database
    in `state/`.

**T1** (theirs) — *the route searches the capability list linearly and `describe()` returns all of
them; worth a port method for querying one?* **Won't fix.** The list is adapter-declared and two
long; the cost that is real is the `describe()` call, which a per-capability method would not remove
— a WebDAV adapter answering for one capability makes the same round trip. It would also buy a
second way to read capabilities, against `core.md`'s decision that a destination declares them in
one live call, and a second staleness story. If the `describe()` on this route ever hurts, the lever
is the route, which already holds the description and is the only caller.

**T2** (theirs) — *`mkdir vaults/` is dead weight for an instance with no filesystem destination.*
**Dropped**, as the comment itself concluded. One empty directory, and it is the documented mount
point.
