# Escape steps back in the composer

**Date**: 2026-10-29
**Status**: Done <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/shell.md`
**Closed**: 2026-10-29

---

## Goal

> In the place line `esc` removes the last step of the path (a typed tail, else the last folder taken), and leaving the composer with `esc` asks to discard once anything was entered and leaves at once otherwise.

---

## Tasks

- [x] Create the branch `agent/escape-steps-back-in-the-composer`. _(2026-10-29)_
- [x] `steppedBack` in `lib/path-line.ts`, and `esc` in `PathLine.svelte` using it; an empty line is left to the field. _(2026-10-29)_
- [x] `Discarding.svelte`, asked from the composer's `back` command when a destination, template or rewritten words are held. _(2026-10-29)_
- [x] Tests: `path-line.test.ts`, `PathLine.test.ts`, `Process.test.ts`. _(2026-10-29)_
- [x] `docs/specs/shell.md`: the keys, and a `Shipped:` entry. _(2026-10-29)_
- [x] Commit and open the PR. _(2026-10-29)_

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
