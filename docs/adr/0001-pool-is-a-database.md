# 1. The pool is a database, not a folder of files

**Date**: 2026-08-01
**Status**: Accepted

---

## Context and problem statement

A founding principle of the project says "plain files are the source of truth"
([standards.md](../standards.md)). Applied literally to notemap's pool, that means captures
live as markdown files that any tool — including the user — may edit. Should the pool be a
folder of plain files, or a database that notemap owns outright?

---

## Decision drivers

- Prior experience: file-backed stores in other projects made **external edits** expensive.
  The cost is not writing files, it is reading them back and having to decide whether the
  app or the user made a change.
- The pool's invariants are relational: revision chains, derived "superseded" and
  "unprocessed", an append-only routing log, dedup of blobs.
- notemap is a conveyor belt. Lock-in is prevented at the **destination**, where routed
  material lands as plain files and lives long-term — not at the triage buffer.
- The feed nonetheless accumulates forever, so "it's only a buffer" is only half true.

---

## Decision outcome

**The pool is a database that notemap owns**, not a folder of files. Captures, revisions,
classification, enrichment, and the routing log all live in it.

*Amended 2026-08-03 — SQLite is the first driver, not the decision.* This originally read "the
pool is a **SQLite** database", which put the driver in the decision. **Core is
storage-agnostic**: it states what it needs of a store and does not know which store answers.
SQLite is the initial implementation and remains the only planned one — nothing here promises a
second — but core may not assume it.

What core requires of any storage driver:

- **A domain operation applies all-or-nothing.**

  > *Amended 2026-08-06 — core holds a transaction handle after all.* This originally read
  > "core submits one command per operation ... and never holds a transaction handle", with
  > preconditions carried on each command. Building the first driver showed what that costs: a
  > reified command union makes every mutation's return type opaque, so core cannot get back
  > the `modified_at` the driver just assigned without a second read, and everything a mutation
  > writes besides its own record — the jobs it enqueues, the log entry recording it — has to
  > travel as parameters to keep it in the same atomic unit. Preconditions were the same
  > problem wearing a type: an assertion submitted ahead of a write, refused out of band,
  > because core had no way to read and write in one breath.
  >
  > The store now exposes `transaction(work)`. Core reads and writes freely inside it; the
  > driver commits when the work resolves and discards it when the work rejects. All-or-nothing
  > is unchanged — it is the whole point — and so is every other requirement below.
  >
  > **Preconditions are gone as a concept.** They are ordinary reads now. ADR 11's amendment
  > stops being "assert `is-head`, catch the refusal, resubmit as a revision" and becomes one
  > readable flow in core: read the head, amend it or append a revision.
  >
  > What this costs, stated plainly: the rule that **core performs no I/O inside a
  > transaction** survives, but it is now a convention review defends rather than a structural
  > impossibility. The store holds a write lock for as long as the callback runs, so awaiting
  > an asset store or a provider in there stalls the pool. A *synchronous* callback would
  > enforce it — no port could be awaited, because every port is async — at the price of
  > foreclosing an asynchronous store such as Postgres. This is the same trade
  > [core.md](../specs/core.md) already made for `fs` on 2026-08-04, resolved the same way.
  >
  > It also narrows "storage-agnostic" by a little: a store must tolerate a transaction that
  > stays open across the caller's `await` points.
- **Ordered, paginated reads with stable cursors**, expressed in domain terms — the queue and
  the feed are asked for as such. Core states the question; the driver chooses how to answer
  it, including whatever it materializes or indexes to do so.
- **Uniqueness on client-generated capture ids**, so a replayed capture produces one item.
  *Clarified 2026-08-06*: uniqueness on a **source identity** applies to captures only. A
  revision is a new item but not a new capture from a source, so it carries the identity of the
  capture it revises and is exempt — the rule exists so that re-reading a source cannot
  duplicate, and a revision never came from a source at all.
- **`modified_at` assigned monotonically per pool**, or a client's delta read can miss a write
  that committed out of order ([sync.md](../specs/sync.md)).
- **Assets and blobs released by reference count**
  ([ADR 13](0013-assets-are-named-references-to-content-addressed-blobs.md)), with a reference
  taken when the referencing capture commits rather than when bytes are stored.

Derived state stays derived *in the model* — there is no independent `superseded` flag that can
drift from the revision link. A driver materializing it as a column or an index is free to, so
long as it remains a function of the link.

Media (audio, snapshots, images) live **once**, in a shared `assets/` directory that both
the database and the mirror reference. Duplicating media into the mirror was rejected: a
user who edits one copy creates a *silent* fork, and a later rebuild would quietly resurrect
the edited version. One shared file breaks loudly instead, which is the better failure.

> **Superseded 2026-08-04 by
> [ADR 13](0013-assets-are-named-references-to-content-addressed-blobs.md).** The paragraph
> below decided assets are path-addressed and human-named. That held until deduplication was
> added on top, which raised a question it could not answer: whose filename wins when the same
> bytes arrive under two names. ADR 13 splits the two — a named **asset** referencing a
> content-addressed **blob** — so filenames are preserved exactly and content is still stored
> once. Everything else in this ADR stands. Kept for the reasoning, which ADR 13 builds on
> rather than discards.

