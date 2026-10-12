# What notemap takes on disk

**Date**: 2026-10-12
**Status**: In progress <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/core.md`, `docs/specs/mirror.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> A **Storage** section in settings says what the pool, the mirror, the blobs and the auth database
> take on disk, how much space is free where each of them lives, where each of them is, and how much
> a reclaim would take right now — with a button that takes it, active only when there is something
> to take. The expensive half is measured when the section is opened and nowhere else, and the cheap
> half answers on every read so a future surface can ask for free space without paying for a walk.

Closes the top item of [todo.md](../todo.md): *storage space, mirror + db size, asset sizes*.

---

## Decisions

Settled with the developer on 2026-10-12.

1. **A settings section, not a stats page.** `/settings/storage`, the eighth section, drawn on the
   facts grid like every other. A stats surface — tag statistics, capture rates — is a separate
   question and this does not open it.
2. **Nothing goes on `/v1/health`.** That route is open and says deliberately nothing about a
   pool's size. Three new authenticated routes instead, token-allowed like the rest of `/v1`,
   the reclaim included: it is no more than what the daemon already does to itself every day.
3. **A driver answers how much it holds; the host owns the paths and asks the filesystem.** Only
   the sqlite driver knows about `-wal`, only blob-fs knows about shard directories and temporary
   files, only mirror-fs knows a record has a rendering beside it — so a footprint is a port
   method. The paths are the daemon's own config, which it authored and handed to the drivers, so
   displaying one assumes nothing; `statfs` is about the machine rather than the pool and never
   enters core. This is the ADR.
4. **The reclaimable figure comes from the same grace rule as the reclaim.** Core walks, because
   "nothing names this blob" needs the store and the grace window is core's policy. A second
   implementation in the daemon is how the button and the reclaim come to disagree. They share one
   predicate in one function in `maintenance.ts`, which is what holds them together — not where
   either is exposed.
5. **`pool.storage`, two methods, split by cost as the routes are.** `recorded()` answers what the
   pool has written down — the database's bytes and slack, the asset count and summed bytes — and
   walks nothing. `measure(signal?)` walks the blob store: count, bytes, past grace, still in
   grace. Its own api rather than `maintenance` (which does already hold a pure read in
   `verifyMirror`, but is not where a person looks for how big a pool is) and rather than `views`
   (surfaces) or `assets` (per-asset operations). `TagsApi` and `SourcesApi` are one method each
   and still their own, so the concern earns the name; `storage` then carries the core read, the
   route and the section with one word. **`recorded` over `held`**: *held* is the client outbox's
   word in [running.md](../running.md#bytes-a-shell-is-holding) for bytes a shell is sitting on.
6. **Cheap live, expensive cached.** The pool's bytes (a pragma), the asset count and sum (one
   query), free space (a `statfs` per root), the paths and the auth database answer on every `GET`.
   The blob walk and the mirror walk are measured on request and cached by the daemon.
7. **Our own image declares itself.** The host path behind a Docker volume is not discoverable from
   inside a container — no environment variable, no visible API, and the `/proc/self/mountinfo`
   hint is wrong under rootless Docker, podman and Docker Desktop — so it is never guessed. The
   runtime stage of the `Dockerfile` already sets `NOTEMAP_CONFIG`; it gains one declaring the
   deployment, which is an exact claim about this image on the footing `VERSION` already has.
   `/.dockerenv` covers a container somebody else built. Where neither says so the section states
   no deployment, because absence proves nothing.
8. **Both records and files for the mirror.** An item is a `.json` and a `.md` beside it, so
   `1,204 records · 2,408 files` also surfaces a rendering that never landed — which nothing else
   notices, verify being unbuilt.
9. **Free space is per root, not per pool.** The three roots default to siblings under one volume
   but config can put the mirror on a mount of its own, and `StatFs` answers no filesystem id to
   dedupe on. One row per root carrying its path, its footprint and the space free where it lives;
   where they are siblings the free figure repeats, which reads as *same disk*.

### Settled while implementing, 2026-10-12

10. **`unused`, never `slack`.** The figure is drawn, per unknown 5 — it is the only thing that
    explains why a pool that lost items did not shrink — but *slack* says nothing to a person, and
    the wire and the shell both say `unused`.
