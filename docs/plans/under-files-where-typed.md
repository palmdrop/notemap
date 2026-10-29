# `under` files where it was typed, and `↑↓` start where the line is

**Date**: 2026-10-29
**Status**: Done
**Spec**: `docs/specs/shell.md`, `docs/specs/core.md`
**Closed**: 2026-10-29

---

## Goal

A heading half-typed into `under` is delivered as typed rather than as the listed heading it
prefixes, and the first `↑↓` on the place line lands in the level the caret is in.

---

## Background

The two composer findings [path-picking-and-enter](path-picking-and-enter.md) left in the todo.

**`under`.** Leaving or committing a browsed field resolved the head of a title no other title
begins with to that title's value. That is right for an are.na channel, which may only name a
channel that exists and is typed by its title. It is wrong for a heading: the markdown kinds write
a heading that is not there, so `Note` beside `## Notes` is a new heading, and was filed under
`## Notes`. `⌘/ctrl+⏎` settles and routes in one press, so the swap was never seen.

**`↑↓`.** The first press landed on the top row of the whole tree, so after taking
`projects/notemap/` the walk started at `journal/`, above the folder just taken.

---

## Decisions

1. **The head of a title resolves only on a field marked `x-notemap-offered-only`.** The pitch
   proposed a new keyword the kind publishes on the field. `x-notemap-offered-only` already says
   exactly this ("may hold only something the destination already has"), are.na already marks its
   channel with it, and the heading field does not, so no adapter changes.
2. **A heading is found without case, in the splice.** `next` files under `## Next`: a
   near-duplicate heading is worse than the case difference. First settled in the shell, by
   rewriting the field on leaving it; review showed that rewrote values nobody touched, and that a
   trigger tag, which never passes through the shell, still wrote the duplicate. The listing
   collapses headings that differ only by case, since the splice takes the first.
3. **The first `↓` lands on the first row of the caret's level, the first `↑` on its last.** That
   is the folder just taken, or what the typed segment narrowed to. A level with nothing drawn (an
   empty folder, one still to be made, a segment nothing matches) lands on the deepest folder the
   line runs through.
4. **A truncated answer still resolves the head of a title.** Raised in review: on a truncated
   are.na page, a slug typed for an unlisted channel can resolve to a listed one it prefixes.
   Gating on `truncated` was weighed and refused: an account with more than one page of channels
   answers truncated every time, so it would switch the resolution off for exactly the accounts
   that need it.

---

## Tasks

- [x] Create branch `agent/under-files-where-typed` _(2026-10-29)_
- [x] `resolved` takes `offeredOnly`, gating head resolution _(2026-10-29)_
- [x] `insertUnder` and `headingCandidates` compare headings without case _(2026-10-29)_
- [x] `CandidateBrowser` takes `offeredOnly`; the composer and the template form pass the field's
      _(2026-10-29)_
- [x] `walkStart` in `path-line.ts`, used by `PathLine` for the first `↑↓` _(2026-10-29)_
- [x] Tests: `candidate-list`, `CandidateBrowser` settling, `path-line`, `PathLine` arrows,
      `sections`, `headings` _(2026-10-29)_
- [x] `shell.md`: amend the committed-line rule and the `↑↓` rule, add the Shipped entry
      _(2026-10-29)_
- [x] `core.md`: Shipped entry for headings found without case _(2026-10-29)_
- [x] `docs/todo.md`: tick the composer findings _(2026-10-29)_
- [x] `git commit` _(2026-10-29)_

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
