# 61. A conversion is a named argument a kind publishes

**Date**: 2026-10-14
**Status**: Accepted. Extends
[ADR 19](0019-a-destination-converts-and-the-delivery-records-what-went.md) and answers the
configuration question [ADR 45](0045-a-delivery-may-carry-its-own-content.md) left open, for
conversions that shape a fragment.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

ADR 19 settled that a destination converts a copy, ADR 33 that the output records what went, and
ADR 45 that a person's own words for one delivery ride beside the arguments. What none of them said
is how a delivery asks for a **shape**. For example: file this capture into `docs/todo.md`, under
`## Templates`, as `- [ ] …`.

The markdown kinds can already find the heading. They cannot write anything except a whole note
body with a tag foot under it. So how is a conversion named and configured? Who decides which ones
exist? And how far should the first one reach?

---

## Decision drivers

- **Core holds no formats** (ADR 19). Whatever names a conversion cannot be a list in core.
- **A capability says what a destination does, not how the result looks.** Capability names are
  what a destination advertises and what a rule will one day be written against
  ([ADR 31](0031-the-adapter-decides-create-or-append-at-delivery.md)). Multiplying them by shapes
  makes that list grow as a product.
- **Formats are named, not written** ([ADR 35](0035-a-templates-arguments-are-patterns-expanded-when-the-decision-is-made.md)).
  A pattern language is a second grammar, and drawing a pattern from the payload is something ADR
  35 refused outright.
- **The set has to grow.** Some generic shapes every markdown kind writes alike, some shapes only
  one kind can write, and one day a model folding a capture into a whole note.
- **A routing template saves a decision.** Whatever selects the shape has to be something a
  template can store and a trigger tag can fire, so "a todo for this file under this heading"
  becomes one tag.

---

## Considered options

1. **A capability per shape**: `append-task`, `append-list-item`, beside `append`.
2. **A setting on the destination**: a vault configured as "a todo list" converts everything
   filed to it.
3. **A pattern in the arguments**: `- [ ] {{content}}`, expanded by the kind.
4. **A named argument the kind publishes**: `conversion`, an enum in each note-writing
   capability's `argumentsSchema`, interpreted by the kind.

---

## Decision outcome

Chosen: **option 4**, limited to conversions that shape a **fragment**.

`create`, `append` and `create-or-append` on the markdown kinds each gain a `conversion` argument.
The kind publishes its values as the schema's `enum`, and that enum is the whole publication. No
port method lists conversions, and core learns none of their names. It validates the argument
against the schema as it validates any other argument, so a value the kind does not publish is
refused when the route is made. The composer already draws an enum as a row of options, and a
template stores the argument like any other.

The first vocabulary, shared by both markdown kinds through `output-markdown`:

| `conversion` | Writes |
| --- | --- |
| `block` | the note body as it is written today, with the tag foot below it. The default, so every record made before this existed reads unchanged |
| `list-item` | `- ` and the first line of the body; the rest of the body indented beneath it as the item's continuation |
| `task` | the same, as `- [ ] ` |

**The conversion shapes what the renderer produced, not the payload.** Renderers stay per payload
type and conversions stay per kind, so neither has to know about the other. A `task` of a picture
capture is the rendered picture, flattened into an item. Where hashtags are asked for, they go at
the end of the item's first line instead of below the body.

**A list item has no front matter.** A block at the top of a todo list, created there because the
list was not yet there, describes one entry of many. So `frontmatter` is offered only while
`conversion` is `block`, through the `x-notemap-when` condition the forms already honour. A form
hides the field, and anything it held is not sent. A record that carries it anyway, written through
`/v1` directly, is read as `none`: the kind ignores it rather than refusing a delivery over a
setting with nothing to apply to.

**An item has to stay one item, which changes how it is spliced in.** Today the splice joins blocks
with a blank line. Doing that after a tight list turns the whole list loose. When a `list-item` or
`task` lands next to a list, the splice follows that list: one newline if the list is tight, a blank
line if it is loose. That is the one change to placement this decision needs.

**A kind may publish conversions of its own**, by putting more values in its own enum. A generic
conversion lives in `output-markdown` because both markdown kinds write markdown, not because it is
a core concept.

**A conversion that rewrites the whole file is not part of this.** A fold, where a model merges a
capture into an existing note, makes conversion and placement into one step: it answers a file
rather than a fragment, and the splice has nothing to do. The `conversion` argument may name one
someday. What this decision does not do is shape the interface around it before the case is
designed.

**Provenance stays on the routing record.** A `task` line carries no item id. The record names the
destination, the arguments and the output, and that is enough to find what went.

### Option 1 multiplies capabilities by shapes

Three shapes across three note-writing capabilities would be nine capability names, and the tenth
shape would add three more. ADR 31 refused a flag on `create-file` because append's re-read,
splice and retry would fork on a boolean. A conversion forks none of that: the I/O, the failure
modes and the retry semantics are identical, and only the rendered text differs. So it is an
argument, the way `frontmatter` and `hashtags` are already arguments.

### Option 2 puts the shape on the place instead of the delivery

One vault takes notes and also holds a todo list. A destination-level shape would mean two
destinations rooted at the same folder, which is exactly the duplication ADR 20's pool-state
destinations exist to avoid. A per-destination **default** is still possible later, layered over
this decision.

### Option 3 is the grammar ADR 35 refused

`{{content}}` draws from the payload, and a template language is something to parse, validate,
escape and document forever, all to serve shapes that were going to be one of a handful of names.

### Consequences

- **Good**: "a todo under this heading" is one argument plus the existing `heading`, savable as a
  template and fired by a tag.
- **Good**: new conversions cost an enum value and a function. Core, the HTTP surface and the
  composer stay unchanged.
- **Good**: preview and delivery share the conversion because it runs inside the one rendering
  path both already take (ADR 33).
- **Bad**: flattening loses structure. A multi-paragraph capture becomes one item with a
  continuation, and how that reads depends on the reader's markdown. Accepted. This is a lossy
  conversion on ADR 33's terms, and the output shows it.
- **Bad**: a record naming a conversion that a later version of the kind no longer publishes is
  refused at delivery, as `rejected`. Removing a value from an enum breaks records, as removing a
  capability would.
- **Neutral**: the conversion names belong to the markdown kinds, and another kind is free to
  reuse them or not. Shared names are a convention, not a contract.

---

## Pros and cons of the options

### A capability per shape

- **Good**: each capability declares exactly its own arguments.
- **Bad**: the capability list grows as capabilities times shapes, and rules will be written
  against it.

### A setting on the destination

- **Good**: nothing to choose per delivery.
- **Bad**: one folder holding two shapes needs two destinations.

### A pattern in the arguments

- **Good**: any shape anyone can write down.
- **Bad**: a second grammar, which draws from the payload, which ADR 35 refused.

### A named argument the kind publishes

- **Good**: no new port, route or vocabulary in core. Discovery is the schema.
- **Bad**: the kind interprets the value, and core cannot check anything past membership of the
  enum.

---

## More information

Plan: [task-conversion.md](../plans/task-conversion.md). Revisit when:

- a fold (a whole-file conversion) is designed, since it may want its own interface rather than a
  value of this argument;
- a conversion needs parameters of its own (a marker character, a date suffix), at which point a
  bare enum is not enough;
- a kind other than the markdown ones wants a conversion, and the shared names start to matter as
  a contract.