11. **No separators between figures on a row.** `4.2 MB 65 KB unused (52 GB free)`: the bold value,
    then what it is made of, then the free figure in parentheses. The shell's `Lead` already draws
    exactly that, and a `·` between them would read as a list of equals.
12. **`storage` sits after `server`**, pool settings staying last. Confirmed with the developer.
13. **The mirror's walk is inside `pool.storage.measure()`.** Core holds the mirror writer port and
    the two walks are one cost, so there is one call, one signal and one cached answer — rather than
    the daemon asking the writer beside core, which phase 2's and 4's split would also have allowed.

### Deviation from the brief, and why

The brief had each port also answer **where it is**, as an optional opaque string. Dropped: the
daemon authored those paths itself (`openPool({ file, assetRoot, mirrorRoot })`,
`apps/daemon/src/ports.ts:122`) and `config.auth` beside them, so a port method handing them back
is a round trip that establishes nothing. What the daemon must not do is *walk* or *stat the
internals of* those paths, and decision 3 is what stops it. `BlobStore.pathFor` stays what it is —
a rendering needs to point at one blob, which is a different need.

### What the pragma misses

`page_count * page_size` is the database, and the store opens in WAL mode
(`packages/plumbing/sqlite/src/open.ts:38`), so a `-wal` of tens of megabytes is real disk use the
pragma cannot see. The sqlite driver sums the pragma with its own `-wal` and `-shm` where it has a
file, and answers the pragma alone for `:memory:`, which has neither. Named here because it is
otherwise a phase-4 surprise.

---

## Tasks

- [x] Create branch `agent/what-notemap-takes-on-disk`

### Phase 1 — Docs and the decision

Depends on nothing.

- [x] ADR (via `core:adr`): a driver answers how much it holds, and the host owns the paths and
  asks the filesystem. Weigh the rejected option — the daemon walking the three config paths
  itself, which bakes every driver's layout into the host and is what the driver seam exists to
  prevent — and the narrower one, each port also answering its own path, rejected per above.
- [x] `core.md`: what core answers about the pool's footprint, split cheap from walked, and that
  the reclaimable figure is the reclaim's own rule rather than a second reading of it.
- [x] `mirror.md`: the writer's new footprint method, records and files apart.
- [x] `http-v1.md`: the three routes, in its voice, with the dateline it uses. Say which half of
  `GET /v1/storage` is live and which is a remembered measurement, that the `GET` never walks, and
  that the reclaim is token-allowed and why.
- [x] `client.md`: the client's reads, and that nothing is cached client-side — the daemon holds
  the measurement, so a remembered copy here would be a third answer.
- [x] `shell.md`: the Storage section under §Settings (≈ line 2324), in Server's voice (≈ line
  2427). Name the shell's own words for these figures and the deployment line deliberately, as
  that section already does for `retired`/`disabled`.
- [x] `CONTEXT.md`: only if a figure needs a word the glossary lacks. Check **reclaim** (line 169)
  still reads true once a person can fire one by hand.
- [x] Commit

**Verify:** `grep -rn "storage" docs/specs` reads as one account of the same thing; no spec
describes a route or a method a later phase does not build.

### Phase 2 — The drivers say how much they hold

Depends on phase 1 only for the names.

- [x] `PoolStore` gains a footprint read in `packages/core/src/types/api/ports.ts`: the database's
  bytes and its slack.
- [x] `store-sqlite`: `page_count * page_size` and `freelist_count * page_size`, plus `-wal` and
  `-shm` where the store has a file rather than `:memory:`.
- [x] `ListedBlob` gains `bytes`. `blob-fs`'s `list()` already stats each file for its mtime
  (`packages/adapters/blob-fs/src/store.ts:138`), so this is the same `stat`.
- [x] `MirrorWriter` gains a footprint method: records, files and bytes. `mirror-fs` walks `root`,
  counting `.json` as records and everything it holds as files, skipping its temporary prefix
  (`packages/adapters/mirror-fs/src/atomic.ts`).
- [x] Commit

