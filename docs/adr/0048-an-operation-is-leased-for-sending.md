# 48. An operation is leased for sending

**Date**: 2026-09-17
**Status**: Accepted
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A client outside a browser keeps its store in a directory, and the shell that needs it — the
Raycast extension — runs each command as its own short-lived process, sometimes two at once. The
outbox guards against sending an operation twice with an in-memory set, claimed the moment a drain
schedules one; that guard does not cross a process boundary. Two processes draining one directory
would send the same capture twice, and the capture endpoint deduplicates on nothing the client can
lean on. What is a second client over one store allowed to do, and what stops it re-sending what
the first one is sending?

---

## Decision drivers

- **A capture must reach the pool once.** Duplicate items are the failure the outbox exists to
  prevent; losing one is the other.
- **A crashed process must not strand its work.** Whatever a process holds while sending has to
  become available again without anyone cleaning up, or a killed command costs the person a capture.
- **The web shell should not change tempo for this.** A browser tab is the shell that exists; the
  arrangement is new and should cost it nothing.
- **The store port is the seam.** Atomicity is the adapter's to provide, on the platform's terms —
  a transaction in IndexedDB, an exclusive link on a filesystem — so the outbox stays written
  against a port.

---

## Considered options

1. **A lock file taken for the length of a drain**, with a stale-lock age.
2. **A lease written into the operation itself** — `sending` until a time — with an atomic
   acquire on the port.
3. **Exactly one process drains and the others only enqueue**, which needs no locking.

---

## Decision outcome

**Option 2.**

**`sending` is a lease.** An operation in that state carries `until`, the time the lease lapses;
one whose `until` is past, or absent, is attemptable by any process. A drain leaves a live lease
alone and answers when the soonest one lapses, so the client can drain again then. The word is
`CONTEXT.md`'s: a time-limited exclusive claim that expires by being past its time when someone
next asks, not by anything reaping it.

**The acquire is the store's, and atomic.** `ClientStore.leaseOperation(id, now, until)` takes the
operation up and answers it as written, or nothing where it is gone or leased. The memory adapter
is atomic by being single-threaded; the IndexedDB adapter by one read-write transaction; the
filesystem adapter by a hard link made beside the operation file, which fails where one exists.
Two processes reading the same pending operation in the same instant get one answer between them.

**A drain reads the store back before it reaches for what it hydrated.** What this process enqueued
is its own to describe and is claimed before anything yields, as before. What it read out of the
store is whatever the store says now — gone, because another process landed it; leased, and left
alone; or newly enqueued by another process, and taken up. Hydration no longer rewrites `sending`
to `pending`; the lapse does that job, at drain time, so a long-lived client also picks up a claim
a crashed one abandoned.

**The lease is a minute.** Long enough that a slow upload is not taken over while it is still
going; short enough that a capture whose process died mid-send is not stranded for long.

### Consequences

- Good: the realistic race — two processes reading one pending operation at once — is closed on
  every adapter, and a crashed process's work is picked up without cleanup.
- Good: the web shell sees no change in tempo; a lease it holds is its own, and it drains as it did.
- Bad: an operation whose process died mid-send waits out the minute before another attempts it.
- Bad: the takeover of a *lapsed* lease on a filesystem is not atomic. Two processes taking over the
  same abandoned lease in the same instant can both link, since renaming the stale link away and
  making a new one are two steps. That needs a crash and two cold starts in the same millisecond;
  closing it needs a lock the platform releases on death, which Node does not offer without a native
  module.
- Bad: an upload longer than a minute can be sent twice, by a process that takes the lease over
  while the first is still going. The pool answers the second on the first's identity.
- Neutral: the port grows a method, and the contract test states what it answers. Every adapter
  gains one.

---

## Pros and cons of the options

### A lock file taken for the length of a drain

- **Good** — one lock, one place; nothing in the operation record changes.
- **Bad** — a process that hydrated the outbox and then waits for the lock still holds the
  operation in memory as pending, and sends it once the lock is its own even though the holder
  removed the file. A lock is only correct if the drain re-reads the store after taking it, which
  is the bigger change the lease makes anyway.
- **Bad** — one lock serialises drains that could run side by side, and a lock abandoned by a crash
  blocks every operation, not one.

### A lease written into the operation itself

- **Good** — the claim survives the crash of the process that made it, and lapses on its own.
- **Good** — the state a shell already draws, `sending`, is the lease; nothing new to show.
- **Bad** — needs an atomic acquire on the port, which is a method every adapter has to answer.

### Exactly one process drains

- **Good** — needs no locking at all.
- **Bad** — the view command drains on hydration, as every client does, so it would need a mode
  that does not; and a capture made with the daemon reachable would wait for the background
  command's interval rather than going at once.

---

## More information

[client.md](../specs/client.md), the store section and the outbox;
[the plan](../plans/client-store-on-a-filesystem.md), phase 3. Revisit if a shell appears where
two long-lived clients share a store and the minute matters, or if the capture endpoint learns to
deduplicate on the operation's id — at which point the lease is a courtesy rather than a guard.
