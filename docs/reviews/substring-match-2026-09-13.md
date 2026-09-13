# Review: Substring matching (PR #59)

**Date**: 2026-09-13
**Status**: Resolved
**Scope**: `apps/ui/src/lib/matching.ts`, `candidate-list.ts`, `path-line.ts`, `DestinationLine.svelte`, `docs/specs/shell.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

The rule is in one place and the four surfaces read it, which is the shape the PR set out to
get. The problem is what happens downstream of the wider hit list: both completion functions
take a common prefix over *every* hit, and a within-hit has no head in common with a prefix-hit,
so `⇥` now completes less than it did. `re` against *Reading*, *Reading Notes*, *Field
Recordings* used to complete to `reading`; it now completes to nothing. That is a regression on
the key the spec describes most carefully, and it is the finding to fix first. The rest is one
resolve hazard the PR already names and one spec claim wider than the code.

---

## Bugs

### 1. A within-hit poisons the common prefix, so `⇥` stops completing typed stems

`apps/ui/src/lib/candidate-list.ts:94` and `apps/ui/src/lib/path-line.ts:247` — `completed` and
`completionOf` compute `commonPrefix` over all of `narrowed`/`matching`, which now includes
within-hits. A within-hit's head is unrelated to the typed stem, so the shared prefix collapses to
`""` (or to something shorter than `typing`) whenever any within-hit is present.

```
entries: Reading / Reading Notes / Field Recordings, typed "re"
main:    hits = [Reading, Reading Notes]            → shared "reading"     → ⇥ completes
branch:  hits = [Reading, Reading Notes, Field Recordings] → shared ""     → ⇥ completes nothing
```

Verified by probe: `completed(entries, "re")` is `undefined` on the branch; `completionOf` the
same. In `CandidateBrowser` the key falls through to `walk`, which happens to land on *Reading*
but flips the line into filter mode; in `TagSet` it falls through to `walk(1)`, which only moves
the highlight — the draft is not completed at all. The spec's "`⇥` completes what was typed as far
as the offer agrees" no longer holds for any stem that is also a substring of a third name, which
for two-letter stems is nearly always.

Fix: complete over the head matches only. Several hits → `commonPrefix` of those whose name
matches at `"prefix"`; one hit (of either kind) → that one outright, as now. `search` could return
the split it already computes, or `match` can be re-applied to the hits.

---

## Design

### 2. `resolved` now takes a whole typed slug to a channel that merely contains it

`apps/ui/src/lib/candidate-list.ts:155` — `soleMatch` goes through `narrowed`, so a committed line
that is a substring of exactly one listed title resolves to that title's value. The PR names this
and asks. My view: keep the sole-match resolve prefix-only here. The reason the resolve is safe on
commit — "enough of a title that only one still matches" — is a *stem* argument: a person who typed
`read` and pressed `⏎` was writing a name. A person who typed `notes` and pressed `⏎` may have
been writing a slug for a channel the page did not list, and *Reading Notes* silently taking the
note is a wrong delivery with no ask in between. The destination line is different and fine as
is: its typed text means nothing on its own, so resolving a sole within-hit there loses nothing.

### 3. The spec now says "wherever a line narrows a list"; the used-before list still narrows by prefix

`docs/specs/shell.md:792` against `apps/ui/src/lib/path-line.ts:369` — `continuing` filters the
remembered places by `startsWith`, and `UsedBefore.svelte:35` draws that list as the line is
typed. The PR carves out the *ghost* (`continuationOf`) and that is right — a continuation must
continue. The list beneath it is a list a line narrows, and `↑↓` replaces the line outright, so
substring would work there and would be useful (`daily` finding `notes/2026/daily`). Either extend
`continuing` or name the exception in the spec paragraph; as written, doc and code disagree.

---

## Minor

### 4. The tree's filtered level re-orders under the caret

`apps/ui/src/lib/path-line.ts:136` — `rowsOf` filters the caret's level through `matching`, which
now ranks, so a sibling jumps above the others the moment the stem hits its head and drops back
when the next character makes it a within-hit. The tree is "shown rather than walked" and draws
siblings in the destination's order everywhere else; a level that shuffles while typed into is
the one place that stops being true. Probably fine; noting it because the spec's ranking sentence
was written for the flat browse.

### 5. `DestinationLine.svelte:48` comment reads worse than the line it replaced

"several are a guess, and taking one of them would be that" — the original said what the several
*were*; this one says what taking one would be, twice.

### 6. No plan file for the branch

`agent/substring-match` has no `docs/plans/substring-match.md`. The todo entry stood in for one.
Fine for a change this size if that is the convention; saying so here so it is a decision.

---

## Non-issues

- **Ghost stays prefix and case-sensitive** — `continuationOf` draws text still to come; a
  within-hit cannot be drawn after the caret.
- **A sole within-hit completes outright on `⇥`** — `ject` → `projects/`. That is what one match
  has always done and the spec says an only match is taken; it is not the same hazard as #2
  because `⇥` is a deliberate press on a line still being edited.
- **`narrowed` trims and `matching` does not** — pre-existing, and a path segment's whitespace is
  the segment's.
- **`match(name, "")` is `"prefix"` for everything** — unreachable through `search`, which
  short-circuits on the empty line.

---

## Resolution

1. **Fixed.** `heads` in `matching.ts`; `completed` and `completionOf` take the common prefix over head
   matches only. Tests for `re` → `reading` and `not` → `notes`.
2. **Fixed.** `soleMatch` goes through `heads`; a line only the middle of a title holds is left alone.
3. **Fixed.** `continuing` reads the rule; the ghost stays prefix. Spec names the used-before list.
4. **Won't fix.** Left as is by the reviewer's call.
5. **Fixed.** Comment removed, with the rest of the diff's restating comments.
6. **Won't fix.** No plan needed for a change this size.