**Verify:** `pnpm --filter @notemap/store-sqlite --filter @notemap/blob-fs --filter @notemap/mirror-fs test`.
New tests: a store's bytes rise after a write and a `:memory:` store answers without a path; `list`
answers each blob's size and no temporary file's; the mirror's walk counts a record whose rendering
is missing as one record and one file, and ignores a temporary left mid-write.

### Phase 3 — Core answers the pool's footprint

Depends on phase 2.

- [x] `StorageApi` on `Pool` beside `maintenance`, per decision 5.
- [x] `storage.recorded()`: the database's bytes and slack, and the asset count and summed `bytes`
  from one query over the `assets` table
  (`packages/adapters/store-sqlite/src/migrations.ts:220`), on the prepared-statement pattern
  `counts` uses (`pool-store.ts:882`). Walks nothing.
- [x] `storage.measure(signal?)`: blob count and bytes, and the blobs nothing names split into
  **past grace** and **still in grace**. Abortable, deleting nothing.
- [x] Lift the grace predicate out of `reclaimUnnamedBlobs`
  (`packages/core/src/pool/maintenance.ts:57`) so the walk and the reclaim read one function over
  `config.sweep.grace`. This is decision 4's whole guarantee, so it is the edit to make first and
  the one the tests aim at.
- [x] The summed asset bytes and the blob total are both answered rather than reconciled: two
  assets naming one blob are counted twice, and the difference is what deduplication saved.
- [x] Commit

**Verify:** `pnpm --filter @notemap/core test`. Cases: a pool with no assets answers zeroes rather
than absent; two assets over one blob sum twice and count the blob once; an unnamed blob past grace
lands in the reclaimable figure and one within grace in the other; a blob a routing record's output
names is in neither; the walk honours its signal and deletes nothing.

### Phase 4 — The daemon measures, remembers and serves

Depends on phase 3.

- [x] A storage service beside `apps/daemon/src/assets/reclaiming.ts`: the live facts on every ask,
  the walk behind a skip-if-in-flight guard and a remembered answer with when it was measured,
  built on `startReclaiming`'s shape (`reclaiming.ts:30`).
- [x] Free space per root: `statfs` from `node:fs/promises` over the pool's directory, the mirror's
  root and the assets' root. Built in, and the engine is already `node >=26` — nothing to install.
- [x] The auth database's bytes, from `config.auth`. Absent where there is no file, which the test
  fixture's in-memory auth is.
- [x] The deployment: a new `ENV` in the `Dockerfile`'s runtime stage beside `NOTEMAP_CONFIG`,
  `/.dockerenv` as the fallback, and nothing claimed where neither says so.
- [x] `GET /v1/storage`, `POST /v1/storage/measure`, `POST /v1/reclaim` — handlers in
  `apps/daemon/src/routes/`, definitions beside `countsRoute`
  (`apps/daemon/src/routes/definitions.ts:455`), registered in `apps/daemon/src/app.ts` under
  `/v1/*` with no `requireSession`. The reclaim answers how many blobs and how many bytes it took.
- [x] `AppOptions` grows the service; `apps/daemon/src/testing/fixture.ts:199` builds one.
- [x] Regenerate `apps/daemon/openapi.json` (`pnpm --filter @notemap/daemon openapi`) and add the
  three paths to the inventory in `apps/daemon/src/openapi.test.ts:75`.
- [x] Commit

**Verify:** daemon tests. `GET` on a daemon that has never measured answers the live facts and no
measurement; `POST …/measure` fills it and a second one during the first joins rather than starting
another; `GET` never walks (assert the blob store is not listed); a token reaches all three; the
reclaim answers what it took and the next `GET`'s remembered figure is stale until re-measured.
Then `pnpm test:stack` — this crosses the HTTP surface, the host's wiring and the config file.

### Phase 5 — The client reads it

Depends on phase 4.

- [x] `pnpm --filter @notemap/client codegen` against the regenerated `openapi.json`.
- [x] A storage module on `createSources`' pattern (`packages/client/src/sources/sources.ts`): a
  plain read every time, nothing cached, since the daemon holds the measurement.
- [x] Reads for the live facts, for asking a measurement, and for firing the reclaim, on
  `ClientApi` beside `sources`.
- [x] Commit

**Verify:** `pnpm --filter @notemap/client test`. Cases: each read answers what the daemon said; an
unreachable pool throws what the transport throws rather than answering zeroes.

