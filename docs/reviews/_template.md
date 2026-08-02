# Review: [Feature / area name]

**Date**: YYYY-MM-DD
**Status**: Open <!-- Open | Partially addressed | Resolved -->
**Scope**: `path/to/...`
**Plan**: `docs/plans/....md` <!-- omit if no plan -->
**Spec**: `docs/specs/....md` <!-- omit if no spec -->

---

## Overall

<!-- One short paragraph: does the implementation match the goal? Call out the most important finding upfront. -->

---

## Bugs

<!-- Real defects — wrong behavior, broken invariants, data loss risk. Each gets its own numbered entry. -->
<!-- If none, write "None." and remove the subsections. -->

### 1. Title

`file.ts:line` — what goes wrong and why. Include a snippet or a cause chain when the failure mode is non-obvious.

```
cause → intermediate state → wrong outcome
```

Fix: one sentence on the correct approach.

---

## Design

<!-- Structural issues that aren't bugs but will cause pain: wrong abstractions, missing states, unclear contracts. -->
<!-- If none, write "None." and remove the subsections. -->

### 2. Title

`file.ts:line` — description and consequence.

---

## Minor

<!-- Inconsistencies, style drift, edge cases that probably won't fire. -->
<!-- If none, write "None." and remove the subsections. -->

### 3. Title

`file.ts:line` — brief note.

---

## Non-issues

<!-- Patterns that look suspicious but are intentional or correct. Recorded so they aren't re-flagged next time. -->

- **Pattern name** — why it's fine.

---

## Resolution

<!--
Add once findings are addressed, and flip **Status** above. One numbered entry per finding,
mirroring its number. Mark each: Fixed / Mitigated / Won't fix (reason).
Until this section exists and **Status** is updated, the findings count as open.
-->

1. **Fixed.** What changed.
