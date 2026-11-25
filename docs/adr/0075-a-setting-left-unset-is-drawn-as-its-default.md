# 75. A setting left unset is drawn as its default

**Date**: 2026-11-13
**Status**: Accepted. Supersedes the blank option of `shell.md`'s Settings, "named as what it comes
out as" (`default (none)`, 2026-09-16), and the destination form's `default (no)`.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A settings field the kind published values for is drawn as a row of options. Where nothing is
held, a blank option leads the row, labelled with what it comes out as: `default (none)`,
`default (raw)`. That is one more option than the field has values, and its label is a sentence
about the schema. With choices drawn as a segmented row
([ADR 71](0071-the-shell-is-drawn-for-a-phone-first-in-blocks-on-three-surfaces.md)), the extra
part takes width on a phone and reads as a value of its own.

How is an unset field drawn?

---

## Decision drivers

- **Fewer options, each a real value.**
- **What an untouched field sends must not change.** An unset setting is the kind's default, and
  a default that changes later must still reach a field nobody touched.
- **The form must say what will happen** without a sentence.

---

## Considered options

1. **Keep the blank option**, `default (x)`.
2. **Draw the default as picked**, read off the schema's `default`. The field stays unset until
   another value is chosen.
3. **Draw the default as picked, and mark it hollow** while it is unset, so an unset field and a
   chosen one look different.

---

## Decision outcome

Chosen: **Option 2**. The schema's `default` is drawn as the picked part of the row. Nothing is
sent for the field until someone picks another value.

### Consequences

- **Good**: the row holds only the field's values, and the picked one is what the field comes
  out as.
- **Bad**: once another value has been picked, picking the default again pins it rather than
  unsetting the field. If the kind's default later changes, a field that was pinned keeps the old
  one. That is the cost.
- **Neutral**: only what is drawn changes. What an untouched field sends does not.
- **Neutral**: the composer and the template form keep their own rule
  (2026-09-21): taking the option already taken gives it back, and absent is marked hollow. Those
  forms inherit from the destination, and a blank there means something different. If the
  difference reads badly once both are built, this record is revisited.

---

## Pros and cons of the options

### Option 1: the blank option

- **Good**: unset and chosen look different, and going back to unset is one tap.
- **Bad**: an option that isn't a value, worded in the schema's terms, and taking width on a phone.

### Option 2: the default as picked

- **Good**: what you see is what the field comes out as. One option per value.
- **Bad**: pinning, as above.

### Option 3: picked and hollow

- **Good**: it keeps unset visible without the extra option.
- **Bad**: a second state for a segmented part, which no reader would understand without a legend.

---

## More information

- Design: `settings.html` and `js/settings/forms.js` in [`docs/design/mobile/`](../design/mobile/).

Revisit if pinned defaults turn out to cause trouble, for example if a kind's default changes and
pinned destinations are left behind.