### Phase 6 — The Storage section

Depends on phase 5.

- [x] `storage` in `SECTIONS` (`apps/ui/src/components/settings/href.ts:3`). Placed after `server`,
  pool settings staying last — confirmed with the developer.
- [x] `Storage.svelte` on the facts grid, drawn with `Section`, `Fact`, `Lead`, `Action` and
  `Asking`, wired in `apps/ui/src/routes/settings/[section]/+page.svelte`.
- [x] A row per root: its path, its footprint, the space free where it lives. The pool's slack, the
  asset count and what deduplication saved. The mirror's records and files. The auth database. The
  deployment where it is known.
- [x] Reads the live facts as the section opens and asks for a measurement at the same moment,
  drawing the remembered figure under `Asking` until the fresh one lands — never a layout shift,
  per the shell's own rule, and never a guess where nothing is cached.
- [x] `reclaim now` under the blob facts, active only where the past-grace figure is non-zero, and
  saying what it took. Re-reads afterwards; the blob figures are stale until it does.
- [x] Unavailable rather than guessing while the pool is out of reach, on Pool settings' terms.
- [x] Format with `sizeOf` (`apps/ui/src/lib/attachments.ts:41`).
- [x] Commit

**Verify:** `pnpm --filter @notemap/ui test`. Cases: the section draws every figure from one
answer; the button is inert at zero and fires at one; a measurement in flight draws the remembered
figure and the ask, never nothing; an unreachable pool draws unavailable.

### Phase 7 — The insights elsewhere

Depends on phase 6 for `sizeOf` usage only. Deliberately small.

- [ ] An item's total attachment bytes where it carries more than one
  (`apps/ui/src/components/item/AttachedLines.svelte:27` already draws each).
- [ ] A delivery's output bytes in the record view (`apps/ui/src/components/record/Block.svelte`).
- [ ] Commit

**Verify:** `pnpm --filter @notemap/ui test`. One attachment draws no total; two draw one.

### Phase 8 — Close out

- [ ] `running.md`: the volume table (≈ line 219) gains the pointer that the section says what each
  of the four takes and what is free; the reclaim paragraph (≈ line 242) says a person can fire the
  pool's reclaim from settings rather than waiting out the day.
- [ ] `todo.md`: tick the top item.
- [ ] `Shipped:` entry in each of the five specs.
- [ ] Typecheck, `pnpm -r --silent test`, lint, `pnpm test:stack`.
- [ ] Commit

---

## Unknowns

- [x] **Where the two reads hang off `Pool`.** _(2026-10-12)_ `pool.storage`, two methods — see
  decision 5. `maintenance` was the other candidate and does already hold a pure read, but it is
  not where a person looks for how big a pool is, and the reclaim's rule is shared in code rather
  than by co-location.
- **Whether the mirror's walk is cheap enough to leave unbounded.** It is one `readdir` per day
  directory and a `stat` per file, so a pool with years of daily captures is thousands of files.
  Acceptable for a measurement nobody waits on. If a real mirror makes the section feel broken,
  the fallback is to total from the record files' sizes alone and stop stating a file count.
- [x] **Whether `statfs` on a path that does not exist yet throws or answers.** _(2026-10-12)_ It
  throws `ENOENT`. The walk-up-to-the-nearest-existing-parent fallback is what ships, and a root
  with no existing parent is answered with no free figure rather than a zero.
- **Whether the daemon's startup reclaim should fill the measurement cache.** It already walks the
  blob store, so the figures are nearly free there — but it does not total bytes and coupling the
  two makes the reclaim own a cache. Left alone unless a cold section feels slow.
- [x] **Whether `freelist_count` is worth drawing.** _(2026-10-12)_ Drawn, as **`unused`** — see
  decision 10. *Slack* was the word that was wrong, not the figure.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The one that matters most is that **the button and the reclaim agree**: a test that measures, fires
the reclaim, and asserts it took exactly the blobs the past-grace figure named — and that a blob
inside the grace window appears in the other figure and survives. Those two reading from one rule
is the whole of decision 4, and nothing else in the suite would notice them drifting apart.

Second: that `GET /v1/storage` walks nothing. Assert it over a blob store that throws if listed.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
