# Review: Destinations that say whether they are actually configured

**Date**: 2026-09-02
**Status**: Resolved
**Scope**: PR #39, `agent/destination-checks-and-accounts` against `main`
**Plan**: `docs/plans/destination-checks-and-accounts.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`

---

## Overall

The shape is right and the docs are in step: ADR 30 argues its case against ADR 26 and ADR 28
rather than around them, all four specs carry a dated `Shipped:` entry, and the plan's Done status
is honest. Tests, typecheck and lint are green.

The findings are all in the same seam — the `rejected`/`unreachable` split the feature exists to
draw. The filesystem adapter draws it from a one-errno test that contradicts the adapter's own
existing convention, so a typo in a root path reports as "asleep, retrying". The settings screen
draws it once and never again, though the spec paragraph two files away says it re-asks on return
to reach. Neither is caught by a test.

---

## Bugs

### 1. The filesystem probe reads a permanent misconfiguration as `unreachable`

`packages/adapters/destination-fs/src/destination.ts:136-152` — the probe sorts a failed
`realRootOf` with `missing()`, which tests for `ENOENT` alone. Everything else becomes a plain
`Error`, which core reads as `unreachable`.

```
root = "~/notes.md/vault"  →  realpath ENOTDIR  →  plain Error  →  { kind: "unreachable" }
```

`ENOTDIR` is a path component that is a file, `ELOOP` is a symlink cycle, `ENAMETOOLONG` is a root
nobody can ever have. All three are a person's to fix, and all three answer "it will come back, and
something is already retrying it" — the one distinction ADR 30 says the call exists for.

The adapter already has the opposite convention and the probe does not use it. `failure()` at
`destination.ts:326` holds `UNREACHABLE` — `EACCES`, `EPERM`, `EROFS`, `ENOSPC`, `EIO` — and treats
*everything else* as `rejected`. The probe inverts that: only `ENOENT` is rejected. The plan's own
phase 5 wording is the adapter's convention, not the code's: "Not there is `rejected`; the errno
list the adapter already treats as unreachable stays `unreachable`."

`EACCES` lands on `unreachable` correctly, but by coincidence rather than by consulting the list.

Fix: sort against `UNREACHABLE` rather than against `ENOENT`, so the probe and the delivery agree
on which errno is which. Nothing tests this branch today either — the four probe tests cover ready,
ENOENT, not-a-directory and W_OK, and none reaches the `unreachable` path at all.

### 2. A destination that probed `unreachable` is never probed again

`apps/ui/src/components/settings/Destinations.svelte:118-120` — the guard is
`probed[one.id] === undefined`, so any answer at all, including `unreachable`, is final for the
life of the component.

The two guards in the same loop disagree. Describing retries anything that is not `described`
(`:116`); probing retries only what *threw*. So a probe answered `{ kind: "unreachable" }` — a
Nextcloud that was down, an unmounted drive — sticks on the row after the thing comes back, while
the describe beside it re-asks.

That contradicts what is written in two places:

- The docstring above the effect: *"one that could not is, since coming back into reach is the
  moment that changes."*
- `docs/specs/shell.md:391`: *"One that answered is not asked again; one that could not is, when the
  pool comes back into reach, since that is the moment worth re-asking on."*

The comment claims a guarantee the code does not enforce, which the project's own rule calls worse
than no comment.

Fix: `probed[one.id]?.kind` on the same terms as `described` — re-ask anything that is not `ready`,
`rejected` or `not-offered`. A `rejected` is settled and `not-offered` will never change; an
`unreachable` is exactly the one worth re-asking.

### 3. A probe in flight is neither tracked nor prevented from doubling

`apps/ui/src/components/settings/Destinations.svelte:88-90` — `probing()` sets nothing while it
runs. `describing()` brackets itself in `asking`; `probing()` does not, and it is the call that
actually goes out to the network.

Two consequences:

- **The row lies while the slow call is running.** `asking` is true only during describe, which
  touches nothing and returns immediately. So a webdav row whose `PROPFIND` is in flight draws
  `✓ answered` in the summary and *"unasked"* in the `reach` fact (`Destination.svelte:135-143`) —
  saying it has not been asked while it is being asked. Phase 3's four states were meant to leave
  one row saying "asking"; the row that can actually hang is the one that never says it.
- **The request can double.** The effect re-runs whenever `$destinations` emits — an edit, a
  retire, a `load()`. `asking[one.id]` skips the row only while a describe is in flight, and a
  describe finishes in microseconds, so a second effect run inside a slow probe's window re-issues
  it. The guard reads `probed[one.id]`, which is still `undefined` until the answer lands.

Fix: bracket `probing()` in its own in-flight record, and feed it to the row so `asking` covers the
call that can hang.

---

## Design

### 4. `client.reachable` now emits on every answered request, and one consumer stands between that and every reader

`packages/client/src/pool/reachability.ts:56-61` — `settle()` sets the mark unconditionally, so
every answered HTTP request pushes a new `Reach` to every subscriber. The plan found this during
phase 2 and the fix is real: `reachable.svelte.ts` splits `yes`, `at` and `ms` into three `$state`
fields, and Svelte's own equality check means assigning the same boolean wakes nobody.

