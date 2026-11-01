# 67. A derived note name is a short slug, and is never appended to

**Date**: 2026-11-01
**Status**: Accepted — amends [ADR 31](0031-the-adapter-decides-create-or-append-at-delivery.md)
for a folder-only place
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A note routed to a folder alone is named from the item's first line. The old rule took the first 60
UTF-16 units and turned anything but a letter, a digit, a space, `.`, `_` or `-` into `-`. It
mangled any script that writes vowels as combining marks (`हिन्दी` became `ह-न-द-`), could leave half
an astral letter in the name, and made two encodings of `café` into two names. Under
`create-or-append`, a derived name that was already taken was appended to, so a capture could land
inside another capture's note with nothing said.

What is a derived note name, and what happens when it is taken?

---

## Decision drivers

- **The name is the first thing a person sees of a note** in the vault's file list, its tabs and
  every link to it.
- **The forecast and the delivery run the same code.** The shell draws the name before the decision
  is made, so the rule cannot depend on anything only the daemon has.
- **Every script is somebody's.** Transliterating or dropping letters decides that a language is
  wrong.
- **A filesystem counts bytes.** Most refuse a name over 255, and one grapheme can be dozens.
- **A delivery is retried** after an attempt whose answer was lost, and a retry must not leave a
  second note.

---

## Considered options

For the name:

1. **A slug, cut at a word near 40** — lower-case, a dash between words, apostrophes dropped.
2. **A slug, cut at a word within 60.**
3. **A title** — case and spaces kept, only what a filesystem or a link forbids dropped, within 60.
4. **A destination setting** choosing between a slug and a title.

For a taken derived name under `create-or-append`:

1. **Append, as before.**
2. **Take the first free sibling** (`-1`, `-2`, …), and recognise the delivery's own earlier write by
   its bytes.
3. **Take the first free sibling**, and recognise the earlier write by the item id in the note's
   frontmatter.

---

## Decision outcome

Chosen: **a slug cut at a word near 40**, and **the first free sibling, recognised by its bytes**.

The name is the item's first line, lower-cased, normalised to NFC, with quotation marks and
apostrophes dropped (`lena's` is one word) and every other run of anything but letters, marks and
digits made one `-`. It is cut at the last word boundary that fits in 40 graphemes and 160 UTF-8
bytes, found with `Intl.Segmenter`, so a script written without spaces is still cut between words.
A first word longer than that is cut at a grapheme. Where nothing survives, the item's id is the
name. The segmenter's locale is fixed, so the shell and the daemon cut alike.

Uploaded asset names keep their own rule and gain only the fixes: marks kept, NFC, and a cut on a
grapheme within 120 graphemes and 200 bytes.

Under `create-or-append` onto a folder, a derived name is never appended to. The adapter takes the
first of `name`, `name-1`, `name-2`, … that is free, passing over a folder of that name. It stops
early at a note holding exactly what this delivery writes as a new note, which can only be its own
earlier attempt, and lands there without writing again. A name the person typed still appends, as
ADR 31 says. `create` is unchanged: a taken name is refused.

### Consequences

- **Good** — every script survives whole, and the same words make the same name however they were
  encoded.
- **Good** — a capture never lands inside a note it did not choose. Two captures that begin alike
  make two notes.
- **Good** — the composer's forecast says `create` and the free name for a folder-only place,
  which is what will happen.
- **Bad** — a shorter, lower-cased stem makes two captures more likely to derive the same name.
  The free sibling makes that harmless, but a vault of `idea-…-1.md` reads worse than one of
  distinct names.
- **Bad** — a note edited between a lost write and its retry is no longer the same bytes, and the
  retry leaves a `-1` beside it. ADR 41 already accepts a duplicate after an unconfirmed attempt.
- **Bad** — a slug reads as a URL in Obsidian's file list and in every `[[link]]`.
- **Neutral** — a reservation made before this lands under the new name. An asset name with marks
  changes once.

---

## Pros and cons of the options

### A slug near 40

- **Good** — short in a file list and a link. The same on case-sensitive and case-insensitive
  filesystems.
- **Bad** — more collisions, which is why the free sibling came with it.

### A slug within 60

- **Good** — fewer collisions.
- **Bad** — a long line in the file list for what is usually a scrap.

### A title

- **Good** — Obsidian and Nextcloud Notes show the file name as the note's title.
- **Bad** — not the developer's convention for the vault. Case kept means `Pasta` and `pasta` are
  one file on a case-insensitive filesystem and two elsewhere.

### A destination setting

- **Bad** — two rules to keep in step with the forecast, for a preference nobody has asked for yet.

### Append, as before

- **Bad** — silently files one capture into another's note. The shorter cut makes it common.

### Recognised by the frontmatter's item id

- **Bad** — frontmatter is off by default, so most notes carry no id and the guard would not
  exist where it is needed.

---

## More information

Plan: [features from the mobile rethink](../plans/features-from-the-mobile-rethink.md), N1 and N2.

Revisit if a person wants titles in one vault and slugs in another (the setting), if `-1` siblings
pile up in practice, or if a forecast drawn in a browser disagrees with the daemon on where to cut a
script, which would mean the two engines' segmenters differ.
