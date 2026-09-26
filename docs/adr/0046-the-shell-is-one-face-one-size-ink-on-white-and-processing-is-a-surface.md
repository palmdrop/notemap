# 46. The shell is one face, one size, ink on white, and processing is a surface

**Date**: 2026-09-14
**Status**: Accepted — supersedes the visual direction in
[shell.md](../specs/shell.md#visual-direction) as settled on 2026-08-19, and the composer-as-modal
decision of 2026-08-24. First draft: revisable once drawn.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

The shell was drawn in August against a set of references and shipped in three passes. On
2026-09-11 it was used for a while and written up
([issues-2026-09-11.md](../design/issues-2026-09-11.md)). The findings are not about one
component. They are about the register itself: two faces that look bad together and a monospace
too stiff to read prose in; hierarchy that is unclear because it is carried by grey and by a
second type size rather than by structure; an off-white ground and muted ink where the references
were black on white; a composer that has grown rewrites, tags, statistics and a preview and no
longer fits a modal; and a shell that, for all its rules, still has clutter — `unrouted` on every
queue row, a `+` for tags, `NOTEMAP` in the corner, a theme toggle in another.

Set beside [the inspiration](../inspiration/), the drift is plain. Every reference is one face,
one weight or two, one size, black on white, with columns and a few rules doing all the work.
The shell had wandered toward warm paper and typographic contrast, which is a different design.

So: what does the shell's visual system consist of, and where does processing happen?

---

## Decision drivers

- **Simplicity and hierarchy** at once: fewer things on the page, and the ones that remain
  ranked by structure rather than by tint.
- **Speed.** Processing is most of what a person does here. The quick cases — discard, manual, a
  template by its tag — must not leave the list. The slow case — a destination, a place, a
  rewrite, a preview — must have room.
- **One layout**, 375px first, both columns.
- **Offline-friendly.** Nothing the shell needs to look right may live on a network the daemon is
  not on.
- **Tokens by role.** Whatever is decided has to reduce to one file of named values.

---

## Considered options

1. **Amend in place**: keep two faces and the warm ground, fix each finding as a component
   change.
2. **One face, one size, ink on white, red narrowed; composer becomes a surface with a quick
   tier on the row.**
3. **One face and monochrome throughout**, no red, everything by weight and inversion.
4. **Keep the modal**, redesigned with fixed head and foot and collapsible sections.

---

## Decision outcome

**Option 2.**

**Type.** One self-hosted grotesk, served by the daemon with the app. One size everywhere,
captured prose included. Hierarchy is weight, capitals or small-caps with tracking, and
position. The "browser's own faces" rule falls: it was written for offline-friendliness, and a
face served from the same origin as the app is exactly as offline as the app.

**Colour.** `#000` on `#fff`, and the inversion for dark. One red, for failure and for
destructive action — a refusal, a delivery retrying or abandoned, `discard`. Red leaves the
primary actions, the open row's edge and the links; those are ink, bold or inverted. Grey leaves
the palette. If an inert control cannot be said any other way, one grey is admitted for that
case and named as the exception.

**Grid.** Lists are open — rows align on columns with no rule between them. Rules mark a change
of region: under the bar, between the date column and the body, around the capture box, around a
selected row's action strip, between sections of the process surface and of settings, around a
routing record block.

**Processing has two tiers.** On the queue, a selected row's ruled strip carries every decision
that needs no destination argument: `process · manual · discard · tag`, templates reached through
`tag` because a template *is* a tag. Nobody leaves the list for these. The deep tier is a
surface, `/items/{id}/process`: the capture editable in place at a fixed head, ruled collapsible
sections in a scrolling middle, `route` in a fixed foot. Routing **advances to the next
unprocessed item**, which is what single-capture mode was going to be. The modal goes.

**Chrome.** The bar is `queue · feed · log · settings` and one status glyph. The wordmark, the
theme toggle and the order control leave it; the theme goes to settings and the order to the head
of each list. A collapsed queue row is stamp, tags and text — no state word, since the surface
already says it. *Amended 2026-09-14, once built and looked at*: the feed drops its routing words
too — `routed`, `manual`, `retrying` — since the line saying where an item went already says
them; `discarded` stays, no line saying it. And the page is 56rem rather than the drawings' 72:
at a desk the capture field and the bar read wider than anything under them. The process surface
alone keeps 72rem for its two columns. *Amended 2026-09-25*: every surface takes 72rem, and a
paragraph keeps its 38rem. The bar is in the same column as the page, so going to the process
surface widened the bar and moved the navigation under the reader's eye; the process surface at
56rem, tried the same day, was too narrow for its two columns. The width a paragraph is read at is
what the 56rem was protecting, and the paragraph's own cap already holds it.

**Records.** An item's page draws its routing records inline as ruled blocks, output rendered
rather than raw; the record route stays for linking. The log draws routing kinds with the same
block.

### Consequences

- Good: fewer rules to hold in the head. One face, one size, two colours and a red; two grid
  idioms and a sentence for when each applies.
- Good: the fast path is faster. Discard, manual and a template are one press each, on the row.
- Good: the slow path has room, and single-capture mode and batch selection have a place to be
  built without a third design.
- Bad: a font ships with the app. Small, but a thing the shell did not have to carry before.
- Bad: `shell.md` is 2000 lines written in the old direction, and its sections are rewritten one
  implementation slice at a time rather than all at once, so for a while the spec describes two
  shells. Each slice's PR carries the rewrite of the sections it touches; the shipped log stays.
- Bad: the old mockups in `docs/design/` are wrong from today and deleted only as each is
  replaced. `docs/design/brief.md` is what is current in the meantime, and the shots are of the
  app as it is, labelled as what is being moved away from.

---

## Pros and cons of the options

**Amend in place** — cheapest per finding, and it would never reach the finding that matters,
which is that the register is the wrong register. Every fix would be a component arguing with
the system around it.

**One face, one size, ink, red narrowed; surface + quick tier** — the references, applied. Costs
a webfont and a spec rewrite spread over months.

**Fully monochrome** — purer, and a failed delivery in the feed would be told apart from a
delivered one by a word alone. The references keep one red for a reason. Held open: if red proves
to be doing nothing once drawn, dropping it is one token.

**Keep the modal** — a modal with a fixed head and foot and a scrolling middle is a page drawn
inside a smaller page. It solves the scroll problem and none of the room problem, and single-
capture mode would still need a surface of its own.

---

## More information

- [The brief](../design/brief.md) — what the Claude Design project is told, and the current
  statement of the system until `shell.md` catches up.
- [issues-2026-09-11.md](../design/issues-2026-09-11.md) — the findings this answers.
- [The plan](../plans/shell-redesign.md) — the design phase and the slices after it.
