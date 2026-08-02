# Plan title

**Date**: YYYY-MM-DD
**Status**: Todo <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/<relevant-spec>.md` <!-- omit if there is no spec -->
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> One specific, testable sentence: what does "done" look like?
> Vague goals prevent closure. If the goal shifts significantly, update it — but treat that as a signal to question scope.

---

## Tasks

- [ ] Task A
- [ ] Task B
- [x] Task C _(YYYY-MM-DD)_
- [-] Task D _(dropped — reason)_

<!--
Task states:
  [ ] pending
  [x] done — add completion date
  [-] dropped — add brief reason; do not silently delete

Items can be added, removed, and reshaped as the plan evolves.
Priority is decided at runtime, not encoded here. Rough ordering signals relative importance.

Scope creep warning: new items should serve the goal above. If they don't, they belong in a separate plan.

Group tasks in numbered phases for larger plans, and wherever implementation order matters.

The first task should always be to create a branch named after the plan.
The last task of each phase should always be a `git commit` of that phase's work.
-->

---

## Testing

<!-- Outstanding notes on testing. Always include the sentence below; add more only if necessary. -->

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

<!-- Always keep the three statements below at the bottom of the plan. -->

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
