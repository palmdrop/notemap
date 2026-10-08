# 57. A capture can be routed as its attachments alone

**Date**: 2026-10-08
**Status**: Accepted. Narrows the asset-naming half of the retry promise
[ADR 41](0041-a-delivery-that-cannot-be-confirmed-may-duplicate.md) records for the file kinds,
for one capability; ADR 41 otherwise stands.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A capture may carry any number of files of any kind since 2026-10-07. A PDF attached to a capture
reaches a vault only inside a note: the file kinds write the note and put its assets beside it,
named `paper-3fa2c1d0.pdf` so a retried delivery lands on the copy it already wrote. Filing the PDF
into a library folder, with no note and under its own name, has no route.

How does a delivery carry a capture's attachments and nothing else, and how does a surface offer
that without knowing a kind by name?

---

## Decision drivers

- **Core holds no list of capabilities**, and the shell knows none by name beyond what it settles
  the typed line on. What a capability is has to be said in its own schema.
- **A retry cannot duplicate** on either file kind. Whatever names the files has to keep that.
- **A name taken by another file must not stop the routing.** A library folder fills with
  `paper.pdf`s.
- **A file nobody links to is read by its name**, so a digest in it is a cost a note's attachments
  never paid.

---

## Considered options

1. **A fourth capability, `place-assets`**, whose arguments are a folder and the folder mode, and
   which says what it carries with a schema annotation.
2. **An argument on `create-or-append`**, `carry: "everything" | "attachments"`.
3. **A rewrite with no words**, so the note renders as its attachment links alone.

And for the names:

- **a.** The digested name the note's assets get.
- **b.** The uploaded name, refused where it is taken.
- **c.** The uploaded name, then `-1`, `-2`, … where it is taken by different bytes.

---

## Decision outcome

Chosen: **Option 1, with names by c.**

`filesystem` and `webdav` declare `place-assets`. Its arguments are `directory`, marked
`x-notemap-path: "folders"`, and the folder mode. Every asset the payload references is written
into that folder and no note is. A capture whose payload references none is **rejected**: there is
nothing to deliver, and no later attempt finds more. Its words, tags and artifacts go nowhere,
which is what was asked for, so the output does not confess them.

**The capability says what it carries** with `x-notemap-carries: "assets"` at the root of its
arguments schema. Core never reads it. A surface that offers "attachments only" finds the
capability by the annotation, so a third kind that can do the same thing gets the gesture by
saying so.

**Names walk.** An asset wants the name it was uploaded with, made one safe segment. Where that
name is free it is written. Where it holds the same bytes, the asset has already landed and nothing
is written. Where it holds different bytes, the walk tries `stem-1.ext`, `stem-2.ext`, and so on.
"The same bytes" is the asset's blob digest against the SHA-256 of the file there, read only where
the sizes match. Two assets of one delivery that want one name walk the same chain, the second
seeing what the first claimed. A claim is matched without case or Unicode form, as a
case-insensitive volume matches names, so `Scan.pdf` and `scan.pdf` from one capture land as two
files there too. A file gone between being seen and being read leaves its name free.

A retry walks the same chain and stops at the copy the last attempt wrote, so it writes nothing
twice. The kind's promise stands: **a retry cannot duplicate.** The create is still conditional,
so a file landing between the walk and the write loses the delivery that attempt. It is
`unreachable` and **retried**, not `rejected`: the next attempt walks past whatever took the name,
or finds its own copy there. Rejecting it would abandon a delivery whose earlier files had already
landed.

**The pointer is the folder**, `library/`, the path its marked field names, which is what
`x-notemap-path` already promises. The root names no folder, and its pointer is absent. The
**output** is the placed paths, one a line, as `text/plain`, so the record says what went under
which name. The output note says which were already there. A preview walks without writing, and
**without reading**: it is asked again each time a decision settles, so a file of the same size is
taken for the same bytes and one of no known size for different ones. It answers the names a
delivery would most likely choose, which is indicative, as every preview is.

### Consequences

- **Good**: a PDF reaches a library folder as `paper.pdf`, and a second, different `paper.pdf`
  lands beside it rather than refusing the route.
- **Good**: no core type and no wire shape changes. The annotation travels in the schema the
  description already answers.
- **Bad**: a name holding a file of the same size costs a read of that file in full, and that is
  mostly the file being the same one: every re-route and every retry of a delivery that landed.
  On WebDAV that is a download. A preview reads nothing, which is why it can be wrong.
- **Neutral**: the walk reads before it writes, so a file landing between the two costs an attempt,
  which is retried.
- **Neutral**: `arena` declares nothing new. A block per file is its own decision, in
  `docs/todo.md`.

---

## Pros and cons of the options

### Option 1: a fourth capability

- **Good**: its arguments are only the ones that mean something.
- **Good**: a template carries it as it carries any capability.
- **Bad**: the shell needs a way to reach it, since the typed line settles `create-or-append`.

### Option 2: an argument on `create-or-append`

- **Good**: the line stays as it is.
- **Bad**: `path` would name a note that is never written, and `heading`, `frontmatter`,
  `hashtags` and `trigger-tags` would apply to nothing. The create-or-append forecast would mean
  nothing either.

### Option 3: an empty rewrite

- **Bad**: still writes a note, which is the thing not wanted.

### a. The digested name

- **Good**: idempotent by construction, with no reads.
- **Bad**: a file in a library folder is read by its name, and `paper-3fa2c1d0.pdf` is not one.

### b. Refused where taken

- **Bad**: a folder of papers fills with `paper.pdf`s, and each later one would hand the decision
  back.

### c. Numbered where taken by different bytes

- **Good**: readable, never blocked, and a retry still finds its own copy.
- **Bad**: the reads above.

---

## More information

- Plan: [attachments-only](../plans/attachments-only.md).
- Spec: [core.md](../specs/core.md), [shell.md](../specs/shell.md).

Revisit if a delivery should carry some of a capture's attachments rather than all of them. That is
a selection held on the routing record, as a rewrite is, and core's to check.
