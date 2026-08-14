# A job's subject names what it is about

**Date**: 2026-08-13
**Status**: Todo
**Spec**: `docs/specs/core.md`
**Closed**:

---

## Goal

`Job.subject` says what kind of thing it names as well as which one, across core's types, the store
port, the SQLite driver and every call site — with **no behaviour change whatsoever**. Every
existing test passes untouched except where one constructs a subject, and the mirror, capture and
work paths do exactly what they did before.

**Out of this slice, deliberately**: the `routing-record` variant and the `delivery` job kind. They
arrive in [delivery-machinery.md](delivery-machinery.md), with the code that uses them.

---

## Decisions

Taken 2026-08-13 in the grilling session, recorded as
[ADR 18](../adr/0018-a-jobs-subject-names-what-it-is-about.md).

### Why this lands alone, and first

The union is forced by delivery ([ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md)),
but it touches code that has nothing to do with routing: capture's mirror enqueue, the mirror
runner, `work.claim` and `complete`, the store's job reads, and the index asserting at most one
pending mirror job per item. Mixed into a feature diff, a green suite would prove less than it
looks — a regression in mirroring would be attributable to either half.

### A union with one variant is the point, not an oversight

This plan ships `JobSubject` with a single `item` variant. That is deliberate: the shape is what
changes here, and the second variant arrives with the work that needs it. A reviewer asking why a
one-variant union exists should find this paragraph and ADR 18.

### The item link is bought back, not dropped

`AbandonedWork` keeps a resolved `item` beside the subject. With only the `item` variant it is
merely the subject restated; the join that earns it arrives with delivery jobs. Landing the field
now means the surface's shape does not change again later, and `core.md`'s promise that "what needs
me" is one read holds continuously rather than being broken and repaired.

---

## Tasks

### Phase 0 — Branch

- [ ] `git checkout -b agent/job-subject-union`

### Phase 1 — Types *(no behaviour)*

- [ ] `JobSubject` as a tagged union in `types/domain/work.ts`, with the `item` variant only.
      `Job.subject` takes it
- [ ] `AbandonedWork` carries both `subject` and the resolved `item`
- [ ] `AbandonedPosition` keys on the subject, and stays a total order the store can compare —
      it is `{ at, subject, kind, enrichment? }`, and the `enrichment?` discriminator stays until
      delivery replaces the reason for it
- [ ] Verify: `pnpm typecheck` — expect failures at every construction site, which phase 2 and 3 fix

### Phase 2 — The store *(depends on phase 1)*

- [ ] New migration — never edit an existing one. `jobs.subject` splits into `subject_kind` and
      `subject_id`, both `NOT NULL`, with a CHECK naming the kinds. Existing rows migrate as
      `('item', subject)`, which is what every one of them is
- [ ] Re-key `jobs_one_pending_mirror` onto the pair. This is the index that makes coalescing a
      constraint rather than a convention, so it must keep asserting **at most one pending mirror
      job per item** and not accidentally widen to per-subject-kind
- [ ] `jobs_subject` and `jobs_abandoned` follow onto the pair
- [ ] `rows.ts`, `mapping.ts` and `statements.ts` read and write the pair; `schema.test.ts` stays in
      agreement
- [ ] `abandonedWork` answers both the subject and the item. With one variant these are the same
      id, and the query says so plainly rather than pretending to join
- [ ] Tests: an existing pool with mirror and enrichment jobs migrates with every job still
      claimable and still coalescing; the pending-mirror uniqueness still holds; a claim, an extend,
      a release and an abandon all round-trip the subject
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint`
- [ ] `git commit`

### Phase 3 — Call sites *(depends on phase 2)*

- [ ] `capture.ts` enqueues its mirror job with an item subject
- [ ] `work.ts` — claim, complete, extend, release and the abandoned surface carry the subject
      through
- [ ] `mirror.ts` and the daemon's `mirror/runner.ts`: a mirror job's subject is read as an item.
      The runner reads `lease.job.subject` in two places and both must go through the union rather
      than assuming an id
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint`
- [ ] `git commit`

### Phase 4 — End to end *(depends on phase 3)*

- [ ] `tests/integration/work.test.ts` and `mirror.test.ts` pass unchanged but for subject
      construction. If either needed a behavioural edit, something in phases 1–3 was not a refactor
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint` from a clean checkout
- [ ] `git commit`

---

## Unknowns

- **Whether `AbandonedPosition` keeps `enrichment?` or folds it into the subject.** An enrichment
  job is about an item *and* an enrichment, which is not a subject variant — it is a second axis.
  Keeping it is the conservative read. *Fallback*: leave it; delivery does not need it either way,
  since a delivery job's subject already identifies it uniquely.
- **Whether SQLite will re-create the `jobs` table again.** It has been re-created once already, for
  the foreign key. Splitting a column may or may not need the same dance. *Fallback*: recreate; the
  migration for it is written and the pattern is established.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The property worth testing hardest is that **nothing changed**. The migration is the only place
this plan can lose data, and the coalescing index is the only place it can lose a guarantee — an
index re-keyed one column too wide would silently permit two pending mirror jobs for one item, and
nothing else in the suite would notice.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`.
**Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what
landed and linking back to this plan. No implementation details, no granular tasks. A plan marked
Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
