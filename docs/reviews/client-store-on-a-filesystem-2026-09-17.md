# Review: A client store on a filesystem

**Date**: 2026-09-17
**Status**: Resolved
**Scope**: `packages/client/src/{adapters,outbox,api,lifecycle,state}`, `apps/raycast-extension/`, `docs/specs/client.md`, `docs/adr/0048`
**Plan**: `docs/plans/client-store-on-a-filesystem.md`
**Spec**: `docs/specs/client.md`

---

## Overall

The branch does what the plan says, and the docs, ADR and code agree on every point I checked:
lease length, timeout default, the `.unreadable` rule, `close()` abandoning the wire, the
write-before-hold ordering. Typecheck, tests and lint are green. Two real bugs, both in the
concurrency work and both reproduced: a crash between the two syscalls of a filesystem lease
strands the operation permanently, and the write-before-hold fix from `343853b` reopened the
opposing-operations window it was meant to sit beside. The first is narrow but has no recovery;
the second is the one a person can hit from the UI.

The Raycast extension is more than the plan's "not part of this plan" — six commits of feature
work with no spec of its own. It is small enough that this is a note, not a finding.

---

## Bugs

### 1. A crash between `link` and `replace` leaves an operation no process can ever lease

`packages/client/src/adapters/filesystem-store.ts:190-217` — the lease is two steps: make the
hard link, then rewrite the operation file as `sending`. Die between them and the directory holds
`a.json` saying `pending` beside `a.lease`. Every later `leaseOperation` reads `pending`, skips the
stale-rename branch (guarded on `held.state === "sending"`), and `link` fails `EEXIST`. Nothing
removes the link: `writeOperation` only clears it when it is asked to write a non-`sending` state,
and nothing asks.

```
link ok → crash → file: pending, lease: present
next asker: attemptable → state != sending → link EEXIST → undefined … forever
```

Reproduced: plant `a.json` + a hard link `a.lease`, call `leaseOperation` a day later — still
`undefined`. The ADR's "a crashed process must not strand its work" does not hold here, and its
consequences list does not mention it.

Fix: decide staleness from the file, not the state branch. A lease link beside a file whose state is
not `sending` is by definition orphaned (every non-`sending` write removes the link), so on `EEXIST`
when `held.state !== "sending"` rename the link away and link again. Equivalently, take the
stale-rename branch whenever `attemptable(held, now)` is true, since that is exactly the set of
states under which an existing link can only be stale.

### 2. Opposing operations enqueued within one write's latency are both written and both sent

`packages/client/src/outbox/outbox.ts:82-85, 150-159` — `record` now writes before `hold`, so the
outbox entry is absent from `state.outbox` for the duration of `writeOperation`. `enqueue` reads
`state.outbox` to find what it opposes. An unarchive arriving while the archive is still being
written sees nothing to oppose, applies, and is written too. On `main`, `record` held first and the
pair cancelled.

Reproduced with a 20ms store write and a 5ms gap between `enqueue(ARCHIVE)` and
`enqueue(UNARCHIVE)`: the outbox holds both. IndexedDB writes are in that range, so a fast
archive → undo in the web shell can do this. The end state is right — they chain in order and the
pool lands unarchived — but two requests go instead of none, and the "refuse the one made earlier,
however late it arrives" rule (`at` comparison) is skipped entirely for the pair.

