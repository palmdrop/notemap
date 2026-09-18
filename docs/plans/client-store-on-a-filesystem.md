# A client store on a filesystem

**Date**: 2026-09-16
**Status**: Done
**Spec**: `docs/specs/client.md`
**Closed**: 2026-09-16

---

## Goal

A client running outside a browser keeps its outbox and its cache in a directory, and reads them
back when it next starts. A capture made while the daemon is unreachable survives the process that
made it, and drains from a later one — including a process that is not the one the person typed
into. Two processes over the same directory neither lose a write nor send an operation twice, and a
process that is done with its client exits on its own.

The Raycast extension is the first shell that needs this, and is the reason both concurrency and
teardown are in scope: Raycast runs each command as its own short-lived process, and can run a
background command while a view command is open. The extension itself is not part of this plan.

**Every command runs a whole client.** Measured rather than assumed, on 2026-09-16: a full client
start plus one capture costs ~26ms more than writing an operation to the store by hand, against a
500-item cache — invisible next to the window Raycast draws around it, and not worth a second
capture path with its own copy of the outbox's rules ([below](#what-was-measured)).

---

## Tasks

### Phase 1 — a filesystem adapter behind the existing port

Depends on nothing. `ClientStore` already answers for every collection
([client.md](../specs/client.md#the-ports--the-seam-for-offline)) and
`adapters/store-contract.test.ts` already states what an adapter must answer; this phase adds a
second implementation and nothing else.

- [x] Branch `agent/client-store-on-a-filesystem`
- [x] An adapter under `packages/client/src/adapters/`, taking the directory to work in as an
      argument. It names no environment variable and no platform: where the directory is, is the
      shell's question
- [x] Exported from a subpath, as `./indexeddb` is, so a browser shell never resolves `node:fs`
- [x] The collections the pool answers for — items, tags, destinations, templates, pool identity —
      are each a whole list replaced as it arrives, so each is one file written to a temporary name
      and renamed over the old one. A reader either sees the previous list or the next one. The
      temporary name is unique per write, not per process: two writes racing on one name is how the
      measurement harness broke, and a rename that lands on a file another write already moved
      fails with `ENOENT`
- [x] The outbox is one file per operation, named for its id: `writeOperation` renames into place,
      `removeOperation` unlinks, `readOutbox` lists the directory. This is what makes two writers
      safe, and it is the reason the outbox is not a list in one file like the rest
- [x] A blob is its bytes on disk beside a record of the filename and the media type, neither of
      which is recoverable from bytes. `blobUrl` answers a `file://` URL — the port's own question
      for a shell that is not a browser, and one with no revocation to own
- [x] A directory that does not exist yet is created on first write, not at import
- [x] Tests: the shared contract, run against the new adapter; a store reopened over the same
      directory answers what the last one wrote; a blob survives the reopen; a half-written file is
      never read, shown by writing through the adapter and listing the directory mid-write
- [x] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [x] `git commit`

### Phase 2 — what the store cannot be trusted to hold alone

Depends on phase 1.

An unreadable collection already leaves a cold client rather than a dead one
([client.md](../specs/client.md)); a *corrupt* one is new, because a file is a thing a person can
edit and a process can be killed halfway through. This phase decides how much the adapter defends
and says so.

- [x] An operation file that does not parse is reported through `onError` and skipped, not thrown:
      one unreadable operation must not cost the person the rest of their outbox
- [x] A collection file that does not parse answers empty, which is the same answer as never having
      been written and lands the client in the cold start it already knows how to be in
- [x] Decide whether a skipped operation file is left, moved aside, or removed, and record the
      answer in the spec. Leaving it means it is re-reported on every start
- [x] Tests: a malformed operation file, a malformed collection file, a blob whose bytes are there
      and whose record is not
- [x] Verify: `pnpm -r --silent test` green
- [x] `git commit`

### Phase 3 — two processes over one directory

Depends on phase 2. This is the phase with a decision in it, and it should not start before the
shape of that decision is agreed.

The client claims an operation in memory the moment a drain schedules one, so a second drain cannot
re-send it (`outbox/outbox.ts`). That guard does not cross a process boundary. Two processes
draining one directory will send the same capture twice, and the pool will hold it twice — the
capture endpoint deduplicates on nothing this plan can lean on.

- [x] ADR: what a second client over one store is allowed to do. The spec currently notes only that
      it leaks the first one's object URLs; this makes it a supported arrangement with a stated
      rule. Weigh at least: a lock file taken for the length of a drain, with a stale-lock age;
      a claim written into the operation file itself, which makes the claim survive a crash and
      need an age too; and a rule that exactly one process drains and the others only enqueue,
      which needs no locking and costs the person a wait when that process is not running
- [x] Implement the decision, in the adapter if it is a lock and in the outbox if it is a claim
- [x] Tests: two stores over one directory, one draining, showing the operation is sent once; a
      lock or claim abandoned by a killed process is taken by the next one rather than held forever
- [x] Update `docs/specs/client.md`: the store section, and the note about a second client
- [x] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [x] `git commit`

### Phase 4 — a client a short-lived process can finish with

Depends on nothing in phases 1–3 and may be done first; the shell in phase 5 depends on it.

A client left open holds the event loop open. Measured on 2026-09-16: after one capture against an
unreachable pool, `process.getActiveResourcesInfo()` answers a live `Timeout` — the drain's failed
request marked the pool unreachable, and reachability scheduled its next probe. `close()` clears it
and the process exits at once; without `close()` the process was still alive after eight seconds
and had to be killed. Nothing here is wrong for a browser tab, which is the only shell that has
existed. A process that is expected to end is a new arrangement and the client does not describe
one.

- [x] `close()` is on `Client` and appears nowhere in `docs/specs/client.md`. Whatever this phase
      decides, the spec gains the lifecycle: what a client holds once created, what `close()`
      releases, and what a shell owes it
- [x] Decide how much further to go than documenting `close()`. Weigh at least: leaving `close()` as
      the whole contract and making it the shell's duty; a client that schedules no probe until
      something reads its surfaces, so a process that only captures never acquires a timer to begin
      with; and an explicit one-shot arrangement that captures, drains once and resolves, with
      nothing left scheduled. The second is the one that changes behaviour for the web shell too
      and so is the one to argue about
- [x] Implement the decision in `packages/client`, and record it as an ADR if it changes what a
      client does rather than only what is written down
- [x] Test: a process that creates a client, captures, and closes exits on its own. This is a
      spawned process asserting its own exit, not a unit test — a leaked handle is invisible to a
      test runner that is holding the loop open anyway
- [x] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [x] `git commit`

### Phase 5 — a shell wires it

Depends on phases 3 and 4.

- [x] The Raycast extension opens the adapter at `environment.supportPath`. Both commands run a
      whole client: the view command captures through it and closes it when the view goes, the
      background command drains and closes before it returns
- [x] Verify by hand: capture with the daemon stopped, quit Raycast, start the daemon, and find the
      capture in the pool without typing it again
- [x] Verify by hand: the background command's process ends rather than being killed
- [x] `git commit`

---

## What was measured

2026-09-16, Node 24.19 on macOS, esbuild bundles matching what `ray build` emits, medians of 15
warm runs each in a fresh process. Not measured inside Raycast's runtime, which adds a constant to
every row.

| | empty process | one operation written by hand | whole client |
| --- | --- | --- | --- |
| wall clock, 500-item cache | 27.6ms | 32.2ms | 57.8ms |
| wall clock, 2000-item cache | — | 32.9ms | 65.0ms |
| module evaluation, over baseline | — | +0.9ms | +7.8ms |
| `createClient` | — | — | 12.4ms |
| `capture()` to the durable write | — | 4.0ms | 6.5ms |
| bundle | 112B | 7.4KB | 472KB |

Hydration scales gently: an empty store to 2000 items moves the in-process work from 17.9ms to
24.9ms, and the cache is capped at 500 processed items plus the unprocessed working set. The
harness is not in the repo; it stands up a measurement-only filesystem store, and phase 1 replaces
it with the real one.

---

## Unknowns

- **Whether `File` on disk is worth the round trip.** The port answers blobs as `File`, which Node
  has. Reading one back means holding its bytes in memory. If a capture ever carries something
  large, the port is the thing that would have to change, not the adapter. Fallback: leave it, and
  note the ceiling in the spec.
- **Whether `file://` is a usable answer for `blobUrl` in Raycast.** A Raycast `Detail` renders
  markdown and may not load a local file. If it does not, the shell resolves bytes some other way
  and `blobUrl` is answered as `undefined` rather than wrongly. Fallback costs the preview, not the
  capture.
- **Whether renames are atomic where the directory lives.** They are on a local filesystem, which
  is where `supportPath` is. A directory on a network mount is outside what this plan claims.
- **Whether phase 4 lands as documentation or as a behaviour change.** If a client that nobody is
  reading stops scheduling probes, the web shell's reachability changes tempo too, and that is a
  bigger change than this plan's goal needs. Fallback: document `close()`, leave the behaviour, and
  let the shell carry the duty.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The shared contract in `adapters/store-contract.test.ts` is the first test of the new adapter and
most of what phase 1 owes. What is new and therefore needs tests of its own: a reopen over the same
directory, a torn write, a malformed file, two processes over one directory, and a process that
exits on its own.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
