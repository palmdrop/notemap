# Review: task conversion and the heading picker

**Date**: 2026-10-14
**Status**: Resolved
**Scope**: `git diff main..agent/task-conversion`: `packages/output-markdown`, `packages/adapters/destination-{fs,webdav}`, `packages/core` (candidates `given`), `apps/daemon` (`/candidates`), `apps/ui` (composer, template form, candidate cache)
**Plan**: `docs/plans/task-conversion.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/shell.md`

---

## Overall

The branch matches the plan, and every phase is in the code. ADRs 61 and 62 are accepted, and
ADR 26 is marked partly superseded. All three specs have dated `Shipped:` entries that link the
plan. Tests, typecheck and lint pass; `test:stack` was not re-run for this review. The fs guard,
the `given` route checks and the shell's cache key are sound. The one real defect is in `asItem`.
It removes the blank lines between blocks, so a block that changes meaning when it sits directly
under a paragraph line now does. The worst case is `---`, which turns the item's words into a
heading and loses the task checkbox.

---

## Bugs

### 1. Removing blank lines lets later blocks reinterpret the item's paragraph

`packages/output-markdown/src/conversion.ts:97` (`linesOf`), `:69` (join). Every block after the
lead is placed directly under the item's line with no blank line between them. Some blocks mean
something different when they come straight after a paragraph line. Checked against the parser:

```
"Buy milk\n\n---\n\nmore"  →  "- [ ] Buy milk\n  ---\n  more"
  → `---` is a setext underline → item = heading "[ ] Buy milk" + paragraph
  → no task, and a heading inside a list
```

```
"Buy milk\n\n2. two\n3. three"  →  "- [ ] Buy milk\n  2. two\n  3. three"
  → an ordered list not starting at 1 cannot interrupt a paragraph
  → one paragraph "Buy milk 2. two 3. three"
```

An indented code block and an HTML block of type 7 also cannot interrupt a paragraph, so they get
absorbed the same way. A line of only `===` turns the line above it into an `<h1>`. ADR 61 accepts
that paragraphs merge. It does not accept the item turning into a heading. The `---` case is
plausible in real captures, since people use it as a divider.

Fix: give `thematicBreak` no lines (a divider has no place inside an item). Where a block cannot
interrupt the line above it, keep a blank line before that block alone and accept a loose list in
that rare case, or flatten it into the paragraph on purpose. Add a test for each case.

---

## Design

None.

---

## Minor

### 2. A task joins a list with a different marker as a separate list

`packages/output-markdown/src/sections.ts:31` (`after`). When the section ends in a `*`, `+` or
ordered list, the `- ` item is joined with one newline. It then starts a second tight list right
after the first, instead of joining it. Checked: `* a\n* b\n- [ ] x` parses as two lists. Most
renderers show them as one block, so this looks right but is not. Either note it in the
output-markdown README, or have `asItem` take the marker from the list it lands after. The second
option is a bigger change than this review should push for.

### 3. On webdav, a heading browse on a folder path without a trailing `/` depends on the server

`packages/adapters/destination-webdav/src/candidates.ts:49`. `headingsNote` only filters out a
path ending in `/`. fs handles `notes` (a directory) through `EISDIR` and returns no headings.
webdav sends `GET` to the collection. Depending on the server, that returns an HTML index (parsed
as markdown, giving no headings) or an error (`unreachable`, shown under the field). The plan
says "a folder path" offers no entries on both kinds, but the webdav test only covers `notes/`.
Fix: `look()` first, or treat a collection response as `NO_HEADINGS`, and test `notes`.

### 4. The `path` literal is written in two places

`packages/output-markdown/src/headings.ts:20` reads `given["path"]`, and
`capabilities.ts:98` declares `[ASKABLE_GIVEN_FIELD]: ["path"]`. Renaming the field in one place
silently empties the picker. Use one constant.

### 5. The heading picker asks once per change of `path`, with no debounce

`apps/ui/src/components/routing/CandidateBrowser.svelte:207`. The comment on `givenKey` covers
keystrokes in the heading field. Every change to `path` still sends a request, which reads a file
on fs and makes a `GET` on webdav. In practice the composer only draws the field while the
forecast is not `create`, which limits this. The template form has no such limit. Each partial
path is also kept in the cache. Cheap for now.

### 6. An empty body produces `- [ ]`, which is not a task

`conversion.ts:70`. With no blocks and no hashtags, `trimEnd` removes the space after `[ ]`, and
GFM then reads the item as the literal text `[ ]`. Probably unreachable, since a delivery always
renders something. Mention it only if a body can be empty.

*Corrected while fixing:* this is reachable, and it is a bug rather than a minor issue.
micromark's GFM task extension reads `[ ]` as a checkbox only when something follows it on the
same paragraph. So a `task` of any body that opens with a list or a fence (the plan's "item with
no words" case) is not a task either.

---

## Non-issues

- **Paragraphs in a multi-paragraph capture merge into one** — accepted in ADR 61 as a lossy
  conversion, and core.md says "with no blank lines".
- **The fs guard's check-then-rename window** — documented in the fs README and in the plan's
  unknowns. Not worked around, on purpose.
- **`effectiveOf` now gives a hidden field `undefined` rather than its inherited value or
  default** — this is what keeps `trigger tags` hidden behind a hidden `frontmatter`. No other
  schema uses `x-notemap-when` today, so `DestinationForm` behaves the same.
- **The composer drops `as` when it forecasts `create`** — recorded as an open question in shell.md.
- **The field is titled `as`, the argument is named `conversion`** — shell.md uses titles and
  core.md uses names, the same way `under`/`heading` already works.
- **`given[path]` rather than `given.path`** — recorded in the amendment to ADR 62.
- **webdav maps `RenderingFailed` to `rejected` with no explicit `instanceof`** — its default
  mapping is `rejected`, and `destination.test.ts` covers an unknown conversion.

---

## Resolution

1. **Fixed.** `asItem` drops dividers. Before each block it parses the continuation with and
   without that block. Where the block would stop being itself, a blank line goes before it:
   a numbered list not starting at 1 or indented code under words, and words under a list or a
   quote. Prose running on into prose still merges, as ADR 61 accepts. core.md and the
   output-markdown README say so.
2. **Fixed.** An item landing straight after a `*` or `+` list takes that list's bullet and joins
   it. Nested bullets are left alone. After a numbered list it starts its own list, after a
   blank line. `insertUnder` now returns `{ file, inserted }` so the recorded output and the
   webdav preview show the bullet that landed.
3. **Fixed.** webdav sends a `PROPFIND` at depth 0 before the `GET`. A collection, with or without
   its `/`, offers no headings and is never read.
4. **Fixed.** `HEADING_NOTE` in `headings.ts`, used by the schema and by `headingsNote`.
5. **Won't fix.** In the composer the field only shows while the forecast is not `create`, which
   already limits the requests.
6. **Fixed.** A `task` with nothing on its own line (no prose and no hashtags) is a
   `RenderingFailed`, so the delivery is `rejected`. `list-item` is unchanged, since a bare `-`
   with content beneath it is valid.