Assets are **addressed by path**, not by content hash — a hash filename is unusable for a
human and becomes a lie the moment the file changes. The hash is recorded as metadata so
notemap can *detect* drift and say so, rather than pretend to prevent it. Purge therefore
frees an asset by **reference count**, not by hash sharing.

All access goes through the core API. **No direct reads of notemap's storage by other
apps, and no external edits.** The user still owns the data: export, delete, and purge are
first-class operations.

To keep the spirit of principle 2 without its cost, notemap maintains a **lossless one-way
mirror**: every capture is written to disk as CommonMark + YAML frontmatter with a state
sidecar, and **never read back during normal operation**. There is nothing to reconcile, and
a dead notemap never blocks access to a decade of material.

The mirror is lossless on purpose: a pool must be **rebuildable from the mirror alone** if
the database is lost. That is what makes the mirror testable — a round-trip property test
(pool → mirror → pool) keeps it honest, where an untested mirror would rot silently and be
discovered years too late. Rebuild is the *only* time notemap reads the mirror.

The mirror carries captures, media, and durable human-owned state (classification,
corrections, routing records). It does not carry pending suggestions: enrichment is
regenerable by definition. *Amended 2026-08-02*: artifacts are mirrored too — the original
transcript and its correction both — so a rebuild loses neither.

The never-read rule has exactly **one exception: media bytes**, which are read from `assets/`
at runtime. Text and state are still write-only.

**The mirror writer and the asset store are ports**, like the storage driver — never direct
filesystem calls inside core. The layout below is what the local driver produces; a different
driver could put the same bytes in object storage without touching the domain.

On-disk layout — `state/`, `pool-mirror/` and `assets/` are siblings:

```
notemap/
  state/notemap.db          <- authoritative, never synced
  pool-mirror/2026/08/01/   <- write-only: capture .md + state .json
  assets/ab/cd1234…         <- blobs, single copy, content-addressed (ADR 13)
```

*Amended 2026-08-04*: `assets/` was originally laid out by date, matching `pool-mirror/`. Under
[ADR 13](0013-assets-are-named-references-to-content-addressed-blobs.md) it holds blobs sharded
by hash prefix, because the same bytes have no single date. Filenames live on the asset record
and are written into the mirror's text beside each blob reference.

Because mirror text is never read, `pool-mirror/` is safe to place inside a synced folder.
Neither half is portable alone, though: **the backup unit is the whole `notemap/` directory**,
and rebuilding a lost pool needs the mirror *and* the assets.

The plain-files principle is narrowed accordingly, and
[standards.md](../standards.md) now states it in the narrowed form: plain files are the source
of truth *for material that has come to rest*, not for every store. Notemap holds the working
copy; the mirror and the destinations hold the durable one.

### Consequences

- **Good** — transactions, real invariants, no file-watching, no "who wrote this?" ambiguity.
  *Amended 2026-08-03*: "FTS5 and sqlite-vec in the same file" was also listed here. It is a
  property of the SQLite driver, not of the decision. Search and the embedding index may not
  assume storage co-located with the pool; both are out of scope for the first slice, so this
  costs nothing yet.
- **Bad** — the pool is opaque without notemap running; the mirror and the export path are
  now load-bearing and must be tested, not aspirational.
- **Neutral** — the pool becomes **private to notemap**. Other tools cannot interop with it by
  sharing a folder of files; they interop through routed output, or as API clients.

---

## Pros and cons of the options

### Files as the source of truth (rejected)

- **Good** — purest reading of the philosophy; any tool can read or write the pool.
- **Bad** — atomicity, external-edit reconciliation and provenance of changes all become
  hand-rolled. Known cost from prior projects.

### Files for immutable payloads, database for state (rejected)

- **Good** — captures stay greppable; state stays relational.
- **Bad** — still exposes files to external edits, which is the actual source of the pain;
  buys interop that the API-only rule then forbids anyway.

### Media as SQLite BLOBs (rejected)

- **Bad** — SQLite only beats the filesystem below roughly 100 KB; audio and SingleFile
  snapshots are far past that, and audio playback wants range requests.

### Media duplicated into the mirror (rejected)

- **Good** — the mirror would be self-contained; an external edit could not reach the
  authoritative bytes.
- **Bad** — it could reach them *silently*: editing the mirror copy forks the two, and a
  rebuild would prefer the fork without ever saying so. A shared file fails loudly.

---

## More information

Model: [../exploration/vision/pool-and-routing.md](../exploration/vision/pool-and-routing.md).
Formats: [../standards.md](../standards.md).
Revisit if the pool ever needs to be readable by another app on the same machine without a
running notemap, or if the mirror proves sufficient on its own.

*Added 2026-08-03*: the "local filesystem, never a network share" rule that accompanies leasing
([ADR 2](0002-core-is-a-host-agnostic-library.md), [core.md](../specs/core.md)) is a limit of
the SQLite driver, not a requirement core places on storage. It is documented with the driver.