The spec entry for this change (`client.md`, "An operation reaches the store before it reaches
state") names the cost as "an entry appearing in the outbox a write later"; it does not name this
one.

Fix: hold first, and make the drain wait for the write rather than the enqueue hide from the drain.
`enqueue` holds the entry immediately and records its pending write (`writes: Map<OperationId,
Promise<void>>`); `send` awaits that promise before `leaseOperation`. That closes the window
`343853b` closed without opening this one, and lets the spec entry go back to one sentence.

---

## Design

### 3. `timeout < lease` is a stated invariant nothing enforces

`packages/client/src/client.ts:125,153` and `packages/client/src/outbox/outbox.ts:45` — the spec
says the request limit "must stay under the outbox's own lease of 60 seconds". A shell passing
`timeout: 90_000` gets no complaint and quietly makes double-sends possible. Two constants in two
files that only the spec ties together. Either clamp in `createClient` (`Math.min(timeout,
LEASE_MS - margin)`) with the lease exported from the outbox, or throw on construction. Silent is
the wrong one of the three.

### 4. Two clients over one store is now two vocabularies

`packages/client/src/outbox/outbox.ts:60,295` — `inflight` is still "claimed", the store's
thing is "leased", and `CONTEXT.md` lists *claim* under words to avoid for *lease*. They are two
different things — the per-process handover and the cross-process lease — and the code needs both.
Give the in-process one its own word in `CONTEXT.md` (the ADR's own "handed over" would do) rather
than letting the avoided one stand.

---

## Minor

### 5. `reconciled` can mark this process's own enqueue as `restored`

`packages/client/src/outbox/outbox.ts:104-131` — between `writeOperation` resolving and `hold`
running, a concurrent `reconciled` reads the file, finds the id not in `seen`, and adds it as
`restored`. From then on a refusal of that operation goes through `reread` instead of `undo`. The
reread converges, so this is tempo, not loss. Closing #2 the way suggested there closes this too.

### 6. `AbortSignal.any` raises the browser floor

`packages/client/src/api/http.ts:57` — Chrome 116, Safari 17.4, Firefox 124. Fine for a
greenfield project; worth one line wherever the UI's supported browsers are stated, since the
client package is what the web shell bundles.

### 7. The same six-line read of `waiting` twice

`apps/raycast-extension/src/drain.ts:17` and `apps/raycast-extension/src/lib/note.ts:68` —
subscribe-resolve-unsubscribe to read a current value. If the client's observables are
value-holding, a `get()`/`read` on the public surface would be the honest answer; if they are not,
one helper in `lib/`.

### 8. The exits suite costs ~2s on every run

`packages/client/src/lifecycle/exits.test.ts:95` — "is held open by a client left open" always
waits its full 1.5s patience, and the suite bundles with esbuild first. Right test, worth knowing
it is the slowest thing in `pnpm -r test`.

### 9. Toolchain drift in the extension

`apps/raycast-extension/package.json` — `eslint ^9`, `@types/node 22`, `typescript ^5.8` against
the root's `eslint 10`, `@types/node 24`. Raycast's scaffold, and `ray lint` wants its config;
still two ESLint majors in one workspace and most of the 1131-line lockfile growth. `README.md`
and `CHANGELOG.md` are the scaffold's placeholders.

---

## Non-issues

- **A lapsed-lease takeover is not atomic on a filesystem** — stated in ADR 48's consequences,
  needs a crash and two cold starts in the same millisecond.
- **A slow process writing `unreachable` over a file another process already landed and removed**
  — `replace` recreates it, the next drain re-sends, the pool answers on the same identity, it is
  dropped. Idempotency under a minted id absorbs this; only reachable past the lease, which the
  timeout keeps a request under.
- **A second tab opened mid-send now waits up to a minute** where it used to re-send at once —
  the ADR says the web shell's tempo is unchanged, which is true of one tab; two tabs sharing
  IndexedDB were re-sending, and waiting is the correct behaviour they now get.
- **The capture command closes on a 2s race and marks a live upload `unreachable`** — the spec
  says a shell may do exactly this; the drain command sends it within its 10m interval.
- **The lease hard link points at the pre-lease inode after `replace`** — nothing reads the link's
  contents; it is a presence marker.
- **The extension's `setDefaultCACertificates` and `globalThis.crypto ??=` at module load** —
  ugly, documented in `docs/todo.md` with the way out (a publicly trusted certificate on the pool).
- **Plan is `In progress` with a `Shipped:` entry already on the spec** — phase 5's three
  by-hand checks are what is left; the entry describes what landed, which it did.

---

## Resolution

1. **Fixed.** The lease is an exclusive create of an empty file rather than a hard link. On
   `EEXIST` the operation is re-read; where it is still attemptable, a lease file older than a
   lease length (by the filesystem's `mtime`) is orphaned and taken over. ADR 48 lists the window
   and the age rule; the spec's directory section names the mechanism. Two tests, young and old.
2. **Fixed.** `record` holds first again and keeps each entry's pending write in a map; `send`
   and `drop` wait on it before leasing or removing. The spec paragraph is rewritten for that
   shape. The lag test is restructured around the new ordering and a test for the opposing pair
   during a write is added.
3. **Fixed.** `createClient` throws `RangeError` for a `timeout` at or over `LEASE_MS`, which the
   outbox now exports. Spec and `ClientConfig` doc say so; one test.
4. **Fixed.** `CONTEXT.md` gains **Handover** (avoid *claim*, *inflight*); `inflight` is
   `handedOver`; the outbox's comments, the ADR and the spec's lease paragraph no longer say
   *claim* for either thing. Also caught while there: the spec's 2026-08-25 prior decision that
   `sending` does not survive its process is marked superseded by ADR 48.
5. **Fixed** by 2: `seen` is populated at hold, before the write, so `reconciled` cannot find an
   own entry it has not seen.
6. **Fixed.** One line in the spec's request-limit paragraph names the floor.
7. **Fixed.** `apps/raycast-extension/src/lib/outbox.ts` has `remaining(client)`; `landing` and
   the drain command use it.
8. **Won't fix.** The 1.5s wait is the assertion — a process that is still alive after it — and
   the bundle step is what makes the fixture a real process. Noted; not worth a flag to skip.
9. **Fixed.** `eslint ^10`, `typescript ^6`, `@types/node ^24`, `prettier ^3.9` to match the
   root; `tsconfig.json` extends the base config, with `types: ["node"]` since TS 6 no longer
   includes `@types/*` by default. Peer warnings unchanged; `ray build` green. `README.md` written;
   `CHANGELOG.md` keeps Raycast's `{PR_MERGE_DATE}` placeholder, which the store fills in.
