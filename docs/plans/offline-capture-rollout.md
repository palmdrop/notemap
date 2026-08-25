# Rolling out offline capture, four plans and seven pull requests

**Date**: 2026-08-24
**Status**: In progress
**Closed**:

---

## Goal

The work described by [editable-until-processed](editable-until-processed.md),
[client-minted-assets-and-health](client-minted-assets-and-health.md),
[durable-offline-client](durable-offline-client.md) and
[shell-offline-marks](shell-offline-marks.md) reaches `main` as a sequence of squash-merged pull
requests in which **every merge leaves `main` coherent**: no route half-replaced, no spec claiming
something the code does not do, no client reading a shape the daemon stopped answering.

This plan holds no tasks of its own. It is the order, the seams, and the reason each one is where it
is.

---

## Tasks

### PR 0 — the plans

- [x] `agent/editable-until-processed`, as it stands: ADR 21, the spec edits it carries, its plan,
      the three plans that follow it and the notes tying them together
- [x] Merge before any code is written, so every implementation branch starts from plans that are on
      `main` and can be linked to

### PR 1 — editable until processed

Depends on PR 0. Branch `agent/editable-until-processed-build`, since the docs branch keeps its name.

- [x] All six phases of [editable-until-processed](editable-until-processed.md), whole
- [x] **Not splittable.** Its phase 3 changes the item's shape on the wire — `revisedInto` for
      `supersededBy` — and the edit route's body, so a merge between the daemon phase and the client
      phase leaves the client reading a field the daemon no longer answers
- [x] Large enough to deserve a real review rather than a skim; `core:co-review` or `core:review`
      before merging — co-reviewed, written up in
      [editable-until-processed-2026-08-24](../reviews/editable-until-processed-2026-08-24.md)
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint` and `pnpm test:stack` green

### PR 2 — the pool says who it is

Depends on PR 1. Branch `agent/pool-identity-and-health`.

- [x] Phase 2 of [client-minted-assets-and-health](client-minted-assets-and-health.md), and the
      `GET /v1/health` half of its phase 3
- [x] Purely additive: new state, one new route, no caller yet. Nothing it touches is load-bearing
      elsewhere, which is why it goes in on its own rather than riding with the asset change
- [x] Its spec edits — http-v1.md's new route, mirror.md's identity claim made true, `CONTEXT.md`'s
      **Pool identity** — land here, not with the asset work
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm test:stack` green

### PR 3 — the uploader mints the asset id

Depends on PR 2. Branch `agent/client-minted-assets`.

- [x] The rest of [client-minted-assets-and-health](client-minted-assets-and-health.md): phases 1,
      3 and 4, and ADR 0022
- [x] **Atomic for the same reason as PR 1**: `POST /v1/assets` is replaced rather than joined, so
      core, the daemon, the client and `tests/seed` move together
- [x] `CONTEXT.md`'s **Asset** amendment lands here
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm test:stack` green

### PR 4 — the store stops being write-only

Depends on PR 3. Branch `agent/durable-client-store`.

- [ ] Phases 1 and 2 of [durable-offline-client](durable-offline-client.md), and ADR 0024
- [ ] Useful alone and visibly so: the outbox survives a reload and drains on boot. Nothing later in
      that plan is needed for this to be worth having
- [ ] The tags in use and the destinations are read back on start here rather than in that plan's
      phase 6, which had conflated them with retention. They depend on the port and on hydration and
      on nothing else, and folding them in is what keeps the port from shipping with methods no
      caller reaches
- [ ] `CONTEXT.md`'s **Hydration** lands here, where hydration is first a thing that happens.
      **Cache** waits for PR 5, where what it holds acquires readers and a lifetime
- [ ] `docs/todo.md`'s write-only-store item is closed here rather than in PR 5: what it asks for —
      a durable adapter, the store read back at start, and a decision about boot draining — is all
      of it this pull request's
- [ ] client.md's ports and hydration paragraphs, and its `Shipped:` entry, describe **only** this —
      the derived surfaces are not here yet and the spec must not say they are
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm test:stack` green

### PR 5 — the cache is read, capped, and checked against the pool

Depends on PR 4. Branch `agent/cache-with-readers`.

- [ ] Phases 3, 4 and 6 of [durable-offline-client](durable-offline-client.md), and ADR 0023
- [ ] Three phases, one review: the cache acquires readers, a lifetime, and a check that it still
      describes the pool it thinks it does. They are separable on paper and were three pull requests
      here until 2026-08-25, but all three are `packages/client` alone — no wire, no daemon, one
      `apps/ui` file between them — and each is small enough that the review ceremony would cost
      more than the review
- [ ] `CONTEXT.md`'s **Cache** lands here
- [ ] sync.md's rebuild question is amended here to say which half is now answered
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm test:stack` green

### PR 6 — a capture with an attachment, offline

Depends on PRs 3 and 4. Independent of PR 5, so it may swap places with it.

- [ ] Phase 5 of [durable-offline-client](durable-offline-client.md)
- [ ] Stays on its own: blobs in the store, a two-step `capture` and `edit`, local bytes resolved in
      place of a URL, and the one real correctness question in the plan — a retry between the `PUT`
      and the `POST` leaving one asset and one item
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm test:stack` green

### PR 7 — the shell's marks

Depends on PRs 5 and 6.

- [ ] All of [shell-offline-marks](shell-offline-marks.md). Three phases, one review: they are one
      idea drawn three times
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint` and `pnpm test:stack` green

---

## How these are worked

- **Spec edits ride with the pull request that earns them**, never as a sweep at the end. Where a
  plan spans several — plan 1 across PRs 2 and 3, the offline plan across PRs 4 to 6 — each carries
  its own `Shipped:` entry describing what actually landed, and the plan's Status becomes
  `In progress` rather than `Done` until the last one is in. A spec that describes the whole plan
  after the first of five merges is the exact failure this project keeps guarding against.
- **Per-phase commits still matter**, even though a squash merge discards them: they are what makes
  a half-finished branch reviewable and what lets one phase be backed out without unpicking the rest.
- **Rebase onto `main` before opening a pull request, never after.** A squash merge rewrites what
  the branch was based on, so a branch that merged `main` afterwards conflicts against history that
  no longer exists — and AGENTS.md forbids force-pushing a branch with an open pull request. Once a
  pull request is open and `main` has moved, merge `main` in and let the squash flatten it.
- **One branch per pull request**, named for what it lands rather than for the plan it comes from,
  since three of them come from one plan.

---

## Unknowns

- **Whether PR 1 is too large to review honestly.** Six phases across core, the store driver, the
  daemon, the client and the shell. It cannot be split without breaking `main` in the middle.
  *Fallback*: land it whole and pay for it in review — a co-review pass rather than a single read.
- **Whether PRs 5 to 8 hold as four.** Settled 2026-08-25: they do not. Reading the code for PR 4
  made the shape clear enough — phases 3, 4 and 6 are one client-only idea drawn three times, and
  they became one PR 5, wider than the fallback this line named. The attachment kept its own pull
  request, being the one piece that crosses into the shell and carries a retry to get right.
- **Whether `pnpm test:stack` in CI stays quick enough to gate seven pull requests.** It spawns a
  daemon per test. *Fallback*: it is CI's time, not a person's, and the alternative is not running it.

---

## Out of scope

The design itself, and every task that implements it. Each plan holds its own; this one holds only
the order they land in and where the seams fall.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Each pull request above is verified by the commands named under it, and by CI, which runs the
full-stack suite on every push. This plan adds no tests of its own.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag. This plan lists no specs of its own: the `Shipped:` entries belong to the four plans it sequences.
