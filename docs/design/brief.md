# The shell, redrawn — design brief

**Date**: 2026-09-14, revised twice the same day; settled for the first version
**Drawings**: `docs/design/redrawn/` — `queue.html`, `process.html`, `tokens.css`, `shots/`
**Status**: First draft. Every decision below may be reversed once it has been drawn and looked at.
Drafts are drawn in light; dark is the inversion and is drawn last.
**Supersedes**: the visual direction in [shell.md](../specs/shell.md#visual-direction) and the
mockups beside this file, which are deleted as each is replaced.

This is the whole of what the Claude Design project is told. It is written so that a reader with
nothing else — not the spec, not the code — can draw the shell from it.

---

## What notemap is

Notemap captures anything worth keeping into one **pool**, and routes it out to wherever it
actually lives — an Obsidian vault, a Nextcloud folder, an are.na channel. It is a conveyor belt,
not an archive: items are supposed to leave. One person uses it, on a phone and at a desk, offline
as often as not. Privacy, self-hosting and local-first are the reasons it exists.

The shell is a static web app the daemon serves. SvelteKit, Svelte 5, Tailwind v4. No component
library.

## Words

Use these. Do not invent synonyms.

- **Item** — one thing in the pool. Never "note", "memo", "card", "entry".
- **Capture** — the original text or picture as it entered, and the act of entering it.
- **Queue** — the pool read as the unprocessed items, oldest first by default. It drains to zero.
- **Feed** — the pool read chronologically and completely. Nothing ever leaves it.
- **Process** — the one way out of the queue: route, mark manual, or discard.
- **Route** — deliver a copy of an item to a destination. Never "send", "export", "publish".
- **Manual** — processed by hand outside notemap; the person says where it went, or does not.
- **Discard** — processed by throwing away. Never "archive" — the shell still says that in
  places, and it is wrong.
- **Destination** — somewhere the pool can deliver to: a vault, a folder, a channel.
- **Routing record** — one delivery decision: which destination, which capability, which
  arguments, what state, what was written, where it landed.
- **Template** — a saved routing decision: destination, capability and arguments, applied by a
  **trigger tag** under `route/`. Tagging an item `route/research` files it.
- **Tag** — a plain word on an item. A trigger tag is a tag that fires a template.
- **Log** — the action log: everything the pool has done, newest first.
- **Reachable** — the daemon answers. The other state is ordinary, never an error.
- **Pending** — this device has work in its outbox the pool has not seen yet.

## Surfaces

Five, plus the item.

1. **Queue** `/` — the capture box, then the unprocessed items as a timeline.
2. **Feed** `/feed` — every item, with what became of it.
3. **Process** `/items/{id}/process` — one item being routed. New; replaces the modal composer.
4. **Log** `/log` — the action log, narrowed to one of five views.
5. **Settings** `/settings` — destinations, templates, account, server, appearance.
6. **Item** `/items/{id}` — one item, its capture and its routing records inline.
   `/items/{id}/records/{rid}` still resolves, drawing the same block with the capture above it.

Sign-in is a sixth, one field and one button, drawn in the same system.

### What a row carries

An item on the queue or the feed has: a capture time; zero or more tags, some of them trigger
tags; a state — unrouted, routed, manual, discarded, retrying; a routing summary naming where it
went; the capture text, which is CommonMark; zero or more attachments, drawn by media type; a
pending mark when this device still holds work about it; a revision link where it was made by
editing a processed item.

### What a routing record carries

Destination by name; capability in plain words (`created`, `appended`); the place inside the
destination (a path, a channel); state (`pending`, `delivered`, `failed`, `abandoned`); when the
decision was made; the output that was written, as bytes the shell can render; a note from the
destination about anything it could not carry; the arguments it was given, against a schema;
which template applied it, if one did; where the item's assets landed.

### What a log row carries

When; the kind of action, one of about fifteen (`captured`, `tagged`, `routed`, `delivered`,
`delivery-failed`, `discarded`, `marked-processed`, …); the item it is about, by its first words;
a detail object that differs by kind. Routing kinds carry a routing record and are drawn with the
record block.

### What settings holds

Destinations, each with a kind, settings against the kind's schema, and a live check (reached,
unreachable, unusable with a reason). Templates, each naming a destination, a capability,
arguments as patterns, a trigger tag, and whether it still fits its destination. Access tokens,
sign out. Server address, version, reachability, last answer. Theme. Sources the pool has seen,
demoted.

