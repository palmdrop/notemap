# 15. The mirror record is authoritative; the markdown is a rendering

**Date**: 2026-08-11
**Status**: Accepted — supersedes the file-format decision in
[ADR 1](0001-pool-is-a-database.md); the rest of ADR 1 stands.

---

## Context and problem statement

[ADR 1](0001-pool-is-a-database.md) decided the mirror is "CommonMark + YAML frontmatter with a
state sidecar" — the capture in the `.md`, its state in the `.json` — and that a pool must be
rebuildable from the mirror alone. That was written before the payload model existed. A payload
is now `(type, content, metadata, assets)` where `content` is an open-ended JSON object validated
against a per-type schema, and only some payload types have a prose body at all: a web annotation
is JSON-LD, a walk is JSON Canvas, a table is CSV, a board is a typed blob.

There is no general way to round-trip an arbitrary JSON object through a markdown body. So which
file carries losslessness, and what is the markdown for?

---

## Decision drivers

- **Losslessness is the mirror's job.** A rebuild that works for text notes and loses annotations
  is not a safety net.
- **Readability is most of why the mirror exists.** A folder of JSON is technically lossless and
  useless to a person who has lost notemap, which is the situation the whole feature is for.
- Those two wants are in tension only while one file has to serve both.
- **The round-trip property test is what keeps the mirror honest** (ADR 1: an untested mirror
  "would rot silently and be discovered years too late"). Whatever carries losslessness should be
  cheap enough to test exhaustively.
- A payload type's prose is not the mirror's knowledge. Core knows a payload's schema and nothing
  about which part of it a human reads.
- **A timestamp is an instant, not a spelling** ([core.md](../specs/core.md)), so any byte
  comparison of mirrored state needs one canonical spelling per instant.

---

## Considered options

1. **Markdown authoritative where the payload type allows it** — a type declares which content
   field is its body; types without one mirror as JSON only.
2. **JSON only** — one machine-shaped file per item, no markdown at all.
3. **Markdown only** — the whole payload and state as YAML frontmatter above a rendered body.
4. **JSON authoritative, markdown a rendering** — the two files divide by audience.

---

## Decision outcome

Chosen: **option 4.** The files divide by *audience* rather than by capture-versus-state.

- The **mirror record** is the `.json`: one item's complete durable state — payload, metadata,
  tags with attribution, archive state, revision link, resolved assets with their filenames,
  artifacts and corrections, routing records. Rebuild reads only this.
- The **rendering** is the `.md`: frontmatter carrying identity and provenance, plus a body
  produced by a host-wired renderer. **Nothing ever parses it.**

That last sentence is the whole point, and it is worth stating loudly because "mirror" implies
the opposite: a renderer may be lossy, opinionated and pretty. It may drop fields, reorder,
summarise, or emit a dialect suited to wherever those notes were destined. Readability stops
being constrained by round-tripping, which is what made the original split unworkable.

**Core owns the record; the driver owns the bytes.** Every field in a record is domain
vocabulary, and losslessness is a domain guarantee stated in
[core.md](../specs/core.md)'s acceptance criteria, so core defines the record, its canonical
serialisation — stable key order, one spelling per instant — and its parse. The round-trip test
becomes a pure in-memory property test over generated pools, which is the difference between one
that runs a thousand cases on every commit and one that runs five against temp directories. Any
driver storing records faithfully is lossless by construction. The driver keeps paths, layout,
atomicity, compression and the entire rendering. This is the seam the repo already uses: core
defines `ItemRecord`, and store-sqlite decides that timestamps are epoch milliseconds.

The cost of a text note's content appearing in both files is accepted. It is small, and it is
what buys a mirror that is simultaneously rebuildable and readable.

Two rules follow from the split and are recorded in [mirror.md](../specs/mirror.md):

- **The record is written and flushed before the rendering is attempted**, so a bug in
  host-supplied renderer code cannot keep material out of the mirror.
- **Frontmatter is the driver's**, emitted from the record, not the renderer's. Provenance
  ([standards.md](../standards.md#identity--provenance-the-cross-app-glue)) is a standing
  guarantee, not something a carelessly written renderer may drop.

### Consequences

- **Good** — losslessness holds for every payload type, present and future, with no per-type
  work. A new payload type mirrors correctly the day it is added.
- **Good** — the round-trip test gets cheap enough to be a real property test, which is the
  mechanism ADR 1 relies on to stop the mirror rotting unnoticed.
- **Good** — rendering becomes a free surface. Renderers can improve, be replaced, or emit
  vault-flavoured markdown, with no risk to recoverability and no migration.
- **Bad** — a text note's content is on disk twice. Accepted; it is bytes, and the mirror is
  already not the compact representation.
- **Bad** — the readable half can silently drift from the record if a renderer is wrong, and
  nothing detects it, because nothing reads it. Verify checks that the file *exists*, not that it
  is faithful.
- **Neutral** — the `.md` is no longer a fallback source of truth. Someone hand-editing a mirror
  file to fix a typo is editing a rendering; deep verify will report the record untouched and
  repair will overwrite the rendering.

---

## Pros and cons of the options

### Markdown authoritative where the type allows it

- **Good** — no duplication, and the file a human reads is the file that rebuilds.
- **Bad** — two classes of item behave differently on disk, for a reason invisible from the
  folder. Rebuild acquires a markdown and YAML parser, and the mirror's read surface — the thing
  ADR 1 minimised on purpose — grows.
- **Bad** — YAML type coercion has to be pinned down exactly, forever, for the round trip to
  hold.

### JSON only

- **Good** — trivially lossless, nothing to keep in sync, one file per item.
- **Bad** — gives up the outcome the mirror exists for. "Uninstalling notemap costs nothing but
  the tooling" is false if what remains needs tooling to read.

### Markdown only, payload in frontmatter

- **Good** — one file, nothing duplicated, nothing to keep consistent.
- **Bad** — a JSON-LD annotation or a canvas becomes a wall of YAML above a short body, so the
  readable format is at its worst exactly where it is largest.

---

## More information

Decided in the grilling session of 2026-08-11, which also settled write triggers, coalescing,
naming, purge, rebuild and verify: [mirror.md](../specs/mirror.md).

Revisit if a payload type appears whose content is genuinely large and genuinely prose — a long
document rather than a note — where storing it twice stops being negligible. The escape hatch is
a record that references the rendering for one declared field rather than duplicating it, which
narrows losslessness to that field and does not reverse this decision.
