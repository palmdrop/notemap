# A trigger tag after a template route, and no trigger tags in the composer

**Date**: 2026-10-29
**Status**: Done
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/shell.md`
**Closed**: 2026-10-29

---

## Goal

Routing from the composer under a template that asks for an argument no longer ends in a refused
tag, and the composer's tag chooser offers no trigger tag to add. A trigger tag typed into it takes
its template into the decision rather than routing.

---

## Tasks

- [x] Create branch `agent/trigger-tag-after-a-template-route` _(2026-10-29)_
- [x] Core: `triggerFor` skips the firing where the template already filed the item; the transaction re-checks and the tag goes round again with the firing if the record was withdrawn meanwhile _(2026-10-29)_
- [x] Core and integration tests _(2026-10-29)_
- [x] Amend core.md, http-v1.md, ADR 63 _(2026-10-29)_
- [x] Commit core change _(2026-10-29)_
- [x] UI: ComposerTags offers no trigger tag; one typed in takes its template in `where`
      (`ontemplate`), replacing `onasks` and `onfired` _(2026-10-29)_
- [x] UI tests, shell.md _(2026-10-29)_
- [x] Commit UI change _(2026-10-29)_

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