---

## Direction

**Printed and digital at once.** An index, a ledger, a book's running head — set on screen with
nothing that pretends to be paper. The references are a monospace diary rendered as one flat
list (*Still Here*), a museum programme's index with rules only where a region changes
(Städelschule), a score's table of contents with one red rule, a CV set in one weight. None of
them use size for hierarchy. None of them use grey.

### Colour

- Ground `#fff`. Ink `#000`. Nothing between them by default.
- **One red**, for failure and for destructive action only: a refused operation, a delivery that
  is retrying or abandoned, `discard`. Never for a primary action, never for a link, never for
  structure. Primary actions are ink — bold, or inverted (white on black).
- **Grey is not a colour the design has.** Secondary is regular weight; primary is bold or
  capitals. Where something is genuinely inert — a disabled control, an empty-field hint — and
  neither weight nor absence can say so, one grey may be brought in, case by case, and named in
  the tokens as the exception it is.
- Dark theme is the inversion: ink on `#000`, red stays red. Designed once, in light.

### Type

- **One face**: Bricolage Grotesque, weights 400 and 600, self-hosted and served by the daemon
  beside the app. Chosen from ten samples on the process surface (`Type.dc.html`, turn 5).
  Tabular figures in the stamp column and nowhere else — applied to a whole page they spread some
  faces' punctuation.
- **One size.** Literally. Captured prose, timestamps, labels, actions, the bar.
- Hierarchy is weight (regular / bold), capitals or small-caps with tracking for labels, and
  position. A label is caps; a value is regular; a primary action is bold.
- Captured text is CommonMark and renders as such: emphasis, lists, headings all at the one size,
  a heading being bold.

### Grid

Two idioms, and the rule for which is where:

- **Lists are open.** Queue, feed and log rows align on shared columns with no rule between rows.
  Whitespace separates entries, as in the references.
- **Rules mark a change of region.** A 1px ink rule under the bar; a vertical rule between the
  date column and the body, running the height of the list; a ruled box around the capture
  field; a ruled box around the selected row with the actions as its foot; rules between sections
  of the process surface and of settings; a ruled frame around a routing record block.
- Nothing is ever boxed on four sides except the capture field, a record block, a control, and
  the selected row.
- The measure is capped at a desk, and **a paragraph is capped at about seventy characters**
  (38rem) inside the body column: the column keeps its width, the prose stops early, as prose is
  set. A phone keeps both columns: the date stacks over the time in a narrow column, the rule,
  then the body.

### Motion

Few, structural, ~150–200ms, `prefers-reduced-motion` honoured: a row's selection box appearing;
a routed item leaving the queue; the process surface advancing to the next item; a notice
entering and leaving the corner. Nothing else moves.

---

## The surfaces, drawn

### Bar

`queue · feed · log · settings` as four equals at the left, the current one bold. At the right,
one status glyph: reachable, unreachable, pending work. No wordmark, no theme toggle, no order
control, no count. The order control (`oldest ▾` / `newest ▾`) moves into the head of each list
that has one.

### Queue

**The capture box** at the head: a ruled box, empty, no placeholder text, no `not captured`.
Along its bottom rule, `attach` and a bold `capture`. A dropped or chosen picture draws inside the
box above the text.

**A collapsed row** is a stamp, tags and text. Date and time in the left column; tags under them
as plain words, a trigger tag distinguished by style (small-caps, or underlined) and never by an
arrow or a template name; the capture in the body column. No state word — every row on the queue
is unrouted, so saying it says nothing. No `+`. No grey. The queue should read as a timeline of
what was written.

**A selected row** — one click or `enter` — is drawn as a box around both columns, the rail's
rule running through it, with the actions as the box's own foot: `process · manual · discard`
on the left, `process` bold, `discard` red; `edit · copy · open` on the right. Words only; no
marks for now. The rail's tags end in a `+` on the selected row, which opens the chooser in
place — and is also how a template is applied, since a template is a tag. No fill, no colour:
the box is the selection.

A double click, or `enter` on a selected row, goes to the process surface.

**Keyboard**: `j`/`k` walk rows, `enter` selects then opens, `d` discard, `m` manual, `+` tag,
`p` process, `esc` deselects. Draw the actions so a reader could guess these; do not print them.

