# 60. A driver answers how much it holds, and the host owns the paths

**Date**: 2026-10-12
**Status**: Accepted
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A person running notemap cannot see what it has taken. The pool, the mirror, the blobs and the auth
database are four directories under one volume, and nothing in the app says how big any of them is,
how much room is left where they live, or how much a reclaim would take if it ran now.

Every one of those figures is a question about a filesystem, and the only code that knows the layout
of each is the driver that wrote it: a sqlite file has a `-wal` beside it, a blob store shards by
hash prefix and leaves temporary files mid-write, a mirror writes a `.md` beside every `.json`. The
paths, meanwhile, are the daemon's own config — it authored them and handed them to the drivers.

So: who measures, and who is allowed to know where?

---

## Decision drivers

- **A driver's layout is the driver's.** The seam exists so that a blob store on object storage, or
  a mirror in a bucket, replaces one module. Code elsewhere that knows about `-wal` files or shard
  directories un-replaces it.
- **Free space is about the machine, not about the pool.** Nothing in the domain has an opinion
  about how much room is left on a disk, and core has no filesystem.
- **The figure a button is drawn from must be the figure the button acts on.** How much a reclaim
  would take, and what a reclaim takes, have to come from one rule or they will drift.
- **Cost is not uniform.** A pragma and one `COUNT` are free on every read; walking a blob store and
  a mirror tree is thousands of `stat` calls. A surface that mixes the two pays the walk forever.
- **A path displayed must be the path in use**, and inside a container it is the container's — which
  no code can turn into the operator's own.

---

## Considered options

1. **The daemon walks the three config paths itself** — it has them, and `node:fs` is right there.
2. **Each port answers how much it holds**, and the host owns the paths and asks the filesystem.
3. **Each port answers how much it holds *and where it is***, as an opaque string.
4. **Core answers everything, free space included**, through a new filesystem port.

---

## Decision outcome

Chosen: **option 2**.

A port answers a **footprint** — how much the driver holds, in whatever terms its own layout makes
true:

- `PoolStore.footprint()` — the database's bytes, and how many of them it holds and is not using.
  Only the sqlite driver knows that `page_count * page_size` misses a `-wal` of tens of megabytes,
  and that a `:memory:` store has no file to add.
- `BlobStore.list()` answers each blob's `bytes` beside its hash and when it was last put. It
  already `stat`s every file for the latter, and a temporary file mid-write is not a blob, so it is
  not answered — which is what keeps debris out of every total derived from the walk.
- `MirrorWriter.footprint()` — records, files and bytes. Only the mirror driver knows that a record
  has a rendering beside it, and that its temporary prefix is not either.

Core composes them as `pool.storage`, split by what they cost: `recorded()` reads what the pool has
written down and walks nothing, `measure(signal)` walks. Both deleting nothing.

The host owns the paths, because it authored them. It states them, and asks `statfs` for the space
free where each one lives — a question about the machine, which never enters core. It also answers
the auth database, which is the daemon's own file and no part of the pool.

**The reclaimable figure is the reclaim's own rule.** `measure` and `reclaimUnnamedBlobs` read one
predicate over `config.sweep.grace` in one function, so the figure a button is drawn from cannot
disagree with what the button takes. A second implementation of "nothing names this blob, and it is
old enough" is how the two come to lie about each other.

### Consequences

- **Good** — every figure comes from the code that knows how to be right about it, and a driver
  swapped for another brings its own answer with it.
- **Good** — a surface can read the cheap half as often as it likes. Free space on every read costs
  three `statfs` calls, which is what lets a later surface ask for it without buying a walk.
- **Good** — the button and the reclaim cannot drift: there is one grace predicate.
- **Bad** — `PoolStore` and `MirrorWriter` grow a method that has nothing to do with the material
  they carry, and every driver of either has to answer it. Accepted: the alternative is the host
  knowing each driver's layout, which is worse in the same direction and permanent.
- **Bad** — the walked figures are a measurement rather than a fact, so something has to hold them
  and say when they were taken. The daemon does, in memory, and a restart forgets.
- **Neutral** — the mirror's footprint is answered by `pool.storage.measure()` rather than asked of
  the writer by the host, since core holds that port and the two walks are one cost.
- **Neutral** — two assets naming one blob are counted twice in the recorded sum and once in the
  walk. Both figures are answered rather than reconciled; the difference is what content addressing
  saved, and only something holding both can say it.

---

## Pros and cons of the options

### Option 1 — the daemon walks the paths

- **Good** — nothing new on any port, and the daemon already has every path.
- **Bad** — it bakes each driver's layout into the host: `-wal`, shard directories, the mirror's
  `.json`/`.md` pair, two temporary-file prefixes. Every one of those is a fact a driver was written
  to own.
- **Bad** — a store that is not a local file, or a mirror that is not a directory, answers nothing
  and the host cannot tell.

### Option 2 — a footprint per port, paths at the host

- **Good** — each figure is owned by the only code that can be right about it, and the host keeps
  the two questions that are genuinely the machine's.
- **Bad** — a port method per driver, including for drivers that hold almost nothing.

### Option 3 — the port also answers where it is

- **Good** — one answer per driver, nothing left for the host to join up.
- **Bad** — the daemon handed those paths to the drivers in the first place (`openPool({ file,
  assetRoot, mirrorRoot })`), so this is a round trip that establishes nothing and invites a second
  copy of the truth. `BlobStore.pathFor` stays what it is: a rendering needs to point at one blob,
  which is a different need.

### Option 4 — core answers free space too

- **Good** — one call answers the whole section.
- **Bad** — core would need a filesystem port to answer a question the domain has no opinion about,
  and a pool is not a disk. It would also have to be told paths it has no other use for.

---

## More information

[Plan](../plans/what-notemap-takes-on-disk.md), [core.md](../specs/core.md),
[mirror.md](../specs/mirror.md), [http-v1.md](../specs/http-v1.md).

Revisit if a blob store or a mirror driver appears whose footprint cannot be walked cheaply enough
to answer on request — at which point the figure becomes something the driver keeps as it writes,
rather than something anybody asks for.