The correctness of the whole design now rests on that — an unwritten property of Svelte's runtime,
in one file, load-bearing for every surface that reads `pool.yes`. `client.md` says as much
("a surface reading only *whether* the pool answers must not be redrawn by a stamp that moved,
which is the shell's to arrange"), which is honest, but a second consumer of `client.reachable`
that subscribes directly and does not know this will silently re-render on every request.

Not something to change now. Worth knowing before the second consumer arrives, and worth a test in
`reachable.svelte.ts` pinning the property rather than leaving it to Svelte's version.

### 5. `probe` on the port has a rejection contract that only a doc comment holds

`packages/core/src/types/api/ports.ts:177-182` and `probe.ts:38-53` — the adapter says which failure
it means by choosing between `Rejected`, `Unusable`, `NotOffered` and everything-else. Two of those
are core's own exports and one is the ambient default, so an adapter author who throws a plain
`Error` for a wrong password gets `unreachable` with no compiler complaint and no test failure.

`candidates` has the same shape, so this is consistent rather than new, and a discriminated return
would be a bigger change than this PR. Recording it because the probe is the first call where
guessing wrong produces a *wrong answer to the user* rather than a lost list.

---

## Minor

### 6. `look()`'s retryable statuses are inline where the file names its constants

`packages/adapters/destination-webdav/src/dav.ts:186-190` — `429` and `408` sit as literals two
lines below a block that named `NOT_THERE`, `CONDITION_FAILED`, `ALREADY_A_COLLECTION` and
`NO_PARENT`. `>= 500` reads fine bare; the two named codes do not.

### 7. A `refused` status that is not 401/403 says only the number

`packages/adapters/destination-webdav/src/destination.ts:135-140` — a server that does not implement
`PROPFIND` answers `405`, and the person reads "Notes answered 405", which names neither the method
nor what it means. It is the most likely way a wrong base URL presents.

### 8. The account `<select>`'s blank option is selectable

`apps/ui/src/components/settings/DestinationForm.svelte:166-176` — `required` blocks a submit with
the blank chosen, so nothing breaks. The placeholder is not `disabled`, so a person can deliberately
choose "—" and then be refused. Marking it `disabled` says it is not a choice.

### 9. New imports break alphabetical order in three files

`apps/daemon/src/app.ts:33`, `:66`, `routes/definitions.ts:34` — `destinationProbeRoute` is inserted
before `destinationDescriptionRoute` in each sorted member list. Lint does not check it; the
surrounding lists are sorted.

---

## Non-issues

- **`webdavSettings()` computed once at adapter construction** — accounts come from `config.toml`,
  which is read at startup, so a restart is already the unit of change.
- **`examples` rather than `enum`** — the plan argues this at length and the argument holds:
  `usability()` re-validates settings on every `describe()`, so a constraining list would strand a
  destination the moment an account is renamed.
- **`isCollection()` matching rather than parsing** — the regex requires `<` immediately before the
  optional prefix, so an href naming a file called `collection.md` does not match it. An XML parser
  for one empty tag is not worth the dependency, and the fake DAV server answers namespace-prefixed
  so the spelling is tested.
- **The `W_OK` test skipped as root** — the probe is right in that case and the premise is not.
  Skipping the test is the correct call.
- **`reachable.svelte.ts` reading `mark.at` unconditionally** — `at` is absent only on the initial
  optimistic mark, and `Daemon.svelte` draws "optimistically, until anything answers" for it.
- **The collapsed row leading with reach over `can`** — `shell.md` says so deliberately: the
  stronger fact leads, and the expanded row carries both.
- **The probe not being consulted by the delivery runner** — ADR 30 lists this as a deliberate
  neutral consequence.

---

## Resolution

Co-reviewed with the developer on PR #39. Their review and this one did not overlap on a single
finding — theirs was readability, this one behaviour — so every row below was settled by discussion
rather than confirmed by both.

1. **Fixed.** `unresolvable()` sorts on the adapter's own `UNREACHABLE` list rather than on
   `ENOENT`, so the probe and a delivery agree. Two tests: `ENOTDIR` is `Rejected`, and a root
   behind a directory that cannot be read is not. `http-v1.md` now states the rule.
2. **Fixed.** Both guards re-ask anything unsettled; `ready`, `rejected` and `not-offered` are
   settled and nothing else is. Tested by taking the pool away and bringing it back.
3. **Fixed.** `probing()` brackets itself in `reaching`, which the row takes as its own prop, and
   the summary reports being asked before it reports what describing said.
4. **Won't fix** — recorded. The split in `reachable.svelte.ts` is correct and `client.md` states
   whose job it is. Worth a pinning test when a second consumer of `client.reachable` appears.
5. **Won't fix** — recorded. `candidates` has the same shape; a discriminated return is a change
   worth making for both at once or not at all.
6. **Fixed.** `TIMED_OUT`, `RATE_LIMITED`, `SERVER_FAULT`, `UNAUTHORIZED` and `FORBIDDEN` are named,
   and the sorter that already spelled those numbers uses them too.
7. **Fixed.** `refusal()` names what a `405` means — the address is not a WebDAV collection — which
   is the likeliest way a wrong base URL presents. Tested against a server that answers only 405.
8. **Won't fix, and the finding was wrong.** Disabling the blank option makes the browser select the
   first account and `bind:value` write it back, which is the silent default the list exists to
   prevent. `required` already refuses the submit. The reason is now a comment where it will be
   read.
9. **Fixed.** Alphabetical order restored in `app.ts` (twice) and `routes/definitions.ts`.

From the developer's review: `reach` is `$derived.by`; `type Destination as One` is gone, the
component importing as `DestinationRow` instead; the webdav probe's nested ternary is a `switch`
with a named `refusal()`; the comments are cut to the ones answering a *why* the code cannot; and
the branch is rebased on `main`, which surfaced the `ADR 29` collision — this one is now **ADR 30**.