**The index** is a second view of the same list, toggled in the head beside the order control:
one line per item — stamp, first words, tags at the right — for scanning rather than reading.
Where more than half a day passed between two captures the list opens a gap, one fixed size,
not proportional: time passing is read from the space, as in *Still Here*. The gap belongs to
the index for now; whether the timeline wants it too is a thing to look at once it is built.

**The drained queue** is one quiet line where the rows were.

### Process

A surface, not a modal. Three regions, in **two columns from 64rem up** — the capture on the
left, the decision on the right, a rule between — and **stacked below it**:

- **Head, fixed**: the capture, read-only until `edit` at its right, a double click, or `e`
  opens it — then a ruled box with the caret in it, `keep the capture's` to put the words back
  and `done` to close. The words are this delivery's alone; the item is untouched. A picture
  capture draws the picture; long text scrolls within the head, not the page.
- **Middle, scrolls**: ruled sections, each a label column and a content column, collapsible,
  drawn collapsed until needed. **Destination** — one field that narrows three ruled bands as it
  is typed: templates, destinations, and `manual` / `discard` under *otherwise*. **Place** — the
  path or channel inside the destination, as the typed line with the tree beneath it. **Tags**.
  **Preview** — asked for as soon as a destination and a place are settled, drawn as the head of
  the file notemap would write, five lines in a ruled block with `more`; one request per change
  of destination or place. The word is *preview*; nothing says who writes.
- **Foot, fixed**: bold `route`, and `next` / `previous` to walk the queue without routing.

Routing advances to the next unprocessed item. That is single-capture mode; it is not a separate
feature. `esc` returns to the queue with the item still selected.

Gone: `where`; `used before` as a long list (a count and the last beside the destination's
name); `words` as a separate row; `would write` and `what X would write` as labels; `rewrite` as
a button reading like content; a preview that scrolls the whole surface.

### Feed

The queue's row, plus what became of it: a state word in the left column under the tags —
`routed`, `manual`, `discarded`, `retrying` in red — and a routing line naming the destinations.
The selected row's foot offers `process` again, `undo` on a decision made by hand, and the same
marks. The order control and the index toggle in the head.

### Item

The capture, then each routing record as a **record block**: a ruled frame; in the head, the
destination in bold and the place beside it, reading like a file's path; the state and when;
then the output rendered as the destination would show it — a markdown file as prose, a picture
as a picture — with `raw` and `arguments` behind a press; a line naming where each asset landed.
No `where it landed`, no `what was sent`, no `its tags did not go`, no `the decision` in the
open. The item is reached from a record by a button, not by its text.

### Log

A head with the five views as a ruled tab row — `everything · routing · captures ·
classification · pool` — remembering the last one chosen. Rows on the open grid: when, the
**kind** in its own column in caps, the item's first words. A routing kind draws the record block
beneath. No lede, no source, no ids, no `firedByTag`; `pointer` reads as `place`. The per-item
filter is reached from the item, named `history` rather than `only this`.

### Settings

A side menu — `Destinations · Templates · Account · Server · Appearance` — and one section on
the right, ruled between rows. `Account` is sign out and access tokens. `Server` is the address,
version, reachability with its last answer, the way to the API reference, and the sources the
pool has seen, folded. `Appearance` is the theme. No lede sentence. `pool` is not said to the
person; `daemon` is `server`.

Destination and template forms are the same rows, opened in place, fields against their schema,
an enum as a row of options.

### Corner

Notices bottom-left as today: a confirmation in ink on white with a rule, a failure in red,
each leading to where the whole of it can be read.

---

## What the shell already does that the drawing must not lose

- Works at 375px wide, both columns. One layout per surface that reflows rather than a phone
  design and a desk design; the process surface is the one whose regions rearrange by width.
- Legible offline: the bar's glyph says unreachable, a row says `pending`, and nothing dresses
  the ordinary condition as a failure.
- The queue is one scrollable, paginated list. There is no count of it.
- A refusal goes to the corner and nowhere else.
- Every colour, face, size and spacing step is a named role in one tokens file; no component
  names a value.

## Open, on purpose

Batch selection on the queue; the full keyboard map; the exact mark on a trigger tag; whether
webdav accounts leave `config.toml`; which markdown renderer. Each is drawn or raised when the
work reaches it.
