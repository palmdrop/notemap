# The filesystem destination

**Date**: 2026-08-13
**Status**: Done
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`
**Closed**: 2026-08-14

---

## Goal

An item routed from `/v1` lands as a file in a folder on disk — a new note under a filename the
person chose or the adapter derived, or appended into an existing one under a heading — with its
tags in frontmatter and its assets written beside it under the names they were uploaded with. A
path that escapes the configured root is refused rather than written.

**Out of this slice, deliberately**: the Obsidian dialect proper — `[[wikilinks]]`, `![[embeds]]`,
`.canvas` walks — which `standards.md` describes and which wants a real vault to test against. This
adapter emits CommonMark with YAML frontmatter and nothing vault-specific. Also out: routing rules,
templates and on-route editing, all of which are `todo.md`'s.

---

## Decisions

Taken 2026-08-13 in the grilling session.

### Two capabilities, and who names the file

`create-file` targets `{ directory, filename? }` and `append-to-file` targets `{ path, heading? }`,
which is `core.md`'s "filesystem destination including its append-to-an-existing-file form".

The filename is optional rather than required or absent. A person looking at an item they are
filing often wants to name the note; a person clearing a queue does not. So the adapter derives one
when none is given — and the derivation is weak, because **the domain has no title**. First line of
the text, sanitised and truncated; the item id otherwise. `core.md` now carries this as an open
question, since a title is plausibly an artifact an enrichment could produce.

Append **creates the file when it is missing**. The motivating case is a daily note that does not
exist until something is filed into it, and `core.md`'s phrase names the shape of the operation
rather than asserting a precondition.

### The renderer is this adapter's, not the mirror's

`mirror-fs` has a `Renderer` over `MirrorRecord`. This one renders a `Delivery`, so it could not
share the type even if it wanted to — and it should not want to. `standards.md` is explicit that
different sinks emit different dialects from the same item, and the mirror's rendering is for
somebody who no longer has notemap, which is a different reader than a vault.

### An unwritable destination is `unreachable`, and so retries

A missing root and a permission error both surface as an errno, and their honest readings differ —
an unmounted drive comes back, a permission bit does not. They are reported as `unreachable`
anyway, so the delivery retries.

The asymmetry is what decides it. A permission error wrongly retried is bounded by
`maxAttempts` and ends up abandoned on the surface a person reads, which is where it was going
regardless. An unmounted vault wrongly abandoned is a decision thrown away for a drive that was
about to be plugged back in. Only one of those two mistakes is self-correcting.

`ENOENT` on the root, `EACCES` and `EPERM` therefore report `unreachable`. Errors about the
*target* rather than the root — a traversal, a file that already exists — stay `rejected`, since
retrying cannot change them.

### Traversal is the adapter's to refuse, and reports `rejected`

Core cannot check a path, because a path is not a domain concept — a board destination has none.
The adapter resolves the target against its configured root and refuses anything that escapes.
Reporting it as `rejected` rather than `unreachable` is load-bearing under
[ADR 17](../adr/0017-delivery-is-asynchronous-and-retried-on-evidence.md): `rejected` is abandoned
on the first attempt, which is right, where `unreachable` would retry a path that will never become
legal.

Because `route` attempts once inline, the person learns immediately.

---

## Tasks

### Phase 0 — Branch

- [x] `git checkout -b agent/destination-fs` *(2026-08-14)*

### Phase 1 — Write the wire down *(blocks phase 4)*

- [x] `http-v1.md`: listing destinations and their capabilities, routing an item, reading its
      routing records, cancelling a pending delivery. A routing response may name a delivery that
      has not happened — say so, since a client that assumes a record means arrival will be wrong
      exactly when a destination is down *(2026-08-14)*
- [x] The refusal-to-status table gains `PreparationRefusal` and `AttemptFailure`'s kinds. The
      status rule already written decides most of them: `422` for understood-and-declined,
      which is what an undeclared capability and an unaccepted payload type are *(2026-08-14)*
- [x] Verify: `pnpm lint`; every refusal code in the table has exactly one status *(2026-08-14)*
- [x] `git commit` *(2026-08-14)*

### Phase 2 — The adapter *(depends on phase 1 only for the refusal names)*

New package `packages/adapters/destination-fs`, following the conventions `mirror-fs` and `blob-fs`
set.

- [x] `describe()`: the two capabilities, their accepted payload types and their target schemas *(2026-08-14)*
- [x] Path resolution against the configured root, refusing anything that escapes it — including
      absolute targets and symlinks that leave. Resolve and compare, rather than pattern-matching
      for `..` *(2026-08-14)*
- [x] `create-file`: render, write atomically through a temporary file and a rename within the root,
      the way `mirror-fs` writes. Derive the filename when the target names none; refuse rather than
      overwrite when the file exists, since the destination is somebody else's data *(2026-08-14)*
- [x] `append-to-file`: read, insert under the heading or at the end, write back atomically.
      Creates the file when missing. **Not atomic against a concurrent editor** — `standards.md`
      says one writer per file, and this adapter is it, but a person with the vault open is outside
      that promise and the README must say so *(2026-08-14)*
- [x] Assets: write each `DeliveredAsset` beside the note under its own filename, streaming rather
      than buffering, resolving collisions within one capture. A capability that renders no asset
      opens no stream *(2026-08-14)*
- [x] The renderer: CommonMark body, YAML frontmatter carrying the tags and the capture time.
      Payload types with no renderer fall back to a fenced JSON block, as `mirror-fs` does *(2026-08-14)*
- [x] The pointer answered on success is the path the note landed at, relative to the root *(2026-08-14)*
- [x] Tests: a note lands with its frontmatter; an append lands under its heading and creates a
      missing file; a traversal target is `rejected` and writes nothing; an existing file is not
      overwritten; assets land under their uploaded names, including two sharing one; a capture
      whose bytes are not valid UTF-8 round-trips *(2026-08-14)*
- [x] Verify: `pnpm typecheck && pnpm test && pnpm lint` *(2026-08-14)*
- [x] `git commit` *(2026-08-14)*

### Phase 3 — The daemon wires it *(depends on phase 2)*

- [x] `[[destinations]]` in the config: an id, a kind, and a root. `config.example.toml` and the
      daemon README with it, including the concurrent-editor caveat *(2026-08-14)*
- [x] Wire the adapters onto `createPool`. Duplicate ids throw at construction, which
      [delivery-machinery.md](delivery-machinery.md) built *(2026-08-14)*
- [x] A delivery runner beside the mirror runner and the sweep, claiming `delivery` jobs and driving
      them. It is the same shape as the mirror runner and should be able to share it if the seam is
      clean; a second copy of the drain loop is a smell worth resisting *(2026-08-14)*
- [x] Verify: `pnpm typecheck && pnpm test && pnpm lint` *(2026-08-14)*
- [x] `git commit` *(2026-08-14)*

### Phase 4 — `/v1` *(depends on phases 1 and 3)*

- [x] The destination, routing and cancel routes *(2026-08-14)*
- [x] The OpenAPI document, checked in and so appearing in this commit's diff *(2026-08-14)*
- [x] Tests: routing to a configured destination returns a delivered record and a pointer that
      names a file that exists; routing to a directory the daemon cannot write is refused with the
      destination's own detail; an undeclared capability is refused without touching the disk *(2026-08-14)*
      — with one substitution: a directory the daemon cannot write is `unreachable` under the
      decision above, so it answers a **pending** record rather than a refusal, and what is tested
      as refused-with-the-destination's-detail is a traversal
- [x] Verify: `pnpm typecheck && pnpm test && pnpm lint` *(2026-08-14)*
- [x] `git commit` *(2026-08-14)*

### Phase 5 — End to end *(depends on phase 4)*

- [x] Integration test: capture text and an image, route both to a temporary vault, drain, and find
      the notes, the frontmatter and the image bytes on disk — with the pool's routing records, the
      mirror and the destination all agreeing *(2026-08-14)*
- [x] Route an item whose destination root has been made unwritable, watch it queue and retry, make
      it writable, drain, and find it delivered *(2026-08-14)*
- [x] Verify: `pnpm typecheck && pnpm test && pnpm lint` from a clean checkout *(2026-08-14)*
- [x] `git commit` *(2026-08-14)*

---

## Unknowns

- **What frontmatter keys a tag becomes.** `standards.md` describes a weighted-aspect form for the
  fragment sink that this adapter is not. *Fallback*: a plain `tags:` list; widening it later is
  additive. **Taken**: a plain `tags:` list, beside the mirror's own vocabulary — `id`,
  `capture_source`, `payload_type`, `captured_at`, `updated_at`, `wasAttributedTo` — plus
  `derived_from` as a `urn:commons:item:` URI, which is the term `standards.md` asks of anything
  that leaves.
- **Whether the derived filename is good enough to live with.** It will be ugly for images and
  anything non-text. *Fallback*: it is one function, and the open question in `core.md` names the
  real fix. **Answered as expected**: it is one function, `filename.ts`, and it is ugly for a
  capture with no prose — that gets the item id.
- **Whether the delivery runner can share the mirror runner's loop.** They differ in what `perform`
  does and in nothing else, as far as this plan can see. *Fallback*: copy it, and extract on the
  third caller rather than guessing the seam from two. **It can**: `work/runner.ts` holds the
  claiming, the one-attempt-per-drain guard, the single-flight drain and the timer, and takes a
  `perform`. The fallback was not needed.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The properties worth testing hardest:

- **Nothing escapes the root.** The one property in this slice whose failure writes to a path
  somebody else owns. Test absolute targets, `..` sequences, and a symlink pointing out.
- **Nothing is overwritten.** The destination holds a person's own files, and this adapter is a
  guest in it.
- **A partial write is never visible.** A crash mid-delivery must leave the previous file or the
  new one, which is why creation goes through a rename.
- **Assets keep their names.** The whole point of ADR 13, now crossing one more boundary.

---

## Notes

Implemented 2026-08-14 on `agent/destination-fs`.

Two things landed differently from what is written above, both deliberate:

- **A file is created with `link`, not a `rename`.** The plan said "the way `mirror-fs` writes",
  and the mirror renames because it owns its files. This adapter is a guest in somebody's vault,
  and rename replaces its target silently. `link` refuses a name that is taken *and* leaves the
  file whole or absent, so the two properties the plan ranks second and third come from one call
  rather than from a check racing a write.
- **Phase 4's "a directory the daemon cannot write is refused"** is not what the decision above
  says. An unwritable directory is `unreachable`, so it answers a **pending** record; the test that
  asserts a refusal carrying the destination's own detail uses a traversal instead.

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`.
**Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what
landed and linking back to this plan. No implementation details, no granular tasks. A plan marked
Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
